import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Edit3, FileText, Package, Plus, Printer, ShieldAlert, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney } from "@/lib/utils";
import { idSchema } from "@/lib/validation";

type PageProps = { params: Promise<{ id: string }> };

export default async function SupplierDetailPage({ params }: PageProps) {
  const context = await requirePagePermission("supplier.manage");
  const id = idSchema.parse((await params).id);

  const supplier = await prisma.supplier.findFirst({
    where: { id, companyId: context.company.id },
    include: {
      branch: { select: { code: true, name: true } },
      purchaseOrders: {
        select: {
          id: true,
          orderNumber: true,
          orderDate: true,
          status: true,
          grandTotal: true,
        },
        orderBy: { orderDate: "desc" },
        take: 10,
      },
      purchaseReceipts: {
        select: {
          id: true,
          receiptNumber: true,
          receiptDate: true,
          status: true,
          grandTotal: true,
        },
        orderBy: { receiptDate: "desc" },
        take: 10,
      },
      rebateCalculations: {
        select: {
          id: true,
          referenceNumber: true,
          periodStart: true,
          periodEnd: true,
          calculatedAmount: true,
          status: true,
        },
        orderBy: { periodEnd: "desc" },
        take: 5,
      },
    },
  });

  if (!supplier) notFound();

  const currency = context.company.currencyCode;
  const totalPurchases = supplier.purchaseReceipts
    .filter((r) => r.status === "POSTED")
    .reduce((sum, r) => sum + Number(r.grandTotal), 0);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/suppliers"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition mb-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Suppliers
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{supplier.name}</h1>
            <Badge tone={supplier.status === "ACTIVE" ? "green" : "slate"}>{supplier.status}</Badge>
            {supplier.contactPerson ? <Badge tone="slate">Contact: {supplier.contactPerson}</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Supplier Code: <span className="font-mono font-semibold text-slate-700">{supplier.code}</span> · Branch: {supplier.branch?.name || "General"}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/suppliers?edit=${supplier.id}`}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white hover:bg-blue-700 transition"
          >
            <Edit3 className="h-3.5 w-3.5" /> Edit Supplier
          </Link>

          <Link
            href={`/purchases/new?supplierId=${supplier.id}`}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <Plus className="h-3.5 w-3.5" /> New Purchase Order
          </Link>

          <Link
            href={`/finance/subledgers/suppliers/${supplier.id}/print`}
            target="_blank"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <Printer className="h-3.5 w-3.5" /> Account Statement
          </Link>
        </div>
      </div>

      {/* Info Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Goods Received</span>
          <p className="mt-1 text-2xl font-black text-slate-800">{formatMoney(String(totalPurchases), currency)}</p>
          <p className="text-xs text-slate-500 mt-1">{supplier.purchaseReceipts.length} Goods Receipt(s)</p>
        </div>

        <div className="surface p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment Terms</span>
          <p className="mt-1 text-2xl font-black text-slate-800">
            {supplier.paymentTermsDays ? `${supplier.paymentTermsDays} Days Net` : "Immediate / Cash"}
          </p>
          <p className="text-xs text-slate-500 mt-1">Credit Limit: {formatMoney(String(supplier.creditLimit), currency)}</p>
        </div>

        <div className="surface p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Contact & Phone</span>
          <p className="mt-1 text-base font-bold text-slate-800">{supplier.phone || "No phone recorded"}</p>
          <p className="text-xs text-slate-500 truncate">{supplier.email || "No email"}</p>
        </div>

        <div className="surface p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tax & Registration</span>
          <p className="mt-1 text-base font-bold text-slate-800">{supplier.taxNumber || "Non-Registered / No NTN"}</p>
          <p className="text-xs text-slate-500">Opening Balance: {formatMoney(String(supplier.openingBalance), currency)}</p>
        </div>
      </div>

      {/* Rate Protection Claims */}
      {supplier.rebateCalculations.length > 0 ? (
        <section className="surface p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-emerald-600" /> Rate Protection & Rebate Claims ({supplier.rebateCalculations.length})
            </h3>
            <Link href="/finance/rebates" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
              View All Claims
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {supplier.rebateCalculations.map((claim) => (
              <div key={claim.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs flex justify-between items-center">
                <div>
                  <span className="font-mono font-bold text-slate-800">{claim.referenceNumber}</span>
                  <span className="block text-[10px] text-slate-500">
                    Period ending {formatDate(claim.periodEnd)}
                  </span>
                </div>
                <div className="text-right">
                  <Badge tone={claim.status === "SETTLED" ? "green" : "blue"}>{claim.status}</Badge>
                  <span className="block font-mono font-bold text-emerald-800 mt-1">
                    {formatMoney(String(claim.calculatedAmount), currency)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Recent Purchase Orders & Receipts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Recent Purchase Orders ({supplier.purchaseOrders.length})</h2>
            <Link href="/purchases" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
              View All Orders
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">PO #</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supplier.purchaseOrders.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-800">{po.orderNumber}</td>
                    <td className="px-3 py-3 text-slate-600">{formatDate(po.orderDate)}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">
                      {formatMoney(String(po.grandTotal), currency)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge tone={po.status === "POSTED" ? "green" : "slate"}>{po.status}</Badge>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link href={`/purchases/${po.id}`} className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!supplier.purchaseOrders.length ? (
              <div className="py-8 text-center text-xs text-slate-400">No purchase orders recorded yet.</div>
            ) : null}
          </div>
        </section>

        <section className="surface overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Recent Goods Receipts ({supplier.purchaseReceipts.length})</h2>
            <Link href="/goods-receipts" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
              View All Receipts
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Receipt #</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supplier.purchaseReceipts.map((rcpt) => (
                  <tr key={rcpt.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-800">{rcpt.receiptNumber}</td>
                    <td className="px-3 py-3 text-slate-600">{formatDate(rcpt.receiptDate)}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">
                      {formatMoney(String(rcpt.grandTotal), currency)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge tone={rcpt.status === "POSTED" ? "green" : "slate"}>{rcpt.status}</Badge>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link href={`/goods-receipts/${rcpt.id}`} className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!supplier.purchaseReceipts.length ? (
              <div className="py-8 text-center text-xs text-slate-400">No goods receipts recorded yet.</div>
            ) : null}
          </div>
        </section>
      </div>

      {supplier.address ? (
        <div className="surface p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Registered Office Address</span>
          <p className="mt-1 text-xs text-slate-700">{supplier.address}</p>
        </div>
      ) : null}

      <div className="text-center text-[10px] text-slate-400 pt-4">
        © 2026 Copyright Reserved · Qasim Ali · 0315-5049489
      </div>
    </div>
  );
}

