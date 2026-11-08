import { notFound } from "next/navigation";
import { ReportPrintHeader } from "@/components/print/report-print-header";
import { ReportPrintSignatures } from "@/components/print/report-print-signatures";
import { permittedBranchIds, requirePagePermission } from "@/lib/auth";
import { getCashInHandReport } from "@/lib/finance/cash-in-hand";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (val: string | string[] | undefined) =>
  Array.isArray(val) ? val[0] : val;

const DENOMINATIONS = [5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1];

export default async function CashInHandPrintPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const context = await requirePagePermission("FINANCIAL_REPORTS_VIEW");
  const params = await searchParams;
  const companyId = context.company.id;
  const allowedBranches = permittedBranchIds(context, "FINANCIAL_REPORTS_VIEW");

  const [company, branches] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.branch.findMany({
      where: {
        companyId,
        isActive: true,
        ...(allowedBranches ? { id: { in: allowedBranches } } : {}),
      },
      select: { id: true, code: true, name: true },
    }),
  ]);

  if (!company) notFound();

  const today = new Date();
  const defaultFromStr = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const defaultToStr = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  const fromDate = first(params.from) || defaultFromStr;
  const toDate = first(params.to) || defaultToStr;

  const requestedBranch = first(params.branch);
  const branchId =
    requestedBranch && (!allowedBranches || allowedBranches.includes(requestedBranch))
      ? requestedBranch
      : undefined;

  const branchObj = branches.find((b) => b.id === branchId);
  const accountId = first(params.account) || undefined;

  const report = await getCashInHandReport({
    companyId,
    from: new Date(`${fromDate}T00:00:00.000Z`),
    to: new Date(`${toDate}T23:59:59.999Z`),
    branchId,
    branchIds: branchId ? undefined : allowedBranches || undefined,
    accountId,
  });

  const currency = company.currencyCode;
  const summary = report.periodSummary;
  const selectedAccount = accountId
    ? report.accounts.find((a: { id: string; code: string; name: string }) => a.id === accountId)
    : null;

  // Parse denomination counts from query parameters
  const denomRows = DENOMINATIONS.map((d) => {
    const raw = first(params[`d_${d}`]);
    const count = raw ? parseInt(raw, 10) : 0;
    return {
      denom: d,
      count,
      total: count * d,
      hasCount: Boolean(raw && count > 0),
    };
  });

  const hasAnyCounts = denomRows.some((r) => r.hasCount);
  const countedPhysicalTotal = hasAnyCounts
    ? denomRows.reduce((sum, r) => sum + r.total, 0)
    : first(params.physicalCount)
    ? Number(first(params.physicalCount))
    : null;

  const closingBookNumber = Number(summary.closingBalance);
  const physicalVariance =
    countedPhysicalTotal !== null ? countedPhysicalTotal - closingBookNumber : null;

  const isSameDay = fromDate === toDate;
  const periodLabel = isSameDay
    ? `Shift Date: ${formatDate(fromDate)}`
    : `Period: ${formatDate(fromDate)} to ${formatDate(toDate)}`;

  return (
    <div className="mx-auto max-w-[1100px] p-4 sm:p-6 print:p-0">
      {/* Universal Report Print Header */}
      <ReportPrintHeader
        company={company}
        title="Daily Cash Sheet & Vault Register"
        subtitle="Authoritative Shift Closing, Counter Receipts, Disbursements & Denomination Count"
        periodLabel={periodLabel}
        branchName={branchObj ? `${branchObj.code} · ${branchObj.name}` : "All Authorized Branches"}
        backHref="/finance/reports/cash-in-hand"
        metaItems={[
          { label: "Currency", value: currency },
          {
            label: "Cash Account",
            value: selectedAccount
              ? `${selectedAccount.code} · ${selectedAccount.name}`
              : "1000 · Cash on Hand (Consolidated)",
          },
          {
            label: "Opening Cash",
            value: formatMoney(summary.openingBalance.toString(), currency),
          },
          {
            label: "Closing Book Cash",
            value: formatMoney(summary.closingBalance.toString(), currency),
          },
        ]}
      />

      <article className="print-document rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 print:border-none print:p-0 print:shadow-none">
        {/* Executive Summary Cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5 text-center">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[10px] uppercase font-bold text-slate-500">
              Opening Cash
            </span>
            <span className="mt-1 block font-mono text-sm font-bold text-slate-900">
              {formatMoney(summary.openingBalance.toString(), currency)}
            </span>
            <span className="text-[10px] text-slate-400">Balance brought forward</span>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
            <span className="block text-[10px] uppercase font-bold text-emerald-800">
              Total Receipts (+)
            </span>
            <span className="mt-1 block font-mono text-sm font-bold text-emerald-900">
              +{formatMoney(summary.totalInflows.toString(), currency)}
            </span>
            <span className="text-[10px] text-emerald-600">Counter sales & recoveries</span>
          </div>

          <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3">
            <span className="block text-[10px] uppercase font-bold text-rose-800">
              Disbursements (−)
            </span>
            <span className="mt-1 block font-mono text-sm font-bold text-rose-900">
              -{formatMoney(summary.totalOutflows.toString(), currency)}
            </span>
            <span className="text-[10px] text-rose-600">Suppliers, expenses & bank</span>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[10px] uppercase font-bold text-slate-600">
              Net Shift Movement
            </span>
            <span
              className={`mt-1 block font-mono text-sm font-bold ${
                summary.netMovement.gte(0) ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {summary.netMovement.gte(0) ? "+" : ""}
              {formatMoney(summary.netMovement.toString(), currency)}
            </span>
            <span className="text-[10px] text-slate-400">Receipts minus payments</span>
          </div>

          <div className="col-span-2 sm:col-span-1 rounded-lg border-2 border-slate-900 bg-slate-900 p-3 text-white print:border-black print:bg-black">
            <span className="block text-[10px] uppercase font-bold text-slate-300">
              Closing Book Cash
            </span>
            <span className="mt-1 block font-mono text-base font-extrabold text-white">
              {formatMoney(summary.closingBalance.toString(), currency)}
            </span>
            <span className="text-[10px] text-slate-400">Official ledger balance</span>
          </div>
        </div>

        {/* Breakdown by Operational Module / Source */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          {/* Inflows Breakdown */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-3.5">
            <div className="mb-2 flex items-center justify-between border-b border-emerald-200/70 pb-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                Receipts & Collections Breakdown
              </span>
              <span className="font-mono text-xs font-bold text-emerald-800">
                +{formatMoney(summary.totalInflows.toString(), currency)}
              </span>
            </div>
            {report.sourceBreakdown.inflows.length > 0 ? (
              <div className="space-y-1 text-xs">
                {report.sourceBreakdown.inflows.map((item) => (
                  <div key={item.label} className="flex items-center justify-between py-0.5 text-slate-700">
                    <span>
                      {item.label}{" "}
                      <span className="text-[10px] text-slate-400">({item.count} trx)</span>
                    </span>
                    <span className="font-mono font-semibold text-emerald-800">
                      +{formatMoney(item.total.toString(), currency)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No cash receipts during this period.</p>
            )}
          </div>

          {/* Outflows Breakdown */}
          <div className="rounded-lg border border-rose-200 bg-rose-50/30 p-3.5">
            <div className="mb-2 flex items-center justify-between border-b border-rose-200/70 pb-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-900">
                Disbursements & Payments Breakdown
              </span>
              <span className="font-mono text-xs font-bold text-rose-800">
                -{formatMoney(summary.totalOutflows.toString(), currency)}
              </span>
            </div>
            {report.sourceBreakdown.outflows.length > 0 ? (
              <div className="space-y-1 text-xs">
                {report.sourceBreakdown.outflows.map((item) => (
                  <div key={item.label} className="flex items-center justify-between py-0.5 text-slate-700">
                    <span>
                      {item.label}{" "}
                      <span className="text-[10px] text-slate-400">({item.count} trx)</span>
                    </span>
                    <span className="font-mono font-semibold text-rose-800">
                      -{formatMoney(item.total.toString(), currency)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No cash disbursements during this period.</p>
            )}
          </div>
        </div>

        {/* Physical Cash Denomination & Drawer Reconciliation Section */}
        <div className="mb-6 rounded-lg border-2 border-slate-300 bg-slate-50/50 p-4 print:border-slate-400">
          <div className="mb-3 flex items-center justify-between border-b border-slate-300 pb-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Physical Cash Denomination Count & Drawer Reconciliation
              </h3>
              <p className="text-[10px] text-slate-500">
                Mandatory physical cash tally verified at shift closing by Cashier and Supervisor.
              </p>
            </div>
            <span className="rounded bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white uppercase print:bg-black">
              Audit Sheet
            </span>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {/* Left: Denomination Grid */}
            <div>
              <table className="w-full text-left text-xs border border-slate-300">
                <thead className="bg-slate-200 text-slate-800 uppercase text-[9px] font-bold">
                  <tr>
                    <th className="p-1.5">Denomination Note</th>
                    <th className="p-1.5 text-center">Pcs / Count</th>
                    <th className="p-1.5 text-right">Total Amount ({currency})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {denomRows.map((r) => (
                    <tr key={r.denom}>
                      <td className="p-1.5 font-semibold text-slate-700 font-mono">
                        {formatMoney(r.denom, currency)}
                      </td>
                      <td className="p-1.5 text-center font-mono font-bold text-slate-900">
                        {r.hasCount ? (
                          r.count
                        ) : (
                          <span className="inline-block w-16 border-b border-dashed border-slate-400 text-center text-slate-300">
                            &nbsp;
                          </span>
                        )}
                      </td>
                      <td className="p-1.5 text-right font-mono font-medium text-slate-900">
                        {r.hasCount ? (
                          formatMoney(r.total, currency)
                        ) : (
                          <span className="inline-block w-20 border-b border-dashed border-slate-400 text-right text-slate-300">
                            &nbsp;
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="p-1.5 font-semibold text-slate-700">Coins / Small Change</td>
                    <td className="p-1.5 text-center font-mono">
                      <span className="inline-block w-16 border-b border-dashed border-slate-400 text-center text-slate-300">
                        &nbsp;
                      </span>
                    </td>
                    <td className="p-1.5 text-right font-mono">
                      <span className="inline-block w-20 border-b border-dashed border-slate-400 text-right text-slate-300">
                        &nbsp;
                      </span>
                    </td>
                  </tr>
                </tbody>
                <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900">
                  <tr>
                    <td colSpan={2} className="p-1.5 uppercase text-[10px]">
                      Total Physical Cash Counted:
                    </td>
                    <td className="p-1.5 text-right font-mono text-sm font-extrabold text-slate-950">
                      {countedPhysicalTotal !== null ? (
                        formatMoney(countedPhysicalTotal, currency)
                      ) : (
                        <span className="inline-block w-24 border-b-2 border-slate-900 text-right">
                          &nbsp;
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Right: Drawer Reconciliation Status & Custodian Certification */}
            <div className="flex flex-col justify-between space-y-3">
              <div className="rounded-lg border border-slate-300 bg-white p-3 space-y-2">
                <span className="block text-[10px] uppercase font-bold text-slate-500">
                  Drawer Reconciliation Statement
                </span>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Physical Cash Counted:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {countedPhysicalTotal !== null
                      ? formatMoney(countedPhysicalTotal, currency)
                      : "[ Awaiting Physical Count ]"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Expected Book Cash Balance:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatMoney(summary.closingBalance.toString(), currency)}
                  </span>
                </div>

                <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-xs font-bold">
                  <span>Reconciliation Variance:</span>
                  {physicalVariance !== null ? (
                    <span
                      className={`font-mono ${
                        Math.abs(physicalVariance) < 0.01
                          ? "text-emerald-700"
                          : physicalVariance > 0
                          ? "text-blue-700"
                          : "text-rose-700"
                      }`}
                    >
                      {Math.abs(physicalVariance) < 0.01
                        ? "✓ BALANCED (NIL VARIANCE)"
                        : physicalVariance > 0
                        ? `+${formatMoney(physicalVariance, currency)} (SURPLUS / OVER)`
                        : `${formatMoney(physicalVariance, currency)} (SHORTAGE / DEFICIT)`}
                    </span>
                  ) : (
                    <span className="font-mono text-slate-400">[ Pending Count ]</span>
                  )}
                </div>
              </div>

              {/* Custodian Attestation */}
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-600 leading-relaxed">
                <p className="font-semibold text-slate-800 mb-1">Vault Custodian Certification:</p>
                <p className="italic">
                  &ldquo;I hereby certify that the physical cash in the shop drawer and safe was counted in the presence of the supervisor, and the closing balance above accurately reflects all shift receipts, payouts, and bank deposits.&rdquo;
                </p>
                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                  <span>Discrepancy / Remarks: _____________________________________________</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Chronological Itemized Cash Book Table */}
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Chronological Cash Book Ledger (Movements)
            </h3>
            <span className="text-[11px] text-slate-500 font-medium">
              {report.movements.length} cash movement(s) recorded
            </span>
          </div>

          <table className="w-full text-left text-xs border border-slate-300">
            <thead className="bg-slate-900 text-white uppercase text-[9px] font-bold print:bg-black">
              <tr>
                <th className="p-2.5">Date</th>
                <th className="p-2.5">Voucher #</th>
                <th className="p-2.5">Branch</th>
                <th className="p-2.5">Source / Ref</th>
                <th className="p-2.5">Party / Narration</th>
                <th className="p-2.5 text-right">In (Dr)</th>
                <th className="p-2.5 text-right">Out (Cr)</th>
                <th className="p-2.5 text-right">Running Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              <tr className="bg-slate-50 font-semibold text-slate-700">
                <td className="p-2 text-[11px]">{formatDate(fromDate)}</td>
                <td className="p-2">—</td>
                <td className="p-2">—</td>
                <td className="p-2 text-[10px] text-slate-400">OPENING</td>
                <td className="p-2 italic text-slate-800">
                  Opening Cash Balance Brought Forward
                </td>
                <td className="p-2 text-right">—</td>
                <td className="p-2 text-right">—</td>
                <td className="p-2 text-right font-mono font-bold text-slate-950">
                  {formatMoney(summary.openingBalance.toString(), currency)}
                </td>
              </tr>
              {report.movements.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/80 print-break-avoid">
                  <td className="p-2 text-[11px] text-slate-600 whitespace-nowrap">
                    {formatDate(m.postingDate)}
                  </td>
                  <td className="p-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                    {m.voucherNumber}
                  </td>
                  <td className="p-2 text-slate-600 text-[11px]">{m.branch.code}</td>
                  <td className="p-2 text-[11px] text-slate-500 whitespace-nowrap">
                    {m.sourceDocumentNumber || m.referenceDocument || m.sourceModule}
                  </td>
                  <td className="p-2 text-[11px] text-slate-800 max-w-[280px] truncate">
                    {m.party ? <b className="text-slate-900">{m.party} · </b> : null}
                    {m.description || m.narration}
                  </td>
                  <td className="p-2 text-right font-mono font-semibold text-emerald-800">
                    {m.cashIn.gt(0) ? `+${formatMoney(m.cashIn.toString(), currency)}` : "—"}
                  </td>
                  <td className="p-2 text-right font-mono font-semibold text-rose-800">
                    {m.cashOut.gt(0) ? `-${formatMoney(m.cashOut.toString(), currency)}` : "—"}
                  </td>
                  <td className="p-2 text-right font-mono font-bold text-slate-950">
                    {formatMoney(m.runningBalance.toString(), currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-900 bg-slate-100 font-bold text-slate-950 print:border-black">
              <tr>
                <td colSpan={5} className="p-2.5 text-right uppercase text-[10px]">
                  Closing Cash Book Balance:
                </td>
                <td className="p-2.5 text-right font-mono text-emerald-800">
                  +{formatMoney(summary.totalInflows.toString(), currency)}
                </td>
                <td className="p-2.5 text-right font-mono text-rose-800">
                  -{formatMoney(summary.totalOutflows.toString(), currency)}
                </td>
                <td className="p-2.5 text-right font-mono text-sm font-extrabold text-blue-950">
                  {formatMoney(summary.closingBalance.toString(), currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Official 4-Signatory Authorization Block */}
        <ReportPrintSignatures
          signers={[
            { name: "Cashier / Counter Custodian", role: "Prepared by" },
            { name: "Internal Auditor / Verifier", role: "Counted & Verified by" },
            { name: "Branch Operations Manager", role: "Approved by" },
            { name: "Head Office Accounts", role: "Received & Posted by" },
          ]}
          notes="Vault closing balance must strictly reconcile with the physical count sheet. Any discrepancy or cash variance must be documented with an incident note and reported to the Finance Director immediately."
          documentId={`DCS-${fromDate.replaceAll("-", "")}`}
        />
      </article>
    </div>
  );
}
