"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CalendarClock, Download, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

const field = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const REPORTS = [
  ["purchase-orders", "Purchase orders"], ["goods-receipts", "Goods receipts"], ["purchase-returns", "Purchase returns"],
  ["sales", "Sales"], ["sales-returns", "Sales returns"], ["inventory", "Stock balances"], ["devices", "IMEI / devices"],
  ["movements", "Movement ledger"], ["profitability", "Profitability"], ["reorder", "Reorder suggestions"],
] as const;

export function ScheduleWorkspace({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", reportKey: "sales", cadence: "WEEKLY", recipients: "", isActive: true });

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/reports/schedules", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) return toast.error(body?.error?.message || "Schedules could not be loaded.");
    setRows(body.data || []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch("/api/reports/schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, filters: {} }) });
    setSaving(false);
    const body = await response.json().catch(() => null);
    if (!response.ok) return toast.error(body?.error?.message || "The schedule could not be saved.");
    toast.success("Report schedule saved");
    setOpen(false);
    setForm({ name: "", reportKey: "sales", cadence: "WEEKLY", recipients: "", isActive: true });
    await load();
  }

  async function toggle(row: any) {
    const response = await fetch(`/api/reports/schedules/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !row.isActive }) });
    if (!response.ok) return toast.error("The schedule could not be updated.");
    await load();
  }

  async function remove(row: any) {
    const response = await fetch(`/api/reports/schedules/${row.id}`, { method: "DELETE" });
    if (!response.ok) return toast.error("The schedule could not be deleted.");
    toast.success("Schedule removed");
    await load();
  }

  async function runNow(row: any) {
    setRunning(row.id);
    const response = await fetch(`/api/reports/schedules/${row.id}/run`, { method: "POST" });
    setRunning(null);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return toast.error(body?.error?.message || "The schedule could not be run.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${row.name}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Export generated");
    await load();
  }

  return (
    <>
      <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2"><span className="kicker">Reporting delivery</span><Badge tone="green">Audited exports</Badge></div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">Report schedules</h1>
          <p className="mt-1.5 text-sm text-slate-500">Recurring export definitions for the operational reports. Running a schedule executes the same audited CSV endpoint a person would use, so the delivered file and the on-screen export are identical.</p>
        </div>
        {canManage ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New schedule</Button> : null}
      </header>

      <section className="surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800"><CalendarClock className="h-4 w-4 text-slate-400" />Definitions</h2>
          <div className="flex items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{rows.length} configured</span><Button variant="ghost" size="icon" onClick={() => void load()}><RefreshCw className="h-4 w-4" /></Button></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3">Name</th><th className="px-4 py-3">Report</th><th className="px-4 py-3">Cadence</th><th className="px-4 py-3">Recipients</th><th className="px-4 py-3">Last run</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={7} className="p-12 text-center text-xs text-slate-400">Loading schedules…</td></tr>
                : rows.length === 0 ? <tr><td colSpan={7} className="p-12 text-center text-xs text-slate-400">No schedules yet. Define one to have a CSV waiting every morning or month-end.</td></tr>
                  : rows.map((row) => (
                    <tr key={row.id} className="text-xs">
                      <td className="px-5 py-3.5 font-semibold text-slate-700">{row.name}</td>
                      <td className="px-4 py-3.5">{REPORTS.find(([key]) => key === row.reportKey)?.[1] || row.reportKey}</td>
                      <td className="px-4 py-3.5">{row.cadence}</td>
                      <td className="px-4 py-3.5 text-[11px] text-slate-500">{row.recipients}</td>
                      <td className="px-4 py-3.5 text-[11px] text-slate-500">{row.lastRunAt ? `${new Date(row.lastRunAt).toISOString().slice(0, 16).replace("T", " ")} · ${row.lastRunRows ?? 0} rows · ${row.lastRunStatus}` : "Never"}</td>
                      <td className="px-4 py-3.5"><Badge tone={row.isActive ? "green" : "slate"}>{row.isActive ? "Active" : "Paused"}</Badge></td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-1.5">
                          <Button variant="outline" size="sm" loading={running === row.id} onClick={() => void runNow(row)}><Download className="h-3.5 w-3.5" />Run</Button>
                          {canManage ? <Button variant="ghost" size="sm" onClick={() => void toggle(row)}>{row.isActive ? "Pause" : "Resume"}</Button> : null}
                          {canManage ? <Button variant="ghost" size="icon" onClick={() => void remove(row)}><Trash2 className="h-3.5 w-3.5" /></Button> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-4 text-[11px] leading-5 text-slate-500">A production host runs <span className="font-mono">npm run reports:run-schedules</span> from Task Scheduler or cron; each due schedule writes a dated CSV into the exports folder. There is no in-process timer, so a restart never silently skips or double-runs a schedule.</p>

      <Modal open={open} onClose={() => setOpen(false)} title="New report schedule" description="Choose the report, how often it is due and who receives the file.">
        <form onSubmit={create} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="label">Schedule name</span><input className={field} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></label>
            <label><span className="label">Report</span><select className={field} value={form.reportKey} onChange={(event) => setForm((current) => ({ ...current, reportKey: event.target.value }))}>{REPORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label><span className="label">Cadence</span><select className={field} value={form.cadence} onChange={(event) => setForm((current) => ({ ...current, cadence: event.target.value }))}>{["DAILY", "WEEKLY", "MONTHLY"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="sm:col-span-2"><span className="label">Recipients</span><input className={field} placeholder="owner@company.local, accounts@company.local" value={form.recipients} onChange={(event) => setForm((current) => ({ ...current, recipients: event.target.value }))} required /></label>
          </div>
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={saving}>Save schedule</Button></div>
        </form>
      </Modal>
    </>
  );
}
