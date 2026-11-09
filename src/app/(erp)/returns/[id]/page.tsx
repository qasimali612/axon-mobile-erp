import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, CheckCircle2, ExternalLink, FileText, Package, Printer, RotateCcw, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";
import { idSchema } from "@/lib/validation";

type PageProps = { params: Promise<{ id: string }> };

function statusTone(status: string) {
  if (status === "POSTED") return "green" as const;
  if (["SUBMITTED", "APPROVED"].includes(status)) return "amber" as const;
  if (["CANCELLED", "REJECTED"].includes(status)) return "red" as const;
  return "slate" as const;
}

export default async function ReturnDetailPage({ params }: PageProps) {
  const context = await requirePagePermission("dashboard.view");
  const id = idSchema.parse((await params).id);

  const doc = await prisma.stockReturn.findFirst({
    where: { id, companyId: context.company.id },
    include: {
      branch: { select: { code: true, name: true } },
      warehouse: { select: { code: true, name: true } },
      customer: { select: { code: true, name: true, phone: true } },
      supplier: { select: { code: true, name: true, phone: true } },
      salesInvoice: { select: { id: true, invoiceNumber: true, invoiceDate: true } },
      purchaseReceipt: { select: { id: true, receiptNumber: true, receiptDate: true } },
      preparedBy: { select: { fullName: true } },
      approvedBy: { select: { fullName: true } },
      postedBy: { select: { fullName: true } },
      journalEntry: { select: { id: true, voucherNumber: true, status: true } },
      lines: {
        include: {
          product: { select: { sku: true, name: true } },
          variant: { select: { sku: true, name: true } },
        },
      },
    },
  });

  if (!doc) notFound();

  const currency = doc.currencyCode || context.company.currencyCode;
  const isSalesReturn = doc.returnType === "SALES_RETURN";
  const party = isSalesReturn ? doc.customer : doc.supplier;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/returns"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition mb-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Returns Register
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{doc.returnNumber}</h1>
            <Badge tone={statusTone(doc.status)}>{titleCase(doc.status)}</Badge>
            <Badge tone={isSalesReturn ? "blue" : "purple"}>
              {isSalesReturn ? "Customer Sales Return" : "Supplier Purchase Return"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Recorded on {formatDate(doc.returnDate)} · Prepared by {doc.preparedBy.fullName}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {doc.journalEntry ? (
            <Link
              href={`/finance/journals/${doc.journalEntry.id}`}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              <BookOpen className="h-3.5 w-3.5" /> Journal {doc.journalEntry.voucherNumber}
            </Link>
          ) : null}

          <Link
            href={`/returns/${doc.id}/print`}
            target="_blank"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <Printer className="h-3.5 w-3.5" /> Print Return Note
          </Link>
        </div>
      </div>

      {/* Info Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {isSalesReturn ? "Customer" : "Supplier"}
          </span>
          <p className="mt-1 text-base font-black text-slate-800">{party?.name || "—"}</p>
          <p className="text-xs text-slate-500 font-mono mt-0.5">{party?.code || "—"}</p>
        </div>

        <div className="surface p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Source Document</span>
          {doc.salesInvoice ? (
            <div>
              <Link
                href={`/sales/${doc.salesInvoice.id}`}
                className="mt-1 inline-flex items-center gap-1 font-mono font-bold text-blue-600 hover:underline text-sm"
              >
                {doc.salesInvoice.invoiceNumber} <ExternalLink className="h-3 w-3" />
              </Link>
              <p className="text-xs text-slate-500 mt-0.5">Date: {formatDate(doc.salesInvoice.invoiceDate)}</p>
            </div>
          ) : doc.purchaseReceipt ? (
            <div>
              <Link
                href={`/goods-receipts/${doc.purchaseReceipt.id}`}
                className="mt-1 inline-flex items-center gap-1 font-mono font-bold text-blue-600 hover:underline text-sm"
              >
                {doc.purchaseReceipt.receiptNumber} <ExternalLink className="h-3 w-3" />
              </Link>
              <p className="text-xs text-slate-500 mt-0.5">Date: {formatDate(doc.purchaseReceipt.receiptDate)}</p>
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-500">Direct return</p>
          )}
        </div>

        <div className="surface p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Receiving Warehouse</span>
          <p className="mt-1 text-base font-bold text-slate-800">{doc.warehouse.name}</p>
          <p className="text-xs text-slate-500 font-mono mt-0.5">{doc.branch.name} ({doc.branch.code})</p>
        </div>

        <div className="surface p-4 bg-slate-50/60">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Return Total</span>
          <p className="mt-1 text-2xl font-black text-slate-900">{formatMoney(String(doc.grandTotal), currency)}</p>
          <p className="text-xs text-slate-500 mt-0.5">{doc.lines.length} returned line item(s)</p>
        </div>
      </div>

      {/* Reason Banner */}
      <div className="surface p-4 border-l-4 border-amber-500">
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Return Reason</span>
        <p className="mt-1 text-xs font-medium text-slate-800">{doc.reason}</p>
        {doc.notes ? <p className="mt-2 text-xs text-slate-500 whitespace-pre-wrap">{doc.notes}</p> : null}
      </div>

      {/* Returned Lines Table */}
      <section className="surface overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-900">Returned Line Items ({doc.lines.length})</h2>
          <p className="text-xs text-slate-500">Returned products, quantities, conditions, and dispositions</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Product / Specification</th>
                <th className="px-3 py-3">SKU</th>
                <th className="px-3 py-3 text-right">Quantity</th>
                <th className="px-3 py-3 text-center">Condition</th>
                <th className="px-3 py-3 text-center">Disposition</th>
                <th className="px-4 py-3 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {doc.lines.map((line, idx) => (
                <tr key={line.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-slate-400 font-mono">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{line.product.name}</p>
                    <p className="text-[11px] text-slate-500">{line.variant.name}</p>
                  </td>
                  <td className="px-3 py-3 font-mono text-slate-600">{line.variant.sku}</td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">
                    {Number(line.quantity).toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Badge tone="slate">{line.condition}</Badge>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Badge tone={line.disposition === "RESTOCK" ? "green" : "amber"}>
                      {line.disposition}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                    {formatMoney(String(line.lineTotal), currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50/80 font-bold text-slate-900 border-t border-slate-200">
                <td colSpan={3} className="px-4 py-3 text-right uppercase text-[10px] tracking-wider">
                  Total:
                </td>
                <td className="px-3 py-3 text-right font-mono font-bold">
                  {doc.lines.reduce((sum, l) => sum + Number(l.quantity), 0).toLocaleString()}
                </td>
                <td colSpan={2}></td>
                <td className="px-4 py-3 text-right font-mono text-blue-700 text-sm">
                  {formatMoney(String(doc.grandTotal), currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className="text-center text-[10px] text-slate-400 pt-4">
        © 2026 Copyright Reserved · Qasim Ali · 0315-5049489
      </div>
    </div>
  );
}
