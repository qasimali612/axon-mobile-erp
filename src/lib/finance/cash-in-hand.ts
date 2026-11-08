import "server-only";

import { JournalStatus, Prisma } from "@prisma/client";
import { zero } from "@/lib/finance/money";
import { prisma } from "@/lib/prisma";

const ledgerStatuses = [JournalStatus.POSTED, JournalStatus.REVERSED];

export type CashInHandFilters = {
  companyId: string;
  from: Date;
  to: Date;
  branchId?: string;
  branchIds?: string[];
  accountId?: string;
};

export async function getCashInHandReport(filters: CashInHandFilters) {
  // 1. Identify all cash on hand accounts for the company
  const cashAccounts = await prisma.account.findMany({
    where: {
      companyId: filters.companyId,
      isActive: true,
      OR: [
        { accountType: "CASH" },
        { code: "1000" },
        { name: { contains: "Cash", mode: "insensitive" } },
      ],
    },
    select: { id: true, code: true, name: true, accountType: true },
    orderBy: { code: "asc" },
  });

  const targetAccountIds = filters.accountId
    ? [filters.accountId]
    : cashAccounts.map((a) => a.id);

  if (!targetAccountIds.length) {
    return {
      accounts: [],
      periodSummary: {
        openingBalance: zero(),
        totalInflows: zero(),
        totalOutflows: zero(),
        netMovement: zero(),
        closingBalance: zero(),
      },
      sourceBreakdown: {
        inflows: [],
        outflows: [],
      },
      movements: [],
    };
  }

  const branchFilter: Prisma.JournalEntryWhereInput = filters.branchId
    ? { branchId: filters.branchId }
    : filters.branchIds
      ? { branchId: { in: filters.branchIds } }
      : {};

  // 2. Compute Opening Balance (All posted activity strictly before filters.from)
  const openingAgg = await prisma.journalEntryLine.aggregate({
    where: {
      accountId: { in: targetAccountIds },
      entry: {
        companyId: filters.companyId,
        status: { in: ledgerStatuses },
        postingDate: { lt: filters.from },
        ...branchFilter,
      },
    },
    _sum: { baseDebit: true, baseCredit: true },
  });

  const openingDebit = openingAgg._sum.baseDebit || zero();
  const openingCredit = openingAgg._sum.baseCredit || zero();
  const openingBalance = openingDebit.minus(openingCredit);

  // 3. Query all lines during the selected period
  const lines = await prisma.journalEntryLine.findMany({
    where: {
      accountId: { in: targetAccountIds },
      entry: {
        companyId: filters.companyId,
        status: { in: ledgerStatuses },
        postingDate: { gte: filters.from, lte: filters.to },
        ...branchFilter,
      },
    },
    select: {
      id: true,
      baseDebit: true,
      baseCredit: true,
      description: true,
      account: { select: { code: true, name: true } },
      customer: { select: { code: true, name: true } },
      supplier: { select: { code: true, name: true } },
      entry: {
        select: {
          id: true,
          voucherNumber: true,
          voucherType: true,
          postingDate: true,
          postedAt: true,
          narration: true,
          sourceModule: true,
          sourceDocumentType: true,
          sourceDocumentNumber: true,
          referenceDocument: true,
          branch: { select: { id: true, code: true, name: true } },
          preparedBy: { select: { fullName: true } },
        },
      },
    },
    orderBy: [
      { entry: { postingDate: "asc" } },
      { entry: { postedAt: "asc" } },
      { id: "asc" },
    ],
  });

  let running = openingBalance;
  let totalInflows = zero();
  let totalOutflows = zero();

  const sourceMapInflows = new Map<string, { label: string; count: number; total: Prisma.Decimal }>();
  const sourceMapOutflows = new Map<string, { label: string; count: number; total: Prisma.Decimal }>();

  function registerSource(
    map: Map<string, { label: string; count: number; total: Prisma.Decimal }>,
    key: string,
    label: string,
    amount: Prisma.Decimal
  ) {
    const existing = map.get(key) || { label, count: 0, total: zero() };
    existing.count += 1;
    existing.total = existing.total.plus(amount);
    map.set(key, existing);
  }

  const movements = lines.map((line) => {
    const cashIn = line.baseDebit || zero();
    const cashOut = line.baseCredit || zero();

    totalInflows = totalInflows.plus(cashIn);
    totalOutflows = totalOutflows.plus(cashOut);
    running = running.plus(cashIn).minus(cashOut);

    const party = line.customer
      ? `Customer: ${line.customer.name}`
      : line.supplier
        ? `Supplier: ${line.supplier.name}`
        : null;

    const moduleKey = line.entry.sourceModule?.toUpperCase() || "MANUAL";
    const moduleLabel =
      moduleKey === "SALES"
        ? "Sales & POS Receipts"
        : moduleKey === "PURCHASE"
          ? "Procurement & Cash Purchases"
          : moduleKey === "EXPENSE"
            ? "Operating Expenses"
            : moduleKey === "PAYMENT"
              ? "Customer/Supplier Payments"
              : moduleKey === "INCENTIVE"
                ? "Vendor Incentives"
                : moduleKey === "BANK"
                  ? "Bank Cash Transfers"
                  : "General Journal Vouchers";

    if (cashIn.gt(0)) {
      registerSource(sourceMapInflows, moduleKey, moduleLabel, cashIn);
    }
    if (cashOut.gt(0)) {
      registerSource(sourceMapOutflows, moduleKey, moduleLabel, cashOut);
    }

    return {
      id: line.id,
      entryId: line.entry.id,
      voucherNumber: line.entry.voucherNumber,
      voucherType: line.entry.voucherType,
      postingDate: line.entry.postingDate,
      postedAt: line.entry.postedAt,
      narration: line.entry.narration,
      description: line.description,
      sourceModule: line.entry.sourceModule,
      sourceDocumentNumber: line.entry.sourceDocumentNumber,
      referenceDocument: line.entry.referenceDocument,
      branch: line.entry.branch,
      preparedBy: line.entry.preparedBy.fullName,
      accountName: `${line.account.code} · ${line.account.name}`,
      party,
      cashIn,
      cashOut,
      runningBalance: running,
    };
  });

  const netMovement = totalInflows.minus(totalOutflows);
  const closingBalance = openingBalance.plus(netMovement);

  return {
    accounts: cashAccounts,
    periodSummary: {
      openingBalance,
      totalInflows,
      totalOutflows,
      netMovement,
      closingBalance,
    },
    sourceBreakdown: {
      inflows: Array.from(sourceMapInflows.values()).sort((a, b) => b.total.comparedTo(a.total)),
      outflows: Array.from(sourceMapOutflows.values()).sort((a, b) => b.total.comparedTo(a.total)),
    },
    movements,
  };
}

