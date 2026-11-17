"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Printer,
  Receipt,
  Search,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/utils";

type CustomerProfileData = {
  customer: {
    id: string;
    code: string;
    name: string;
    customerType: string | null;
    status: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    taxNumber: string | null;
    creditLimit: string | number;
    paymentTermsDays: number;
    openingBalance: string | number;
    branch: { code: string; name: string } | null;
    priceList: { code: string; name: string } | null;
  };
  currency: string;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string | null;
    status: string;
    grandTotal: number;
    paidAmount: number;
    openBalance: number;
    settlementStatus: "PAID" | "PARTIAL" | "UNPAID";
  }>;
  receipts: Array<{
    id: string;
    paymentNumber: string;
    paymentDate: string;
    amount: number;
    allocatedAmount: number;
    unallocatedAmount: number;
    status: string;
    methodName: string;
    reference: string | null;
    notes: string | null;
  }>;
  statement: {
    from: string;
    to: string;
    openingBalance: number;
    periodDebit: number;
    periodCredit: number;
    closingBalance: number;
    transactions: Array<{
      id: string;
      postingDate: string;
      voucherNumber: string;
      description: string;
      reference: string | null;
      branchCode: string;
      debit: number;
      credit: number;
      runningBalance: number;
      journalEntryId: string;
    }>;
    openItems: Array<{
      id: string;
      number: string;
      documentDate: string;
      dueDate: string;
      originalAmount: number;
      allocatedAmount: number;
      openAmount: number;
      daysPastDue: number;
      href: string;
    }>;
    aging: {
      current: number;
      days1To30: number;
      days31To60: number;
      days61To90: number;
      daysOver90: number;
      residual: number;
      balance: number;
    };
  };
};

type TabKey = "overview" | "invoices" | "receipts" | "ledger" | "aging" | "statement";

