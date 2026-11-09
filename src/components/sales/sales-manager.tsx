"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  BadgeDollarSign,
  Ban,
  Banknote,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  FileClock,
  FilePlus2,
  Loader2,
  PackageCheck,
  Printer,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { DocumentReversalDialog } from "@/components/operations/document-reversal-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

function statusTone(status: string) {
  if (["POSTED", "PAID"].includes(status)) return "green" as const;
  if (["APPROVED", "SUBMITTED", "PARTIAL"].includes(status)) return "amber" as const;
  if (["REVERSED", "CANCELLED", "REJECTED", "OVERDUE"].includes(status)) return "red" as const;
  return "slate" as const;
}

type Props = {
  currency: string;
  userId: string;
  permissions: string[];
  initialStatus?: string;
  initialPaymentStatus?: string;
};

export function SalesManager({
  currency,
  userId,
  permissions,
  initialStatus = "",
  initialPaymentStatus = "",
}: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState("");
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [reversalTarget, setReversalTarget] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [creditOverrideTarget, setCreditOverrideTarget] = useState<any>(null);
  const [creditOverrideReason, setCreditOverrideReason] = useState("");
  const [segregationAlert, setSegregationAlert] = useState<{ invoice: any; message: string } | null>(null);
  const [switchingMode, setSwitchingMode] = useState(false);
  const [activeTab, setActiveTab] = useState<"ALL" | "AWAITING" | "POSTED" | "DRAFT" | "UNPAID">("ALL");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [paymentStatus, setPaymentStatus] = useState(initialPaymentStatus);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const can = (key: string) => permissions.includes(key);

  function isSegregationError(message: string): boolean {
    const m = (message || "").toLowerCase();
    return (
      m.includes("segregation of duties") ||
      m.includes("multi-user mode") ||
      m.includes("separate authorized officer") ||
      m.includes("maker_checker") ||
      m.includes("cannot approve their own") ||
      m.includes("cannot post their own")
    );
  }

  const load = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (debouncedSearch.trim()) query.set("search", debouncedSearch.trim());
    if (status) query.set("status", status);
    if (paymentStatus) query.set("paymentStatus", paymentStatus);
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    const response = await fetch(`/api/sales/invoices?${query}`, { cache: "no-store" });
    const body = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) return toast.error(body?.error?.message || "Sales register could not be loaded.");
    setRows(body.data || []);
    setSummary(body.summary || null);
    setPagination(body.pagination || { page, pageSize, total: 0 });
  }, [debouncedSearch, from, page, pageSize, paymentStatus, status, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, from, pageSize, paymentStatus, status, to, activeTab]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleTabChange(tab: "ALL" | "AWAITING" | "POSTED" | "DRAFT" | "UNPAID") {
    setActiveTab(tab);
    if (tab === "ALL") {
      setStatus("");
      setPaymentStatus("");
    } else if (tab === "AWAITING") {
      setStatus("SUBMITTED");
      setPaymentStatus("");
    } else if (tab === "POSTED") {
      setStatus("POSTED");
      setPaymentStatus("");
    } else if (tab === "DRAFT") {
      setStatus("DRAFT");
      setPaymentStatus("");
    } else if (tab === "UNPAID") {
      setStatus("POSTED");
      setPaymentStatus("UNPAID");
    }
  }

  async function resolveSegregationWithSingleUser(invoice: any) {
    setSwitchingMode(true);
    try {
      const res = await fetch("/api/settings/operating-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "SINGLE_USER",
          reason: "Switched to Single-User Mode to allow sole owner direct invoice approval and posting",
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message || "Failed to switch to Single-User Mode.");
      setSegregationAlert(null);
      toast.success("⚡ Single-User Mode activated! Posting sales invoice now...");
      await directPost(invoice);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to switch operating mode.");
    } finally {
      setSwitchingMode(false);
    }
  }

  async function directPost(row: any) {
    setActingId(row.id);
    try {
      if (row.status === "DRAFT") {
        const subRes = await fetch(`/api/sales/invoices/${row.id}/submit`, { method: "POST" });
        if (!subRes.ok) {
          const body = await subRes.json().catch(() => null);
          const msg = body?.error?.message || "Failed to submit sales invoice.";
          if (isSegregationError(msg)) {
            setSegregationAlert({ invoice: row, message: msg });
            return;
          }
          return toast.error(msg);
        }
        const appRes = await fetch(`/api/sales/invoices/${row.id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Direct Post authorization" }),
        });
        if (!appRes.ok) {
          const body = await appRes.json().catch(() => null);
          if (body?.error?.code === "CREDIT_LIMIT_EXCEEDED") {
            setCreditOverrideTarget({ row, details: body.error.details, andPost: true });
            setCreditOverrideReason(`Authorized credit extension for invoice ${row.invoiceNumber}`);
            return;
          }
          const msg = body?.error?.message || "Failed to approve sales invoice.";
          if (isSegregationError(msg)) {
            setSegregationAlert({ invoice: row, message: msg });
            return;
          }
          return toast.error(msg);
        }
      } else if (row.status === "SUBMITTED") {
        const appRes = await fetch(`/api/sales/invoices/${row.id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Direct Post authorization" }),
        });
        if (!appRes.ok) {
          const body = await appRes.json().catch(() => null);
          if (body?.error?.code === "CREDIT_LIMIT_EXCEEDED") {
            setCreditOverrideTarget({ row, details: body.error.details, andPost: true });
            setCreditOverrideReason(`Authorized credit extension for invoice ${row.invoiceNumber}`);
            return;
          }
          const msg = body?.error?.message || "Failed to approve sales invoice.";
          if (isSegregationError(msg)) {
            setSegregationAlert({ invoice: row, message: msg });
            return;
          }
          return toast.error(msg);
        }
      }

      const postRes = await fetch(`/api/sales/invoices/${row.id}/post`, { method: "POST" });
      const body = await postRes.json().catch(() => null);
      if (!postRes.ok) {
        const msg = body?.error?.message || "Failed to post sales invoice.";
        if (isSegregationError(msg)) {
          setSegregationAlert({ invoice: row, message: msg });
          return;
        }
        return toast.error(msg);
      }

      toast.success(`${row.invoiceNumber} posted to stock & GL atomically!`, {
        action: {
          label: "Print Invoice",
          onClick: () => window.open(`/sales/${row.id}/print`, "_blank"),
        },
        duration: 8000,
      });
      void load();
    } catch {
      toast.error("Network error posting sales invoice.");
    } finally {
      setActingId("");
    }
  }

  async function act(row: any, action: string, overrideReason?: string) {
    if (
      action === "post" &&
      !window.confirm(
        `Post ${row.invoiceNumber}? Stock, device custody, COGS, receivable, revenue, and tax will be committed atomically.`
      )
    ) {
      return;
    }
    setActingId(row.id);
    const response = await fetch(`/api/sales/invoices/${row.id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(overrideReason ? { reason: overrideReason } : {}),
    });
    const body = await response.json().catch(() => null);
    setActingId("");
    if (!response.ok) {
      if (body?.error?.code === "CREDIT_LIMIT_EXCEEDED") {
        setCreditOverrideTarget({ row, details: body.error.details, andPost: false });
        setCreditOverrideReason(`Authorized credit extension for invoice ${row.invoiceNumber}`);
        return;
      }
      const msg = body?.error?.message || `${titleCase(action)} failed.`;
      if (isSegregationError(msg)) {
        setSegregationAlert({ invoice: row, message: msg });
        return;
      }
      return toast.error(msg);
    }
    toast.success(
      `${row.invoiceNumber} ${action === "submit" ? "submitted" : action === "approve" ? "approved" : "posted"}.`
    );
    void load();
  }

  async function cancelDraft() {
    if (!cancelTarget || cancelReason.trim().length < 10) return;
    setActingId(cancelTarget.id);
    const response = await fetch(`/api/sales/invoices/${cancelTarget.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: cancelReason }),
    });
    const body = await response.json().catch(() => null);
    setActingId("");
    if (!response.ok) return toast.error(body?.error?.message || "Draft cancellation failed.");
    toast.success(`${cancelTarget.invoiceNumber} cancelled without stock effect.`);
    setCancelTarget(null);
    setCancelReason("");
    void load();
  }

  const metrics = useMemo(() => {
    const count = (states: string[]) =>
      states.reduce((sum, item) => sum + Number(summary?.statuses?.[item]?.count || 0), 0);
    return {
      total: pagination.total,
      draft: count(["DRAFT"]),
      pending: count(["SUBMITTED", "APPROVED"]),
      posted: count(["POSTED"]),
    };
  }, [pagination.total, summary]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600">Order-to-Cash</span>
          <h1 className="mt-1 text-2xl font-black text-slate-950 sm:text-3xl">Sales Invoices</h1>
          <p className="mt-1 text-xs text-slate-500 max-w-2xl">
            Atomic device inventory custody, server-calculated tax, actual-cost COGS, receivables ledger, and posted payment allocation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {can("SALES_INVOICE_CREATE") && (
            <Link
              href="/pos"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
            >
              <ShoppingCart className="h-4 w-4" />
              New Sales Invoice (POS)
            </Link>
          )}
        </div>
      </div>

      {/* Executive KPI Summary Cards */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Invoices</span>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-700">
              <ShoppingCart className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tabular-nums text-slate-900">{metrics.total}</p>
          <span className="mt-0.5 block text-[10px] text-slate-400">Total registered</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Drafts</span>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-slate-700">
              <FilePlus2 className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tabular-nums text-slate-800">{metrics.draft}</p>
          <span className="mt-0.5 block text-[10px] text-slate-400">Uncommitted drafts</span>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Awaiting Action</span>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-100 text-amber-800">
              <FileClock className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tabular-nums text-amber-950">{metrics.pending}</p>
          <span className="mt-0.5 block text-[10px] text-amber-700 font-medium">Submitted / Approved</span>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Posted</span>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-100 text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tabular-nums text-emerald-950">{metrics.posted}</p>
          <span className="mt-0.5 block text-[10px] text-emerald-700 font-medium">Committed to stock + GL</span>
        </div>

        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-800">Filtered Sales</span>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-100 text-indigo-800">
              <BadgeDollarSign className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-2 text-xl font-black tabular-nums text-indigo-950 truncate" title={formatMoney(summary?.grandTotal || 0, currency)}>
            {formatMoney(summary?.grandTotal || 0, currency)}
          </p>
          <span className="mt-0.5 block text-[10px] text-indigo-700 font-medium">Gross revenue</span>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800">Outstanding AR</span>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-rose-100 text-rose-800">
              <WalletCards className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-2 text-xl font-black tabular-nums text-rose-950 truncate" title={formatMoney(summary?.outstandingTotal || 0, currency)}>
            {formatMoney(summary?.outstandingTotal || 0, currency)}
          </p>
          <span className="mt-0.5 block text-[10px] text-rose-700 font-medium">Receivable balance</span>
        </div>
      </section>

      {/* Main Register Section */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50/50 px-4 pt-2 overflow-x-auto gap-1">
          {[
            { id: "ALL", label: "All Invoices", count: metrics.total },
            { id: "AWAITING", label: "Awaiting Action", count: metrics.pending },
            { id: "POSTED", label: "Posted to GL", count: metrics.posted },
            { id: "DRAFT", label: "Drafts", count: metrics.draft },
            { id: "UNPAID", label: "Unpaid / Overdue" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id as any)}
              className={`flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-bold transition whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-700 bg-white rounded-t-lg shadow-2xs"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    activeTab === tab.id ? "bg-blue-100 text-blue-800" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3 bg-white">
          <div className="relative flex-1 min-w-[260px] sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice #, customer name, code, phone, SKU, or IMEI…"
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 pl-9 pr-8 text-xs outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-2 rounded p-0.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="From date"
              title="From date"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
            />
            <input
              aria-label="To date"
              title="To date"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
            />

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700"
            >
              <option value="">All Document Statuses</option>
              {["DRAFT", "SUBMITTED", "APPROVED", "POSTED", "REJECTED", "CANCELLED", "REVERSED"].map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </select>

            <select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700"
            >
              <option value="">All Payment Statuses</option>
              {["UNPAID", "PARTIAL", "PAID", "OVERDUE"].map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </select>

            <button
              onClick={() => void load()}
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
              title="Refresh register"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-blue-600" : ""}`} />
            </button>
          </div>
        </div>

        {/* Invoice Grid Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Invoice # / Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Salesperson</th>
                <th className="px-4 py-3">Document Status</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3 text-center">Items / Units</th>
                <th className="px-4 py-3 text-right">Total / Due</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-20 text-center text-xs text-slate-400">
                    <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-blue-600" />
                    Loading sales invoices…
                  </td>
                </tr>
              ) : !rows.length ? (
                <tr>
                  <td colSpan={9} className="py-20 text-center text-xs text-slate-400">
                    <Receipt className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    <p className="font-bold text-slate-600">No matching sales invoices found</p>
                    <p className="mt-1 text-slate-400">Try adjusting your filters or start a new sale from the POS.</p>
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const lineCount = row._count?.lines || row.lines?.length || 0;
                  const unitCount = row.lines
                    ? row.lines.reduce((sum: number, line: any) => sum + Number(line.quantity), 0)
                    : 0;
                  const hasDue = Number(row.outstandingAmount) > 0;

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/sales/${row.id}`}
                          className="font-bold text-blue-700 hover:underline flex items-center gap-1.5"
                        >
                          {row.invoiceNumber}
                          <Eye className="h-3 w-3 text-slate-400" />
                        </Link>
                        <span className="block text-[10px] text-slate-400 mt-0.5">
                          {formatDate(row.invoiceDate)}
                          {row.journalEntry ? (
                            <span className="text-blue-600 ml-1">· {row.journalEntry.voucherNumber}</span>
                          ) : null}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900">{row.customer.name}</div>
                        <span className="block text-[10px] text-slate-400">
                          {row.customer.code}
                          {row.customer.phone ? ` · ${row.customer.phone}` : ""}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-800">{row.warehouse.code}</div>
                        <span className="block text-[10px] text-slate-400">{row.branch.name}</span>
                      </td>

                      <td className="px-4 py-3.5 text-slate-600">
                        {row.salesperson?.fullName || "—"}
                      </td>

                      <td className="px-4 py-3.5">
                        <Badge tone={statusTone(row.status)}>{titleCase(row.status)}</Badge>
                      </td>

                      <td className="px-4 py-3.5">
                        <Badge tone={statusTone(row.paymentStatus)}>{titleCase(row.paymentStatus)}</Badge>
                      </td>

                      <td className="px-4 py-3.5 text-center font-bold text-slate-800">
                        {lineCount}
                        <span className="block text-[10px] font-normal text-slate-400">
                          {unitCount} {unitCount === 1 ? "unit" : "units"}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                        <b className="text-sm text-slate-900">{formatMoney(row.grandTotal, currency)}</b>
                        <span
                          className={`block text-[10px] font-semibold ${
                            hasDue && row.status === "POSTED" ? "text-rose-600" : "text-slate-400"
                          }`}
                        >
                          Due {formatMoney(row.outstandingAmount, currency)}
                        </span>
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="flex justify-end items-center gap-1.5">
                          {/* Print Actions */}
                          <Link
                            href={`/sales/${row.id}/print`}
                            target="_blank"
                            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
                            title="Print Official A4 Invoice"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Link>

                          {/* View Detail */}
                          <Link
                            href={`/sales/${row.id}`}
                            className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                          >
                            View
                          </Link>

                          {/* Edit Action (for unposted documents) */}
                          {(row.status === "DRAFT" || row.status === "SUBMITTED" || row.status === "APPROVED") &&
                            can("SALES_INVOICE_CREATE") && (
                              <Link
                                href={`/sales/${row.id}/edit`}
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-blue-200 bg-white px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition"
                                title="Edit sales invoice draft"
                              >
                                <Edit3 className="h-3 w-3" />
                                Edit
                              </Link>
                            )}

                          {/* Fast-Track Direct Post for Cashier / Owner */}
                          {(row.status === "DRAFT" || row.status === "SUBMITTED" || row.status === "APPROVED") &&
                            can("SALES_INVOICE_POST") && (
                              <Button
                                size="sm"
                                disabled={actingId === row.id}
                                onClick={() => void directPost(row)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1 text-[11px] px-2.5 h-8 shadow-xs"
                                title="⚡ Fast-Track Post: submit, approve & post atomically to stock & GL"
                              >
                                {actingId === row.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Zap className="h-3 w-3" />
                                )}
                                Post Now
                              </Button>
                            )}

                          {/* Workflow: Submit */}
                          {row.status === "DRAFT" && can("SALES_INVOICE_CREATE") && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={actingId === row.id}
                              onClick={() => void act(row, "submit")}
                              className="h-8 text-xs font-semibold"
                            >
                              Submit
                            </Button>
                          )}

                          {/* Workflow: Approve */}
                          {row.status === "SUBMITTED" && can("SALES_INVOICE_APPROVE") && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={actingId === row.id}
                              onClick={() => void act(row, "approve")}
                              className="h-8 text-xs font-semibold text-blue-700 border-blue-200 hover:bg-blue-50 gap-1"
                            >
                              <BadgeCheck className="h-3 w-3 text-blue-600" />
                              Approve
                            </Button>
                          )}

                          {/* Workflow: Post */}
                          {row.status === "APPROVED" && can("SALES_INVOICE_POST") && (
                            <Button
                              size="sm"
                              disabled={actingId === row.id}
                              onClick={() => void act(row, "post")}
                              className="h-8 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white gap-1"
                            >
                              <PackageCheck className="h-3 w-3" />
                              Post stock + GL
                            </Button>
                          )}

                          {/* Payment collection for posted invoice */}
                          {row.status === "POSTED" && hasDue && can("PAYMENT_CREATE") && (
                            <Link
                              href={`/finance/payments?invoiceId=${row.id}&amount=${row.outstandingAmount}`}
                              className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition"
                            >
                              <Banknote className="h-3 w-3 text-emerald-700" />
                              Receive Payment
                            </Link>
                          )}

                          {/* Workflow: Cancel draft */}
                          {row.status === "DRAFT" && can("SALES_INVOICE_CREATE") && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={actingId === row.id}
                              onClick={() => {
                                setCancelTarget(row);
                                setCancelReason("");
                              }}
                              className="h-8 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                              title="Cancel draft"
                            >
                              <Ban className="h-3 w-3" />
                            </Button>
                          )}

                          {/* Workflow: Reverse posted */}
                          {row.status === "POSTED" &&
                            !row.reversalOfId &&
                            can("SALES_INVOICE_REVERSE") && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={actingId === row.id}
                                onClick={() => setReversalTarget(row)}
                                className="h-8 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                title="Reverse posted invoice"
                              >
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing {pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0}–
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total} records
          </span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1 || loading}
                onClick={() => setPage((v) => Math.max(1, v - 1))}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </button>
              <span className="px-2 font-bold text-slate-700">
                {pagination.page} / {Math.max(1, Math.ceil(pagination.total / pagination.pageSize))}
              </span>
              <button
                disabled={page * pageSize >= pagination.total || loading}
                onClick={() => setPage((v) => v + 1)}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Audit Banner */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-xs leading-relaxed text-blue-900">
        <b>Serialized sales:</b> either IMEI resolves to the same physical unit. Drafts do not reserve or issue stock. Posting revalidates every unit and balance, then commits stock, custody, actual-cost COGS, revenue, tax, receivable, and audit exactly once.
      </div>

      {/* Document Reversal Dialog */}
      {reversalTarget && (
        <DocumentReversalDialog
          key={reversalTarget.id}
          open
          documentNumber={reversalTarget.invoiceNumber}
          documentLabel="sales invoice"
          endpoint={`/api/sales/invoices/${reversalTarget.id}/reverse`}
          consequence="Posting is blocked if the invoice has posted payment allocations or returns, or if a sold physical unit has moved through another workflow."
          onClose={() => setReversalTarget(null)}
          onComplete={async () => {
            setReversalTarget(null);
            await load();
          }}
        />
      )}

      {/* Cancel Draft Modal */}
      {cancelTarget && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-xs"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !actingId) setCancelTarget(null);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl animate-scale-up">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-950">Cancel Sales Draft</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {cancelTarget.invoiceNumber} · Cancels draft without stock or GL effects.
                </p>
              </div>
              <button
                disabled={Boolean(actingId)}
                onClick={() => setCancelTarget(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="mt-5 block">
              <span className="text-xs font-bold text-slate-700">Cancellation reason *</span>
              <textarea
                autoFocus
                rows={4}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Enter specific business reason (minimum 10 characters)…"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button disabled={Boolean(actingId)} variant="outline" onClick={() => setCancelTarget(null)}>
                Keep draft
              </Button>
              <Button
                disabled={Boolean(actingId) || cancelReason.trim().length < 10}
                onClick={() => void cancelDraft()}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
              >
                {actingId ? "Cancelling…" : "Confirm cancellation"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Limit Authorization Modal */}
      {creditOverrideTarget && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-xs"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !actingId) setCreditOverrideTarget(null);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl animate-scale-up">
            <div className="flex items-start justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  Credit Limit Authorization Required
                </div>
                <h2 className="mt-2 text-lg font-black text-slate-950">Approve with Credit Override</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {creditOverrideTarget.row.invoiceNumber} · Customer:{" "}
                  <b className="text-slate-800">{creditOverrideTarget.row.customer.name}</b> (
                  {creditOverrideTarget.row.customer.code})
                </p>
              </div>
              <button
                disabled={Boolean(actingId)}
                onClick={() => setCreditOverrideTarget(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <div>
                <span className="text-slate-500">Configured Credit Limit:</span>
                <div className="font-bold text-slate-900">
                  {formatMoney(
                    creditOverrideTarget.details?.creditLimit || creditOverrideTarget.row.customer.creditLimit || 0,
                    currency
                  )}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Current AR Outstanding:</span>
                <div className="font-bold text-slate-900">
                  {formatMoney(creditOverrideTarget.details?.outstanding || 0, currency)}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Invoice Grand Total:</span>
                <div className="font-bold text-blue-700">
                  {formatMoney(
                    creditOverrideTarget.details?.invoiceTotal || creditOverrideTarget.row.grandTotal,
                    currency
                  )}
                </div>
              </div>
              <div>
                <span className="font-semibold text-amber-800">Exceeded Amount:</span>
                <div className="font-black text-rose-600">
                  {formatMoney(creditOverrideTarget.details?.exceededAmount || 0, currency)}
                </div>
              </div>
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-bold text-slate-700">Managerial Override Justification / Reason *</span>
              <textarea
                autoFocus
                rows={3}
                value={creditOverrideReason}
                onChange={(e) => setCreditOverrideReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="e.g. Director authorized 15-day extension; PDC cheque received; VIP dealer account."
              />
            </label>
            <p className="mt-1.5 text-[11px] text-slate-400">
              This justification will be permanently stamped in the company financial audit trail alongside your user ID.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <Button disabled={Boolean(actingId)} variant="outline" onClick={() => setCreditOverrideTarget(null)}>
                Cancel
              </Button>
              <Button
                disabled={Boolean(actingId) || creditOverrideReason.trim().length < 5}
                onClick={async () => {
                  const target = creditOverrideTarget;
                  const reason = creditOverrideReason;
                  const andPost = target.andPost;
                  setCreditOverrideTarget(null);
                  if (andPost) {
                    await directPost(target.row);
                  } else {
                    await act(target.row, "approve", reason);
                  }
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold gap-1.5"
              >
                <BadgeCheck className="h-4 w-4" />
                {actingId ? "Authorizing…" : "Authorize & Approve Credit"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Segregation of Duties Quick Resolution Modal */}
      {segregationAlert && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget && !switchingMode) setSegregationAlert(null);
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 animate-scale-up">
            <div className="flex items-start gap-3.5 border-b border-amber-100 bg-amber-50/80 px-6 py-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-950">Segregation of Duties Enforcement</h3>
                <p className="mt-0.5 text-xs text-amber-900 font-medium">Multi-User Maker-Checker Restriction</p>
              </div>
              <button
                type="button"
                disabled={switchingMode}
                onClick={() => setSegregationAlert(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3.5 p-6 text-xs text-slate-600 leading-relaxed">
              <p>
                ERP governance policy requires that in <strong>Multi-User Mode</strong>, a separate authorized officer must approve or post sales invoice <strong>{segregationAlert.invoice.invoiceNumber}</strong>.
              </p>

              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 text-slate-700">
                <span className="font-bold text-amber-900 block mb-1">⚡ Operating as Sole Business Owner or Store Manager?</span>
                You can switch to <strong>Single-User Mode</strong> with 1 click. Single-User Mode enables direct approvals and immediate posting across all receipts, payments, and sales invoices without requiring a second officer.
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <Button
                type="button"
                variant="outline"
                disabled={switchingMode}
                onClick={() => setSegregationAlert(null)}
              >
                Keep Multi-User Mode
              </Button>
              <Button
                type="button"
                disabled={switchingMode}
                onClick={() => void resolveSegregationWithSingleUser(segregationAlert.invoice)}
                className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5 shadow-sm font-bold"
              >
                {switchingMode ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Activating Single-User Mode...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Switch to Single-User Mode &amp; Post Now
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
