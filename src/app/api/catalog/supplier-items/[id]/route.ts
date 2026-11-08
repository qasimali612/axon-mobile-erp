import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { supplierItemUpdateSchema } from "@/lib/catalog/supplier-item-validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("catalog.product.edit");
    const { id } = await params;
    const input = supplierItemUpdateSchema.parse(await request.json());
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.supplierItem.findFirst({ where: { id, companyId: context.company.id }, include: { supplier: { select: { code: true } } } });
      if (!existing) throw new ApiError(404, "SUPPLIER_ITEM_NOT_FOUND", "The supplier item was not found.");
      if (input.supplierSku && input.supplierSku !== existing.supplierSku) {
        const clash = await tx.supplierItem.findFirst({
          where: { companyId: context.company.id, supplierId: existing.supplierId, supplierSku: input.supplierSku, NOT: { id } },
          select: { id: true },
        });
        if (clash) throw new ApiError(409, "SUPPLIER_SKU_TAKEN", "This supplier already has an item code with that value.");
      }
      const row = await tx.supplierItem.update({
        where: { id },
        data: {
          ...(input.supplierSku !== undefined ? { supplierSku: input.supplierSku } : {}),
          ...(input.description !== undefined ? { description: input.description || null } : {}),
          ...(input.variantId !== undefined ? { variantId: input.variantId || null } : {}),
          ...(input.lastCost !== undefined ? { lastCost: input.lastCost } : {}),
          ...(input.leadTimeDays !== undefined ? { leadTimeDays: input.leadTimeDays } : {}),
          ...(input.minOrderQty !== undefined ? { minOrderQty: input.minOrderQty } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await appendAudit({
        companyId: context.company.id,
        actorId: context.user.id,
        branchId: context.activeBranchId,
        action: "SUPPLIER_ITEM_UPDATED",
        module: "catalog",
        entityType: "SupplierItem",
        entityId: row.id,
        entityReference: `${existing.supplier.code}/${row.supplierSku}`,
        previousValues: { supplierSku: existing.supplierSku, lastCost: existing.lastCost.toFixed(4), isActive: existing.isActive },
        newValues: { supplierSku: row.supplierSku, lastCost: row.lastCost.toFixed(4), isActive: row.isActive },
      }, tx);
      return row;
    });
    return NextResponse.json(jsonSafe({ data: updated }));
  } catch (error) {
    return apiError(error);
  }
}
