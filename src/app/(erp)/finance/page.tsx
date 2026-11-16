import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeDollarSign,
  Banknote,
  BookOpenCheck,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  FileSpreadsheet,
  Info,
  Landmark,
  Percent,
  ReceiptText,
  Scale,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { permittedBranchIds, requirePagePermission } from "@/lib/auth";
import { getFinanceDashboard } from "@/lib/finance/reports";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function FinanceDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await requirePagePermission("FINANCE_DASHBOARD_VIEW");
  const params = await searchParams;
  const companyId = context.company.id;
  const allowedBranchIds = permittedBranchIds(context, "FINANCE_DASHBOARD_VIEW");
  const [periods, branches, banks, customers, suppliers, salespeople] = await Promise.all([
    prisma.accountingPeriod.findMany({
      where: { companyId },
      include: { fiscalYear: { select: { code: true } } },
      orderBy: { startDate: "desc" },
    }),
    prisma.branch.findMany({
      where: { companyId, isActive: true, ...(allowedBranchIds ? { id: { in: allowedBranchIds } } : {}) },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    prisma.bankAccount.findMany({
      where: { companyId, isActive: true, ...(allowedBranchIds ? { branchId: { in: allowedBranchIds } } : {}) },
      select: { id: true, code: true, bankName: true, accountNumberLast4: true },
      orderBy: { code: "asc" },
    }),
    prisma.customer.findMany({
      where: { companyId, status: "ACTIVE" },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    prisma.supplier.findMany({
      where: { companyId, status: "ACTIVE" },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    prisma.companyMembership.findMany({
      where: { companyId, status: "ACTIVE" },
      select: { user: { select: { id: true, fullName: true } } },
      orderBy: { user: { fullName: "asc" } },
    }),
  ]);
  const today = new Date();
  const selectedPeriod =
    periods.find((period) => period.id === first(params.period)) ||
    periods.find((period) => period.startDate <= today && period.endDate >= today) ||
    periods[0];
  if (!selectedPeriod) {
    return <div className="surface p-8 text-sm text-slate-600">Configure a fiscal year and accounting period before opening finance.</div>;
  }

  const requestedBranchId = first(params.branch) || undefined;
  const branchId = requestedBranchId && (!allowedBranchIds || allowedBranchIds.includes(requestedBranchId)) ? requestedBranchId : undefined;
  const bankAccountId = first(params.bank) || undefined;
  const salespersonId = first(params.salesperson) || undefined;
  const party = first(params.party) || "";
  const [partyType, partyId] = party.split(":");
  const report = await getFinanceDashboard({
    companyId,
    from: selectedPeriod.startDate,
    to: selectedPeriod.endDate,
    branchId,
    branchIds: branchId ? undefined : allowedBranchIds || undefined,
    bankAccountId,
    salespersonId,
    customerId: partyType === "customer" ? partyId : undefined,
    supplierId: partyType === "supplier" ? partyId : undefined,
  });
  const currency = context.company.currencyCode;

  // 14 Core Financial Metrics organized into Liquidity & Performance
  const liquidityMetrics = [
    {
      label: "Cash on Hand",
      code: "1000",
      value: report.metrics.cashOnHand,
      detail: "Cash drawer & counter vault",
      icon: Banknote,
      tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    {
      label: "Bank Accounts",
      code: "1010",
      value: report.metrics.bankBalance,
      detail: "Commercial bank current balance",
      icon: Landmark,
      tone: "bg-blue-50 text-blue-700 border-blue-200",
    },
    {
      label: "Total Cash & Bank",
      code: "1000+1010",
      value: report.metrics.cashBalance,
      detail: "Combined liquid cash funds",
      icon: Landmark,
      tone: "bg-indigo-50 text-indigo-700 border-indigo-200",
    },
    {
      label: "Merchandise Inventory",
      code: "1200",
      value: report.metrics.merchandiseInventory,
      detail: "Asset value of physical stock",
      icon: Boxes,
      tone: "bg-teal-50 text-teal-700 border-teal-200",
    },
    {
      label: "Trade Receivables",
      code: "1100",
      value: report.metrics.tradeReceivables,
      detail: "Customer ledger balances",
      icon: WalletCards,
      tone: "bg-cyan-50 text-cyan-700 border-cyan-200",
    },
    {
      label: "Trade Payables",
      code: "2000",
      value: report.metrics.tradePayables,
      detail: "Supplier ledger balances",
      icon: ReceiptText,
      tone: "bg-amber-50 text-amber-700 border-amber-200",
    },
    {
      label: "Working Capital",
      code: "CA - CL",
      value: report.metrics.workingCapital,
      detail: "Current assets less liabilities",
      icon: TrendingUp,
      tone: report.metrics.workingCapital.gte(0) ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-800 border-red-200",
    },
  ];

  const performanceMetrics = [
    {
      label: "Net Sales Revenue",
      code: "4000",
      value: report.metrics.netSalesRevenue,
      detail: "Operating handset & accessories",
      icon: CircleDollarSign,
      tone: "bg-sky-50 text-sky-700 border-sky-200",
    },
    {
      label: "Cost of Goods Sold",
      code: "5000",
      value: report.metrics.cogs,
      detail: "Direct cost of sold inventory",
      icon: Banknote,
      tone: "bg-rose-50 text-rose-700 border-rose-200",
    },
    {
      label: "Gross Trading Profit",
      code: "Rev - COGS",
      value: report.metrics.grossProfit,
      detail: `Margin: ${report.metrics.grossMarginPercent.toString()}%`,
      icon: BadgeDollarSign,
      tone: report.metrics.grossProfit.gte(0) ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200",
    },
    {
      label: "Operating Expenses",
      code: "6000-6300",
      value: report.metrics.operatingExpenses,
      detail: "Rent, utilities, depreciation",
      icon: Percent,
      tone: "bg-slate-50 text-slate-700 border-slate-200",
    },
    {
      label: "Operating Profit (EBIT)",
      code: "GP - OPEX",
      value: report.metrics.operatingProfit,
      detail: "Pure core operations earnings",
      icon: Sparkles,
      tone: report.metrics.operatingProfit.gte(0) ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-red-50 text-red-700 border-red-200",
    },
    {
      label: "Other Non-Operating Income",
      code: "4010-4030",
      value: report.metrics.otherIncome,
      detail: `Stock adjustment gain: ${formatMoney(report.metrics.inventoryAdjustmentGain.toString(), currency)}`,
      icon: Info,
      tone: "bg-purple-50 text-purple-700 border-purple-200",
    },
    {
      label: "Net Profit for Period",
      code: "Bottom Line",
      value: report.metrics.netProfit,
      detail: "Posted double-entry net surplus",
      icon: Scale,
      tone: report.metrics.netProfit.gte(0) ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-800 border-red-200",
    },
  ];

  const trendMax = Math.max(
    1,
    ...report.trend.flatMap((item) => [Number(item.revenue.abs()), Number(item.cogs.abs()), Number(item.expenses.abs())]),
  );

  return (
    <div className="mx-auto max-w-[1600px] pb-12">
      {/* Header */}
      <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="kicker">Financial Command Center</span>
            <Badge tone="green">Double-Entry Posted Ledger</Badge>
            <Badge tone="blue">Direct Posting Active</Badge>
          </div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">
            {context.company.name} · Finance Dashboard
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Real-time financial position recalculating dynamically from posted journal lines. Fully audited double-entry accounting with drill-down traceability.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/finance/reports/trial-balance">
            <Button variant="outline">
              <BookOpenCheck className="h-4 w-4" />
              Trial Balance
            </Button>
          </Link>
          <Link href="/finance/reports">
            <Button variant="outline">
              <FileSpreadsheet className="h-4 w-4" />
              Financial Statements
            </Button>
          </Link>
          <Link href="/finance/banking">
            <Button variant="outline">
              <Landmark className="h-4 w-4" />
              Cash & Treasury
            </Button>
          </Link>
          <Link href="/finance/journals">
            <Button>
              Journal Register
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Audit & Accounting Disclosure Banner */}
      <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-950 shadow-sm">
        <div className="flex items-center gap-2 font-bold text-blue-900">
          <Info className="h-4 w-4 text-blue-700" />
          <span>Accounting Audit & Reclassification Disclosures (FY2026-27):</span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg bg-white/80 p-2.5 border border-blue-100">
            <span className="font-semibold text-blue-900">1. Opening Stock Gain Disclosed Separately:</span>
            <p className="mt-0.5 text-[11px] text-slate-600 leading-relaxed">
              Account 4030 has {formatMoney(report.metrics.inventoryAdjustmentGain.toString(), currency)} from initial stock transfers (ISB--SAV-000001..3). This is segregated from Operating Sales ({formatMoney(report.metrics.netSalesRevenue.toString(), currency)}) to reflect true trading gross margin ({report.metrics.grossMarginPercent.toString()}%).
            </p>
          </div>
          <div className="rounded-lg bg-white/80 p-2.5 border border-blue-100">
            <span className="font-semibold text-blue-900">2. Opening Cash Voucher Rectification:</span>
            <p className="mt-0.5 text-[11px] text-slate-600 leading-relaxed">
              Voucher ISB--JV-000001 historically inverted Cash and Share Capital (Cr Cash / Dr Capital Rs 69,140). Proposed rectifying entry (Dr Cash / Cr Capital Rs 138,280) is prepared in audit documentation without silent database changes.
            </p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <form className="surface mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" method="get">
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Company
          <select disabled className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700">
            <option>{context.company.code} · {context.company.name}</option>
          </select>
        </label>
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Fiscal period
          <select name="period" defaultValue={selectedPeriod.id} className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700">
            {periods.map((period) => (
              <option key={period.id} value={period.id}>{period.name} · {period.fiscalYear.code}</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Branch
          <select name="branch" defaultValue={branchId || ""} className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700">
            <option value="">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Bank
          <select name="bank" defaultValue={bankAccountId || ""} className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700">
            <option value="">All banks</option>
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>{bank.code} · {bank.bankName} •{bank.accountNumberLast4}</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Party
          <select name="party" defaultValue={party} className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700">
            <option value="">All customers & suppliers</option>
            <optgroup label="Customers">
              {customers.map((item) => (
                <option key={item.id} value={`customer:${item.id}`}>{item.code} · {item.name}</option>
              ))}
            </optgroup>
            <optgroup label="Suppliers">
              {suppliers.map((item) => (
                <option key={item.id} value={`supplier:${item.id}`}>{item.code} · {item.name}</option>
              ))}
            </optgroup>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Salesperson
            <select name="salesperson" defaultValue={salespersonId || ""} className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700">
              <option value="">All salespeople</option>
              {salespeople.map(({ user }) => (
                <option key={user.id} value={user.id}>{user.fullName}</option>
              ))}
            </select>
          </label>
          <button className="h-9 rounded-lg bg-forest-700 px-4 text-xs font-semibold text-white hover:bg-forest-800 transition">
            Apply
          </button>
        </div>
      </form>

      {/* Primary KPI Grid: Section 1 - Liquidity & Balance Sheet Assets */}
      <div className="mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Liquidity & Working Capital</h3>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
          {liquidityMetrics.map((metric) => (
            <div key={metric.label} className="surface p-3.5 border hover:shadow-sm transition">
              <div className="flex items-center justify-between">
                <span className={`grid h-8 w-8 place-items-center rounded-lg border ${metric.tone}`}>
                  <metric.icon className="h-4 w-4" />
                </span>
                <span className="text-[10px] font-mono text-slate-400 font-medium">{metric.code}</span>
              </div>
              <p className="mt-3 text-lg font-bold tracking-tight text-slate-950">
                {formatMoney(metric.value.toString(), currency)}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-slate-700">{metric.label}</p>
              <p className="mt-0.5 text-[10px] leading-3 text-slate-400 truncate">{metric.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Primary KPI Grid: Section 2 - Trading Performance & Earnings */}
      <div className="mb-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Operating Performance & Earnings (Period)</h3>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
          {performanceMetrics.map((metric) => (
            <div key={metric.label} className="surface p-3.5 border hover:shadow-sm transition">
              <div className="flex items-center justify-between">
                <span className={`grid h-8 w-8 place-items-center rounded-lg border ${metric.tone}`}>
                  <metric.icon className="h-4 w-4" />
                </span>
                <span className="text-[10px] font-mono text-slate-400 font-medium">{metric.code}</span>
              </div>
              <p className="mt-3 text-lg font-bold tracking-tight text-slate-950">
                {formatMoney(metric.value.toString(), currency)}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-slate-700">{metric.label}</p>
              <p className="mt-0.5 text-[10px] leading-3 text-slate-400 truncate">{metric.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Mid Section: Earnings Movement & Balance Sheet Equality */}
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <section className="surface overflow-hidden">
          <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Monthly Earnings Movement</h2>
              <p className="mt-1 text-[11px] text-slate-400">
                Net sales revenue, cost of goods sold, and operating expenses from posted journal lines.
              </p>
            </div>
            <span className="text-[10px] font-semibold text-slate-400">{selectedPeriod.fiscalYear.code}</span>
          </div>
          <div className="p-5 sm:p-6">
            {report.trend.length ? (
              <div className="space-y-5">
                {report.trend.map((item) => (
                  <div key={item.month} className="grid grid-cols-[58px_1fr] items-center gap-3">
                    <span className="text-[10px] font-semibold text-slate-500">{item.month}</span>
                    <div className="space-y-1.5">
                      <div className="h-2 rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-blue-600"
                          style={{ width: `${Math.max(1, (Number(item.revenue.abs()) / trendMax) * 100)}%` }}
                        />
                      </div>
                      <div className="flex gap-1">
                        <div
                          className="h-1.5 rounded-full bg-amber-400"
                          style={{ width: `${Math.max(1, (Number(item.cogs.abs()) / trendMax) * 100)}%` }}
                        />
                        <div
                          className="h-1.5 rounded-full bg-rose-400"
                          style={{ width: `${Math.max(1, (Number(item.expenses.abs()) / trendMax) * 100)}%` }}
                        />
                      </div>
                      <div className="flex gap-3 text-[9px] text-slate-400">
                        <span>Revenue {formatMoney(item.revenue.toString(), currency)}</span>
                        <span>COGS {formatMoney(item.cogs.toString(), currency)}</span>
                        <span>Expenses {formatMoney(item.expenses.toString(), currency)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-16 text-center text-xs text-slate-400">No posted earnings activity for these filters.</div>
            )}
          </div>
        </section>

        <section className={`surface overflow-hidden border ${report.balanceSheetCheck.balanced ? "border-emerald-200" : "border-red-300"}`}>
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              {report.balanceSheetCheck.balanced ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <TriangleAlert className="h-4 w-4 text-red-600" />
              )}
              <h2 className="text-sm font-bold text-slate-900">Balance Sheet Equation Verification</h2>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Total Assets must equal Liabilities + Equity + Cumulative Earnings (Variance must be exactly 0.00).
            </p>
          </div>
          <dl className="divide-y divide-slate-100 px-5">
            {[
              ["Total Assets", report.balanceSheetCheck.assets],
              ["Total Liabilities", report.balanceSheetCheck.liabilities],
              ["Shareholder Equity", report.balanceSheetCheck.equity],
              ["Cumulative Earnings", report.balanceSheetCheck.cumulativeEarnings],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between py-3 text-xs">
                <dt className="text-slate-500">{String(label)}</dt>
                <dd className="font-semibold tabular-nums text-slate-800">{formatMoney(value.toString(), currency)}</dd>
              </div>
            ))}
          </dl>
          <div className={`m-5 rounded-xl p-4 ${report.balanceSheetCheck.balanced ? "bg-emerald-50" : "bg-red-50"}`}>
            <p className={`text-[10px] font-bold uppercase tracking-wider ${report.balanceSheetCheck.balanced ? "text-emerald-700" : "text-red-700"}`}>
              {report.balanceSheetCheck.balanced ? "Double-Entry Balance Status: Exact Reconciled" : "Balance Difference (Discrepancy)"}
            </p>
            <p className={`mt-1 text-xl font-bold ${report.balanceSheetCheck.balanced ? "text-emerald-900" : "text-red-900"}`}>
              {formatMoney(report.balanceSheetCheck.difference.toString(), currency)}
            </p>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">
              Zero artificial balancing plug. Recalculated from posted General Ledger lines.
            </p>
          </div>
        </section>
      </div>

      {/* Bank & Cash Movements and Recent Journals */}
      <div className="mt-5 grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <section className="surface overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-bold text-slate-900">Cash & Treasury Movement</h2>
            <p className="mt-1 text-[11px] text-slate-400">Posted bank and cash drawer entries for this period.</p>
          </div>
          <div className="grid grid-cols-2 divide-x divide-slate-100">
            <div className="p-5">
              <ArrowDownLeft className="h-5 w-5 text-emerald-600" />
              <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Inflows</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{formatMoney(report.metrics.bankInflows.toString(), currency)}</p>
            </div>
            <div className="p-5">
              <ArrowUpRight className="h-5 w-5 text-rose-600" />
              <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Outflows</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{formatMoney(report.metrics.bankOutflows.toString(), currency)}</p>
            </div>
          </div>
          <div className="border-t border-slate-100 p-4">
            <Link className="flex items-center justify-between text-xs font-semibold text-forest-700" href="/finance/banking">
              Open Cash & Bank Ledgers <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recent Posted Vouchers</h2>
              <p className="mt-1 text-[11px] text-slate-400">Click a voucher for full double-entry lines and source traceability.</p>
            </div>
            <Link href="/finance/journals" className="text-[11px] font-semibold text-forest-700">
              View All Journals
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {report.recentJournals.length ? (
              report.recentJournals.map((journal) => (
                <Link
                  key={journal.id}
                  href={`/finance/journals/${journal.id}`}
                  className="grid grid-cols-[1fr_auto] gap-3 px-5 py-3 hover:bg-slate-50 transition"
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-slate-800">{journal.voucherNumber}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                      {formatDate(journal.postingDate)} · {journal.branch.code} · {journal.narration}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-xs font-semibold text-slate-800">
                      {formatMoney(journal.totalDebit.toString(), currency)}
                    </span>
                    <span className="mt-0.5 block text-[9px] uppercase font-semibold text-slate-400">
                      {titleCase(journal.voucherType)}
                    </span>
                  </span>
                </Link>
              ))
            ) : (
              <div className="px-5 py-12 text-center text-xs text-slate-400">No posted journals for these filters.</div>
            )}
          </div>
        </section>
      </div>

      {/* Largest Account Movements with Direct Drilldown */}
      <section className="surface mt-5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Largest Account Movements (General Ledger Drill-Down)</h2>
            <p className="mt-1 text-[11px] text-slate-400">
              Period debits and credits, ranked by normal-balance activity. Click any account to view its full transaction ledger.
            </p>
          </div>
          <Link href="/finance/reports/trial-balance" className="text-[11px] font-semibold text-forest-700">
            Full Trial Balance →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3">Account Code & Name</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3 text-right">Debit</th>
                <th className="px-4 py-3 text-right">Credit</th>
                <th className="px-5 py-3 text-right">Normal Movement</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.accountActivity.map((row) => (
                <tr key={row.id} className="text-xs hover:bg-slate-50 transition">
                  <td className="px-5 py-3">
                    <Link href={`/finance/journals?account=${row.id}`} className="font-bold text-forest-700 hover:underline">
                      {row.code}
                    </Link>
                    <span className="ml-2 text-slate-700">{row.name}</span>
                  </td>
                  <td className="px-4 py-3 text-[10px] text-slate-500">{titleCase(row.accountClass)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {formatMoney(row.debit.toString(), currency)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {formatMoney(row.credit.toString(), currency)}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-900">
                    {formatMoney(row.movement.toString(), currency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/finance/journals?account=${row.id}`}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                    >
                      View Ledger →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
