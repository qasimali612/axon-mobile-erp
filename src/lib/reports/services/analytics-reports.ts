import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { zero } from "@/lib/finance/money";

export type AnalyticsFilters = {
  companyId: string;
  from?: Date;
  to?: Date;
  branchId?: string;
  branchIds?: string[];
};

export async function getBusinessAnalytics(filters: AnalyticsFilters) {
  const branchFilter: Prisma.SalesInvoiceWhereInput = filters.branchId
    ? { branchId: filters.branchId }
    : filters.branchIds
      ? { branchId: { in: filters.branchIds } }
      : {};

  const invoiceDateFilter: Prisma.DateTimeFilter | undefined =
    filters.from || filters.to
      ? {
          ...(filters.from ? { gte: filters.from } : {}),
          ...(filters.to ? { lte: filters.to } : {}),
        }
      : undefined;

  // 1. All posted sales invoice lines in scope
  const invoiceLines = await prisma.salesInvoiceLine.findMany({
    where: {
      invoice: {
        companyId: filters.companyId,
        status: "POSTED",
        reversalOfId: null,
        ...branchFilter,
        ...(invoiceDateFilter ? { invoiceDate: invoiceDateFilter } : {}),
      },
    },
    include: {
      product: {
        include: {
          brand: { select: { id: true, name: true, code: true } },
        },
      },
      invoice: {
        select: {
          id: true,
          branchId: true,
          salespersonId: true,
          invoiceDate: true,
          branch: { select: { id: true, code: true, name: true } },
          salesperson: { select: { id: true, fullName: true } },
        },
      },
    },
  });

  // Aggregators
  const productMap = new Map<
    string,
    {
      productId: string;
      productName: string;
      brandName: string;
      sku: string;
      unitsSold: number;
      revenue: Prisma.Decimal;
      cost: Prisma.Decimal;
      grossProfit: Prisma.Decimal;
      marginPercent: number;
    }
  >();

  const brandMap = new Map<
    string,
    {
      brandId: string;
      brandName: string;
      unitsSold: number;
      revenue: Prisma.Decimal;
      cost: Prisma.Decimal;
      grossProfit: Prisma.Decimal;
      marginPercent: number;
    }
  >();

  const salespersonMap = new Map<
    string,
    {
      salespersonId: string;
      fullName: string;
      invoicesCount: Set<string>;
      unitsSold: number;
      revenue: Prisma.Decimal;
      cost: Prisma.Decimal;
      grossProfit: Prisma.Decimal;
    }
  >();

  const branchMap = new Map<
    string,
    {
      branchId: string;
      code: string;
      name: string;
      invoicesCount: Set<string>;
      unitsSold: number;
      revenue: Prisma.Decimal;
      cost: Prisma.Decimal;
      grossProfit: Prisma.Decimal;
    }
  >();

  for (const line of invoiceLines) {
    const qty = Number(line.quantity);
    const rev = line.lineTotal || zero();
    const cogs = line.costTotal || zero();
    const gp = rev.minus(cogs);

    // Product
    const pId = line.productId;
    const pName = line.product.name;
    const bName = line.product.brand?.name || "Unbranded";
    const pExisting = productMap.get(pId) || {
      productId: pId,
      productName: pName,
      brandName: bName,
      sku: line.product.sku,
      unitsSold: 0,
      revenue: zero(),
      cost: zero(),
      grossProfit: zero(),
      marginPercent: 0,
    };
    pExisting.unitsSold += qty;
    pExisting.revenue = pExisting.revenue.plus(rev);
    pExisting.cost = pExisting.cost.plus(cogs);
    pExisting.grossProfit = pExisting.grossProfit.plus(gp);
    productMap.set(pId, pExisting);

    // Brand
    const brandId = line.product.brandId || "unbranded";
    const bExisting = brandMap.get(brandId) || {
      brandId,
      brandName: bName,
      unitsSold: 0,
      revenue: zero(),
      cost: zero(),
      grossProfit: zero(),
      marginPercent: 0,
    };
    bExisting.unitsSold += qty;
    bExisting.revenue = bExisting.revenue.plus(rev);
    bExisting.cost = bExisting.cost.plus(cogs);
    bExisting.grossProfit = bExisting.grossProfit.plus(gp);
    brandMap.set(brandId, bExisting);

    // Salesperson
    const spId = line.invoice.salespersonId || "unassigned";
    const spName = line.invoice.salesperson?.fullName || "Counter / Direct";
    const spExisting = salespersonMap.get(spId) || {
      salespersonId: spId,
      fullName: spName,
      invoicesCount: new Set<string>(),
      unitsSold: 0,
      revenue: zero(),
      cost: zero(),
      grossProfit: zero(),
    };
    spExisting.invoicesCount.add(line.invoice.id);
    spExisting.unitsSold += qty;
    spExisting.revenue = spExisting.revenue.plus(rev);
    spExisting.cost = spExisting.cost.plus(cogs);
    spExisting.grossProfit = spExisting.grossProfit.plus(gp);
    salespersonMap.set(spId, spExisting);

    // Branch
    const brId = line.invoice.branchId;
    const brCode = line.invoice.branch.code;
    const brName = line.invoice.branch.name;
    const brExisting = branchMap.get(brId) || {
      branchId: brId,
      code: brCode,
      name: brName,
      invoicesCount: new Set<string>(),
      unitsSold: 0,
      revenue: zero(),
      cost: zero(),
      grossProfit: zero(),
    };
    brExisting.invoicesCount.add(line.invoice.id);
    brExisting.unitsSold += qty;
    brExisting.revenue = brExisting.revenue.plus(rev);
    brExisting.cost = brExisting.cost.plus(cogs);
    brExisting.grossProfit = brExisting.grossProfit.plus(gp);
    branchMap.set(brId, brExisting);
  }

  // Calculate margin percentages
  for (const item of productMap.values()) {
    item.marginPercent = item.revenue.gt(0)
      ? Number(item.grossProfit.dividedBy(item.revenue).times(100).toFixed(2))
      : 0;
  }
  for (const item of brandMap.values()) {
    item.marginPercent = item.revenue.gt(0)
      ? Number(item.grossProfit.dividedBy(item.revenue).times(100).toFixed(2))
      : 0;
  }

  const allProductsList = Array.from(productMap.values());

  // 1. Top 10 Selling Products by Volume
  const top10ProductsByVolume = [...allProductsList]
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, 10);

  // 2. Top 10 Selling Products by Revenue
  const top10ProductsByRevenue = [...allProductsList]
    .sort((a, b) => b.revenue.comparedTo(a.revenue))
    .slice(0, 10);

  // 3. Top Brands
  const topBrands = Array.from(brandMap.values())
    .sort((a, b) => b.revenue.comparedTo(a.revenue))
    .slice(0, 10);

  // 4. Salesperson Leaderboard
  const salespersonLeaderboard = Array.from(salespersonMap.values())
    .map((sp) => ({
      salespersonId: sp.salespersonId,
      fullName: sp.fullName,
      invoiceCount: sp.invoicesCount.size,
      unitsSold: sp.unitsSold,
      revenue: sp.revenue,
      cost: sp.cost,
      grossProfit: sp.grossProfit,
      marginPercent: sp.revenue.gt(0)
        ? Number(sp.grossProfit.dividedBy(sp.revenue).times(100).toFixed(2))
        : 0,
    }))
    .sort((a, b) => b.revenue.comparedTo(a.revenue));

  // 5. Branch Ranking
  const branchRanking = Array.from(branchMap.values())
    .map((br) => ({
      branchId: br.branchId,
      code: br.code,
      name: br.name,
      invoiceCount: br.invoicesCount.size,
      unitsSold: br.unitsSold,
      revenue: br.revenue,
      cost: br.cost,
      grossProfit: br.grossProfit,
      marginPercent: br.revenue.gt(0)
        ? Number(br.grossProfit.dividedBy(br.revenue).times(100).toFixed(2))
        : 0,
    }))
    .sort((a, b) => b.revenue.comparedTo(a.revenue));

  // 6. High-Margin Products (sorted by gross profit margin %)
  const highMarginProducts = [...allProductsList]
    .filter((p) => p.unitsSold > 0)
    .sort((a, b) => b.marginPercent - a.marginPercent)
    .slice(0, 10);

  // 7. Low-Margin Products
  const lowMarginProducts = [...allProductsList]
    .filter((p) => p.unitsSold > 0)
    .sort((a, b) => a.marginPercent - b.marginPercent)
    .slice(0, 10);

  // 8. Stagnant / Slow Moving: In-stock products with zero or lowest sales
  const inStockBalances = await prisma.stockBalance.findMany({
    where: {
      quantity: { gt: 0 },
      warehouse: {
        companyId: filters.companyId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
      },
    },
    include: {
      product: {
        include: {
          brand: { select: { name: true } },
        },
      },
    },
  });

  const slowMovingMap = new Map<
    string,
    {
      productId: string;
      productName: string;
      brandName: string;
      stockQuantity: number;
      inventoryValue: Prisma.Decimal;
      unitsSold: number;
    }
  >();

  for (const sb of inStockBalances) {
    const pId = sb.productId;
    const sold = productMap.get(pId)?.unitsSold || 0;
    const existing = slowMovingMap.get(pId) || {
      productId: pId,
      productName: sb.product.name,
      brandName: sb.product.brand?.name || "Unbranded",
      stockQuantity: 0,
      inventoryValue: zero(),
      unitsSold: sold,
    };
    existing.stockQuantity += Number(sb.quantity);
    existing.inventoryValue = existing.inventoryValue.plus(sb.inventoryValue);
    slowMovingMap.set(pId, existing);
  }

  const slowMovingProducts = Array.from(slowMovingMap.values())
    .sort((a, b) => {
      if (a.unitsSold !== b.unitsSold) return a.unitsSold - b.unitsSold;
      return b.inventoryValue.comparedTo(a.inventoryValue);
    })
    .slice(0, 10);

  return {
    top10ProductsByVolume,
    top10ProductsByRevenue,
    topBrands,
    salespersonLeaderboard,
    branchRanking,
    highMarginProducts,
    lowMarginProducts,
    slowMovingProducts,
    totalLinesAnalyzed: invoiceLines.length,
  };
}
