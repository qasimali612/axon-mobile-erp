"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Banknote, Ban, ClipboardCheck, Edit3, FilePlus2, LockKeyhole, PackageCheck, Printer, RefreshCw, RotateCcw, Search, Send, ShieldCheck, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { DocumentReversalDialog } from "@/components/operations/document-reversal-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

export type ProcurementTab = "orders" | "receipts";
type Tab = ProcurementTab;
type Props = { currency: string; userId: string; permissions: string[]; initialTab?: ProcurementTab; initialStatus?: string };

function statusTone(status: string) {
  if (["POSTED", "FULLY_RECEIVED", "CLOSED"].includes(status)) return "green" as const;
  if (["APPROVED", "SUBMITTED", "INSPECTION", "PARTIALLY_RECEIVED"].includes(status)) return "amber" as const;
  if (["CANCELLED", "REVERSED", "REJECTED"].includes(status)) return "red" as const;
  return "slate" as const;
}

export function ProcurementManager({ currency, userId, permissions, initialTab = "orders", initialStatus = "" }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reasonAction, setReasonAction] = useState<{ row: any; action: "reject" | "cancel" | "close"; title: string } | null>(null);
  const [reversalTarget, setReversalTarget] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [acting, setActing] = useState(false);
  const can = (key: string) => permissions.includes(key);
  const load = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (debouncedSearch.trim()) query.set("search", debouncedSearch.trim());
    if (status) query.set("status", status);
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    const response = await fetch(`/api/purchases/${tab}?${query}`, { cache: "no-store" });
    const body = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) return toast.error(body?.error?.message || "Procurement register could not be loaded.");
    setRows(body.data || []);
    setSummary(body.summary || null);
    setPagination(body.pagination || { page, pageSize, total: 0 });
  }, [debouncedSearch, from, page, pageSize, status, tab, to]);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search), 300); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => { setPage(1); }, [debouncedSearch, from, pageSize, status, tab, to]);
  useEffect(() => { void load(); }, [load]);

  async function act(row: any, action: string, actionReason?: string) {
    if (action === "post" && !window.confirm(`Post ${row.receiptNumber}? This will create immutable stock and general-ledger effects.`)) return;
    const base = tab === "orders" ? "/api/purchases/orders" : "/api/purchases/receipts";
    setActing(true);
    const response = await fetch(`${base}/${row.id}/${action}`, { method: "POST", ...(actionReason ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: actionReason }) } : {}) });
    const body = await response.json().catch(() => null); setActing(false);
    if (!response.ok) return toast.error(body?.error?.message || `${titleCase(action)} failed.`);
    const past = action === "submit" ? "submitted" : action === "approve" ? "approved" : action === "post" ? "posted" : action === "reject" ? "rejected" : action === "cancel" ? "cancelled" : "closed";
    toast.success(`${row.orderNumber || row.receiptNumber} ${past}.`);
    setReasonAction(null); setReason(""); void load();
  }

  function openReason(row: any, action: "reject" | "cancel" | "close") {
    setReason("");
    setReasonAction({ row, action, title: action === "reject" ? "Reject purchase order" : action === "cancel" ? `Cancel ${tab === "orders" ? "purchase order" : "goods receipt"}` : "Close purchase order" });
  }

  const metrics = useMemo(() => {
    const count = (states: string[]) => states.reduce((sum, item) => sum + Number(summary?.statuses?.[item]?.count || 0), 0);
    return {
      total: pagination.total,
      draft: count(["DRAFT"]),
      pending: count(["SUBMITTED", "INSPECTION", "APPROVED", "PARTIALLY_RECEIVED"]),
      completed: count(["POSTED", "FULLY_RECEIVED", "CLOSED"]),
    };
  }, [pagination.total, summary]);
  const statuses = tab === "orders"
    ? ["DRAFT", "SUBMITTED", "APPROVED", "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "CLOSED", "REJECTED", "CANCELLED"]
    : ["DRAFT", "SUBMITTED", "INSPECTION", "APPROVED", "POSTED", "REJECTED", "CANCELLED", "REVERSED"];

  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><span className="kicker">Procure-to-pay</span><h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-[30px]">Procurement & receiving</h1><p className="mt-1.5 max-w-3xl text-sm text-slate-500">Persistent multi-product purchase orders, partial goods receipts, physical-device identifiers, inspection, landed cost, stock, and balanced supplier journals.</p></div>
      <div className="flex flex-wrap gap-2">{can("PURCHASE_RECEIPT_CREATE") && <Link href="/goods-receipts/new" className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700 hover:bg-blue-100"><Truck className="h-4 w-4"/>New goods receipt</Link>}{can("PURCHASE_ORDER_CREATE") && <Link href="/purchases/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"><FilePlus2 className="h-4 w-4"/>New purchase order</Link>}</div>
    </div>

    <div className="grid gap-3 sm:grid-cols-4">{[
      ["Documents", metrics.total, "bg-blue-50 text-blue-700"], ["Drafts", metrics.draft, "bg-slate-100 text-slate-700"],
      ["Awaiting action", metrics.pending, "bg-amber-50 text-amber-700"], ["Completed", metrics.completed, "bg-emerald-50 text-emerald-700"],
    ].map(([label, value, tone]) => <div key={String(label)} className="surface flex items-center justify-between p-4"><div><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p></div><div className={`h-9 w-2 rounded-full ${String(tone).split(" ")[0]}`}/></div>)}</div>

    <section className="surface overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">{(["orders", "receipts"] as Tab[]).map((item) => <button key={item} onClick={() => { setTab(item); setStatus(""); setPage(1); }} className={`rounded-md px-4 py-2 text-xs font-bold transition ${tab === item ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{item === "orders" ? "Purchase orders" : "Goods receipts"}</button>)}</div>
        <div className="flex flex-1 flex-wrap justify-end gap-2"><div className="relative min-w-52 flex-1 lg:max-w-80"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search number, supplier, SKU, model…" className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-blue-500"/></div><input aria-label="From date" title="From date" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs"/><input aria-label="To date" title="To date" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs"/><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select><button onClick={() => void load()} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="Refresh"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}/></button></div>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left"><thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Document</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Receiving location</th><th className="px-4 py-3">Prepared by</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-center">Lines</th><th className="px-4 py-3 text-right">Total</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={8} className="py-20 text-center text-sm text-slate-400">Loading procurement records…</td></tr> : !rows.length ? <tr><td colSpan={8} className="py-20 text-center"><PackageCheck className="mx-auto h-9 w-9 text-slate-300"/><p className="mt-2 text-sm font-semibold text-slate-500">No matching {tab}.</p></td></tr> : rows.map((row) => {
        const number = row.orderNumber || row.receiptNumber; const isOwnDraft = row.status === "DRAFT" && row.preparedById === userId;
        return <tr key={row.id} className="text-xs hover:bg-blue-50/20"><td className="px-5 py-3.5">{tab === "receipts" ? <Link href={`/goods-receipts/${row.id}`} className="text-sm font-bold text-blue-700 hover:underline">{number}</Link> : <b className="text-sm text-blue-700">{number}</b>}<span className="mt-0.5 block text-[10px] text-slate-400">{formatDate(row.orderDate || row.receiptDate)}{row.journalEntry ? ` · ${row.journalEntry.voucherNumber}` : ""}</span></td><td className="px-4 py-3.5"><b>{row.supplier.name}</b><span className="block text-[10px] text-slate-400">{row.supplier.code}</span></td><td className="px-4 py-3.5 text-slate-600"><b>{row.warehouse.code}</b><span className="block text-[10px] text-slate-400">{row.branch.name}</span></td><td className="px-4 py-3.5 text-slate-600">{row.preparedBy.fullName}</td><td className="px-4 py-3.5"><Badge tone={statusTone(row.status)}>{titleCase(row.status)}</Badge></td><td className="px-4 py-3.5 text-center font-bold">{row._count.lines}</td><td className="px-4 py-3.5 text-right text-sm font-bold tabular-nums">{formatMoney(row.grandTotal, currency)}</td><td className="px-5 py-3.5"><div className="flex justify-end gap-1">
          {isOwnDraft && can(tab === "orders" ? "PURCHASE_ORDER_CREATE" : "PURCHASE_RECEIPT_CREATE") && <Link href={tab === "orders" ? `/purchases/${row.id}/edit` : `/goods-receipts/${row.id}/edit`} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 font-semibold text-slate-700 hover:bg-white"><Edit3 className="h-3.5 w-3.5"/>Edit</Link>}
          {isOwnDraft && can(tab === "orders" ? "PURCHASE_ORDER_CREATE" : "PURCHASE_RECEIPT_CREATE") && <Button size="sm" variant="outline" onClick={() => void act(row, "submit")}><Send className="h-3.5 w-3.5"/>Submit</Button>}
          {tab === "orders" && row.status === "SUBMITTED" && can("PURCHASE_ORDER_APPROVE") && <><Button size="sm" variant="outline" onClick={() => void act(row, "approve")}><ClipboardCheck className="h-3.5 w-3.5"/>Approve</Button><Button size="sm" variant="outline" onClick={() => openReason(row, "reject")}><X className="h-3.5 w-3.5"/>Reject</Button></>}
          {tab === "receipts" && ["SUBMITTED", "INSPECTION"].includes(row.status) && row.requiresInspection && can("PURCHASE_RECEIPT_INSPECT") && <Link href={`/goods-receipts/${row.id}/inspect`} className="inline-flex h-8 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 font-semibold text-blue-700"><ShieldCheck className="h-3.5 w-3.5"/>Inspect</Link>}
          {tab === "receipts" && ((row.status === "SUBMITTED" && !row.requiresInspection) || row.status === "INSPECTION") && can("PURCHASE_RECEIPT_APPROVE") && <Button size="sm" variant="outline" onClick={() => void act(row, "approve")}><ClipboardCheck className="h-3.5 w-3.5"/>Approve</Button>}
          {tab === "receipts" && row.status === "APPROVED" && can("PURCHASE_RECEIPT_POST") && <Button size="sm" onClick={() => void act(row, "post")}><PackageCheck className="h-3.5 w-3.5"/>Post stock + GL</Button>}
          {tab === "orders" && ["APPROVED", "PARTIALLY_RECEIVED", "FULLY_RECEIVED"].includes(row.status) && can("PURCHASE_ORDER_CLOSE") && <Button size="sm" variant="outline" onClick={() => openReason(row, "close")}><LockKeyhole className="h-3.5 w-3.5"/>Close</Button>}
          {(["DRAFT", "SUBMITTED", "APPROVED", "INSPECTION"].includes(row.status)) && can(tab === "orders" ? "PURCHASE_ORDER_CANCEL" : "PURCHASE_RECEIPT_CANCEL") && <Button size="sm" variant="outline" onClick={() => openReason(row, "cancel")}><Ban className="h-3.5 w-3.5"/>Cancel</Button>}
          {tab === "receipts" && row.status === "POSTED" && Number(row.outstandingAmount) > 0 && can("PAYMENT_CREATE") && <Link href={`/finance/payments?receiptId=${row.id}&amount=${row.outstandingAmount}`} className="inline-flex h-8 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 font-semibold text-blue-700"><Banknote className="h-3.5 w-3.5"/>Payment</Link>}
          {tab === "receipts" && row.status === "POSTED" && !row.reversalOfId && row.preparedById !== userId && row.approvedById !== userId && row.postedById !== userId && can("PURCHASE_RECEIPT_REVERSE") && <Button size="sm" variant="outline" onClick={() => setReversalTarget(row)}><RotateCcw className="h-3.5 w-3.5"/>Reverse</Button>}
          <Link href={tab === "orders" ? `/purchases/${row.id}/print` : `/goods-receipts/${row.id}/print`} target="_blank" className="inline-flex h-8 items-center rounded-md border border-slate-200 px-2 text-slate-500 hover:bg-white" title="Print"><Printer className="h-3.5 w-3.5"/></Link>
        </div></td></tr>;
      })}</tbody></table></div>
      <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"><span>Showing {pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0}–{Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total} · Filtered value {formatMoney(summary?.grandTotal || 0, currency)}</span><div className="flex items-center gap-2"><label className="flex items-center gap-2">Rows<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-8 rounded-md border border-slate-200 bg-white px-2"><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label><button disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="h-8 rounded-md border border-slate-200 px-3 font-semibold disabled:opacity-40">Previous</button><span className="font-semibold text-slate-700">Page {pagination.page} of {Math.max(1, Math.ceil(pagination.total / pagination.pageSize))}</span><button disabled={page * pageSize >= pagination.total || loading} onClick={() => setPage((value) => value + 1)} className="h-8 rounded-md border border-slate-200 px-3 font-semibold disabled:opacity-40">Next</button></div></div>
    </section>

    <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-xs leading-5 text-blue-900"><b>Control model:</b> Drafts and scans never affect stock. An independently approved goods receipt posts stock movements, physical units, supplier payable, inventory, and input tax in one serializable transaction. Rejected quantities remain outside available inventory.</div>
    {reversalTarget && <DocumentReversalDialog key={reversalTarget.id} open documentNumber={reversalTarget.receiptNumber} documentLabel="goods receipt" endpoint={`/api/purchases/receipts/${reversalTarget.id}/reverse`} consequence="Posting is blocked if supplier allocations or returns exist, if serialized units were sold, transferred, reserved, or returned, or if quantity/value stock cannot be removed safely." onClose={() => setReversalTarget(null)} onComplete={async () => { setReversalTarget(null); await load(); }}/>} 
    {reasonAction && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !acting) setReasonAction(null); }}><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-lg font-black text-slate-950">{reasonAction.title}</h2><p className="mt-1 text-xs text-slate-500">{reasonAction.row.orderNumber || reasonAction.row.receiptNumber} · This state change is retained in immutable audit history.</p></div><button disabled={acting} onClick={() => setReasonAction(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4"/></button></div><label className="mt-5 block"><span className="label">Reason *</span><textarea autoFocus rows={4} value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500" placeholder="Enter a specific business reason (minimum 10 characters)…"/></label><div className="mt-4 flex justify-end gap-2"><button disabled={acting} onClick={() => setReasonAction(null)} className="h-10 rounded-lg border px-4 text-sm font-bold">Keep document</button><button disabled={acting || reason.trim().length < 10} onClick={() => void act(reasonAction.row, reasonAction.action, reason)} className={`h-10 rounded-lg px-4 text-sm font-black text-white disabled:opacity-50 ${reasonAction.action === "close" ? "bg-blue-600" : "bg-rose-600"}`}>{acting ? "Working…" : `Confirm ${reasonAction.action}`}</button></div></div></div>}
  </div>;
}
