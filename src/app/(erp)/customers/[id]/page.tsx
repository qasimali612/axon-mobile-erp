import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Banknote, Edit3, FileText, Phone, Printer, ShoppingBag, UserCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";
import { idSchema } from "@/lib/validation";

type PageProps = { params: Promise<{ id: string }> };

export default async function CustomerDetailPage({ params }: PageProps) {
  const context = await requirePagePermission("customer.manage");
  const id = idSchema.parse((await params).id);

  const customer = await prisma.customer.findFirst({
    where: { id, companyId: context.company.id },
    include: {
      branch: { select: { code: true, name: true } },
      salesInvoices: {
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          status: true,
          grandTotal: true,
          allocations: {
            select: {
              amount: true,
              payment: { select: { status: true, direction: true } },
            },
          },
        },
        orderBy: { invoiceDate: "desc" },
        take: 15,
      },
    },
  });

  if (!customer) notFound();

  const currency = context.company.currencyCode;
  const totalSales = customer.salesInvoices.reduce((sum, inv) => sum + Number(inv.grandTotal), 0);
  const totalOutstanding = customer.salesInvoices
    .filter((inv) => inv.status === "POSTED")
    .reduce((sum, inv) => {
      const paid = inv.allocations.reduce((pSum, a) => {
        if (a.payment.status !== "POSTED") return pSum;
        return a.payment.direction === "CUSTOMER_RECEIPT" ? pSum + Number(a.amount) : pSum - Number(a.amount);
      }, 0);
      return sum + Math.max(0, Number(inv.grandTotal) - paid);
    }, 0);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/customers"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition mb-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Customers
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{customer.name}</h1>
            <Badge tone={customer.status === "ACTIVE" ? "green" : "slate"}>{customer.status}</Badge>
            <Badge tone="blue">{customer.customerType || "RETAIL"}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Account Code: <span className="font-mono font-semibold text-slate-700">{customer.code}</span> · Branch: {customer.branch?.name || "General"}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/customers?edit=${customer.id}`}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white hover:bg-blue-700 transition"
          >
            <Edit3 className="h-3.5 w-3.5" /> Edit Profile
          </Link>

          <Link
            href={`/pos`}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <ShoppingBag className="h-3.5 w-3.5" /> New POS Sale
          </Link>

          <Link
            href={`/finance/subledgers/customers/${customer.id}/print`}
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
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Outstanding</span>
          <p className={`mt-1 text-2xl font-black ${totalOutstanding > 0 ? "text-amber-700" : "text-slate-800"}`}>
            {formatMoney(String(totalOutstanding), currency)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Credit Limit: {formatMoney(String(customer.creditLimit), currency)}
          </p>
        </div>

        <div className="surface p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Billed Volume</span>
          <p className="mt-1 text-2xl font-black text-slate-800">{formatMoney(String(totalSales), currency)}</p>
          <p className="text-xs text-slate-500 mt-1">{customer.salesInvoices.length} posted transaction(s)</p>
        </div>

        <div className="surface p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Contact & Phone</span>
          <p className="mt-1 text-base font-bold text-slate-800">{customer.phone || "No phone recorded"}</p>
          <p className="text-xs text-slate-500 truncate">{customer.email || "No email"}</p>
        </div>

        <div className="surface p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Commercial Terms</span>
          <p className="mt-1 text-base font-bold text-slate-800">
            {customer.paymentTermsDays ? `${customer.paymentTermsDays} Days Net` : "Immediate / Cash"}
          </p>
          <p className="text-xs text-slate-500">NTN / CNIC: {customer.taxNumber || "—"}</p>
        </div>
      </div>

      {/* Recent Invoices Table */}
      <section className="surface overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Recent Sales Invoices ({customer.salesInvoices.length})</h2>
            <p className="text-xs text-slate-500">Recent purchases and payment balances</p>
          </div>
          <Link
            href="/sales"
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
          >
            View All Sales
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[750px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Invoice #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-3 py-3 text-right">Grand Total</th>
                <th className="px-3 py-3 text-right">Paid</th>
                <th className="px-3 py-3 text-right">Balance</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customer.salesInvoices.map((inv) => {
                const paid = inv.allocations.reduce((pSum, a) => {
                  if (a.payment.status !== "POSTED") return pSum;
                  return a.payment.direction === "CUSTOMER_RECEIPT" ? pSum + Number(a.amount) : pSum - Number(a.amount);
                }, 0);
                const balance = Math.max(0, Number(inv.grandTotal) - paid);
                return (
                  <tr key={inv.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-800">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(inv.invoiceDate)}</td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-slate-800">
                      {formatMoney(String(inv.grandTotal), currency)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-emerald-700">
                      {formatMoney(String(paid), currency)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">
                      {formatMoney(String(balance), currency)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge tone={inv.status === "POSTED" ? "green" : "slate"}>{inv.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/sales/${inv.id}`}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!customer.salesInvoices.length ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No sales invoices recorded for this customer yet.
            </div>
          ) : null}
        </div>
      </section>

      {/* Address */}
      {customer.address ? (
        <div className="surface p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Billing & Delivery Address</span>
          <p className="mt-1 text-xs text-slate-700">{customer.address}</p>
        </div>
      ) : null}

      <div className="text-center text-[10px] text-slate-400 pt-4">
        © 2026 Copyright Reserved · Qasim Ali · 0315-5049489
      </div>
    </div>
  );
}
