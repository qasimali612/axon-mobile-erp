"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Boxes, History, Search, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

type View = "balances" | "units" | "movements";
type Row = Record<string, any>;

function tone(status: string) {
  if (["IN_STOCK", "PURCHASE_RECEIPT", "TRANSFER_IN", "ADJUSTMENT_IN"].includes(status)) return "green" as const;
  if (["RESERVED", "IN_TRANSIT"].includes(status)) return "amber" as const;
  if (["SOLD", "SCRAPPED", "SALE_ISSUE", "ADJUSTMENT_OUT"].includes(status)) return "red" as const;
  return "slate" as const;
}

export function StockRegister({ currency }: { currency: string }) {
  const [view, setView] = useState<View>("balances");
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/inventory/stock?view=${view}&pageSize=100&search=${encodeURIComponent(query)}`);
    const body = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) return toast.error(body?.error?.message || "Stock register could not be loaded.");
    setRows(body.data || []);
  }, [view, query]);
  useEffect(() => { void load(); }, [load]);

  return <>
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2"><span className="kicker">Authoritative inventory ledger</span><Badge tone="green">Database posted</Badge></div><h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">Stock control</h1><p className="mt-1.5 text-sm text-slate-500">Balances reconcile to append-only movements; dual-SIM identifiers remain attached to one physical stock unit.</p></div><Link href="/inventory/imei" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white"><Smartphone className="h-4 w-4"/>Open IMEI registry</Link></div>
    <div className="surface mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><div className="flex gap-1 rounded-xl bg-slate-100 p-1">{([{id:"balances",label:"Balances",icon:Boxes},{id:"units",label:"Physical units",icon:Smartphone},{id:"movements",label:"Movements",icon:History}] as const).map((item)=><button key={item.id} onClick={()=>setView(item.id)} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${view===item.id?"bg-white text-blue-700 shadow-sm":"text-slate-500"}`}><item.icon className="h-3.5 w-3.5" />{item.label}</button>)}</div><form onSubmit={(event)=>{event.preventDefault();setQuery(search);}} className="ml-auto flex w-full gap-2 sm:w-auto"><label className="relative flex-1 sm:w-72"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><input value={search} onChange={(event)=>setSearch(event.target.value)} className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-xs" placeholder="SKU, product, document, IMEI or serial" /></label><Button type="submit" variant="outline">Search</Button></form></div>
    <section className="surface overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left"><thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400">{view==="balances"?<tr><th className="px-5 py-3">Item</th><th className="px-4 py-3">Warehouse</th><th className="px-4 py-3 text-right">On hand</th><th className="px-4 py-3 text-right">Reserved</th><th className="px-4 py-3 text-right">Available</th><th className="px-5 py-3 text-right">Inventory value</th></tr>:view==="units"?<tr><th className="px-5 py-3">Physical unit</th><th className="px-4 py-3">Identifiers</th><th className="px-4 py-3">Warehouse</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Acquisition cost</th></tr>:<tr><th className="px-5 py-3">Posting</th><th className="px-4 py-3">Item</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Movement</th><th className="px-4 py-3 text-right">Quantity</th><th className="px-5 py-3 text-right">Value</th></tr>}</thead><tbody className="divide-y divide-slate-100">{loading?<tr><td colSpan={6} className="px-5 py-16 text-center text-xs text-slate-400">Loading posted inventory…</td></tr>:!rows.length?<tr><td colSpan={6} className="px-5 py-16 text-center text-xs text-slate-400">No stock records match this view.</td></tr>:rows.map((row)=>view==="balances"?<tr key={row.id} className="text-xs"><td className="px-5 py-3.5"><b className="text-slate-800">{row.product.name}</b><span className="block text-[9px] text-slate-400">{row.product.sku} · {row.variant.sku} · {titleCase(row.product.trackingMethod)}</span></td><td className="px-4 py-3.5 text-slate-600">{row.warehouse.code} · {row.warehouse.name}</td><td className="px-4 py-3.5 text-right font-semibold tabular-nums">{row.quantity}</td><td className="px-4 py-3.5 text-right tabular-nums text-amber-700">{row.reservedQuantity}</td><td className="px-4 py-3.5 text-right font-bold tabular-nums text-blue-700">{row.availableQuantity}</td><td className="px-5 py-3.5 text-right font-semibold tabular-nums">{formatMoney(row.inventoryValue,currency)}</td></tr>:view==="units"?<tr key={row.id} className="text-xs"><td className="px-5 py-3.5"><b>{row.product.name}</b><span className="block text-[9px] text-slate-400">{row.variant.sku}</span></td><td className="px-4 py-3.5"><div className="flex max-w-[340px] flex-wrap gap-1">{row.identifiers.map((identifier:Row)=><span key={identifier.id} className="rounded bg-slate-100 px-1.5 py-1 font-mono text-[9px] text-slate-600">{identifier.type}{identifier.slot?` ${identifier.slot}`:""}: {identifier.value}</span>)}</div></td><td className="px-4 py-3.5 text-slate-600">{row.currentWarehouse?.code||"—"}</td><td className="px-4 py-3.5"><Badge tone={tone(row.status)}>{titleCase(row.status)}</Badge></td><td className="px-5 py-3.5 text-right font-semibold tabular-nums">{formatMoney(row.acquisitionCost,currency)}</td></tr>:<tr key={row.id} className="text-xs"><td className="px-5 py-3.5"><b>{formatDate(row.postingDate)}</b><span className="block text-[9px] text-slate-400">{row.warehouse.code}</span></td><td className="px-4 py-3.5"><b>{row.product.name}</b><span className="block text-[9px] text-slate-400">{row.variant.sku}</span></td><td className="px-4 py-3.5 text-slate-600">{row.sourceDocumentNumber}<span className="block text-[9px] text-slate-400">{row.journalEntry?.voucherNumber||"No GL effect"}</span></td><td className="px-4 py-3.5"><Badge tone={tone(row.movementType)}>{titleCase(row.movementType)}</Badge></td><td className={`px-4 py-3.5 text-right font-bold tabular-nums ${String(row.quantity).startsWith("-")?"text-red-600":"text-emerald-700"}`}>{row.quantity}</td><td className="px-5 py-3.5 text-right font-semibold tabular-nums">{formatMoney(row.totalCost,currency)}</td></tr>)}</tbody></table></div></section>
  </>;
}
