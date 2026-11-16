import Link from "next/link";
import { ArrowLeft, Download, Printer, Scale, CheckCircle2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { permittedBranchIds, requirePagePermission } from "@/lib/auth";
import { getTrialBalance } from "@/lib/finance/reports";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function TrialBalancePage({ searchParams }: { searchParams: SearchParams }) {
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
  const report = await getTrialBalance({
    companyId,
    from: period.startDate,
    to: period.endDate,
    branchId,
    branchIds: branchId ? undefined : allowedBranches || undefined,
  });
  const balanced = report.totals.closingDebit.equals(report.totals.closingCredit);
  const exportQuery = new URLSearchParams({ period: period.id, ...(branchId ? { branch: branchId } : {}) }).toString();

  return (
    <div className="mx-auto max-w-[1500px] pb-12">
      <Link href="/finance" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-forest-700">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Finance Dashboard
      </Link>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="kicker">Financial Statements</span>
            <Badge tone={balanced ? "green" : "red"}>{balanced ? "Reconciled · Balanced" : "Out of Balance"}</Badge>
          </div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">Trial Balance</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Opening balances, period movements, and closing positions strictly derived from posted ledger transactions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/finance/reports/trial-balance/print?${exportQuery}`} target="_blank" rel="noreferrer">
            <Button variant="outline">
              <Printer className="h-4 w-4" />
              Print Trial Balance
            </Button>
          </a>
          {context.permissions.includes("FINANCIAL_REPORTS_EXPORT") ? (
            <a href={`/api/finance/reports/trial-balance?${exportQuery}`}>
              <Button variant="outline">
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </a>
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
          <Button type="submit">Run Report</Button>
        </div>
      </form>

      <section className="surface overflow-hidden">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">
                {period.name} · {period.fiscalYear.code}
              </h2>
              {balanced ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  Exact 0.00 Variance
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                  <TriangleAlert className="h-3 w-3" />
                  Variance Detected
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {formatDate(period.startDate)} through {formatDate(period.endDate)}
            </p>
          </div>
          <Scale className={`h-5 w-5 ${balanced ? "text-emerald-600" : "text-red-600"}`} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left">
            <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th rowSpan={2} className="px-5 py-3">Account</th>
                <th rowSpan={2} className="px-4 py-3">Class</th>
                <th colSpan={2} className="border-l border-slate-200 px-4 py-2 text-center">Opening</th>
                <th colSpan={2} className="border-l border-slate-200 px-4 py-2 text-center">Period Movement</th>
                <th colSpan={2} className="border-l border-slate-200 px-4 py-2 text-center">Closing</th>
              </tr>
              <tr>
                <th className="border-l border-slate-200 px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2 text-right">Credit</th>
                <th className="border-l border-slate-200 px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2 text-right">Credit</th>
                <th className="border-l border-slate-200 px-3 py-2 text-right">Debit</th>
                <th className="px-5 py-2 text-right">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.rows.map((row) => (
                <tr key={row.id} className="text-xs hover:bg-slate-50 transition">
                  <td className="px-5 py-3">
                    <Link
                      href={`/finance/journals?account=${row.id}`}
                      className="font-bold text-forest-700 hover:underline"
                      title="Click to view full account ledger"
                    >
                      {row.code}
                    </Link>
                    <span className="ml-2 text-slate-600">{row.name}</span>
                  </td>
                  <td className="px-4 py-3 text-[10px] text-slate-400">{titleCase(row.accountClass)}</td>
                  {[
                    row.openingDebit,
                    row.openingCredit,
                    row.periodDebit,
                    row.periodCredit,
                    row.closingDebit,
                    row.closingCredit,
                  ].map((value, index) => (
                    <td
                      key={index}
                      className={`px-3 py-3 text-right tabular-nums text-slate-600 ${
                        index % 2 === 0 ? "border-l border-slate-100" : ""
                      } ${index === 5 ? "pr-5" : ""}`}
                    >
                      {value.isZero() ? "—" : formatMoney(value.toString(), context.company.currencyCode)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-900">
              <tr>
                <td colSpan={2} className="px-5 py-4 text-right uppercase tracking-wider">
                  Totals
                </td>
                {[
                  report.totals.openingDebit,
                  report.totals.openingCredit,
                  report.totals.periodDebit,
                  report.totals.periodCredit,
                  report.totals.closingDebit,
                  report.totals.closingCredit,
                ].map((value, index) => (
                  <td
                    key={index}
                    className={`px-3 py-4 text-right tabular-nums ${
                      index % 2 === 0 ? "border-l border-slate-200" : ""
                    } ${index === 5 ? "pr-5" : ""}`}
                  >
                    {formatMoney(value.toString(), context.company.currencyCode)}
                  </td>
                ))}
              </tr>
            </tfoot>
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
