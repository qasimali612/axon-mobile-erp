import { notFound } from "next/navigation";
import { AccountClass } from "@prisma/client";
import { ReportPrintHeader } from "@/components/print/report-print-header";
import { ReportPrintSignatures } from "@/components/print/report-print-signatures";
import { permittedBranchIds, requirePagePermission } from "@/lib/auth";
import { getFinancialStatements } from "@/lib/finance/reports";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function FinancialStatementsPrintPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const context = await requirePagePermission("FINANCIAL_REPORTS_VIEW");
  const params = await searchParams;
  const companyId = context.company.id;
  const allowedBranches = permittedBranchIds(context, "FINANCIAL_REPORTS_VIEW");

  const [company, periods, branches] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.accountingPeriod.findMany({
      where: { companyId },
      include: { fiscalYear: { select: { code: true } } },
      orderBy: { startDate: "desc" },
    }),
    prisma.branch.findMany({
      where: {
        companyId,
        isActive: true,
        ...(allowedBranches ? { id: { in: allowedBranches } } : {}),
      },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  if (!company) notFound();

  const today = new Date();
  const period =
    periods.find((item) => item.id === first(params.period)) ||
    periods.find((item) => item.startDate <= today && item.endDate >= today) ||
    periods[0];

  if (!period) notFound();

  const requestedBranch = first(params.branch);
  const branchId =
    requestedBranch && (!allowedBranches || allowedBranches.includes(requestedBranch))
      ? requestedBranch
      : undefined;

  const branchObj = branches.find((b) => b.id === branchId);

  const statement = await getFinancialStatements({
    companyId,
    from: period.startDate,
    to: period.endDate,
    branchId,
    branchIds: branchId ? undefined : allowedBranches || undefined,
  });

  const currency = company.currencyCode;
  const balanced = statement.totals.balanceDifference.abs().lte("0.0001");

  const pnlSections = [
    { label: "1. Operating Revenue & Turnover", class: AccountClass.REVENUE },
    { label: "2. Cost of Goods Sold (Inventory Purchases & Inward Freight)", class: AccountClass.COGS },
    { label: "3. Operating & Administrative Expenses", class: AccountClass.EXPENSE },
  ];

  const bsSections = [
    { label: "Current & Fixed Assets", class: AccountClass.ASSET },
    { label: "Current & Non-Current Liabilities", class: AccountClass.LIABILITY },
    { label: "Shareholder Capital & Equity", class: AccountClass.EQUITY },
  ];

  return (
    <div className="mx-auto max-w-[1050px] p-4 sm:p-6">
      <ReportPrintHeader
        company={company}
        title="Comprehensive Financial Statements"
        subtitle={`${period.name} · ${period.fiscalYear.code}`}
        periodLabel={`${formatDate(period.startDate)} through ${formatDate(period.endDate)}`}
        branchName={branchObj ? `${branchObj.code} · ${branchObj.name}` : "All Authorized Branches"}
        backHref="/finance/reports"
        status={balanced ? "Reconciled & Balanced" : "Balance Variance"}
        metaItems={[
          { label: "Fiscal Period", value: period.name },
          { label: "Accounting Standard", value: "Double-Entry Accrual" },
          { label: "Currency", value: currency },
          { label: "Balance Check", value: `Diff: ${formatMoney(statement.totals.balanceDifference.toString(), currency)}` },
        ]}
      />

      <article className="print-document space-y-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {/* 1. Statement of Profit & Loss */}
        <section className="print-break-avoid">
          <div className="border-b-2 border-slate-900 pb-2 mb-4 flex items-center justify-between">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-950">
              I. Statement of Profit and Loss (Income Statement)
            </h2>
            <span className="text-[11px] text-slate-500">Period Activity ({period.name})</span>
          </div>

          <div className="space-y-4">
            {pnlSections.map((sec) => {
              const rows = statement.profitAndLoss.filter((r) => r.accountClass === sec.class);
              const subtotal = rows.reduce((s, r) => s.plus(r.amount), statement.totals.revenue.times(0));
              return (
                <div key={sec.label} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 flex justify-between">
                    <span>{sec.label}</span>
                    <span className="font-mono">{formatMoney(subtotal.toString(), currency)}</span>
                  </div>
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-slate-100">
                      {rows.length ? (
                        rows.map((row) => (
                          <tr key={row.id}>
                            <td className="px-3 py-2 text-slate-500 font-mono w-24">{row.code}</td>
                            <td className="px-3 py-2 text-slate-800 font-medium">{row.name}</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">
                              {formatMoney(row.amount.toString(), currency)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="px-3 py-2 text-center text-slate-400 italic text-[11px]">
                            No posted activity in this section.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })}

            {/* P&L Bottom Summary */}
            <div className="rounded-lg border-2 border-slate-900 bg-slate-50 p-4 text-xs font-bold space-y-1.5">
              <div className="flex justify-between text-slate-800">
                <span>Total Operating Revenue</span>
                <span className="font-mono">{formatMoney(statement.totals.revenue.toString(), currency)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Cost of Goods Sold (COGS)</span>
                <span className="font-mono">({formatMoney(statement.totals.cogs.toString(), currency)})</span>
              </div>
              <div className="flex justify-between text-blue-900 border-t border-slate-300 pt-1.5 text-sm">
                <span>Gross Profit</span>
                <span className="font-mono">{formatMoney(statement.totals.grossProfit.toString(), currency)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Operating Expenses</span>
                <span className="font-mono">({formatMoney(statement.totals.expenses.toString(), currency)})</span>
              </div>
              <div className="flex justify-between text-emerald-900 border-t-2 border-slate-900 pt-2 text-base font-extrabold">
                <span>Net Operating Profit / (Loss)</span>
                <span className="font-mono">{formatMoney(statement.totals.netProfit.toString(), currency)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Statement of Financial Position (Balance Sheet) */}
        <section className="print-break-avoid">
          <div className="border-b-2 border-slate-900 pb-2 mb-4 flex items-center justify-between">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-950">
              II. Statement of Financial Position (Balance Sheet)
            </h2>
            <span className="text-[11px] text-slate-500">As of {formatDate(period.endDate)}</span>
          </div>

          <div className="space-y-4">
            {bsSections.map((sec) => {
              const rows = statement.balanceSheet.filter((r) => r.accountClass === sec.class);
              const subtotal = rows.reduce((s, r) => s.plus(r.amount), statement.totals.assets.times(0));
              return (
                <div key={sec.label} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 flex justify-between">
                    <span>{sec.label}</span>
                    <span className="font-mono">{formatMoney(subtotal.toString(), currency)}</span>
                  </div>
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-slate-100">
                      {rows.length ? (
                        rows.map((row) => (
                          <tr key={row.id}>
                            <td className="px-3 py-2 text-slate-500 font-mono w-24">{row.code}</td>
                            <td className="px-3 py-2 text-slate-800 font-medium">{row.name}</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">
                              {formatMoney(row.amount.toString(), currency)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="px-3 py-2 text-center text-slate-400 italic text-[11px]">
                            No posted balance.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })}

            {/* Balance Sheet Verification Box */}
            <div className="rounded-lg border-2 border-slate-900 bg-slate-50 p-4 text-xs font-bold space-y-1.5">
              <div className="flex justify-between text-slate-900 text-sm">
                <span>Total Assets</span>
                <span className="font-mono">{formatMoney(statement.totals.assets.toString(), currency)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>Total Liabilities</span>
                <span className="font-mono">{formatMoney(statement.totals.liabilities.toString(), currency)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>Share Capital & Paid-in Equity</span>
                <span className="font-mono">{formatMoney(statement.totals.equity.toString(), currency)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>Cumulative Retained Earnings</span>
                <span className="font-mono">{formatMoney(statement.totals.cumulativeEarnings.toString(), currency)}</span>
              </div>
              <div className="flex justify-between text-blue-900 border-t border-slate-300 pt-1.5 text-sm">
                <span>Total Liabilities, Equity & Earnings</span>
                <span className="font-mono">
                  {formatMoney(
                    statement.totals.liabilities
                      .plus(statement.totals.equity)
                      .plus(statement.totals.cumulativeEarnings)
                      .toString(),
                    currency
                  )}
                </span>
              </div>
              <div className={`flex justify-between border-t-2 border-slate-900 pt-2 text-xs ${balanced ? "text-emerald-900" : "text-rose-900"}`}>
                <span>Balance Sheet Difference (Assets − [Liabilities + Equity + Earnings])</span>
                <span className="font-mono font-extrabold">
                  {formatMoney(statement.totals.balanceDifference.toString(), currency)} ({balanced ? "Balanced" : "Variance Detected"})
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Statement of Cash Flows */}
        <section className="print-break-avoid">
          <div className="border-b-2 border-slate-900 pb-2 mb-4 flex items-center justify-between">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-950">
              III. Statement of Cash Flows
            </h2>
            <span className="text-[11px] text-slate-500">Net Posted Bank Movements</span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 border border-slate-200 rounded-lg p-3 text-center bg-slate-50">
            <div>
              <span className="block text-[9px] uppercase font-bold text-slate-500">Operating</span>
              <span className="text-sm font-bold text-slate-900 font-mono mt-1 block">
                {formatMoney(statement.cashFlow.OPERATING.toString(), currency)}
              </span>
            </div>
            <div>
              <span className="block text-[9px] uppercase font-bold text-slate-500">Investing</span>
              <span className="text-sm font-bold text-slate-900 font-mono mt-1 block">
                {formatMoney(statement.cashFlow.INVESTING.toString(), currency)}
              </span>
            </div>
            <div>
              <span className="block text-[9px] uppercase font-bold text-slate-500">Financing</span>
              <span className="text-sm font-bold text-slate-900 font-mono mt-1 block">
                {formatMoney(statement.cashFlow.FINANCING.toString(), currency)}
              </span>
            </div>
            <div>
              <span className="block text-[9px] uppercase font-bold text-slate-500">Unclassified</span>
              <span className="text-sm font-bold text-slate-900 font-mono mt-1 block">
                {formatMoney(statement.cashFlow.NONE.toString(), currency)}
              </span>
            </div>
            <div className="border-l border-slate-300 pl-2">
              <span className="block text-[9px] uppercase font-bold text-slate-900">Net Movement</span>
              <span className="text-sm font-extrabold text-blue-950 font-mono mt-1 block">
                {formatMoney(statement.cashFlow.netMovement.toString(), currency)}
              </span>
            </div>
          </div>
        </section>

        {/* Signatures */}
        <ReportPrintSignatures
          signers={[
            { name: "Chief Financial Accountant", role: "Prepared by" },
            { name: "Certified Public Accountant", role: "Audited & Verified" },
            { name: "Board of Directors / MD", role: "Approved by" },
          ]}
          notes="These financial statements are prepared from the verified company ledger under standard accounting principles. All figures reflect authoritative posted journal lines."
          documentId={`FS-${period.fiscalYear.code}-${period.name}`}
        />
      </article>
    </div>
  );
}

