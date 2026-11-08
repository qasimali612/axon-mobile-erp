"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  DollarSign,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Star,
  Tags,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

type Row = Record<string, any>;
type ItemDraft = { variantId: string; price: string; minimumPrice: string };

const field =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400";
const LEVELS = ["RETAIL", "WHOLESALE", "DEALER", "PROMOTIONAL"];

const levelTones: Record<string, "green" | "blue" | "purple" | "amber" | "slate"> = {
  RETAIL: "green",
  WHOLESALE: "blue",
  DEALER: "purple",
  PROMOTIONAL: "amber",
};

export function PriceListWorkspace({
  permissions,
}: {
  permissions: { create: boolean; edit: boolean };
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [variants, setVariants] = useState<Row[]>([]);
  const [customers, setCustomers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    const [lists, lookups] = await Promise.all([
      fetch("/api/catalog/price-lists"),
      fetch("/api/catalog/masters/lookups"),
    ]);
    const listBody = await lists.json().catch(() => null);
    const lookupBody = await lookups.json().catch(() => null);
    setLoading(false);
    if (!lists.ok) return toast.error(listBody?.error?.message || "Price lists could not be loaded.");
    setRows(listBody.data || []);
    if (lookups.ok) {
      setVariants(lookupBody.data?.variants || []);
      setCustomers(lookupBody.data?.customers || []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const defaultList = useMemo(() => rows.find((r) => r.isDefault), [rows]);
  const totalAssignedCustomers = useMemo(
    () => customers.filter((c) => c.priceListId).length,
    [customers]
  );
  const totalPriceOverrides = useMemo(
    () => rows.reduce((sum, r) => sum + (r._count?.items || 0), 0),
    [rows]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        String(r.code || "").toLowerCase().includes(q) ||
        String(r.name || "").toLowerCase().includes(q);
      const matchesLevel = !levelFilter || r.priceLevel === levelFilter;
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && r.isActive) ||
        (statusFilter === "INACTIVE" && !r.isActive);
      return matchesSearch && matchesLevel && matchesStatus;
    });
  }, [rows, search, levelFilter, statusFilter]);

  return (
    <>
      <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="kicker">Catalog control</span>
            <Badge tone="green">Server priced</Badge>
          </div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">Price lists</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Maintain retail, wholesale, dealer, and promotional variant prices. Invoice minimum-price checks use the active list before falling back to the variant floor.
          </p>
        </div>
        {permissions.create ? (
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            New price list
          </Button>
        ) : null}
      </header>

      {/* KPI Metric Summary Cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Price Lists</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600">
              <Tags className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">{rows.length}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Configured pricing tiers</p>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Default Price List</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <Star className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-lg font-black text-emerald-700 truncate">
            {defaultList?.code || "None"}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {defaultList?.name || "No default assigned"}
          </p>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Assigned Customers</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-purple-50 text-purple-600">
              <Users className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-purple-700">{totalAssignedCustomers}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Linked party accounts</p>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Priced Variant Overrides</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-600">
              <DollarSign className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-amber-700">{totalPriceOverrides}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Custom SKU price rules</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="surface mb-5 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search code or name…"
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

          <div className="relative">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
            >
              <option value="">All price levels</option>
              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active only</option>
            <option value="INACTIVE">Inactive only</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-slate-400 sm:inline">
            Showing {filteredRows.length} of {rows.length} lists
          </span>
          <Button variant="ghost" size="icon" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <section className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3">Code / Name</th>
                <th className="px-4 py-3">Pricing Tier</th>
                <th className="px-4 py-3">Currency</th>
                <th className="px-4 py-3 text-right">Priced Items</th>
                <th className="px-4 py-3 text-right">Assigned Parties</th>
                <th className="px-4 py-3">Effective Window</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-14 text-center text-xs text-slate-400">
                    Loading price lists…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-14 text-center text-xs text-slate-400">
                    {search || levelFilter || statusFilter !== "ALL"
                      ? "No price lists match the filter criteria."
                      : "No price lists yet. Create the first list to control selling prices by customer segment."}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="text-xs transition hover:bg-slate-50/60">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900">{row.code}</span>
                        {row.isDefault ? (
                          <Badge tone="blue" className="gap-1">
                            <Star className="h-2.5 w-2.5 fill-current" /> Default
                          </Badge>
                        ) : null}
                      </div>
                      <span className="mt-0.5 block text-[11px] text-slate-500">{row.name}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone={levelTones[row.priceLevel] || "slate"}>
                        {row.priceLevel}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px] font-semibold text-slate-700">
                      {row.currencyCode}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-800">
                      {row._count?.items || 0}
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold text-slate-700">
                      {row._count?.customers || 0}
                    </td>
                    <td className="px-4 py-3.5 text-[10px] text-slate-500">
                      {!row.effectiveFrom && !row.effectiveTo ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                          Perpetual
                        </span>
                      ) : (
                        <span>
                          {row.effectiveFrom ? String(row.effectiveFrom).slice(0, 10) : "Open"} →{" "}
                          {row.effectiveTo ? String(row.effectiveTo).slice(0, 10) : "Open"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone={row.isActive ? "green" : "slate"}>
                        {row.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Button size="sm" variant="outline" onClick={() => setEditing(row)}>
                        {permissions.edit ? "Edit" : "View"}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <PriceListEditor
        open={Boolean(editing)}
        row={editing === "new" ? null : editing}
        variants={variants}
        customers={customers}
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

function PriceListEditor({
  open,
  row,
  variants,
  customers,
  permissions,
  onClose,
  onSaved,
}: {
  open: boolean;
  row: Row | null;
  variants: Row[];
  customers: Row[];
  permissions: { create: boolean; edit: boolean };
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [priceLevel, setPriceLevel] = useState("RETAIL");
  const [currencyCode, setCurrencyCode] = useState("PKR");
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [variantFilter, setVariantFilter] = useState("");

  useEffect(() => {
    if (!open) return;
    setCode(row?.code || "");
    setName(row?.name || "");
    setPriceLevel(row?.priceLevel || "RETAIL");
    setCurrencyCode(row?.currencyCode || "PKR");
    setIsDefault(row?.isDefault ?? false);
    setIsActive(row?.isActive ?? true);
    setEffectiveFrom(row?.effectiveFrom ? String(row.effectiveFrom).slice(0, 10) : "");
    setEffectiveTo(row?.effectiveTo ? String(row.effectiveTo).slice(0, 10) : "");
    setNotes(row?.notes || "");
    setItems([]);
    setVariantFilter("");

    if (!row) return;
    setLoadingDetail(true);
    void fetch(`/api/catalog/price-lists/${row.id}`).then(async (response) => {
      const body = await response.json().catch(() => null);
      setLoadingDetail(false);
      if (!response.ok) return toast.error(body?.error?.message || "Price list detail could not be loaded.");
      setItems(
        (body.data.items || []).map((item: Row) => ({
          variantId: item.variantId,
          price: Number(item.price).toFixed(2),
          minimumPrice:
            item.minimumPrice === null || item.minimumPrice === undefined
              ? ""
              : Number(item.minimumPrice).toFixed(2),
        }))
      );
    });
  }, [open, row]);

  const variantMap = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);
  const assigned = customers.filter((c) => c.priceListId === row?.id).length;

  const filteredItems = useMemo(() => {
    if (!variantFilter.trim()) return items.map((it, idx) => ({ ...it, originalIndex: idx }));
    const q = variantFilter.trim().toLowerCase();
    return items
      .map((it, idx) => ({ ...it, originalIndex: idx }))
      .filter((it) => {
        const v = variantMap.get(it.variantId);
        if (!v) return true;
        const text = `${v.sku} ${v.product?.name || ""} ${v.name}`.toLowerCase();
        return text.includes(q);
      });
  }, [items, variantFilter, variantMap]);

  async function save(event: FormEvent) {
    event.preventDefault();
    const payload = {
      code,
      name,
      priceLevel,
      currencyCode,
      isDefault,
      isActive,
      effectiveFrom: effectiveFrom || null,
      effectiveTo: effectiveTo || null,
      notes: notes || null,
      items: items
        .filter((item) => item.variantId && item.price)
        .map((item) => ({
          variantId: item.variantId,
          price: item.price,
          minimumPrice: item.minimumPrice || null,
        })),
    };
    setSaving(true);
    const response = await fetch(
      row ? `/api/catalog/price-lists/${row.id}` : "/api/catalog/price-lists",
      {
        method: row ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const body = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) return toast.error(body?.error?.message || "Price list could not be saved.");
    toast.success("Price list saved successfully.");
    await onSaved();
  }

  const canSave = row ? permissions.edit : permissions.create;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${row ? "Edit" : "New"} price list`}
      description="Prices are validated on the server; deactivation is blocked while active customers or open invoices use the list."
      size="lg"
    >
      <form onSubmit={save} className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-700">
            Code <span className="text-red-500">*</span>
            <input
              className={`${field} mt-1.5 uppercase font-mono`}
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              maxLength={30}
              placeholder="e.g. PL-RETAIL"
              required
              disabled={!canSave}
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Name <span className="text-red-500">*</span>
            <input
              className={`${field} mt-1.5`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              placeholder="e.g. Standard Retail Price List"
              required
              disabled={!canSave}
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Price level
            <select
              className={`${field} mt-1.5`}
              value={priceLevel}
              onChange={(event) => setPriceLevel(event.target.value)}
              disabled={!canSave}
            >
              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Currency
            <input
              className={`${field} mt-1.5 uppercase font-mono`}
              value={currencyCode}
              onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())}
              maxLength={3}
              placeholder="PKR"
              disabled={!canSave}
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Effective from (optional)
            <input
              className={`${field} mt-1.5`}
              type="date"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
              disabled={!canSave}
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Effective to (optional)
            <input
              className={`${field} mt-1.5`}
              type="date"
              value={effectiveTo}
              onChange={(event) => setEffectiveTo(event.target.value)}
              disabled={!canSave}
            />
          </label>
        </div>

        <label className="block text-xs font-semibold text-slate-700">
          Notes / Commercial remarks
          <textarea
            className="mt-1.5 min-h-16 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Special commercial terms, seasonal discount guidelines, etc."
            maxLength={1000}
            disabled={!canSave}
          />
        </label>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
              disabled={!canSave}
            />
            Company default price list
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              disabled={!canSave}
            />
            Active and selectable
          </label>
        </div>

        {/* Variant Prices Box */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-2 border-b border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Tags className="h-3.5 w-3.5 text-blue-600" />
              <span>Variant price overrides</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                {loadingDetail ? "loading…" : `${items.length} line${items.length === 1 ? "" : "s"}`}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {items.length > 3 ? (
                <input
                  type="text"
                  placeholder="Filter lines…"
                  value={variantFilter}
                  onChange={(e) => setVariantFilter(e.target.value)}
                  className="h-8 w-32 rounded-lg border border-slate-200 px-2 text-xs outline-none focus:border-blue-500"
                />
              ) : null}
              {canSave ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setItems((current) => [
                      ...current,
                      { variantId: "", price: "", minimumPrice: "" },
                    ])
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add line
                </Button>
              ) : null}
            </div>
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto p-3">
            {items.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-slate-400">
                No custom variant prices added. The standard variant retail price will apply when a variant is not listed here.
              </p>
            ) : filteredItems.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-slate-400">
                No lines match "{variantFilter}".
              </p>
            ) : (
              filteredItems.map((item) => {
                const index = item.originalIndex;
                return (
                  <div
                    key={`${item.variantId}-${index}`}
                    className="grid gap-2 sm:grid-cols-[1fr_110px_110px_32px]"
                  >
                    <select
                      className={field}
                      value={item.variantId}
                      disabled={!canSave}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((line, position) =>
                            position === index
                              ? {
                                  ...line,
                                  variantId: event.target.value,
                                  price:
                                    line.price ||
                                    (variantMap.get(event.target.value)?.retailPrice
                                      ? Number(
                                          variantMap.get(event.target.value)!.retailPrice
                                        ).toFixed(2)
                                      : ""),
                                }
                              : line
                          )
                        )
                      }
                    >
                      <option value="">Select variant…</option>
                      {variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.sku} · {v.product?.name} {v.name}
                        </option>
                      ))}
                    </select>
                    <input
                      className={`${field} font-mono text-right`}
                      inputMode="decimal"
                      placeholder="Selling price"
                      value={item.price}
                      disabled={!canSave}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((line, position) =>
                            position === index ? { ...line, price: event.target.value } : line
                          )
                        )
                      }
                    />
                    <input
                      className={`${field} font-mono text-right`}
                      inputMode="decimal"
                      placeholder="Min floor price"
                      value={item.minimumPrice}
                      disabled={!canSave}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((line, position) =>
                            position === index
                              ? { ...line, minimumPrice: event.target.value }
                              : line
                          )
                        )
                      }
                    />
                    {canSave ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setItems((current) => current.filter((_, position) => position !== index))
                        }
                      >
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </Button>
                    ) : (
                      <span />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {row ? (
          <p className="text-[10px] text-slate-400">
            {assigned} active customer{assigned === 1 ? "" : "s"} currently assigned to this list. Deactivate only after reassigning them.
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" loading={saving} disabled={!canSave}>
            Save price list
          </Button>
        </div>
      </form>
    </Modal>
  );
}
