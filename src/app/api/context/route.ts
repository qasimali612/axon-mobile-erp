import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  branchId: z.string().uuid().nullable(),
  warehouseId: z.string().uuid().nullable(),
});

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requireAuth();
    const input = schema.parse(await request.json());

    const branch = input.branchId
      ? await prisma.branch.findFirst({ where: { id: input.branchId, companyId: context.company.id, isActive: true } })
      : null;
    if (input.branchId && !branch) throw new ApiError(404, "BRANCH_NOT_FOUND", "Branch is not available.");

    const warehouse = input.warehouseId
      ? await prisma.warehouse.findFirst({ where: { id: input.warehouseId, companyId: context.company.id, isActive: true } })
      : null;
    if (input.warehouseId && !warehouse) throw new ApiError(404, "WAREHOUSE_NOT_FOUND", "Warehouse is not available.");
    if (warehouse && branch && warehouse.branchId !== branch.id) {
      throw new ApiError(422, "SCOPE_MISMATCH", "Warehouse does not belong to the selected branch.");
    }

    const hasCompanyWideRole = context.roles.some((role) => !role.branchId && !role.warehouseId);
    const hasScopedRole = context.roles.some((role) => {
      if (role.warehouseId) return role.warehouseId === input.warehouseId;
      if (role.branchId) return role.branchId === input.branchId;
      return false;
    });
    if (!hasCompanyWideRole && !hasScopedRole) {
      throw new ApiError(403, "SCOPE_FORBIDDEN", "Your role is not assigned to this location.");
    }

    await prisma.session.update({
      where: { id: context.sessionId },
      data: { activeBranchId: branch?.id ?? null, activeWarehouseId: warehouse?.id ?? null },
    });
    await appendAudit({
      companyId: context.company.id,
      actorId: context.user.id,
      branchId: branch?.id,
      warehouseId: warehouse?.id,
      action: "CONTEXT_CHANGED",
      module: "access",
      entityType: "Session",
      entityId: context.sessionId,
      newValues: { branchId: branch?.id ?? null, warehouseId: warehouse?.id ?? null },
    });

    return NextResponse.json({ data: { branch, warehouse } });
  } catch (error) {
    return apiError(error);
  }
}
