import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { zero } from "@/lib/finance/money";

export type BranchComparisonFilters = {
  companyId: string;
  from: Date;
  to: Date;
  branchIds?: string[];
};

export type BranchMetrics = {
  branchId: string;
  code: string;
  name: string;
  city?: string | null;
  type: string;
  isHeadOffice: boolean;

  // Sales
  salesInvoiceCount: number;
  grossSales: Prisma.Decimal;
  salesDiscounts: Prisma.Decimal;
  salesReturns: Prisma.Decimal;
  netSales: Prisma.Decimal;
  costOfGoodsSold: Prisma.Decimal;
  grossProfit: Prisma.Decimal;
  grossProfitMarginPercent: number;

  // Purchases
  purchaseCount: number;
  grossPurchases: Prisma.Decimal;
  purchaseReturns: Prisma.Decimal;
  netPurchases: Prisma.Decimal;

  // Expenses & Operating Earnings
  operatingExpenses: Prisma.Decimal;
  netProfit: Prisma.Decimal;

  // Inventory
  inventoryValuation: Prisma.Decimal;
  totalQuantity: number;
  availableHandsets: number;
  quarantinedUnits: number;

  // Treasury & Working Capital
  cashOnHand: Prisma.Decimal;
  bankBalance: Prisma.Decimal;
  tradeReceivables: Prisma.Decimal;
  tradePayables: Prisma.Decimal;
};

