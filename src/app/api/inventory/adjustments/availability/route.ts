import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const base = await requireAuth();
    const params = new URL(request.url).searchParams;
    const warehouseId = idSchema.parse(params.get("warehouseId"));
    const search = params.get("search")?.trim();
    const productId = params.get("productId") ? idSchema.parse(params.get("productId")) : undefined;
    const variantId = params.get("variantId") ? idSchema.parse(params.get("variantId")) : undefined;
    const warehouse = await prisma.warehouse.findFirst({
      where: { id: warehouseId, companyId: base.company.id, isActive: true },
      select: { id: true, branchId: true },
    });
    if (!warehouse) throw new ApiError(404, "WAREHOUSE_NOT_FOUND", "The adjustment warehouse is unavailable.");
    const context = await requirePermission("inventory.stock.adjust", { branchId: warehouse.branchId, warehouseId });
    const now = new Date();
    const [units, balances, reservations] = await Promise.all([
      prisma.physicalStockUnit.findMany({
        where: {
          companyId: context.company.id,
          currentWarehouseId: warehouseId,
          status: "IN_STOCK",
          ...(productId ? { productId } : {}),
          ...(variantId ? { variantId } : {}),
          reservations: { none: { releasedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } },
          ...(search ? { OR: [
            { identifiers: { some: { normalizedValue: { contains: search.replace(/[\s-]/g, "").toUpperCase(), mode: "insensitive" } } } },
            { product: { name: { contains: search, mode: "insensitive" } } },
            { product: { sku: { contains: search, mode: "insensitive" } } },
            { variant: { sku: { contains: search, mode: "insensitive" } } },
          ] } : {}),
        },
        include: {
          product: { select: { id: true, sku: true, name: true, trackingMethod: true } },
          variant: { select: { id: true, sku: true, name: true } },
          identifiers: { orderBy: [{ isPrimary: "desc" }, { type: "asc" }, { slot: "asc" }] },
        },
        orderBy: { createdAt: "asc" },
        take: 100,
      }),
      prisma.stockBalance.findMany({
        where: {
          companyId: context.company.id,
          warehouseId,
          quantity: { gt: 0 },
          product: { status: "ACTIVE", trackingMethod: { in: ["QUANTITY", "BATCH"] } },
          variant: { isActive: true },
          ...(productId ? { productId } : {}),
          ...(variantId ? { variantId } : {}),
          ...(search ? { OR: [
            { product: { name: { contains: search, mode: "insensitive" } } },
            { product: { sku: { contains: search, mode: "insensitive" } } },
            { variant: { sku: { contains: search, mode: "insensitive" } } },
            { lot: { lotNumber: { contains: search, mode: "insensitive" } } },
          ] } : {}),
        },
        include: {
          product: { select: { id: true, sku: true, name: true, trackingMethod: true } },
          variant: { select: { id: true, sku: true, name: true } },
          lot: { select: { id: true, lotNumber: true, expiryDate: true } },
        },
        orderBy: [{ product: { name: "asc" } }, { variant: { sku: "asc" } }],
        take: 100,
      }),
      prisma.inventoryReservation.groupBy({
        by: ["productId", "variantId"],
        where: {
          companyId: context.company.id,
          warehouseId,
          releasedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          ...(productId ? { productId } : {}),
          ...(variantId ? { variantId } : {}),
        },
        _sum: { quantity: true },
      }),
    ]);
    const reservedByVariant = new Map(reservations.map((item) => [`${item.productId}:${item.variantId}`, item._sum.quantity || 0]));
    const availableBalances = balances.map((balance) => {
      const reserved = reservedByVariant.get(`${balance.productId}:${balance.variantId}`) || 0;
      return { ...balance, availableQuantity: Prisma.Decimal.max(balance.quantity.minus(reserved), 0) };
    }).filter((balance) => balance.availableQuantity.gt(0));
    return NextResponse.json(jsonSafe({
      data: { units, balances: availableBalances },
    }));
  } catch (error) {
    return apiError(error);
  }
}
