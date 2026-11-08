"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  PackagePlus,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  Send,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

type Row = Record<string, any>;
type Permissions = { create: boolean; approve: boolean; dispatch: boolean; receive: boolean };
type DraftLine = {
  key: string;
  productId: string;
  variantId: string;
  lotId: string | null;
  label: string;
  sku: string;
  trackingMethod: string;
  quantity: string;
  availableQuantity?: string;
  stockUnitIds: string[];
  units: Row[];
};

const field = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const today = () => new Date().toISOString().slice(0, 10);

function statusTone(status: string) {
  if (status === "POSTED") return "green" as const;
  if (status === "APPROVED" || status === "SUBMITTED") return "blue" as const;
  if (status === "DRAFT") return "amber" as const;
  if (status === "CANCELLED" || status === "REVERSED") return "red" as const;
  return "slate" as const;
}

function identifierText(unit: Row) {
  return (unit.identifiers || []).map((identifier: Row) => `${identifier.type}${identifier.slot ? ` ${identifier.slot}` : ""}: ${identifier.value}`).join(" · ");
}

export function StockTransferWorkspace({
  currency,
  activeWarehouseId,
  permissions,
}: {
  currency: string;
  activeWarehouseId?: string | null;
  permissions: Permissions;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [actionDialog, setActionDialog] = useState<"cancel" | "reverse" | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionDate, setActionDate] = useState(today());

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ pageSize: "100" });
    if (query) params.set("search", query);
    if (status) params.set("status", status);
    const response = await fetch(`/api/inventory/transfers?${params}`);
    const body = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) return toast.error(body?.error?.message || "Stock transfers could not be loaded.");
    setRows(body?.data || []);
  }, [query, status]);
  useEffect(() => { void load(); }, [load]);

  const openDetail = useCallback(async (id: string) => {
    setDetailId(id);
    setDetail(null);
    setDetailLoading(true);
    const response = await fetch(`/api/inventory/transfers/${id}`);
    const body = await response.json().catch(() => null);
    setDetailLoading(false);
    if (!response.ok) {
      setDetailId(null);
      return toast.error(body?.error?.message || "Transfer details could not be loaded.");
    }
    setDetail(body.data);
  }, []);
  useEffect(() => {
    const transferId = new URLSearchParams(window.location.search).get("transfer");
    if (transferId) void openDetail(transferId);
  }, [openDetail]);

  async function runAction(action: string, payload?: Row) {
    if (!detail) return;
    if (action === "post" && !window.confirm(`Post ${detail.transferNumber}? Stock will move immediately and posted history cannot be edited.`)) return;
    setActionBusy(action);
    const response = await fetch(`/api/inventory/transfers/${detail.id}/${action}`, {
      method: "POST",
      headers: payload ? { "content-type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const body = await response.json().catch(() => null);
    setActionBusy("");
    if (!response.ok) return toast.error(body?.error?.message || `Transfer ${action} failed.`);
    toast.success(action === "reverse" ? "Transfer reversal posted." : `Transfer ${action} completed.`);
    setActionDialog(null);
    setActionReason("");
    await load();
    if (action === "reverse") {
      setDetailId(null);
      setDetail(null);
    } else {
      await openDetail(detail.id);
    }
  }

  const canPost = permissions.dispatch && permissions.receive;

  return <>
    <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div>
        <div className="mb-2 flex items-center gap-2"><span className="kicker">Inventory control</span><Badge tone="green">Movement-backed</Badge></div>
        <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">Stock transfers</h1>
        <p className="mt-1.5 max-w-3xl text-sm text-slate-500">Move multiple quantity and IMEI/serial items atomically between authorized warehouses. Drafts never affect stock.</p>
      </div>
      {permissions.create ? <Button onClick={() => setCreateOpen(true)} className="bg-blue-600 hover:bg-blue-700"><PackagePlus className="h-4 w-4"/>New transfer</Button> : null}
    </div>

    <div className="surface mb-5 flex flex-col gap-3 p-4 md:flex-row md:items-center">
      <form onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); }} className="flex flex-1 gap-2">
        <label className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input className={`${field} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Transfer no., warehouse, SKU, IMEI or serial"/></label>
        <Button type="submit" variant="outline">Search</Button>
      </form>
      <select className={`${field} md:w-44`} value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="">All statuses</option>{["DRAFT","SUBMITTED","APPROVED","POSTED","CANCELLED","REVERSED"].map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
      </select>
      <Button variant="ghost" size="icon" onClick={() => void load()} aria-label="Refresh transfers"><RefreshCw className="h-4 w-4"/></Button>
    </div>

    <section className="surface overflow-hidden">
      <div className="overflow-x-auto"><table className="w-full min-w-[1040px] text-left">
        <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3">Transfer</th><th className="px-4 py-3">Route</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3 text-right">Lines / Qty</th><th className="px-4 py-3 text-right">Value</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? <tr><td colSpan={7} className="px-5 py-16 text-center text-xs text-slate-400">Loading transfers…</td></tr> : !rows.length ? <tr><td colSpan={7} className="px-5 py-16 text-center text-xs text-slate-400">No stock transfers match the current filters.</td></tr> : rows.map((row) => <tr key={row.id} className="text-xs hover:bg-slate-50/60">
            <td className="px-5 py-3.5"><button onClick={() => void openDetail(row.id)} className="font-bold text-blue-700 hover:underline">{row.transferNumber}</button><span className="block text-[9px] text-slate-400">{formatDate(row.transferDate)} · {row.preparedBy.fullName}</span></td>
            <td className="px-4 py-3.5"><b className="text-slate-700">{row.sourceWarehouse.code}</b><ArrowRight className="mx-2 inline h-3 w-3 text-slate-400"/><b className="text-slate-700">{row.destinationWarehouse.code}</b><span className="block text-[9px] text-slate-400">{row.sourceBranch.code} → {row.destinationBranch.code}</span></td>
            <td className="max-w-[260px] truncate px-4 py-3.5 text-slate-600" title={row.reason}>{row.reason}</td>
            <td className="px-4 py-3.5 text-right tabular-nums"><b>{row._count.lines}</b><span className="text-slate-400"> / </span><b>{row.totalQuantity}</b>{Number(row.serializedQuantity) > 0 ? <span className="block text-[9px] text-blue-600">{row.serializedQuantity} serialized</span> : null}</td>
            <td className="px-4 py-3.5 text-right font-semibold tabular-nums">{formatMoney(row.totalCost, currency)}</td>
            <td className="px-4 py-3.5"><Badge tone={statusTone(row.status)}>{titleCase(row.status)}</Badge>{row.reversalOf ? <span className="mt-1 block text-[9px] text-red-500">Reverses {row.reversalOf.transferNumber}</span> : null}</td>
            <td className="px-5 py-3.5 text-right"><Button variant="outline" size="sm" onClick={() => void openDetail(row.id)}>Open</Button></td>
          </tr>)}
        </tbody>
      </table></div>
    </section>

    <TransferEditor open={createOpen} onClose={() => setCreateOpen(false)} activeWarehouseId={activeWarehouseId} onCreated={async (id) => { setCreateOpen(false); await load(); await openDetail(id); }}/>

    <Modal open={Boolean(detailId)} onClose={() => { setDetailId(null); setDetail(null); }} title={detail?.transferNumber || "Stock transfer"} description={detail ? `${detail.sourceWarehouse.name} → ${detail.destinationWarehouse.name}` : "Loading transfer record…"} size="xl">
      {detailLoading || !detail ? <div className="p-12 text-center text-sm text-slate-400">Loading transfer details…</div> : <div className="space-y-5 p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Status"><Badge tone={statusTone(detail.status)}>{titleCase(detail.status)}</Badge></Info>
          <Info label="Transfer date" value={formatDate(detail.transferDate)}/>
          <Info label="Prepared by" value={detail.preparedBy.fullName}/>
          <Info label="Reference" value={detail.reference || "—"}/>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-3 text-sm"><b>{detail.sourceBranch.code} · {detail.sourceWarehouse.name}</b><ArrowRight className="h-4 w-4 text-blue-500"/><b>{detail.destinationBranch.code} · {detail.destinationWarehouse.name}</b></div><p className="mt-2 text-xs text-slate-600"><b>Reason:</b> {detail.reason}</p>{detail.remarks ? <p className="mt-1 text-xs text-slate-500">{detail.remarks}</p> : null}</div>
        <div className="overflow-hidden rounded-xl border border-slate-200"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400"><tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Tracking / identifiers</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Unit cost</th><th className="px-4 py-3 text-right">Value</th></tr></thead><tbody className="divide-y divide-slate-100">{detail.lines.map((line: Row) => <tr key={line.id}><td className="px-4 py-3"><b>{line.product.name}</b><span className="block text-[9px] text-slate-400">{line.product.sku} · {line.variant.sku}{line.lot ? ` · Lot ${line.lot.lotNumber}` : ""}</span></td><td className="px-4 py-3"><Badge tone="slate">{titleCase(line.trackingMethod)}</Badge>{line.units.length ? <div className="mt-1.5 flex max-w-[420px] flex-wrap gap-1">{line.units.map((link: Row) => <span key={link.id} className="rounded bg-blue-50 px-1.5 py-1 font-mono text-[9px] text-blue-700">{identifierText(link.stockUnit)}</span>)}</div> : null}</td><td className="px-4 py-3 text-right font-bold tabular-nums">{line.quantity}</td><td className="px-4 py-3 text-right tabular-nums">{formatMoney(line.unitCost, currency)}</td><td className="px-4 py-3 text-right font-bold tabular-nums">{formatMoney(line.totalCost, currency)}</td></tr>)}</tbody></table></div>
        {detail.movements?.length ? <details className="rounded-xl border border-slate-200"><summary className="cursor-pointer px-4 py-3 text-xs font-bold text-slate-700">Posted movement audit ({detail.movements.length})</summary><div className="border-t border-slate-100 p-3"><div className="grid gap-2 sm:grid-cols-2">{detail.movements.map((movement: Row) => <div key={movement.id} className="rounded-lg bg-slate-50 p-3 text-[10px]"><div className="flex justify-between"><b>{titleCase(movement.movementType)}</b><span className={String(movement.quantity).startsWith("-") ? "text-red-600" : "text-emerald-700"}>{movement.quantity}</span></div><span className="mt-1 block text-slate-500">{movement.warehouse.code} · {movement.product.name} · {formatMoney(movement.totalCost, currency)}</span></div>)}</div></div></details> : null}
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          {detail.status === "DRAFT" && permissions.create ? <Button variant="outline" onClick={() => void runAction("submit")} loading={actionBusy === "submit"}><Send className="h-4 w-4"/>Submit</Button> : null}
          {detail.status === "SUBMITTED" && permissions.approve ? <Button variant="outline" onClick={() => void runAction("approve")} loading={actionBusy === "approve"}><ClipboardCheck className="h-4 w-4"/>Approve</Button> : null}
          {["DRAFT","SUBMITTED","APPROVED"].includes(detail.status) && (permissions.approve || (detail.status === "DRAFT" && permissions.create)) ? <Button variant="danger" onClick={() => { setActionReason(""); setActionDialog("cancel"); }}><X className="h-4 w-4"/>Cancel</Button> : null}
          {["DRAFT","SUBMITTED","APPROVED"].includes(detail.status) && canPost ? <Button onClick={() => void runAction("post")} loading={actionBusy === "post"} className="bg-blue-600 hover:bg-blue-700"><Truck className="h-4 w-4"/>Post transfer</Button> : null}
          {detail.status === "POSTED" && permissions.approve && canPost && !detail.reversalOfId ? <Button variant="danger" onClick={() => { setActionReason(""); setActionDate(today()); setActionDialog("reverse"); }}><RotateCcw className="h-4 w-4"/>Reverse</Button> : null}
        </div>
      </div>}
    </Modal>

    <Modal open={Boolean(actionDialog)} onClose={() => setActionDialog(null)} title={actionDialog === "reverse" ? "Reverse posted transfer" : "Cancel unposted transfer"} description={actionDialog === "reverse" ? "A linked opposite transfer will be posted. Existing history remains immutable." : "Cancellation has no inventory effect."} size="md">
      <form onSubmit={(event) => { event.preventDefault(); if (actionReason.trim().length < 10) return toast.error("Enter a reason of at least 10 characters."); if (actionDialog === "reverse") void runAction("reverse", { postingDate: actionDate, reason: actionReason, idempotencyKey: crypto.randomUUID() }); else void runAction("cancel", { reason: actionReason }); }} className="space-y-4 p-5">
        {actionDialog === "reverse" ? <label className="block text-xs font-semibold text-slate-600">Reversal date<input type="date" className={`${field} mt-1.5`} value={actionDate} onChange={(event) => setActionDate(event.target.value)} required/></label> : null}
        <label className="block text-xs font-semibold text-slate-600">Reason<textarea className="mt-1.5 min-h-24 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500" value={actionReason} onChange={(event) => setActionReason(event.target.value)} maxLength={1000} required/></label>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setActionDialog(null)}>Keep transfer</Button><Button type="submit" variant="danger" loading={actionBusy === actionDialog}>{actionDialog === "reverse" ? "Post reversal" : "Cancel transfer"}</Button></div>
      </form>
    </Modal>
  </>;
}

function Info({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return <div className="rounded-xl border border-slate-100 p-3"><span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</span><div className="mt-1 text-xs font-semibold text-slate-700">{children || value}</div></div>;
}

function TransferEditor({ open, onClose, activeWarehouseId, onCreated }: { open: boolean; onClose: () => void; activeWarehouseId?: string | null; onCreated: (id: string) => Promise<void> }) {
  const [lookups, setLookups] = useState<Row>({ branches: [], warehouses: [] });
  const [sourceWarehouseId, setSourceWarehouseId] = useState("");
  const [destinationWarehouseId, setDestinationWarehouseId] = useState("");
  const [transferDate, setTransferDate] = useState(today());
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [availability, setAvailability] = useState<Row>({ balances: [], units: [] });
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [scan, setScan] = useState("");
  const [scanResults, setScanResults] = useState<Row[]>([]);
  const [selectedBalanceId, setSelectedBalanceId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [saving, setSaving] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const response = await fetch("/api/operations/lookups");
      const body = await response.json().catch(() => null);
      if (!response.ok) return toast.error(body?.error?.message || "Transfer lookups could not be loaded.");
      const data = body.data || { branches: [], warehouses: [] };
      setLookups(data);
      const sources = (data.warehouses || []).filter((warehouse: Row) => warehouse.allowDispatch);
      const initialSource = sources.find((warehouse: Row) => warehouse.id === activeWarehouseId)?.id || sources[0]?.id || "";
      setSourceWarehouseId(initialSource);
      const destinations = (data.warehouses || []).filter((warehouse: Row) => warehouse.allowReceiving && warehouse.id !== initialSource);
      setDestinationWarehouseId(destinations[0]?.id || "");
    })();
  }, [open, activeWarehouseId]);

  const loadAvailability = useCallback(async (warehouseId: string, searchValue = "") => {
    if (!warehouseId) return setAvailability({ balances: [], units: [] });
    setAvailabilityLoading(true);
    const response = await fetch(`/api/inventory/transfers/availability?warehouseId=${warehouseId}&search=${encodeURIComponent(searchValue)}`);
    const body = await response.json().catch(() => null);
    setAvailabilityLoading(false);
    if (!response.ok) return toast.error(body?.error?.message || "Source availability could not be loaded.");
    setAvailability(body.data || { balances: [], units: [] });
    return body.data;
  }, []);

  useEffect(() => {
    if (!open || !sourceWarehouseId) return;
    setLines([]);
    setScanResults([]);
    setSelectedBalanceId("");
    void loadAvailability(sourceWarehouseId);
  }, [open, sourceWarehouseId, loadAvailability]);

  const sourceWarehouse = lookups.warehouses?.find((warehouse: Row) => warehouse.id === sourceWarehouseId);
  const destinationWarehouse = lookups.warehouses?.find((warehouse: Row) => warehouse.id === destinationWarehouseId);
  const destinationOptions = useMemo(() => (lookups.warehouses || []).filter((warehouse: Row) => warehouse.allowReceiving && warehouse.id !== sourceWarehouseId), [lookups.warehouses, sourceWarehouseId]);

  function addBalance() {
    const balance = availability.balances?.find((item: Row) => item.id === selectedBalanceId);
    if (!balance) return toast.error("Select an available quantity item.");
    const requested = Number(quantity);
    if (!Number.isFinite(requested) || requested <= 0 || requested > Number(balance.availableQuantity)) return toast.error(`Enter a quantity up to ${balance.availableQuantity}.`);
    const key = `${balance.variantId}:${balance.lotId || "NO_LOT"}`;
    setLines((current) => {
      const next = current.filter((line) => line.key !== key);
      return [...next, { key, productId: balance.productId, variantId: balance.variantId, lotId: balance.lotId, label: balance.product.name, sku: balance.variant.sku, trackingMethod: balance.product.trackingMethod, quantity: String(quantity), availableQuantity: String(balance.availableQuantity), stockUnitIds: [], units: [] }];
    });
    setSelectedBalanceId("");
    setQuantity("1");
  }

  function addUnit(unit: Row) {
    if (lines.some((line) => line.stockUnitIds.includes(unit.id))) return toast.error("That physical unit is already on this transfer.");
    const key = `${unit.variantId}:NO_LOT`;
    setLines((current) => {
      const found = current.find((line) => line.key === key);
      if (found) return current.map((line) => line.key === key ? { ...line, stockUnitIds: [...line.stockUnitIds, unit.id], units: [...line.units, unit], quantity: String(line.stockUnitIds.length + 1) } : line);
      return [...current, { key, productId: unit.productId, variantId: unit.variantId, lotId: null, label: unit.product.name, sku: unit.variant.sku, trackingMethod: unit.product.trackingMethod, quantity: "1", stockUnitIds: [unit.id], units: [unit] }];
    });
    setScan("");
    setScanResults([]);
    scanRef.current?.focus();
  }

  async function searchUnit() {
    const value = scan.trim();
    if (!value) return;
    const data = await loadAvailability(sourceWarehouseId, value);
    const units: Row[] = data?.units || [];
    const normalized = value.replace(/[\s-]/g, "").toUpperCase();
    const exact = units.find((unit) => unit.identifiers?.some((identifier: Row) => String(identifier.normalizedValue).toUpperCase() === normalized));
    if (exact) return addUnit(exact);
    if (units.length === 1) return addUnit(units[0]);
    setScanResults(units);
    if (!units.length) toast.error("No available IMEI or serial matched the scan.");
  }

  function removeUnit(lineKey: string, unitId: string) {
    setLines((current) => current.flatMap((line) => {
      if (line.key !== lineKey) return [line];
      const units = line.units.filter((unit) => unit.id !== unitId);
      if (!units.length) return [];
      return [{ ...line, units, stockUnitIds: units.map((unit) => unit.id), quantity: String(units.length) }];
    }));
  }

  function reset() {
    setLines([]); setReason(""); setReference(""); setRemarks(""); setScan(""); setScanResults([]); setTransferDate(today());
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!sourceWarehouse || !destinationWarehouse) return toast.error("Select source and destination warehouses.");
    if (!lines.length) return toast.error("Add at least one available item.");
    setSaving(true);
    const response = await fetch("/api/inventory/transfers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceBranchId: sourceWarehouse.branchId, sourceWarehouseId, destinationBranchId: destinationWarehouse.branchId, destinationWarehouseId, transferDate, reference: reference || null, reason, remarks: remarks || null, idempotencyKey: crypto.randomUUID(), lines: lines.map((line) => ({ productId: line.productId, variantId: line.variantId, lotId: line.lotId, quantity: line.quantity, stockUnitIds: line.stockUnitIds })) }) });
    const body = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) return toast.error(body?.error?.message || "Transfer draft could not be saved.");
    toast.success(`${body.data.transferNumber} saved as a stock-neutral draft.`);
    reset();
    await onCreated(body.data.id);
  }

  return <Modal open={open} onClose={onClose} title="New stock transfer" description="Build one multi-product transfer. Stock changes only when you post." size="xl">
    <form onSubmit={save} className="space-y-5 p-5 sm:p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-xs font-semibold text-slate-600">Source warehouse<select className={`${field} mt-1.5`} value={sourceWarehouseId} onChange={(event) => setSourceWarehouseId(event.target.value)} required><option value="">Select source</option>{(lookups.warehouses || []).filter((warehouse: Row) => warehouse.allowDispatch).map((warehouse: Row) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">Destination warehouse<select className={`${field} mt-1.5`} value={destinationWarehouseId} onChange={(event) => setDestinationWarehouseId(event.target.value)} required><option value="">Select destination</option>{destinationOptions.map((warehouse: Row) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">Transfer date<input type="date" className={`${field} mt-1.5`} value={transferDate} onChange={(event) => setTransferDate(event.target.value)} required/></label>
        <label className="text-xs font-semibold text-slate-600">Reference <span className="font-normal text-slate-400">optional</span><input className={`${field} mt-1.5`} value={reference} onChange={(event) => setReference(event.target.value)} maxLength={100}/></label>
      </div>
      <label className="block text-xs font-semibold text-slate-600">Business reason<input className={`${field} mt-1.5`} value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={200} placeholder="Restock retail branch, central warehouse redistribution…" required/></label>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 p-4"><div className="mb-3 flex items-center gap-2"><ScanLine className="h-4 w-4 text-blue-600"/><div><h3 className="text-sm font-bold text-slate-800">Scan IMEI / serial</h3><p className="text-[10px] text-slate-400">Each scan selects one physical stock unit; dual IMEIs resolve to the same unit.</p></div></div><div className="flex gap-2"><input ref={scanRef} className={field} value={scan} onChange={(event) => setScan(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchUnit(); } }} placeholder="Scan or enter IMEI / serial"/><Button type="button" variant="outline" loading={availabilityLoading} onClick={() => void searchUnit()}>Add</Button></div>{scanResults.length ? <div className="mt-3 max-h-40 space-y-1 overflow-y-auto">{scanResults.map((unit) => <button type="button" key={unit.id} onClick={() => addUnit(unit)} className="block w-full rounded-lg border border-slate-100 p-2 text-left text-[10px] hover:border-blue-300 hover:bg-blue-50"><b>{unit.product.name} · {unit.variant.sku}</b><span className="block font-mono text-slate-500">{identifierText(unit)}</span></button>)}</div> : null}</section>
        <section className="rounded-xl border border-slate-200 p-4"><div className="mb-3"><h3 className="text-sm font-bold text-slate-800">Add quantity / batch stock</h3><p className="text-[10px] text-slate-400">Available quantity already excludes reservations.</p></div><div className="flex flex-col gap-2 sm:flex-row"><select className={`${field} flex-1`} value={selectedBalanceId} onChange={(event) => setSelectedBalanceId(event.target.value)}><option value="">Select available item</option>{(availability.balances || []).map((balance: Row) => <option key={balance.id} value={balance.id}>{balance.product.sku} · {balance.variant.sku}{balance.lot ? ` · ${balance.lot.lotNumber}` : ""} · available {balance.availableQuantity}</option>)}</select><input className={`${field} sm:w-24`} value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="decimal" aria-label="Quantity"/><Button type="button" variant="outline" onClick={addBalance}>Add</Button></div></section>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200"><div className="flex items-center justify-between bg-slate-50 px-4 py-3"><h3 className="text-xs font-bold text-slate-700">Transfer lines</h3><span className="text-[10px] text-slate-400">{lines.length} line(s)</span></div>{!lines.length ? <div className="px-4 py-10 text-center text-xs text-slate-400">Scan a device or add an available quantity item.</div> : <div className="divide-y divide-slate-100">{lines.map((line) => <div key={line.key} className="flex gap-3 px-4 py-3"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><b className="truncate text-xs text-slate-800">{line.label}</b><Badge tone="slate">{titleCase(line.trackingMethod)}</Badge></div><span className="text-[9px] text-slate-400">{line.sku} · quantity {line.quantity}{line.availableQuantity ? ` of ${line.availableQuantity} available` : ""}</span>{line.units.length ? <div className="mt-2 flex flex-wrap gap-1">{line.units.map((unit) => <span key={unit.id} className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-1 font-mono text-[9px] text-blue-700">{identifierText(unit)}<button type="button" onClick={() => removeUnit(line.key, unit.id)} aria-label="Remove unit"><X className="h-3 w-3"/></button></span>)}</div> : null}</div><Button type="button" variant="ghost" size="icon" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} aria-label="Remove line"><X className="h-4 w-4"/></Button></div>)}</div>}</section>
      <label className="block text-xs font-semibold text-slate-600">Remarks <span className="font-normal text-slate-400">optional</span><textarea className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500" value={remarks} onChange={(event) => setRemarks(event.target.value)} maxLength={2000}/></label>
      <div className="flex flex-col-reverse justify-end gap-2 border-t border-slate-100 pt-4 sm:flex-row"><Button type="button" variant="ghost" onClick={onClose}>Close</Button><Button type="submit" loading={saving} className="bg-blue-600 hover:bg-blue-700"><CheckCircle2 className="h-4 w-4"/>Save stock-neutral draft</Button></div>
    </form>
  </Modal>;
}
