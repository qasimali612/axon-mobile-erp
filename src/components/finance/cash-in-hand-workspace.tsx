"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Calculator,
  CheckCircle2,
  Download,
  Filter,
  Landmark,
  Printer,
  RefreshCw,
  Scale,
  Search,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

type Account = { id: string; code: string; name: string; accountType: string };
type Branch = { id: string; code: string; name: string };

type Movement = {
  id: string;
  entryId: string;
  voucherNumber: string;
  voucherType: string;
  postingDate: string | Date;
  postedAt: string | Date | null;
  narration: string;
  description: string | null;
  sourceModule: string;
  sourceDocumentNumber: string | null;
  referenceDocument: string | null;
  branch: { id: string; code: string; name: string };
  preparedBy: string;
  accountName: string;
  party: string | null;
  cashIn: string | number;
  cashOut: string | number;
  runningBalance: string | number;
};

type BreakdownItem = {
  label: string;
  count: number;
  total: string | number;
};

type CashInHandData = {
  accounts: Account[];
  periodSummary: {
    openingBalance: string | number;
    totalInflows: string | number;
    totalOutflows: string | number;
    netMovement: string | number;
    closingBalance: string | number;
  };
  sourceBreakdown: {
    inflows: BreakdownItem[];
    outflows: BreakdownItem[];
  };
  movements: Movement[];
};

type Props = {
  initialData: CashInHandData;
  branches: Branch[];
  currency: string;
  canExport: boolean;
  selectedBranchId?: string;
  selectedAccountId?: string;
  fromDate: string;
  toDate: string;
};

const DENOMINATIONS = [5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1];

