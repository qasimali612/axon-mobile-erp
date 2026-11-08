"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ClipboardCheck, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const quantity = (value: unknown) => Number(value || 0);
type UnitResult = { unitId: string; result: "PENDING" | "ACCEPTED" | "REJECTED" | "QUARANTINED"; condition: string; notes: string };
type LineResult = { lineId: string; acceptedQuantity: string; rejectedQuantity: string; notes: string; units: UnitResult[] };

export function GoodsReceiptInspector({ receiptId }: { receiptId: string }) {
  const [receipt, setReceipt] = useState<any>(null);
  const [lines, setLines] = useState<LineResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/purchases/receipts/${receiptId}`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error?.message || "Receipt could not be loaded."); return body.data;
    }).then((data) => {
      if (!active) return;
      setReceipt(data);
      setLines(data.lines.map((line: any) => ({
        lineId: line.id, acceptedQuantity: String(line.acceptedQuantity), rejectedQuantity: String(line.rejectedQuantity), notes: line.inspectionNotes || "",
        units: line.units.map((unit: any) => ({ unitId: unit.id, result: unit.inspectionStatus === "PENDING" ? "PENDING" : unit.inspectionStatus, condition: unit.condition || "NEW", notes: "" })),
      })));
    }).catch((error) => toast.error(error instanceof Error ? error.message : "Receipt could not be loaded.")).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [receiptId]);

  const resultMap = useMemo(() => new Map(lines.map((line) => [line.lineId, line])), [lines]);
  function patchLine(lineId: string, patch: Partial<LineResult>) { setLines((current) => current.map((line) => line.lineId === lineId ? { ...line, ...patch } : line)); }
  function patchUnit(lineId: string, unitId: string, patch: Partial<UnitResult>) { setLines((current) => current.map((line) => line.lineId === lineId ? { ...line, units: line.units.map((unit) => unit.unitId === unitId ? { ...unit, ...patch } : unit) } : line)); }
  const summary = useMemo(() => lines.reduce((totals, line) => {
    if (line.units.length) { totals.accepted += line.units.filter((unit) => unit.result === "ACCEPTED").length; totals.rejected += line.units.filter((unit) => unit.result === "REJECTED").length; totals.quarantined += line.units.filter((unit) => unit.result === "QUARANTINED").length; }
    else { totals.accepted += quantity(line.acceptedQuantity); totals.rejected += quantity(line.rejectedQuantity); }
    return totals;
  }, { accepted: 0, rejected: 0, quarantined: 0 }), [lines]);

  async function submit() {
    if (!receipt) return;
    for (const source of receipt.lines) {
      const result = resultMap.get(source.id)!;
      if (result.units.length && result.units.some((unit) => unit.result === "PENDING")) return toast.error(`Complete every physical-unit result on line ${source.lineNumber}.`);
      if (!result.units.length && Math.abs(quantity(result.acceptedQuantity) + quantity(result.rejectedQuantity) - quantity(source.quantity)) > 0.0001) return toast.error(`Line ${source.lineNumber}: accepted plus rejected must equal received quantity.`);
    }
    if (summary.accepted <= 0) return toast.error("At least one unit or quantity must be accepted.");
    setSaving(true);
    try {
      const response = await fetch(`/api/purchases/receipts/${receiptId}/inspect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error?.message || "Inspection could not be recorded.");
      setReceipt((current: any) => ({ ...current, ...body.data })); toast.success("Inspection results recorded. Stock remains unchanged until approval and posting.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Inspection could not be recorded."); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-600"/>Loading inspection workspace…</div>;
  if (!receipt) return <div className="surface p-8 text-sm text-rose-700">The goods receipt could not be loaded.</div>;
  const editable = ["SUBMITTED", "INSPECTION"].includes(receipt.status);
  return <div className="space-y-5 pb-20">
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><Link href="/purchases" className="mt-1 rounded-lg border bg-white p-2 text-slate-500"><ArrowLeft className="h-4 w-4"/></Link><div><span className="kicker">Independent quality control</span><h1 className="mt-2 text-2xl font-black">Inspect {receipt.receiptNumber}</h1><p className="mt-1 text-sm text-slate-500">{receipt.supplier.code} · {receipt.supplier.name} · {receipt.warehouse.code}</p></div></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">{receipt.status.replaceAll("_", " ")}</span></header>
    <div className="grid gap-3 sm:grid-cols-3"><div className="surface p-4"><p className="text-xs font-bold text-slate-500">Accepted</p><p className="mt-1 text-2xl font-black text-emerald-700">{summary.accepted}</p></div><div className="surface p-4"><p className="text-xs font-bold text-slate-500">Rejected</p><p className="mt-1 text-2xl font-black text-rose-700">{summary.rejected}</p></div><div className="surface p-4"><p className="text-xs font-bold text-slate-500">Quarantined</p><p className="mt-1 text-2xl font-black text-amber-700">{summary.quarantined}</p></div></div>
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-900"><b>Control:</b> inspection records condition and disposition only. It does not create physical stock, inventory movements, supplier accruals, or available quantity.</div>
    <section className="space-y-4">{receipt.lines.map((source: any) => { const result = resultMap.get(source.id); if (!result) return null; const serialized = ["IMEI", "SERIAL"].includes(source.product.trackingMethod); return <article key={source.id} className="surface overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3"><div><h2 className="text-sm font-black">{source.lineNumber}. {source.product.name} · {source.variant.name}</h2><p className="mt-0.5 text-xs text-slate-500">{source.variant.sku} · {source.product.trackingMethod} · Received {source.quantity}</p></div><span className="rounded bg-white px-2 py-1 text-xs font-bold text-slate-600">{serialized ? `${source.units.length} physical units` : source.product.unit.code}</span></div>
      {serialized ? <div className="divide-y">{source.units.map((unit: any, index: number) => { const unitResult = result.units.find((item) => item.unitId === unit.id)!; const identifiers = Array.isArray(unit.identifiers) ? unit.identifiers : []; return <div key={unit.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(220px,1.5fr)_1fr_1.2fr]"><div><p className="text-xs font-black">Physical device {index + 1}</p><div className="mt-1 flex flex-wrap gap-1">{identifiers.map((identifier: any) => <code key={`${identifier.type}-${identifier.value}`} className="rounded bg-slate-100 px-2 py-1 text-[10px]">{identifier.type}{identifier.slot ? ` ${identifier.slot}` : ""}: {identifier.value}</code>)}</div></div><select disabled={!editable} className={inputClass} value={unitResult.condition} onChange={(event) => patchUnit(source.id, unit.id, { condition: event.target.value })}><option>NEW</option><option>OPEN_BOX</option><option>DAMAGED</option><option>REFURBISHED</option></select><div className="grid grid-cols-3 gap-1">{(["ACCEPTED", "REJECTED", "QUARANTINED"] as const).map((value) => <button disabled={!editable} key={value} onClick={() => patchUnit(source.id, unit.id, { result: value })} className={`rounded-lg border px-2 py-2 text-[10px] font-black ${unitResult.result === value ? value === "ACCEPTED" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : value === "REJECTED" ? "border-rose-500 bg-rose-50 text-rose-800" : "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-500"}`}>{value}</button>)}</div></div>; })}</div> : <div className="grid gap-3 p-4 sm:grid-cols-3"><label><span className="label">Accepted quantity</span><input disabled={!editable} className={inputClass} type="number" min="0" step="0.0001" value={result.acceptedQuantity} onChange={(event) => { const accepted = Math.max(0, Math.min(quantity(source.quantity), quantity(event.target.value))); patchLine(source.id, { acceptedQuantity: event.target.value, rejectedQuantity: String(quantity(source.quantity) - accepted) }); }}/></label><label><span className="label">Rejected / hold quantity</span><input disabled={!editable} className={inputClass} type="number" min="0" step="0.0001" value={result.rejectedQuantity} onChange={(event) => { const rejected = Math.max(0, Math.min(quantity(source.quantity), quantity(event.target.value))); patchLine(source.id, { rejectedQuantity: event.target.value, acceptedQuantity: String(quantity(source.quantity) - rejected) }); }}/></label><label><span className="label">Inspection notes</span><input disabled={!editable} className={inputClass} value={result.notes} onChange={(event) => patchLine(source.id, { notes: event.target.value })}/></label></div>}
    </article>; })}</section>
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,.08)] backdrop-blur"><div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3"><div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex"><ShieldCheck className="h-4 w-4 text-blue-600"/>Maker-checker validation and append-only inspection history apply.</div><div className="ml-auto flex gap-2"><Link href="/purchases" className="inline-flex h-10 items-center rounded-lg border px-4 text-sm font-bold">Back</Link>{editable && <button disabled={saving} onClick={() => void submit()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <ClipboardCheck className="h-4 w-4"/>}Record inspection</button>}{receipt.status === "INSPECTION" && <div className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-50 px-4 text-sm font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4"/>Ready for approval</div>}</div></div></div>
  </div>;
}
