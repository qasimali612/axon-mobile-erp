"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock,
  Cpu,
  Factory,
  Layers,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { responseError } from "@/components/ui/form-error";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

type ProductionOrder = {
  id: string;
  orderNumber: string;
  status: string;
  plannedQuantity: string;
  completedQuantity: string;
  unitCost: string;
  totalCost: string;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate: string | null;
  actualEndDate: string | null;
  notes: string | null;
  product: { id: string; sku: string; name: string; model: string | null };
  variant: { id: string; sku: string; name: string; color: string | null };
  branch: { id: string; code: string; name: string };
  sourceWarehouse: { id: string; code: string; name: string };
  targetWarehouse: { id: string; code: string; name: string };
  bom: { id: string; code: string; name: string };
  _count?: { materialsIssued: number; unitsProduced: number };
};

export function ProductionWorkspace({
  currency,
  permissions,
}: {
  currency: string;
  permissions: string[];
}) {
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [actingId, setActingId] = useState("");

  // Lookups
  const [boms, setBoms] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  // Create Order Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bomId, setBomId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [sourceWarehouseId, setSourceWarehouseId] = useState("");
  const [targetWarehouseId, setTargetWarehouseId] = useState("");
  const [plannedQty, setPlannedQty] = useState("10");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState("");

  // View / Detail Modal
  const [viewOrder, setViewOrder] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Receive Units Modal
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receivingOrder, setReceivingOrder] = useState<ProductionOrder | null>(null);
  const [units, setUnits] = useState<
    Array<{ imei1: string; imei2: string; serialNumber: string; qcResult: string }>
  >([{ imei1: "", imei2: "", serialNumber: "", qcResult: "PASS" }]);

  const canCreate = permissions.includes("production.order.create");
  const canApprove = permissions.includes("production.order.approve");
  const canIssue = permissions.includes("production.issue.post");
  const canReceive = permissions.includes("production.receive.post");

  const load = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams({ pageSize: "100" });
    if (status) query.set("status", status);
    if (search.trim()) query.set("search", search.trim());

    const [ordersRes, lookupsRes] = await Promise.all([
      fetch(`/api/production/orders?${query}`),
      boms.length ? Promise.resolve(null) : fetch("/api/production/boms"),
    ]);

    setLoading(false);
    if (!ordersRes.ok) return toast.error(await responseError(ordersRes));
    const ordersBody = await ordersRes.json();
    setOrders(ordersBody.data || []);

    if (lookupsRes && lookupsRes.ok) {
      const bomsBody = await lookupsRes.json();
      setBoms(bomsBody.data || []);
    }

    if (!branches.length) {
      const bRes = await fetch("/api/operations/lookups");
      if (bRes.ok) {
        const bBody = await bRes.json();
        setBranches(bBody.data.branches || []);
        setWarehouses(bBody.data.warehouses || []);
      }
    }
  }, [boms.length, branches.length, search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreateOrder() {
    const firstBom = boms[0];
    const firstBranch = branches[0];
    const firstWh = warehouses[0];
    setBomId(firstBom?.id || "");
    setBranchId(firstBranch?.id || "");
    setSourceWarehouseId(firstWh?.id || "");
    setTargetWarehouseId(firstWh?.id || "");
    setPlannedQty("10");
    setNotes("");
    setCreateOpen(true);
  }

  async function createOrder(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const response = await fetch("/api/production/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bomId,
        branchId,
        sourceWarehouseId,
        targetWarehouseId,
        plannedQuantity: Number(plannedQty),
        plannedStartDate: startDate,
        plannedEndDate: endDate,
        notes,
      }),
    });
    setSaving(false);
    if (!response.ok) return toast.error(await responseError(response));
    toast.success("Production order created as Draft.");
    setCreateOpen(false);
    void load();
  }

  async function openDetail(orderId: string) {
    setLoadingDetail(true);
    const res = await fetch(`/api/production/orders/${orderId}`);
    setLoadingDetail(false);
    if (!res.ok) return toast.error("Failed to load order details.");
    const body = await res.json();
    setViewOrder(body.data);
  }

  async function submitOrder(order: ProductionOrder) {
    setActingId(order.id);
    const res = await fetch(`/api/production/orders/${order.id}/submit`, { method: "POST" });
    setActingId("");
    if (!res.ok) return toast.error(await responseError(res));
    toast.success(`${order.orderNumber} submitted to Planned status.`);
    void load();
  }

  async function approveOrder(order: ProductionOrder) {
    setActingId(order.id);
    const res = await fetch(`/api/production/orders/${order.id}/approve`, { method: "POST" });
    setActingId("");
    if (!res.ok) return toast.error(await responseError(res));
    toast.success(`${order.orderNumber} approved and moved to In Progress.`);
    void load();
  }

  async function issueMaterials(order: ProductionOrder) {
    if (
      !window.confirm(
        `Issue CKD/SKD component materials for ${order.orderNumber}? Required parts will be deducted from ${order.sourceWarehouse.name} and transferred to WIP.`
      )
    )
      return;
    setActingId(order.id);
    const res = await fetch(`/api/production/orders/${order.id}/issue`, { method: "POST" });
    setActingId("");
    if (!res.ok) return toast.error(await responseError(res));
    toast.success(`Materials successfully issued to WIP for ${order.orderNumber}.`);
    void load();
  }

  function openReceiveModal(order: ProductionOrder) {
    setReceivingOrder(order);
    const remaining = Math.max(1, Number(order.plannedQuantity) - Number(order.completedQuantity));
    const initialRows = Array.from({ length: Math.min(remaining, 5) }).map(() => ({
      imei1: "",
      imei2: "",
      serialNumber: "",
      qcResult: "PASS",
    }));
    setUnits(initialRows);
    setReceiveOpen(true);
  }

  function addUnitRow() {
    setUnits([...units, { imei1: "", imei2: "", serialNumber: "", qcResult: "PASS" }]);
  }

  function removeUnitRow(idx: number) {
    setUnits(units.filter((_, i) => i !== idx));
  }

  async function receiveUnits(e: React.FormEvent) {
    e.preventDefault();
    if (!receivingOrder) return;
    const validUnits = units.filter((u) => u.imei1.trim().length >= 14);
    if (!validUnits.length) {
      return toast.error("Please enter at least one valid 14-15 digit IMEI 1.");
    }
    setSaving(true);
    const res = await fetch(`/api/production/orders/${receivingOrder.id}/receive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ units: validUnits }),
    });
    setSaving(false);
    if (!res.ok) return toast.error(await responseError(res));
    const body = await res.json();
    toast.success(`${body.data.receivedUnits} finished smartphones received into ${receivingOrder.targetWarehouse.name}!`);
    setReceiveOpen(false);
    void load();
  }

  function statusTone(st: string) {
    if (st === "COMPLETED") return "green" as const;
    if (st === "IN_PROGRESS") return "blue" as const;
    if (st === "PLANNED") return "amber" as const;
    if (st === "CANCELLED") return "red" as const;
    return "slate" as const;
  }

  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <span className="kicker">Production & Assembly Management</span>
          <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-[30px]">Production Orders</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Control phone manufacturing workflows: component issue to WIP, assembly inspection, serialized IMEI allocation, and finished goods receipt.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/production/boms">
            <Button variant="outline">
              <Layers className="h-4 w-4" />
              Manage BOMs
            </Button>
          </Link>
          <Link href="/production/dashboard">
            <Button variant="outline">
              <Factory className="h-4 w-4" />
              Production Dashboard
            </Button>
          </Link>
          {canCreate ? (
            <Button onClick={openCreateOrder}>
              <Plus className="h-4 w-4" />
              New Order
            </Button>
          ) : null}
        </div>
      </div>

      <div className="surface mb-5 flex flex-wrap items-center justify-between gap-3 p-2">
        <div className="flex gap-1">
          {["", "DRAFT", "PLANNED", "IN_PROGRESS", "COMPLETED"].map((st) => (
            <button
              key={st}
              onClick={() => setStatus(st)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                status === st ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {st ? titleCase(st) : "All Orders"}
            </button>
          ))}
        </div>

        <div className="flex flex-1 items-center justify-end gap-2 sm:max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by order #, phone model, SKU…"
              className="h-9 w-full rounded-lg border border-slate-200 pl-8 pr-3 text-xs outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={() => void load()}
            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <section className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="table-head">
              <tr>
                <th className="px-5 py-3">Order #</th>
                <th className="px-4 py-3">Finished Smartphone</th>
                <th className="px-4 py-3">Branch / Warehouses</th>
                <th className="px-4 py-3">Planned Dates</th>
                <th className="px-4 py-3 text-right">Progress</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-xs text-slate-400">
                    Loading production orders…
                  </td>
                </tr>
              ) : !orders.length ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-xs text-slate-400">
                    No production orders found. Click "New Order" to schedule smartphone assembly.
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const planned = Number(order.plannedQuantity);
                  const completed = Number(order.completedQuantity);
                  const pct = planned > 0 ? Math.round((completed / planned) * 100) : 0;
                  const isActing = actingId === order.id;

                  return (
                    <tr key={order.id} className="text-xs hover:bg-slate-50/50">
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => void openDetail(order.id)}
                          className="font-mono font-bold text-blue-600 hover:underline"
                        >
                          {order.orderNumber}
                        </button>
                        <span className="block text-[10px] text-slate-400">BOM: {order.bom.code}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-slate-900">{order.product.name}</p>
                        <p className="text-[10px] text-slate-400">
                          {order.variant.name} {order.variant.color ? `· ${order.variant.color}` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">
                        <span className="font-medium text-slate-800">{order.branch.code}</span>
                        <span className="block text-[10px] text-slate-400">
                          From {order.sourceWarehouse.code} → To {order.targetWarehouse.code}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">
                        <span>{formatDate(order.plannedStartDate)}</span>
                        <span className="block text-[10px] text-slate-400">to {formatDate(order.plannedEndDate)}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="font-mono font-bold text-slate-900">
                          {completed} / {planned}
                        </span>
                        <div className="mt-1 h-1.5 w-24 ml-auto rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-blue-600 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge tone={statusTone(order.status)}>{titleCase(order.status)}</Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {order.status === "DRAFT" && canCreate ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isActing}
                              onClick={() => void submitOrder(order)}
                            >
                              Submit
                            </Button>
                          ) : null}

                          {order.status === "PLANNED" && canApprove ? (
                            <Button
                              size="sm"
                              disabled={isActing}
                              onClick={() => void approveOrder(order)}
                            >
                              Approve
                            </Button>
                          ) : null}

                          {order.status === "IN_PROGRESS" ? (
                            <>
                              {canIssue && !order._count?.materialsIssued ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isActing}
                                  onClick={() => void issueMaterials(order)}
                                  title="Issue component materials from warehouse to WIP"
                                >
                                  Issue Parts
                                </Button>
                              ) : null}
                              {canReceive ? (
                                <Button
                                  size="sm"
                                  onClick={() => openReceiveModal(order)}
                                  title="Receive completed phones with IMEI allocation"
                                >
                                  Receive Phones
                                </Button>
                              ) : null}
                            </>
                          ) : null}

                          <Button size="sm" variant="outline" onClick={() => void openDetail(order.id)}>
                            Inspect
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Create Order Modal */}
      {createOpen ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4">
          <form onSubmit={createOrder} className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
            <div className="flex justify-between border-b px-6 py-4">
              <h2 className="font-bold text-slate-900">New Production Order</h2>
              <button type="button" onClick={() => setCreateOpen(false)}>
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>
            <div className="grid gap-4 p-6 sm:grid-cols-2">
              <label className="field-label sm:col-span-2">
                Bill of Materials (Assembly Recipe)
                <select className="field-input" value={bomId} onChange={(e) => setBomId(e.target.value)} required>
                  {boms.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} · {b.name} ({b.product?.name})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label sm:col-span-2">
                Manufacturing Branch
                <select className="field-input" value={branchId} onChange={(e) => setBranchId(e.target.value)} required>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} · {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Source Warehouse (Parts)
                <select
                  className="field-input"
                  value={sourceWarehouseId}
                  onChange={(e) => setSourceWarehouseId(e.target.value)}
                  required
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} · {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Target Warehouse (Finished Goods)
                <select
                  className="field-input"
                  value={targetWarehouseId}
                  onChange={(e) => setTargetWarehouseId(e.target.value)}
                  required
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} · {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Planned Output Quantity
                <input
                  required
                  type="number"
                  min="1"
                  className="field-input font-mono"
                  value={plannedQty}
                  onChange={(e) => setPlannedQty(e.target.value)}
                />
              </label>
              <label className="field-label">
                Planned Start Date
                <input
                  required
                  type="date"
                  className="field-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
              <label className="field-label sm:col-span-2">
                Planned Completion Date
                <input
                  required
                  type="date"
                  className="field-input"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </label>
              <label className="field-label sm:col-span-2">
                Production Notes
                <input
                  className="field-input"
                  placeholder="Optional assembly line instructions or batch notes…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create Order"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Receive Phones Modal */}
      {receiveOpen && receivingOrder ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4">
          <form onSubmit={receiveUnits} className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
            <div className="flex justify-between border-b px-6 py-4">
              <div>
                <h2 className="font-bold text-slate-900">Receive Finished Smartphones with IMEI Allocation</h2>
                <p className="text-xs text-slate-500">
                  Order {receivingOrder.orderNumber} · {receivingOrder.product.name} ({receivingOrder.variant.name})
                </p>
              </div>
              <button type="button" onClick={() => setReceiveOpen(false)}>
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-6 space-y-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">
                  Enter 15-digit IMEI 1 (required), optional IMEI 2 (Dual SIM), and Serial Number per unit:
                </span>
                <Button type="button" size="sm" variant="outline" onClick={addUnitRow}>
                  <Plus className="h-3 w-3" />
                  Add Unit
                </Button>
              </div>

              {units.map((unit, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs bg-slate-50/50">
                  <span className="grid h-6 w-6 place-items-center rounded bg-blue-100 font-bold text-blue-800 text-[10px]">
                    #{idx + 1}
                  </span>
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-[9px] uppercase font-bold text-slate-400">IMEI 1 (SIM 1) *</label>
                    <input
                      required
                      placeholder="e.g. 860123456789012"
                      className="field-input font-mono text-xs uppercase"
                      value={unit.imei1}
                      onChange={(e) => {
                        const updated = [...units];
                        updated[idx].imei1 = e.target.value;
                        setUnits(updated);
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-[9px] uppercase font-bold text-slate-400">IMEI 2 (SIM 2)</label>
                    <input
                      placeholder="Optional second IMEI"
                      className="field-input font-mono text-xs uppercase"
                      value={unit.imei2}
                      onChange={(e) => {
                        const updated = [...units];
                        updated[idx].imei2 = e.target.value;
                        setUnits(updated);
                      }}
                    />
                  </div>
                  <div className="w-28">
                    <label className="text-[9px] uppercase font-bold text-slate-400">Serial #</label>
                    <input
                      placeholder="SN..."
                      className="field-input font-mono text-xs uppercase"
                      value={unit.serialNumber}
                      onChange={(e) => {
                        const updated = [...units];
                        updated[idx].serialNumber = e.target.value;
                        setUnits(updated);
                      }}
                    />
                  </div>
                  <div className="w-20">
                    <label className="text-[9px] uppercase font-bold text-slate-400">QC Status</label>
                    <select
                      className="field-input text-xs"
                      value={unit.qcResult}
                      onChange={(e) => {
                        const updated = [...units];
                        updated[idx].qcResult = e.target.value;
                        setUnits(updated);
                      }}
                    >
                      <option value="PASS">PASS</option>
                      <option value="REWORK">REWORK</option>
                      <option value="SCRAP">SCRAP</option>
                    </select>
                  </div>
                  {units.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeUnitRow(idx)}
                      className="mt-4 rounded p-1 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center border-t px-6 py-4">
              <span className="text-xs text-slate-500">
                Receiving into warehouse: <b>{receivingOrder.targetWarehouse.name}</b>
              </span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setReceiveOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Posting to Stock…" : "Post to Stock & GL"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {/* Inspect / View Order Modal */}
      {viewOrder ? (
        <Modal
          open={Boolean(viewOrder)}
          onClose={() => setViewOrder(null)}
          title={`Production Order: ${viewOrder.orderNumber}`}
          description={`Status: ${viewOrder.status} · Branch: ${viewOrder.branch.name} · BOM: ${viewOrder.bom.name}`}
          size="xl"
        >
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="surface-muted p-3">
                <p className="text-[10px] uppercase font-bold text-slate-400">Finished Product</p>
                <p className="mt-1 font-semibold text-slate-800">{viewOrder.product.name}</p>
                <p className="text-xs text-slate-500">{viewOrder.variant.name}</p>
              </div>
              <div className="surface-muted p-3">
                <p className="text-[10px] uppercase font-bold text-slate-400">Target Output</p>
                <p className="mt-1 font-mono text-base font-bold text-slate-900">
                  {viewOrder.completedQuantity} / {viewOrder.plannedQuantity}
                </p>
              </div>
              <div className="surface-muted p-3">
                <p className="text-[10px] uppercase font-bold text-slate-400">Target Warehouse</p>
                <p className="mt-1 font-semibold text-slate-800">{viewOrder.targetWarehouse.name}</p>
              </div>
              <div className="surface-muted p-3">
                <p className="text-[10px] uppercase font-bold text-slate-400">Total Material Cost</p>
                <p className="mt-1 font-mono font-bold text-slate-900">
                  {formatMoney(viewOrder.totalCost, currency)}
                </p>
              </div>
            </div>

            {/* Assembled Units with IMEIs */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                Assembled Phones & IMEI Registry ({viewOrder.unitsProduced?.length || 0} units)
              </h3>
              {!viewOrder.unitsProduced?.length ? (
                <p className="text-xs text-slate-400 italic">No phone units assembled and received yet.</p>
              ) : (
                <div className="surface overflow-hidden border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-400">
                      <tr>
                        <th className="px-3 py-2">IMEI 1</th>
                        <th className="px-3 py-2">IMEI 2</th>
                        <th className="px-3 py-2">Serial Number</th>
                        <th className="px-3 py-2">QC Result</th>
                        <th className="px-3 py-2">Assembled At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewOrder.unitsProduced.map((unit: any) => (
                        <tr key={unit.id} className="hover:bg-slate-50/50">
                          <td className="px-3 py-2 font-mono font-bold text-blue-700">{unit.imei1}</td>
                          <td className="px-3 py-2 font-mono text-slate-600">{unit.imei2 || "—"}</td>
                          <td className="px-3 py-2 font-mono text-slate-600">{unit.serialNumber || "—"}</td>
                          <td className="px-3 py-2">
                            <Badge tone={unit.qcResult === "PASS" ? "green" : "red"}>{unit.qcResult}</Badge>
                          </td>
                          <td className="px-3 py-2 text-slate-500">{formatDate(unit.createdAt, true)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end border-t px-6 py-4">
            <Button variant="outline" onClick={() => setViewOrder(null)}>
              Close
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

