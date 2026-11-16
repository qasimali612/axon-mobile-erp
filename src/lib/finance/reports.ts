import "server-only";

import { AccountClass, JournalStatus, NormalBalance, Prisma } from "@prisma/client";
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
        account: { select: { code: true, accountClass: true } },
        entry: { select: { postingDate: true } },
      },
      orderBy: { entry: { postingDate: "asc" } },
    }),
  ]);

  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const periodMap = new Map<string, Prisma.Decimal>();
  for (const group of periodGroups) {
    if (group.accountId) periodMap.set(group.accountId, signed(group._sum.baseDebit, group._sum.baseCredit));
  }
  const cumulativeMap = new Map<string, Prisma.Decimal>();
  for (const group of cumulativeGroups) {
    if (group.accountId) cumulativeMap.set(group.accountId, signed(group._sum.baseDebit, group._sum.baseCredit));
  }
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

  // Segregated P&L metrics per double-entry accounting standards
  const netSalesRevenue = sumAccounts(
    periodMap,
    (account) => account.accountType === "SALES_REVENUE" || (account.accountClass === AccountClass.REVENUE && account.code === "4000"),
    true,
  );
  const otherOperatingIncome = sumAccounts(
    periodMap,
    (account) => ["INCENTIVE_INCOME", "REBATE_INCOME"].includes(account.accountType),
    true,
  );
  const inventoryAdjustmentGain = sumAccounts(
    periodMap,
    (account) => account.accountType === "INVENTORY_ADJUSTMENT_GAIN" || account.code === "4030",
    true,
  );
  const cogs = sumAccounts(periodMap, (account) => account.accountClass === AccountClass.COGS);
  const grossProfit = netSalesRevenue.minus(cogs);
  const grossMarginPercent = netSalesRevenue.gt(0)
    ? grossProfit.dividedBy(netSalesRevenue).times(100).toDecimalPlaces(2)
    : zero();

  const operatingExpenses = sumAccounts(
    periodMap,
    (account) =>
      account.accountClass === AccountClass.EXPENSE &&
      !["INVENTORY_ADJUSTMENT_LOSS", "ASSET_DISPOSAL"].includes(account.accountType),
  );
  const operatingProfit = grossProfit.minus(operatingExpenses);

  const otherExpenses = sumAccounts(
    periodMap,
    (account) => ["INVENTORY_ADJUSTMENT_LOSS", "ASSET_DISPOSAL"].includes(account.accountType),
  );
  // Opening stock adjustments in Account 4030 are balance sheet equity reserves and MUST NOT be counted as operating other income!
  const otherIncome = otherOperatingIncome;
  const netProfit = operatingProfit.plus(otherIncome).minus(otherExpenses);

  // Asset & balance metrics
  const cashOnHand = sumAccounts(cumulativeMap, (account) => account.accountType === "CASH");
  const bankBalance = sumAccounts(cumulativeMap, (account) => account.accountType === "BANK");
  const cashBalance = cashOnHand.plus(bankBalance);
  const merchandiseInventory = sumAccounts(cumulativeMap, (account) => account.accountType === "INVENTORY" || account.code === "1200");
  const tradeReceivables = sumAccounts(cumulativeMap, (account) => account.accountType === "ACCOUNTS_RECEIVABLE");
  const otherReceivables = sumAccounts(cumulativeMap, (account) =>
    ["INCENTIVE_RECEIVABLE", "REBATE_RECEIVABLE", "TAX_RECEIVABLE"].includes(account.accountType),
  );
  const receivables = tradeReceivables.plus(otherReceivables);

  const tradePayables = sumAccounts(
    cumulativeMap,
    (account) => account.accountType === "ACCOUNTS_PAYABLE",
    true,
  );
  const otherPayables = sumAccounts(
    cumulativeMap,
    (account) => ["INCENTIVE_PAYABLE", "REBATE_PAYABLE", "TAX_PAYABLE"].includes(account.accountType),
    true,
  );
  const payables = tradePayables.plus(otherPayables);

  const currentAssets = cashBalance.plus(merchandiseInventory).plus(receivables);
  const currentLiabilities = payables;
  const workingCapital = currentAssets.minus(currentLiabilities);

  const assets = sumAccounts(cumulativeMap, (account) => account.accountClass === AccountClass.ASSET);
  const liabilities = sumAccounts(cumulativeMap, (account) => account.accountClass === AccountClass.LIABILITY, true);
  const equity = sumAccounts(cumulativeMap, (account) => account.accountClass === AccountClass.EQUITY, true);
  const cumulativeRevenue = sumAccounts(cumulativeMap, (account) => account.accountClass === AccountClass.REVENUE && account.code !== "4030", true);
  const cumulativeCogs = sumAccounts(cumulativeMap, (account) => account.accountClass === AccountClass.COGS);
  const cumulativeExpenses = sumAccounts(cumulativeMap, (account) => account.accountClass === AccountClass.EXPENSE);
  const cumulativeEarnings = cumulativeRevenue.minus(cumulativeCogs).minus(cumulativeExpenses);
  const openingStockReserve = sumAccounts(cumulativeMap, (account) => account.code === "4030", true);
  const totalEquity = equity.plus(openingStockReserve);
  const balanceDifference = assets.minus(liabilities.plus(totalEquity).plus(cumulativeEarnings));

  const trend = new Map<string, { revenue: Prisma.Decimal; cogs: Prisma.Decimal; expenses: Prisma.Decimal }>();
  for (const line of flowLines) {
    const key = line.entry.postingDate.toISOString().slice(0, 7);
    const item = trend.get(key) || { revenue: zero(), cogs: zero(), expenses: zero() };
    const value = signed(line.baseDebit, line.baseCredit);
    if (line.account.accountClass === AccountClass.REVENUE && line.account.code !== "4030") item.revenue = item.revenue.minus(value);
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
      cashOnHand,
      bankBalance,
      cashBalance,
      merchandiseInventory,
      tradeReceivables,
      receivables,
      tradePayables,
      payables,
      workingCapital,
      netSalesRevenue,
      revenue: netSalesRevenue,
      cogs,
      grossProfit,
      grossMarginPercent,
      operatingExpenses,
      operatingProfit,
      inventoryAdjustmentGain,
      openingStockReserve,
      otherOperatingIncome,
      otherIncome,
      otherExpenses,
      expenses: operatingExpenses,
      netProfit,
      bankInflows: bankFlow._sum.deposit || zero(),
      bankOutflows: bankFlow._sum.withdrawal || zero(),
    },
    balanceSheetCheck: {
      assets,
      liabilities,
      equity: totalEquity,
      openingStockReserve,
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
  const [opening, movement, accounts] = await Promise.all([
    groupedBalances(dimensions, { lt: filters.from }),
    groupedBalances(dimensions, { gte: filters.from, lte: filters.to }),
    prisma.account.findMany({
      where: { companyId: filters.companyId, isActive: true },
      select: { id: true, code: true, name: true, accountClass: true, accountType: true, normalBalance: true },
      orderBy: { code: "asc" },
    }),
  ]);
  const openingMap = new Map<string, Prisma.Decimal>();
  for (const group of opening) {
    if (group.accountId) openingMap.set(group.accountId, signed(group._sum.baseDebit, group._sum.baseCredit));
  }
  const movementMap = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
  for (const group of movement) {
    if (group.accountId) {
      movementMap.set(group.accountId, {
        debit: group._sum.baseDebit || zero(),
        credit: group._sum.baseCredit || zero(),
      });
    }
  }
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
  const [periodGroups, cumulativeGroups, accounts, bankTransactions, cashLines] = await Promise.all([
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
        normalBalance: true,
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
    prisma.journalEntryLine.findMany({
      where: {
        account: { companyId: filters.companyId, accountType: "CASH" },
        entry: entryWhere(dimensions, { gte: filters.from, lte: filters.to }),
      },
      select: {
        baseDebit: true,
        baseCredit: true,
        entry: { select: { cashFlowActivity: true } },
      },
    }),
  ]);
  const periodMap = new Map<string, Prisma.Decimal>();
  for (const group of periodGroups) {
    if (group.accountId) periodMap.set(group.accountId, signed(group._sum.baseDebit, group._sum.baseCredit));
  }
  const cumulativeMap = new Map<string, Prisma.Decimal>();
  for (const group of cumulativeGroups) {
    if (group.accountId) cumulativeMap.set(group.accountId, signed(group._sum.baseDebit, group._sum.baseCredit));
  }
  const naturalAmount = (accountClass: AccountClass, amount: Prisma.Decimal) =>
    ([AccountClass.LIABILITY, AccountClass.EQUITY, AccountClass.REVENUE] as AccountClass[]).includes(accountClass) ? amount.negated() : amount;

  const profitAndLoss = accounts
    .filter(
      (account) =>
        ([AccountClass.REVENUE, AccountClass.COGS, AccountClass.EXPENSE] as AccountClass[]).includes(account.accountClass) &&
        account.code !== "4030",
    )
    .map((account) => ({ ...account, amount: naturalAmount(account.accountClass, periodMap.get(account.id) || zero()) }))
    .filter((row) => !row.amount.isZero());

  const openingStockAccount = accounts.find((a) => a.code === "4030");
  const openingStockReserve = openingStockAccount
    ? naturalAmount(AccountClass.EQUITY, cumulativeMap.get(openingStockAccount.id) || zero())
    : zero();

  const balanceSheet = [
    ...accounts
      .filter((account) => ([AccountClass.ASSET, AccountClass.LIABILITY, AccountClass.EQUITY] as AccountClass[]).includes(account.accountClass))
      .map((account) => ({ ...account, amount: naturalAmount(account.accountClass, cumulativeMap.get(account.id) || zero()) })),
    ...(openingStockAccount && !openingStockReserve.isZero()
      ? [
          {
            id: openingStockAccount.id,
            code: "3200",
            name: "Opening Stock Equity Reserve",
            accountClass: AccountClass.EQUITY,
            accountType: "OPENING_BALANCE_EQUITY",
            normalBalance: NormalBalance.CREDIT,
            group: { code: "300", name: "Equity", statementSection: "Equity", sequence: 300 },
            amount: openingStockReserve,
          },
        ]
      : []),
  ].filter((row) => !row.amount.isZero());

  // Segregated multi-step calculations
  const salesRevenueAccounts = profitAndLoss.filter(
    (r) => r.accountType === "SALES_REVENUE" || (r.accountClass === AccountClass.REVENUE && r.code === "4000"),
  );
  const salesRevenue = salesRevenueAccounts.reduce((sum, r) => sum.plus(r.amount), zero());

  const cogsAccounts = profitAndLoss.filter((r) => r.accountClass === AccountClass.COGS);
  const cogs = cogsAccounts.reduce((sum, r) => sum.plus(r.amount), zero());
  const grossProfit = salesRevenue.minus(cogs);

  const operatingExpenseAccounts = profitAndLoss.filter(
    (r) => r.accountClass === AccountClass.EXPENSE && !["INVENTORY_ADJUSTMENT_LOSS", "ASSET_DISPOSAL"].includes(r.accountType),
  );
  const operatingExpenses = operatingExpenseAccounts.reduce((sum, r) => sum.plus(r.amount), zero());
  const operatingProfit = grossProfit.minus(operatingExpenses);

  const otherIncomeAccounts = profitAndLoss.filter(
    (r) =>
      r.accountClass === AccountClass.REVENUE &&
      ["INCENTIVE_INCOME", "REBATE_INCOME"].includes(r.accountType),
  );
  const otherIncome = otherIncomeAccounts.reduce((sum, r) => sum.plus(r.amount), zero());

  const otherExpenseAccounts = profitAndLoss.filter(
    (r) => r.accountClass === AccountClass.EXPENSE && ["INVENTORY_ADJUSTMENT_LOSS", "ASSET_DISPOSAL"].includes(r.accountType),
  );
  const otherExpenses = otherExpenseAccounts.reduce((sum, r) => sum.plus(r.amount), zero());
  const netProfit = operatingProfit.plus(otherIncome).minus(otherExpenses);

  // Balance sheet classification
  const currentAssetTypes = [
    "CASH",
    "BANK",
    "ACCOUNTS_RECEIVABLE",
    "INVENTORY",
    "TAX_RECEIVABLE",
    "INCENTIVE_RECEIVABLE",
    "REBATE_RECEIVABLE",
  ];
  const currentAssetsList = balanceSheet.filter(
    (r) => r.accountClass === AccountClass.ASSET && currentAssetTypes.includes(r.accountType),
  );
  const currentAssets = currentAssetsList.reduce((sum, r) => sum.plus(r.amount), zero());

  const nonCurrentAssetsList = balanceSheet.filter(
    (r) => r.accountClass === AccountClass.ASSET && !currentAssetTypes.includes(r.accountType),
  );
  const nonCurrentAssets = nonCurrentAssetsList.reduce((sum, r) => sum.plus(r.amount), zero());
  const assets = currentAssets.plus(nonCurrentAssets);

  const currentLiabilityTypes = ["ACCOUNTS_PAYABLE", "INCENTIVE_PAYABLE", "REBATE_PAYABLE", "TAX_PAYABLE"];
  const currentLiabilitiesList = balanceSheet.filter(
    (r) => r.accountClass === AccountClass.LIABILITY && currentLiabilityTypes.includes(r.accountType),
  );
  const currentLiabilities = currentLiabilitiesList.reduce((sum, r) => sum.plus(r.amount), zero());

  const longTermLiabilitiesList = balanceSheet.filter(
    (r) => r.accountClass === AccountClass.LIABILITY && !currentLiabilityTypes.includes(r.accountType),
  );
  const longTermLiabilities = longTermLiabilitiesList.reduce((sum, r) => sum.plus(r.amount), zero());
  const liabilities = currentLiabilities.plus(longTermLiabilities);

  const equityList = balanceSheet.filter((r) => r.accountClass === AccountClass.EQUITY);
  const equity = equityList.reduce((sum, r) => sum.plus(r.amount), zero());

  const cumulativeProfitRows = accounts
    .filter(
      (account) =>
        ([AccountClass.REVENUE, AccountClass.COGS, AccountClass.EXPENSE] as AccountClass[]).includes(account.accountClass) &&
        account.code !== "4030",
    )
    .map((account) => ({ ...account, amount: naturalAmount(account.accountClass, cumulativeMap.get(account.id) || zero()) }));

  const cumulativeEarnings = cumulativeProfitRows
    .filter((r) => r.accountClass === AccountClass.REVENUE)
    .reduce((s, r) => s.plus(r.amount), zero())
    .minus(
      cumulativeProfitRows
        .filter((r) => r.accountClass === AccountClass.COGS)
        .reduce((s, r) => s.plus(r.amount), zero()),
    )
    .minus(
      cumulativeProfitRows
        .filter((r) => r.accountClass === AccountClass.EXPENSE)
        .reduce((s, r) => s.plus(r.amount), zero()),
    );

  const balanceDifference = assets.minus(liabilities.plus(equity).plus(cumulativeEarnings));

  const cashFlow = {
    NONE: zero(),
    OPERATING: zero(),
    INVESTING: zero(),
    FINANCING: zero(),
  };

  for (const transaction of bankTransactions) {
    const amount = transaction.deposit.minus(transaction.withdrawal);
    const key = transaction.journalEntry.cashFlowActivity;
    cashFlow[key] = cashFlow[key].plus(amount);
  }

  for (const cashLine of cashLines) {
    const amount = (cashLine.baseDebit || zero()).minus(cashLine.baseCredit || zero());
    const key = cashLine.entry.cashFlowActivity;
    cashFlow[key] = cashFlow[key].plus(amount);
  }

  return {
    profitAndLoss,
    balanceSheet,
    multiStepPnl: {
      salesRevenueAccounts,
      salesRevenue,
      cogsAccounts,
      cogs,
      grossProfit,
      operatingExpenseAccounts,
      operatingExpenses,
      operatingProfit,
      otherIncomeAccounts,
      otherIncome,
      otherExpenseAccounts,
      otherExpenses,
      netProfit,
      openingStockReserve,
    },
    classifiedBalanceSheet: {
      currentAssetsList,
      currentAssets,
      nonCurrentAssetsList,
      nonCurrentAssets,
      totalAssets: assets,
      currentLiabilitiesList,
      currentLiabilities,
      longTermLiabilitiesList,
      longTermLiabilities,
      totalLiabilities: liabilities,
      equityList,
      equity,
      openingStockReserve,
      cumulativeEarnings,
      totalEquityAndLiabilities: liabilities.plus(equity).plus(cumulativeEarnings),
      balanceDifference,
    },
    totals: {
      revenue: salesRevenue,
      netSalesRevenue: salesRevenue,
      totalRevenue: salesRevenue.plus(otherIncome),
      cogs,
      grossProfit,
      expenses: operatingExpenses,
      operatingExpenses,
      operatingProfit,
      otherIncome,
      otherExpenses,
      openingStockReserve,
      netProfit,
      assets,
      currentAssets,
      nonCurrentAssets,
      liabilities,
      currentLiabilities,
      longTermLiabilities,
      equity,
      cumulativeEarnings,
      balanceDifference,
    },
    cashFlow: {
      ...cashFlow,
      netMovement: cashFlow.OPERATING.plus(cashFlow.INVESTING).plus(cashFlow.FINANCING).plus(cashFlow.NONE),
    },
  };
}
