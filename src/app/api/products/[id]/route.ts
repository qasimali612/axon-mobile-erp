import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema, productSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const context = await requirePermission("catalog.product.view");
    const id = idSchema.parse((await params).id);
    const product = await prisma.product.findFirst({
      where: { id, companyId: context.company.id },
      include: { brand: true, category: true, unit: true, variants: true, barcodes: true },
    });
    if (!product) throw new ApiError(404, "NOT_FOUND", "Product not found.");
    return NextResponse.json(jsonSafe({ data: product }));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("catalog.product.edit");
    const id = idSchema.parse((await params).id);
    const input = productSchema.parse(await request.json());
    const existing = await prisma.product.findFirst({
      where: { id, companyId: context.company.id, status: { not: "ARCHIVED" } },
      include: {
        variants: { orderBy: { createdAt: "asc" } },
        barcodes: true,
        _count: {
          select: {
            physicalStockUnits: true,
            inventoryLots: true,
            stockBalances: true,
            inventoryMovements: true,
            inventoryReservations: true,
            purchaseOrderLines: true,
            purchaseReceiptLines: true,
            salesInvoiceLines: true,
            stockReturnLines: true,
            stockTransferLines: true,
            stockAdjustmentLines: true,
            stockCountLines: true,
          },
        },
      },
    });
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Active product not found.");

    const refs = await Promise.all([
      prisma.productCategory.findFirst({ where: { id: input.categoryId, companyId: context.company.id, isActive: true } }),
      input.brandId ? prisma.brand.findFirst({ where: { id: input.brandId, companyId: context.company.id, isActive: true } }) : Promise.resolve(true),
      prisma.unitOfMeasure.findFirst({ where: { id: input.unitId, companyId: context.company.id, isActive: true } }),
    ]);
    if (refs.some((reference) => !reference)) throw new ApiError(422, "INVALID_REFERENCE", "A selected catalog reference is invalid.");

    const inventoryPolicyChanged =
      existing.productType !== input.productType ||
      existing.trackingMethod !== input.trackingMethod ||
      existing.costingMethod !== input.costingMethod ||
      existing.unitId !== input.unitId;
    const hasOperationalHistory = Object.values(existing._count).some((count) => count > 0);
    if (inventoryPolicyChanged && hasOperationalHistory) {
      throw new ApiError(
        409,
        "PRODUCT_POLICY_HAS_HISTORY",
        "Product type, tracking, costing, and base unit cannot change after the product has inventory or document history. Archive it and create a new product instead.",
      );
    }

    const variant = existing.variants[0];
    if (!variant) throw new ApiError(409, "VARIANT_REQUIRED", "Product has no editable primary variant.");

    const costChanged =
      existing.standardPurchasePrice.toString() !== input.standardPurchasePrice ||
      variant.purchasePrice.toString() !== input.variant.purchasePrice;
    const salesPriceChanged =
      variant.wholesalePrice.toString() !== input.variant.wholesalePrice ||
      variant.retailPrice.toString() !== input.variant.retailPrice ||
      variant.minimumSellingPrice.toString() !== input.variant.minimumSellingPrice;
    if (costChanged && !context.permissions.includes("catalog.cost.view")) {
      throw new ApiError(403, "COST_CHANGE_FORBIDDEN", "Cost-price access is required to change acquisition costs.");
    }
    if (salesPriceChanged && !context.permissions.includes("catalog.price.change")) {
      throw new ApiError(403, "PRICE_CHANGE_FORBIDDEN", "Price-change permission is required.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          categoryId: input.categoryId,
          brandId: input.brandId || null,
          unitId: input.unitId,
          sku: input.sku,
          name: input.name,
          model: input.model || null,
          modelCode: input.modelCode || null,
          productType: input.productType,
          trackingMethod: input.trackingMethod,
          costingMethod: input.costingMethod,
          standardPurchasePrice: input.standardPurchasePrice,
          reorderLevel: input.reorderLevel,
          maxStockLevel: input.maxStockLevel ?? "0",
          preferredSupplierId: input.preferredSupplierId || null,
          description: input.description || null,
        },
      });
      await tx.productVariant.update({
        where: { id: variant.id },
        data: {
          sku: input.variant.sku,
          name: input.variant.name,
          color: input.variant.color || null,
          ramGb: input.variant.ramGb || null,
          storageGb: input.variant.storageGb || null,
          networkType: input.variant.networkType || null,
          simConfiguration: input.variant.simConfiguration || null,
          regionVariant: input.variant.regionVariant || null,
          purchasePrice: input.variant.purchasePrice,
          wholesalePrice: input.variant.wholesalePrice,
          retailPrice: input.variant.retailPrice,
          minimumSellingPrice: input.variant.minimumSellingPrice,
        },
      });

      const existingPrimary = existing.barcodes.find((barcode) => barcode.variantId === variant.id && barcode.isPrimary);
      if (input.variant.barcode) {
        if (existingPrimary) {
          await tx.productBarcode.update({ where: { id: existingPrimary.id }, data: { barcode: input.variant.barcode } });
        } else {
          await tx.productBarcode.create({
            data: {
              companyId: context.company.id,
              productId: id,
              variantId: variant.id,
              barcode: input.variant.barcode,
              isPrimary: true,
            },
          });
        }
      } else if (existingPrimary) {
        await tx.productBarcode.delete({ where: { id: existingPrimary.id } });
      }

      await appendAudit(
        {
          companyId: context.company.id,
          actorId: context.user.id,
          branchId: context.activeBranchId,
          warehouseId: context.activeWarehouseId,
          action: "PRODUCT_UPDATED",
          module: "catalog",
          entityType: "Product",
          entityId: id,
          entityReference: input.sku,
          previousValues: {
            sku: existing.sku,
            name: existing.name,
            trackingMethod: existing.trackingMethod,
            variant: { sku: variant.sku, retailPrice: variant.retailPrice.toString() },
          },
          newValues: input,
        },
        tx,
      );

      return tx.product.findUniqueOrThrow({
        where: { id },
        include: { brand: true, category: true, unit: true, variants: true, barcodes: true },
      });
    });

    return NextResponse.json(jsonSafe({ data: updated }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(new ApiError(409, "DUPLICATE_IDENTIFIER", "SKU or barcode already exists in this company."));
    }
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("catalog.product.archive");
    const id = idSchema.parse((await params).id);
    const input = z.object({ reason: z.string().trim().min(5).max(500) }).parse(await request.json());
    const existing = await prisma.product.findFirst({ where: { id, companyId: context.company.id } });
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Product not found.");
    if (existing.status === "ARCHIVED") throw new ApiError(409, "ALREADY_ARCHIVED", "Product is already archived.");

    await prisma.$transaction(async (tx) => {
      const openStatuses = ["DRAFT", "SUBMITTED", "INSPECTION", "APPROVED", "PARTIALLY_RECEIVED"] as const;
      const [balances, units, reservations, orders, receipts, invoices, transfers, adjustments, counts] = await Promise.all([
        tx.stockBalance.count({ where: { productId: id, quantity: { not: 0 } } }),
        tx.physicalStockUnit.count({ where: { productId: id, status: { in: ["IN_STOCK", "RESERVED", "IN_TRANSIT", "QUARANTINED"] } } }),
        tx.inventoryReservation.count({ where: { productId: id, releasedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
        tx.purchaseOrderLine.count({ where: { productId: id, order: { status: { in: [...openStatuses] } } } }),
        tx.purchaseReceiptLine.count({ where: { productId: id, receipt: { status: { in: [...openStatuses] } } } }),
        tx.salesInvoiceLine.count({ where: { productId: id, invoice: { status: { in: [...openStatuses] } } } }),
        tx.stockTransferLine.count({ where: { productId: id, transfer: { status: { in: [...openStatuses] } } } }),
        tx.stockAdjustmentLine.count({ where: { productId: id, adjustment: { status: { in: [...openStatuses] } } } }),
        tx.stockCountLine.count({ where: { productId: id, stockCount: { status: { in: [...openStatuses] } } } }),
      ]);
      if (balances || units || reservations) throw new ApiError(409, "PRODUCT_HAS_STOCK", "A product with on-hand, reserved, in-transit, or quarantined stock cannot be archived.");
      if (orders || receipts || invoices || transfers || adjustments || counts) throw new ApiError(409, "PRODUCT_HAS_OPEN_DOCUMENTS", "Complete or cancel open documents that use this product before archiving it.");
      await tx.product.update({ where: { id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
      await tx.productVariant.updateMany({ where: { productId: id }, data: { isActive: false } });
      await appendAudit(
        {
          companyId: context.company.id,
          actorId: context.user.id,
          action: "PRODUCT_ARCHIVED",
          module: "catalog",
          entityType: "Product",
          entityId: id,
          entityReference: existing.sku,
          reason: input.reason,
          previousValues: { status: existing.status },
          newValues: { status: "ARCHIVED" },
        },
        tx,
      );
    });
    return NextResponse.json({ data: { archived: true } });
  } catch (error) {
    return apiError(error);
  }
}
