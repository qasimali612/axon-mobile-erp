import { notFound } from "next/navigation";
import { PrintButton } from "@/components/purchase/print-button";
import { assertPermittedBranch, requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idSchema } from "@/lib/validation";

export const metadata = { title: "Thermal receipt" };

type PageProps = { params: Promise<{ id: string }> };
const amount = (value: { toNumber(): number }, currency: string) => new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value.toNumber()) + ` ${currency}`;

/** 80 mm thermal receipt layout for a posted sale. Reuses the same invoice record as the A4 document. */
export default async function ThermalReceiptPage({ params }: PageProps) {
  const context = await requirePagePermission("sales.view");
  const id = idSchema.parse((await params).id);
  const invoice = await prisma.salesInvoice.findFirst({
    where: { id, companyId: context.company.id },
    include: {
      company: true, branch: true, customer: true, salesperson: { select: { fullName: true } },
      lines: { include: { product: true, variant: true, units: { include: { stockUnit: { include: { identifiers: { orderBy: [{ type: "asc" }, { slot: "asc" }] } } } } } }, orderBy: { lineNumber: "asc" } },
    },
  });
  if (!invoice) notFound();
  assertPermittedBranch(context, "sales.view", invoice.branchId);

  return (
    <div className="mx-auto max-w-[420px]">
      <div className="no-print mb-3 flex items-center justify-between rounded-xl border bg-white p-3">
        <div><p className="text-sm font-bold">80 mm receipt · {invoice.invoiceNumber}</p><p className="text-[11px] text-slate-500">Choose the receipt printer preset, margins none.</p></div>
        <PrintButton label="Print receipt" />
      </div>
      <article className="print-document receipt-80 mx-auto w-[80mm] bg-white p-3 font-mono text-[10px] leading-4 text-black">
        <header className="text-center">
          <div className="text-sm font-bold uppercase">{invoice.company.name}</div>
          <div>{[invoice.company.addressLine1, invoice.company.city].filter(Boolean).join(", ")}</div>
          <div>Tax: {invoice.company.taxRegistrationNumber || "N/A"}</div>
          <div className="my-1 border-y border-dashed border-black py-0.5 font-bold">SALES RECEIPT</div>
          <div>{invoice.invoiceNumber} · {new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", dateStyle: "short", timeStyle: "short" }).format(invoice.invoiceDate)}</div>
          <div>Branch {invoice.branch.code} · Cashier {invoice.salesperson?.fullName || "—"}</div>
          <div>Customer {invoice.customer.name}</div>
        </header>
        <div className="my-1 border-y border-dashed border-black py-1">
          {invoice.lines.map((line) => (
            <div key={line.id} className="mb-1">
              <div className="flex justify-between gap-2"><span className="truncate">{line.product.name} {line.variant.name}</span><span>{amount(line.lineTotal, invoice.currencyCode)}</span></div>
              <div className="flex justify-between text-[9px]"><span>{line.quantity.toFixed(2)} × {amount(line.unitPrice, invoice.currencyCode)}</span><span>{line.discountAmount.toNumber() > 0 ? `-${amount(line.discountAmount, invoice.currencyCode)}` : ""}</span></div>
              {line.units.length ? <div className="text-[8px] leading-3">{line.units.flatMap((unit) => unit.stockUnit.identifiers.map((identifier) => `${identifier.value}`)).join(" / ")}</div> : null}
            </div>
          ))}
        </div>
        <div className="space-y-0.5">
          <div className="flex justify-between"><span>Subtotal</span><span>{amount(invoice.subtotal, invoice.currencyCode)}</span></div>
          <div className="flex justify-between"><span>Discount</span><span>-{amount(invoice.discountTotal, invoice.currencyCode)}</span></div>
          <div className="flex justify-between"><span>Tax</span><span>{amount(invoice.taxTotal, invoice.currencyCode)}</span></div>
          <div className="flex justify-between border-t border-black pt-1 text-xs font-bold"><span>TOTAL</span><span>{amount(invoice.grandTotal, invoice.currencyCode)}</span></div>
        </div>
        <footer className="mt-2 border-t border-dashed border-black pt-1 text-center text-[9px]">
          <div>{invoice.status === "POSTED" ? "Posted sale — goods sold are final." : "UNPOSTED — not a valid sale yet."}</div>
          <div>Returns accepted within policy with this receipt.</div>
          <div className="mt-1">Thank you for your business.</div>
        </footer>
      </article>
    </div>
  );
}
