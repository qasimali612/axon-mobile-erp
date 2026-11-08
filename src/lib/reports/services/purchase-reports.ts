import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type PurchaseReportFilters = {
  companyId: string;
  branchFilter: Record<string, unknown>;
  warehouseId?: string;
  supplierId?: string;
  brandId?: string;
  dateRange?: { gte?: Date; lt?: Date };
  canViewCost: boolean;
  take: number;
};

export async function getSupplierPurchaseVolumeReport(filters: PurchaseReportFilters) {
  const receipts = await prisma.purchaseReceipt.findMany({
    where: {
      companyId: filters.companyId,
      status: "POSTED",
      ...filters.branchFilter,
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
      ...(filters.dateRange ? { receiptDate: filters.dateRange } : {}),
    },
    include: {
      supplier: { select: { code: true, name: true } },
      lines: { select: { quantity: true, lineTotal: true } },
    },
  });

  const supplierMap = new Map<
    string,
    { supplier: string; code: string; grnCount: number; unitsReceived: number; totalSpend: Prisma.Decimal }
  >();

  for (const r of receipts) {
    const key = r.supplier.code;
    const existing = supplierMap.get(key) || {
      supplier: r.supplier.name,
      code: r.supplier.code,
      grnCount: 0,
      unitsReceived: 0,
      totalSpend: new Prisma.Decimal(0),
    };
    existing.grnCount += 1;
    existing.totalSpend = existing.totalSpend.plus(r.grandTotal);
    for (const l of r.lines) {
      existing.unitsReceived += Number(l.quantity);
    }
    supplierMap.set(key, existing);
  }

  return [...supplierMap.values()]
    .map((item) => ({
      supplier: item.supplier,
      code: item.code,
      receiptCount: item.grnCount,
      unitsReceived: item.unitsReceived,
      totalSpend: filters.canViewCost ? item.totalSpend : null,
    }))
    .sort((a, b) => {
      if (!a.totalSpend || !b.totalSpend) return b.unitsReceived - a.unitsReceived;
      return Number(b.totalSpend.minus(a.totalSpend));
    })
    .slice(0, filters.take);
}

export async function getPurchasePriceTrendsReport(filters: PurchaseReportFilters) {
  const lines = await prisma.purchaseReceiptLine.findMany({
    where: {
      receipt: {
        companyId: filters.companyId,
        status: "POSTED",
        ...filters.branchFilter,
        ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
        ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
        ...(filters.dateRange ? { receiptDate: filters.dateRange } : {}),
      },
      ...(filters.brandId ? { product: { brandId: filters.brandId } } : {}),
    },
    include: {
      receipt: { select: { receiptNumber: true, receiptDate: true, supplier: { select: { name: true } } } },
      product: { select: { name: true, sku: true } },
      variant: { select: { name: true, sku: true } },
    },
    orderBy: { receipt: { receiptDate: "desc" } },
    take: filters.take,
  });

  return lines.map((l) => ({
    receiptNumber: l.receipt.receiptNumber,
    receiptDate: l.receipt.receiptDate,
    supplier: l.receipt.supplier.name,
    product: `${l.product.name} · ${l.variant.name}`,
    sku: l.variant.sku,
    quantity: l.quantity,
    unitPrice: filters.canViewCost ? l.unitCost : null,
    landedUnitCost: filters.canViewCost ? l.landedUnitCost : null,
    totalLineAmount: filters.canViewCost ? l.lineTotal : null,
  }));
}
