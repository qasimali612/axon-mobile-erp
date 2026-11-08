import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Banknote, ExternalLink, FileText, Printer, ShieldAlert } from "lucide-react";
import { OperationalDocumentStatus, PaymentDirection, Prisma } from "@prisma/client";
import { DocumentReversalAction } from "@/components/operations/document-reversal-action";
import { Badge } from "@/components/ui/badge";
import { permittedDocumentScopes, requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";
import { idSchema } from "@/lib/validation";

type PageProps = { params: Promise<{ id: string }> };

function statusTone(status: string) {
  if (status === "POSTED") return "green" as const;
  if (["APPROVED", "SUBMITTED", "INSPECTION"].includes(status)) return "amber" as const;
  if (["REVERSED", "CANCELLED", "REJECTED"].includes(status)) return "red" as const;
  return "slate" as const;
}

function scopedPermission(context: Awaited<ReturnType<typeof requirePagePermission>>, permission: string, branchId: string, warehouseId: string) {
  return context.roles.some((role) => role.permissions.includes(permission)
    && (!role.branchId || role.branchId === branchId)
    && (!role.warehouseId || role.warehouseId === warehouseId));
}

function identifierValues(value: Prisma.JsonValue) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, Prisma.JsonValue>;
    return typeof record.value === "string" ? [record.value] : [];
  });
}

function mask(value: string) {
  return value.length <= 4 ? value : `${"•".repeat(Math.min(value.length - 4, 11))}${value.slice(-4)}`;
}

