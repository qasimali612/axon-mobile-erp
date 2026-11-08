"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Tags } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

type Row = Record<string, any>;
type Ref = { id: string; code: string; name: string };
const field = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export function SupplierItemWorkspace({ permissions, suppliers, products }: { permissions: { edit: boolean }; suppliers: Ref[]; products: Ref[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ supplierId: suppliers[0]?.id || "", productId: products[0]?.id || "", supplierSku: "", description: "", lastCost: "0", leadTimeDays: "0", minOrderQty: "0", isActive: true });

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/catalog/supplier-items", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) return toast.error(body?.error?.message || "Supplier item codes could not be loaded.");
    setRows(body.data || []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => [row.supplier?.name, row.supplier?.code, row.product?.name, row.supplierSku].some((value) => String(value || "").toLowerCase().includes(needle)));
  }, [rows, search]);

  function open(row: Row | "new") {
    setEditing(row);
    setForm(row === "new" ? { supplierId: suppliers[0]?.id || "", productId: products[0]?.id || "", supplierSku: "", description: "", lastCost: "0", leadTimeDays: "0", minOrderQty: "0", isActive: true } : {
      supplierId: row.supplierId, productId: row.productId, supplierSku: row.supplierSku, description: row.description || "",
      lastCost: String(row.lastCost ?? "0"), leadTimeDays: String(row.leadTimeDays ?? 0), minOrderQty: String(row.minOrderQty ?? "0"), isActive: Boolean(row.isActive),
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const payload = {
      supplierId: form.supplierId, productId: form.productId, supplierSku: form.supplierSku.trim(),
      description: form.description.trim() || null, lastCost: form.lastCost, leadTimeDays: Number(form.leadTimeDays || 0),
      minOrderQty: form.minOrderQty, isActive: form.isActive,
    };
    const response = editing === "new"
      ? await fetch("/api/catalog/supplier-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch(`/api/catalog/supplier-items/${(editing as Row).id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supplierSku: payload.supplierSku, description: payload.description, lastCost: payload.lastCost, leadTimeDays: payload.leadTimeDays, minOrderQty: payload.minOrderQty, isActive: payload.isActive }) });
    setSaving(false);
    const body = await response.json().catch(() => null);
    if (!response.ok) return toast.error(body?.error?.message || "The supplier item could not be saved.");
    toast.success(editing === "new" ? "Supplier item code saved" : "Supplier item code updated");
    setEditing(null);
    await load();
  }

  return (
    <>
      <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2"><span className="kicker">Procurement reference</span><Badge tone="green">No duplicate catalog</Badge></div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">Supplier item codes</h1>
          <p className="mt-1.5 text-sm text-slate-500">Each supplier&apos;s own item number, quoted cost, lead time and minimum order quantity for an existing product or variant. Purchasing reads these terms — they never move stock or post accounting on their own.</p>
        </div>
        {permissions.edit ? <Button onClick={() => open("new")}><Plus className="h-4 w-4" />New item code</Button> : null}
      </header>

      <div className="surface mb-5 flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400"><Tags className="h-3.5 w-3.5" />{rows.length} code{rows.length === 1 ? "" : "s"} · {rows.filter((row) => row.isActive).length} active</div>
        <div className="flex items-center gap-2">
          <input className="h-9 w-56 rounded-lg border border-slate-200 px-3 text-xs" placeholder="Search supplier, product or code" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Button variant="ghost" size="icon" onClick={() => void load()}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      <section className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400">
              <tr><th className="px-5 py-3">Supplier</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Supplier code</th><th className="px-4 py-3 text-right">Last cost</th><th className="px-4 py-3 text-right">Lead days</th><th className="px-4 py-3 text-right">Min order</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={8} className="p-14 text-center text-xs text-slate-400">Loading supplier item codes…</td></tr>
                : visible.length === 0 ? <tr><td colSpan={8} className="p-14 text-center text-xs text-slate-400">No supplier item codes yet. Add the supplier&apos;s own code once, then reuse it on purchase orders.</td></tr>
                  : visible.map((row) => (
                    <tr key={row.id} className="text-xs">
                      <td className="px-5 py-3.5"><b>{row.supplier?.name}</b><span className="block text-[10px] text-slate-500">{row.supplier?.code}</span></td>
                      <td className="px-4 py-3.5">{row.product?.name}<span className="block text-[10px] text-slate-500">{row.variant?.name ? `${row.product?.sku} · ${row.variant.name}` : row.product?.sku}</span></td>
                      <td className="px-4 py-3.5 font-mono text-[11px]">{row.supplierSku}</td>
                      <td className="px-4 py-3.5 text-right font-mono">{Number(row.lastCost).toFixed(2)}</td>
                      <td className="px-4 py-3.5 text-right">{row.leadTimeDays}</td>
                      <td className="px-4 py-3.5 text-right">{Number(row.minOrderQty).toFixed(2)}</td>
                      <td className="px-4 py-3.5"><Badge tone={row.isActive ? "green" : "slate"}>{row.isActive ? "Active" : "Inactive"}</Badge></td>
                      <td className="px-5 py-3.5 text-right">{permissions.edit ? <Button variant="outline" size="sm" onClick={() => open(row)}>Edit</Button> : null}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New supplier item code" : "Edit supplier item code"} description="Terms are stored per supplier so the same product can carry different codes and lead times with each vendor.">
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label><span className="label">Supplier</span><select className={field} value={form.supplierId} disabled={editing !== "new"} onChange={(event) => setForm((current) => ({ ...current, supplierId: event.target.value }))} required>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span className="label">Product</span><select className={field} value={form.productId} disabled={editing !== "new"} onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value }))} required>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span className="label">Supplier item code</span><input className={field} value={form.supplierSku} onChange={(event) => setForm((current) => ({ ...current, supplierSku: event.target.value }))} required /></label>
            <label><span className="label">Last quoted cost</span><input className={field} inputMode="decimal" value={form.lastCost} onChange={(event) => setForm((current) => ({ ...current, lastCost: event.target.value }))} /></label>
            <label><span className="label">Lead time (days)</span><input className={field} type="number" min="0" value={form.leadTimeDays} onChange={(event) => setForm((current) => ({ ...current, leadTimeDays: event.target.value }))} /></label>
            <label><span className="label">Minimum order quantity</span><input className={field} inputMode="decimal" value={form.minOrderQty} onChange={(event) => setForm((current) => ({ ...current, minOrderQty: event.target.value }))} /></label>
            <label className="sm:col-span-2"><span className="label">Description</span><input className={field} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />Active for new purchase orders</label>
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" loading={saving}>{editing === "new" ? "Save item code" : "Save changes"}</Button></div>
        </form>
      </Modal>
    </>
  );
}
