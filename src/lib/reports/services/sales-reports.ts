import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type SalesReportFilters = {
  companyId: string;
  branchFilter: Record<string, unknown>;
  warehouseId?: string;
  brandId?: string;
  customerId?: string;
  salespersonId?: string;
  dateRange?: { gte?: Date; lt?: Date };
  canViewCost: boolean;
  take: number;
};

export async function getSalesByBrandReport(filters: SalesReportFilters) {
  const lines = await prisma.salesInvoiceLine.findMany({
    where: {
      invoice: {
        companyId: filters.companyId,
        status: "POSTED",
        ...filters.branchFilter,
        ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
        ...(filters.customerId ? { customerId: filters.customerId } : {}),
        ...(filters.salespersonId ? { salespersonId: filters.salespersonId } : {}),
        ...(filters.dateRange ? { invoiceDate: filters.dateRange } : {}),
      },
      ...(filters.brandId ? { product: { brandId: filters.brandId } } : {}),
    },
    include: {
      product: { select: { brand: { select: { name: true } } } },
    },
  });

  const brandMap = new Map<
    string,
    { brand: string; unitsSold: number; revenue: Prisma.Decimal; cost: Prisma.Decimal }
  >();

  for (const line of lines) {
    const brandName = line.product.brand?.name || "Unbranded / Accessories";
    const existing = brandMap.get(brandName) || {
      brand: brandName,
      unitsSold: 0,
      revenue: new Prisma.Decimal(0),
      cost: new Prisma.Decimal(0),
    };
    existing.unitsSold += Number(line.quantity);
    existing.revenue = existing.revenue.plus(line.lineTotal);
    existing.cost = existing.cost.plus(line.costTotal);
    brandMap.set(brandName, existing);
  }

  return [...brandMap.values()]
    .map((item) => {
      const profit = item.revenue.minus(item.cost);
      const marginPct = item.revenue.gt(0)
        ? profit.dividedBy(item.revenue).times(100).toFixed(2) + "%"
        : "0.00%";
      return {
        brand: item.brand,
        unitsSold: item.unitsSold,
        revenue: item.revenue,
        cogs: filters.canViewCost ? item.cost : null,
        grossProfit: filters.canViewCost ? profit : null,
        margin: filters.canViewCost ? marginPct : null,
      };
    })
    .sort((a, b) => Number(b.revenue.minus(a.revenue)))
    .slice(0, filters.take);
}

export async function getSalesByModelReport(filters: SalesReportFilters) {
  const lines = await prisma.salesInvoiceLine.findMany({
    where: {
      invoice: {
        companyId: filters.companyId,
        status: "POSTED",
        ...filters.branchFilter,
        ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
        ...(filters.customerId ? { customerId: filters.customerId } : {}),
        ...(filters.salespersonId ? { salespersonId: filters.salespersonId } : {}),
        ...(filters.dateRange ? { invoiceDate: filters.dateRange } : {}),
      },
      ...(filters.brandId ? { product: { brandId: filters.brandId } } : {}),
    },
    include: {
      product: { select: { name: true, sku: true, brand: { select: { name: true } } } },
      variant: { select: { name: true, sku: true, storageGb: true, color: true } },
    },
  });

  const modelMap = new Map<
    string,
    { product: string; variantSku: string; brand: string; unitsSold: number; revenue: Prisma.Decimal; cost: Prisma.Decimal }
  >();

  for (const line of lines) {
    const key = `${line.productId}:${line.variantId}`;
    const brandName = line.product.brand?.name || "Generic";
    const productName = `${line.product.name} (${line.variant.name})`;
    const existing = modelMap.get(key) || {
      product: productName,
      variantSku: line.variant.sku,
      brand: brandName,
      unitsSold: 0,
      revenue: new Prisma.Decimal(0),
      cost: new Prisma.Decimal(0),
    };
    existing.unitsSold += Number(line.quantity);
    existing.revenue = existing.revenue.plus(line.lineTotal);
    existing.cost = existing.cost.plus(line.costTotal);
    modelMap.set(key, existing);
  }

  return [...modelMap.values()]
    .map((item) => {
      const avgPrice = item.unitsSold > 0 ? item.revenue.dividedBy(item.unitsSold) : new Prisma.Decimal(0);
      const profit = item.revenue.minus(item.cost);
      const marginPct = item.revenue.gt(0)
        ? profit.dividedBy(item.revenue).times(100).toFixed(2) + "%"
        : "0.00%";
      return {
        product: item.product,
        sku: item.variantSku,
        brand: item.brand,
        unitsSold: item.unitsSold,
        revenue: item.revenue,
        avgSellingPrice: avgPrice,
        cogs: filters.canViewCost ? item.cost : null,
        grossProfit: filters.canViewCost ? profit : null,
        margin: filters.canViewCost ? marginPct : null,
      };
    })
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, filters.take);
}

