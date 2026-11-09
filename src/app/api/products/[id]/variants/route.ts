import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema, productVariantSchema } from "@/lib/validation";
type RouteContext = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request); const context = await requirePermission("catalog.product.edit"); const productId = idSchema.parse((await params).id); const input = productVariantSchema.parse(await request.json());
    const canChangePrice = context.permissions.includes("catalog.price.change") || context.permissions.includes("catalog.product.create") || context.permissions.includes("catalog.product.edit");
    if (!canChangePrice) throw new ApiError(403, "PRICE_CHANGE_FORBIDDEN", "Catalog management permission is required to create a sellable variant.");
    if (Number(input.purchasePrice) > 0 && !context.permissions.includes("catalog.cost.view")) throw new ApiError(403, "COST_ACCESS_REQUIRED", "Cost access is required to set a variant purchase price.");
    const product = await prisma.product.findFirst({ where: { id: productId, companyId: context.company.id, status: "ACTIVE" }, select: { id: true, sku: true } }); if (!product) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Active product was not found.");
    const row = await prisma.$transaction(async (tx) => {
      const barcodes = input.barcodes.map((barcode, index) => ({ ...barcode, isPrimary: input.barcodes.some((item) => item.isPrimary) ? barcode.isPrimary : index === 0 }));
      const created = await tx.productVariant.create({ data: { companyId: context.company.id, productId, sku: input.sku, name: input.name, color: input.color || null, ramGb: input.ramGb, storageGb: input.storageGb, networkType: input.networkType || null, simConfiguration: input.simConfiguration || null, regionVariant: input.regionVariant || null, purchasePrice: input.purchasePrice, wholesalePrice: input.wholesalePrice, retailPrice: input.retailPrice, minimumSellingPrice: input.minimumSellingPrice, isActive: input.isActive, barcodes: { create: barcodes.map((barcode) => ({ companyId: context.company.id, productId, barcode: barcode.barcode, type: barcode.type, isPrimary: barcode.isPrimary })) } }, include: { barcodes: true } });
      await appendAudit({ companyId: context.company.id, actorId: context.user.id, branchId: context.activeBranchId, action: "PRODUCT_VARIANT_CREATED", module: "catalog", entityType: "ProductVariant", entityId: created.id, entityReference: created.sku, newValues: input, metadata: { productId, productSku: product.sku } }, tx); return created;
    });
    return NextResponse.json(jsonSafe({ data: row }), { status: 201 });
  } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(new ApiError(409, "DUPLICATE_VARIANT_IDENTIFIER", "Variant SKU or barcode already exists in this company.")); return apiError(error); }
}
