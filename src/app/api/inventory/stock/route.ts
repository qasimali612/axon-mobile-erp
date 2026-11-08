import { NextResponse } from "next/server";
import { InventoryMovementType, Prisma, StockUnitStatus } from "@prisma/client";
import { apiError, parsePagination } from "@/lib/api";
import { permittedDocumentScopes, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    const context = await requirePermission("inventory.stock.view");
    const { page, pageSize, skip, params } = parsePagination(request.url);
    const allowedScopes = permittedDocumentScopes(context, "inventory.stock.view");
    const view = params.get("view") || "balances";
    const warehouseId = params.get("warehouseId") || undefined;
    const search = params.get("search")?.trim();
    const unitScopes = allowedScopes?.map((scope) => ({
      ...(scope.branchId ? { currentBranchId: scope.branchId } : {}),
      ...(scope.warehouseId ? { currentWarehouseId: scope.warehouseId } : {}),
    }));

    if (view === "movements") {
      const movementValue = params.get("movementType");
      const movementType = movementValue && Object.values(InventoryMovementType).includes(movementValue as InventoryMovementType) ? movementValue as InventoryMovementType : undefined;
      const where: Prisma.InventoryMovementWhereInput = { companyId: context.company.id, ...(warehouseId ? { warehouseId } : {}), ...(movementType ? { movementType } : {}), AND: [...(allowedScopes ? [{ OR: allowedScopes }] : []), ...(search ? [{ OR: [{ sourceDocumentNumber: { contains: search, mode: "insensitive" as const } }, { product: { name: { contains: search, mode: "insensitive" as const } } }, { variant: { sku: { contains: search, mode: "insensitive" as const } } }] }] : [])] };
      const [items, total] = await Promise.all([
        prisma.inventoryMovement.findMany({ where, include: { branch: { select: { code: true, name: true } }, warehouse: { select: { code: true, name: true } }, product: { select: { sku: true, name: true } }, variant: { select: { sku: true, name: true } }, stockUnit: { include: { identifiers: { orderBy: [{ isPrimary: "desc" }, { slot: "asc" }] } } }, journalEntry: { select: { id: true, voucherNumber: true } }, createdBy: { select: { fullName: true } } }, orderBy: [{ postingDate: "desc" }, { postedAt: "desc" }], skip, take: pageSize }),
        prisma.inventoryMovement.count({ where }),
      ]);
      return NextResponse.json(jsonSafe({ data: items, pagination: { page, pageSize, total }, view }));
    }

    if (view === "units") {
      const statusValue = params.get("status");
      const status = statusValue && Object.values(StockUnitStatus).includes(statusValue as StockUnitStatus) ? statusValue as StockUnitStatus : undefined;
      const where: Prisma.PhysicalStockUnitWhereInput = { companyId: context.company.id, ...(warehouseId ? { currentWarehouseId: warehouseId } : {}), ...(status ? { status } : {}), AND: [...(unitScopes ? [{ OR: unitScopes }] : []), ...(search ? [{ OR: [{ identifiers: { some: { normalizedValue: { contains: search, mode: "insensitive" as const } } } }, { product: { name: { contains: search, mode: "insensitive" as const } } }, { variant: { sku: { contains: search, mode: "insensitive" as const } } }] }] : [])] };
      const [items, total] = await Promise.all([
        prisma.physicalStockUnit.findMany({ where, include: { product: { select: { sku: true, name: true, trackingMethod: true } }, variant: { select: { sku: true, name: true } }, currentBranch: { select: { code: true, name: true } }, currentWarehouse: { select: { code: true, name: true } }, identifiers: { orderBy: [{ isPrimary: "desc" }, { slot: "asc" }] } }, orderBy: { createdAt: "desc" }, skip, take: pageSize }),
        prisma.physicalStockUnit.count({ where }),
      ]);
      return NextResponse.json(jsonSafe({ data: items, pagination: { page, pageSize, total }, view }));
    }

    const where: Prisma.StockBalanceWhereInput = { companyId: context.company.id, ...(warehouseId ? { warehouseId } : {}), quantity: { gt: 0 }, AND: [...(allowedScopes ? [{ OR: allowedScopes }] : []), ...(search ? [{ OR: [{ product: { name: { contains: search, mode: "insensitive" as const } } }, { product: { sku: { contains: search, mode: "insensitive" as const } } }, { variant: { sku: { contains: search, mode: "insensitive" as const } } }] }] : [])] };
    const [items, total] = await Promise.all([
      prisma.stockBalance.findMany({ where, include: { branch: { select: { code: true, name: true } }, warehouse: { select: { code: true, name: true } }, product: { select: { sku: true, name: true, trackingMethod: true } }, variant: { select: { sku: true, name: true } }, lot: { select: { lotNumber: true, expiryDate: true } } }, orderBy: [{ warehouse: { code: "asc" } }, { product: { name: "asc" } }], skip, take: pageSize }),
      prisma.stockBalance.count({ where }),
    ]);
    const reservationRows = items.length ? await prisma.inventoryReservation.groupBy({ by: ["warehouseId", "productId", "variantId"], where: { companyId: context.company.id, releasedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }], warehouseId: { in: [...new Set(items.map((item) => item.warehouseId))] }, productId: { in: [...new Set(items.map((item) => item.productId))] }, variantId: { in: [...new Set(items.map((item) => item.variantId))] } }, _sum: { quantity: true } }) : [];
    const data = items.map((item) => {
      const reserved = reservationRows.find((row) => row.warehouseId === item.warehouseId && row.productId === item.productId && row.variantId === item.variantId)?._sum.quantity || null;
      return { ...item, reservedQuantity: reserved || "0", availableQuantity: item.quantity.minus(reserved || 0) };
    });
    return NextResponse.json(jsonSafe({ data, pagination: { page, pageSize, total }, view }));
  } catch (error) { return apiError(error); }
}
