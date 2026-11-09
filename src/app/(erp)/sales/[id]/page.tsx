import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Banknote, Edit3, ExternalLink, FileText, Printer, Receipt, ShieldAlert } from "lucide-react";
import { OperationalDocumentStatus, PaymentDirection, Prisma } from "@prisma/client";
import { DocumentReversalAction } from "@/components/operations/document-reversal-action";
import { SalesInvoiceWorkflowActions } from "@/components/sales/sales-invoice-actions";
import { Badge } from "@/components/ui/badge";
import { permittedDocumentScopes, requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";
import { idSchema } from "@/lib/validation";

type PageProps = { params: Promise<{ id: string }> };

function statusTone(status: string) {
  if (status === "POSTED") return "green" as const;
  if (["APPROVED", "SUBMITTED"].includes(status)) return "amber" as const;
  if (["REVERSED", "CANCELLED", "REJECTED"].includes(status)) return "red" as const;
  return "slate" as const;
}

function mask(value: string) {
  return value.length <= 4 ? value : `${"•".repeat(Math.min(value.length - 4, 11))}${value.slice(-4)}`;
}

function scopedPermission(context: Awaited<ReturnType<typeof requirePagePermission>>, permission: string, branchId: string, warehouseId: string) {
  return context.roles.some((role) => role.permissions.includes(permission)
    && (!role.branchId || role.branchId === branchId)
    && (!role.warehouseId || role.warehouseId === warehouseId));
}

export default async function SalesInvoiceDetailPage({ params }: PageProps) {
  const context = await requirePagePermission("sales.view");
  const id = idSchema.parse((await params).id);
  const scopes = permittedDocumentScopes(context, "sales.view");
  const invoice = await prisma.salesInvoice.findFirst({
    where: { id, companyId: context.company.id, ...(scopes ? { OR: scopes } : {}) },
    include: {
      branch: { select: { code: true, name: true } },
      warehouse: { select: { code: true, name: true } },
      customer: { select: { id: true, code: true, name: true, phone: true, email: true, creditLimit: true } },
      salesperson: { select: { fullName: true } },
      preparedBy: { select: { id: true, fullName: true } },
      approvedBy: { select: { id: true, fullName: true } },
      postedBy: { select: { id: true, fullName: true } },
      reversedBy: { select: { id: true, fullName: true } },
      journalEntry: { select: { id: true, voucherNumber: true, postingDate: true, status: true } },
      reversalOf: { select: { id: true, invoiceNumber: true, status: true } },
      reversals: { select: { id: true, invoiceNumber: true, status: true, postedAt: true }, orderBy: { createdAt: "desc" } },
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          product: { select: { sku: true, name: true, model: true, trackingMethod: true } },
          variant: { select: { sku: true, name: true, color: true, storageGb: true } },
          units: { include: { stockUnit: { select: { status: true, currentWarehouseId: true, identifiers: { orderBy: [{ type: "asc" }, { slot: "asc" }] } } } } },
        },
      },
      allocations: {
        include: { payment: { select: { id: true, paymentNumber: true, paymentDate: true, direction: true, status: true, amount: true } } },
        orderBy: { payment: { paymentDate: "desc" } },
      },
      stockReturns: { select: { id: true, returnNumber: true, returnDate: true, status: true, grandTotal: true }, orderBy: { returnDate: "desc" } },
    },
  });
  if (!invoice) notFound();

  const [history, movements] = await Promise.all([
    prisma.auditLog.findMany({
      where: { companyId: context.company.id, entityType: "SalesInvoice", entityId: invoice.id },
      select: { id: true, action: true, outcome: true, createdAt: true, actor: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.inventoryMovement.findMany({
      where: { companyId: context.company.id, sourceDocumentType: "SalesInvoice", sourceDocumentId: invoice.id },
      select: { id: true, movementType: true, postingDate: true, quantity: true, unitCost: true, totalCost: true, stockUnitId: true, reversalOfId: true },
      orderBy: { postedAt: "asc" },
    }),
  ]);

  const settled = invoice.allocations.reduce((sum, allocation) => {
    if (allocation.payment.status !== OperationalDocumentStatus.POSTED) return sum;
    if (allocation.payment.direction === PaymentDirection.CUSTOMER_RECEIPT) return sum.plus(allocation.amount);
    if (allocation.payment.direction === PaymentDirection.CUSTOMER_REFUND) return sum.minus(allocation.amount);
    return sum;
  }, new Prisma.Decimal(0));
  const outstanding = Prisma.Decimal.max(invoice.grandTotal.minus(settled), 0);
  const activeReturns = invoice.stockReturns.filter((item) => item.status !== OperationalDocumentStatus.CANCELLED && item.status !== OperationalDocumentStatus.REJECTED);
  const postedAllocations = invoice.allocations.filter((item) => item.payment.status === OperationalDocumentStatus.POSTED);
  const unavailableUnits = invoice.lines.flatMap((line) => line.units).filter((link) => link.stockUnit.status !== "SOLD").length;
  const roleAllowsReversal = scopedPermission(context, "SALES_INVOICE_REVERSE", invoice.branchId, invoice.warehouseId);
  const separated = context.user.id !== invoice.preparedById && context.user.id !== invoice.approvedById && context.user.id !== invoice.postedById;
  const canReverse = invoice.status === OperationalDocumentStatus.POSTED && !invoice.reversalOfId && roleAllowsReversal && separated;
  const disabledReason = postedAllocations.length
    ? "Posted customer allocations must be reversed or refunded first."
    : activeReturns.length
      ? "Active customer returns must be cancelled or resolved first."
      : unavailableUnits
        ? "One or more sold physical units already moved through a downstream workflow."
        : null;
  const canViewIdentifiers = context.permissions.includes("inventory.device.view") || context.permissions.includes("SALES_INVOICE_CREATE");

  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div><Link href="/sales" className="inline-flex items-center gap-1 text-xs font-bold text-blue-700"><ArrowLeft className="h-3.5 w-3.5"/>Sales register</Link><div className="mt-3 flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black text-slate-950 sm:text-[30px]">{invoice.invoiceNumber}</h1><Badge tone={statusTone(invoice.status)}>{titleCase(invoice.status)}</Badge>{invoice.reversalOfId && <Badge tone="red">Reversal document</Badge>}</div><p className="mt-1.5 text-sm text-slate-500">{invoice.customer.name} · {invoice.branch.name} / {invoice.warehouse.name} · {formatDate(invoice.invoiceDate)}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <SalesInvoiceWorkflowActions
          invoice={{
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            status: invoice.status,
            grandTotal: invoice.grandTotal.toString(),
            currencyCode: invoice.currencyCode,
            preparedById: invoice.preparedById,
            approvedById: invoice.approvedById,
            customer: {
              id: invoice.customer.id,
              code: invoice.customer.code,
              name: invoice.customer.name,
              creditLimit: invoice.customer.creditLimit ? invoice.customer.creditLimit.toString() : undefined,
            },
          }}
          userId={context.user.id}
          permissions={context.permissions}
        />
        {invoice.status !== OperationalDocumentStatus.POSTED && invoice.status !== OperationalDocumentStatus.REVERSED && invoice.status !== OperationalDocumentStatus.CANCELLED && (
          <Link
            href={`/sales/${invoice.id}/edit`}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 transition"
          >
            <Edit3 className="h-4 w-4" /> Edit Draft
          </Link>
        )}
        {invoice.status === OperationalDocumentStatus.POSTED && outstanding.gt(0) && scopedPermission(context, "PAYMENT_CREATE", invoice.branchId, invoice.warehouseId) && (
          <Link
            href={`/finance/payments?invoiceId=${invoice.id}&amount=${outstanding.toFixed(4)}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700 hover:bg-blue-100 transition"
          >
            <Banknote className="h-4 w-4" /> Receive payment
          </Link>
        )}
        {canReverse && (
          <DocumentReversalAction
            documentId={invoice.id}
            documentNumber={invoice.invoiceNumber}
            documentLabel="sales invoice"
            endpoint={`/api/sales/invoices/${invoice.id}/reverse`}
            consequence="Posting is blocked by posted allocations or returns and by any physical unit that is no longer in its original sold custody state."
            disabledReason={disabledReason}
          />
        )}
        <Link
          href={`/sales/${invoice.id}/receipt`}
          target="_blank"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition"
        >
          <Receipt className="h-4 w-4" /> POS Receipt
        </Link>
        <Link
          href={`/sales/${invoice.id}/print`}
          target="_blank"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition"
        >
          <Printer className="h-4 w-4" /> Print A4
        </Link>
      </div>
    </div>

    {(invoice.reversalOf || invoice.reversals.length > 0) && <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-700"/><div><b>Immutable reversal chain</b>{invoice.reversalOf && <p className="mt-1">This document reverses <Link className="font-bold underline" href={`/sales/${invoice.reversalOf.id}`}>{invoice.reversalOf.invoiceNumber}</Link>.</p>}{invoice.reversals.map((item) => <p key={item.id} className="mt-1">Reversed by <Link className="font-bold underline" href={`/sales/${item.id}`}>{item.invoiceNumber}</Link> · {titleCase(item.status)}{item.postedAt ? ` · ${formatDate(item.postedAt, true)}` : ""}</p>)}</div></div></section>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[
      ["Grand total", formatMoney(invoice.grandTotal.toString(), invoice.currencyCode)],
      ["Settled", formatMoney(settled.toString(), invoice.currencyCode)],
      ["Outstanding", formatMoney(outstanding.toString(), invoice.currencyCode)],
      ["Actual COGS", formatMoney(invoice.costTotal.toString(), invoice.currencyCode)],
      ["Physical / quantity", `${invoice.lines.reduce((sum, line) => sum + line.units.length, 0)} devices · ${invoice.lines.reduce((sum, line) => sum.plus(line.quantity), new Prisma.Decimal(0)).toFixed(4)} qty`],
    ].map(([label, value]) => <div key={label} className="surface p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 truncate text-lg font-black text-slate-950" title={value}>{value}</p></div>)}</div>

    <section className="surface overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-black text-slate-950">Invoice lines & physical custody</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3"># / product</th><th className="px-4 py-3">Identifiers</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Unit price</th><th className="px-4 py-3 text-right">Discount</th><th className="px-4 py-3 text-right">Tax</th><th className="px-5 py-3 text-right">Line / cost</th></tr></thead><tbody className="divide-y divide-slate-100">{invoice.lines.map((line) => <tr key={line.id} className="align-top"><td className="px-5 py-4"><b>{line.lineNumber}. {line.product.name} · {line.variant.name}</b><span className="block text-[10px] text-slate-400">{line.product.sku} / {line.variant.sku} · {line.product.trackingMethod}</span></td><td className="px-4 py-4">{line.units.length ? <div className="space-y-1">{line.units.map((link) => <div key={link.id} className="rounded border border-slate-100 bg-slate-50 px-2 py-1 font-mono text-[10px]">{link.stockUnit.identifiers.map((identifier) => `${identifier.type}${identifier.slot ? ` ${identifier.slot}` : ""}: ${canViewIdentifiers ? identifier.value : mask(identifier.value)}`).join(" / ")} <span className="font-sans font-bold text-slate-500">· {titleCase(link.stockUnit.status)}</span></div>)}</div> : <span className="text-slate-400">Quantity tracked</span>}</td><td className="px-4 py-4 text-right font-bold">{line.quantity.toFixed(4)}</td><td className="px-4 py-4 text-right">{formatMoney(line.unitPrice.toString(), invoice.currencyCode)}</td><td className="px-4 py-4 text-right">{formatMoney(line.discountAmount.toString(), invoice.currencyCode)}</td><td className="px-4 py-4 text-right">{formatMoney(line.taxAmount.toString(), invoice.currencyCode)}<span className="block text-[10px] text-slate-400">{line.taxRate.toFixed(2)}%</span></td><td className="px-5 py-4 text-right"><b>{formatMoney(line.lineTotal.toString(), invoice.currencyCode)}</b><span className="block text-[10px] text-slate-400">Cost {formatMoney(line.costTotal.toString(), invoice.currencyCode)}</span></td></tr>)}</tbody></table></div></section>

    <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <section className="surface overflow-hidden"><div className="border-b px-5 py-4"><h2 className="font-black">Linked finance & stock history</h2></div><div className="grid gap-4 p-5 md:grid-cols-2"><div><p className="label">Accounting voucher</p>{invoice.journalEntry ? <Link href={`/finance/journals/${invoice.journalEntry.id}`} className="mt-1 inline-flex items-center gap-1 font-bold text-blue-700">{invoice.journalEntry.voucherNumber}<ExternalLink className="h-3 w-3"/></Link> : <p className="mt-1 text-sm text-slate-400">Not posted</p>}<p className="mt-1 text-xs text-slate-500">{invoice.journalEntry ? `${titleCase(invoice.journalEntry.status)} · ${formatDate(invoice.journalEntry.postingDate)}` : ""}</p></div><div><p className="label">Stock movements</p><p className="mt-1 text-sm font-bold">{movements.length} append-only entries</p><p className="mt-1 text-xs text-slate-500">{movements.map((item) => titleCase(item.movementType)).join(", ") || "No stock effects"}</p></div></div><div className="border-t px-5 py-4"><h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Payments & returns</h3>{!invoice.allocations.length && !invoice.stockReturns.length ? <p className="mt-3 text-sm text-slate-400">No linked payments or returns.</p> : <div className="mt-3 space-y-2">{invoice.allocations.map((item) => <div key={item.id} className="flex justify-between rounded-lg border p-3 text-xs"><span><b>{item.payment.paymentNumber}</b> · {titleCase(item.payment.direction)} · {titleCase(item.payment.status)}</span><b>{formatMoney(item.amount.toString(), invoice.currencyCode)}</b></div>)}{invoice.stockReturns.map((item) => <div key={item.id} className="flex justify-between rounded-lg border p-3 text-xs"><span><b>{item.returnNumber}</b> · {titleCase(item.status)} · {formatDate(item.returnDate)}</span><b>{formatMoney(item.grandTotal.toString(), invoice.currencyCode)}</b></div>)}</div>}</div></section>
      <section className="surface overflow-hidden"><div className="border-b px-5 py-4"><h2 className="font-black">Workflow & audit timeline</h2></div><div className="border-b p-5 text-xs"><dl className="grid grid-cols-2 gap-y-2"><dt className="text-slate-500">Prepared by</dt><dd className="text-right font-bold">{invoice.preparedBy.fullName}</dd><dt className="text-slate-500">Approved by</dt><dd className="text-right font-bold">{invoice.approvedBy?.fullName || "—"}</dd><dt className="text-slate-500">Posted by</dt><dd className="text-right font-bold">{invoice.postedBy?.fullName || "—"}</dd>{invoice.reversedBy && <><dt className="text-slate-500">Reversed by</dt><dd className="text-right font-bold">{invoice.reversedBy.fullName}</dd></>}</dl>{invoice.reversalReason && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-rose-900"><b>Reversal reason:</b> {invoice.reversalReason}</p>}</div><ol className="max-h-[430px] divide-y overflow-auto">{history.map((item) => <li key={item.id} className="flex gap-3 px-5 py-3"><div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.outcome === "SUCCESS" ? "bg-blue-600" : "bg-rose-500"}`}/><div><p className="text-xs font-bold">{titleCase(item.action)}</p><p className="mt-0.5 text-[10px] text-slate-500">{item.actor?.fullName || "System"} · {formatDate(item.createdAt, true)}</p></div></li>)}{!history.length && <li className="p-5 text-sm text-slate-400">No audit events recorded.</li>}</ol></section>
    </div>

    {invoice.notes && <section className="surface p-5"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-slate-400"/><h2 className="font-black">Notes</h2></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{invoice.notes}</p></section>}
  </div>;
}
