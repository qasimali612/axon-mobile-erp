import { notFound } from "next/navigation";
import { ReportPrintHeader } from "@/components/print/report-print-header";
import { ReportPrintSignatures } from "@/components/print/report-print-signatures";
import { permittedBranchIds, requirePermission } from "@/lib/auth";
import { getPartyStatement, parseLedgerDate, type PartyLedgerKind } from "@/lib/finance/subledger";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";
import { idSchema } from "@/lib/validation";

type PageProps = {
  params: Promise<{ kind: string; id: string }>;
  searchParams: Promise<{ from?: string; to?: string; branchId?: string }>;
};

function kindValue(value: string): PartyLedgerKind {
  if (value === "customer" || value === "supplier") return value;
  notFound();
}

export default async function PartyStatementPrintPage({ params, searchParams }: PageProps) {
  const { kind: rawKind, id: rawId } = await params;
  const kind = kindValue(rawKind);
  const id = idSchema.parse(rawId);
  const sParams = await searchParams;

  const permission = kind === "customer" ? "CUSTOMER_LEDGER_VIEW" : "SUPPLIER_LEDGER_VIEW";
  const context = await requirePermission(permission);

  const allowedBranches = permittedBranchIds(context, permission);
  const requestedBranchId = sParams.branchId || null;

  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const defaultFrom = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const from = parseLedgerDate(sParams.from || null, "From date", defaultFrom);
  const to = parseLedgerDate(sParams.to || null, "To date", today);

  const [company, report] = await Promise.all([
    prisma.company.findUnique({ where: { id: context.company.id } }),
    getPartyStatement({
      companyId: context.company.id,
      kind,
      partyId: id,
      from,
      to,
      branchIds: requestedBranchId ? [requestedBranchId] : allowedBranches,
    }),
  ]);

  if (!company || !report) notFound();

  const currency = company.currencyCode;
  const partyLabel = kind === "customer" ? "Customer" : "Supplier";
  const title = `${partyLabel} Subledger Statement`;

  return (
    <div className="mx-auto max-w-[1050px] p-4 sm:p-6">
      <ReportPrintHeader
        company={company}
        title={title}
        subtitle={`Official Account Statement · ${report.party.code}`}
        periodLabel={`${formatDate(from)} through ${formatDate(to)}`}
        backHref="/finance/subledgers"
        metaItems={[
          { label: `${partyLabel} Code`, value: report.party.code },
          { label: "Currency", value: currency },
          { label: "Credit Limit", value: report.party.creditLimit ? formatMoney(report.party.creditLimit.toString(), currency) : "Not Set" },
          { label: "Payment Terms", value: `${report.party.paymentTermsDays || 0} Days` },
        ]}
      />

      <article className="print-document rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {/* Party Details & Summary Card */}
        <div className="mb-6 grid gap-6 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2">
          <div>
            <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Account Party Information
            </span>
            <h2 className="mt-1 text-lg font-bold text-slate-950">
              {report.party.name}
            </h2>
            <p className="mt-0.5 text-xs text-slate-600 font-mono">
              Code: {report.party.code} · Status: {report.party.status}
            </p>
            {report.party.phone ? (
              <p className="text-xs text-slate-600 mt-1">Phone: {report.party.phone}</p>
            ) : null}
            {report.party.email ? (
              <p className="text-xs text-slate-600">Email: {report.party.email}</p>
            ) : null}
            {report.party.address ? (
              <p className="text-xs text-slate-600 mt-1">Address: {report.party.address}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 text-right sm:text-left">
            <div className="rounded-lg border border-slate-200 bg-white p-2.5">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Opening Balance
              </span>
              <span className="text-sm font-bold text-slate-900 mt-0.5 block font-mono">
                {formatMoney(report.openingBalance.toString(), currency)}
              </span>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-2.5">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Period Debits (+)
              </span>
              <span className="text-sm font-bold text-slate-900 mt-0.5 block font-mono">
                {formatMoney(report.periodDebit.toString(), currency)}
              </span>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-2.5">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Period Credits (−)
              </span>
              <span className="text-sm font-bold text-slate-900 mt-0.5 block font-mono">
                {formatMoney(report.periodCredit.toString(), currency)}
              </span>
            </div>
            <div className="rounded-lg border-2 border-slate-900 bg-slate-950 text-white p-2.5 print:bg-black">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-300">
                Closing Balance
              </span>
              <span className="text-sm font-extrabold mt-0.5 block font-mono">
                {formatMoney(report.closingBalance.toString(), currency)}
              </span>
            </div>
          </div>
        </div>

        {/* Aging Summary Row */}
        <section className="mb-6 rounded-xl border border-slate-200 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Aging Analysis Breakdown
            </h3>
            <span className="text-[10px] text-slate-400">Calculated as of statement date</span>
          </div>
          <div className="grid grid-cols-5 divide-x divide-slate-100 text-center text-xs">
            <div className="p-2">
              <span className="block text-[9px] font-bold uppercase text-slate-400">Current</span>
              <span className="font-bold text-slate-800 font-mono mt-1 block">
                {formatMoney(report.aging.current.toString(), currency)}
              </span>
            </div>
            <div className="p-2">
              <span className="block text-[9px] font-bold uppercase text-slate-400">1–30 Days</span>
              <span className="font-bold text-slate-800 font-mono mt-1 block">
                {formatMoney(report.aging.days1To30.toString(), currency)}
              </span>
            </div>
            <div className="p-2">
              <span className="block text-[9px] font-bold uppercase text-slate-400">31–60 Days</span>
              <span className="font-bold text-slate-800 font-mono mt-1 block">
                {formatMoney(report.aging.days31To60.toString(), currency)}
              </span>
            </div>
            <div className="p-2">
              <span className="block text-[9px] font-bold uppercase text-slate-400">61–90 Days</span>
              <span className="font-bold text-slate-800 font-mono mt-1 block">
                {formatMoney(report.aging.days61To90.toString(), currency)}
              </span>
            </div>
            <div className="p-2">
              <span className="block text-[9px] font-bold uppercase text-rose-600">Over 90 Days</span>
              <span className="font-bold text-rose-700 font-mono mt-1 block">
                {formatMoney(report.aging.daysOver90.toString(), currency)}
              </span>
            </div>
          </div>
        </section>

        {/* Itemized Chronological Ledger Table */}
        <section className="mb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3">
            Chronological Transaction Ledger
          </h3>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white print:bg-black">
                <th className="px-3 py-2.5 text-left">Posting Date</th>
                <th className="px-3 py-2.5 text-left">Voucher #</th>
                <th className="px-3 py-2.5 text-left">Source Document / Reference</th>
                <th className="px-3 py-2.5 text-left">Branch</th>
                <th className="px-3 py-2.5 text-left">Description</th>
                <th className="px-3 py-2.5 text-right w-24">Debit</th>
                <th className="px-3 py-2.5 text-right w-24">Credit</th>
                <th className="px-3 py-2.5 text-right w-28">Running Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Opening Balance Row */}
              <tr className="bg-slate-50/80 font-semibold text-slate-700">
                <td className="px-3 py-2.5">{formatDate(from)}</td>
                <td className="px-3 py-2.5">—</td>
                <td className="px-3 py-2.5 italic">Opening Balance</td>
                <td className="px-3 py-2.5">—</td>
                <td className="px-3 py-2.5">Balance brought forward</td>
                <td className="px-3 py-2.5 text-right">—</td>
                <td className="px-3 py-2.5 text-right">—</td>
                <td className="px-3 py-2.5 text-right font-bold font-mono">
                  {formatMoney(report.openingBalance.toString(), currency)}
                </td>
              </tr>

              {report.transactions.length ? (
                report.transactions.map((t) => (
                  <tr key={t.id} className="print-break-avoid">
                    <td className="px-3 py-2.5 text-[11px] text-slate-600">
                      {formatDate(t.postingDate)}
                    </td>
                    <td className="px-3 py-2.5 font-mono font-bold text-slate-900">
                      {t.voucherNumber}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-slate-800">
                        {t.sourceDocumentNumber || t.reference || t.sourceDocumentType || t.sourceModule}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{t.branch.code}</td>
                    <td className="px-3 py-2.5 text-slate-600 max-w-[220px] truncate" title={t.description}>
                      {t.description}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-900">
                      {t.debit.gt(0) ? formatMoney(t.debit.toString(), currency) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-900">
                      {t.credit.gt(0) ? formatMoney(t.credit.toString(), currency) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-950">
                      {formatMoney(t.runningBalance.toString(), currency)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-xs text-slate-400">
                    No transactions recorded during this period.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t-2 border-slate-900 bg-slate-50 font-bold text-slate-900 print:bg-slate-100">
              <tr>
                <td colSpan={5} className="px-3 py-3 text-right uppercase tracking-wider text-[10px]">
                  Totals & Statement Closing Balance:
                </td>
                <td className="px-3 py-3 text-right font-mono">
                  {formatMoney(report.periodDebit.toString(), currency)}
                </td>
                <td className="px-3 py-3 text-right font-mono">
                  {formatMoney(report.periodCredit.toString(), currency)}
                </td>
                <td className="px-3 py-3 text-right font-mono text-sm text-blue-900">
                  {formatMoney(report.closingBalance.toString(), currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* Open Invoices & Documents (if any) */}
        {report.openItems.length > 0 ? (
          <section className="mb-6 print-break-avoid">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
              Unpaid / Open Invoices & Allocations
            </h3>
            <table className="w-full border-collapse text-xs border border-slate-200">
              <thead className="bg-slate-100 text-[9px] uppercase font-bold text-slate-600">
                <tr>
                  <th className="p-2 text-left">Document #</th>
                  <th className="p-2 text-left">Invoice Date</th>
                  <th className="p-2 text-left">Due Date</th>
                  <th className="p-2 text-right">Original Amount</th>
                  <th className="p-2 text-right">Returns</th>
                  <th className="p-2 text-right">Allocated / Paid</th>
                  <th className="p-2 text-right">Open Balance</th>
                  <th className="p-2 text-right">Days Past Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.openItems.map((item) => (
                  <tr key={item.id}>
                    <td className="p-2 font-mono font-bold text-slate-900">{item.number}</td>
                    <td className="p-2 text-slate-600">{formatDate(item.documentDate)}</td>
                    <td className="p-2 text-slate-600">{formatDate(item.dueDate)}</td>
                    <td className="p-2 text-right font-mono">{formatMoney(item.originalAmount.toString(), currency)}</td>
                    <td className="p-2 text-right font-mono">{formatMoney(item.returnsAmount.toString(), currency)}</td>
                    <td className="p-2 text-right font-mono">{formatMoney(item.allocatedAmount.toString(), currency)}</td>
                    <td className="p-2 text-right font-mono font-bold text-slate-900">{formatMoney(item.openAmount.toString(), currency)}</td>
                    <td className={`p-2 text-right font-bold ${item.daysPastDue > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                      {item.daysPastDue > 0 ? `${item.daysPastDue}d Overdue` : "Current"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {/* 3 Signatures */}
        <ReportPrintSignatures
          signers={[
            { name: "Accountant", role: "Prepared by" },
            { name: "Finance Manager", role: "Verified & Approved by" },
            { name: report.party.name, role: `${partyLabel} Confirmation & Stamp` },
          ]}
          notes="Please verify this statement and report any discrepancy within 7 business days. Payment must be deposited in our official company bank account."
          documentId={`${report.party.code}-${formatDate(to)}`}
        />
      </article>
    </div>
  );
}

