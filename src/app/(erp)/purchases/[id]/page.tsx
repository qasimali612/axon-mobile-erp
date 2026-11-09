import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, Edit3, ExternalLink, FileText, Package, PackageCheck, Printer, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";
import { idSchema } from "@/lib/validation";

type PageProps = { params: Promise<{ id: string }> };

function statusTone(status: string) {
  if (status === "POSTED" || status === "APPROVED" || status === "COMPLETED") return "green" as const;
  if (["SUBMITTED", "PENDING"].includes(status)) return "amber" as const;
  if (["CANCELLED", "REJECTED"].includes(status)) return "red" as const;
  return "slate" as const;
}

export default async function PurchaseOrderDetailPage({ params }: PageProps) {
  const context = await requirePagePermission("purchase.view");
  const id = idSchema.parse((await params).id);

  const order = await prisma.purchaseOrder.findFirst({
    where: { id, companyId: context.company.id },
    include: {
      branch: { select: { code: true, name: true } },
      warehouse: { select: { code: true, name: true } },
      supplier: { select: { id: true, code: true, name: true, phone: true, email: true, taxNumber: true } },
      preparedBy: { select: { id: true, fullName: true } },
      approvedBy: { select: { id: true, fullName: true } },
      receipts: {
        select: {
          id: true,
          receiptNumber: true,
          receiptDate: true,
          status: true,
          grandTotal: true,
        },
        orderBy: { receiptDate: "desc" },
      },
      lines: {
        include: {
          product: { select: { id: true, sku: true, name: true } },
          variant: { select: { id: true, sku: true, name: true } },
        },
        orderBy: { lineNumber: "asc" },
      },
    },
  });

  if (!order) notFound();

  const currency = context.company.currencyCode;
  const totalOrdered = order.lines.reduce((sum, l) => sum + Number(l.orderedQuantity), 0);
  const totalReceived = order.lines.reduce((sum, l) => sum + Number(l.receivedQuantity), 0);
  const isFullyReceived = totalOrdered > 0 && totalReceived >= totalOrdered;
  const isPartiallyReceived = totalReceived > 0 && totalReceived < totalOrdered;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/purchases"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition mb-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Purchase Orders
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{order.orderNumber}</h1>
            <Badge tone={statusTone(order.status)}>{titleCase(order.status)}</Badge>
            {isFullyReceived ? (
              <Badge tone="green">Fully Received</Badge>
            ) : isPartiallyReceived ? (
              <Badge tone="amber">Partially Received ({Math.round((totalReceived / totalOrdered) * 100)}%)</Badge>
            ) : (
              <Badge tone="slate">Pending Receipt</Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Placed on {formatDate(order.orderDate)} · Prepared by {order.preparedBy.fullName}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {order.status !== "POSTED" && order.status !== "CANCELLED" ? (
            <Link
              href={`/purchases/${order.id}/edit`}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              <Edit3 className="h-3.5 w-3.5" /> Edit Order
            </Link>
          ) : null}

          {!isFullyReceived && order.status !== "CANCELLED" ? (
            <Link
              href={`/goods-receipts/new?purchaseOrderId=${order.id}`}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white hover:bg-blue-700 transition"
            >
              <Truck className="h-3.5 w-3.5" /> Receive Goods
            </Link>
          ) : null}

          <Link
            href={`/purchases/${order.id}/print`}
            target="_blank"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <Printer className="h-3.5 w-3.5" /> Print PO
          </Link>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Supplier</span>
          <p className="mt-1 text-sm font-black text-slate-800">{order.supplier.name}</p>
          <p className="text-xs text-slate-500 font-mono mt-0.5">{order.supplier.code}</p>
          {order.supplier.phone ? <p className="text-xs text-slate-500 mt-1">Tel: {order.supplier.phone}</p> : null}
        </div>

        <div className="surface p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Destination</span>
          <p className="mt-1 text-sm font-bold text-slate-800">{order.warehouse.name}</p>
          <p className="text-xs text-slate-500">Branch: {order.branch.name} ({order.branch.code})</p>
          <p className="text-xs text-slate-500 mt-1">
            Expected: {order.expectedDate ? formatDate(order.expectedDate) : "Not specified"}
          </p>
        </div>

        <div className="surface p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Receiving Progress</span>
          <p className="mt-1 text-sm font-black text-slate-800">
            {totalReceived.toLocaleString()} / {totalOrdered.toLocaleString()} units
          </p>
          <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${isFullyReceived ? "bg-emerald-500" : "bg-blue-600"}`}
              style={{ width: `${Math.min(100, Math.round((totalReceived / (totalOrdered || 1)) * 100))}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {order.receipts.length} Goods Receipt document(s) generated
          </p>
        </div>

        <div className="surface p-4 bg-blue-50/40 border-blue-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Grand Total</span>
          <p className="mt-1 text-xl font-black text-blue-900">{formatMoney(String(order.grandTotal), currency)}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Subtotal: {formatMoney(String(order.subtotal), currency)} · Tax: {formatMoney(String(order.taxTotal), currency)}
          </p>
        </div>
      </div>

      {/* Line Items Table */}
      <section className="surface overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Ordered Items ({order.lines.length})</h2>
            <p className="text-xs text-slate-500">Products, specifications, quantities, and receipt status</p>
          </div>
          <span className="text-xs font-semibold text-slate-600">
            Total Units: <span className="font-mono font-bold text-slate-900">{totalOrdered.toLocaleString()}</span>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Product / Specification</th>
                <th className="px-3 py-3">SKU</th>
                <th className="px-3 py-3 text-right">Unit Cost</th>
                <th className="px-3 py-3 text-right">Ordered</th>
                <th className="px-3 py-3 text-right">Received</th>
                <th className="px-3 py-3 text-right">Remaining</th>
                <th className="px-3 py-3 text-right">Tax</th>
                <th className="px-4 py-3 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order.lines.map((line) => {
                const ordered = Number(line.orderedQuantity);
                const received = Number(line.receivedQuantity);
                const remaining = Math.max(0, ordered - received);
                return (
                  <tr key={line.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-slate-400 font-mono">{line.lineNumber}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{line.product.name}</p>
                      <p className="text-[11px] text-slate-500">{line.variant.name}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-slate-600">{line.variant.sku}</td>
                    <td className="px-3 py-3 text-right font-mono text-slate-700">
                      {formatMoney(String(line.unitCost), currency)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-slate-900">
                      {ordered.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-emerald-700">
                      {received.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-slate-600">
                      {remaining > 0 ? (
                        <span className="text-amber-700 font-semibold">{remaining.toLocaleString()}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-slate-500">
                      {formatMoney(String(line.taxAmount), currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                      {formatMoney(String(line.lineTotal), currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50/80 font-bold text-slate-900 border-t border-slate-200">
                <td colSpan={4} className="px-4 py-3 text-right uppercase text-[10px] tracking-wider">
                  Totals:
                </td>
                <td className="px-3 py-3 text-right font-mono">{totalOrdered.toLocaleString()}</td>
                <td className="px-3 py-3 text-right font-mono text-emerald-700">{totalReceived.toLocaleString()}</td>
                <td className="px-3 py-3 text-right font-mono text-amber-700">
                  {Math.max(0, totalOrdered - totalReceived).toLocaleString()}
                </td>
                <td className="px-3 py-3 text-right font-mono text-slate-600">
                  {formatMoney(String(order.taxTotal), currency)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-blue-700 text-sm">
                  {formatMoney(String(order.grandTotal), currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Associated Goods Receipts */}
      {order.receipts.length > 0 ? (
        <section className="surface p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <PackageCheck className="h-4 w-4 text-emerald-600" /> Associated Goods Receipts ({order.receipts.length})
            </h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {order.receipts.map((rcpt) => (
              <Link
                key={rcpt.id}
                href={`/goods-receipts/${rcpt.id}`}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 hover:border-blue-300 hover:bg-blue-50/30 transition group"
              >
                <div>
                  <span className="font-mono font-bold text-xs text-slate-800 group-hover:text-blue-700">
                    {rcpt.receiptNumber}
                  </span>
                  <span className="block text-[10px] text-slate-500">{formatDate(rcpt.receiptDate)}</span>
                </div>
                <div className="text-right">
                  <Badge tone={statusTone(rcpt.status)}>{titleCase(rcpt.status)}</Badge>
                  <span className="block font-mono text-xs font-semibold text-slate-700 mt-1">
                    {formatMoney(String(rcpt.grandTotal), currency)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Notes & Audit footer */}
      {order.notes ? (
        <div className="surface p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Notes & Instructions</span>
          <p className="mt-1 text-xs text-slate-700 whitespace-pre-wrap">{order.notes}</p>
        </div>
      ) : null}

      <div className="text-center text-[10px] text-slate-400 pt-4">
        © 2026 Copyright Reserved · Qasim Ali · 0315-5049489
      </div>
    </div>
  );
}
