import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema, productVariantSchema } from "@/lib/validation";
type RouteContext = { params: Promise<{ id: string; variantId: string }> };
export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request); const context = await requirePermission("catalog.product.edit"); const route = await params; const productId = idSchema.parse(route.id); const variantId = idSchema.parse(route.variantId); const input = productVariantSchema.parse(await request.json());
    const existing = await prisma.productVariant.findFirst({ where: { id: variantId, productId, companyId: context.company.id, product: { status: "ACTIVE" } }, include: { barcodes: true } }); if (!existing) throw new ApiError(404, "VARIANT_NOT_FOUND", "Active product variant was not found.");
    const costChanged = !existing.purchasePrice.eq(input.purchasePrice); const priceChanged = !existing.wholesalePrice.eq(input.wholesalePrice) || !existing.retailPrice.eq(input.retailPrice) || !existing.minimumSellingPrice.eq(input.minimumSellingPrice);
    if (costChanged && !context.permissions.includes("catalog.cost.view")) throw new ApiError(403, "COST_CHANGE_FORBIDDEN", "Cost-price access is required.");
    if (priceChanged && !context.permissions.includes("catalog.price.change")) throw new ApiError(403, "PRICE_CHANGE_FORBIDDEN", "Price-change permission is required.");
    const row = await prisma.$transaction(async (tx) => {
      if (!input.isActive && existing.isActive) {
        const [activeVariants, balances, units, reservations] = await Promise.all([
          tx.productVariant.count({ where: { productId, isActive: true } }),
          tx.stockBalance.count({ where: { variantId, quantity: { not: 0 } } }),
          tx.physicalStockUnit.count({ where: { variantId, status: { in: ["IN_STOCK", "RESERVED", "IN_TRANSIT", "QUARANTINED"] } } }),
          tx.inventoryReservation.count({ where: { variantId, releasedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
        ]);
        if (activeVariants <= 1) throw new ApiError(409, "LAST_ACTIVE_VARIANT", "A product must retain at least one active variant.");
        if (balances || units || reservations) throw new ApiError(409, "VARIANT_HAS_STOCK", "A variant with stock or active reservations cannot be deactivated.");
      }
      const barcodes = input.barcodes.map((barcode, index) => ({ ...barcode, isPrimary: input.barcodes.some((item) => item.isPrimary) ? barcode.isPrimary : index === 0 }));
      await tx.productBarcode.deleteMany({ where: { variantId } });
      const updated = await tx.productVariant.update({ where: { id: variantId }, data: { sku: input.sku, name: input.name, color: input.color || null, ramGb: input.ramGb, storageGb: input.storageGb, networkType: input.networkType || null, simConfiguration: input.simConfiguration || null, regionVariant: input.regionVariant || null, purchasePrice: input.purchasePrice, wholesalePrice: input.wholesalePrice, retailPrice: input.retailPrice, minimumSellingPrice: input.minimumSellingPrice, isActive: input.isActive, barcodes: { create: barcodes.map((barcode) => ({ companyId: context.company.id, productId, barcode: barcode.barcode, type: barcode.type, isPrimary: barcode.isPrimary })) } }, include: { barcodes: true } });
      await appendAudit({ companyId: context.company.id, actorId: context.user.id, branchId: context.activeBranchId, action: "PRODUCT_VARIANT_UPDATED", module: "catalog", entityType: "ProductVariant", entityId: variantId, entityReference: updated.sku, previousValues: { sku: existing.sku, name: existing.name, isActive: existing.isActive, purchasePrice: existing.purchasePrice.toFixed(4), retailPrice: existing.retailPrice.toFixed(4), barcodes: existing.barcodes.map((item) => item.barcode) }, newValues: input, metadata: { productId } }, tx); return updated;
    });
    return NextResponse.json(jsonSafe({ data: row }));
  } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(new ApiError(409, "DUPLICATE_VARIANT_IDENTIFIER", "Variant SKU or barcode already exists in this company.")); return apiError(error); }
}
