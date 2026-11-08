import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeDollarSign,
  Banknote,
  BookOpenCheck,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  ReceiptText,
  Scale,
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
    prisma.branch.findMany({ where: { companyId, isActive: true, ...(allowedBranchIds ? { id: { in: allowedBranchIds } } : {}) }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.bankAccount.findMany({ where: { companyId, isActive: true, ...(allowedBranchIds ? { branchId: { in: allowedBranchIds } } : {}) }, select: { id: true, code: true, bankName: true, accountNumberLast4: true }, orderBy: { code: "asc" } }),
    prisma.customer.findMany({ where: { companyId, status: "ACTIVE" }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
    prisma.supplier.findMany({ where: { companyId, status: "ACTIVE" }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
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
  const metrics = [
    { label: "Cash & bank", value: report.metrics.cashBalance, detail: `Balance through ${formatDate(selectedPeriod.endDate)}`, icon: Landmark, tone: "bg-blue-50 text-blue-700" },
    { label: "Receivables", value: report.metrics.receivables, detail: "Customer, incentive & rebate", icon: WalletCards, tone: "bg-cyan-50 text-cyan-700" },
    { label: "Payables", value: report.metrics.payables, detail: "Supplier, incentive, rebate & tax", icon: ReceiptText, tone: "bg-amber-50 text-amber-700" },
    { label: "Revenue", value: report.metrics.revenue, detail: selectedPeriod.name, icon: CircleDollarSign, tone: "bg-indigo-50 text-indigo-700" },
    { label: "Gross profit", value: report.metrics.grossProfit, detail: "Revenue less cost of sales", icon: BadgeDollarSign, tone: "bg-emerald-50 text-emerald-700" },
    { label: "Operating expenses", value: report.metrics.expenses, detail: selectedPeriod.name, icon: Banknote, tone: "bg-rose-50 text-rose-700" },
    { label: "Net profit", value: report.metrics.netProfit, detail: "Posted activity only", icon: Scale, tone: report.metrics.netProfit.gte(0) ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700" },
  ];
  const trendMax = Math.max(
    1,
    ...report.trend.flatMap((item) => [Number(item.revenue.abs()), Number(item.cogs.abs()), Number(item.expenses.abs())]),
  );

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2"><span className="kicker">Financial command center</span><Badge tone="green">Posted data</Badge></div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">Finance dashboard</h1>
          <p className="mt-1.5 text-sm text-slate-500">Every figure below is recalculated from posted journal lines and links back to its source voucher.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/finance/reports/trial-balance"><Button variant="outline"><BookOpenCheck className="h-4 w-4" />Trial balance</Button></Link>
          <Link href="/finance/journals"><Button>Journal register<ArrowRight className="h-4 w-4" /></Button></Link>
        </div>
      </div>

      <form className="surface mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" method="get">
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Company
          <select disabled className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700"><option>{context.company.code} · {context.company.name}</option></select>
        </label>
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fiscal period
          <select name="period" defaultValue={selectedPeriod.id} className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700">
            {periods.map((period) => <option key={period.id} value={period.id}>{period.name} · {period.fiscalYear.code}</option>)}
          </select>
        </label>
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Branch
          <select name="branch" defaultValue={branchId || ""} className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"><option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}</select>
        </label>
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bank
          <select name="bank" defaultValue={bankAccountId || ""} className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"><option value="">All banks</option>{banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.code} · {bank.bankName} •{bank.accountNumberLast4}</option>)}</select>
        </label>
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Party
          <select name="party" defaultValue={party} className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"><option value="">All customers & suppliers</option><optgroup label="Customers">{customers.map((item) => <option key={item.id} value={`customer:${item.id}`}>{item.code} · {item.name}</option>)}</optgroup><optgroup label="Suppliers">{suppliers.map((item) => <option key={item.id} value={`supplier:${item.id}`}>{item.code} · {item.name}</option>)}</optgroup></select>
        </label>
        <div className="flex items-end gap-2"><label className="min-w-0 flex-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Salesperson
          <select name="salesperson" defaultValue={salespersonId || ""} className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"><option value="">All salespeople</option>{salespeople.map(({ user }) => <option key={user.id} value={user.id}>{user.fullName}</option>)}</select>
        </label><button className="h-9 rounded-lg bg-forest-700 px-3 text-xs font-semibold text-white hover:bg-forest-800">Apply</button></div>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {metrics.map((metric) => <div key={metric.label} className="surface p-4"><span className={`grid h-9 w-9 place-items-center rounded-xl ${metric.tone}`}><metric.icon className="h-4 w-4" /></span><p className="mt-4 text-xl font-bold tracking-[-.03em] text-slate-950">{formatMoney(metric.value.toString(), currency)}</p><p className="mt-1 text-xs font-semibold text-slate-700">{metric.label}</p><p className="mt-1 text-[10px] leading-4 text-slate-400">{metric.detail}</p></div>)}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <section className="surface overflow-hidden">
          <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 sm:px-6"><div><h2 className="text-sm font-bold text-slate-900">Monthly earnings movement</h2><p className="mt-1 text-[11px] text-slate-400">Revenue, cost of sales and operating expenses from posted lines.</p></div><span className="text-[10px] font-semibold text-slate-400">{selectedPeriod.fiscalYear.code}</span></div>
          <div className="p-5 sm:p-6">
            {report.trend.length ? <div className="space-y-5">{report.trend.map((item) => <div key={item.month} className="grid grid-cols-[58px_1fr] items-center gap-3"><span className="text-[10px] font-semibold text-slate-500">{item.month}</span><div className="space-y-1.5"><div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${Math.max(1, Number(item.revenue.abs()) / trendMax * 100)}%` }} /></div><div className="flex gap-1"><div className="h-1.5 rounded-full bg-amber-400" style={{ width: `${Math.max(1, Number(item.cogs.abs()) / trendMax * 100)}%` }} /><div className="h-1.5 rounded-full bg-rose-400" style={{ width: `${Math.max(1, Number(item.expenses.abs()) / trendMax * 100)}%` }} /></div><div className="flex gap-3 text-[9px] text-slate-400"><span>Revenue {formatMoney(item.revenue.toString(), currency)}</span><span>COGS {formatMoney(item.cogs.toString(), currency)}</span><span>Expenses {formatMoney(item.expenses.toString(), currency)}</span></div></div></div>)}</div> : <div className="py-16 text-center text-xs text-slate-400">No posted earnings activity for these filters.</div>}
          </div>
        </section>

        <section className={`surface overflow-hidden border ${report.balanceSheetCheck.balanced ? "border-emerald-200" : "border-red-300"}`}>
          <div className="border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-2">{report.balanceSheetCheck.balanced ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <TriangleAlert className="h-4 w-4 text-red-600" />}<h2 className="text-sm font-bold text-slate-900">Balance sheet check</h2></div><p className="mt-1 text-[11px] text-slate-400">Assets must equal liabilities, equity and cumulative earnings.</p></div>
          <dl className="divide-y divide-slate-100 px-5">
            {[['Assets', report.balanceSheetCheck.assets], ['Liabilities', report.balanceSheetCheck.liabilities], ['Equity', report.balanceSheetCheck.equity], ['Cumulative earnings', report.balanceSheetCheck.cumulativeEarnings]].map(([label, value]) => <div key={String(label)} className="flex justify-between py-3 text-xs"><dt className="text-slate-500">{String(label)}</dt><dd className="font-semibold text-slate-800">{formatMoney(value.toString(), currency)}</dd></div>)}
          </dl>
          <div className={`m-5 rounded-xl p-4 ${report.balanceSheetCheck.balanced ? "bg-emerald-50" : "bg-red-50"}`}><p className={`text-[10px] font-bold uppercase tracking-wider ${report.balanceSheetCheck.balanced ? "text-emerald-700" : "text-red-700"}`}>Difference</p><p className={`mt-1 text-xl font-bold ${report.balanceSheetCheck.balanced ? "text-emerald-900" : "text-red-900"}`}>{formatMoney(report.balanceSheetCheck.difference.toString(), currency)}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">No artificial balancing figure is inserted.</p></div>
        </section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <section className="surface overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold text-slate-900">Cash movement</h2><p className="mt-1 text-[11px] text-slate-400">Posted bank-ledger entries for this period.</p></div><div className="grid grid-cols-2 divide-x divide-slate-100"><div className="p-5"><ArrowDownLeft className="h-5 w-5 text-emerald-600" /><p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Inflows</p><p className="mt-1 text-lg font-bold text-slate-900">{formatMoney(report.metrics.bankInflows.toString(), currency)}</p></div><div className="p-5"><ArrowUpRight className="h-5 w-5 text-rose-600" /><p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Outflows</p><p className="mt-1 text-lg font-bold text-slate-900">{formatMoney(report.metrics.bankOutflows.toString(), currency)}</p></div></div><div className="border-t border-slate-100 p-4"><Link className="flex items-center justify-between text-xs font-semibold text-forest-700" href="/finance/banking">Open bank ledger <ArrowRight className="h-4 w-4" /></Link></div></section>
        <section className="surface overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-bold text-slate-900">Recent posted journals</h2><p className="mt-1 text-[11px] text-slate-400">Click a voucher for full source and line traceability.</p></div><Link href="/finance/journals" className="text-[11px] font-semibold text-forest-700">View all</Link></div><div className="divide-y divide-slate-100">{report.recentJournals.length ? report.recentJournals.map((journal) => <Link key={journal.id} href={`/finance/journals/${journal.id}`} className="grid grid-cols-[1fr_auto] gap-3 px-5 py-3.5 hover:bg-slate-50"><span className="min-w-0"><span className="block text-xs font-bold text-slate-800">{journal.voucherNumber}</span><span className="mt-0.5 block truncate text-[10px] text-slate-400">{formatDate(journal.postingDate)} · {journal.branch.code} · {journal.narration}</span></span><span className="text-right"><span className="block text-xs font-semibold text-slate-800">{formatMoney(journal.totalDebit.toString(), currency)}</span><span className="mt-0.5 block text-[9px] uppercase text-slate-400">{titleCase(journal.voucherType)}</span></span></Link>) : <div className="px-5 py-12 text-center text-xs text-slate-400">No posted journals for these filters.</div>}</div></section>
      </div>

      <section className="surface mt-5 overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-bold text-slate-900">Largest account movements</h2><p className="mt-1 text-[11px] text-slate-400">Period debits and credits, ranked by normal-balance movement.</p></div><Link href="/finance/reports/trial-balance" className="text-[11px] font-semibold text-forest-700">Full trial balance</Link></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3">Account</th><th className="px-4 py-3">Class</th><th className="px-4 py-3 text-right">Debit</th><th className="px-4 py-3 text-right">Credit</th><th className="px-5 py-3 text-right">Normal movement</th></tr></thead><tbody className="divide-y divide-slate-100">{report.accountActivity.map((row) => <tr key={row.id} className="text-xs"><td className="px-5 py-3"><span className="font-bold text-slate-800">{row.code}</span><span className="ml-2 text-slate-500">{row.name}</span></td><td className="px-4 py-3 text-[10px] text-slate-500">{titleCase(row.accountClass)}</td><td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatMoney(row.debit.toString(), currency)}</td><td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatMoney(row.credit.toString(), currency)}</td><td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-900">{formatMoney(row.movement.toString(), currency)}</td></tr>)}</tbody></table></div></section>
    </div>
  );
}
