"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Calculator, ChevronRight, FileText, Layers, Plus, RefreshCw, ShieldCheck, Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

type Row = Record<string, any>;
type Permissions = { create: boolean; manageCategory: boolean; postDepreciation: boolean; dispose: boolean; export: boolean };
type Props = { currency: string; currentUserId: string; permissions: Permissions };

const field = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const label = "text-xs font-semibold text-slate-700";
const day = (offset = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + offset * 86_400_000));
const thisMonth = () => day().slice(0, 7);
const METHODS = [{ value: "STRAIGHT_LINE", label: "Straight line" }, { value: "DECLINING_BALANCE", label: "Declining balance" }, { value: "NONE", label: "No depreciation" }];

export function AssetWorkspace({ currency, currentUserId, permissions }: Props) {
  const [tab, setTab] = useState<"register" | "categories" | "depreciation">("register");
  const [assets, setAssets] = useState<Row[]>([]);
  const [categories, setCategories] = useState<Row[]>([]);
  const [lookups, setLookups] = useState<{ categories: Row[]; branches: Row[]; users: Row[]; accounts: Row[]; suppliers: Row[] }>({ categories: [], branches: [], users: [], accounts: [], suppliers: [] });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: "", search: "" });
  const [assetEditor, setAssetEditor] = useState<Row | "new" | null>(null);
  const [categoryEditor, setCategoryEditor] = useState<Row | "new" | null>(null);
  const [capitalizeId, setCapitalizeId] = useState<string | null>(null);
  const [disposeId, setDisposeId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [period, setPeriod] = useState(thisMonth());
  const [schedules, setSchedules] = useState<Row[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/finance/assets", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) return toast.error(body?.error?.message || "Fixed assets could not be loaded.");
    setAssets(body.data || []);
    setLookups(body.lookups || { categories: [], branches: [], users: [], accounts: [], suppliers: [] });
    setCategories(body.lookups?.categories || []);
  }, []);

  const loadSchedules = useCallback(async (value: string) => {
    setScheduleLoading(true);
    const response = await fetch(`/api/finance/assets/depreciation?period=${value}`, { cache: "no-store" });
    const body = await response.json().catch(() => null);
    setScheduleLoading(false);
    if (!response.ok) return toast.error(body?.error?.message || "Depreciation schedule could not be loaded.");
    setSchedules(body.data || []);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (tab === "depreciation") void loadSchedules(period); }, [tab, period, loadSchedules]);

  const filtered = useMemo(() => assets.filter((asset) => (!filters.status || asset.status === filters.status) && (!filters.search || `${asset.code} ${asset.name} ${asset.serialNumber || ""}`.toLowerCase().includes(filters.search.toLowerCase()))), [assets, filters]);
  const totals = useMemo(() => assets.reduce((result, asset) => {
    if (asset.status === "DISPOSED" || asset.status === "ARCHIVED") return result;
    return { cost: result.cost + Number(asset.purchaseCost) + Number(asset.additionalCost), accumulated: result.accumulated + Number(asset.accumulatedDepreciation), nbv: result.nbv + Number(asset.netBookValue) };
  }, { cost: 0, accumulated: 0, nbv: 0 }), [assets]);
  const plannedTotal = useMemo(() => schedules.filter((row) => row.status === "PLANNED").reduce((sum, row) => sum + Number(row.depreciationAmount), 0), [schedules]);
  const plannedSchedules = useMemo(() => schedules.filter((row) => row.status === "PLANNED"), [schedules]);
  const generatedByMe = plannedSchedules.some((row) => row.generatedById === currentUserId);
  const postedTotal = useMemo(() => schedules.filter((row) => row.status === "POSTED").reduce((sum, row) => sum + Number(row.depreciationAmount), 0), [schedules]);

  async function generate() {
    setBusy(true);
    const response = await fetch("/api/finance/assets/depreciation/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ periodDate: `${period}-01` }) });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) return toast.error(body?.error?.message || "Depreciation could not be generated.");
    toast.success(`Generated ${body.data.created} schedule row${body.data.created === 1 ? "" : "s"}${body.data.skipped ? ` · ${body.data.skipped} skipped` : ""}.`);
    await loadSchedules(period);
  }

  async function post() {
    setBusy(true);
    const response = await fetch("/api/finance/assets/depreciation/post", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ periodDate: `${period}-01` }) });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) return toast.error(body?.error?.message || "Depreciation could not be posted.");
    toast.success(`Posted ${body.data.posted} depreciation journal${body.data.posted === 1 ? "" : "s"}.`);
    await Promise.all([loadSchedules(period), load()]);
  }

  return (
    <>
      <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2"><span className="kicker">Non-current assets</span><Badge tone="green">Posted ledger</Badge></div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">Fixed assets</h1>
          <p className="mt-1.5 text-sm text-slate-500">Category masters map four ledger accounts. Acquisition is capitalized as a posted journal, depreciation generates monthly schedules before posting, and disposal retires cost with gain or loss.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tab === "register" && permissions.create ? <Button onClick={() => setAssetEditor("new")}><Plus className="h-4 w-4" />New draft asset</Button> : null}
          {tab === "categories" && permissions.manageCategory ? <Button onClick={() => setCategoryEditor("new")}><Plus className="h-4 w-4" />New category</Button> : null}
          <a href="/finance/assets/print" target="_blank" className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><Printer className="h-4 w-4" />Print register</a>
          {permissions.export ? <button type="button" onClick={() => window.location.assign("/api/finance/exports/assets")} className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-700 hover:bg-blue-100"><Download className="h-4 w-4" />Export CSV</button> : null}
          <Button variant="outline" onClick={() => { void load(); if (tab === "depreciation") void loadSchedules(period); }} loading={loading}><RefreshCw className="h-4 w-4" />Refresh</Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[{ label: "Live asset cost", value: totals.cost, Icon: Building2 }, { label: "Accumulated depreciation", value: totals.accumulated, Icon: Calculator }, { label: "Net book value", value: totals.nbv, Icon: ShieldCheck }, { label: "Planned depreciation · " + period, value: plannedTotal, Icon: FileText }].map(({ label: text, value, Icon }) => (
          <div key={text} className="surface p-5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-4 w-4" /></span><p className="mt-4 text-xl font-bold text-slate-900">{formatMoney(String(value), currency)}</p><p className="mt-1 text-xs font-semibold text-slate-600">{text}</p></div>
        ))}
      </div>

      <div className="surface mb-5 mt-5 flex items-center gap-2 p-2">
        {(["register", "categories", "depreciation"] as const).map((item) => (
          <button key={item} onClick={() => setTab(item)} className={`rounded-lg px-4 py-2 text-xs font-bold ${tab === item ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
            {item === "register" ? `Register (${assets.length})` : item === "categories" ? `Categories (${categories.length})` : "Depreciation"}
          </button>
        ))}
      </div>

      {tab === "register" ? (
        <section className="surface overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            <input className={`${field} max-w-64`} placeholder="Search code, name or serial" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
            <select className={`${field} max-w-44`} value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="">All statuses</option>{["DRAFT", "ACTIVE", "FULLY_DEPRECIATED", "IMPAIRED", "HELD_FOR_SALE", "DISPOSED", "ARCHIVED"].map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
            </select>
            <span className="ml-auto text-[10px] text-slate-400">{filtered.length} asset{filtered.length === 1 ? "" : "s"}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left">
              <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                <tr><th className="px-5 py-3">Asset</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Assignment</th><th className="px-4 py-3">Depreciation</th><th className="px-4 py-3 text-right">Cost</th><th className="px-4 py-3 text-right">Net book value</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? <tr><td colSpan={8} className="p-14 text-center text-xs text-slate-400">Loading fixed assets…</td></tr>
                  : !filtered.length ? <tr><td colSpan={8} className="p-14 text-center text-xs text-slate-400">{assets.length ? "No asset matches this filter." : "No fixed assets recorded yet. Create a draft asset, then capitalize it to post the acquisition journal."}</td></tr>
                    : filtered.map((asset) => (
                      <tr key={asset.id} className="text-xs">
                        <td className="px-5 py-3.5"><span className="font-bold text-slate-800">{asset.code}</span><span className="mt-0.5 block text-[10px] text-slate-500">{asset.name}</span><span className="text-[9px] text-slate-400">{asset.serialNumber || "No serial"}</span></td>
                        <td className="px-4 py-3.5 text-slate-600">{asset.category?.code}<span className="mt-0.5 block text-[9px] text-slate-400">{asset.category?.name}</span></td>
                        <td className="px-4 py-3.5 text-[10px] text-slate-500">{asset.branch?.code}{asset.assetLocation ? ` · ${asset.assetLocation}` : ""}{asset.custodian ? <span className="mt-0.5 block">{asset.custodian.fullName}</span> : null}</td>
                        <td className="px-4 py-3.5 text-[10px] text-slate-500">{titleCase(asset.depreciationMethod)}{asset.usefulLifeMonths ? ` · ${asset.usefulLifeMonths} mo` : ""}{asset.depreciationRate ? ` · ${Number(asset.depreciationRate)}%` : ""}{(asset.schedules || []).length ? <span className="mt-0.5 block text-amber-700">{asset.schedules.length} planned</span> : null}</td>
                        <td className="px-4 py-3.5 text-right font-semibold">{formatMoney(String(Number(asset.purchaseCost) + Number(asset.additionalCost)), currency)}</td>
                        <td className="px-4 py-3.5 text-right font-semibold">{formatMoney(String(asset.netBookValue), currency)}</td>
                        <td className="px-4 py-3.5"><Badge tone={asset.status === "ACTIVE" ? "green" : asset.status === "DRAFT" ? "blue" : asset.status === "DISPOSED" ? "red" : asset.status === "FULLY_DEPRECIATED" ? "amber" : "slate"}>{titleCase(asset.status)}</Badge></td>
                        <td className="px-5 py-3.5">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="ghost" onClick={() => setDetailId(asset.id)}>Open</Button>
                            {asset.status === "DRAFT" && permissions.create ? <Button size="sm" variant="outline" onClick={() => setAssetEditor(asset)}>Edit</Button> : null}
                            {asset.status === "DRAFT" && permissions.create ? (asset.preparedById === currentUserId
                              ? <span className="self-center text-[9px] font-semibold text-amber-700" title="An independent authorized user must capitalize this draft.">Awaiting independent posting</span>
                              : <Button size="sm" onClick={() => setCapitalizeId(asset.id)}>Capitalize</Button>) : null}
                            {["ACTIVE", "FULLY_DEPRECIATED", "IMPAIRED", "HELD_FOR_SALE"].includes(asset.status) && permissions.dispose && !asset.disposal ? <Button size="sm" variant="outline" onClick={() => setDisposeId(asset.id)}>Dispose</Button> : null}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "categories" ? (
        <section className="surface overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold text-slate-900">Asset categories</h2><p className="mt-1 text-[11px] text-slate-400">Each category maps a cost account, accumulated depreciation account, depreciation expense account and disposal gain/loss account. Mapping locks once an asset uses the category.</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                <tr><th className="px-5 py-3">Category</th><th className="px-4 py-3">Policy</th><th className="px-4 py-3">Cost account</th><th className="px-4 py-3">Accumulated</th><th className="px-4 py-3">Expense</th><th className="px-4 py-3">Disposal</th><th className="px-4 py-3">Assets</th><th className="px-5 py-3 text-right">Action</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!categories.length ? <tr><td colSpan={8} className="p-14 text-center text-xs text-slate-400">No asset categories configured. Add a category with its four ledger accounts before recording assets.</td></tr>
                  : categories.map((category) => (
                    <tr key={category.id} className="text-xs">
                      <td className="px-5 py-3.5"><span className="font-bold text-slate-800">{category.code}</span><span className="mt-0.5 block text-[10px] text-slate-500">{category.name}</span></td>
                      <td className="px-4 py-3.5 text-[10px] text-slate-500">{category.depreciable ? `${titleCase(category.defaultMethod)}${category.defaultUsefulLifeMonths ? ` · ${category.defaultUsefulLifeMonths} mo` : ""}${category.defaultRate ? ` · ${Number(category.defaultRate)}%` : ""}` : "Non-depreciable"}</td>
                      <td className="px-4 py-3.5 text-[10px] text-slate-500">{category.assetAccount?.code}</td>
                      <td className="px-4 py-3.5 text-[10px] text-slate-500">{category.accumulatedAccount?.code}</td>
                      <td className="px-4 py-3.5 text-[10px] text-slate-500">{category.expenseAccount?.code}</td>
                      <td className="px-4 py-3.5 text-[10px] text-slate-500">{category.disposalAccount?.code}</td>
                      <td className="px-4 py-3.5"><Badge tone="slate">{category._count?.assets ?? 0}</Badge></td>
                      <td className="px-5 py-3.5 text-right">{permissions.manageCategory ? <Button size="sm" variant="outline" onClick={() => setCategoryEditor(category)}>Edit</Button> : <span className="text-[10px] text-slate-400">View only</span>}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "depreciation" ? (
        <section className="surface overflow-hidden">
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-4">
            <label className={`${label} flex flex-col gap-1.5`}>Depreciation month<input type="month" className={`${field} max-w-48`} value={period} onChange={(event) => setPeriod(event.target.value || thisMonth())} /></label>
            {permissions.create ? <Button variant="outline" onClick={() => void generate()} loading={busy}>Generate schedules</Button> : null}
            {permissions.postDepreciation ? <Button onClick={() => void post()} loading={busy} disabled={!plannedSchedules.length || generatedByMe} title={generatedByMe ? "You generated these schedules; an independent authorized user must post them." : undefined}>Post depreciation</Button> : null}
            <div className="ml-auto text-right text-[10px] text-slate-500">Planned <strong className="text-slate-800">{formatMoney(String(plannedTotal), currency)}</strong> · Posted <strong className="text-slate-800">{formatMoney(String(postedTotal), currency)}</strong>{generatedByMe ? <span className="mt-1 block font-semibold text-amber-700">Generated by you · an independent user must post</span> : null}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                <tr><th className="px-5 py-3">Asset</th><th className="px-4 py-3">Method</th><th className="px-4 py-3 text-right">Opening NBV</th><th className="px-4 py-3 text-right">Depreciation</th><th className="px-4 py-3 text-right">Closing NBV</th><th className="px-4 py-3">Status</th><th className="px-5 py-3">Voucher</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scheduleLoading ? <tr><td colSpan={7} className="p-14 text-center text-xs text-slate-400">Loading schedule…</td></tr>
                  : !schedules.length ? <tr><td colSpan={7} className="p-14 text-center text-xs text-slate-400">No depreciation schedule for {period}. Generate schedules for capitalized depreciable assets, then post them.</td></tr>
                    : schedules.map((row) => (
                      <tr key={row.id} className="text-xs">
                        <td className="px-5 py-3.5"><span className="font-bold text-slate-800">{row.asset?.code}</span><span className="mt-0.5 block text-[10px] text-slate-500">{row.asset?.name} · {row.asset?.branch?.code}</span></td>
                        <td className="px-4 py-3.5 text-[10px] text-slate-500">{titleCase(row.asset?.depreciationMethod || "NONE")}</td>
                        <td className="px-4 py-3.5 text-right font-mono text-[11px]">{formatMoney(String(row.openingNetBookValue), currency)}</td>
                        <td className="px-4 py-3.5 text-right font-semibold">{formatMoney(String(row.depreciationAmount), currency)}</td>
                        <td className="px-4 py-3.5 text-right font-mono text-[11px]">{formatMoney(String(row.closingNetBookValue), currency)}</td>
                        <td className="px-4 py-3.5"><Badge tone={row.status === "POSTED" ? "green" : "amber"}>{titleCase(row.status)}</Badge></td>
                        <td className="px-5 py-3.5">{row.journalEntry ? <a href={`/finance/journals/${row.journalEntry.id}`} className="font-semibold text-blue-700 hover:underline">{row.journalEntry.voucherNumber}</a> : <span className="text-slate-400">—</span>}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <AssetEditor open={Boolean(assetEditor)} row={assetEditor === "new" ? null : assetEditor} lookups={lookups} currency={currency} onClose={() => setAssetEditor(null)} onSaved={async () => { setAssetEditor(null); await load(); }} />
      <CategoryEditor open={Boolean(categoryEditor)} row={categoryEditor === "new" ? null : categoryEditor} accounts={lookups.accounts} onClose={() => setCategoryEditor(null)} onSaved={async () => { setCategoryEditor(null); await load(); }} />
      {capitalizeId ? <CapitalizeDialog assetId={capitalizeId} accounts={lookups.accounts} onClose={() => setCapitalizeId(null)} onSaved={async () => { setCapitalizeId(null); await load(); }} /> : null}
      {disposeId ? <DisposeDialog assetId={disposeId} accounts={lookups.accounts} currency={currency} onClose={() => setDisposeId(null)} onSaved={async () => { setDisposeId(null); await load(); }} /> : null}
      {detailId ? <AssetDetail assetId={detailId} currency={currency} onClose={() => setDetailId(null)} /> : null}
    </>
  );
}

function AssetEditor({ open, row, lookups, currency, onClose, onSaved }: { open: boolean; row: Row | null; lookups: { categories: Row[]; branches: Row[]; users: Row[]; suppliers: Row[] }; currency: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Row>({});
  const [saving, setSaving] = useState(false);
  const set = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!open) return;
    setForm({
      categoryId: row?.categoryId || lookups.categories[0]?.id || "", branchId: row?.branchId || lookups.branches[0]?.id || "",
      code: row?.code || "", name: row?.name || "", description: row?.description || "", serialNumber: row?.serialNumber || "",
      supplierId: row?.supplierId || "", custodianId: row?.custodianId || "", assetLocation: row?.assetLocation || "",
      purchaseDate: row?.purchaseDate?.slice(0, 10) || day(), capitalizationDate: row?.capitalizationDate?.slice(0, 10) || day(),
      depreciationStartDate: row?.depreciationStartDate?.slice(0, 10) || "",
      purchaseCost: row?.purchaseCost ? String(row.purchaseCost) : "", additionalCost: row?.additionalCost ? String(row.additionalCost) : "0",
      residualValue: row?.residualValue ? String(row.residualValue) : "0",
      usefulLifeMonths: row?.usefulLifeMonths ? String(row.usefulLifeMonths) : "", depreciationMethod: row?.depreciationMethod || "STRAIGHT_LINE",
      depreciationRate: row?.depreciationRate ? String(Number(row.depreciationRate)) : "",
    });
  }, [open, row, lookups]);

  const category = lookups.categories.find((item) => item.id === form.categoryId);
  const cost = Number(form.purchaseCost || 0) + Number(form.additionalCost || 0);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      supplierId: form.supplierId || null, custodianId: form.custodianId || null, depreciationStartDate: form.depreciationStartDate || null,
      usefulLifeMonths: form.usefulLifeMonths ? Number(form.usefulLifeMonths) : null, depreciationRate: form.depreciationRate || null,
    };
    const response = await fetch(row ? `/api/finance/assets/${row.id}` : "/api/finance/assets", { method: row ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) return toast.error(body?.error?.message || "Fixed asset could not be saved.");
    toast.success(row ? "Draft asset updated." : "Draft asset created. Capitalize it to post the acquisition.");
    await onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title={`${row ? "Edit" : "New"} fixed asset`} description="Drafts never post to the ledger. Capitalization posts the acquisition journal and starts depreciation." size="lg">
      <form onSubmit={save} className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Asset code<input className={`${field} mt-1.5 uppercase`} value={form.code || ""} onChange={(event) => set("code", event.target.value)} maxLength={40} required /></label>
          <label className={label}>Asset name<input className={`${field} mt-1.5`} value={form.name || ""} onChange={(event) => set("name", event.target.value)} maxLength={180} required /></label>
          <label className={label}>Category<select className={`${field} mt-1.5`} value={form.categoryId || ""} onChange={(event) => set("categoryId", event.target.value)} required><option value="">Select category…</option>{lookups.categories.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
          <label className={label}>Branch<select className={`${field} mt-1.5`} value={form.branchId || ""} onChange={(event) => set("branchId", event.target.value)} required>{lookups.branches.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
          <label className={label}>Serial number<input className={`${field} mt-1.5`} value={form.serialNumber || ""} onChange={(event) => set("serialNumber", event.target.value)} maxLength={120} /></label>
          <label className={label}>Location<input className={`${field} mt-1.5`} value={form.assetLocation || ""} onChange={(event) => set("assetLocation", event.target.value)} maxLength={180} placeholder="Showroom, safe room, office" /></label>
          <label className={label}>Supplier<select className={`${field} mt-1.5`} value={form.supplierId || ""} onChange={(event) => set("supplierId", event.target.value)}><option value="">No supplier</option>{lookups.suppliers.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
          <label className={label}>Custodian<select className={`${field} mt-1.5`} value={form.custodianId || ""} onChange={(event) => set("custodianId", event.target.value)}><option value="">Unassigned</option>{lookups.users.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select></label>
          <label className={label}>Purchase date<input type="date" className={`${field} mt-1.5`} value={form.purchaseDate || ""} onChange={(event) => set("purchaseDate", event.target.value)} required /></label>
          <label className={label}>Capitalization date<input type="date" className={`${field} mt-1.5`} value={form.capitalizationDate || ""} onChange={(event) => set("capitalizationDate", event.target.value)} required /></label>
          <label className={label}>Depreciation start<input type="date" className={`${field} mt-1.5`} value={form.depreciationStartDate || ""} onChange={(event) => set("depreciationStartDate", event.target.value)} /><span className="mt-1 block text-[10px] font-normal text-slate-400">Defaults to the month end of capitalization.</span></label>
          <label className={label}>Depreciation method<select className={`${field} mt-1.5`} value={form.depreciationMethod || "STRAIGHT_LINE"} onChange={(event) => set("depreciationMethod", event.target.value)}>{METHODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className={label}>Purchase cost<input className={`${field} mt-1.5 font-mono`} inputMode="decimal" value={form.purchaseCost || ""} onChange={(event) => set("purchaseCost", event.target.value)} required placeholder="0.00" /></label>
          <label className={label}>Additional cost<input className={`${field} mt-1.5 font-mono`} inputMode="decimal" value={form.additionalCost || "0"} onChange={(event) => set("additionalCost", event.target.value)} /></label>
          <label className={label}>Residual value<input className={`${field} mt-1.5 font-mono`} inputMode="decimal" value={form.residualValue || "0"} onChange={(event) => set("residualValue", event.target.value)} /></label>
          <label className={label}>Useful life (months)<input className={`${field} mt-1.5`} inputMode="numeric" value={form.usefulLifeMonths || ""} onChange={(event) => set("usefulLifeMonths", event.target.value.replace(/\D/g, ""))} placeholder={category?.defaultUsefulLifeMonths ? String(category.defaultUsefulLifeMonths) : "e.g. 60"} /></label>
          <label className={label}>Annual rate % (declining)<input className={`${field} mt-1.5`} inputMode="decimal" value={form.depreciationRate || ""} onChange={(event) => set("depreciationRate", event.target.value)} placeholder={category?.defaultRate ? String(Number(category.defaultRate)) : "e.g. 25"} /></label>
          <label className={`${label} sm:col-span-2`}>Description<textarea className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={form.description || ""} onChange={(event) => set("description", event.target.value)} maxLength={2000} /></label>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500"><span>Total cost <strong className="text-slate-800">{formatMoney(String(cost), currency)}</strong></span><span>Residual {formatMoney(String(Number(form.residualValue || 0)), currency)}</span><span className="truncate">{category ? `${category.code} · ${category.depreciable ? "Depreciable" : "Non-depreciable"}` : "Select a category"}</span></div>
        <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="ghost" onClick={onClose}>Close</Button><Button type="submit" loading={saving}>{row ? "Save draft" : "Create draft"}</Button></div>
      </form>
    </Modal>
  );
}

function CategoryEditor({ open, row, accounts, onClose, onSaved }: { open: boolean; row: Row | null; accounts: Row[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Row>({});
  const [saving, setSaving] = useState(false);
  const set = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!open) return;
    setForm({
      code: row?.code || "", name: row?.name || "", depreciable: row?.depreciable ?? true,
      defaultUsefulLifeMonths: row?.defaultUsefulLifeMonths ? String(row.defaultUsefulLifeMonths) : "", defaultMethod: row?.defaultMethod || "STRAIGHT_LINE",
      defaultRate: row?.defaultRate ? String(Number(row.defaultRate)) : "",
      assetAccountId: row?.assetAccountId || "", accumulatedAccountId: row?.accumulatedAccountId || "", expenseAccountId: row?.expenseAccountId || "", disposalAccountId: row?.disposalAccountId || "",
      isActive: row?.isActive ?? true, used: row?._count?.assets ?? 0,
    });
  }, [open, row]);

  const locked = Number(form.used || 0) > 0;
  const options = (filter: (account: Row) => boolean) => accounts.filter(filter).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const payload = {
      code: form.code, name: form.name, depreciable: Boolean(form.depreciable),
      defaultUsefulLifeMonths: form.defaultUsefulLifeMonths ? Number(form.defaultUsefulLifeMonths) : null,
      defaultMethod: form.depreciable ? form.defaultMethod : "NONE", defaultRate: form.defaultRate || null,
      assetAccountId: form.assetAccountId, accumulatedAccountId: form.accumulatedAccountId, expenseAccountId: form.expenseAccountId, disposalAccountId: form.disposalAccountId,
      isActive: Boolean(form.isActive),
    };
    const response = await fetch(row ? `/api/finance/asset-categories/${row.id}` : "/api/finance/asset-categories", { method: row ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) return toast.error(body?.error?.message || "Asset category could not be saved.");
    toast.success("Asset category saved.");
    await onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title={`${row ? "Edit" : "New"} asset category`} description="Four distinct ledger accounts: asset cost, accumulated depreciation, depreciation expense, disposal gain or loss." size="lg">
      <form onSubmit={save} className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Code<input className={`${field} mt-1.5 uppercase`} value={form.code || ""} onChange={(event) => set("code", event.target.value)} maxLength={30} required /></label>
          <label className={label}>Name<input className={`${field} mt-1.5`} value={form.name || ""} onChange={(event) => set("name", event.target.value)} maxLength={120} required /></label>
          <label className={`${label} sm:col-span-2`}>Asset cost account<select className={`${field} mt-1.5`} value={form.assetAccountId || ""} onChange={(event) => set("assetAccountId", event.target.value)} disabled={locked} required><option value="">Select asset account…</option>{options((account) => account.accountClass === "ASSET")}</select></label>
          <label className={label}>Accumulated depreciation<select className={`${field} mt-1.5`} value={form.accumulatedAccountId || ""} onChange={(event) => set("accumulatedAccountId", event.target.value)} disabled={locked} required><option value="">Select contra asset account…</option>{options((account) => account.accountClass === "ASSET")}</select></label>
          <label className={label}>Depreciation expense<select className={`${field} mt-1.5`} value={form.expenseAccountId || ""} onChange={(event) => set("expenseAccountId", event.target.value)} disabled={locked} required><option value="">Select expense account…</option>{options((account) => account.accountClass === "EXPENSE" || account.accountClass === "COGS")}</select></label>
          <label className={label}>Disposal gain / loss<select className={`${field} mt-1.5`} value={form.disposalAccountId || ""} onChange={(event) => set("disposalAccountId", event.target.value)} disabled={locked} required><option value="">Select gain or loss account…</option>{options((account) => account.accountClass === "REVENUE" || account.accountClass === "EXPENSE")}</select></label>
          <label className={label}>Default method<select className={`${field} mt-1.5`} value={form.defaultMethod || "STRAIGHT_LINE"} onChange={(event) => set("defaultMethod", event.target.value)} disabled={!form.depreciable}>{METHODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className={label}>Default useful life (months)<input className={`${field} mt-1.5`} inputMode="numeric" value={form.defaultUsefulLifeMonths || ""} onChange={(event) => set("defaultUsefulLifeMonths", event.target.value.replace(/\D/g, ""))} /></label>
          <label className={label}>Default annual rate %<input className={`${field} mt-1.5`} inputMode="decimal" value={form.defaultRate || ""} onChange={(event) => set("defaultRate", event.target.value)} /></label>
        </div>
        {locked ? <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800"><ShieldCheck className="h-3.5 w-3.5" />{form.used} asset{Number(form.used) === 1 ? "" : "s"} use this category, so the ledger mapping is locked. Policy defaults and the active flag can still change.</p> : null}
        <label className="flex items-center gap-2 rounded-lg border p-3 text-xs font-semibold"><input type="checkbox" checked={Boolean(form.depreciable)} onChange={(event) => set("depreciable", event.target.checked)} />Depreciable category</label>
        <label className="flex items-center gap-2 rounded-lg border p-3 text-xs font-semibold"><input type="checkbox" checked={Boolean(form.isActive)} onChange={(event) => set("isActive", event.target.checked)} />Active and selectable<span className="ml-auto text-[10px] font-normal text-slate-400">Inactive categories cannot receive new assets.</span></label>
        <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="ghost" onClick={onClose}>Close</Button><Button type="submit" loading={saving}>Save category</Button></div>
      </form>
    </Modal>
  );
}

function CapitalizeDialog({ assetId, accounts, onClose, onSaved }: { assetId: string; accounts: Row[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [settlementAccountId, setSettlementAccountId] = useState("");
  const [postingDate, setPostingDate] = useState(day());
  const [saving, setSaving] = useState(false);

  useEffect(() => { setSettlementAccountId(""); setPostingDate(day()); }, [assetId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch(`/api/finance/assets/${assetId}/capitalize`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ settlementAccountId, postingDate }) });
    const body = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) return toast.error(body?.error?.message || "Asset could not be capitalized.");
    toast.success(`Asset capitalized through voucher ${body.data.journal.voucherNumber}.`);
    await onSaved();
  }

  return (
    <Modal open onClose={onClose} title="Capitalize fixed asset" description="Posts Dr asset cost / Cr settlement account as an immediately posted system journal." size="md">
      <form onSubmit={submit} className="space-y-4 p-5">
        <label className={label}>Settlement account<select className={`${field} mt-1.5`} value={settlementAccountId} onChange={(event) => setSettlementAccountId(event.target.value)} required><option value="">Select cash, bank or payable account…</option>{accounts.filter((account) => ["ASSET", "LIABILITY"].includes(account.accountClass)).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
        <label className={label}>Posting date<input type="date" className={`${field} mt-1.5`} value={postingDate} onChange={(event) => setPostingDate(event.target.value)} required /></label>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">The asset cost account and settlement account must differ. The open accounting period covering the posting date is required.</p>
        <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Capitalize and post</Button></div>
      </form>
    </Modal>
  );
}

function DisposeDialog({ assetId, accounts, currency, onClose, onSaved }: { assetId: string; accounts: Row[]; currency: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Row>({ disposalDate: day(), method: "SALE", proceeds: "0", proceedsAccountId: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const set = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch(`/api/finance/assets/${assetId}/dispose`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...form, proceedsAccountId: Number(form.proceeds) > 0 ? form.proceedsAccountId : null }),
    });
    const body = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) return toast.error(body?.error?.message || "Asset could not be disposed.");
    toast.success(`Disposal posted through ${body.data.journal.voucherNumber}. Gain/(loss) ${formatMoney(String(body.data.gainOrLoss), currency)}.`);
    await onSaved();
  }

  return (
    <Modal open onClose={onClose} title="Dispose fixed asset" description="Reverses cost and accumulated depreciation, records proceeds, and posts the gain or loss. Planned depreciation must be cleared first." size="md">
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Disposal date<input type="date" className={`${field} mt-1.5`} value={form.disposalDate} onChange={(event) => set("disposalDate", event.target.value)} required /></label>
          <label className={label}>Method<select className={`${field} mt-1.5`} value={form.method} onChange={(event) => set("method", event.target.value)}>{["SALE", "SCRAP", "WRITE_OFF", "TRADE_IN", "DONATION"].map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>
          <label className={label}>Proceeds<input className={`${field} mt-1.5 font-mono`} inputMode="decimal" value={form.proceeds} onChange={(event) => set("proceeds", event.target.value)} /></label>
          <label className={label}>Proceeds account<select className={`${field} mt-1.5`} value={form.proceedsAccountId} onChange={(event) => set("proceedsAccountId", event.target.value)} disabled={Number(form.proceeds) <= 0} required={Number(form.proceeds) > 0}><option value="">{Number(form.proceeds) > 0 ? "Select receiving account…" : "No proceeds"}</option>{accounts.filter((account) => account.accountClass === "ASSET").map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
        </div>
        <label className={label}>Reason<textarea className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={form.reason} onChange={(event) => set("reason", event.target.value)} minLength={10} maxLength={2000} required placeholder="Explain the disposal and approval basis" /></label>
        <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="danger" loading={saving}>Post disposal</Button></div>
      </form>
    </Modal>
  );
}

function AssetDetail({ assetId, currency, onClose }: { assetId: string; currency: string; onClose: () => void }) {
  const [asset, setAsset] = useState<Row | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      const response = await fetch(`/api/finance/assets/${assetId}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (active && response.ok) setAsset(body.data);
    })();
    return () => { active = false; };
  }, [assetId]);

  return (
    <Modal open onClose={onClose} title={asset ? `${asset.code} · ${asset.name}` : "Fixed asset"} description={asset ? `${asset.category?.code} · ${asset.branch?.code}${asset.assetLocation ? ` · ${asset.assetLocation}` : ""}` : "Loading asset record…"} size="lg">
      <div className="space-y-4 p-5">
        {!asset ? <p className="py-10 text-center text-xs text-slate-400">Loading asset…</p> : (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              {[{ label: "Cost", value: Number(asset.purchaseCost) + Number(asset.additionalCost) }, { label: "Accumulated", value: Number(asset.accumulatedDepreciation) }, { label: "Net book value", value: Number(asset.netBookValue) }, { label: "Residual", value: Number(asset.residualValue) }].map((item) => (
                <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{item.label}</p><p className="mt-1 text-sm font-bold text-slate-900">{formatMoney(String(item.value), currency)}</p></div>
              ))}
            </div>
            <div className="grid gap-2 text-[11px] text-slate-600 sm:grid-cols-2">
              <p>Status <Badge tone={asset.status === "ACTIVE" ? "green" : asset.status === "DISPOSED" ? "red" : "slate"}>{titleCase(asset.status)}</Badge></p>
              <p>Method <strong>{titleCase(asset.depreciationMethod)}</strong>{asset.usefulLifeMonths ? ` · ${asset.usefulLifeMonths} months` : ""}{asset.depreciationRate ? ` · ${Number(asset.depreciationRate)}%` : ""}</p>
              <p>Purchased <strong>{formatDate(asset.purchaseDate)}</strong></p>
              <p>Capitalized <strong>{formatDate(asset.capitalizationDate)}</strong></p>
              <p>Depreciation start <strong>{asset.depreciationStartDate ? formatDate(asset.depreciationStartDate) : "Not started"}</strong></p>
              <p>Custodian <strong>{asset.custodian?.fullName || "Unassigned"}</strong></p>
              <p>Serial <strong>{asset.serialNumber || "—"}</strong></p>
              <p>Supplier <strong>{asset.supplier ? `${asset.supplier.code} · ${asset.supplier.name}` : "—"}</strong></p>
            </div>
            {asset.disposal ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-800"><p className="font-bold">Disposed {formatDate(asset.disposal.disposalDate)} · {titleCase(asset.disposal.disposalMethod)}</p><p className="mt-1">Proceeds {formatMoney(String(asset.disposal.proceeds), currency)} · Gain/(loss) {formatMoney(String(asset.disposal.gainOrLoss), currency)}</p><p className="mt-1">{asset.disposal.reason}</p>{asset.disposal.journalEntry ? <a href={`/finance/journals/${asset.disposal.journalEntry.id}`} className="mt-1 inline-block font-semibold underline">{asset.disposal.journalEntry.voucherNumber}</a> : null}</div> : null}
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-800"><Layers className="h-3.5 w-3.5" />Depreciation schedule</h3>
              <div className="max-h-56 overflow-auto rounded-lg border border-slate-100">
                <table className="w-full min-w-[520px] text-left">
                  <thead className="sticky top-0 bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400"><tr><th className="px-3 py-2">Period</th><th className="px-3 py-2 text-right">Opening</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Closing</th><th className="px-3 py-2">Status</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {(asset.schedules || []).map((row: Row) => <tr key={row.id} className="text-[11px]"><td className="px-3 py-2">{formatDate(row.periodDate)}</td><td className="px-3 py-2 text-right font-mono">{formatMoney(String(row.openingNetBookValue), currency)}</td><td className="px-3 py-2 text-right font-semibold">{formatMoney(String(row.depreciationAmount), currency)}</td><td className="px-3 py-2 text-right font-mono">{formatMoney(String(row.closingNetBookValue), currency)}</td><td className="px-3 py-2"><Badge tone={row.status === "POSTED" ? "green" : "amber"}>{titleCase(row.status)}</Badge></td></tr>)}
                    {!(asset.schedules || []).length ? <tr><td colSpan={5} className="py-8 text-center text-[11px] text-slate-400">No depreciation has been generated for this asset.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-800"><ChevronRight className="h-3.5 w-3.5" />Asset ledger history</h3>
              <div className="space-y-1.5">
                {(asset.transactions || []).map((row: Row) => (
                  <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-[11px]">
                    <span className="font-semibold text-slate-700">{titleCase(row.type)} · {formatDate(row.transactionDate)}</span>
                    <span className="text-slate-500">{row.description}</span>
                    <span className="ml-auto flex items-center gap-3"><strong>{formatMoney(String(row.amount), currency)}</strong>{row.journalEntry ? <a href={`/finance/journals/${row.journalEntry.id}`} className="font-semibold text-blue-700 hover:underline">{row.journalEntry.voucherNumber}</a> : null}</span>
                  </div>
                ))}
                {!(asset.transactions || []).length ? <p className="py-6 text-center text-[11px] text-slate-400">No ledger activity yet. Capitalize the asset to post the acquisition journal.</p> : null}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
