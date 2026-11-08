"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  documentNumber: string;
  documentLabel: string;
  endpoint: string;
  consequence: string;
  onClose: () => void;
  onComplete: (result: unknown) => void | Promise<void>;
};

function todayInKarachi() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function DocumentReversalDialog({ open, documentNumber, documentLabel, endpoint, consequence, onClose, onComplete }: Props) {
  const defaultDate = useMemo(todayInKarachi, []);
  const [postingDate, setPostingDate] = useState(defaultDate);
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function submit() {
    if (reason.trim().length < 10 || !acknowledged || !postingDate) return;
    setSaving(true);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim(), postingDate }),
    });
    const body = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) return toast.error(body?.error?.message || `${documentLabel} reversal failed.`);
    toast.success(`${documentNumber} reversed through linked stock and journal entries.`);
    setReason("");
    setAcknowledged(false);
    await onComplete(body?.data);
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-700"><RotateCcw className="h-5 w-5"/></div><div><h2 className="text-lg font-black text-slate-950">Reverse posted {documentLabel}</h2><p className="mt-1 text-xs text-slate-500">{documentNumber} · A new linked reversal document will be posted.</p></div></div>
        <button disabled={saving} onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4"/></button>
      </div>
      <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/><p>{consequence} The source document remains immutable and is marked Reversed only after the linked reversal, stock movements, and journal are posted atomically.</p></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-[170px_1fr]">
        <label><span className="label">Reversal date *</span><input type="date" value={postingDate} onChange={(event) => setPostingDate(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"/></label>
        <label><span className="label">Business reason *</span><textarea autoFocus rows={4} value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500" placeholder="Explain the correction and supporting evidence (minimum 10 characters)…"/></label>
      </div>
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-xs leading-5 text-slate-700"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300"/><span>I understand this creates permanent equal-and-opposite accounting and inventory history and cannot be used when downstream settlement, return, transfer, sale, or custody activity makes reversal unsafe.</span></label>
      <div className="mt-5 flex justify-end gap-2"><button disabled={saving} onClick={onClose} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700">Keep posted document</button><button disabled={saving || !acknowledged || reason.trim().length < 10 || !postingDate} onClick={() => void submit()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-black text-white hover:bg-rose-700 disabled:opacity-50"><RotateCcw className={`h-4 w-4 ${saving ? "animate-spin" : ""}`}/>{saving ? "Posting reversal…" : "Post authorized reversal"}</button></div>
    </div>
  </div>;
}
