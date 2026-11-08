import { Prisma, StockUnitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ImeiReportFilters = {
  companyId: string;
  branchFilter: Record<string, unknown>;
  warehouseId?: string;
  brandId?: string;
  customerId?: string;
  status?: StockUnitStatus;
  from?: Date;
  to?: Date;
  dateRange?: { gte?: Date; lt?: Date };
  canViewCost: boolean;
  take: number;
};

export async function getCompleteImeiRegistryReport(filters: ImeiReportFilters) {
  const units = await prisma.physicalStockUnit.findMany({
    where: {
      companyId: filters.companyId,
      ...(filters.warehouseId ? { currentWarehouseId: filters.warehouseId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.brandId ? { product: { brandId: filters.brandId } } : {}),
    },
    include: {
      currentBranch: { select: { code: true } },
      currentWarehouse: { select: { code: true } },
      product: { select: { name: true, sku: true } },
      variant: { select: { name: true, sku: true } },
      identifiers: { orderBy: [{ slot: "asc" }, { type: "asc" }] },
    },
    orderBy: { createdAt: "desc" },
    take: filters.take,
  });

  return units.map((unit) => {
    const imei1 = unit.identifiers.find((i) => i.slot === 1)?.value || unit.identifiers[0]?.value || "—";
    const imei2 = unit.identifiers.find((i) => i.slot === 2)?.value || (unit.identifiers.length > 1 ? unit.identifiers[1]?.value : "—");
    return {
      unitId: unit.id,
      status: unit.status,
      branch: unit.currentBranch?.code || "—",
      warehouse: unit.currentWarehouse?.code || "—",
      sku: unit.variant.sku,
      product: `${unit.product.name} · ${unit.variant.name}`,
      imei1,
      imei2,
      acquisitionDate: unit.acquisitionDate,
      acquisitionCost: filters.canViewCost ? unit.acquisitionCost : null,
      soldAt: unit.soldAt,
    };
  });
}

export async function getAvailableImeiReport(filters: ImeiReportFilters) {
  return getCompleteImeiRegistryReport({
    ...filters,
    status: StockUnitStatus.IN_STOCK,
  });
}

export async function getSoldImeiReport(filters: ImeiReportFilters) {
  const lines = await prisma.salesInvoiceUnit.findMany({
    where: {
      invoiceLine: {
        invoice: {
          companyId: filters.companyId,
          ...(filters.customerId ? { customerId: filters.customerId } : {}),
          ...(filters.dateRange ? { invoiceDate: filters.dateRange } : {}),
        },
      },
    },
    include: {
      invoiceLine: {
        include: {
          invoice: {
            include: {
              customer: { select: { name: true } },
              salesperson: { select: { fullName: true } },
            },
          },
          product: { select: { name: true } },
          variant: { select: { name: true, sku: true } },
        },
      },
      stockUnit: {
        include: {
          identifiers: { orderBy: [{ slot: "asc" }] },
        },
      },
    },
    orderBy: { invoiceLine: { invoice: { invoiceDate: "desc" } } },
    take: filters.take,
  });

  return lines.map((line) => {
    const unit = line.stockUnit;
    const imei1 = unit?.identifiers.find((i) => i.slot === 1)?.value || unit?.identifiers[0]?.value || "—";
    const imei2 = unit?.identifiers.find((i) => i.slot === 2)?.value || (unit && unit.identifiers.length > 1 ? unit.identifiers[1]?.value : "—");
    return {
      soldAt: line.invoiceLine.invoice.invoiceDate,
      invoiceNumber: line.invoiceLine.invoice.invoiceNumber,
      customer: line.invoiceLine.invoice.customer.name,
      salesperson: line.invoiceLine.invoice.salesperson?.fullName || "—",
      product: `${line.invoiceLine.product.name} · ${line.invoiceLine.variant.name}`,
      imei1,
      imei2,
      salePrice: line.invoiceLine.unitPrice,
    };
  });
}

export async function getDuplicateImeiAudit(companyId: string) {
  const duplicates = await prisma.deviceIdentifier.groupBy({
    by: ["normalizedValue", "type"],
    where: { companyId },
    _count: { id: true },
    having: {
      id: { _count: { gt: 1 } },
    },
  });

  const rows = [];
  for (const dup of duplicates) {
    const instances = await prisma.deviceIdentifier.findMany({
      where: { companyId, normalizedValue: dup.normalizedValue },
      select: { stockUnitId: true },
    });
    rows.push({
      normalizedValue: dup.normalizedValue,
      type: dup.type,
      count: dup._count.id,
      stockUnitIds: instances.map((i) => i.stockUnitId.slice(0, 8)).join(", "),
    });
  }

  return rows;
}

export async function getImeiReconciliationReport(companyId: string, warehouseId?: string) {
  const [balances, units] = await Promise.all([
    prisma.stockBalance.findMany({
      where: {
        companyId,
        ...(warehouseId ? { warehouseId } : {}),
      },
      include: {
        warehouse: { select: { code: true } },
        product: { select: { name: true, trackingMethod: true } },
        variant: { select: { sku: true, name: true } },
      },
    }),
    prisma.physicalStockUnit.groupBy({
      by: ["currentWarehouseId", "variantId"],
      where: {
        companyId,
        status: StockUnitStatus.IN_STOCK,
        ...(warehouseId ? { currentWarehouseId: warehouseId } : {}),
      },
      _count: { id: true },
    }),
  ]);

  const unitMap = new Map(units.map((u) => [`${u.currentWarehouseId}:${u.variantId}`, u._count.id]));

  return balances
    .filter((b) => b.product.trackingMethod === "IMEI" || b.product.trackingMethod === "SERIAL")
    .map((b) => {
      const physicalCount = unitMap.get(`${b.warehouseId}:${b.variantId}`) || 0;
      const balanceNum = Number(b.quantity);
      const variance = physicalCount - balanceNum;
      return {
        warehouse: b.warehouse.code,
        sku: b.variant.sku,
        product: `${b.product.name} · ${b.variant.name}`,
        balanceQty: b.quantity,
        physicalUnitCount: physicalCount,
        variance,
        status: variance === 0 ? "RECONCILED" : "VARIANCE_DETECTED",
      };
    })
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
}