export default async function GoodsReceiptDetailPage({ params }: PageProps) {
  const context = await requirePagePermission("purchase.view");
  const id = idSchema.parse((await params).id);
  const scopes = permittedDocumentScopes(context, "purchase.view");
  const receipt = await prisma.purchaseReceipt.findFirst({
    where: { id, companyId: context.company.id, ...(scopes ? { OR: scopes } : {}) },
    include: {
      branch: { select: { code: true, name: true } },
      warehouse: { select: { code: true, name: true } },
      supplier: { select: { code: true, name: true, phone: true, email: true } },
      purchaseOrder: { select: { id: true, orderNumber: true, status: true } },
      preparedBy: { select: { id: true, fullName: true } },
      receivedBy: { select: { id: true, fullName: true } },
      approvedBy: { select: { id: true, fullName: true } },
      postedBy: { select: { id: true, fullName: true } },
      reversedBy: { select: { id: true, fullName: true } },
      journalEntry: { select: { id: true, voucherNumber: true, postingDate: true, status: true } },
      reversalOf: { select: { id: true, receiptNumber: true, status: true } },
      reversals: { select: { id: true, receiptNumber: true, status: true, postedAt: true }, orderBy: { createdAt: "desc" } },
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          product: { select: { sku: true, name: true, model: true, trackingMethod: true } },
          variant: { select: { sku: true, name: true, color: true, storageGb: true } },
          units: { include: { stockUnit: { select: { status: true, currentWarehouseId: true } } }, orderBy: { createdAt: "asc" } },
        },
      },
      allocations: {
        include: { payment: { select: { id: true, paymentNumber: true, paymentDate: true, direction: true, status: true, amount: true } } },
        orderBy: { payment: { paymentDate: "desc" } },
      },
      stockReturns: { select: { id: true, returnNumber: true, returnDate: true, status: true, grandTotal: true }, orderBy: { returnDate: "desc" } },
      inspections: { select: { id: true, result: true, inspectedAt: true, notes: true, inspectedBy: { select: { fullName: true } } }, orderBy: { inspectedAt: "desc" } },
    },
  });
  if (!receipt) notFound();

  const [history, movements] = await Promise.all([
    prisma.auditLog.findMany({
      where: { companyId: context.company.id, entityType: "PurchaseReceipt", entityId: receipt.id },
      select: { id: true, action: true, outcome: true, createdAt: true, actor: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.inventoryMovement.findMany({
      where: { companyId: context.company.id, sourceDocumentType: "PurchaseReceipt", sourceDocumentId: receipt.id },
      select: { id: true, movementType: true, postingDate: true, quantity: true, unitCost: true, totalCost: true, stockUnitId: true, reversalOfId: true },
      orderBy: { postedAt: "asc" },
    }),
  ]);

  const settled = receipt.allocations.reduce((sum, allocation) => {
    if (allocation.payment.status !== OperationalDocumentStatus.POSTED) return sum;
    if (allocation.payment.direction === PaymentDirection.SUPPLIER_PAYMENT) return sum.plus(allocation.amount);
    if (allocation.payment.direction === PaymentDirection.SUPPLIER_REFUND) return sum.minus(allocation.amount);
    return sum;
  }, new Prisma.Decimal(0));
  const outstanding = Prisma.Decimal.max(receipt.grandTotal.minus(settled), 0);
  const activeReturns = receipt.stockReturns.filter((item) => item.status !== OperationalDocumentStatus.CANCELLED && item.status !== OperationalDocumentStatus.REJECTED);
  const postedAllocations = receipt.allocations.filter((item) => item.payment.status === OperationalDocumentStatus.POSTED);
  const unavailableUnits = receipt.lines.flatMap((line) => line.units).filter((link) => link.stockUnit
    && (link.stockUnit.status !== "IN_STOCK" || link.stockUnit.currentWarehouseId !== receipt.warehouseId)).length;
  const roleAllowsReversal = scopedPermission(context, "PURCHASE_RECEIPT_REVERSE", receipt.branchId, receipt.warehouseId);
  const separated = context.user.id !== receipt.preparedById && context.user.id !== receipt.approvedById && context.user.id !== receipt.postedById;
  const canReverse = receipt.status === OperationalDocumentStatus.POSTED && !receipt.reversalOfId && roleAllowsReversal && separated;
  const disabledReason = postedAllocations.length
    ? "Posted supplier allocations must be reversed or refunded first."
    : activeReturns.length
      ? "Active supplier returns must be cancelled or resolved first."
      : receipt.purchaseOrder?.status === OperationalDocumentStatus.CLOSED
        ? "The linked purchase order is closed."
        : unavailableUnits
          ? "One or more received physical units were sold, transferred, reserved, returned, or otherwise consumed."
          : null;
  const canViewIdentifiers = context.permissions.includes("inventory.device.view") || context.permissions.includes("PURCHASE_RECEIPT_CREATE");
  const acceptedQuantity = receipt.lines.reduce((sum, line) => sum.plus(line.acceptedQuantity), new Prisma.Decimal(0));
  const rejectedQuantity = receipt.lines.reduce((sum, line) => sum.plus(line.rejectedQuantity), new Prisma.Decimal(0));
  const inventoryValue = receipt.subtotal.minus(receipt.discountTotal).minus(receipt.documentDiscount).plus(receipt.freightTotal).plus(receipt.otherCharges);

  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div><Link href="/goods-receipts" className="inline-flex items-center gap-1 text-xs font-bold text-blue-700"><ArrowLeft className="h-3.5 w-3.5"/>Goods-receipt register</Link><div className="mt-3 flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black text-slate-950 sm:text-[30px]">{receipt.receiptNumber}</h1><Badge tone={statusTone(receipt.status)}>{titleCase(receipt.status)}</Badge>{receipt.reversalOfId && <Badge tone="red">Reversal document</Badge>}</div><p className="mt-1.5 text-sm text-slate-500">{receipt.supplier.name} · {receipt.branch.name} / {receipt.warehouse.name} · {formatDate(receipt.receiptDate)}</p></div>
      <div className="flex flex-wrap gap-2">{receipt.status === OperationalDocumentStatus.POSTED && outstanding.gt(0) && scopedPermission(context, "PAYMENT_CREATE", receipt.branchId, receipt.warehouseId) && <Link href={`/finance/payments?receiptId=${receipt.id}&amount=${outstanding.toFixed(4)}`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700"><Banknote className="h-4 w-4"/>Pay supplier</Link>}{canReverse && <DocumentReversalAction documentId={receipt.id} documentNumber={receipt.receiptNumber} documentLabel="goods receipt" endpoint={`/api/purchases/receipts/${receipt.id}/reverse`} consequence="Posting is blocked by supplier allocations or returns, a closed purchase order, consumed physical units, or insufficient quantity/value stock." disabledReason={disabledReason}/>}<Link href={`/goods-receipts/${receipt.id}/print`} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700"><Printer className="h-4 w-4"/>Print GRN</Link></div>
    </div>

    {(receipt.reversalOf || receipt.reversals.length > 0) && <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-700"/><div><b>Immutable reversal chain</b>{receipt.reversalOf && <p className="mt-1">This document reverses <Link className="font-bold underline" href={`/goods-receipts/${receipt.reversalOf.id}`}>{receipt.reversalOf.receiptNumber}</Link>.</p>}{receipt.reversals.map((item) => <p key={item.id} className="mt-1">Reversed by <Link className="font-bold underline" href={`/goods-receipts/${item.id}`}>{item.receiptNumber}</Link> · {titleCase(item.status)}{item.postedAt ? ` · ${formatDate(item.postedAt, true)}` : ""}</p>)}</div></div></section>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{[
      ["Grand total", formatMoney(receipt.grandTotal.toString(), receipt.currencyCode)],
      ["Settled", formatMoney(settled.toString(), receipt.currencyCode)],
      ["Outstanding", formatMoney(outstanding.toString(), receipt.currencyCode)],
      ["Inventory value", formatMoney(inventoryValue.toString(), receipt.currencyCode)],
      ["Accepted", acceptedQuantity.toFixed(4)],
      ["Rejected", rejectedQuantity.toFixed(4)],
    ].map(([label, value]) => <div key={label} className="surface p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 truncate text-lg font-black text-slate-950" title={value}>{value}</p></div>)}</div>

    <section className="surface overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-black text-slate-950">Received lines, inspection & identifiers</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3"># / product</th><th className="px-4 py-3">Physical identifiers</th><th className="px-4 py-3 text-right">Received</th><th className="px-4 py-3 text-right">Accepted / rejected</th><th className="px-4 py-3">Inspection</th><th className="px-4 py-3 text-right">Landed unit</th><th className="px-5 py-3 text-right">Line total</th></tr></thead><tbody className="divide-y divide-slate-100">{receipt.lines.map((line) => <tr key={line.id} className="align-top"><td className="px-5 py-4"><b>{line.lineNumber}. {line.product.name} · {line.variant.name}</b><span className="block text-[10px] text-slate-400">{line.product.sku} / {line.variant.sku} · {line.product.trackingMethod}</span></td><td className="px-4 py-4">{line.units.length ? <div className="space-y-1">{line.units.map((unit) => { const values = identifierValues(unit.identifiers); return <div key={unit.id} className="rounded border border-slate-100 bg-slate-50 px-2 py-1 font-mono text-[10px]">{values.map((value) => canViewIdentifiers ? value : mask(value)).join(" / ") || "No staged identifier"} {unit.stockUnit && <span className="font-sans font-bold text-slate-500">· {titleCase(unit.stockUnit.status)}</span>}</div>; })}</div> : <span className="text-slate-400">Quantity tracked</span>}</td><td className="px-4 py-4 text-right font-bold">{line.quantity.toFixed(4)}</td><td className="px-4 py-4 text-right"><b className="text-emerald-700">{line.acceptedQuantity.toFixed(4)}</b><span className="block text-[10px] text-rose-600">Rejected {line.rejectedQuantity.toFixed(4)}</span></td><td className="px-4 py-4"><Badge tone={line.inspectionStatus === "ACCEPTED" ? "green" : line.inspectionStatus === "PENDING" ? "amber" : "red"}>{titleCase(line.inspectionStatus)}</Badge></td><td className="px-4 py-4 text-right">{formatMoney(line.landedUnitCost.toString(), receipt.currencyCode)}</td><td className="px-5 py-4 text-right"><b>{formatMoney(line.lineTotal.toString(), receipt.currencyCode)}</b><span className="block text-[10px] text-slate-400">Tax {formatMoney(line.taxAmount.toString(), receipt.currencyCode)}</span></td></tr>)}</tbody></table></div></section>

    <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <section className="surface overflow-hidden"><div className="border-b px-5 py-4"><h2 className="font-black">Linked procurement, finance & stock</h2></div><div className="grid gap-4 p-5 md:grid-cols-3"><div><p className="label">Purchase order</p><p className="mt-1 font-bold">{receipt.purchaseOrder?.orderNumber || "Direct receipt"}</p><p className="mt-1 text-xs text-slate-500">{receipt.purchaseOrder ? titleCase(receipt.purchaseOrder.status) : titleCase(receipt.receiptType)}</p></div><div><p className="label">Accounting voucher</p>{receipt.journalEntry ? <Link href={`/finance/journals/${receipt.journalEntry.id}`} className="mt-1 inline-flex items-center gap-1 font-bold text-blue-700">{receipt.journalEntry.voucherNumber}<ExternalLink className="h-3 w-3"/></Link> : <p className="mt-1 text-sm text-slate-400">Not posted</p>}<p className="mt-1 text-xs text-slate-500">{receipt.journalEntry ? `${titleCase(receipt.journalEntry.status)} · ${formatDate(receipt.journalEntry.postingDate)}` : ""}</p></div><div><p className="label">Stock movements</p><p className="mt-1 text-sm font-bold">{movements.length} append-only entries</p><p className="mt-1 text-xs text-slate-500">{movements.map((item) => titleCase(item.movementType)).join(", ") || "No stock effects"}</p></div></div><div className="border-t px-5 py-4"><h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Payments & supplier returns</h3>{!receipt.allocations.length && !receipt.stockReturns.length ? <p className="mt-3 text-sm text-slate-400">No linked payments or returns.</p> : <div className="mt-3 space-y-2">{receipt.allocations.map((item) => <div key={item.id} className="flex justify-between rounded-lg border p-3 text-xs"><span><b>{item.payment.paymentNumber}</b> · {titleCase(item.payment.direction)} · {titleCase(item.payment.status)}</span><b>{formatMoney(item.amount.toString(), receipt.currencyCode)}</b></div>)}{receipt.stockReturns.map((item) => <div key={item.id} className="flex justify-between rounded-lg border p-3 text-xs"><span><b>{item.returnNumber}</b> · {titleCase(item.status)} · {formatDate(item.returnDate)}</span><b>{formatMoney(item.grandTotal.toString(), receipt.currencyCode)}</b></div>)}</div>}</div>{receipt.inspections.length > 0 && <div className="border-t px-5 py-4"><h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Inspection records</h3><div className="mt-3 space-y-2">{receipt.inspections.slice(0, 8).map((item) => <div key={item.id} className="rounded-lg border p-3 text-xs"><b>{titleCase(item.result)}</b> · {item.inspectedBy.fullName} · {formatDate(item.inspectedAt, true)}{item.notes && <p className="mt-1 text-slate-500">{item.notes}</p>}</div>)}</div></div>}</section>
      <section className="surface overflow-hidden"><div className="border-b px-5 py-4"><h2 className="font-black">Workflow & audit timeline</h2></div><div className="border-b p-5 text-xs"><dl className="grid grid-cols-2 gap-y-2"><dt className="text-slate-500">Prepared by</dt><dd className="text-right font-bold">{receipt.preparedBy.fullName}</dd><dt className="text-slate-500">Received by</dt><dd className="text-right font-bold">{receipt.receivedBy.fullName}</dd><dt className="text-slate-500">Approved by</dt><dd className="text-right font-bold">{receipt.approvedBy?.fullName || "—"}</dd><dt className="text-slate-500">Posted by</dt><dd className="text-right font-bold">{receipt.postedBy?.fullName || "—"}</dd>{receipt.reversedBy && <><dt className="text-slate-500">Reversed by</dt><dd className="text-right font-bold">{receipt.reversedBy.fullName}</dd></>}</dl>{receipt.reversalReason && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-rose-900"><b>Reversal reason:</b> {receipt.reversalReason}</p>}</div><ol className="max-h-[430px] divide-y overflow-auto">{history.map((item) => <li key={item.id} className="flex gap-3 px-5 py-3"><div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.outcome === "SUCCESS" ? "bg-blue-600" : "bg-rose-500"}`}/><div><p className="text-xs font-bold">{titleCase(item.action)}</p><p className="mt-0.5 text-[10px] text-slate-500">{item.actor?.fullName || "System"} · {formatDate(item.createdAt, true)}</p></div></li>)}{!history.length && <li className="p-5 text-sm text-slate-400">No audit events recorded.</li>}</ol></section>
    </div>

    {(receipt.notes || receipt.directReceiptReason || receipt.overReceiptReason) && <section className="surface p-5"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-slate-400"/><h2 className="font-black">Receiving notes</h2></div><div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">{receipt.notes && <p className="whitespace-pre-wrap">{receipt.notes}</p>}{receipt.directReceiptReason && <p><b>Direct receipt:</b> {receipt.directReceiptReason}</p>}{receipt.overReceiptReason && <p><b>Over-receipt authorization:</b> {receipt.overReceiptReason}</p>}</div></section>}
  </div>;
}
