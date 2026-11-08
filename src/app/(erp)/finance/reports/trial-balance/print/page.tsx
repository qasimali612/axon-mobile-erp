import { notFound } from "next/navigation";
import { ReportPrintHeader } from "@/components/print/report-print-header";
import { ReportPrintSignatures } from "@/components/print/report-print-signatures";
import { permittedBranchIds, requirePagePermission } from "@/lib/auth";
import { getTrialBalance } from "@/lib/finance/reports";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function TrialBalancePrintPage({
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

  const report = await getTrialBalance({
    companyId,
    from: period.startDate,
    to: period.endDate,
    branchId,
    branchIds: branchId ? undefined : allowedBranches || undefined,
  });

  const currency = company.currencyCode;
  const isBalanced = report.totals.closingDebit.equals(report.totals.closingCredit);

  return (
    <div className="mx-auto max-w-[1100px] p-4 sm:p-6">
      <ReportPrintHeader
        company={company}
        title="Trial Balance"
        subtitle={`${period.name} · ${period.fiscalYear.code}`}
        periodLabel={`${formatDate(period.startDate)} through ${formatDate(period.endDate)}`}
        branchName={branchObj ? `${branchObj.code} · ${branchObj.name}` : "All Authorized Branches"}
        backHref="/finance/reports/trial-balance"
        status={isBalanced ? "Balanced" : "Out of Balance"}
        metaItems={[
          { label: "Fiscal Period", value: period.name },
          { label: "Reporting Basis", value: "Posted & Reversed GL" },
          { label: "Currency", value: currency },
          { label: "Active Accounts", value: `${report.rows.length} Accounts` },
        ]}
      />

      <article className="print-document rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-900 text-white print:bg-black">
              <th rowSpan={2} className="px-3 py-2 text-left">Account</th>
              <th rowSpan={2} className="px-3 py-2 text-left w-20">Class</th>
              <th colSpan={2} className="border-l border-slate-700 px-3 py-1.5 text-center">
                Opening Balance
              </th>
              <th colSpan={2} className="border-l border-slate-700 px-3 py-1.5 text-center">
                Period Movement
              </th>
              <th colSpan={2} className="border-l border-slate-700 px-3 py-1.5 text-center">
                Closing Balance
              </th>
            </tr>
            <tr className="bg-slate-800 text-slate-200 text-[10px] print:bg-slate-900">
              <th className="border-l border-slate-700 px-2 py-1 text-right">Debit</th>
              <th className="px-2 py-1 text-right">Credit</th>
              <th className="border-l border-slate-700 px-2 py-1 text-right">Debit</th>
              <th className="px-2 py-1 text-right">Credit</th>
              <th className="border-l border-slate-700 px-2 py-1 text-right">Debit</th>
              <th className="px-2 py-1 text-right">Credit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {report.rows.map((row) => (
              <tr key={row.id} className="print-break-avoid hover:bg-slate-50/50">
                <td className="px-3 py-2 font-semibold text-slate-800">
                  <span className="font-mono text-slate-900">{row.code}</span>
                  <span className="ml-2 font-normal text-slate-600">{row.name}</span>
                </td>
                <td className="px-3 py-2 text-[10px] uppercase text-slate-400">
                  {titleCase(row.accountClass)}
                </td>
                <td className="border-l border-slate-100 px-2 py-2 text-right font-mono tabular-nums text-slate-600">
                  {row.openingDebit.isZero() ? "—" : formatMoney(row.openingDebit.toString(), currency)}
                </td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-slate-600">
                  {row.openingCredit.isZero() ? "—" : formatMoney(row.openingCredit.toString(), currency)}
                </td>
                <td className="border-l border-slate-100 px-2 py-2 text-right font-mono tabular-nums text-slate-600">
                  {row.periodDebit.isZero() ? "—" : formatMoney(row.periodDebit.toString(), currency)}
                </td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-slate-600">
                  {row.periodCredit.isZero() ? "—" : formatMoney(row.periodCredit.toString(), currency)}
                </td>
                <td className="border-l border-slate-100 px-2 py-2 text-right font-mono font-bold tabular-nums text-slate-900">
                  {row.closingDebit.isZero() ? "—" : formatMoney(row.closingDebit.toString(), currency)}
                </td>
                <td className="px-2 py-2 text-right font-mono font-bold tabular-nums text-slate-900">
                  {row.closingCredit.isZero() ? "—" : formatMoney(row.closingCredit.toString(), currency)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-900 bg-slate-100 font-bold text-slate-950">
            <tr>
              <td colSpan={2} className="px-3 py-3 text-right uppercase tracking-wider text-[10px]">
                Totals:
              </td>
              <td className="border-l border-slate-300 px-2 py-3 text-right font-mono tabular-nums">
                {formatMoney(report.totals.openingDebit.toString(), currency)}
              </td>
              <td className="px-2 py-3 text-right font-mono tabular-nums">
                {formatMoney(report.totals.openingCredit.toString(), currency)}
              </td>
              <td className="border-l border-slate-300 px-2 py-3 text-right font-mono tabular-nums">
                {formatMoney(report.totals.periodDebit.toString(), currency)}
              </td>
              <td className="px-2 py-3 text-right font-mono tabular-nums">
                {formatMoney(report.totals.periodCredit.toString(), currency)}
              </td>
              <td className="border-l border-slate-300 px-2 py-3 text-right font-mono text-sm text-blue-900 tabular-nums">
                {formatMoney(report.totals.closingDebit.toString(), currency)}
              </td>
              <td className="px-2 py-3 text-right font-mono text-sm text-blue-900 tabular-nums">
                {formatMoney(report.totals.closingCredit.toString(), currency)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Audit Signatures */}
        <ReportPrintSignatures
          signers={[
            { name: "General Accountant", role: "Prepared by" },
            { name: "Internal Auditor", role: "Audited & Verified" },
            { name: "Chief Financial Officer", role: "Approved by" },
          ]}
          notes="This trial balance is automatically consolidated from the immutable double-entry general ledger. Zero synthetic or balancing adjustments are inserted."
          documentId={`TB-${period.fiscalYear.code}-${period.name}`}
        />
      </article>
    </div>
  );
}

