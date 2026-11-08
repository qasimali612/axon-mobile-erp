"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { CalendarDays, Download, ExternalLink, FileText, Printer, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

type Kind = "customer" | "supplier";
type Money = string | number;
type Aging = { current: Money; days1To30: Money; days31To60: Money; days61To90: Money; daysOver90: Money; documentOpen: Money; residual: Money; balance: Money };
type PartyRow = { id: string; code: string; name: string; phone: string | null; openDocumentCount: number; aging: Aging };
type Branch = { id: string; code: string; name: string };
type Transaction = { id: string; postingDate: string; voucherNumber: string; description: string; reference: string | null; sourceModule: string; sourceDocumentType: string | null; sourceDocumentId: string | null; sourceDocumentNumber: string | null; journalEntryId: string; journalStatus: string; branch: Branch; debit: Money; credit: Money; runningBalance: Money };
type OpenItem = { id: string; number: string; documentDate: string; dueDate: string; originalAmount: Money; returnsAmount: Money; allocatedAmount: Money; openAmount: Money; daysPastDue: number; href: string };
type Statement = { from: string; to: string; openingBalance: Money; periodDebit: Money; periodCredit: Money; closingBalance: Money; transactions: Transaction[]; openItems: OpenItem[]; aging: Aging };

const field = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;
function tone(value: Money) { return Number(value) < 0 ? "text-emerald-700" : Number(value) > 0 ? "text-slate-900" : "text-slate-400"; }
function sourceHref(row: Transaction) { if (row.sourceDocumentType === "SalesInvoice") return `/sales/${row.sourceDocumentId}`; if (row.sourceDocumentType === "PurchaseReceipt") return `/goods-receipts/${row.sourceDocumentId}`; if (row.sourceDocumentType === "Payment") return "/finance/payments"; if (row.sourceDocumentType === "StockReturn") return "/returns"; return `/finance/journals/${row.journalEntryId}`; }

export function PartySubledgerWorkspace({ currency, permissions }: { currency: string; permissions: { customer: boolean; supplier: boolean } }) {
  const [kind, setKind] = useState<Kind>(permissions.customer ? "customer" : "supplier");
  const [rows, setRows] = useState<PartyRow[]>([]);
  const [totals, setTotals] = useState<Aging | null>(null);
  const [totalParties, setTotalParties] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [asOf, setAsOf] = useState(today());
  const [selected, setSelected] = useState<PartyRow | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ type: kind, asOf, pageSize: "100" });
    if (query) params.set("search", query);
    const response = await fetch(`/api/finance/subledgers?${params}`);
    const body = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) { toast.error(body?.error?.message || "Party aging could not be loaded."); return; }
    setRows(body.data || []); setTotals(body.totals || null); setTotalParties(body.pagination?.total || 0);
  }, [kind, asOf, query]);
  useEffect(() => { void load(); }, [load]);
  const label = kind === "customer" ? "Customer" : "Supplier";
  function switchKind(value: Kind) { setKind(value); setSelected(null); }
  function searchReport(event: FormEvent) { event.preventDefault(); setQuery(search.trim()); }
  return <>
    <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div><div className="mb-2 flex items-center gap-2"><span className="kicker">Finance control</span><Badge tone="green">Posted-ledger based</Badge></div><h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">Party statements & aging</h1><p className="mt-1.5 max-w-3xl text-sm text-slate-500">Customer receivables and supplier payables traced from control-account journals, source documents, returns and allocations.</p></div>
      <div className="flex rounded-xl border border-slate-200 bg-white p-1">{permissions.customer && <Tab active={kind === "customer"} onClick={() => switchKind("customer")}>Customers</Tab>}{permissions.supplier && <Tab active={kind === "supplier"} onClick={() => switchKind("supplier")}>Suppliers</Tab>}</div>
    </header>
    <section className="surface mb-5 flex flex-col gap-3 p-4 md:flex-row md:items-end">
      <form className="flex flex-1 gap-2" onSubmit={searchReport}><label className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input className={`${field} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${label.toLowerCase()} code, name or phone`}/></label><Button type="submit" variant="outline">Search</Button></form>
      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Aging as of<input type="date" className={`${field} mt-1 md:w-44`} value={asOf} onChange={(event) => setAsOf(event.target.value)}/></label>
      <Button variant="ghost" size="icon" onClick={() => void load()} aria-label="Refresh"><RefreshCw className="h-4 w-4"/></Button>
    </section>
    {totals && <AgingCards kind={kind} aging={totals} currency={currency}/>} 
    <AgingRegister label={label} rows={rows} total={totalParties} currency={currency} loading={loading} onOpen={setSelected}/>
    <StatementModal kind={kind} party={selected} asOf={asOf} currency={currency} onClose={() => setSelected(null)}/>
  </>;
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button className={`rounded-lg px-4 py-2 text-xs font-bold ${active ? "bg-blue-600 text-white" : "text-slate-500"}`} onClick={onClick}>{children}</button>; }
function AgingCards({ kind, aging, currency }: { kind: Kind; aging: Aging; currency: string }) {
  const cards = [{ label: `${kind === "customer" ? "Customer" : "Supplier"} balance`, value: aging.balance }, { label: "Current", value: aging.current }, { label: "1–30 days", value: aging.days1To30 }, { label: "Over 90 days", value: aging.daysOver90 }];
  return <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <div key={card.label} className="surface p-4"><span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{card.label}</span><strong className={`mt-2 block text-xl tabular-nums ${tone(card.value)}`}>{formatMoney(card.value, currency)}</strong></div>)}</div>;
}
function AgingRegister({ label, rows, total, currency, loading, onOpen }: { label: string; rows: PartyRow[]; total: number; currency: string; loading: boolean; onOpen: (row: PartyRow) => void }) {
  const columns: Array<{ key: keyof Aging; label: string }> = [{ key: "current", label: "Current" }, { key: "days1To30", label: "1–30" }, { key: "days31To60", label: "31–60" }, { key: "days61To90", label: "61–90" }, { key: "daysOver90", label: "90+" }, { key: "residual", label: "Residual" }, { key: "balance", label: "Ledger balance" }];
  return <section className="surface overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold">{label} aging register</h2><p className="text-[10px] text-slate-400">{total} parties · residual reconciles opening and on-account activity</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1160px] text-left"><thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3">{label}</th>{columns.map((column) => <th key={column.key} className="px-3 py-3 text-right">{column.label}</th>)}<th className="px-5 py-3 text-right">Statement</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={9} className="p-16 text-center text-xs text-slate-400">Loading posted-ledger aging…</td></tr> : rows.length === 0 ? <tr><td colSpan={9} className="p-16 text-center text-xs text-slate-400">No parties match this report.</td></tr> : rows.map((row) => <tr key={row.id} className="text-xs hover:bg-slate-50/60"><td className="px-5 py-3.5"><button onClick={() => onOpen(row)} className="font-bold text-blue-700 hover:underline">{row.name}</button><span className="block text-[9px] text-slate-400">{row.code} · {row.phone || "No phone"} · {row.openDocumentCount} open</span></td>{columns.map((column) => <td key={column.key} className={`px-3 py-3.5 text-right font-semibold tabular-nums ${column.key === "balance" ? tone(row.aging[column.key]) : "text-slate-600"}`}>{formatMoney(row.aging[column.key], currency)}</td>)}<td className="px-5 py-3.5 text-right"><Button size="sm" variant="outline" onClick={() => onOpen(row)}><FileText className="h-3.5 w-3.5"/>Open</Button></td></tr>)}</tbody></table></div></section>;
}

