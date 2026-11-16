import Link from "next/link";
import { ArrowLeft, ArrowRight, Banknote, CheckCircle2, FileSpreadsheet, Printer, Scale, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { permittedBranchIds, requirePagePermission } from "@/lib/auth";
import { getFinancialStatements } from "@/lib/finance/reports";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function FinancialStatementsPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await requirePagePermission("FINANCIAL_REPORTS_VIEW");
  const params = await searchParams;
  const companyId = context.company.id;
  const allowedBranches = permittedBranchIds(context, "FINANCIAL_REPORTS_VIEW");
  const [periods, branches] = await Promise.all([
    prisma.accountingPeriod.findMany({
      where: { companyId },
      include: { fiscalYear: { select: { code: true } } },
      orderBy: { startDate: "desc" },
    }),
    prisma.branch.findMany({
      where: { companyId, isActive: true, ...(allowedBranches ? { id: { in: allowedBranches } } : {}) },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);
  const today = new Date();
  const period =
    periods.find((item) => item.id === first(params.period)) ||
    periods.find((item) => item.startDate <= today && item.endDate >= today) ||
    periods[0];
  if (!period) return <div className="surface p-8 text-sm text-slate-500">No accounting period has been configured.</div>;
  const requestedBranch = first(params.branch);
  const branchId = requestedBranch && (!allowedBranches || allowedBranches.includes(requestedBranch)) ? requestedBranch : undefined;
  const statement = await getFinancialStatements({
    companyId,
    from: period.startDate,
    to: period.endDate,
    branchId,
    branchIds: branchId ? undefined : allowedBranches || undefined,
  });
  const currency = context.company.currencyCode;
  const balanced = statement.totals.balanceDifference.abs().lte("0.0001");

  return (
    <div className="mx-auto max-w-[1500px] pb-12">
      <Link href="/finance" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-forest-700">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Finance Dashboard
      </Link>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="kicker">Audited Financial Statements</span>
            <Badge tone={balanced ? "green" : "red"}>{balanced ? "Exact Balanced · Zero Variance" : "Discrepancy"}</Badge>
            <Badge tone="blue">Direct Posted Only</Badge>
          </div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">Financial Statements</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Multi-step Profit and Loss, Classified Balance Sheet, and Unified Cash-Flow Statement recalculating exclusively from posted double-entry journal vouchers.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/finance/reports/print?period=${period.id}${branchId ? `&branch=${branchId}` : ""}`} target="_blank" rel="noreferrer">
            <Button variant="outline">
              <Printer className="h-4 w-4" />
              Print Statements
            </Button>
          </a>
          <Link href="/finance/reports/cash-in-hand">
            <Button variant="outline">
              <Banknote className="h-4 w-4" />
              Cash in Hand
            </Button>
          </Link>
          <Link href="/finance/reports/trial-balance">
            <Button variant="outline">
              <FileSpreadsheet className="h-4 w-4" />
              Trial Balance
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          {context.permissions.includes("FINANCIAL_REPORTS_EXPORT") ? (
            <Link
              href={`/api/finance/reports/statements?period=${period.id}${branchId ? `&branch=${branchId}` : ""}`}
              prefetch={false}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-700 hover:bg-blue-100"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export CSV
            </Link>
          ) : null}
        </div>
      </div>

      <form method="get" className="surface mb-5 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto]">
        <label className="field-label">
          Fiscal period
          <select name="period" defaultValue={period.id} className="field-input">
            {periods.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.fiscalYear.code}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Branch
          <select name="branch" defaultValue={branchId || ""} className="field-input">
            <option value="">All authorized branches</option>
            {branches.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <Button type="submit">Run Statements</Button>
        </div>
      </form>

      <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-900">
        Accounting Basis: Double-entry accrual, posting dates from {formatDate(period.startDate)} through {formatDate(period.endDate)}.
        Draft, submitted, rejected, and cancelled vouchers are strictly excluded.
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* Multi-Step Profit and Loss Statement */}
        <StatementCard title="Statement of Profit and Loss (Income Statement)" subtitle={`${period.name} · Multi-Step Operating Segregation`}>
          {/* 1. Operating Sales Revenue */}
          <div className="border-b border-slate-100 py-3">
            <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">1. Operating Sales Revenue</p>
            {statement.multiStepPnl.salesRevenueAccounts.map((row) => (
              <Line key={row.id} label={`${row.code} · ${row.name}`} value={formatMoney(row.amount.toString(), currency)} href={`/finance/journals?account=${row.id}`} />
            ))}
            {!statement.multiStepPnl.salesRevenueAccounts.length ? <p className="py-1 text-[10px] text-slate-400">No posted sales revenue</p> : null}
            <div className="mt-1 flex justify-between text-xs font-semibold text-slate-800">
              <span>Total Net Sales Revenue</span>
              <span className="tabular-nums">{formatMoney(statement.multiStepPnl.salesRevenue.toString(), currency)}</span>
            </div>
          </div>

          {/* 2. Cost of Goods Sold */}
          <div className="border-b border-slate-100 py-3">
            <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">2. Cost of Goods Sold (Inventory Purchases)</p>
            {statement.multiStepPnl.cogsAccounts.map((row) => (
              <Line key={row.id} label={`${row.code} · ${row.name}`} value={formatMoney(row.amount.toString(), currency)} href={`/finance/journals?account=${row.id}`} />
            ))}
            {!statement.multiStepPnl.cogsAccounts.length ? <p className="py-1 text-[10px] text-slate-400">No cost of goods sold</p> : null}
            <div className="mt-1 flex justify-between text-xs font-semibold text-slate-800">
              <span>Total Cost of Goods Sold</span>
              <span className="tabular-nums">{formatMoney(statement.multiStepPnl.cogs.toString(), currency)}</span>
            </div>
          </div>

          {/* Gross Trading Profit Subtotal */}
          <div className="my-2 rounded-lg bg-emerald-50/70 p-3 border border-emerald-100 flex justify-between items-center text-xs font-bold text-emerald-900">
            <span>Gross Trading Profit</span>
            <span className="tabular-nums text-sm">{formatMoney(statement.multiStepPnl.grossProfit.toString(), currency)}</span>
          </div>

          {/* 3. Operating & Administrative Expenses */}
          <div className="border-b border-slate-100 py-3">
            <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">3. Operating & Administrative Expenses</p>
            {statement.multiStepPnl.operatingExpenseAccounts.map((row) => (
              <Line key={row.id} label={`${row.code} · ${row.name}`} value={formatMoney(row.amount.toString(), currency)} href={`/finance/journals?account=${row.id}`} />
            ))}
            {!statement.multiStepPnl.operatingExpenseAccounts.length ? <p className="py-1 text-[10px] text-slate-400">No operating expenses recorded</p> : null}
            <div className="mt-1 flex justify-between text-xs font-semibold text-slate-800">
              <span>Total Operating Expenses</span>
              <span className="tabular-nums">{formatMoney(statement.multiStepPnl.operatingExpenses.toString(), currency)}</span>
            </div>
          </div>

          {/* Operating Profit (EBIT) Subtotal */}
          <div className="my-2 rounded-lg bg-blue-50/70 p-3 border border-blue-100 flex justify-between items-center text-xs font-bold text-blue-900">
            <span>Operating Profit (EBIT)</span>
            <span className="tabular-nums text-sm">{formatMoney(statement.multiStepPnl.operatingProfit.toString(), currency)}</span>
          </div>

          {/* 4. Other Non-Operating Income & Adjustments */}
          <div className="border-b border-slate-100 py-3">
            <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-purple-700">4. Other Non-Operating Income (Stock Adjustment Gain)</p>
            {statement.multiStepPnl.otherIncomeAccounts.map((row) => (
              <Line key={row.id} label={`${row.code} · ${row.name}`} value={formatMoney(row.amount.toString(), currency)} href={`/finance/journals?account=${row.id}`} />
            ))}
            {!statement.multiStepPnl.otherIncomeAccounts.length ? <p className="py-1 text-[10px] text-slate-400">No other income</p> : null}
            <div className="mt-1 flex justify-between text-xs font-semibold text-slate-800">
              <span>Total Other Income</span>
              <span className="tabular-nums">{formatMoney(statement.multiStepPnl.otherIncome.toString(), currency)}</span>
            </div>
          </div>

          {/* 5. Other Non-Operating Expenses */}
          {statement.multiStepPnl.otherExpenseAccounts.length ? (
            <div className="border-b border-slate-100 py-3">
              <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">5. Other Non-Operating Expenses</p>
              {statement.multiStepPnl.otherExpenseAccounts.map((row) => (
                <Line key={row.id} label={`${row.code} · ${row.name}`} value={formatMoney(row.amount.toString(), currency)} href={`/finance/journals?account=${row.id}`} />
              ))}
            </div>
          ) : null}

          {/* Net Profit Summary */}
          <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 border border-slate-200">
            <Line label="Net Sales Revenue" value={formatMoney(statement.multiStepPnl.salesRevenue.toString(), currency)} strong />
            <Line label="Cost of Goods Sold" value={formatMoney(statement.multiStepPnl.cogs.toString(), currency)} />
            <Line label="Gross Trading Profit" value={formatMoney(statement.multiStepPnl.grossProfit.toString(), currency)} strong />
            <Line label="Operating Expenses" value={formatMoney(statement.multiStepPnl.operatingExpenses.toString(), currency)} />
            <Line label="Operating Profit (EBIT)" value={formatMoney(statement.multiStepPnl.operatingProfit.toString(), currency)} strong />
            <Line label="Non-Operating Gains / Adjustments" value={formatMoney(statement.multiStepPnl.otherIncome.toString(), currency)} />
            <div className="border-t border-slate-200 pt-2">
              <Line label="Net Profit / (Loss) for the Period" value={formatMoney(statement.multiStepPnl.netProfit.toString(), currency)} strong />
            </div>
          </div>
        </StatementCard>

        {/* Classified Balance Sheet Statement */}
        <StatementCard title="Statement of Financial Position (Balance Sheet)" subtitle={`As of ${formatDate(period.endDate)} · Classified Double-Entry`}>
          {/* Current Assets */}
          <div className="border-b border-slate-100 py-3">
            <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">Current Assets</p>
            {statement.classifiedBalanceSheet.currentAssetsList.map((row) => (
              <Line key={row.id} label={`${row.code} · ${row.name}`} value={formatMoney(row.amount.toString(), currency)} href={`/finance/journals?account=${row.id}`} />
            ))}
            {!statement.classifiedBalanceSheet.currentAssetsList.length ? <p className="py-1 text-[10px] text-slate-400">No current assets</p> : null}
            <div className="mt-1 flex justify-between text-xs font-semibold text-slate-800">
              <span>Total Current Assets</span>
              <span className="tabular-nums">{formatMoney(statement.classifiedBalanceSheet.currentAssets.toString(), currency)}</span>
            </div>
          </div>

          {/* Non-Current Assets */}
          <div className="border-b border-slate-100 py-3">
            <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">Non-Current (Fixed) Assets</p>
            {statement.classifiedBalanceSheet.nonCurrentAssetsList.map((row) => (
              <Line key={row.id} label={`${row.code} · ${row.name}`} value={formatMoney(row.amount.toString(), currency)} href={`/finance/journals?account=${row.id}`} />
            ))}
            {!statement.classifiedBalanceSheet.nonCurrentAssetsList.length ? <p className="py-1 text-[10px] text-slate-400">No fixed assets</p> : null}
            <div className="mt-1 flex justify-between text-xs font-semibold text-slate-800">
              <span>Total Non-Current Assets</span>
              <span className="tabular-nums">{formatMoney(statement.classifiedBalanceSheet.nonCurrentAssets.toString(), currency)}</span>
            </div>
          </div>

          {/* Total Assets Subtotal */}
          <div className="my-2 rounded-lg bg-teal-50/70 p-3 border border-teal-100 flex justify-between items-center text-xs font-bold text-teal-900">
            <span>Total Assets</span>
            <span className="tabular-nums text-sm">{formatMoney(statement.classifiedBalanceSheet.totalAssets.toString(), currency)}</span>
          </div>

          {/* Current Liabilities */}
          <div className="border-b border-slate-100 py-3">
            <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">Current Liabilities</p>
            {statement.classifiedBalanceSheet.currentLiabilitiesList.map((row) => (
              <Line key={row.id} label={`${row.code} · ${row.name}`} value={formatMoney(row.amount.toString(), currency)} href={`/finance/journals?account=${row.id}`} />
            ))}
            {!statement.classifiedBalanceSheet.currentLiabilitiesList.length ? <p className="py-1 text-[10px] text-slate-400">No current liabilities</p> : null}
            <div className="mt-1 flex justify-between text-xs font-semibold text-slate-800">
              <span>Total Current Liabilities</span>
              <span className="tabular-nums">{formatMoney(statement.classifiedBalanceSheet.currentLiabilities.toString(), currency)}</span>
            </div>
          </div>

          {/* Long-Term Liabilities */}
          {statement.classifiedBalanceSheet.longTermLiabilitiesList.length ? (
            <div className="border-b border-slate-100 py-3">
              <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">Long-Term Liabilities</p>
              {statement.classifiedBalanceSheet.longTermLiabilitiesList.map((row) => (
                <Line key={row.id} label={`${row.code} · ${row.name}`} value={formatMoney(row.amount.toString(), currency)} href={`/finance/journals?account=${row.id}`} />
              ))}
            </div>
          ) : null}

          {/* Shareholder Equity */}
          <div className="border-b border-slate-100 py-3">
            <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">Shareholder Equity</p>
            {statement.classifiedBalanceSheet.equityList.map((row) => (
              <Line key={row.id} label={`${row.code} · ${row.name}`} value={formatMoney(row.amount.toString(), currency)} href={`/finance/journals?account=${row.id}`} />
            ))}
            <Line label="Cumulative Retained Earnings / Current Surplus" value={formatMoney(statement.classifiedBalanceSheet.cumulativeEarnings.toString(), currency)} />
          </div>

          {/* Total Liabilities & Equity Summary */}
          <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 border border-slate-200">
            <Line label="Total Assets" value={formatMoney(statement.classifiedBalanceSheet.totalAssets.toString(), currency)} strong />
            <Line label="Total Liabilities" value={formatMoney(statement.classifiedBalanceSheet.totalLiabilities.toString(), currency)} />
            <Line label="Shareholder Capital" value={formatMoney(statement.classifiedBalanceSheet.equity.toString(), currency)} />
            <Line label="Cumulative Earnings" value={formatMoney(statement.classifiedBalanceSheet.cumulativeEarnings.toString(), currency)} />
            <div className="border-t border-slate-200 pt-2">
              <Line label="Total Liabilities + Equity" value={formatMoney(statement.classifiedBalanceSheet.totalEquityAndLiabilities.toString(), currency)} strong />
            </div>
          </div>

          {/* Balance Check Indicator */}
          <div className={`mt-3 flex items-center justify-between rounded-xl border p-3 ${balanced ? "border-emerald-200 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
            <span className="flex items-center gap-2 text-xs font-bold">
              {balanced ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <TriangleAlert className="h-4 w-4 text-red-600" />}
              {balanced ? "Double-Entry Balance Verified: Assets = Liabilities + Equity" : "Balance Difference (Discrepancy)"}
            </span>
            <span className="text-xs font-bold">Variance: {formatMoney(statement.classifiedBalanceSheet.balanceDifference.toString(), currency)}</span>
          </div>
        </StatementCard>
      </div>

      {/* Cash Flow Statement */}
      <section className="surface mt-5 overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-900">Unified Cash & Treasury Flow Statement</h2>
          <p className="mt-1 text-[11px] text-slate-400">
            Classified bank and cash drawer transactions across Operating, Investing, and Financing activities.
          </p>
        </div>
        <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Operating Activities", statement.cashFlow.OPERATING],
            ["Investing Activities", statement.cashFlow.INVESTING],
            ["Financing Activities", statement.cashFlow.FINANCING],
            ["Unclassified Receipts/Payments", statement.cashFlow.NONE],
            ["Net Cash & Bank Movement", statement.cashFlow.netMovement],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-white p-5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{String(label)}</p>
              <p className="mt-2 text-lg font-bold text-slate-900">{formatMoney(value.toString(), currency)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Mandatory Footer */}
      <footer className="mt-12 border-t border-slate-200 pt-6 text-center text-xs text-slate-500">
        <p className="font-semibold text-slate-700">Axon Mobile ERP · Financial Command Center</p>
        <p className="mt-1">© 2026 Copyright Reserved · Qasim Ali · 0315-5049489</p>
      </footer>
    </div>
  );
}

function StatementCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="surface overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        <p className="mt-1 text-[11px] text-slate-400">{subtitle}</p>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Line({ label, value, strong = false, href }: { label: string; value: string; strong?: boolean; href?: string }) {
  return (
    <div className={`flex items-center justify-between gap-4 py-1.5 text-xs ${strong ? "font-bold text-slate-900" : "text-slate-600"}`}>
      {href ? (
        <Link href={href} className="hover:text-forest-700 hover:underline flex items-center gap-1">
          <span>{label}</span>
        </Link>
      ) : (
        <span>{label}</span>
      )}
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}
