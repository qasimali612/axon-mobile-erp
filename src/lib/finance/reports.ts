import "server-only";

import { AccountClass, JournalStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { zero } from "@/lib/finance/money";

const ledgerStatuses = [JournalStatus.POSTED, JournalStatus.REVERSED];

export type FinanceFilters = {
  companyId: string;
  from: Date;
  to: Date;
  branchId?: string;
  branchIds?: string[];
  bankAccountId?: string;
  customerId?: string;
  supplierId?: string;
  salespersonId?: string;
};

function dimensionWhere(filters: Omit<FinanceFilters, "from" | "to">): Prisma.JournalEntryLineWhereInput {
  return {
    ...(filters.bankAccountId ? { bankAccountId: filters.bankAccountId } : {}),
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
    ...(filters.salespersonId ? { salespersonId: filters.salespersonId } : {}),
  };
}

function entryWhere(
  filters: Omit<FinanceFilters, "from" | "to">,
  date: Prisma.DateTimeFilter,
): Prisma.JournalEntryWhereInput {
  return {
    companyId: filters.companyId,
    status: { in: ledgerStatuses },
    postingDate: date,
    ...(filters.branchId
      ? { branchId: filters.branchId }
      : filters.branchIds
        ? { branchId: { in: filters.branchIds } }
        : {}),
  };
}

async function groupedBalances(
  filters: Omit<FinanceFilters, "from" | "to">,
  date: Prisma.DateTimeFilter,
) {
  return prisma.journalEntryLine.groupBy({
    by: ["accountId"],
    where: {
      ...dimensionWhere(filters),
      entry: entryWhere(filters, date),
    },
    _sum: { baseDebit: true, baseCredit: true },
  });
}

function signed(debit: Prisma.Decimal | null | undefined, credit: Prisma.Decimal | null | undefined) {
  return (debit || zero()).minus(credit || zero());
}

export async function getFinanceDashboard(filters: FinanceFilters) {
  const dimensions = {
    companyId: filters.companyId,
    branchId: filters.branchId,
    branchIds: filters.branchIds,
    bankAccountId: filters.bankAccountId,
    customerId: filters.customerId,
    supplierId: filters.supplierId,
    salespersonId: filters.salespersonId,
  };
  const [periodGroups, cumulativeGroups, accounts, bankFlow, recentJournals, flowLines] = await Promise.all([
    groupedBalances(dimensions, { gte: filters.from, lte: filters.to }),
    groupedBalances(dimensions, { lte: filters.to }),
    prisma.account.findMany({
      where: { companyId: filters.companyId, isActive: true },
      select: { id: true, code: true, name: true, accountClass: true, accountType: true, normalBalance: true },
    }),
    prisma.bankTransaction.aggregate({
      where: {
        companyId: filters.companyId,
        transactionDate: { gte: filters.from, lte: filters.to },
        ...(filters.bankAccountId ? { bankAccountId: filters.bankAccountId } : {}),
        ...(filters.branchId
          ? { bankAccount: { branchId: filters.branchId } }
          : filters.branchIds
            ? { bankAccount: { branchId: { in: filters.branchIds } } }
            : {}),
        journalEntry: { status: { in: ledgerStatuses } },
      },
      _sum: { deposit: true, withdrawal: true },
    }),
    prisma.journalEntry.findMany({
      where: entryWhere(dimensions, { gte: filters.from, lte: filters.to }),
      select: {
        id: true,
        voucherNumber: true,
        postingDate: true,
        voucherType: true,
        status: true,
        narration: true,
        totalDebit: true,
        branch: { select: { code: true, name: true } },
      },
      orderBy: [{ postingDate: "desc" }, { postedAt: "desc" }],
      take: 8,
    }),
    prisma.journalEntryLine.findMany({
      where: {
        ...dimensionWhere(dimensions),
        entry: entryWhere(dimensions, { gte: filters.from, lte: filters.to }),
      },
      select: {
        baseDebit: true,
        baseCredit: true,
        account: { select: { accountClass: true } },
        entry: { select: { postingDate: true } },
      },
      orderBy: { entry: { postingDate: "asc" } },
    }),
  ]);

  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const periodMap = new Map(periodGroups.map((group) => [group.accountId, signed(group._sum.baseDebit, group._sum.baseCredit)]));
  const cumulativeMap = new Map(cumulativeGroups.map((group) => [group.accountId, signed(group._sum.baseDebit, group._sum.baseCredit)]));
  const sumAccounts = (
    source: Map<string, Prisma.Decimal>,
    predicate: (account: (typeof accounts)[number]) => boolean,
    creditNatural = false,
  ) =>
    accounts.reduce((total, account) => {
      if (!predicate(account)) return total;
      const value = source.get(account.id) || zero();
      return total.plus(creditNatural ? value.negated() : value);
    }, zero());

  const revenue = sumAccounts(periodMap, (account) => account.accountClass === AccountClass.REVENUE, true);
  const cogs = sumAccounts(periodMap, (account) => account.accountClass === AccountClass.COGS);
  const expenses = sumAccounts(periodMap, (account) => account.accountClass === AccountClass.EXPENSE);
  const grossProfit = revenue.minus(cogs);
  const netProfit = grossProfit.minus(expenses);
  const cashBalance = sumAccounts(cumulativeMap, (account) => ["CASH", "BANK"].includes(account.accountType));
  const receivables = sumAccounts(cumulativeMap, (account) =>
    ["ACCOUNTS_RECEIVABLE", "INCENTIVE_RECEIVABLE", "REBATE_RECEIVABLE"].includes(account.accountType),
  );
  const payables = sumAccounts(
    cumulativeMap,
    (account) => ["ACCOUNTS_PAYABLE", "INCENTIVE_PAYABLE", "REBATE_PAYABLE", "TAX_PAYABLE"].includes(account.accountType),
    true,
  );
  const assets = sumAccounts(cumulativeMap, (account) => account.accountClass === AccountClass.ASSET);
  const liabilities = sumAccounts(cumulativeMap, (account) => account.accountClass === AccountClass.LIABILITY, true);
  const equity = sumAccounts(cumulativeMap, (account) => account.accountClass === AccountClass.EQUITY, true);
  const cumulativeRevenue = sumAccounts(cumulativeMap, (account) => account.accountClass === AccountClass.REVENUE, true);
  const cumulativeCogs = sumAccounts(cumulativeMap, (account) => account.accountClass === AccountClass.COGS);
  const cumulativeExpenses = sumAccounts(cumulativeMap, (account) => account.accountClass === AccountClass.EXPENSE);
  const cumulativeEarnings = cumulativeRevenue.minus(cumulativeCogs).minus(cumulativeExpenses);
  const balanceDifference = assets.minus(liabilities.plus(equity).plus(cumulativeEarnings));

  const trend = new Map<string, { revenue: Prisma.Decimal; cogs: Prisma.Decimal; expenses: Prisma.Decimal }>();
  for (const line of flowLines) {
    const key = line.entry.postingDate.toISOString().slice(0, 7);
    const item = trend.get(key) || { revenue: zero(), cogs: zero(), expenses: zero() };
    const value = signed(line.baseDebit, line.baseCredit);
    if (line.account.accountClass === AccountClass.REVENUE) item.revenue = item.revenue.minus(value);
    if (line.account.accountClass === AccountClass.COGS) item.cogs = item.cogs.plus(value);
    if (line.account.accountClass === AccountClass.EXPENSE) item.expenses = item.expenses.plus(value);
    trend.set(key, item);
  }

  const accountActivity = periodGroups
    .map((group) => {
      const account = accountMap.get(group.accountId);
      if (!account) return null;
      const movement = signed(group._sum.baseDebit, group._sum.baseCredit);
      return {
        ...account,
        debit: group._sum.baseDebit || zero(),
        credit: group._sum.baseCredit || zero(),
        movement: account.normalBalance === "CREDIT" ? movement.negated() : movement,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => b.movement.abs().comparedTo(a.movement.abs()))
    .slice(0, 8);

  return {
    metrics: {
      cashBalance,
      receivables,
      payables,
      revenue,
      grossProfit,
      expenses,
      netProfit,
      bankInflows: bankFlow._sum.deposit || zero(),
      bankOutflows: bankFlow._sum.withdrawal || zero(),
    },
    balanceSheetCheck: {
      assets,
      liabilities,
      equity,
      cumulativeEarnings,
      difference: balanceDifference,
      balanced: balanceDifference.abs().lte(new Prisma.Decimal("0.0001")),
    },
    trend: [...trend.entries()].map(([month, values]) => ({ month, ...values })),
    accountActivity,
    recentJournals,
  };
}

export async function getTrialBalance(filters: FinanceFilters) {
  const dimensions = {
    companyId: filters.companyId,
    branchId: filters.branchId,
    branchIds: filters.branchIds,
    bankAccountId: filters.bankAccountId,
    customerId: filters.customerId,
    supplierId: filters.supplierId,
    salespersonId: filters.salespersonId,
  };
  const dayBefore = new Date(filters.from.getTime() - 24 * 60 * 60 * 1000);
  const [opening, movement, accounts] = await Promise.all([
    groupedBalances(dimensions, { lte: dayBefore }),
    groupedBalances(dimensions, { gte: filters.from, lte: filters.to }),
    prisma.account.findMany({
      where: { companyId: filters.companyId, isActive: true },
      select: { id: true, code: true, name: true, accountClass: true },
      orderBy: { code: "asc" },
    }),
  ]);
  const openingMap = new Map(opening.map((group) => [group.accountId, signed(group._sum.baseDebit, group._sum.baseCredit)]));
  const movementMap = new Map(
    movement.map((group) => [
      group.accountId,
      {
        debit: group._sum.baseDebit || zero(),
        credit: group._sum.baseCredit || zero(),
      },
    ]),
  );
  const rows = accounts
    .map((account) => {
      const openingBalance = openingMap.get(account.id) || zero();
      const current = movementMap.get(account.id) || { debit: zero(), credit: zero() };
      const closing = openingBalance.plus(current.debit).minus(current.credit);
      return {
        ...account,
        openingDebit: openingBalance.gt(0) ? openingBalance : zero(),
        openingCredit: openingBalance.lt(0) ? openingBalance.abs() : zero(),
        periodDebit: current.debit,
        periodCredit: current.credit,
        closingDebit: closing.gt(0) ? closing : zero(),
        closingCredit: closing.lt(0) ? closing.abs() : zero(),
      };
    })
    .filter((row) =>
      [row.openingDebit, row.openingCredit, row.periodDebit, row.periodCredit, row.closingDebit, row.closingCredit].some((value) => !value.isZero()),
    );
  return {
    rows,
    totals: rows.reduce(
      (result, row) => ({
        openingDebit: result.openingDebit.plus(row.openingDebit),
        openingCredit: result.openingCredit.plus(row.openingCredit),
        periodDebit: result.periodDebit.plus(row.periodDebit),
        periodCredit: result.periodCredit.plus(row.periodCredit),
        closingDebit: result.closingDebit.plus(row.closingDebit),
        closingCredit: result.closingCredit.plus(row.closingCredit),
      }),
      {
        openingDebit: zero(),
        openingCredit: zero(),
        periodDebit: zero(),
        periodCredit: zero(),
        closingDebit: zero(),
        closingCredit: zero(),
      },
    ),
  };
}

export async function getFinancialStatements(filters: FinanceFilters) {
  const dimensions = {
    companyId: filters.companyId,
    branchId: filters.branchId,
    branchIds: filters.branchIds,
    bankAccountId: filters.bankAccountId,
    customerId: filters.customerId,
    supplierId: filters.supplierId,
    salespersonId: filters.salespersonId,
  };
  const [periodGroups, cumulativeGroups, accounts, bankTransactions] = await Promise.all([
    groupedBalances(dimensions, { gte: filters.from, lte: filters.to }),
    groupedBalances(dimensions, { lte: filters.to }),
    prisma.account.findMany({
      where: { companyId: filters.companyId, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        accountClass: true,
        accountType: true,
        group: { select: { code: true, name: true, statementSection: true, sequence: true } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.bankTransaction.findMany({
      where: {
        companyId: filters.companyId,
        transactionDate: { gte: filters.from, lte: filters.to },
        ...(filters.bankAccountId ? { bankAccountId: filters.bankAccountId } : {}),
        ...(filters.branchId
          ? { bankAccount: { branchId: filters.branchId } }
          : filters.branchIds
            ? { bankAccount: { branchId: { in: filters.branchIds } } }
            : {}),
        journalEntry: { status: { in: ledgerStatuses } },
      },
      select: {
        deposit: true,
        withdrawal: true,
        journalEntry: { select: { cashFlowActivity: true } },
      },
    }),
  ]);
  const periodMap = new Map(periodGroups.map((group) => [group.accountId, signed(group._sum.baseDebit, group._sum.baseCredit)]));
  const cumulativeMap = new Map(cumulativeGroups.map((group) => [group.accountId, signed(group._sum.baseDebit, group._sum.baseCredit)]));
  const naturalAmount = (accountClass: AccountClass, amount: Prisma.Decimal) =>
    ([AccountClass.LIABILITY, AccountClass.EQUITY, AccountClass.REVENUE] as AccountClass[]).includes(accountClass) ? amount.negated() : amount;
  const profitAndLoss = accounts
    .filter((account) => ([AccountClass.REVENUE, AccountClass.COGS, AccountClass.EXPENSE] as AccountClass[]).includes(account.accountClass))
    .map((account) => ({ ...account, amount: naturalAmount(account.accountClass, periodMap.get(account.id) || zero()) }))
    .filter((row) => !row.amount.isZero());
  const balanceSheet = accounts
    .filter((account) => ([AccountClass.ASSET, AccountClass.LIABILITY, AccountClass.EQUITY] as AccountClass[]).includes(account.accountClass))
    .map((account) => ({ ...account, amount: naturalAmount(account.accountClass, cumulativeMap.get(account.id) || zero()) }))
    .filter((row) => !row.amount.isZero());
  const total = (rows: typeof profitAndLoss, classes: AccountClass[]) =>
    rows.filter((row) => classes.includes(row.accountClass)).reduce((sum, row) => sum.plus(row.amount), zero());
  const revenue = total(profitAndLoss, [AccountClass.REVENUE]);
  const cogs = total(profitAndLoss, [AccountClass.COGS]);
  const expenses = total(profitAndLoss, [AccountClass.EXPENSE]);
  const grossProfit = revenue.minus(cogs);
  const netProfit = grossProfit.minus(expenses);
  const assets = total(balanceSheet as typeof profitAndLoss, [AccountClass.ASSET]);
  const liabilities = total(balanceSheet as typeof profitAndLoss, [AccountClass.LIABILITY]);
  const equity = total(balanceSheet as typeof profitAndLoss, [AccountClass.EQUITY]);
  const cumulativeProfitRows = accounts
    .filter((account) => ([AccountClass.REVENUE, AccountClass.COGS, AccountClass.EXPENSE] as AccountClass[]).includes(account.accountClass))
    .map((account) => ({ ...account, amount: naturalAmount(account.accountClass, cumulativeMap.get(account.id) || zero()) }));
  const cumulativeEarnings = total(cumulativeProfitRows, [AccountClass.REVENUE])
    .minus(total(cumulativeProfitRows, [AccountClass.COGS]))
    .minus(total(cumulativeProfitRows, [AccountClass.EXPENSE]));
  const cashFlow = bankTransactions.reduce(
    (result, transaction) => {
      const amount = transaction.deposit.minus(transaction.withdrawal);
      const key = transaction.journalEntry.cashFlowActivity;
      result[key] = result[key].plus(amount);
      return result;
    },
    {
      NONE: zero(),
      OPERATING: zero(),
      INVESTING: zero(),
      FINANCING: zero(),
    },
  );
  return {
    profitAndLoss,
    balanceSheet,
    totals: {
      revenue,
      cogs,
      grossProfit,
      expenses,
      netProfit,
      assets,
      liabilities,
      equity,
      cumulativeEarnings,
      balanceDifference: assets.minus(liabilities.plus(equity).plus(cumulativeEarnings)),
    },
    cashFlow: {
      ...cashFlow,
      netMovement: cashFlow.OPERATING.plus(cashFlow.INVESTING).plus(cashFlow.FINANCING).plus(cashFlow.NONE),
    },
  };
}
