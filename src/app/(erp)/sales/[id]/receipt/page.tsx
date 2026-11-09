import Link from "next/link";
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
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(typeof value === "number" ? value : value.toNumber());

const formatDateTime = (value: Date | null, timeZone: string) =>
  value
    ? new Intl.DateTimeFormat("en-PK", {
        timeZone,
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(value)
    : "—";

export default async function PosThermalReceiptPage({ params }: PageProps) {
  const context = await requirePagePermission("sales.view");
  const id = idSchema.parse((await params).id);

  const invoice = await prisma.salesInvoice.findFirst({
    where: { id, companyId: context.company.id },
    include: {
      company: true,
      branch: true,
      warehouse: true,
      customer: true,
      salesperson: { select: { fullName: true } },
      preparedBy: { select: { fullName: true } },
      postedBy: { select: { fullName: true } },
      lines: {
        include: {
          product: { include: { unit: true } },
          variant: true,
          units: {
            include: {
              stockUnit: {
                include: {
                  identifiers: {
                    orderBy: [{ type: "asc" }, { slot: "asc" }],
                  },
                },
              },
            },
          },
        },
        orderBy: { lineNumber: "asc" },
      },
      allocations: {
        select: {
          amount: true,
          payment: {
            select: {
              paymentNumber: true,
              direction: true,
              paymentDate: true,
              reference: true,
              cashAccount: { select: { name: true, code: true } },
              bankAccount: { select: { bankName: true, code: true } },
            },
          },
        },
      },
    },
  });

  if (!invoice) notFound();
  assertPermittedBranch(context, "sales.view", invoice.branchId);

  let barcodeSvg = "";
  try {
    barcodeSvg = bwipjs.toSVG({
      bcid: "code128",
      text: invoice.invoiceNumber,
      scale: 1.5,
      height: 8,
      includetext: true,
      textxalign: "center",
      backgroundcolor: "FFFFFF",
    });
  } catch {
    barcodeSvg = "";
  }

  const paidTotal = invoice.allocations.reduce((sum, a) => sum + a.amount.toNumber(), 0);
  const grandTotal = invoice.grandTotal.toNumber();
  const balanceDue = Math.max(0, grandTotal - paidTotal);

  return (
    <div className="mx-auto flex flex-col items-center py-4">
      {/* Action Bar (hidden when printing) */}
      <div className="no-print mb-4 flex w-full max-w-[80mm] items-center justify-between rounded-lg border bg-white p-2 text-xs">
        <Link
          href={`/sales/${invoice.id}/print`}
          className="rounded border px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50"
        >
          ← Standard A4
        </Link>
        <PrintButton label="🖨️ Print 80mm" />
      </div>

      {/* 80mm Thermal Receipt Canvas */}
      <article
        className="w-[80mm] bg-white p-3 font-mono text-[11px] leading-tight text-black shadow-md print:w-[80mm] print:p-0 print:shadow-none"
        style={{ fontFamily: "'Courier New', Courier, monospace" }}
      >
        {/* Store Header */}
        <header className="border-b border-dashed border-black pb-2 text-center">
          <h1 className="text-sm font-black uppercase tracking-tight">
            {invoice.company.name}
          </h1>
          <p className="text-[10px] text-gray-700">
            {invoice.branch.name}
          </p>
          {invoice.branch.addressLine1 && (
            <p className="text-[9px] text-gray-600">
              {invoice.branch.addressLine1}
            </p>
          )}
          {invoice.branch.phone && (
            <p className="text-[9px] text-gray-600">
              Phone: {invoice.branch.phone}
            </p>
          )}
          {invoice.company.taxRegistrationNumber && (
            <p className="text-[9px] text-gray-600">
              STRN / NTN: {invoice.company.taxRegistrationNumber}
            </p>
          )}
          <div className="mt-1 font-bold tracking-widest uppercase">
            *** POS RETAIL RECEIPT ***
          </div>
        </header>

        {/* Invoice Meta */}
        <section className="border-b border-dashed border-black py-2 text-[10px]">
          <div className="flex justify-between">
            <span>Invoice #:</span>
            <span className="font-bold">{invoice.invoiceNumber}</span>
          </div>
          <div className="flex justify-between">
            <span>Date:</span>
            <span>{formatDateTime(invoice.invoiceDate, context.company.timeZone)}</span>
          </div>
          <div className="flex justify-between">
            <span>Customer:</span>
            <span className="font-bold">{invoice.customer.name}</span>
          </div>
          {invoice.customer.phone && (
            <div className="flex justify-between">
              <span>Cust Phone:</span>
              <span>{invoice.customer.phone}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Cashier / Staff:</span>
            <span>{invoice.salesperson?.fullName || invoice.preparedBy.fullName}</span>
          </div>
        </section>

        {/* Line Items Table */}
        <table className="w-full border-b border-dashed border-black py-2 text-left text-[10px]">
          <thead>
            <tr className="border-b border-black">
              <th className="py-1">Item / IMEI</th>
              <th className="py-1 text-center">Qty</th>
              <th className="py-1 text-right">Price</th>
              <th className="py-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id} className="border-b border-dotted border-gray-300 align-top">
                <td className="py-1 pr-1">
                  <div className="font-bold">{line.product.name}</div>
                  <div className="text-[9px] text-gray-600">{line.variant.name}</div>
                  {/* Serial / IMEI Breakdown */}
                  {line.units.map((unitLink, idx) => (
                    <div key={unitLink.id} className="mt-0.5 text-[8.5px] font-bold text-gray-900">
                      [{idx + 1}] {unitLink.stockUnit.identifiers.map((i) => `${i.type}: ${i.value}`).join(" | ")}
                    </div>
                  ))}
                  {line.discountAmount.toNumber() > 0 && (
                    <div className="text-[8.5px] text-gray-600">
                      Disc: -{amount(line.discountAmount, invoice.currencyCode)}
                    </div>
                  )}
                </td>
                <td className="py-1 text-center font-bold">{line.quantity.toNumber()}</td>
                <td className="py-1 text-right">{amount(line.unitPrice, invoice.currencyCode)}</td>
                <td className="py-1 text-right font-bold">{amount(line.lineTotal, invoice.currencyCode)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Financial Summary */}
        <section className="space-y-1 border-b border-dashed border-black py-2 text-[10px]">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>{amount(invoice.subtotal, invoice.currencyCode)}</span>
          </div>
          {invoice.discountTotal.toNumber() > 0 && (
            <div className="flex justify-between">
              <span>Discount:</span>
              <span>-{amount(invoice.discountTotal, invoice.currencyCode)}</span>
            </div>
          )}
          {invoice.taxTotal.toNumber() > 0 && (
            <div className="flex justify-between">
              <span>Tax:</span>
              <span>{amount(invoice.taxTotal, invoice.currencyCode)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-black pt-1 text-xs font-black">
            <span>NET TOTAL:</span>
            <span>{amount(invoice.grandTotal, invoice.currencyCode)}</span>
          </div>
          {paidTotal > 0 && (
            <div className="flex justify-between text-gray-800">
              <span>Paid / Tendered:</span>
              <span className="font-bold">{amount(paidTotal, invoice.currencyCode)}</span>
            </div>
          )}
          {balanceDue > 0 ? (
            <div className="flex justify-between border-t border-dotted border-gray-400 pt-1 font-bold text-gray-900">
              <span>BALANCE DUE:</span>
              <span>{amount(balanceDue, invoice.currencyCode)}</span>
            </div>
          ) : (
            <div className="text-center font-bold text-[9px] uppercase tracking-wider text-gray-700 pt-0.5">
              *** FULLY PAID ***
            </div>
          )}
        </section>

        {/* Payments Breakdown */}
        {invoice.allocations.length > 0 && (
          <section className="border-b border-dashed border-black py-1.5 text-[9px]">
            <div className="font-bold uppercase tracking-wider mb-0.5">Settlement Method:</div>
            {invoice.allocations.map((alloc, idx) => (
              <div key={idx} className="flex justify-between text-gray-700">
                <span>
                  {alloc.payment.cashAccount
                    ? `Cash (${alloc.payment.cashAccount.name})`
                    : alloc.payment.bankAccount
                    ? `Bank (${alloc.payment.bankAccount.bankName})`
                    : "Direct Settlement"}
                </span>
                <span>{amount(alloc.amount, invoice.currencyCode)}</span>
              </div>
            ))}
          </section>
        )}

        {/* Notes */}
        {invoice.notes && (
          <section className="border-b border-dashed border-black py-1 text-[8.5px] text-gray-700">
            <span>Remarks: {invoice.notes}</span>
          </section>
        )}

        {/* Barcode & Footer */}
        <footer className="pt-3 text-center">
          {barcodeSvg && (
            <div
              className="mx-auto flex justify-center pb-2"
              dangerouslySetInnerHTML={{ __html: barcodeSvg }}
            />
          )}
          <p className="text-[10px] font-bold">Thank You For Your Business!</p>
          <p className="text-[8px] text-gray-600 mt-0.5">
            Returns accepted within 3 days with original box & receipt.
          </p>
          <p className="mt-2 text-[7.5px] text-gray-500">
            © 2026 Copyright Reserved · Qasim Ali · 0315-5049489
          </p>
        </footer>
      </article>
    </div>
  );
}
