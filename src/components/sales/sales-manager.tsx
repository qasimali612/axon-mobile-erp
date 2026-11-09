"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BadgeCheck, Ban, Banknote, Edit3, PackageCheck, Printer, RefreshCw, RotateCcw, Search, ShoppingCart, X } from "lucide-react";
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

type Props = { currency: string; userId: string; permissions: string[]; initialStatus?: string; initialPaymentStatus?: string };

export function SalesManager({ currency, userId, permissions, initialStatus = "", initialPaymentStatus = "" }: Props) {
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
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [paymentStatus, setPaymentStatus] = useState(initialPaymentStatus);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const can = (key: string) => permissions.includes(key);

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

  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search), 300); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => { setPage(1); }, [debouncedSearch, from, pageSize, paymentStatus, status, to]);
  useEffect(() => { void load(); }, [load]);

  async function act(row: any, action: string, overrideReason?: string) {
    if (action === "post" && !window.confirm(`Post ${row.invoiceNumber}? Stock, device custody, COGS, receivable, revenue, and tax will be committed atomically.`)) return;
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
        setCreditOverrideTarget({ row, details: body.error.details });
        setCreditOverrideReason(`Authorized credit extension for invoice ${row.invoiceNumber}`);
        return;
      }
      return toast.error(body?.error?.message || `${titleCase(action)} failed.`);
    }
    toast.success(`${row.invoiceNumber} ${action === "submit" ? "submitted" : action === "approve" ? "approved" : "posted"}.`);
    void load();
  }

  async function cancelDraft() {
    if (!cancelTarget || cancelReason.trim().length < 10) return;
    setActingId(cancelTarget.id);
    const response = await fetch(`/api/sales/invoices/${cancelTarget.id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: cancelReason }) });
    const body = await response.json().catch(() => null);
    setActingId("");
    if (!response.ok) return toast.error(body?.error?.message || "Draft cancellation failed.");
    toast.success(`${cancelTarget.invoiceNumber} cancelled without stock effect.`);
    setCancelTarget(null);
    setCancelReason("");
    void load();
  }

  const metrics = useMemo(() => {
    const count = (states: string[]) => states.reduce((sum, item) => sum + Number(summary?.statuses?.[item]?.count || 0), 0);
    return { total: pagination.total, draft: count(["DRAFT"]), pending: count(["SUBMITTED", "APPROVED"]), posted: count(["POSTED"]) };
  }, [pagination.total, summary]);

  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><span className="kicker">Order-to-cash</span><h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-[30px]">Sales invoices</h1><p className="mt-1.5 max-w-3xl text-sm text-slate-500">Server-calculated mixed invoices, physical-device custody, quantity stock, actual-cost COGS, receivables, and posted payment allocation.</p></div>{can("SALES_INVOICE_CREATE") && <Link href="/pos" className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"><ShoppingCart className="h-4 w-4"/>New sales invoice</Link>}</div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{[
      ["Invoices", metrics.total, ""], ["Draft", metrics.draft, ""], ["Awaiting action", metrics.pending, ""], ["Posted", metrics.posted, ""],
      ["Filtered sales", formatMoney(summary?.grandTotal || 0, currency), "wide"], ["Outstanding", formatMoney(summary?.outstandingTotal || 0, currency), "wide"],
    ].map(([label, value, size]) => <div key={String(label)} className={`surface p-4 ${size === "wide" ? "sm:col-span-1" : ""}`}><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 truncate text-xl font-black text-slate-950" title={String(value)}>{value}</p></div>)}</div>

    <section className="surface overflow-hidden">
      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-slate-100 p-3"><div className="relative min-w-60 flex-1 sm:max-w-96"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Invoice, customer, phone, SKU, barcode or IMEI…" className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-blue-500"/></div><input aria-label="From date" title="From date" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs"/><input aria-label="To date" title="To date" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs"/><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">All document statuses</option>{["DRAFT", "SUBMITTED", "APPROVED", "POSTED", "REJECTED", "CANCELLED", "REVERSED"].map((item) => <option key={item}>{item}</option>)}</select><select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">All payment statuses</option>{["UNPAID", "PARTIAL", "PAID", "OVERDUE"].map((item) => <option key={item}>{item}</option>)}</select><button onClick={() => void load()} className="rounded-lg border border-slate-200 p-2 text-slate-500" title="Refresh"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}/></button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1240px] text-left"><thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Invoice</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Salesperson</th><th className="px-4 py-3">Document</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3 text-center">Lines / Qty</th><th className="px-4 py-3 text-right">Total / Due</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={9} className="py-20 text-center text-sm text-slate-400">Loading sales invoices…</td></tr> : !rows.length ? <tr><td colSpan={9} className="py-20 text-center text-sm text-slate-400">No matching sales invoices.</td></tr> : rows.map((row) => <tr key={row.id} className="text-xs hover:bg-blue-50/20"><td className="px-5 py-3.5"><Link href={`/sales/${row.id}`} className="text-sm font-bold text-blue-700 hover:underline">{row.invoiceNumber}</Link><span className="block text-[10px] text-slate-400">{formatDate(row.invoiceDate)}{row.journalEntry ? ` · ${row.journalEntry.voucherNumber}` : ""}</span></td><td className="px-4 py-3.5"><b>{row.customer.name}</b><span className="block text-[10px] text-slate-400">{row.customer.code}{row.customer.phone ? ` · ${row.customer.phone}` : ""}</span></td><td className="px-4 py-3.5"><b>{row.warehouse.code}</b><span className="block text-[10px] text-slate-400">{row.branch.name}</span></td><td className="px-4 py-3.5 text-slate-600">{row.salesperson?.fullName || "—"}</td><td className="px-4 py-3.5"><Badge tone={statusTone(row.status)}>{titleCase(row.status)}</Badge></td><td className="px-4 py-3.5"><Badge tone={statusTone(row.paymentStatus)}>{titleCase(row.paymentStatus)}</Badge></td><td className="px-4 py-3.5 text-center font-bold">{row._count.lines}<span className="block text-[10px] font-normal text-slate-400">{row.lines.reduce((sum: number, line: any) => sum + Number(line.quantity), 0)} units</span></td><td className="px-4 py-3.5 text-right"><b className="text-sm">{formatMoney(row.grandTotal, currency)}</b><span className="block text-[10px] text-slate-500">Due {formatMoney(row.outstandingAmount, currency)}</span></td><td className="px-5 py-3.5"><div className="flex justify-end gap-1">{(row.status === "DRAFT" || row.status === "SUBMITTED" || row.status === "APPROVED") && (row.preparedById === userId || can("SALES_INVOICE_APPROVE") || can("SALES_INVOICE_CREATE") || can("sales.manage")) && can("SALES_INVOICE_CREATE") && <Link href={`/sales/${row.id}/edit`} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 font-semibold text-slate-700 hover:bg-white"><Edit3 className="h-3.5 w-3.5"/>Edit</Link>}{row.status === "DRAFT" && (row.preparedById === userId || can("SALES_INVOICE_APPROVE") || can("sales.manage")) && can("SALES_INVOICE_CREATE") && <Button disabled={actingId === row.id} size="sm" variant="outline" onClick={() => void act(row, "submit")}>Submit</Button>}{row.status === "DRAFT" && (row.preparedById === userId || can("SALES_INVOICE_APPROVE") || can("sales.manage")) && can("SALES_INVOICE_CREATE") && <Button disabled={actingId === row.id} size="sm" variant="outline" onClick={() => { setCancelTarget(row); setCancelReason(""); }}><Ban className="h-3.5 w-3.5"/>Cancel</Button>}{row.status === "SUBMITTED" && can("SALES_INVOICE_APPROVE") && <Button disabled={actingId === row.id} size="sm" variant="outline" onClick={() => void act(row, "approve")}><BadgeCheck className="h-3.5 w-3.5"/>Approve</Button>}{row.status === "APPROVED" && can("SALES_INVOICE_POST") && <Button disabled={actingId === row.id} size="sm" onClick={() => void act(row, "post")}><PackageCheck className="h-3.5 w-3.5"/>Post stock + GL</Button>}{row.status === "POSTED" && Number(row.outstandingAmount) > 0 && can("PAYMENT_CREATE") && <Link href={`/finance/payments?invoiceId=${row.id}&amount=${row.outstandingAmount}`} className="inline-flex h-8 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 font-semibold text-blue-700"><Banknote className="h-3.5 w-3.5"/>Payment</Link>}{row.status === "POSTED" && !row.reversalOfId && row.preparedById !== userId && row.approvedById !== userId && row.postedById !== userId && can("SALES_INVOICE_REVERSE") && <Button disabled={actingId === row.id} size="sm" variant="outline" onClick={() => setReversalTarget(row)}><RotateCcw className="h-3.5 w-3.5"/>Reverse</Button>}<Link href={`/sales/${row.id}/print`} target="_blank" className="inline-flex h-8 items-center rounded-md border border-slate-200 px-2 text-slate-500" title="Print invoice"><Printer className="h-3.5 w-3.5"/></Link></div></td></tr>)}</tbody></table></div>
      <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"><span>Showing {pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0}–{Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}</span><div className="flex items-center gap-2"><label className="flex items-center gap-2">Rows<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-8 rounded-md border border-slate-200 bg-white px-2"><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label><button disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="h-8 rounded-md border border-slate-200 px-3 font-semibold disabled:opacity-40">Previous</button><span className="font-semibold text-slate-700">Page {pagination.page} of {Math.max(1, Math.ceil(pagination.total / pagination.pageSize))}</span><button disabled={page * pageSize >= pagination.total || loading} onClick={() => setPage((value) => value + 1)} className="h-8 rounded-md border border-slate-200 px-3 font-semibold disabled:opacity-40">Next</button></div></div>
    </section>
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-900"><b>Serialized sales:</b> either IMEI resolves to the same physical unit. Drafts do not reserve or issue stock. Posting revalidates every unit and balance, then commits stock, custody, actual-cost COGS, revenue, tax, receivable, and audit exactly once.</div>
    {reversalTarget && <DocumentReversalDialog key={reversalTarget.id} open documentNumber={reversalTarget.invoiceNumber} documentLabel="sales invoice" endpoint={`/api/sales/invoices/${reversalTarget.id}/reverse`} consequence="Posting is blocked if the invoice has posted payment allocations or returns, or if a sold physical unit has moved through another workflow." onClose={() => setReversalTarget(null)} onComplete={async () => { setReversalTarget(null); await load(); }}/>} 
    {cancelTarget && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !actingId) setCancelTarget(null); }}><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-lg font-black text-slate-950">Cancel sales draft</h2><p className="mt-1 text-xs text-slate-500">{cancelTarget.invoiceNumber} · No stock or accounting entry has been posted.</p></div><button disabled={Boolean(actingId)} onClick={() => setCancelTarget(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4"/></button></div><label className="mt-5 block"><span className="label">Cancellation reason *</span><textarea autoFocus rows={4} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} className="w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500" placeholder="Enter a specific business reason (minimum 10 characters)…"/></label><div className="mt-4 flex justify-end gap-2"><button disabled={Boolean(actingId)} onClick={() => setCancelTarget(null)} className="h-10 rounded-lg border px-4 text-sm font-bold">Keep draft</button><button disabled={Boolean(actingId) || cancelReason.trim().length < 10} onClick={() => void cancelDraft()} className="h-10 rounded-lg bg-rose-600 px-4 text-sm font-black text-white disabled:opacity-50">{actingId ? "Cancelling…" : "Confirm cancellation"}</button></div></div></div>}
    {creditOverrideTarget && (
      <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !actingId) setCreditOverrideTarget(null); }}>
        <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
          <div className="flex items-start justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                Credit Limit Authorization Required
              </div>
              <h2 className="mt-2 text-lg font-black text-slate-950">Approve with Credit Override</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {creditOverrideTarget.row.invoiceNumber} · Customer: <b className="text-slate-800">{creditOverrideTarget.row.customer.name}</b> ({creditOverrideTarget.row.customer.code})
              </p>
            </div>
            <button disabled={Boolean(actingId)} onClick={() => setCreditOverrideTarget(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            <div>
              <span className="text-slate-500">Configured Credit Limit:</span>
              <div className="font-bold text-slate-900">{formatMoney(creditOverrideTarget.details?.creditLimit || creditOverrideTarget.row.customer.creditLimit || 0, currency)}</div>
            </div>
            <div>
              <span className="text-slate-500">Current AR Outstanding:</span>
              <div className="font-bold text-slate-900">{formatMoney(creditOverrideTarget.details?.outstanding || 0, currency)}</div>
            </div>
            <div>
              <span className="text-slate-500">Invoice Grand Total:</span>
              <div className="font-bold text-blue-700">{formatMoney(creditOverrideTarget.details?.invoiceTotal || creditOverrideTarget.row.grandTotal, currency)}</div>
            </div>
            <div>
              <span className="font-semibold text-amber-800">Exceeded Amount:</span>
              <div className="font-black text-rose-600">{formatMoney(creditOverrideTarget.details?.exceededAmount || 0, currency)}</div>
            </div>
          </div>

          <label className="mt-4 block">
            <span className="label">Managerial Override Justification / Reason *</span>
            <textarea
              autoFocus
              rows={3}
              value={creditOverrideReason}
              onChange={(event) => setCreditOverrideReason(event.target.value)}
              className="w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500"
              placeholder="e.g. Director authorized 15-day extension; PDC cheque received; VIP dealer account."
            />
          </label>
          <p className="mt-1.5 text-[11px] text-slate-400">
            This justification will be permanently stamped in the company financial audit trail alongside your user ID.
          </p>

          <div className="mt-4 flex justify-end gap-2">
            <button disabled={Boolean(actingId)} onClick={() => setCreditOverrideTarget(null)} className="h-10 rounded-lg border px-4 text-sm font-bold">
              Cancel
            </button>
            <button
              disabled={Boolean(actingId) || creditOverrideReason.trim().length < 5}
              onClick={async () => {
                const target = creditOverrideTarget;
                const reason = creditOverrideReason;
                setCreditOverrideTarget(null);
                await act(target.row, "approve", reason);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-amber-600 px-4 text-sm font-black text-white hover:bg-amber-700 disabled:opacity-50"
            >
              <BadgeCheck className="h-4 w-4" />
              {actingId ? "Authorizing…" : "Authorize & Approve Credit"}
            </button>
          </div>
        </div>
      </div>
    )}
  </div>;
}