export async function getSalespersonPerformanceReport(filters: SalesReportFilters) {
  const invoices = await prisma.salesInvoice.findMany({
    where: {
      companyId: filters.companyId,
      status: "POSTED",
      ...filters.branchFilter,
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      ...(filters.salespersonId ? { salespersonId: filters.salespersonId } : {}),
      ...(filters.dateRange ? { invoiceDate: filters.dateRange } : {}),
    },
    include: {
      salesperson: { select: { fullName: true } },
      lines: { select: { quantity: true, costTotal: true, lineTotal: true } },
    },
  });

  const repMap = new Map<
    string,
    { salesperson: string; invoiceCount: number; unitsSold: number; totalSales: Prisma.Decimal; totalCost: Prisma.Decimal }
  >();

  for (const inv of invoices) {
    const repName = inv.salesperson?.fullName || "Unassigned";
    const existing = repMap.get(repName) || {
      salesperson: repName,
      invoiceCount: 0,
      unitsSold: 0,
      totalSales: new Prisma.Decimal(0),
      totalCost: new Prisma.Decimal(0),
    };
    existing.invoiceCount += 1;
    existing.totalSales = existing.totalSales.plus(inv.grandTotal);
    for (const l of inv.lines) {
      existing.unitsSold += Number(l.quantity);
      existing.totalCost = existing.totalCost.plus(l.costTotal);
    }
    repMap.set(repName, existing);
  }

  return [...repMap.values()]
    .map((item) => {
      const profit = item.totalSales.minus(item.totalCost);
      const marginPct = item.totalSales.gt(0)
        ? profit.dividedBy(item.totalSales).times(100).toFixed(2) + "%"
        : "0.00%";
      return {
        salesperson: item.salesperson,
        invoiceCount: item.invoiceCount,
        unitsSold: item.unitsSold,
        totalSales: item.totalSales,
        grossProfit: filters.canViewCost ? profit : null,
        margin: filters.canViewCost ? marginPct : null,
      };
    })
    .sort((a, b) => Number(b.totalSales.minus(a.totalSales)))
    .slice(0, filters.take);
}

export async function getFastSlowMovingStockReport(filters: SalesReportFilters, mode: "FAST" | "SLOW") {
  const salesLines = await prisma.salesInvoiceLine.groupBy({
    by: ["variantId"],
    where: {
      invoice: {
        companyId: filters.companyId,
        status: "POSTED",
        ...(filters.dateRange ? { invoiceDate: filters.dateRange } : {}),
      },
    },
    _sum: { quantity: true, lineTotal: true },
  });

  const salesMap = new Map(salesLines.map((s) => [s.variantId, { sold: Number(s._sum.quantity || 0), revenue: s._sum.lineTotal || new Prisma.Decimal(0) }]));

  const balances = await prisma.stockBalance.findMany({
    where: {
      companyId: filters.companyId,
      ...filters.branchFilter,
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
    },
    include: {
      product: { select: { name: true, sku: true, brand: { select: { name: true } } } },
      variant: { select: { name: true, sku: true } },
    },
  });

  const items = balances.map((b) => {
    const saleInfo = salesMap.get(b.variantId) || { sold: 0, revenue: new Prisma.Decimal(0) };
    return {
      product: `${b.product.name} · ${b.variant.name}`,
      sku: b.variant.sku,
      brand: b.product.brand?.name || "Generic",
      onHandQty: b.quantity,
      unitsSold: saleInfo.sold,
      revenue: saleInfo.revenue,
      inventoryValue: filters.canViewCost ? b.inventoryValue : null,
    };
  });

  if (mode === "FAST") {
    items.sort((a, b) => b.unitsSold - a.unitsSold);
  } else {
    items.sort((a, b) => a.unitsSold - b.unitsSold);
  }

  return items.slice(0, filters.take);
}
