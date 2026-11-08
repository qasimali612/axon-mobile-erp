import { notFound } from "next/navigation";
import bwipjs from "bwip-js/node";
import { PrintButton } from "@/components/purchase/print-button";
import { assertPermittedBranch, requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idSchema } from "@/lib/validation";

type PageProps = { params: Promise<{ id: string }> };
const amount = (value: { toNumber(): number } | number, currency: string) => new Intl.NumberFormat("en-PK", { style: "currency", currency, minimumFractionDigits: 2 }).format(typeof value === "number" ? value : value.toNumber());
const date = (value: Date | null) => value ? new Intl.DateTimeFormat("en-PK", { timeZone: "Asia/Karachi", day: "2-digit", month: "short", year: "numeric" }).format(value) : "—";

export default async function PurchaseOrderPrintPage({ params }: PageProps) {
  const context = await requirePagePermission("purchase.view");
  const id = idSchema.parse((await params).id);
  const order = await prisma.purchaseOrder.findFirst({
    where: { id, companyId: context.company.id },
    include: {
      company: true,
      branch: true,
      warehouse: true,
      supplier: true,
      preparedBy: { select: { fullName: true } },
      approvedBy: { select: { fullName: true } },
      lines: { include: { product: { include: { unit: true } }, variant: true, taxRule: true }, orderBy: { lineNumber: "asc" } },
    },
  });
  if (!order) notFound();
  assertPermittedBranch(context, "purchase.view", order.branchId);
  const barcode = bwipjs.toSVG({ bcid: "code128", text: order.orderNumber, scale: 2, height: 10, includetext: true, textxalign: "center", backgroundcolor: "FFFFFF" });
  return <div className="mx-auto max-w-[1000px]">
    <div className="no-print mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3"><div><p className="text-sm font-bold text-slate-900">Print preview · {order.orderNumber}</p><p className="text-xs text-slate-500">Use your browser’s print dialog to print or save as PDF.</p></div><PrintButton /></div>
    <article className="print-document min-h-[1120px] rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <header className="flex items-start justify-between gap-8 border-b-2 border-blue-700 pb-5">
        <div className="flex gap-4"><div className="grid h-14 w-14 place-items-center rounded-xl bg-blue-700 text-xl font-black text-white">{order.company.code.slice(0, 2)}</div><div><h1 className="text-xl font-black uppercase tracking-wide text-slate-950">{order.company.legalName || order.company.name}</h1><p className="mt-1 text-xs text-slate-600">{[order.company.addressLine1, order.company.addressLine2, order.company.city, order.company.province].filter(Boolean).join(", ")}</p><p className="mt-1 text-xs text-slate-600">Tax registration: {order.company.taxRegistrationNumber || "N/A"} · {order.company.phone || ""}</p></div></div>
        <div className="text-right"><div className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">Purchase order</div><div className="mt-1 text-2xl font-black text-slate-950">{order.orderNumber}</div><div className="mt-2 inline-flex rounded-full border border-slate-200 px-3 py-1 text-xs font-bold text-slate-700">{order.status.replaceAll("_", " ")}</div></div>
      </header>
      <section className="print-break-avoid mt-5 grid grid-cols-2 gap-6 rounded-xl border border-slate-200 p-4 text-sm">
        <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Supplier</div><div className="mt-1 font-bold text-slate-950">{order.supplier.name}</div><div className="mt-1 text-xs text-slate-600">Code: {order.supplier.code}</div><div className="text-xs text-slate-600">Tax no: {order.supplier.taxNumber || "N/A"}</div><div className="text-xs text-slate-600">{order.supplier.address || ""}</div></div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs"><dt className="text-slate-500">Order date</dt><dd className="text-right font-semibold">{date(order.orderDate)}</dd><dt className="text-slate-500">Expected date</dt><dd className="text-right font-semibold">{date(order.expectedDate)}</dd><dt className="text-slate-500">Supplier ref.</dt><dd className="text-right font-semibold">{order.supplierReference || "—"}</dd><dt className="text-slate-500">Payment terms</dt><dd className="text-right font-semibold">{order.paymentTermsDays} days</dd><dt className="text-slate-500">Deliver to</dt><dd className="text-right font-semibold">{order.warehouse.name}</dd><dt className="text-slate-500">Branch</dt><dd className="text-right font-semibold">{order.branch.name}</dd></dl>
      </section>
      <table className="mt-5 w-full border-collapse text-xs"><thead><tr className="bg-blue-700 text-left text-white"><th className="px-3 py-2.5 text-center">#</th><th className="px-3 py-2.5">SKU / Description</th><th className="px-3 py-2.5 text-center">UOM</th><th className="px-3 py-2.5 text-right">Qty</th><th className="px-3 py-2.5 text-right">Unit cost</th><th className="px-3 py-2.5 text-right">Discount</th><th className="px-3 py-2.5 text-right">Tax</th><th className="px-3 py-2.5 text-right">Total</th></tr></thead><tbody>{order.lines.map((line) => <tr key={line.id} className="print-break-avoid border-b border-slate-200"><td className="px-3 py-3 text-center text-slate-500">{line.lineNumber}</td><td className="px-3 py-3"><div className="font-bold text-slate-900">{line.product.name} · {line.variant.name}</div><div className="mt-0.5 text-[10px] text-slate-500">{line.product.sku} / {line.variant.sku}{line.description ? ` · ${line.description}` : ""}</div></td><td className="px-3 py-3 text-center">{line.product.unit.code}</td><td className="px-3 py-3 text-right tabular-nums">{line.orderedQuantity.toFixed(4)}</td><td className="px-3 py-3 text-right tabular-nums">{amount(line.unitCost, order.currencyCode)}</td><td className="px-3 py-3 text-right tabular-nums">{amount(line.discountAmount, order.currencyCode)}</td><td className="px-3 py-3 text-right"><div>{amount(line.taxAmount, order.currencyCode)}</div><div className="text-[9px] text-slate-400">{line.taxRate.toFixed(2)}%</div></td><td className="px-3 py-3 text-right font-bold tabular-nums">{amount(line.lineTotal, order.currencyCode)}</td></tr>)}</tbody></table>
      <section className="print-break-avoid mt-5 grid grid-cols-[1fr_320px] gap-6"><div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Notes and terms</div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">{order.notes || "Goods must match the approved specification and quantities. Quote the purchase-order number on all delivery documents and invoices."}</p></div><dl className="space-y-2 rounded-xl border border-slate-200 p-4 text-xs"><div className="flex justify-between"><dt>Subtotal</dt><dd>{amount(order.subtotal, order.currencyCode)}</dd></div><div className="flex justify-between"><dt>Line discounts</dt><dd>− {amount(order.discountTotal, order.currencyCode)}</dd></div><div className="flex justify-between"><dt>Document discount</dt><dd>− {amount(order.documentDiscount, order.currencyCode)}</dd></div><div className="flex justify-between"><dt>Input tax</dt><dd>{amount(order.taxTotal, order.currencyCode)}</dd></div><div className="flex justify-between"><dt>Freight</dt><dd>{amount(order.freightTotal, order.currencyCode)}</dd></div><div className="flex justify-between"><dt>Other charges</dt><dd>{amount(order.otherCharges, order.currencyCode)}</dd></div><div className="flex justify-between border-t border-slate-300 pt-3 text-sm font-black text-blue-800"><dt>Grand total</dt><dd>{amount(order.grandTotal, order.currencyCode)}</dd></div></dl></section>
      <section className="print-break-avoid mt-12 grid grid-cols-3 gap-8 text-center text-xs"><div className="border-t border-slate-400 pt-2"><b>{order.preparedBy.fullName}</b><div className="mt-1 text-slate-500">Prepared by</div></div><div className="border-t border-slate-400 pt-2"><b>{order.approvedBy?.fullName || "Pending approval"}</b><div className="mt-1 text-slate-500">Approved by</div></div><div className="border-t border-slate-400 pt-2"><b>Supplier acknowledgement</b><div className="mt-1 text-slate-500">Name, signature & date</div></div></section>
      <footer className="print-break-avoid mt-10 flex items-end justify-between border-t border-slate-200 pt-4"><div className="w-60" dangerouslySetInnerHTML={{ __html: barcode }}/><div className="text-right text-[10px] leading-4 text-slate-500"><div>Generated {new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: context.company.timeZone }).format(new Date())}</div><div>System record ID: {order.id}</div><div>This document is valid only in its current workflow state.</div></div></footer>
    </article>
  </div>;
}
