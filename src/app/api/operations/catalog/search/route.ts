import { NextResponse } from "next/server";
import { apiError, ApiError } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const base = await requireAuth();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim().slice(0, 120) ?? "";
    const mode = searchParams.get("mode") === "sale" ? "sale" : "purchase";
    const warehouseValue = searchParams.get("warehouseId");
    const warehouseId = warehouseValue ? idSchema.parse(warehouseValue) : null;
    const warehouse = warehouseId
      ? await prisma.warehouse.findFirst({ where: { id: warehouseId, companyId: base.company.id, isActive: true }, select: { id: true, branchId: true } })
      : null;
    if (warehouseId && !warehouse) throw new ApiError(404, "WAREHOUSE_NOT_FOUND", "The selected warehouse was not found.");
    const context = await requirePermission(mode === "sale" ? "sales.view" : "purchase.view", warehouse ? { branchId: warehouse.branchId, warehouseId: warehouse.id } : undefined);
    const canViewCost = context.permissions.includes("catalog.cost.view");

    // Also look up any products/variants matching an IMEI or device identifier in stock
    let imeiProductIds: string[] = [];
    if (q && q.length >= 3) {
      const matchingUnits = await prisma.deviceIdentifier.findMany({
        where: {
          value: { contains: q, mode: "insensitive" },
          stockUnit: {
            companyId: context.company.id,
            ...(warehouseId ? { warehouseId } : {}),
            ...(mode === "sale" ? { status: "IN_STOCK" } : {}),
          },
        },
        select: {
          stockUnit: {
            select: {
              productId: true,
            },
          },
        },
        take: 30,
      });
      imeiProductIds = [...new Set(matchingUnits.map((u: any) => u.stockUnit?.productId).filter(Boolean))];
    }

    const products = await prisma.product.findMany({
      where: {
        companyId: context.company.id,
        status: "ACTIVE",
        ...(q ? { OR: [
          ...(imeiProductIds.length > 0 ? [{ id: { in: imeiProductIds } }] : []),
          { sku: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          { model: { contains: q, mode: "insensitive" } },
          { modelCode: { contains: q, mode: "insensitive" } },
          { brand: { name: { contains: q, mode: "insensitive" } } },
          { barcodes: { some: { barcode: { contains: q } } } },
          { variants: { some: { OR: [
            { sku: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } },
            { color: { contains: q, mode: "insensitive" } }, { networkType: { contains: q, mode: "insensitive" } },
            { simConfiguration: { contains: q, mode: "insensitive" } }, { regionVariant: { contains: q, mode: "insensitive" } },
            ...(Number.isInteger(Number(q)) ? [{ storageGb: Number(q) }, { ramGb: Number(q) }] : []),
            { barcodes: { some: { barcode: { contains: q } } } },
          ] } } },
        ] } : {}),
      },
      select: {
        id: true,
        sku: true,
        name: true,
        model: true,
        productType: true,
        trackingMethod: true,
        standardPurchasePrice: canViewCost,
        brand: { select: { name: true } },
        unit: { select: { code: true, name: true, decimalPlaces: true } },
        taxRule: { select: { id: true, code: true, name: true, rate: true } },
        barcodes: { select: { barcode: true, isPrimary: true } },
        variants: {
          where: { isActive: true },
          select: {
            id: true,
            sku: true,
            name: true,
            color: true,
            storageGb: true,
            purchasePrice: canViewCost,
            wholesalePrice: true,
            retailPrice: true,
            minimumSellingPrice: true,
            barcodes: { select: { barcode: true, isPrimary: true } },
          },
          orderBy: { sku: "asc" },
        },
      },
      orderBy: [{ name: "asc" }, { sku: "asc" }],
      take: 50,
    });
    const variantIds = products.flatMap((product) => product.variants.map((variant) => variant.id));
    const [balances, reservations] = warehouseId && variantIds.length ? await Promise.all([
      prisma.stockBalance.groupBy({ by: ["variantId"], where: { companyId: context.company.id, warehouseId, variantId: { in: variantIds } }, _sum: { quantity: true, inventoryValue: true } }),
      mode === "sale" ? prisma.inventoryReservation.groupBy({ by: ["variantId"], where: { companyId: context.company.id, warehouseId, variantId: { in: variantIds }, stockUnitId: null, releasedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, _sum: { quantity: true } }) : Promise.resolve([]),
    ]) : [[], []];
    const balanceMap = new Map(balances.map((balance) => [balance.variantId, balance._sum]));
    const reservationMap = new Map(reservations.map((reservation) => [reservation.variantId, reservation._sum.quantity]));
    const items = products.flatMap((product) => product.variants.map((variant) => ({
      product: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        model: product.model,
        productType: product.productType,
        trackingMethod: product.trackingMethod,
        brand: product.brand,
        unit: product.unit,
        taxRule: product.taxRule,
        barcodes: product.barcodes,
        ...(canViewCost ? { standardPurchasePrice: product.standardPurchasePrice } : {}),
      },
      variant,
      availableQuantity: balanceMap.get(variant.id)?.quantity?.minus(reservationMap.get(variant.id) || 0) ?? "0",
      inventoryValue: canViewCost ? balanceMap.get(variant.id)?.inventoryValue ?? "0" : undefined,
    })));
    return NextResponse.json(jsonSafe({ data: items, meta: { query: q, count: items.length } }));
  } catch (error) {
    return apiError(error);
  }
}