export async function getBranchComparisonReport(filters: BranchComparisonFilters) {
  const branches = await prisma.branch.findMany({
    where: {
      companyId: filters.companyId,
      isActive: true,
      ...(filters.branchIds ? { id: { in: filters.branchIds } } : {}),
    },
    include: {
      warehouses: { select: { id: true, code: true, name: true, type: true } },
    },
    orderBy: { code: "asc" },
  });

  const branchMetrics: BranchMetrics[] = [];

  for (const branch of branches) {
    const warehouseIds = branch.warehouses.map((w) => w.id);

    // 1. Sales & Margins
    const salesAgg = await prisma.salesInvoice.aggregate({
      where: {
        companyId: filters.companyId,
        branchId: branch.id,
        status: "POSTED",
        reversalOfId: null,
        invoiceDate: { gte: filters.from, lte: filters.to },
      },
      _count: true,
      _sum: {
        subtotal: true,
        discountTotal: true,
        grandTotal: true,
        costTotal: true,
      },
    });

    const salesReturnsAgg = await prisma.stockReturn.aggregate({
      where: {
        companyId: filters.companyId,
        branchId: branch.id,
        returnType: "SALES_RETURN",
        status: { in: ["POSTED", "APPROVED"] },
        createdAt: { gte: filters.from, lte: filters.to },
      },
      _sum: { grandTotal: true },
    });

    const grossSales = salesAgg._sum.grandTotal || zero();
    const salesDiscounts = salesAgg._sum.discountTotal || zero();
    const salesReturns = salesReturnsAgg._sum.grandTotal || zero();
    const netSales = grossSales.minus(salesReturns);
    const costOfGoodsSold = salesAgg._sum.costTotal || zero();
    const grossProfit = netSales.minus(costOfGoodsSold);
    const grossProfitMarginPercent = netSales.gt(0)
      ? Number(grossProfit.dividedBy(netSales).times(100).toFixed(2))
      : 0;

    // 2. Purchases & Procurement
    const purchaseAgg = await prisma.purchaseReceipt.aggregate({
      where: {
        companyId: filters.companyId,
        branchId: branch.id,
        status: "POSTED",
        reversalOfId: null,
        receiptDate: { gte: filters.from, lte: filters.to },
      },
      _count: true,
      _sum: { grandTotal: true },
    });

    const purchaseReturnsAgg = await prisma.stockReturn.aggregate({
      where: {
        companyId: filters.companyId,
        branchId: branch.id,
        returnType: "PURCHASE_RETURN",
        status: { in: ["POSTED", "APPROVED"] },
        createdAt: { gte: filters.from, lte: filters.to },
      },
      _sum: { grandTotal: true },
    });

    const grossPurchases = purchaseAgg._sum.grandTotal || zero();
    const purchaseReturns = purchaseReturnsAgg._sum.grandTotal || zero();
    const netPurchases = grossPurchases.minus(purchaseReturns);

    // 3. Operating Expenses & Net Profit
    const expenseLinesAgg = await prisma.journalEntryLine.aggregate({
      where: {
        branchId: branch.id,
        account: { accountClass: "EXPENSE" },
        entry: {
          companyId: filters.companyId,
          status: { in: ["POSTED", "REVERSED"] },
          postingDate: { gte: filters.from, lte: filters.to },
        },
      },
      _sum: { baseDebit: true, baseCredit: true },
    });

    const operatingExpenses = (expenseLinesAgg._sum.baseDebit || zero()).minus(
      expenseLinesAgg._sum.baseCredit || zero()
    );
    const netProfit = grossProfit.minus(operatingExpenses);

    // 4. Inventory Valuation & Physical Units
    const stockAgg = await prisma.stockBalance.aggregate({
      where: {
        warehouseId: { in: warehouseIds },
      },
      _sum: { inventoryValue: true, quantity: true },
    });

    const availableHandsets = await prisma.physicalStockUnit.count({
      where: {
        currentBranchId: branch.id,
        status: "IN_STOCK",
      },
    });

    const quarantinedUnits = await prisma.physicalStockUnit.count({
      where: {
        currentBranchId: branch.id,
        status: "QUARANTINED",
      },
    });

    // 5. Cash, Bank, Receivables & Payables
    // Cash on Hand (GL 1000)
    const cashAgg = await prisma.journalEntryLine.aggregate({
      where: {
        branchId: branch.id,
        account: { code: "1000" },
        entry: {
          companyId: filters.companyId,
          status: { in: ["POSTED", "REVERSED"] },
        },
      },
      _sum: { baseDebit: true, baseCredit: true },
    });
    const cashOnHand = (cashAgg._sum.baseDebit || zero()).minus(cashAgg._sum.baseCredit || zero());

    // Bank (GL 1010)
    const bankAgg = await prisma.journalEntryLine.aggregate({
      where: {
        branchId: branch.id,
        account: { code: "1010" },
        entry: {
          companyId: filters.companyId,
          status: { in: ["POSTED", "REVERSED"] },
        },
      },
      _sum: { baseDebit: true, baseCredit: true },
    });
    const bankBalance = (bankAgg._sum.baseDebit || zero()).minus(bankAgg._sum.baseCredit || zero());

    // Receivables (GL 1100)
    const arAgg = await prisma.journalEntryLine.aggregate({
      where: {
        branchId: branch.id,
        account: { code: "1100" },
        entry: {
          companyId: filters.companyId,
          status: { in: ["POSTED", "REVERSED"] },
        },
      },
      _sum: { baseDebit: true, baseCredit: true },
    });
    const tradeReceivables = (arAgg._sum.baseDebit || zero()).minus(arAgg._sum.baseCredit || zero());

    // Payables (GL 2000)
    const apAgg = await prisma.journalEntryLine.aggregate({
      where: {
        branchId: branch.id,
        account: { code: "2000" },
        entry: {
          companyId: filters.companyId,
          status: { in: ["POSTED", "REVERSED"] },
        },
      },
      _sum: { baseDebit: true, baseCredit: true },
    });
    const tradePayables = (apAgg._sum.baseCredit || zero()).minus(apAgg._sum.baseDebit || zero());

    branchMetrics.push({
      branchId: branch.id,
      code: branch.code,
      name: branch.name,
      city: branch.city,
      type: branch.type,
      isHeadOffice: branch.type === "HEAD_OFFICE",
      salesInvoiceCount: salesAgg._count,
      grossSales,
      salesDiscounts,
      salesReturns,
      netSales,
      costOfGoodsSold,
      grossProfit,
      grossProfitMarginPercent,
      purchaseCount: purchaseAgg._count,
      grossPurchases,
      purchaseReturns,
      netPurchases,
      operatingExpenses,
      netProfit,
      inventoryValuation: stockAgg._sum.inventoryValue || zero(),
      totalQuantity: Number(stockAgg._sum.quantity || 0),
      availableHandsets,
      quarantinedUnits,
      cashOnHand,
      bankBalance,
      tradeReceivables,
      tradePayables,
    });
  }

  // Company-wide totals for comparison baseline
  const companyTotal = branchMetrics.reduce(
    (acc, b) => ({
      grossSales: acc.grossSales.plus(b.grossSales),
      netSales: acc.netSales.plus(b.netSales),
      costOfGoodsSold: acc.costOfGoodsSold.plus(b.costOfGoodsSold),
      grossProfit: acc.grossProfit.plus(b.grossProfit),
      operatingExpenses: acc.operatingExpenses.plus(b.operatingExpenses),
      netProfit: acc.netProfit.plus(b.netProfit),
      netPurchases: acc.netPurchases.plus(b.netPurchases),
      inventoryValuation: acc.inventoryValuation.plus(b.inventoryValuation),
      totalQuantity: acc.totalQuantity + b.totalQuantity,
      availableHandsets: acc.availableHandsets + b.availableHandsets,
      cashOnHand: acc.cashOnHand.plus(b.cashOnHand),
      bankBalance: acc.bankBalance.plus(b.bankBalance),
      tradeReceivables: acc.tradeReceivables.plus(b.tradeReceivables),
      tradePayables: acc.tradePayables.plus(b.tradePayables),
    }),
    {
      grossSales: zero(),
      netSales: zero(),
      costOfGoodsSold: zero(),
      grossProfit: zero(),
      operatingExpenses: zero(),
      netProfit: zero(),
      netPurchases: zero(),
      inventoryValuation: zero(),
      totalQuantity: 0,
      availableHandsets: 0,
      cashOnHand: zero(),
      bankBalance: zero(),
      tradeReceivables: zero(),
      tradePayables: zero(),
    }
  );

  return {
    branches: branchMetrics,
    companyTotal,
    period: {
      from: filters.from,
      to: filters.to,
    },
  };
}
