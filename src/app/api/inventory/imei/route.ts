import { NextResponse } from "next/server";
import { IdentifierType, Prisma, StockUnitStatus, TrackingMethod } from "@prisma/client";
import { apiError, parsePagination } from "@/lib/api";
import { permittedDocumentScopes, requirePermission, type OperationalDocumentScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

function scopedUnits(scopes: OperationalDocumentScope[] | null): Prisma.PhysicalStockUnitWhereInput | null {
  if (!scopes) return null;
  return {
    OR: scopes.flatMap((scope) => [
      {
        ...(scope.branchId ? { currentBranchId: scope.branchId } : {}),
        ...(scope.warehouseId ? { currentWarehouseId: scope.warehouseId } : {}),
      },
      {
        movements: {
          some: {
            ...(scope.branchId ? { branchId: scope.branchId } : {}),
            ...(scope.warehouseId ? { warehouseId: scope.warehouseId } : {}),
          },
        },
      },
    ]),
  };
}

function warehouseOptions(companyId: string, scopes: OperationalDocumentScope[] | null): Prisma.WarehouseWhereInput {
  if (!scopes) return { companyId, isActive: true };
  return {
    companyId,
    isActive: true,
    OR: scopes.map((scope) => ({
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(scope.warehouseId ? { id: scope.warehouseId } : {}),
    })),
  };
}

export async function GET(request: Request) {
  try {
    const context = await requirePermission("inventory.device.view");
    const scopes = permittedDocumentScopes(context, "inventory.device.view");
    const scopeWhere = scopedUnits(scopes);
    const { page, pageSize, skip, params } = parsePagination(request.url);
    const search = params.get("search")?.trim();
    const warehouseId = params.get("warehouseId")?.trim();
    const productId = params.get("productId")?.trim();
    const statusValue = params.get("status")?.trim();
    const status = statusValue && Object.values(StockUnitStatus).includes(statusValue as StockUnitStatus)
      ? statusValue as StockUnitStatus
      : undefined;
    const from = params.get("from") ? new Date(`${params.get("from")}T00:00:00.000Z`) : null;
    const to = params.get("to") ? new Date(`${params.get("to")}T23:59:59.999Z`) : null;
    const validFrom = from && !Number.isNaN(from.getTime()) ? from : null;
    const validTo = to && !Number.isNaN(to.getTime()) ? to : null;

    const filters: Prisma.PhysicalStockUnitWhereInput[] = [];
    if (scopeWhere) filters.push(scopeWhere);
    if (warehouseId) filters.push({ OR: [{ currentWarehouseId: warehouseId }, { movements: { some: { warehouseId } } }] });
    if (validFrom || validTo) filters.push({ acquisitionDate: { ...(validFrom ? { gte: validFrom } : {}), ...(validTo ? { lte: validTo } : {}) } });
    if (search) {
      filters.push({
        OR: [
          { identifiers: { some: { normalizedValue: { contains: search.replace(/[\s-]/g, ""), mode: "insensitive" } } } },
          { product: { name: { contains: search, mode: "insensitive" } } },
          { product: { sku: { contains: search, mode: "insensitive" } } },
          { product: { model: { contains: search, mode: "insensitive" } } },
          { variant: { name: { contains: search, mode: "insensitive" } } },
          { variant: { sku: { contains: search, mode: "insensitive" } } },
          { receiptUnits: { some: { receiptLine: { receipt: { receiptNumber: { contains: search, mode: "insensitive" } } } } } },
          { salesUnits: { some: { invoiceLine: { invoice: { invoiceNumber: { contains: search, mode: "insensitive" } } } } } },
        ],
      });
    }

    const where: Prisma.PhysicalStockUnitWhereInput = {
      companyId: context.company.id,
      product: { trackingMethod: TrackingMethod.IMEI },
      identifiers: { some: { type: IdentifierType.IMEI } },
      ...(productId ? { productId } : {}),
      ...(status ? { status } : {}),
      ...(filters.length ? { AND: filters } : {}),
    };

    const canViewCost = context.permissions.includes("catalog.cost.view");
    const [items, total, statusRows, warehouses] = await Promise.all([
      prisma.physicalStockUnit.findMany({
        where,
        include: {
          product: { select: { id: true, sku: true, name: true, model: true, trackingMethod: true, brand: { select: { code: true, name: true } } } },
          variant: { select: { id: true, sku: true, name: true, color: true, ramGb: true, storageGb: true, simConfiguration: true, regionVariant: true } },
          currentBranch: { select: { id: true, code: true, name: true } },
          currentWarehouse: { select: { id: true, code: true, name: true } },
          currentLocation: { select: { id: true, code: true, name: true } },
          identifiers: { orderBy: [{ type: "asc" }, { slot: "asc" }, { isPrimary: "desc" }] },
          receiptUnits: {
            include: {
              receiptLine: {
                select: {
                  id: true,
                  lineNumber: true,
                  landedUnitCost: true,
                  receipt: {
                    select: {
                      id: true,
                      receiptNumber: true,
                      receiptDate: true,
                      status: true,
                      supplierInvoiceNumber: true,
                      supplier: { select: { id: true, code: true, name: true } },
                      purchaseOrder: { select: { id: true, orderNumber: true } },
                    },
                  },
                },
              },
            },
          },
          salesUnits: {
            include: {
              invoiceLine: {
                select: {
                  id: true,
                  lineNumber: true,
                  unitPrice: true,
                  invoice: {
                    select: {
                      id: true,
                      invoiceNumber: true,
                      invoiceDate: true,
                      status: true,
                      customer: { select: { id: true, code: true, name: true } },
                    },
                  },
                },
              },
            },
          },
          returnUnits: {
            include: {
              returnLine: {
                select: {
                  id: true,
                  disposition: true,
                  condition: true,
                  stockReturn: { select: { id: true, returnNumber: true, returnDate: true, returnType: true, status: true } },
                },
              },
            },
          },
          movements: {
            select: { id: true, movementType: true, postingDate: true, postedAt: true, sourceDocumentType: true, sourceDocumentId: true, sourceDocumentNumber: true, warehouse: { select: { code: true, name: true } } },
            orderBy: [{ postingDate: "desc" }, { postedAt: "desc" }],
            take: 1,
          },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.physicalStockUnit.count({ where }),
      prisma.physicalStockUnit.groupBy({ by: ["status"], where, _count: { _all: true } }),
      prisma.warehouse.findMany({ where: warehouseOptions(context.company.id, scopes), select: { id: true, code: true, name: true, branch: { select: { code: true, name: true } } }, orderBy: [{ branch: { code: "asc" } }, { code: "asc" }] }),
    ]);

    const data = items.map((item) => {
      const receiptUnit = [...item.receiptUnits].sort((left, right) => left.receiptLine.receipt.receiptDate.getTime() - right.receiptLine.receipt.receiptDate.getTime())[0] || null;
      const saleUnit = [...item.salesUnits].sort((left, right) => right.invoiceLine.invoice.invoiceDate.getTime() - left.invoiceLine.invoice.invoiceDate.getTime())[0] || null;
      const imeis = item.identifiers.filter((identifier) => identifier.type === IdentifierType.IMEI);
      return {
        id: item.id,
        product: item.product,
        variant: item.variant,
        imei1: imeis.find((identifier) => identifier.slot === 1)?.value || imeis.find((identifier) => identifier.isPrimary)?.value || null,
        imei2: imeis.find((identifier) => identifier.slot === 2)?.value || null,
        identifiers: item.identifiers,
        status: item.status,
        acquisitionDate: item.acquisitionDate,
        acquisitionCost: canViewCost ? item.acquisitionCost : null,
        soldAt: item.soldAt,
        currentBranch: item.currentBranch,
        currentWarehouse: item.currentWarehouse,
        currentLocation: item.currentLocation,
        purchase: receiptUnit ? receiptUnit.receiptLine.receipt : null,
        sale: saleUnit ? saleUnit.invoiceLine.invoice : null,
        returns: item.returnUnits.map((entry) => entry.returnLine),
        lastMovement: item.movements[0] || null,
      };
    });
    const summary = Object.fromEntries(Object.values(StockUnitStatus).map((key) => [key, statusRows.find((row) => row.status === key)?._count._all || 0]));

    return NextResponse.json(jsonSafe({
      data,
      meta: { page, pageSize, total, summary, warehouses, canViewCost },
    }));
  } catch (error) {
    return apiError(error);
  }
}
