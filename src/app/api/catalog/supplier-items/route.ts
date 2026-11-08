import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { supplierItemSchema } from "@/lib/catalog/supplier-item-validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

/**
 * Supplier-specific item codes and quoted costs. Reads reuse the catalog product view grant; writes
 * reuse the catalog product edit grant so no new permission surface is introduced.
 */
export async function GET(request: Request) {
  try {
    const context = await requirePermission("catalog.product.view");
    const params = new URL(request.url).searchParams;
    const supplierId = params.get("supplierId") || undefined;
    const productId = params.get("productId") || undefined;
    const search = params.get("search")?.trim();
    const data = await prisma.supplierItem.findMany({
      where: {
        companyId: context.company.id,
        ...(supplierId ? { supplierId } : {}),
        ...(productId ? { productId } : {}),
        ...(search
          ? {
              OR: [
                { supplierSku: { contains: search, mode: "insensitive" as const } },
                { product: { name: { contains: search, mode: "insensitive" as const } } },
                { supplier: { name: { contains: search, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      },
      include: {
        supplier: { select: { id: true, code: true, name: true, status: true } },
        product: { select: { id: true, sku: true, name: true, trackingMethod: true, status: true } },
        variant: { select: { id: true, sku: true, name: true } },
      },
      orderBy: [{ supplier: { name: "asc" } }, { supplierSku: "asc" }],
      take: 500,
    });
    return NextResponse.json(jsonSafe({ data }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("catalog.product.edit");
    const input = supplierItemSchema.parse(await request.json());
    const created = await prisma.$transaction(async (tx) => {
      const [supplier, product] = await Promise.all([
        tx.supplier.findFirst({ where: { id: input.supplierId, companyId: context.company.id }, select: { id: true, name: true, status: true } }),
        tx.product.findFirst({ where: { id: input.productId, companyId: context.company.id }, select: { id: true, name: true } }),
      ]);
      if (!supplier) throw new ApiError(422, "INVALID_SUPPLIER", "Select a supplier in this company.");
      if (supplier.status !== "ACTIVE") throw new ApiError(422, "SUPPLIER_INACTIVE", "Inactive suppliers cannot receive new item codes.");
      if (!product) throw new ApiError(422, "INVALID_PRODUCT", "Select a product in this company.");
      if (input.variantId) {
        const variant = await tx.productVariant.findFirst({ where: { id: input.variantId, companyId: context.company.id, productId: input.productId }, select: { id: true } });
        if (!variant) throw new ApiError(422, "INVALID_VARIANT", "The variant must belong to the selected product.");
      }
      const duplicate = await tx.supplierItem.findFirst({
        where: { companyId: context.company.id, supplierId: input.supplierId, supplierSku: input.supplierSku },
        select: { id: true },
      });
      if (duplicate) throw new ApiError(409, "SUPPLIER_SKU_TAKEN", "This supplier already has an item code with that value.");
      const row = await tx.supplierItem.create({
        data: {
          companyId: context.company.id,
          supplierId: input.supplierId,
          productId: input.productId,
          variantId: input.variantId || null,
          supplierSku: input.supplierSku,
          description: input.description || null,
          lastCost: input.lastCost,
          leadTimeDays: input.leadTimeDays,
          minOrderQty: input.minOrderQty,
          isActive: input.isActive,
        },
        include: { supplier: { select: { code: true, name: true } }, product: { select: { sku: true, name: true } } },
      });
      await appendAudit({
        companyId: context.company.id,
        actorId: context.user.id,
        branchId: context.activeBranchId,
        action: "SUPPLIER_ITEM_CREATED",
        module: "catalog",
        entityType: "SupplierItem",
        entityId: row.id,
        entityReference: `${row.supplier.code}/${row.supplierSku}`,
        newValues: { supplierSku: row.supplierSku, lastCost: row.lastCost.toFixed(4), leadTimeDays: row.leadTimeDays, minOrderQty: row.minOrderQty.toFixed(4) },
      }, tx);
      return row;
    });
    return NextResponse.json(jsonSafe({ data: created }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
