import Link from "next/link";
import { ArrowRight, Banknote, CheckCircle2, FileSpreadsheet, Printer, TriangleAlert } from "lucide-react";
import { AccountClass } from "@prisma/client";
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
    prisma.accountingPeriod.findMany({ where: { companyId }, include: { fiscalYear: { select: { code: true } } }, orderBy: { startDate: "desc" } }),
    prisma.branch.findMany({ where: { companyId, isActive: true, ...(allowedBranches ? { id: { in: allowedBranches } } : {}) }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
  ]);
  const today = new Date();
  const period = periods.find((item) => item.id === first(params.period)) || periods.find((item) => item.startDate <= today && item.endDate >= today) || periods[0];
  if (!period) return <div className="surface p-8 text-sm text-slate-500">No accounting period has been configured.</div>;
  const requestedBranch = first(params.branch);
  const branchId = requestedBranch && (!allowedBranches || allowedBranches.includes(requestedBranch)) ? requestedBranch : undefined;
  const statement = await getFinancialStatements({ companyId, from: period.startDate, to: period.endDate, branchId, branchIds: branchId ? undefined : allowedBranches || undefined });
  const currency = context.company.currencyCode;
  const balanced = statement.totals.balanceDifference.abs().lte("0.0001");
  const pnlSections = [
    { label: "Revenue", class: AccountClass.REVENUE },
    { label: "Cost of goods sold", class: AccountClass.COGS },
    { label: "Operating expenses", class: AccountClass.EXPENSE },
  ];
  const bsSections = [
    { label: "Assets", class: AccountClass.ASSET },
    { label: "Liabilities", class: AccountClass.LIABILITY },
    { label: "Equity", class: AccountClass.EQUITY },
  ];

  return <div className="mx-auto max-w-[1500px]">
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2"><span className="kicker">Posted-ledger reporting</span><Badge tone="green">Database derived</Badge></div><h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">Financial statements</h1><p className="mt-1.5 text-sm text-slate-500">Profit and loss, balance sheet, and cash-flow classification under one consistent posting-date period.</p></div><div className="flex flex-wrap gap-2"><a href={`/finance/reports/print?period=${period.id}${branchId ? `&branch=${branchId}` : ""}`} target="_blank" rel="noreferrer"><Button variant="outline"><Printer className="h-4 w-4" />Print statements</Button></a><Link href="/finance/reports/cash-in-hand"><Button variant="outline"><Banknote className="h-4 w-4" />Cash in hand</Button></Link><Link href="/finance/reports/trial-balance"><Button variant="outline"><FileSpreadsheet className="h-4 w-4" />Trial balance<ArrowRight className="h-4 w-4" /></Button></Link>{context.permissions.includes("FINANCIAL_REPORTS_EXPORT") ? <Link href={`/api/finance/reports/statements?period=${period.id}${branchId ? `&branch=${branchId}` : ""}`} prefetch={false} className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-700 hover:bg-blue-100"><FileSpreadsheet className="h-4 w-4" />Export CSV</Link> : null}</div></div>
    <form method="get" className="surface mb-5 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto]"><label className="field-label">Fiscal period<select name="period" defaultValue={period.id} className="field-input">{periods.map(item=><option key={item.id} value={item.id}>{item.name} · {item.fiscalYear.code}</option>)}</select></label><label className="field-label">Branch<select name="branch" defaultValue={branchId || ""} className="field-input"><option value="">All authorized branches</option>{branches.map(item=><option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><div className="flex items-end"><Button type="submit">Run statements</Button></div></form>
    <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-900">Reporting basis: posting date from {formatDate(period.startDate)} through {formatDate(period.endDate)}. Draft, submitted, approved, and rejected vouchers are excluded.</div>
    <div className="grid gap-5 xl:grid-cols-2">
      <StatementCard title="Profit and loss" subtitle={`${period.name} · period activity`}>
        {pnlSections.map(section=><div key={section.label} className="border-b border-slate-100 py-3 last:border-0"><p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">{section.label}</p>{statement.profitAndLoss.filter(row=>row.accountClass===section.class).map(row=><Line key={row.id} label={`${row.code} · ${row.name}`} value={formatMoney(row.amount.toString(),currency)} />)}{!statement.profitAndLoss.some(row=>row.accountClass===section.class)?<p className="py-1 text-[10px] text-slate-400">No posted activity</p>:null}</div>)}
        <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-4"><Line label="Revenue" value={formatMoney(statement.totals.revenue.toString(),currency)} strong /><Line label="Cost of goods sold" value={formatMoney(statement.totals.cogs.toString(),currency)} /><Line label="Gross profit" value={formatMoney(statement.totals.grossProfit.toString(),currency)} strong /><Line label="Operating expenses" value={formatMoney(statement.totals.expenses.toString(),currency)} /><Line label="Net profit / (loss)" value={formatMoney(statement.totals.netProfit.toString(),currency)} strong /></div>
      </StatementCard>
      <StatementCard title="Balance sheet" subtitle={`As of ${formatDate(period.endDate)}`}>
        {bsSections.map(section=><div key={section.label} className="border-b border-slate-100 py-3 last:border-0"><p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">{section.label}</p>{statement.balanceSheet.filter(row=>row.accountClass===section.class).map(row=><Line key={row.id} label={`${row.code} · ${row.name}`} value={formatMoney(row.amount.toString(),currency)} />)}{!statement.balanceSheet.some(row=>row.accountClass===section.class)?<p className="py-1 text-[10px] text-slate-400">No posted balance</p>:null}</div>)}
        <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-4"><Line label="Total assets" value={formatMoney(statement.totals.assets.toString(),currency)} strong /><Line label="Total liabilities" value={formatMoney(statement.totals.liabilities.toString(),currency)} /><Line label="Equity" value={formatMoney(statement.totals.equity.toString(),currency)} /><Line label="Cumulative earnings" value={formatMoney(statement.totals.cumulativeEarnings.toString(),currency)} /><Line label="Liabilities + equity + earnings" value={formatMoney(statement.totals.liabilities.plus(statement.totals.equity).plus(statement.totals.cumulativeEarnings).toString(),currency)} strong /></div>
        <div className={`mt-3 flex items-center justify-between rounded-xl border p-3 ${balanced?"border-emerald-200 bg-emerald-50":"border-red-300 bg-red-50"}`}><span className="flex items-center gap-2 text-xs font-bold">{balanced?<CheckCircle2 className="h-4 w-4 text-emerald-600"/>:<TriangleAlert className="h-4 w-4 text-red-600"/>}Balance check</span><span className="text-xs font-bold">Difference {formatMoney(statement.totals.balanceDifference.toString(),currency)}</span></div>
      </StatementCard>
    </div>
    <section className="surface mt-5 overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold text-slate-900">Cash-flow statement</h2><p className="mt-1 text-[11px] text-slate-400">Net posted bank movement classified on source journals; unclassified cash is disclosed rather than hidden.</p></div><div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-5">{[["Operating",statement.cashFlow.OPERATING],["Investing",statement.cashFlow.INVESTING],["Financing",statement.cashFlow.FINANCING],["Unclassified",statement.cashFlow.NONE],["Net movement",statement.cashFlow.netMovement]].map(([label,value])=><div key={String(label)} className="bg-white p-5"><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{String(label)}</p><p className="mt-2 text-lg font-bold text-slate-900">{formatMoney(value.toString(),currency)}</p></div>)}</div></section>
  </div>;
}

function StatementCard({title,subtitle,children}:{title:string;subtitle:string;children:React.ReactNode}) { return <section className="surface overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold text-slate-900">{title}</h2><p className="mt-1 text-[11px] text-slate-400">{subtitle}</p></div><div className="p-5">{children}</div></section>; }
function Line({label,value,strong=false}:{label:string;value:string;strong?:boolean}) { return <div className={`flex items-center justify-between gap-4 py-1.5 text-xs ${strong?"font-bold text-slate-900":"text-slate-600"}`}><span>{label}</span><span className="shrink-0 tabular-nums">{value}</span></div>; }
