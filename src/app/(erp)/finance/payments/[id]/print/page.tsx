import { notFound } from "next/navigation";
import bwipjs from "bwip-js/node";
import { PrintButton } from "@/components/purchase/print-button";
import { assertPermittedBranch, requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idSchema } from "@/lib/validation";

type PageProps = { params: Promise<{ id: string }> };

const amount = (value: { toNumber(): number } | number, currency: string) =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(typeof value === "number" ? value : value.toNumber());

const date = (value: Date | null) =>
  value
    ? new Intl.DateTimeFormat("en-PK", {
        timeZone: "Asia/Karachi",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(value)
    : "—";

function numberToWords(num: number): string {
  const a = [
    "", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ", "Ten ",
    "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ", "Seventeen ", "Eighteen ", "Nineteen ",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function inWords(n: number): string {
    if (n === 0) return "";
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + a[n % 10] : " ");
    if (n < 1000) return inWords(Math.floor(n / 100)) + "Hundred " + (n % 100 !== 0 ? inWords(n % 100) : "");
    if (n < 100000) return inWords(Math.floor(n / 1000)) + "Thousand " + (n % 1000 !== 0 ? inWords(n % 1000) : "");
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + "Lakh " + (n % 100000 !== 0 ? inWords(n % 100000) : "");
    return inWords(Math.floor(n / 10000000)) + "Crore " + (n % 10000000 !== 0 ? inWords(n % 10000000) : "");
  }

  const integerPart = Math.floor(num);
  const words = inWords(integerPart);
  return words ? words.trim() + " Only" : "Zero Only";
}

export default async function PaymentVoucherPrintPage({ params }: PageProps) {
  const context = await requirePagePermission("PAYMENT_VIEW");
  const { id: rawId } = await params;
  const parseResult = idSchema.safeParse(rawId);
  if (!parseResult.success) notFound();
  const id = parseResult.data;

  const payment = await prisma.payment.findFirst({
    where: { id, companyId: context.company.id },
    include: {
      company: true,
      branch: true,
      customer: true,
      supplier: true,
      bankAccount: true,
      cashAccount: true,
      paymentMethod: true,
      preparedBy: { select: { fullName: true } },
      approvedBy: { select: { fullName: true } },
      postedBy: { select: { fullName: true } },
      journalEntry: { select: { id: true, voucherNumber: true } },
      allocations: {
        include: {
          salesInvoice: {
            select: {
              invoiceNumber: true,
              invoiceDate: true,
              grandTotal: true,
            },
          },
          purchaseReceipt: {
            select: {
              receiptNumber: true,
              receiptDate: true,
              grandTotal: true,
            },
          },
        },
      },
    },
  });

  if (!payment) notFound();
  assertPermittedBranch(context, "PAYMENT_VIEW", payment.branchId);

  const barcode = bwipjs.toSVG({
    bcid: "code128",
    text: payment.paymentNumber,
    scale: 2,
    height: 10,
    includetext: true,
    textxalign: "center",
    backgroundcolor: "FFFFFF",
  });

  const isReceipt = payment.direction === "CUSTOMER_RECEIPT" || payment.direction === "SUPPLIER_REFUND";
  const voucherTitle = isReceipt ? "Official Money Receipt" : "Payment Voucher";
  const party = payment.customer || payment.supplier;
  const partyType = payment.customer ? "Customer / Payer" : "Supplier / Payee";
  const settlementAccount = payment.bankAccount
    ? `${payment.bankAccount.bankName} (${payment.bankAccount.iban || payment.bankAccount.accountTitle || payment.bankAccount.code})`
    : payment.cashAccount
    ? `${payment.cashAccount.name} (${payment.cashAccount.code})`
    : "Cash / General Settlement";

  const numAmount = payment.amount.toNumber();
  const words = numberToWords(numAmount);

  return (
    <div className="mx-auto max-w-[900px] p-4">
      <div className="no-print mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div>
          <p className="text-sm font-bold text-slate-900">
            Print Preview — {payment.paymentNumber}
          </p>
          <p className="text-xs text-slate-500">
            Official business receipt voucher. Use your browser print dialog to print or save as PDF.
          </p>
        </div>
        <PrintButton />
      </div>

      <article className="print-document min-h-[960px] rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <header className="flex items-start justify-between gap-8 border-b-2 border-blue-700 pb-5">
          <div className="flex gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-xl bg-blue-700 text-xl font-black text-white">
              {payment.company.code.slice(0, 2)}
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-wide text-slate-950">
                {payment.company.legalName || payment.company.name}
              </h1>
              <p className="mt-1 text-xs text-slate-600">
                {[
                  payment.company.addressLine1,
                  payment.company.addressLine2,
                  payment.company.city,
                  payment.company.province,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Tax ID: {payment.company.taxRegistrationNumber || "N/A"} · Tel:{" "}
                {payment.company.phone || "N/A"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">
              {voucherTitle}
            </div>
            <div className="mt-1 text-2xl font-black text-slate-950">
              {payment.paymentNumber}
            </div>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs font-bold text-slate-700">
              <span
                className={`h-2 w-2 rounded-full ${
                  payment.status === "POSTED"
                    ? "bg-emerald-500"
                    : payment.status === "APPROVED"
                    ? "bg-amber-500"
                    : "bg-slate-400"
                }`}
              />
              {payment.status}
            </div>
          </div>
        </header>

        <section className="print-break-avoid mt-5 grid grid-cols-2 gap-6 rounded-xl border border-slate-200 p-4 text-sm">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {partyType}
            </div>
            <div className="mt-1 font-bold text-slate-950">
              {party?.name || "Counter Party"}
            </div>
            <div className="mt-1 text-xs text-slate-600">Code: {party?.code || "—"}</div>
            {party?.taxNumber && (
              <div className="text-xs text-slate-600">Tax No: {party.taxNumber}</div>
            )}
            {party?.phone && (
              <div className="text-xs text-slate-600">Phone: {party.phone}</div>
            )}
            {party?.address && (
              <div className="text-xs text-slate-600">{party.address}</div>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <dt className="text-slate-500">Voucher Date</dt>
            <dd className="text-right font-semibold">{date(payment.paymentDate)}</dd>

            <dt className="text-slate-500">Branch</dt>
            <dd className="text-right font-semibold">{payment.branch.name}</dd>

            <dt className="text-slate-500">Settlement A/C</dt>
            <dd className="text-right font-semibold">{settlementAccount}</dd>

            <dt className="text-slate-500">Payment Method</dt>
            <dd className="text-right font-semibold">
              {payment.paymentMethod?.name || (payment.bankAccount ? "Bank Transfer" : "Cash")}
            </dd>

            <dt className="text-slate-500">Reference / Cheque</dt>
            <dd className="text-right font-semibold">{payment.reference || "—"}</dd>

            {payment.journalEntry && (
              <>
                <dt className="text-slate-500">Journal Voucher</dt>
                <dd className="text-right font-semibold text-blue-700">
                  {payment.journalEntry.voucherNumber}
                </dd>
              </>
            )}
          </dl>
        </section>

        {/* Amount in Numbers and Words Banner */}
        <section className="print-break-avoid mt-5 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                Amount Received / Paid
              </p>
              <p className="mt-0.5 text-xs italic text-slate-700">
                Rupees {words}
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black tabular-nums text-blue-900">
                {amount(payment.amount, payment.currencyCode)}
              </span>
            </div>
          </div>
        </section>

        {/* Allocations Table */}
        <section className="print-break-avoid mt-5">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">
            Invoice / Document Settlement Allocation
          </div>
          {payment.allocations.length > 0 ? (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-left text-slate-700">
                  <th className="px-3 py-2 text-center">#</th>
                  <th className="px-3 py-2">Document Reference</th>
                  <th className="px-3 py-2">Document Date</th>
                  <th className="px-3 py-2 text-right">Document Total</th>
                  <th className="px-3 py-2 text-right">Settled Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {payment.allocations.map((alloc, idx) => {
                  const doc = alloc.salesInvoice || alloc.purchaseReceipt;
                  const docNumber =
                    alloc.salesInvoice?.invoiceNumber ||
                    alloc.purchaseReceipt?.receiptNumber ||
                    "—";
                  const docDate =
                    alloc.salesInvoice?.invoiceDate || alloc.purchaseReceipt?.receiptDate;
                  const docTotal = doc?.grandTotal;
                  return (
                    <tr key={alloc.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 text-center text-slate-400">{idx + 1}</td>
                      <td className="px-3 py-2 font-bold text-slate-900">{docNumber}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {docDate ? date(docDate) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                        {docTotal ? amount(docTotal, payment.currencyCode) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-blue-900">
                        {amount(alloc.amount, payment.currencyCode)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
              Unallocated on account — this amount stands as an open advance / balance credit on the party subledger.
            </div>
          )}
        </section>

        {payment.notes && (
          <section className="print-break-avoid mt-5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Notes & Remarks
            </div>
            <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">
              {payment.notes}
            </p>
          </section>
        )}

        {/* Signatures */}
        <section className="print-break-avoid mt-16 grid grid-cols-3 gap-8 text-center text-xs">
          <div className="border-t border-slate-400 pt-2">
            <b>{payment.preparedBy.fullName}</b>
            <div className="mt-1 text-slate-500">Prepared By (Cashier/Accountant)</div>
          </div>
          <div className="border-t border-slate-400 pt-2">
            <b>{payment.approvedBy?.fullName || "Pending Approval"}</b>
            <div className="mt-1 text-slate-500">Verified & Approved By</div>
          </div>
          <div className="border-t border-slate-400 pt-2">
            <b>Customer / Receiver Signature</b>
            <div className="mt-1 text-slate-500">Received By / Acknowledged</div>
          </div>
        </section>

        <footer className="print-break-avoid mt-12 flex items-end justify-between border-t border-slate-200 pt-4">
          <div className="w-56" dangerouslySetInnerHTML={{ __html: barcode }} />
          <div className="text-right text-[10px] leading-4 text-slate-500">
            <div>
              Generated{" "}
              {new Intl.DateTimeFormat("en-PK", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: context.company.timeZone,
              }).format(new Date())}
            </div>
            <div>System Voucher ID: {payment.id}</div>
            <div>
              This is a computer-generated voucher and requires no physical seal when electronically verified.
            </div>
          </div>
        </footer>
      </article>
    </div>
  );
}
