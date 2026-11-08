import { NextResponse } from "next/server";
import { PolicyDocumentType } from "@prisma/client";
import { z } from "zod";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

const money = z.string().regex(/^\d{1,15}(?:\.\d{1,4})?$/, "Use a non-negative amount with at most four places.");

const policySchema = z.object({
  documentType: z.nativeEnum(PolicyDocumentType),
  name: z.string().trim().min(3).max(120),
  minAmount: money.default("0"),
  maxAmount: money.nullable().optional(),
  requiredPermission: z.string().trim().min(3).max(80),
  isActive: z.boolean().default(true),
  notes: z.string().trim().max(2000).optional().nullable(),
}).superRefine((value, context) => {
  if (value.maxAmount && Number(value.maxAmount) < Number(value.minAmount)) {
    context.addIssue({ code: "custom", path: ["maxAmount"], message: "The upper bound cannot be below the lower bound." });
  }
  if (!PERMISSIONS.some((permission) => permission.key === value.requiredPermission)) {
    context.addIssue({ code: "custom", path: ["requiredPermission"], message: "Select a permission from the catalog." });
  }
});

const discountSchema = z.object({
  maxPercent: z.number().min(0).max(100),
  overridePermission: z.string().trim().min(3).max(80).default("sales.discount.override"),
});

export async function GET(request: Request) {
  try {
    const context = await requirePermission("policy.manage");
    const wantsCatalog = new URL(request.url).searchParams.get("catalog") === "true";
    const [policies, setting] = await Promise.all([
      prisma.approvalPolicy.findMany({ where: { companyId: context.company.id }, orderBy: [{ documentType: "asc" }, { minAmount: "asc" }] }),
      prisma.systemSetting.findUnique({ where: { companyId_key: { companyId: context.company.id, key: "sales.discount.policy" } }, select: { value: true } }),
    ]);
    return NextResponse.json(jsonSafe({
      data: {
        policies,
        discountPolicy: setting?.value ?? { maxPercent: 100, overridePermission: "sales.discount.override" },
        ...(wantsCatalog
          ? { catalog: PERMISSIONS.filter((permission) => permission.sensitive).map((permission) => ({ key: permission.key, module: permission.module, action: permission.action, description: permission.description })) }
          : {}),
      },
    }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("policy.manage");
    const input = policySchema.parse(await request.json());
    const created = await prisma.$transaction(async (tx) => {
      const overlap = await tx.approvalPolicy.findFirst({
        where: { companyId: context.company.id, documentType: input.documentType, name: input.name },
        select: { id: true },
      });
      if (overlap) throw new ApiError(409, "POLICY_NAME_TAKEN", "An approval policy with this name already exists for the document type.");
      const row = await tx.approvalPolicy.create({
        data: {
          companyId: context.company.id,
          documentType: input.documentType,
          name: input.name,
          minAmount: input.minAmount,
          maxAmount: input.maxAmount || null,
          requiredPermission: input.requiredPermission,
          isActive: input.isActive,
          notes: input.notes || null,
        },
      });
      await appendAudit({
        companyId: context.company.id,
        actorId: context.user.id,
        action: "APPROVAL_POLICY_CREATED",
        module: "policy",
        entityType: "ApprovalPolicy",
        entityId: row.id,
        entityReference: `${row.documentType}/${row.name}`,
        newValues: { minAmount: row.minAmount.toFixed(4), maxAmount: row.maxAmount?.toFixed(4) ?? null, requiredPermission: row.requiredPermission },
      }, tx);
      return row;
    });
    return NextResponse.json(jsonSafe({ data: created }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("policy.manage");
    const input = discountSchema.parse(await request.json());
    if (!PERMISSIONS.some((permission) => permission.key === input.overridePermission)) {
      throw new ApiError(422, "UNKNOWN_PERMISSION", "Select an override permission from the catalog.");
    }
    const saved = await prisma.$transaction(async (tx) => {
      const row = await tx.systemSetting.upsert({
        where: { companyId_key: { companyId: context.company.id, key: "sales.discount.policy" } },
        create: { companyId: context.company.id, key: "sales.discount.policy", value: input, updatedById: context.user.id },
        update: { value: input, updatedById: context.user.id },
      });
      await appendAudit({
        companyId: context.company.id,
        actorId: context.user.id,
        action: "DISCOUNT_POLICY_UPDATED",
        module: "policy",
        entityType: "SystemSetting",
        entityId: row.id,
        entityReference: "sales.discount.policy",
        newValues: input,
      }, tx);
      return row;
    });
    return NextResponse.json(jsonSafe({ data: saved.value }));
  } catch (error) {
    return apiError(error);
  }
}
