import { notFound } from "next/navigation";
import bwipjs from "bwip-js/node";
import { ReportPrintHeader } from "@/components/print/report-print-header";
import { ReportPrintSignatures } from "@/components/print/report-print-signatures";
import { assertPermittedBranch, requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";
import { idSchema } from "@/lib/validation";

type PageProps = { params: Promise<{ id: string }> };

export default async function JournalVoucherPrintPage({ params }: PageProps) {
  const context = await requirePagePermission("GL_VIEW");
  const id = idSchema.parse((await params).id);

  const journal = await prisma.journalEntry.findFirst({
    where: { id, companyId: context.company.id },
    include: {
      company: true,
      branch: true,
      period: true,
      preparedBy: { select: { fullName: true } },
      approvedBy: { select: { fullName: true } },
      postedBy: { select: { fullName: true } },
      lines: {
        include: {
          account: { select: { code: true, name: true, accountClass: true } },
          customer: { select: { code: true, name: true } },
          supplier: { select: { code: true, name: true } },
          bankAccount: { select: { code: true, bankName: true } },
        },
        orderBy: [{ id: "asc" }],
      },
    },
  });

  if (!journal) notFound();
  assertPermittedBranch(context, "GL_VIEW", journal.branchId);

  const currency = journal.company.currencyCode;
  const isBalanced = journal.totalDebit.equals(journal.totalCredit);

  let barcodeSvg = "";
  try {
    barcodeSvg = bwipjs.toSVG({
      bcid: "code128",
      text: journal.voucherNumber,
      scale: 2,
      height: 10,
      includetext: true,
      textxalign: "center",
      backgroundcolor: "FFFFFF",
    });
  } catch {
    barcodeSvg = "";
  }

  return (
    <div className="mx-auto max-w-[1000px] p-4 sm:p-6">
      <ReportPrintHeader
        company={journal.company}
        title="Journal Voucher"
        documentNumber={journal.voucherNumber}
        status={journal.status}
        branchName={`${journal.branch.code} · ${journal.branch.name}`}
        backHref={`/finance/journals/${journal.id}`}
        metaItems={[
          { label: "Posting Date", value: formatDate(journal.postingDate) },
          { label: "Voucher Type", value: titleCase(journal.voucherType) },
          { label: "Source Module", value: journal.sourceModule || "MANUAL" },
          { label: "Fiscal Period", value: journal.period.name },
        ]}
      />

      <article className="print-document rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {/* Narration & Reference Details */}
        <section className="mb-6 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Narration / Business Purpose
              </span>
              <p className="mt-1 font-semibold text-slate-800">{journal.narration}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-right sm:text-left">
              <div>
                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Reference Document
                </span>
                <span className="font-semibold text-slate-800">
                  {journal.referenceDocument || journal.sourceDocumentNumber || "None"}
                </span>
              </div>
              <div>
                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Cash Flow Classification
                </span>
                <span className="font-semibold text-slate-800">
                  {journal.cashFlowActivity !== "NONE" ? journal.cashFlowActivity : "Non-Cash"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Double-Entry Ledger Lines Table */}
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-900 text-white print:bg-black">
              <th className="px-3 py-2.5 text-center w-10">#</th>
              <th className="px-3 py-2.5 text-left">Account</th>
              <th className="px-3 py-2.5 text-left">Description / Subledger Party</th>
              <th className="px-3 py-2.5 text-right w-32">Debit ({currency})</th>
              <th className="px-3 py-2.5 text-right w-32">Credit ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {journal.lines.map((line, idx) => (
              <tr key={line.id} className="print-break-avoid">
                <td className="px-3 py-3 text-center text-slate-400 text-[10px]">{idx + 1}</td>
                <td className="px-3 py-3">
                  <div className="font-bold text-slate-900">
                    {line.account.code} · {line.account.name}
                  </div>
                  <span className="text-[10px] text-slate-400 uppercase">
                    {line.account.accountClass}
                  </span>
                </td>
                <td className="px-3 py-3 text-slate-700">
                  <div>{line.description || journal.narration}</div>
                  {line.customer ? (
                    <span className="inline-block mt-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700">
                      Customer: {line.customer.code} · {line.customer.name}
                    </span>
                  ) : null}
                  {line.supplier ? (
                    <span className="inline-block mt-0.5 rounded bg-purple-50 px-1.5 py-0.5 text-[9px] font-semibold text-purple-700">
                      Supplier: {line.supplier.code} · {line.supplier.name}
                    </span>
                  ) : null}
                  {line.bankAccount ? (
                    <span className="inline-block mt-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                      Bank: {line.bankAccount.code} · {line.bankAccount.bankName}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                  {line.baseDebit.gt(0) ? formatMoney(line.baseDebit.toString(), currency) : "—"}
                </td>
                <td className="px-3 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                  {line.baseCredit.gt(0) ? formatMoney(line.baseCredit.toString(), currency) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-900 bg-slate-50 font-bold text-slate-900 print:bg-slate-100">
            <tr>
              <td colSpan={3} className="px-4 py-3 text-right uppercase tracking-wider text-[10px]">
                Total ({isBalanced ? "Balanced" : "Unbalanced"}):
              </td>
              <td className="px-3 py-3 text-right font-mono text-sm tabular-nums">
                {formatMoney(journal.totalDebit.toString(), currency)}
              </td>
              <td className="px-3 py-3 text-right font-mono text-sm tabular-nums">
                {formatMoney(journal.totalCredit.toString(), currency)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Barcode & Audit Details */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
          {barcodeSvg ? (
            <div className="w-52" dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
          ) : <div />}
          <div className="text-right text-[10px] text-slate-400">
            <div>Status: {journal.status}</div>
            <div>Posting Date: {formatDate(journal.postingDate)}</div>
          </div>
        </div>

        {/* 3 Signatures */}
        <ReportPrintSignatures
          signers={[
            { name: journal.preparedBy.fullName, role: "Prepared by" },
            { name: journal.approvedBy?.fullName || "Pending Approval", role: "Approved by" },
            { name: journal.postedBy?.fullName || "Pending Posting", role: "Posted by" },
          ]}
          documentId={journal.id}
        />
      </article>
    </div>
  );
}

