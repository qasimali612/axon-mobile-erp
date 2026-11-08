"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  FolderTree,
  Layers,
  Plus,
  RefreshCw,
  Scale,
  Search,
  Tag,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

type MasterType = "category" | "brand" | "unit";
type Row = Record<string, any>;

const fieldClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400";

const labels: Record<MasterType, { title: string; singular: string; icon: any }> = {
  category: { title: "Categories", singular: "Category", icon: FolderTree },
  brand: { title: "Brands", singular: "Brand", icon: Bookmark },
  unit: { title: "Units of measure", singular: "Unit of measure", icon: Scale },
};

export function CatalogMasterWorkspace({
  permissions,
  initialCounts,
}: {
  permissions: { create: boolean; edit: boolean; archive: boolean };
  initialCounts?: { categories: number; brands: number; units: number };
}) {
  const [type, setType] = useState<MasterType>("category");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [counts, setCounts] = useState(
    initialCounts || { categories: 0, brands: 0, units: 0 }
  );

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/catalog/masters?type=${type}`);
    const body = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) {
      return toast.error(body?.error?.message || "Catalog masters could not be loaded.");
    }
    const data = body.data || [];
    setRows(data);
    setCounts((prev) => ({
      ...prev,
      [type === "category" ? "categories" : type === "brand" ? "brands" : "units"]: data.length,
    }));
  }, [type]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const code = String(r.code || "").toLowerCase();
      const name = String(r.name || "").toLowerCase();
      const desc = String(r.description || "").toLowerCase();
      const parentName = String(r.parent?.name || "").toLowerCase();
      return (
        code.includes(q) ||
        name.includes(q) ||
        desc.includes(q) ||
        parentName.includes(q)
      );
    });
  }, [rows, search]);

  const totalMasterCount = counts.categories + counts.brands + counts.units;

  return (
    <>
      <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="kicker">Catalog control</span>
            <Badge tone="green">Database backed</Badge>
          </div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">Catalog masters</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Maintain category hierarchy, brands, and quantity precision without editing seeded records or deleting product references.
          </p>
        </div>
        {permissions.create ? (
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            New {labels[type].singular.toLowerCase()}
          </Button>
        ) : null}
      </header>

      {/* KPI Metric Summary Cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div
          onClick={() => { setType("category"); setSearch(""); }}
          className={`surface cursor-pointer p-4 transition hover:shadow-sm ${
            type === "category" ? "ring-2 ring-blue-500" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Categories</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600">
              <FolderTree className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">{counts.categories}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Hierarchical groups</p>
        </div>

        <div
          onClick={() => { setType("brand"); setSearch(""); }}
          className={`surface cursor-pointer p-4 transition hover:shadow-sm ${
            type === "brand" ? "ring-2 ring-blue-500" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Brands</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-purple-50 text-purple-600">
              <Bookmark className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-purple-700">{counts.brands}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Manufacturers & vendors</p>
        </div>

        <div
          onClick={() => { setType("unit"); setSearch(""); }}
          className={`surface cursor-pointer p-4 transition hover:shadow-sm ${
            type === "unit" ? "ring-2 ring-blue-500" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Units of measure</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-600">
              <Scale className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-amber-700">{counts.units}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Measurement precision</p>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total master records</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <Layers className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-700">{totalMasterCount}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Catalog structure elements</p>
        </div>
      </div>

      {/* Tabs and Search Bar */}
      <div className="surface mb-5 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
          {(["category", "brand", "unit"] as MasterType[]).map((item) => {
            const ItemIcon = labels[item].icon;
            const count =
              item === "category" ? counts.categories : item === "brand" ? counts.brands : counts.units;
            const active = type === item;
            return (
              <button
                key={item}
                onClick={() => {
                  setType(item);
                  setEditing(null);
                  setSearch("");
                }}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  active
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <ItemIcon className="h-3.5 w-3.5" />
                <span>{labels[item].title}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    active ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={`Filter ${labels[type].title.toLowerCase()}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
            />
            {search ? (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <Button variant="ghost" size="icon" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <section className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3">Code / Name</th>
                {type === "category" ? <th className="px-4 py-3">Parent category</th> : null}
                {type === "unit" ? <th className="px-4 py-3 text-right">Decimal places</th> : null}
                <th className="px-4 py-3 text-right">Associated products</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-14 text-center text-xs text-slate-400">
                    Loading {labels[type].title.toLowerCase()}…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-14 text-center text-xs text-slate-400">
                    {search ? `No ${labels[type].title.toLowerCase()} match "${search}".` : `No ${labels[type].title.toLowerCase()} found.`}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="text-xs transition hover:bg-slate-50/60">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900">{row.code}</span>
                        <span className="font-semibold text-slate-700">{row.name}</span>
                      </div>
                      {row.description ? (
                        <span className="mt-0.5 block max-w-lg truncate text-[10px] text-slate-400">
                          {row.description}
                        </span>
                      ) : null}
                    </td>
                    {type === "category" ? (
                      <td className="px-4 py-3.5">
                        {row.parent ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                            <FolderTree className="h-3 w-3 text-slate-400" />
                            {row.parent.code} · {row.parent.name}
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-slate-400">Top level</span>
                        )}
                      </td>
                    ) : null}
                    {type === "unit" ? (
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-800">
                        {row.decimalPlaces}
                      </td>
                    ) : null}
                    <td className="px-4 py-3.5 text-right font-bold text-slate-800">
                      {row._count?.products || 0}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone={row.isActive ? "green" : "slate"}>
                        {row.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {permissions.edit ? (
                        <Button size="sm" variant="outline" onClick={() => setEditing(row)}>
                          Edit
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <MasterEditor
        open={Boolean(editing)}
        type={type}
        row={editing === "new" ? null : editing}
        rows={rows}
        permissions={permissions}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await load();
        }}
      />
    </>
  );
}

function MasterEditor({
  open,
  type,
  row,
  rows,
  permissions,
  onClose,
  onSaved,
}: {
  open: boolean;
  type: MasterType;
  row: Row | null;
  rows: Row[];
  permissions: { create: boolean; edit: boolean; archive: boolean };
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [decimalPlaces, setDecimalPlaces] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(row?.code || "");
    setName(row?.name || "");
    setParentId(row?.parentId || "");
    setDescription(row?.description || "");
    setLogoUrl(row?.logoUrl || "");
    setDecimalPlaces(String(row?.decimalPlaces || 0));
    setIsActive(row?.isActive ?? true);
  }, [open, row]);

  async function save(event: FormEvent) {
    event.preventDefault();
    const payload =
      type === "category"
        ? { code, name, parentId: parentId || null, description: description || null, isActive }
        : type === "brand"
        ? { code, name, logoUrl: logoUrl || null, isActive }
        : { code, name, decimalPlaces: Number(decimalPlaces), isActive };

    setSaving(true);
    const response = await fetch(
      row ? `/api/catalog/masters/${type}/${row.id}` : `/api/catalog/masters?type=${type}`,
      {
        method: row ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const body = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) {
      return toast.error(body?.error?.message || "Master record could not be saved.");
    }
    toast.success(`${labels[type].singular} saved.`);
    await onSaved();
  }

  const canSave = row ? (isActive ? permissions.edit : permissions.archive) : permissions.create;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${row ? "Edit" : "New"} ${labels[type].singular.toLowerCase()}`}
      description="Changes are company-scoped, validated, and logged to the central audit register."
      size="md"
    >
      <form onSubmit={save} className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-700">
            Code <span className="text-red-500">*</span>
            <input
              className={`${fieldClass} mt-1.5 uppercase font-mono`}
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              maxLength={30}
              placeholder="e.g. CAT-001"
              required
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Name <span className="text-red-500">*</span>
            <input
              className={`${fieldClass} mt-1.5`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              placeholder="e.g. Flagship Handsets"
              required
            />
          </label>
        </div>

        {type === "category" ? (
          <>
            <label className="block text-xs font-semibold text-slate-700">
              Parent category
              <select
                className={`${fieldClass} mt-1.5`}
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="">Top level (no parent)</option>
                {rows
                  .filter((item) => item.id !== row?.id && item.isActive)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Description
              <textarea
                className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional notes or details about this product category..."
                maxLength={1000}
              />
            </label>
          </>
        ) : null}

        {type === "brand" ? (
          <label className="block text-xs font-semibold text-slate-700">
            Logo URL (optional)
            <input
              className={`${fieldClass} mt-1.5`}
              type="url"
              value={logoUrl}
              onChange={(event) => setLogoUrl(event.target.value)}
              placeholder="https://example.com/logo.png"
              maxLength={2000}
            />
          </label>
        ) : null}

        {type === "unit" ? (
          <label className="block text-xs font-semibold text-slate-700">
            Decimal places
            <select
              className={`${fieldClass} mt-1.5`}
              value={decimalPlaces}
              onChange={(event) => setDecimalPlaces(event.target.value)}
            >
              {[0, 1, 2, 3, 4, 5, 6].map((value) => (
                <option key={value} value={value}>
                  {value} decimal places
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[10px] text-slate-400">
              Precision cannot change after products use this unit.
            </span>
          </label>
        ) : null}

        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs font-semibold text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          Active and selectable in catalog and transactions
        </label>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" loading={saving} disabled={!canSave}>
            Save {labels[type].singular}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