export function CustomerProfileView({ data }: { data: CustomerProfileData }) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [receiptSearch, setReceiptSearch] = useState("");

  const { customer, currency, invoices, receipts, statement } = data;

  // Calculated KPIs
  const totalSalesVolume = useMemo(
    () => invoices.reduce((sum, inv) => sum + inv.grandTotal, 0),
    [invoices]
  );
  const totalReceiptsVolume = useMemo(
    () => receipts.reduce((sum, r) => sum + r.amount, 0),
    [receipts]
  );
  const totalOutstandingAR = statement.closingBalance;
  const creditLimitNum = Number(customer.creditLimit) || 0;
  const availableCredit = creditLimitNum > 0 ? Math.max(0, creditLimitNum - Math.max(0, totalOutstandingAR)) : null;
  const totalUnallocatedAdvance = useMemo(
    () => receipts.reduce((sum, r) => sum + r.unallocatedAmount, 0),
    [receipts]
  );

  const filteredInvoices = useMemo(() => {
    if (!invoiceSearch.trim()) return invoices;
    const q = invoiceSearch.toLowerCase();
    return invoices.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.status.toLowerCase().includes(q) ||
        inv.settlementStatus.toLowerCase().includes(q)
    );
  }, [invoices, invoiceSearch]);

  const filteredReceipts = useMemo(() => {
    if (!receiptSearch.trim()) return receipts;
    const q = receiptSearch.toLowerCase();
    return receipts.filter(
      (r) =>
        r.paymentNumber.toLowerCase().includes(q) ||
        r.methodName.toLowerCase().includes(q) ||
        (r.reference && r.reference.toLowerCase().includes(q))
    );
  }, [receipts, receiptSearch]);

  const printStatementUrl = `/finance/subledgers/customer/${customer.id}/print?from=${statement.from}&to=${statement.to}`;
  const csvStatementUrl = `/api/finance/subledgers/customer/${customer.id}?from=${statement.from}&to=${statement.to}&format=csv`;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <Link
            href="/parties?tab=customers"
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
            Account Code: <span className="font-mono font-semibold text-slate-700">{customer.code}</span> · Branch: {customer.branch?.name || "All Branches"}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/parties?tab=customers&edit=${customer.id}`}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit Profile
          </Link>

          <Link
            href="/pos"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white hover:bg-blue-700 transition"
          >
            <ShoppingBag className="h-3.5 w-3.5" /> New POS Sale
          </Link>

          <Link
            href={`/finance/payments?direction=CUSTOMER_RECEIPT&customerId=${customer.id}`}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition"
          >
            <Receipt className="h-3.5 w-3.5" /> Record Receipt
          </Link>

          <a
            href={printStatementUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <Printer className="h-3.5 w-3.5" /> Account Statement
          </a>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto gap-2">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === "overview"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <TrendingUp className="h-4 w-4" /> Overview & KPIs
        </button>

        <button
          onClick={() => setActiveTab("invoices")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === "invoices"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <FileText className="h-4 w-4" /> Sales Invoices ({invoices.length})
        </button>

        <button
          onClick={() => setActiveTab("receipts")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === "receipts"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Receipt className="h-4 w-4" /> Receipts & Advances ({receipts.length})
        </button>

        <button
          onClick={() => setActiveTab("ledger")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === "ledger"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <CreditCard className="h-4 w-4" /> Account Ledger ({statement.transactions.length})
        </button>

        <button
          onClick={() => setActiveTab("aging")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === "aging"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Clock className="h-4 w-4" /> Aging & Open Items ({statement.openItems.length})
        </button>

        <button
          onClick={() => setActiveTab("statement")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === "statement"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Printer className="h-4 w-4" /> Statement Preview
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Top KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="surface p-4 border-l-4 border-blue-500">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Current Outstanding AR
              </span>
              <p
                className={`mt-1 text-2xl font-black ${
                  totalOutstandingAR > 0
                    ? "text-amber-700"
                    : totalOutstandingAR < 0
                    ? "text-emerald-700"
                    : "text-slate-800"
                }`}
              >
                {formatMoney(String(totalOutstandingAR), currency)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {totalOutstandingAR > 0
                  ? "Receivable balance due"
                  : totalOutstandingAR < 0
                  ? "Net advance credit balance"
                  : "All accounts settled"}
              </p>
            </div>

            <div className="surface p-4 border-l-4 border-emerald-500">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Available Credit Limit
              </span>
              <p className="mt-1 text-2xl font-black text-slate-800">
                {availableCredit !== null
                  ? formatMoney(String(availableCredit), currency)
                  : "Unlimited"}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Limit: {creditLimitNum > 0 ? formatMoney(String(creditLimitNum), currency) : "Not configured"}
              </p>
            </div>

            <div className="surface p-4 border-l-4 border-slate-500">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Total Billed Volume
              </span>
              <p className="mt-1 text-2xl font-black text-slate-800">
                {formatMoney(String(totalSalesVolume), currency)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {invoices.length} posted invoice(s)
              </p>
            </div>

            <div className="surface p-4 border-l-4 border-indigo-500">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Receipts & Advances
              </span>
              <p className="mt-1 text-2xl font-black text-slate-800">
                {formatMoney(String(totalReceiptsVolume), currency)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Unallocated advance: {formatMoney(String(totalUnallocatedAdvance), currency)}
              </p>
            </div>
          </div>

          {/* Aging Ribbon */}
          <div className="surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Current Aging Analysis (Days Past Due)
              </span>
              <span className="text-[10px] text-slate-400">Calculated as of today</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 text-center text-xs">
              <div className="p-2">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Not Due (Current)</span>
                <span className="font-bold text-slate-800 font-mono mt-1 block">
                  {formatMoney(String(statement.aging.current), currency)}
                </span>
              </div>
              <div className="p-2">
                <span className="block text-[10px] font-bold uppercase text-slate-400">1–30 Days</span>
                <span className="font-bold text-slate-800 font-mono mt-1 block">
                  {formatMoney(String(statement.aging.days1To30), currency)}
                </span>
              </div>
              <div className="p-2">
                <span className="block text-[10px] font-bold uppercase text-slate-400">31–60 Days</span>
                <span className="font-bold text-slate-800 font-mono mt-1 block">
                  {formatMoney(String(statement.aging.days31To60), currency)}
                </span>
              </div>
              <div className="p-2">
                <span className="block text-[10px] font-bold uppercase text-slate-400">61–90 Days</span>
                <span className="font-bold text-slate-800 font-mono mt-1 block">
                  {formatMoney(String(statement.aging.days61To90), currency)}
                </span>
              </div>
              <div className="p-2">
                <span className="block text-[10px] font-bold uppercase text-rose-600">Over 90 Days</span>
                <span className="font-bold text-rose-700 font-mono mt-1 block">
                  {formatMoney(String(statement.aging.daysOver90), currency)}
                </span>
              </div>
            </div>
          </div>

          {/* Account Profile Details Grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="surface p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Commercial & Financial Terms
              </h3>
              <div className="divide-y divide-slate-100 text-xs">
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">Customer Category</span>
                  <span className="font-semibold text-slate-800">{customer.customerType || "RETAIL"}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">Payment Terms</span>
                  <span className="font-semibold text-slate-800">
                    {customer.paymentTermsDays ? `${customer.paymentTermsDays} Days Net` : "Immediate / Cash"}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">Credit Limit</span>
                  <span className="font-semibold text-slate-800">
                    {creditLimitNum > 0 ? formatMoney(String(creditLimitNum), currency) : "Not Configured"}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">NTN / CNIC</span>
                  <span className="font-mono text-slate-800">{customer.taxNumber || "—"}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">Price List</span>
                  <span className="font-semibold text-slate-800">{customer.priceList?.name || "Standard Retail"}</span>
                </div>
              </div>
            </div>

            <div className="surface p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Contact & Address
              </h3>
              <div className="divide-y divide-slate-100 text-xs">
                <div className="flex items-center gap-2 py-2">
                  <Phone className="h-4 w-4 text-slate-400" />
                  <span className="font-semibold text-slate-800">{customer.phone || "No phone recorded"}</span>
                </div>
                <div className="flex items-center gap-2 py-2">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-700">{customer.email || "No email recorded"}</span>
                </div>
                <div className="flex items-start gap-2 py-2">
                  <MapPin className="h-4 w-4 text-slate-400 mt-0.5" />
                  <span className="text-slate-700">{customer.address || "No address on file"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Sales Invoices */}
      {activeTab === "invoices" && (
        <section className="surface overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Sales Invoices ({filteredInvoices.length})
              </h2>
              <p className="text-xs text-slate-500">All billed sales transactions</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search invoice # or status..."
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Invoice Date</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-3 py-3 text-right">Grand Total</th>
                  <th className="px-3 py-3 text-right">Settled Amount</th>
                  <th className="px-3 py-3 text-right">Open Balance</th>
                  <th className="px-4 py-3 text-center">Settlement Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">
                      <Link href={`/sales/${inv.id}`} className="hover:text-blue-600">
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(inv.invoiceDate)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {inv.dueDate ? formatDate(inv.dueDate) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-slate-800">
                      {formatMoney(String(inv.grandTotal), currency)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-emerald-700">
                      {formatMoney(String(inv.paidAmount), currency)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">
                      {formatMoney(String(inv.openBalance), currency)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        tone={
                          inv.settlementStatus === "PAID"
                            ? "green"
                            : inv.settlementStatus === "PARTIAL"
                            ? "amber"
                            : "slate"
                        }
                      >
                        {inv.settlementStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/sales/${inv.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                      >
                        View <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredInvoices.length ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No invoices match your search.
              </div>
            ) : null}
          </div>
        </section>
      )}

      {/* Tab 3: Receipts & Payments */}
      {activeTab === "receipts" && (
        <section className="surface overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Customer Receipts ({filteredReceipts.length})
              </h2>
              <p className="text-xs text-slate-500">Payments and on-account advances received</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search receipt #, method or ref..."
                value={receiptSearch}
                onChange={(e) => setReceiptSearch(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Receipt #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Method / Account</th>
                  <th className="px-3 py-3 text-right">Receipt Amount</th>
                  <th className="px-3 py-3 text-right">Allocated to Invoices</th>
                  <th className="px-3 py-3 text-right">Unallocated Advance</th>
                  <th className="px-4 py-3 text-left">Reference / Notes</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredReceipts.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">
                      {r.paymentNumber}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(r.paymentDate)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{r.methodName}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">
                      {formatMoney(String(r.amount), currency)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-emerald-700">
                      {formatMoney(String(r.allocatedAmount), currency)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-blue-700 font-semibold">
                      {r.unallocatedAmount > 0
                        ? formatMoney(String(r.unallocatedAmount), currency)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 truncate max-w-[200px]" title={r.reference || r.notes || ""}>
                      {r.reference || r.notes || "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge tone={r.status === "POSTED" ? "green" : "slate"}>{r.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredReceipts.length ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No customer receipts recorded.
              </div>
            ) : null}
          </div>
        </section>
      )}

      {/* Tab 4: Account Ledger */}
      {activeTab === "ledger" && (
        <section className="surface overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                General Ledger Subledger ({statement.transactions.length} entries)
              </h2>
              <p className="text-xs text-slate-500">
                Chronological double-entry running balance from {formatDate(statement.from)} to {formatDate(statement.to)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={csvStatementUrl}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </a>
              <a
                href={printStatementUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Printer className="h-3.5 w-3.5" /> Print Statement
              </a>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-xs">
              <thead className="bg-slate-900 text-[10px] font-bold uppercase tracking-wider text-white">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Voucher #</th>
                  <th className="px-4 py-3">Particulars / Source</th>
                  <th className="px-3 py-3">Branch</th>
                  <th className="px-3 py-3 text-right">Debit (+)</th>
                  <th className="px-3 py-3 text-right">Credit (−)</th>
                  <th className="px-4 py-3 text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Opening Balance Row */}
                <tr className="bg-slate-50/80 font-semibold text-slate-700">
                  <td className="px-4 py-2.5">{formatDate(statement.from)}</td>
                  <td className="px-4 py-2.5">—</td>
                  <td className="px-4 py-2.5 italic">Balance brought forward (Opening)</td>
                  <td className="px-3 py-2.5">—</td>
                  <td className="px-3 py-2.5 text-right">—</td>
                  <td className="px-3 py-2.5 text-right">—</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                    {formatMoney(String(statement.openingBalance), currency)}
                  </td>
                </tr>

                {statement.transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 text-slate-600">{formatDate(tx.postingDate)}</td>
                    <td className="px-4 py-2.5 font-mono font-bold text-slate-900">
                      <Link href={`/finance/journals/${tx.journalEntryId}`} className="hover:text-blue-600">
                        {tx.voucherNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-800">
                      <span className="font-semibold">{tx.reference || tx.description}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{tx.branchCode}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-900">
                      {tx.debit > 0 ? formatMoney(String(tx.debit), currency) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-900">
                      {tx.credit > 0 ? formatMoney(String(tx.credit), currency) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-950">
                      {formatMoney(String(tx.runningBalance), currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-900 bg-slate-50 font-bold text-slate-900">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-right uppercase tracking-wider text-[10px]">
                    Period Totals & Closing Balance:
                  </td>
                  <td className="px-3 py-3 text-right font-mono">
                    {formatMoney(String(statement.periodDebit), currency)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono">
                    {formatMoney(String(statement.periodCredit), currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-blue-900">
                    {formatMoney(String(statement.closingBalance), currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {/* Tab 5: Aging & Open Items */}
      {activeTab === "aging" && (
        <div className="space-y-6">
          <section className="surface p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-4">Aging Breakdown</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 text-center text-xs">
              <div className="p-3">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Current / Not Due</span>
                <span className="font-bold text-slate-800 font-mono mt-1 block text-base">
                  {formatMoney(String(statement.aging.current), currency)}
                </span>
              </div>
              <div className="p-3">
                <span className="block text-[10px] font-bold uppercase text-slate-400">1–30 Days Overdue</span>
                <span className="font-bold text-slate-800 font-mono mt-1 block text-base">
                  {formatMoney(String(statement.aging.days1To30), currency)}
                </span>
              </div>
              <div className="p-3">
                <span className="block text-[10px] font-bold uppercase text-slate-400">31–60 Days Overdue</span>
                <span className="font-bold text-slate-800 font-mono mt-1 block text-base">
                  {formatMoney(String(statement.aging.days31To60), currency)}
                </span>
              </div>
              <div className="p-3">
                <span className="block text-[10px] font-bold uppercase text-slate-400">61–90 Days Overdue</span>
                <span className="font-bold text-slate-800 font-mono mt-1 block text-base">
                  {formatMoney(String(statement.aging.days61To90), currency)}
                </span>
              </div>
              <div className="p-3">
                <span className="block text-[10px] font-bold uppercase text-rose-600">Over 90 Days</span>
                <span className="font-bold text-rose-700 font-mono mt-1 block text-base">
                  {formatMoney(String(statement.aging.daysOver90), currency)}
                </span>
              </div>
            </div>
          </section>

          <section className="surface overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Open Documents ({statement.openItems.length})
                </h3>
                <p className="text-xs text-slate-500">Unsettled sales invoices requiring receipt</p>
              </div>
              {statement.aging.residual !== 0 && (
                <span className="text-xs font-semibold text-blue-700">
                  On-account unallocated advance: {formatMoney(String(Math.abs(statement.aging.residual)), currency)}
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Document #</th>
                    <th className="px-4 py-3">Invoice Date</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-3 py-3 text-right">Original Amount</th>
                    <th className="px-3 py-3 text-right">Settled Amount</th>
                    <th className="px-3 py-3 text-right">Open Amount</th>
                    <th className="px-4 py-3 text-right">Aging Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {statement.openItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">
                        <Link href={item.href} className="hover:text-blue-600">
                          {item.number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(item.documentDate)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(item.dueDate)}</td>
                      <td className="px-3 py-3 text-right font-mono">
                        {formatMoney(String(item.originalAmount), currency)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-emerald-700">
                        {formatMoney(String(item.allocatedAmount), currency)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">
                        {formatMoney(String(item.openAmount), currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {item.daysPastDue > 0 ? (
                          <span className="text-rose-700">{item.daysPastDue}d Overdue</span>
                        ) : (
                          <span className="text-emerald-700">Current</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!statement.openItems.length ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  All customer invoices are fully settled. Zero open documents.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      )}

      {/* Tab 6: Statement Preview & Action */}
      {activeTab === "statement" && (
        <div className="surface p-6 space-y-4 text-center">
          <FileText className="h-12 w-12 text-blue-600 mx-auto" />
          <h2 className="text-base font-bold text-slate-900">
            Official Customer Subledger Statement
          </h2>
          <p className="text-xs text-slate-500 max-w-lg mx-auto">
            Generate and print an official double-entry account statement for {customer.name} with complete opening balance, period debits, credits, running balance, aging analysis, and signature blocks.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <a
              href={printStatementUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-5 text-xs font-semibold text-white hover:bg-blue-700 transition"
            >
              <Printer className="h-4 w-4" /> Open Full Printable Statement (A4)
            </a>
            <a
              href={csvStatementUrl}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              <Download className="h-4 w-4" /> Export CSV
            </a>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-[10px] text-slate-400 pt-6">
        © 2026 Copyright Reserved · Qasim Ali · 0315-5049489
      </div>
    </div>
  );
}