function StatementModal({ kind, party, asOf, currency, onClose }: { kind: Kind; party: PartyRow | null; asOf: string; currency: string; onClose: () => void }) {
  const [from, setFrom] = useState(yearStart()); const [to, setTo] = useState(asOf); const [report, setReport] = useState<Statement | null>(null); const [loading, setLoading] = useState(false);
  const load = useCallback(async () => { if (!party) return; setLoading(true); const response = await fetch(`/api/finance/subledgers/${kind}/${party.id}?from=${from}&to=${to}`); const body = await response.json().catch(() => null); setLoading(false); if (!response.ok) { toast.error(body?.error?.message || "Statement could not be loaded."); return; } setReport(body.data); }, [party, kind, from, to]);
  useEffect(() => { if (party) { setTo(asOf); setReport(null); } }, [party, asOf]);
  useEffect(() => { void load(); }, [load]);
  if (!party) return null;
  const exportUrl = `/api/finance/subledgers/${kind}/${party.id}?from=${from}&to=${to}&format=csv`;
  const printUrl = `/finance/subledgers/${kind}/${party.id}/print?from=${from}&to=${to}`;
  return <Modal open onClose={onClose} title={`${party.code} · ${party.name}`} description={`${titleCase(kind)} statement and open-item aging`} size="xl"><div className="space-y-5 p-5 sm:p-6"><StatementFilters from={from} to={to} loading={loading} exportUrl={exportUrl} printUrl={printUrl} setFrom={setFrom} setTo={setTo} run={load}/>{loading || !report ? <div className="p-14 text-center text-xs text-slate-400">Loading statement…</div> : <StatementBody report={report} currency={currency}/>}</div></Modal>;
}
function StatementFilters({ from, to, loading, exportUrl, printUrl, setFrom, setTo, run }: { from: string; to: string; loading: boolean; exportUrl: string; printUrl: string; setFrom: (value: string) => void; setTo: (value: string) => void; run: () => Promise<void> }) { return <div className="no-print flex flex-col gap-3 rounded-xl border bg-slate-50 p-3 sm:flex-row sm:items-end"><label className="text-[10px] font-bold uppercase text-slate-500">From<input className={`${field} mt-1`} type="date" value={from} onChange={(event) => setFrom(event.target.value)}/></label><label className="text-[10px] font-bold uppercase text-slate-500">To<input className={`${field} mt-1`} type="date" value={to} onChange={(event) => setTo(event.target.value)}/></label><Button variant="outline" onClick={() => void run()} loading={loading}><CalendarDays className="h-4 w-4"/>Run</Button><a className="inline-flex" href={exportUrl}><span className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-4 text-xs font-bold"><Download className="h-4 w-4"/>CSV</span></a><a className="inline-flex" href={printUrl} target="_blank" rel="noreferrer"><Button type="button" variant="outline"><Printer className="h-4 w-4"/>Print statement</Button></a></div>; }
function StatementBody({ report, currency }: { report: Statement; currency: string }) { return <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Opening" value={report.openingBalance} currency={currency}/><Metric label="Period debit" value={report.periodDebit} currency={currency}/><Metric label="Period credit" value={report.periodCredit} currency={currency}/><Metric label="Closing" value={report.closingBalance} currency={currency}/></div><TransactionTable report={report} currency={currency}/><OpenItemsTable report={report} currency={currency}/></>; }
function Metric({ label, value, currency }: { label: string; value: Money; currency: string }) { return <div className="rounded-xl border p-3"><span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</span><b className={`mt-1 block text-sm ${tone(value)}`}>{formatMoney(value, currency)}</b></div>; }
function TransactionTable({ report, currency }: { report: Statement; currency: string }) { return <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[920px] text-left text-xs"><thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr><th className="px-3 py-3">Date / voucher</th><th className="px-3 py-3">Source / description</th><th className="px-3 py-3">Branch</th><th className="px-3 py-3 text-right">Debit</th><th className="px-3 py-3 text-right">Credit</th><th className="px-3 py-3 text-right">Balance</th><th className="no-print px-3 py-3"/></tr></thead><tbody className="divide-y"><tr className="bg-blue-50/50"><td className="px-3 py-2">{formatDate(report.from)}</td><td className="px-3 py-2 font-semibold">Opening balance</td><td/><td/><td/><td className="px-3 py-2 text-right font-bold">{formatMoney(report.openingBalance, currency)}</td><td/></tr>{report.transactions.map((row) => <tr key={row.id}><td className="px-3 py-2.5"><b>{formatDate(row.postingDate)}</b><small className="block text-slate-400">{row.voucherNumber}</small></td><td className="px-3 py-2.5"><b>{row.sourceDocumentNumber || row.sourceDocumentType || row.sourceModule}</b><small className="block text-slate-500">{row.description}</small></td><td className="px-3 py-2.5">{row.branch.code}</td><td className="px-3 py-2.5 text-right">{Number(row.debit) ? formatMoney(row.debit, currency) : "—"}</td><td className="px-3 py-2.5 text-right">{Number(row.credit) ? formatMoney(row.credit, currency) : "—"}</td><td className={`px-3 py-2.5 text-right font-bold ${tone(row.runningBalance)}`}>{formatMoney(row.runningBalance, currency)}</td><td className="no-print px-3 py-2.5"><Link href={sourceHref(row)} className="text-blue-600"><ExternalLink className="h-3.5 w-3.5"/></Link></td></tr>)}</tbody></table>{report.transactions.length === 0 && <p className="p-8 text-center text-xs text-slate-400">No control-account activity in this range.</p>}</div>; }
function OpenItemsTable({ report, currency }: { report: Statement; currency: string }) { return <div><div className="mb-2 flex justify-between"><h3 className="text-sm font-bold">Open documents</h3><span className="text-[10px] text-slate-400">Residual/opening/on-account: {formatMoney(report.aging.residual, currency)}</span></div><div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[800px] text-left text-xs"><thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr><th className="px-3 py-3">Document</th><th className="px-3 py-3">Due</th><th className="px-3 py-3 text-right">Original</th><th className="px-3 py-3 text-right">Returns</th><th className="px-3 py-3 text-right">Allocated</th><th className="px-3 py-3 text-right">Open</th><th className="px-3 py-3 text-right">Age</th></tr></thead><tbody className="divide-y">{report.openItems.map((item) => <tr key={item.id}><td className="px-3 py-2.5"><Link href={item.href} className="font-bold text-blue-700">{item.number}</Link><small className="block text-slate-400">{formatDate(item.documentDate)}</small></td><td className="px-3 py-2.5">{formatDate(item.dueDate)}</td><td className="px-3 py-2.5 text-right">{formatMoney(item.originalAmount, currency)}</td><td className="px-3 py-2.5 text-right">{formatMoney(item.returnsAmount, currency)}</td><td className="px-3 py-2.5 text-right">{formatMoney(item.allocatedAmount, currency)}</td><td className="px-3 py-2.5 text-right font-bold">{formatMoney(item.openAmount, currency)}</td><td className={`px-3 py-2.5 text-right font-bold ${item.daysPastDue > 0 ? "text-rose-700" : "text-emerald-700"}`}>{item.daysPastDue > 0 ? `${item.daysPastDue}d` : "Current"}</td></tr>)}</tbody></table>{report.openItems.length === 0 && <p className="p-8 text-center text-xs text-slate-400">No open source documents.</p>}</div></div>; }