export function CashInHandWorkspace({
  initialData,
  branches,
  currency,
  canExport,
  selectedBranchId,
  selectedAccountId,
  fromDate,
  toDate,
}: Props) {
  const [filterType, setFilterType] = useState<"ALL" | "IN" | "OUT">("ALL");
  const [search, setSearch] = useState("");
  const [denomOpen, setDenomOpen] = useState(false);
  const [denomCounts, setDenomCounts] = useState<Record<number, number>>(
    Object.fromEntries(DENOMINATIONS.map((d) => [d, 0]))
  );

  const summary = initialData.periodSummary;
  const closingBook = Number(summary.closingBalance);

  // Calculate counted physical cash
  const physicalTotal = useMemo(() => {
    return DENOMINATIONS.reduce(
      (sum, denom) => sum + denom * (denomCounts[denom] || 0),
      0
    );
  }, [denomCounts]);

  const variance = physicalTotal - closingBook;
  const isBalanced = Math.abs(variance) < 0.01;

  // Filter movements
  const filteredMovements = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialData.movements.filter((m) => {
      if (filterType === "IN" && Number(m.cashIn) <= 0) return false;
      if (filterType === "OUT" && Number(m.cashOut) <= 0) return false;
      if (!q) return true;
      return (
        m.voucherNumber.toLowerCase().includes(q) ||
        m.narration.toLowerCase().includes(q) ||
        (m.party && m.party.toLowerCase().includes(q)) ||
        (m.sourceDocumentNumber && m.sourceDocumentNumber.toLowerCase().includes(q)) ||
        m.branch.code.toLowerCase().includes(q)
      );
    });
  }, [initialData.movements, filterType, search]);

  const exportUrl = `/api/finance/reports/cash-in-hand?format=csv&from=${fromDate}&to=${toDate}${
    selectedBranchId ? `&branch=${selectedBranchId}` : ""
  }${selectedAccountId ? `&account=${selectedAccountId}` : ""}`;

  const printUrl = useMemo(() => {
    const q = new URLSearchParams();
    if (fromDate) q.set("from", fromDate);
    if (toDate) q.set("to", toDate);
    if (selectedBranchId) q.set("branch", selectedBranchId);
    if (selectedAccountId) q.set("account", selectedAccountId);
    if (physicalTotal > 0) {
      q.set("physicalCount", physicalTotal.toString());
      for (const d of DENOMINATIONS) {
        if ((denomCounts[d] || 0) > 0) {
          q.set(`d_${d}`, String(denomCounts[d]));
        }
      }
    }
    return `/finance/reports/cash-in-hand/print?${q.toString()}`;
  }, [fromDate, toDate, selectedBranchId, selectedAccountId, physicalTotal, denomCounts]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      {/* Header */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="kicker">Treasury & Vault Accounting</span>
            <Badge tone="green">Posted General Ledger</Badge>
          </div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">
            Cash in Hand Report
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm text-slate-500">
            Real-time daily cash book, counter receipts, supplier payments, operating expenses, and physical cash drawer reconciliation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setDenomOpen((v) => !v)}
            className="gap-2"
          >
            <Calculator className="h-4 w-4 text-forest-700" />
            {denomOpen ? "Hide Denominations" : "Physical Drawer Count"}
          </Button>

          <Link
            href={printUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-800 shadow-sm hover:bg-slate-50 hover:text-blue-600"
          >
            <Printer className="h-4 w-4" />
            Print Daily Sheet
          </Link>

          {canExport && (
            <a
              href={exportUrl}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
            >
              <Download className="h-4 w-4" /> Export CSV
            </a>
          )}
        </div>
      </header>

      {/* Filter Bar */}
      <form
        method="get"
        className="surface grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          From Date
          <input
            type="date"
            name="from"
            defaultValue={fromDate}
            className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
          />
        </label>

        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          To Date
          <input
            type="date"
            name="to"
            defaultValue={toDate}
            className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
          />
        </label>

        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Branch
          <select
            name="branch"
            defaultValue={selectedBranchId || ""}
            className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
          >
            <option value="">All Authorized Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} · {b.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Cash Ledger Account
          <select
            name="account"
            defaultValue={selectedAccountId || ""}
            className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
          >
            <option value="">All Cash Accounts</option>
            {initialData.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end">
          <Button type="submit" className="w-full">
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Run Report
          </Button>
        </div>
      </form>

      {/* 5 Core Financial Summary Cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-700">
              <Wallet className="h-4 w-4" />
            </span>
            <span className="text-[10px] font-semibold text-slate-400">Start of Period</span>
          </div>
          <p className="mt-3 text-xl font-bold tracking-tight text-slate-900">
            {formatMoney(summary.openingBalance.toString(), currency)}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-700">Opening Cash</p>
          <p className="mt-0.5 text-[10px] text-slate-400">Before {formatDate(fromDate)}</p>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
              <ArrowDownLeft className="h-4 w-4" />
            </span>
            <Badge tone="green">Inflows</Badge>
          </div>
          <p className="mt-3 text-xl font-bold tracking-tight text-emerald-700">
            +{formatMoney(summary.totalInflows.toString(), currency)}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-700">Total Cash Received</p>
          <p className="mt-0.5 text-[10px] text-slate-400">Sales, POS, receipts & bank draws</p>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-rose-50 text-rose-700">
              <ArrowUpRight className="h-4 w-4" />
            </span>
            <Badge tone="red">Outflows</Badge>
          </div>
          <p className="mt-3 text-xl font-bold tracking-tight text-rose-700">
            -{formatMoney(summary.totalOutflows.toString(), currency)}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-700">Total Cash Disbursed</p>
          <p className="mt-0.5 text-[10px] text-slate-400">Suppliers, expenses & deposits</p>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span
              className={`grid h-8 w-8 place-items-center rounded-lg ${
                Number(summary.netMovement) >= 0
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              <Scale className="h-4 w-4" />
            </span>
            <span className="text-[10px] font-semibold text-slate-400">Net Flow</span>
          </div>
          <p
            className={`mt-3 text-xl font-bold tracking-tight ${
              Number(summary.netMovement) >= 0 ? "text-emerald-700" : "text-amber-700"
            }`}
          >
            {Number(summary.netMovement) >= 0 ? "+" : ""}
            {formatMoney(summary.netMovement.toString(), currency)}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-700">Net Movement</p>
          <p className="mt-0.5 text-[10px] text-slate-400">Inflows less Outflows</p>
        </div>

        <div className="surface p-4 border-2 border-forest-600/30 bg-forest-50/20">
          <div className="flex items-center justify-between">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-forest-700 text-white">
              <Banknote className="h-4 w-4" />
            </span>
            <Badge tone="green">Authoritative</Badge>
          </div>
          <p className="mt-3 text-xl font-bold tracking-tight text-forest-900">
            {formatMoney(summary.closingBalance.toString(), currency)}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-900">Closing Book Balance</p>
          <p className="mt-0.5 text-[10px] text-slate-500">As of {formatDate(toDate)}</p>
        </div>
      </section>

      {/* Denomination Counter & Physical Reconciliation Modal/Section */}
      {denomOpen && (
        <section className="surface overflow-hidden border border-blue-200 bg-blue-50/20">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-blue-50/60 px-6 py-4">
            <div className="flex items-center gap-2.5">
              <Calculator className="h-5 w-5 text-blue-700" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Physical Cash Drawer Denomination Count
                </h3>
                <p className="text-[11px] text-slate-500">
                  Count physical bills and coins to verify against the General Ledger closing balance.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div
                className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold ${
                  isBalanced
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : variance > 0
                    ? "border-blue-300 bg-blue-50 text-blue-800"
                    : "border-rose-300 bg-rose-50 text-rose-800"
                }`}
              >
                {isBalanced ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <TriangleAlert className="h-4 w-4 text-rose-600" />
                )}
                <span>
                  {isBalanced
                    ? "Drawer Balanced"
                    : variance > 0
                    ? `Surplus / Overage: +${formatMoney(variance.toFixed(2), currency)}`
                    : `Shortage / Deficit: ${formatMoney(variance.toFixed(2), currency)}`}
                </span>
              </div>

              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setDenomCounts(Object.fromEntries(DENOMINATIONS.map((d) => [d, 0])))
                }
              >
                Reset Counts
              </Button>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 lg:grid-cols-10">
              {DENOMINATIONS.map((denom) => (
                <div
                  key={denom}
                  className="rounded-xl border border-slate-200 bg-white p-2.5 text-center shadow-sm"
                >
                  <span className="block text-xs font-bold text-slate-700">
                    {denom}
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={denomCounts[denom] || ""}
                    placeholder="0"
                    onChange={(e) => {
                      const count = Math.max(0, parseInt(e.target.value, 10) || 0);
                      setDenomCounts((prev) => ({ ...prev, [denom]: count }));
                    }}
                    className="mt-1 h-8 w-full rounded border border-slate-200 text-center font-mono text-xs font-bold text-slate-800 focus:border-blue-500 focus:outline-none"
                  />
                  <span className="mt-1 block text-[10px] font-semibold tabular-nums text-slate-400">
                    {formatMoney(
                      ((denomCounts[denom] || 0) * denom).toString(),
                      currency
                    )}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between border-t border-slate-200 pt-3 text-xs">
              <span className="text-slate-500">
                Counted Total:{" "}
                <b className="text-slate-900">{formatMoney(physicalTotal.toFixed(2), currency)}</b>
              </span>
              <span className="text-slate-500">
                Book Balance:{" "}
                <b className="text-slate-900">{formatMoney(closingBook.toFixed(2), currency)}</b>
              </span>
              <span
                className={`font-bold ${
                  isBalanced
                    ? "text-emerald-700"
                    : variance > 0
                    ? "text-blue-700"
                    : "text-rose-700"
                }`}
              >
                Net Difference: {formatMoney(variance.toFixed(2), currency)}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Source Breakdown Cards: Inflows & Outflows */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Inflows breakdown */}
        <section className="surface overflow-hidden">
          <div className="border-b border-slate-100 bg-emerald-50/40 px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowDownLeft className="h-4 w-4 text-emerald-700" />
              <h3 className="text-xs font-bold text-slate-900">Cash Receipts by Source</h3>
            </div>
            <span className="text-xs font-bold text-emerald-700">
              +{formatMoney(summary.totalInflows.toString(), currency)}
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {initialData.sourceBreakdown.inflows.length ? (
              initialData.sourceBreakdown.inflows.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between px-5 py-2.5 text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-800">{item.label}</span>
                    <span className="ml-2 text-[10px] text-slate-400">
                      ({item.count} transaction{item.count > 1 ? "s" : ""})
                    </span>
                  </div>
                  <span className="font-bold text-emerald-700 tabular-nums">
                    +{formatMoney(item.total.toString(), currency)}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-xs text-slate-400">
                No cash receipts in this period.
              </div>
            )}
          </div>
        </section>

        {/* Outflows breakdown */}
        <section className="surface overflow-hidden">
          <div className="border-b border-slate-100 bg-rose-50/40 px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-rose-700" />
              <h3 className="text-xs font-bold text-slate-900">Cash Disbursements by Source</h3>
            </div>
            <span className="text-xs font-bold text-rose-700">
              -{formatMoney(summary.totalOutflows.toString(), currency)}
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {initialData.sourceBreakdown.outflows.length ? (
              initialData.sourceBreakdown.outflows.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between px-5 py-2.5 text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-800">{item.label}</span>
                    <span className="ml-2 text-[10px] text-slate-400">
                      ({item.count} transaction{item.count > 1 ? "s" : ""})
                    </span>
                  </div>
                  <span className="font-bold text-rose-700 tabular-nums">
                    -{formatMoney(item.total.toString(), currency)}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-xs text-slate-400">
                No cash disbursements in this period.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Itemized Chronological Cash Transactions Table */}
      <section className="surface overflow-hidden">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">Itemized Cash Ledger</h2>
            <Badge tone="slate">{filteredMovements.length} entries</Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Flow Filter */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setFilterType("ALL")}
                className={`rounded-md px-2.5 py-1 transition ${
                  filterType === "ALL"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterType("IN")}
                className={`rounded-md px-2.5 py-1 transition ${
                  filterType === "IN"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Receipts (In)
              </button>
              <button
                type="button"
                onClick={() => setFilterType("OUT")}
                className={`rounded-md px-2.5 py-1 transition ${
                  filterType === "OUT"
                    ? "bg-rose-600 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Disbursements (Out)
              </button>
            </div>

            {/* Keyword Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search voucher, party, note…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-60 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-xs">
            <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-4 py-3">Voucher</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Source & Party</th>
                <th className="px-4 py-3">Narration / Note</th>
                <th className="px-4 py-3 text-right">Cash In (Dr)</th>
                <th className="px-4 py-3 text-right">Cash Out (Cr)</th>
                <th className="px-5 py-3 text-right">Running Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Opening Row */}
              <tr className="bg-slate-50/70 font-semibold text-slate-600">
                <td className="px-5 py-3 text-[11px]">{formatDate(fromDate)}</td>
                <td className="px-4 py-3">—</td>
                <td className="px-4 py-3">—</td>
                <td className="px-4 py-3">
                  <Badge tone="slate">Opening Balance</Badge>
                </td>
                <td className="px-4 py-3 text-[11px] text-slate-500">
                  Cash in hand brought forward before {formatDate(fromDate)}
                </td>
                <td className="px-4 py-3 text-right">—</td>
                <td className="px-4 py-3 text-right">—</td>
                <td className="px-5 py-3 text-right font-bold text-slate-900 tabular-nums">
                  {formatMoney(summary.openingBalance.toString(), currency)}
                </td>
              </tr>

              {filteredMovements.length ? (
                filteredMovements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3 text-[11px] text-slate-600">
                      {formatDate(m.postingDate)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/finance/journals/${m.entryId}`}
                        className="font-bold text-blue-700 hover:underline"
                      >
                        {m.voucherNumber}
                      </Link>
                      <span className="block text-[9px] uppercase text-slate-400">
                        {m.sourceModule || titleCase(m.voucherType)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <b className="text-slate-800">{m.branch.code}</b>
                      <span className="block text-[9px] text-slate-400 truncate max-w-[100px]">
                        {m.branch.name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {m.party ? (
                        <span className="font-semibold text-slate-800 block">{m.party}</span>
                      ) : null}
                      <span className="text-[10px] text-slate-400">{m.accountName}</span>
                    </td>
                    <td className="max-w-[280px] px-4 py-3">
                      <span className="block truncate text-slate-700" title={m.narration}>
                        {m.description || m.narration}
                      </span>
                      {m.sourceDocumentNumber && (
                        <span className="text-[9px] text-slate-400">
                          Doc: {m.sourceDocumentNumber}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700 tabular-nums">
                      {Number(m.cashIn) > 0
                        ? `+${formatMoney(m.cashIn.toString(), currency)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-rose-700 tabular-nums">
                      {Number(m.cashOut) > 0
                        ? `-${formatMoney(m.cashOut.toString(), currency)}`
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-right font-bold tabular-nums text-slate-900">
                      {formatMoney(m.runningBalance.toString(), currency)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-xs text-slate-400">
                    No cash transactions found for the selected criteria.
                  </td>
                </tr>
              )}
            </tbody>
            {/* Closing Table Footer */}
            <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-bold text-slate-900">
              <tr>
                <td colSpan={5} className="px-5 py-3 text-right uppercase tracking-wider text-[10px] text-slate-500">
                  Total Period Movements & Closing Cash in Hand:
                </td>
                <td className="px-4 py-3 text-right text-emerald-700 tabular-nums">
                  +{formatMoney(summary.totalInflows.toString(), currency)}
                </td>
                <td className="px-4 py-3 text-right text-rose-700 tabular-nums">
                  -{formatMoney(summary.totalOutflows.toString(), currency)}
                </td>
                <td className="px-5 py-3 text-right text-sm text-forest-900 tabular-nums">
                  {formatMoney(summary.closingBalance.toString(), currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

