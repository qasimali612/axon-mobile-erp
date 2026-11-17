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
  Plus,
  Printer,
  Receipt,
  Search,
  TrendingUp,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/lib/utils";

type SupplierProfileData = {
  supplier: {
    id: string;
    code: string;
    name: string;
    contactPerson: string | null;
    status: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    taxNumber: string | null;
    creditLimit: string | number;
    paymentTermsDays: number;
    openingBalance: string | number;
    branch: { code: string; name: string } | null;
  };
  currency: string;
  bills: Array<{
    id: string;
    receiptNumber: string;
    receiptDate: string;
    dueDate: string | null;
    status: string;
    grandTotal: number;
    paidAmount: number;
    openBalance: number;
    settlementStatus: "PAID" | "PARTIAL" | "UNPAID";
  }>;
  payments: Array<{
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

type TabKey = "overview" | "bills" | "payments" | "ledger" | "aging" | "statement";

export function SupplierProfileView({ data }: { data: SupplierProfileData }) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [billSearch, setBillSearch] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");

  const { supplier, currency, bills, payments, statement } = data;

  // Calculated KPIs
  const totalPurchasesVolume = useMemo(
    () => bills.reduce((sum, b) => sum + b.grandTotal, 0),
    [bills]
  );
  const totalPaymentsVolume = useMemo(
    () => payments.reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );
  const totalOutstandingAP = statement.closingBalance;
  const totalUnallocatedAdvance = useMemo(
    () => payments.reduce((sum, p) => sum + p.unallocatedAmount, 0),
    [payments]
  );

  const filteredBills = useMemo(() => {
    if (!billSearch.trim()) return bills;
    const q = billSearch.toLowerCase();
    return bills.filter(
      (b) =>
        b.receiptNumber.toLowerCase().includes(q) ||
        b.status.toLowerCase().includes(q) ||
        b.settlementStatus.toLowerCase().includes(q)
    );
  }, [bills, billSearch]);

  const filteredPayments = useMemo(() => {
    if (!paymentSearch.trim()) return payments;
    const q = paymentSearch.toLowerCase();
    return payments.filter(
      (p) =>
        p.paymentNumber.toLowerCase().includes(q) ||
        p.methodName.toLowerCase().includes(q) ||
        (p.reference && p.reference.toLowerCase().includes(q))
    );
  }, [payments, paymentSearch]);

  const printStatementUrl = `/finance/subledgers/supplier/${supplier.id}/print?from=${statement.from}&to=${statement.to}`;
  const csvStatementUrl = `/api/finance/subledgers/supplier/${supplier.id}?from=${statement.from}&to=${statement.to}&format=csv`;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <Link
            href="/parties?tab=suppliers"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition mb-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Suppliers
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{supplier.name}</h1>
            <Badge tone={supplier.status === "ACTIVE" ? "green" : "slate"}>{supplier.status}</Badge>
            {supplier.contactPerson && <Badge tone="slate">Contact: {supplier.contactPerson}</Badge>}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Supplier Code: <span className="font-mono font-semibold text-slate-700">{supplier.code}</span> · Branch: {supplier.branch?.name || "All Branches"}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/parties?tab=suppliers&edit=${supplier.id}`}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit Supplier
          </Link>

          <Link
            href={`/purchases/new?supplierId=${supplier.id}`}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white hover:bg-blue-700 transition"
          >
            <Plus className="h-3.5 w-3.5" /> New Purchase Order
          </Link>

          <Link
            href={`/finance/payments?direction=SUPPLIER_PAYMENT&supplierId=${supplier.id}`}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition"
          >
            <Receipt className="h-3.5 w-3.5" /> Record Payment
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
          onClick={() => setActiveTab("bills")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === "bills"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Truck className="h-4 w-4" /> Purchase Bills ({bills.length})
        </button>

        <button
          onClick={() => setActiveTab("payments")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === "payments"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Receipt className="h-4 w-4" /> Payments Made ({payments.length})
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
            <div className="surface p-4 border-l-4 border-amber-500">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Current Outstanding AP
              </span>
              <p
                className={`mt-1 text-2xl font-black ${
                  totalOutstandingAP > 0
                    ? "text-amber-700"
                    : totalOutstandingAP < 0
                    ? "text-emerald-700"
                    : "text-slate-800"
                }`}
              >
                {formatMoney(String(totalOutstandingAP), currency)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {totalOutstandingAP > 0
                  ? "Payable balance owed"
                  : totalOutstandingAP < 0
                  ? "Debit balance / advance"
                  : "All bills fully settled"}
              </p>
            </div>

            <div className="surface p-4 border-l-4 border-blue-500">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Total Billed Purchases
              </span>
              <p className="mt-1 text-2xl font-black text-slate-800">
                {formatMoney(String(totalPurchasesVolume), currency)}
              </p>
              <p className="text-xs text-slate-500 mt-1">{bills.length} posted goods receipt(s)</p>
            </div>

            <div className="surface p-4 border-l-4 border-emerald-500">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Total Payments Disbursed
              </span>
              <p className="mt-1 text-2xl font-black text-slate-800">
                {formatMoney(String(totalPaymentsVolume), currency)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {payments.length} posted settlement payment(s)
              </p>
            </div>

            <div className="surface p-4 border-l-4 border-indigo-500">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Unallocated Advances
              </span>
              <p className="mt-1 text-2xl font-black text-slate-800">
                {formatMoney(String(totalUnallocatedAdvance), currency)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Available against opening / future bills
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
                Commercial & Credit Terms
              </h3>
              <div className="divide-y divide-slate-100 text-xs">
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">Contact Person</span>
                  <span className="font-semibold text-slate-800">{supplier.contactPerson || "Not recorded"}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">Payment Terms</span>
                  <span className="font-semibold text-slate-800">
                    {supplier.paymentTermsDays ? `${supplier.paymentTermsDays} Days Net` : "Immediate / Cash"}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">Initial Opening Balance</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {formatMoney(String(supplier.openingBalance || 0), currency)}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">NTN / STRN</span>
                  <span className="font-mono text-slate-800">{supplier.taxNumber || "—"}</span>
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
                  <span className="font-semibold text-slate-800">{supplier.phone || "No phone recorded"}</span>
                </div>
                <div className="flex items-center gap-2 py-2">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-700">{supplier.email || "No email recorded"}</span>
                </div>
                <div className="flex items-start gap-2 py-2">
                  <MapPin className="h-4 w-4 text-slate-400 mt-0.5" />
                  <span className="text-slate-700">{supplier.address || "No address on file"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Purchase Bills */}
      {activeTab === "bills" && (
        <section className="surface overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Purchase Bills / Goods Receipts ({filteredBills.length})
              </h2>
              <p className="text-xs text-slate-500">All inventory receiving vouchers</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search bill # or status..."
                value={billSearch}
                onChange={(e) => setBillSearch(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Receipt / Bill #</th>
                  <th className="px-4 py-3">Receipt Date</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-3 py-3 text-right">Grand Total</th>
                  <th className="px-3 py-3 text-right">Paid Amount</th>
                  <th className="px-3 py-3 text-right">Open Balance</th>
                  <th className="px-4 py-3 text-center">Settlement Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBills.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">
                      <Link href={`/goods-receipts/${b.id}`} className="hover:text-blue-600">
                        {b.receiptNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(b.receiptDate)}</td>
                    <td className="px-4 py-3 text-slate-600">{b.dueDate ? formatDate(b.dueDate) : "—"}</td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-slate-800">
                      {formatMoney(String(b.grandTotal), currency)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-emerald-700">
                      {formatMoney(String(b.paidAmount), currency)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">
                      {formatMoney(String(b.openBalance), currency)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        tone={
                          b.settlementStatus === "PAID"
                            ? "green"
                            : b.settlementStatus === "PARTIAL"
                            ? "amber"
                            : "slate"
                        }
                      >
                        {b.settlementStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/goods-receipts/${b.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                      >
                        View <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredBills.length ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No purchase bills recorded for this supplier.
              </div>
            ) : null}
          </div>
        </section>
      )}

      {/* Tab 3: Payments */}
      {activeTab === "payments" && (
        <section className="surface overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Supplier Payments ({filteredPayments.length})
              </h2>
              <p className="text-xs text-slate-500">Payments and on-account advances disbursed</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search voucher #, method or ref..."
                value={paymentSearch}
                onChange={(e) => setPaymentSearch(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Voucher #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Method / Account</th>
                  <th className="px-3 py-3 text-right">Payment Amount</th>
                  <th className="px-3 py-3 text-right">Allocated to Bills</th>
                  <th className="px-3 py-3 text-right">Unallocated Advance</th>
                  <th className="px-4 py-3 text-left">Reference / Notes</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">
                      {p.paymentNumber}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(p.paymentDate)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{p.methodName}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">
                      {formatMoney(String(p.amount), currency)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-emerald-700">
                      {formatMoney(String(p.allocatedAmount), currency)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-blue-700 font-semibold">
                      {p.unallocatedAmount > 0
                        ? formatMoney(String(p.unallocatedAmount), currency)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 truncate max-w-[200px]" title={p.reference || p.notes || ""}>
                      {p.reference || p.notes || "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge tone={p.status === "POSTED" ? "green" : "slate"}>{p.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredPayments.length ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No supplier payments recorded.
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
                  <th className="px-3 py-3 text-right">Debit (−)</th>
                  <th className="px-3 py-3 text-right">Credit (+)</th>
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
                    <td className="px-4 py-2.5 text-slate-800 min-w-[280px]">
                      <div className="whitespace-pre-line text-xs leading-relaxed text-slate-700">
                        {tx.description}
                      </div>
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
            <h2 className="text-sm font-bold text-slate-900 mb-4">Payables Aging Breakdown</h2>
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
                  Open Bills ({statement.openItems.length})
                </h3>
                <p className="text-xs text-slate-500">Unsettled purchase bills requiring payment</p>
              </div>
              {statement.aging.residual !== 0 && (
                <span className="text-xs font-semibold text-blue-700">
                  Net residual payable / advance: {formatMoney(String(statement.aging.residual), currency)}
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Document #</th>
                    <th className="px-4 py-3">Receipt Date</th>
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
                  No open bills. All purchase receipts are fully settled.
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
            Official Supplier Subledger Statement
          </h2>
          <p className="text-xs text-slate-500 max-w-lg mx-auto">
            Generate and print an official double-entry account statement for {supplier.name} with complete opening balance, period debits, credits, running balance, aging analysis, and signature blocks.
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

