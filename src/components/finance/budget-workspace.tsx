"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CheckCircle2, Copy, Download, Lock, Plus, Printer, RefreshCw, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatMoney, titleCase } from "@/lib/utils";

type Row = Record<string, any>;
type Permissions = { create: boolean; approve: boolean; export: boolean };
type Props = { currency: string; currentUserId: string; permissions: Permissions };

const field = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const label = "text-xs font-semibold text-slate-700";

export function BudgetWorkspace({ currency, currentUserId, permissions }: Props) {
  const [budgets, setBudgets] = useState<Row[]>([]);
  const [lookups, setLookups] = useState<{ fiscalYears: Row[]; accounts: Row[]; periods: Row[]; branches: Row[]; departments: Row[]; costCenters: Row[] }>({ fiscalYears: [], accounts: [], periods: [], branches: [], departments: [], costCenters: [] });
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<Row | "new" | null>(null);
  const [varianceId, setVarianceId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState({ status: "", code: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/finance/budgets", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) { toast.error(body?.error?.message || "Budgets could not be loaded."); return; }
    setBudgets(body.data || []);
    setLookups(body.lookups || { fiscalYears: [], accounts: [], periods: [], branches: [], departments: [], costCenters: [] });
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => budgets.filter((budget) => (!filter.status || budget.status === filter.status) && (!filter.code || budget.code === filter.code)), [budgets, filter]);
  const codes = useMemo(() => [...new Set(budgets.map((budget) => budget.code))], [budgets]);
  const totals = useMemo(() => budgetLinesTotal(filtered), [filtered]);

  async function act(budget: Row, action: "submit" | "approve" | "close" | "revise") {
    setBusyId(budget.id);
    const response = await fetch(`/api/finance/budgets/${budget.id}/${action}`, { method: "POST", headers: { "content-type": "application/json" } });
    const body = await response.json().catch(() => null);
    setBusyId(null);
    if (!response.ok) return toast.error(body?.error?.message || `Budget could not be ${action}${action.endsWith("e") ? "d" : "ed"}.`);
    toast.success(action === "revise" ? `Version ${body.data.version} created as a draft.` : `Budget ${action}d.`);
    await load();
  }

  return (
    <>
      <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2"><span className="kicker">Planning and control</span><Badge tone="green">Versioned</Badge></div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">Budgets</h1>
          <p className="mt-1.5 text-sm text-slate-500">Versioned fiscal budgets by account and period. Only one approved version is live per budget code, revisions supersede the previous approval, and variance is measured against posted journals for the same branch, department and cost centre.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {permissions.create ? <Button onClick={() => setEditor("new")}><Plus className="h-4 w-4" />New budget version</Button> : null}
          {permissions.export ? <button type="button" onClick={() => window.location.assign("/api/finance/exports/budgets")} className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-700 hover:bg-blue-100"><Download className="h-4 w-4" />Export CSV</button> : null}
          <Button variant="outline" onClick={() => void load()} loading={loading}><RefreshCw className="h-4 w-4" />Refresh</Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[{ label: "Versions shown", value: filtered.length, raw: true }, { label: "Budgeted value", value: totals }, { label: "Approved versions", value: filtered.filter((budget) => budget.status === "APPROVED").length, raw: true }, { label: "Awaiting approval", value: filtered.filter((budget) => budget.status === "SUBMITTED").length, raw: true }].map((card) => (
          <div key={card.label} className="surface p-5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-700"><BarChart3 className="h-4 w-4" /></span><p className="mt-4 text-xl font-bold text-slate-900">{card.raw ? card.value : formatMoney(String(card.value), currency)}</p><p className="mt-1 text-xs font-semibold text-slate-600">{card.label}</p></div>
        ))}
      </div>

      <section className="surface mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <select className={`${field} max-w-52`} value={filter.code} onChange={(event) => setFilter((current) => ({ ...current, code: event.target.value }))}>
            <option value="">All budget codes</option>{codes.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
          <select className={`${field} max-w-44`} value={filter.status} onChange={(event) => setFilter((current) => ({ ...current, status: event.target.value }))}>
            <option value="">All statuses</option>{["DRAFT", "SUBMITTED", "APPROVED", "REVISED", "CLOSED"].map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
          </select>
          <span className="ml-auto text-[10px] text-slate-400">{filtered.length} version{filtered.length === 1 ? "" : "s"}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left">
            <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400">
              <tr><th className="px-5 py-3">Budget</th><th className="px-4 py-3">Fiscal year / scope</th><th className="px-4 py-3">Lines</th><th className="px-4 py-3 text-right">Budgeted</th><th className="px-4 py-3">Prepared / approved by</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={7} className="p-14 text-center text-xs text-slate-400">Loading budgets…</td></tr>
                : !filtered.length ? <tr><td colSpan={7} className="p-14 text-center text-xs text-slate-400">{budgets.length ? "No budget version matches this filter." : "No budget versions yet. Create a draft for the current fiscal year, add account and period lines, then submit it for independent approval."}</td></tr>
                  : filtered.map((budget) => {
                    const total = budget.lines.reduce((sum: number, line: Row) => sum + Number(line.amount), 0);
                    const scope = [budget.branch?.code, budget.department?.code, budget.costCenter?.code].filter(Boolean).join(" · ") || "Company-wide";
                    return (
                      <tr key={budget.id} className="text-xs">
                        <td className="px-5 py-3.5"><span className="font-bold text-slate-800">{budget.code}</span><span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">v{budget.version}</span><span className="mt-0.5 block text-[10px] text-slate-500">{budget.name}</span></td>
                        <td className="px-4 py-3.5 text-[10px] text-slate-500">{budget.fiscalYear?.code} · {scope}</td>
                        <td className="px-4 py-3.5 text-slate-600">{budget.lines.length}</td>
                        <td className="px-4 py-3.5 text-right font-semibold">{formatMoney(String(total), currency)}</td>
                        <td className="px-4 py-3.5 text-[10px] text-slate-500">{budget.createdBy?.fullName || "—"}<span className="mt-0.5 block text-slate-400">{budget.approvedBy?.fullName ? `Approved by ${budget.approvedBy.fullName}` : "Not approved"}</span></td>
                        <td className="px-4 py-3.5"><Badge tone={budget.status === "APPROVED" ? "green" : budget.status === "SUBMITTED" ? "amber" : budget.status === "CLOSED" ? "slate" : budget.status === "REVISED" ? "blue" : "slate"}>{titleCase(budget.status)}</Badge></td>
                        <td className="px-5 py-3.5">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <a href={`/finance/budgets/${budget.id}/print`} target="_blank" className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"><Printer className="h-3.5 w-3.5" />Print</a><Button size="sm" variant="ghost" onClick={() => setVarianceId(budget.id)}>Variance</Button>
                            {budget.status === "DRAFT" && permissions.create ? <Button size="sm" variant="outline" onClick={() => setEditor(budget)}>Edit</Button> : null}
                            {budget.status === "DRAFT" && permissions.create ? <Button size="sm" variant="secondary" loading={busyId === budget.id} onClick={() => void act(budget, "submit")}><Send className="h-3.5 w-3.5" />Submit</Button> : null}
                            {budget.status === "SUBMITTED" && permissions.approve ? (budget.createdById === currentUserId
                              ? <span className="self-center text-[9px] font-semibold text-amber-700" title="An independent approver must review this version.">Awaiting independent approval</span>
                              : <Button size="sm" loading={busyId === budget.id} onClick={() => void act(budget, "approve")}><CheckCircle2 className="h-3.5 w-3.5" />Approve</Button>) : null}
                            {["APPROVED", "REVISED"].includes(budget.status) && permissions.approve ? <Button size="sm" variant="outline" loading={busyId === budget.id} onClick={() => void act(budget, "close")}><Lock className="h-3.5 w-3.5" />Close</Button> : null}
                            {["APPROVED", "REVISED", "CLOSED"].includes(budget.status) && permissions.create ? <Button size="sm" variant="outline" loading={busyId === budget.id} onClick={() => void act(budget, "revise")}><Copy className="h-3.5 w-3.5" />New version</Button> : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </section>

      <BudgetEditor open={Boolean(editor)} row={editor === "new" ? null : editor} lookups={lookups} currency={currency} onClose={() => setEditor(null)} onSaved={async () => { setEditor(null); await load(); }} />
      {varianceId ? <VariancePanel id={varianceId} currency={currency} onClose={() => setVarianceId(null)} /> : null}
    </>
  );
}

function budgetLinesTotal(budgets: Row[]) {
  return budgets.reduce((sum, budget) => sum + budget.lines.reduce((lineSum: number, line: Row) => lineSum + Number(line.amount), 0), 0);
}

type BudgetLineDraft = { accountId: string; periodId: string; amount: string; notes: string };

function BudgetEditor({ open, row, lookups, currency, onClose, onSaved }: { open: boolean; row: Row | null; lookups: { fiscalYears: Row[]; accounts: Row[]; periods: Row[]; branches: Row[]; departments: Row[]; costCenters: Row[] }; currency: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Row>({});
  const [lines, setLines] = useState<BudgetLineDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const set = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));

  const currentYear = lookups.fiscalYears.find((year) => year.isCurrent) ?? lookups.fiscalYears[0];
  const yearId = form.fiscalYearId || currentYear?.id || "";
  const periods = lookups.periods.filter((period) => period.fiscalYearId === yearId);

  useEffect(() => {
    if (!open) return;
    setForm({
      code: row?.code || "", name: row?.name || "", fiscalYearId: row?.fiscalYearId || currentYear?.id || "",
      branchId: row?.branchId || "", departmentId: row?.departmentId || "", costCenterId: row?.costCenterId || "",
    });
    setLines((row?.lines || []).map((line: Row) => ({ accountId: line.accountId, periodId: line.periodId, amount: String(line.amount), notes: line.notes || "" })));
  }, [open, row, currentYear?.id]);

  const total = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const addLine = () => setLines((current) => [...current, { accountId: lookups.accounts[0]?.id || "", periodId: periods[0]?.id || "", amount: "0", notes: "" }]);
  const updateLine = (index: number, patch: Partial<BudgetLineDraft>) => setLines((current) => current.map((line, position) => (position === index ? { ...line, ...patch } : line)));

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const payload = { ...form, branchId: form.branchId || null, departmentId: form.departmentId || null, costCenterId: form.costCenterId || null, lines: lines.map((line) => ({ accountId: line.accountId, periodId: line.periodId, amount: line.amount || "0", notes: line.notes || null })) };
    const response = await fetch(row ? `/api/finance/budgets/${row.id}` : "/api/finance/budgets", { method: row ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) return toast.error(body?.error?.message || "Budget could not be saved.");
    toast.success(row ? "Draft budget updated." : "Draft budget version created.");
    await onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title={`${row ? `Edit draft · ${row.code} v${row.version}` : "New budget version"}`} description="Drafts carry no accounting effect. Submitting locks the lines until an independent approver approves or the version is superseded." size="lg">
      <form onSubmit={save} className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Budget code<input className={`${field} mt-1.5 uppercase`} value={form.code || ""} onChange={(event) => set("code", event.target.value)} maxLength={40} required disabled={Boolean(row)} /></label>
          <label className={label}>Name<input className={`${field} mt-1.5`} value={form.name || ""} onChange={(event) => set("name", event.target.value)} maxLength={160} required /></label>
          <label className={label}>Fiscal year<select className={`${field} mt-1.5`} value={yearId} onChange={(event) => set("fiscalYearId", event.target.value)} required>{lookups.fiscalYears.map((year) => <option key={year.id} value={year.id}>{year.code} · {year.name}</option>)}</select></label>
          <label className={label}>Branch<select className={`${field} mt-1.5`} value={form.branchId || ""} onChange={(event) => set("branchId", event.target.value)}><option value="">Company-wide</option>{lookups.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}</select></label>
          <label className={label}>Department<select className={`${field} mt-1.5`} value={form.departmentId || ""} onChange={(event) => set("departmentId", event.target.value)}><option value="">All departments</option>{lookups.departments.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
          <label className={label}>Cost centre<select className={`${field} mt-1.5`} value={form.costCenterId || ""} onChange={(event) => set("costCenterId", event.target.value)}><option value="">All cost centres</option>{lookups.costCenters.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        </div>

        <div className="rounded-lg border border-slate-100">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <p className="text-xs font-bold text-slate-800">Budget lines</p>
            <div className="flex items-center gap-2"><span className="text-[10px] text-slate-500">Total <strong className="text-slate-800">{formatMoney(String(total), currency)}</strong></span><Button type="button" size="sm" variant="outline" onClick={addLine}><Plus className="h-3.5 w-3.5" />Add line</Button></div>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="sticky top-0 bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400"><tr><th className="px-3 py-2">Account</th><th className="px-3 py-2">Period</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Note</th><th className="px-2 py-2" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line, index) => (
                  <tr key={index}>
                    <td className="px-3 py-1.5"><select className="h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" value={line.accountId} onChange={(event) => updateLine(index, { accountId: event.target.value })} required><option value="">Select account…</option>{lookups.accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></td>
                    <td className="px-3 py-1.5"><select className="h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" value={line.periodId} onChange={(event) => updateLine(index, { periodId: event.target.value })} required><option value="">Select period…</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}</select></td>
                    <td className="px-3 py-1.5"><input className="h-9 w-28 rounded-lg border border-slate-200 px-2 text-right text-xs font-mono" inputMode="decimal" value={line.amount} onChange={(event) => updateLine(index, { amount: event.target.value })} required /></td>
                    <td className="px-3 py-1.5"><input className="h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" value={line.notes} onChange={(event) => updateLine(index, { notes: event.target.value })} maxLength={500} placeholder="Optional" /></td>
                    <td className="px-2 py-1.5"><Button type="button" size="sm" variant="ghost" onClick={() => setLines((current) => current.filter((_, position) => position !== index))} aria-label="Remove line"><Trash2 className="h-3.5 w-3.5" /></Button></td>
                  </tr>
                ))}
                {!lines.length ? <tr><td colSpan={5} className="py-8 text-center text-[11px] text-slate-400">No lines yet. Add the accounts and periods this budget covers.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="ghost" onClick={onClose}>Close</Button><Button type="submit" loading={saving}>{row ? "Save draft" : "Create draft"}</Button></div>
      </form>
    </Modal>
  );
}

function VariancePanel({ id, currency, onClose }: { id: string; currency: string; onClose: () => void }) {
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      const response = await fetch(`/api/finance/budgets/${id}/variance`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!active) return;
      if (!response.ok) { setError(body?.error?.message || "Variance could not be loaded."); return; }
      setData(body.data);
    })();
    return () => { active = false; };
  }, [id]);

  return (
    <Modal open onClose={onClose} title={data ? `${data.budget.code} v${data.budget.version} · variance` : "Budget variance"} description="Posted actuals for the same branch, department and cost centre compared with the budgeted amount." size="lg">
      <div className="space-y-3 p-5">
        {error ? <p className="py-10 text-center text-xs text-rose-600">{error}</p> : null}
        {!data && !error ? <p className="py-10 text-center text-xs text-slate-400">Loading variance…</p> : null}
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {[{ label: "Budget", value: data.totals.budget }, { label: "Actual", value: data.totals.actual }, { label: "Variance", value: data.totals.variance }].map((item) => (
                <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{item.label}</p><p className="mt-1 text-sm font-bold text-slate-900">{formatMoney(String(item.value), currency)}</p></div>
              ))}
            </div>
            <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-100">
              <table className="w-full min-w-[680px] text-left">
                <thead className="sticky top-0 bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400"><tr><th className="px-3 py-2">Period</th><th className="px-3 py-2">Account</th><th className="px-3 py-2 text-right">Budget</th><th className="px-3 py-2 text-right">Actual</th><th className="px-3 py-2 text-right">Variance</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.rows.map((row: Row) => (
                    <tr key={`${row.accountId}:${row.periodId}`} className="text-[11px]">
                      <td className="px-3 py-2 text-slate-500">{row.periodName}</td>
                      <td className="px-3 py-2"><strong className="text-slate-800">{row.accountCode}</strong><span className="ml-1.5 text-slate-500">{row.accountName}</span></td>
                      <td className="px-3 py-2 text-right font-mono">{formatMoney(String(row.budget), currency)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatMoney(String(row.actual), currency)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${Number(row.variance) < 0 ? "text-rose-700" : "text-emerald-700"}`}>{formatMoney(String(row.variance), currency)}</td>
                    </tr>
                  ))}
                  {!data.rows.length ? <tr><td colSpan={5} className="py-10 text-center text-[11px] text-slate-400">This version has no budget lines to compare.</td></tr> : null}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-slate-400">Actuals include posted and reversed vouchers; revenue, liability and equity accounts are sign-normalised so a positive variance always means under-spend against budget.</p>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
