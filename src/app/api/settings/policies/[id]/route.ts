import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

const money = z.string().regex(/^\d{1,15}(?:\.\d{1,4})?$/, "Use a non-negative amount with at most four places.");
const updateSchema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  minAmount: money.optional(),
  maxAmount: money.nullable().optional(),
  requiredPermission: z.string().trim().min(3).max(80).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("policy.manage");
    const { id } = await params;
    const input = updateSchema.parse(await request.json());
    if (input.requiredPermission && !PERMISSIONS.some((permission) => permission.key === input.requiredPermission)) {
      throw new ApiError(422, "UNKNOWN_PERMISSION", "Select a permission from the catalog.");
    }
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.approvalPolicy.findFirst({ where: { id, companyId: context.company.id } });
      if (!existing) throw new ApiError(404, "POLICY_NOT_FOUND", "The approval policy was not found.");
      const nextMin = input.minAmount ?? existing.minAmount.toFixed(4);
      const nextMax = input.maxAmount === undefined ? existing.maxAmount?.toFixed(4) ?? null : input.maxAmount;
      if (nextMax && Number(nextMax) < Number(nextMin)) throw new ApiError(422, "INVALID_RANGE", "The upper bound cannot be below the lower bound.");
      const row = await tx.approvalPolicy.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.minAmount !== undefined ? { minAmount: input.minAmount } : {}),
          ...(input.maxAmount !== undefined ? { maxAmount: input.maxAmount || null } : {}),
          ...(input.requiredPermission !== undefined ? { requiredPermission: input.requiredPermission } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
      });
      await appendAudit({
        companyId: context.company.id,
        actorId: context.user.id,
        action: "APPROVAL_POLICY_UPDATED",
        module: "policy",
        entityType: "ApprovalPolicy",
        entityId: row.id,
        entityReference: `${row.documentType}/${row.name}`,
        previousValues: { minAmount: existing.minAmount.toFixed(4), maxAmount: existing.maxAmount?.toFixed(4) ?? null, requiredPermission: existing.requiredPermission, isActive: existing.isActive },
        newValues: { minAmount: row.minAmount.toFixed(4), maxAmount: row.maxAmount?.toFixed(4) ?? null, requiredPermission: row.requiredPermission, isActive: row.isActive },
      }, tx);
      return row;
    });
    return NextResponse.json(jsonSafe({ data: updated }));
  } catch (error) {
    return apiError(error);
  }
}
