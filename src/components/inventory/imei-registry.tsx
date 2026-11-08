"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Archive,
  ArrowRight,
  Barcode,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  DollarSign,
  Download,
  ExternalLink,
  FileSearch,
  FileText,
  History,
  Layers,
  Loader2,
  MapPin,
  PackageCheck,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Search,
  ShieldCheck,
  Smartphone,
  Truck,
  UserCheck,
  UserRound,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";
import { ImeiAuditModal } from "./imei-audit-modal";

type Row = {
  id: string;
  product: { id: string; sku: string; name: string; model: string | null; brand: { code: string; name: string } | null };
  variant: { id: string; sku: string; name: string; color: string | null; ramGb: number | null; storageGb: number | null; simConfiguration: string | null };
  imei1: string | null;
  imei2: string | null;
  identifiers: Array<{ id: string; type: string; value: string; slot: number | null; isPrimary: boolean }>;
  status: string;
  acquisitionDate: string;
  acquisitionCost: string | null;
  soldAt: string | null;
  currentBranch: { code: string; name: string } | null;
  currentWarehouse: { code: string; name: string } | null;
  currentLocation: { code: string; name: string } | null;
  purchase: { id: string; receiptNumber: string; receiptDate: string; supplierInvoiceNumber: string | null; supplier: { code: string; name: string }; purchaseOrder: { id: string; orderNumber: string } | null } | null;
  sale: { id: string; invoiceNumber: string; invoiceDate: string; customer: { code: string; name: string } } | null;
  lastMovement: { movementType: string; postingDate: string; sourceDocumentNumber: string; warehouse: { code: string; name: string } } | null;
};

type Meta = {
  page: number;
  pageSize: number;
  total: number;
  canViewCost: boolean;
  summary: Record<string, number>;
  warehouses: Array<{ id: string; code: string; name: string; branch: { code: string; name: string } }>;
};

type CompanyInfo = {
  name: string;
  legalName?: string | null;
  code?: string;
  taxRegistrationNumber?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  province?: string | null;
};

const blankMeta: Meta = { page: 1, pageSize: 25, total: 0, canViewCost: false, summary: {}, warehouses: [] };

function displayStatus(status: string) {
  if (status === "IN_STOCK") return "Available";
  return titleCase(status);
}

function statusTone(status: string) {
  if (status === "IN_STOCK") return "green" as const;
  if (["RESERVED", "IN_TRANSIT", "QUARANTINED"].includes(status)) return "amber" as const;
  if (["SOLD", "RETURNED", "SCRAPPED"].includes(status)) return "red" as const;
  return "slate" as const;
}

function movementLink(movement: { sourceDocumentType: string; sourceDocumentId: string }) {
  if (movement.sourceDocumentType === "PurchaseReceipt") return `/goods-receipts/${movement.sourceDocumentId}`;
  if (movement.sourceDocumentType === "SalesInvoice") return `/sales/${movement.sourceDocumentId}`;
  if (movement.sourceDocumentType === "StockReturn") return "/returns";
  return null;
}

export function ImeiRegistry({
  currency,
  company,
}: {
  currency: string;
  company?: CompanyInfo;
}) {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get("search") || "";
  const initialStatus = searchParams.get("status") || "";
  const initialWarehouse = searchParams.get("warehouseId") || "";

  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<Meta>(blankMeta);
  const [page, setPage] = useState(1);

  // Fast Hero IMEI Search
  const [heroImei, setHeroImei] = useState(initialSearch);
  const [heroSearching, setHeroSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Table filters
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);
  const [warehouseId, setWarehouseId] = useState(initialWarehouse);
  const [loading, setLoading] = useState(true);

  // Full Detail Modal
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [auditModalOpen, setAuditModalOpen] = useState(false);

  const load = useCallback(
    async (nextPage: number, nextSearch = search, nextStatus = status, nextWarehouse = warehouseId) => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(nextPage), pageSize: "25" });
      if (nextSearch) params.set("search", nextSearch);
      if (nextStatus) params.set("status", nextStatus);
      if (nextWarehouse) params.set("warehouseId", nextWarehouse);
      const response = await fetch(`/api/inventory/imei?${params}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      setLoading(false);
      if (!response.ok) return toast.error(body?.error?.message || "IMEI registry could not be loaded.");
      setRows(body.data || []);
      setMeta(body.meta || blankMeta);
      setPage(body.meta?.page || nextPage);
    },
    [search, status, warehouseId]
  );

  useEffect(() => {
    void load(1, initialSearch, initialStatus, initialWarehouse);
    const deviceId = searchParams.get("device");
    if (deviceId) void openDetail(deviceId);
    if (searchParams.get("focus") === "search" && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  async function openDetail(idOrImei: string) {
    const clean = idOrImei.trim();
    if (!clean) return;
    setDetailId(clean);
    setDetail(null);
    setDetailLoading(true);

    try {
      const response = await fetch(`/api/inventory/imei/${encodeURIComponent(clean)}`, {
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      setDetailLoading(false);
      if (!response.ok) {
        toast.error(body?.error?.message || `Device with identifier "${clean}" was not found.`);
        setDetailId(null);
        return;
      }
      setDetail(body.data);
    } catch {
      setDetailLoading(false);
      toast.error("Failed to load device history.");
      setDetailId(null);
    }
  }

  async function handleHeroSearch(event: FormEvent) {
    event.preventDefault();
    const query = heroImei.trim();
    if (!query) {
      toast.info("Please enter or scan an IMEI number.");
      return;
    }

    setHeroSearching(true);
    // Direct lookup by IMEI/serial
    try {
      const response = await fetch(`/api/inventory/imei/${encodeURIComponent(query)}`, {
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      setHeroSearching(false);

      if (response.ok && body?.data) {
        toast.success(`Handset found: ${body.data.product?.name || "IMEI Device"}`);
        setDetailId(body.data.id);
        setDetail(body.data);
      } else {
        // Fallback to table search
        toast.info(`Exact match not found. Filtering visible registry by "${query}"…`);
        setSearch(query);
        setSearchInput(query);
        setPage(1);
        void load(1, query, status, warehouseId);
      }
    } catch {
      setHeroSearching(false);
      setSearch(query);
      setSearchInput(query);
      void load(1, query, status, warehouseId);
    }
  }

  function applyTableSearch() {
    const value = searchInput.trim();
    setSearch(value);
    setPage(1);
    void load(1, value, status, warehouseId);
  }

  function changeStatus(value: string) {
    setStatus(value);
    setPage(1);
    void load(1, search, value, warehouseId);
  }

  function changeWarehouse(value: string) {
    setWarehouseId(value);
    setPage(1);
    void load(1, search, status, value);
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  }

  function exportVisible() {
    const headers = [
      "Product",
      "Brand",
      "Model",
      "Variant SKU",
      "Color",
      "Storage",
      "RAM",
      "IMEI 1",
      "IMEI 2",
      "Status",
      "Warehouse",
      "Supplier",
      "GRN",
      "Purchase date",
      ...(meta.canViewCost ? ["Acquisition cost"] : []),
      "Sales invoice",
      "Customer",
      "Sale date",
    ];
    const values = rows.map((row) => [
      row.product.name,
      row.product.brand?.name || "",
      row.product.model || "",
      row.variant.sku,
      row.variant.color || "",
      row.variant.storageGb ? `${row.variant.storageGb} GB` : "",
      row.variant.ramGb ? `${row.variant.ramGb} GB` : "",
      row.imei1 || "",
      row.imei2 || "",
      displayStatus(row.status),
      row.currentWarehouse?.code || "",
      row.purchase?.supplier.name || "",
      row.purchase?.receiptNumber || "",
      row.purchase?.receiptDate || row.acquisitionDate,
      ...(meta.canViewCost ? [row.acquisitionCost || ""] : []),
      row.sale?.invoiceNumber || "",
      row.sale?.customer.name || "",
      row.sale?.invoiceDate || "",
    ]);
    const csv = [headers, ...values]
      .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `imei-registry-page-${page}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const pages = Math.max(1, Math.ceil(meta.total / meta.pageSize));
  const metrics = useMemo(
    () => [
      { label: "Total Handsets", value: meta.total, tone: "bg-blue-50 text-blue-800", sub: "Serialized units" },
      { label: "Available in Stock", value: meta.summary.IN_STOCK || 0, tone: "bg-emerald-50 text-emerald-800", sub: "Ready for sale" },
      { label: "Reserved for Orders", value: meta.summary.RESERVED || 0, tone: "bg-amber-50 text-amber-800", sub: "Pending dispatch" },
      { label: "Sold to Customers", value: meta.summary.SOLD || 0, tone: "bg-purple-50 text-purple-800", sub: "Dispatched & billed" },
      { label: "Returns / Quarantined", value: (meta.summary.QUARANTINED || 0) + (meta.summary.RETURNED || 0), tone: "bg-rose-50 text-rose-800", sub: "In verification" },
    ],
    [meta]
  );

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="kicker">Serialized Handset Tracking</span>
            <Badge tone="green">Piece-Level Custody</Badge>
          </div>
          <h1 className="text-2xl font-black text-slate-950 sm:text-[30px]">IMEI Search & Lifecycle Registry</h1>
          <p className="mt-1.5 max-w-3xl text-sm text-slate-500">
            Search or scan any IMEI 1 or IMEI 2 to view the complete physical handset passport: receiving GRN, current custody, pricing, sales invoice, warranty history, and append-only ledger.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setAuditModalOpen(true)} className="gap-2">
            <FileSearch className="h-4 w-4 text-blue-600" />
            Audit & Duplicate Check
          </Button>
          <Button variant="outline" onClick={exportVisible} className="gap-2">
            <Download className="h-4 w-4" />
            Export Visible
          </Button>
          <Link
            href="/goods-receipts/new"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Receive IMEI Stock
          </Link>
        </div>
      </header>

      {/* HERO IMEI SEARCH BOX */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-blue-500/40 bg-gradient-to-r from-blue-900 via-slate-900 to-indigo-950 p-6 text-white shadow-xl">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500/20 text-blue-400 ring-1 ring-blue-400/30">
                <Smartphone className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-extrabold tracking-tight sm:text-lg">
                  Instant IMEI Handset Passport Lookup
                </h2>
                <p className="text-xs text-blue-200/80">
                  Scan barcode with handheld scanner or enter 15-digit IMEI 1, IMEI 2, or Serial Number
                </p>
              </div>
            </div>
            <span className="hidden rounded-full bg-blue-500/20 px-3 py-1 text-[11px] font-semibold text-blue-200 sm:inline-flex items-center gap-1.5">
              <QrCode className="h-3.5 w-3.5" /> Barcode Scanner Ready
            </span>
          </div>

          <form onSubmit={handleHeroSearch} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Barcode className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={heroImei}
                onChange={(e) => setHeroImei(e.target.value)}
                placeholder="Scan or type 15-digit IMEI (e.g. 356938035643809), Serial, or Barcode…"
                className="h-12 w-full rounded-xl border border-white/20 bg-white/10 pl-11 pr-10 font-mono text-sm font-bold text-white placeholder:text-slate-400 backdrop-blur-md outline-none transition focus:border-blue-400 focus:bg-white/15 focus:ring-2 focus:ring-blue-400/30"
              />
              {heroImei ? (
                <button
                  type="button"
                  onClick={() => setHeroImei("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <Button
              type="submit"
              size="lg"
              loading={heroSearching}
              className="h-12 bg-blue-500 px-6 font-bold text-white shadow-lg hover:bg-blue-400"
            >
              <Zap className="h-4 w-4 mr-1.5" />
              Instant Full Detail
            </Button>
          </form>

          {rows.length > 0 && !heroImei && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-blue-200/80">
              <span>Quick try recent IMEI:</span>
              {rows.slice(0, 3).map((r) =>
                r.imei1 ? (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setHeroImei(r.imei1 || "");
                      void openDetail(r.id);
                    }}
                    className="font-mono rounded bg-white/10 px-2 py-0.5 hover:bg-white/20 hover:text-white"
                  >
                    {r.imei1}
                  </button>
                ) : null
              )}
            </div>
          )}
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((item) => (
          <div key={item.label} className={`rounded-xl border border-white p-4 shadow-sm ${item.tone}`}>
            <p className="text-[10px] font-black uppercase tracking-wider opacity-70">{item.label}</p>
            <p className="mt-2 text-2xl font-black tabular-nums">{item.value}</p>
            <p className="mt-0.5 text-[10px] opacity-75">{item.sub}</p>
          </div>
        ))}
      </section>

      {/* REGISTRY TABLE SURFACE */}
      <section className="surface overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 xl:flex-row xl:items-center">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              applyTableSearch();
            }}
            className="relative min-w-0 flex-1 xl:max-w-xl"
          >
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-9 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="Search table by IMEI, SKU, model, GRN or invoice…"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                  void load(1, "", status, warehouseId);
                }}
                className="absolute right-2 top-2 rounded p-1 text-slate-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </form>

          <select
            value={status}
            onChange={(event) => changeStatus(event.target.value)}
            className="h-9 min-w-40 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-500"
          >
            <option value="">All statuses</option>
            <option value="IN_STOCK">Available (In Stock)</option>
            <option value="RESERVED">Reserved</option>
            <option value="IN_TRANSIT">In transit</option>
            <option value="SOLD">Sold</option>
            <option value="QUARANTINED">Quarantined</option>
            <option value="RETURNED">Returned</option>
            <option value="SCRAPPED">Scrapped</option>
          </select>

          <select
            value={warehouseId}
            onChange={(event) => changeWarehouse(event.target.value)}
            className="h-9 min-w-52 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-500"
          >
            <option value="">All permitted warehouses</option>
            {meta.warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.branch.code} · {warehouse.code} · {warehouse.name}
              </option>
            ))}
          </select>

          <Button type="button" variant="outline" onClick={applyTableSearch}>
            Filter
          </Button>
        </div>

        <div className={loading ? "min-h-72 opacity-50 transition" : "min-h-72 transition"}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1320px] text-left">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3">Device / Spec</th>
                  <th className="px-4 py-3">IMEI 1 (Primary)</th>
                  <th className="px-4 py-3">IMEI 2 (Secondary)</th>
                  <th className="px-4 py-3">Purchase Receipt (GRN)</th>
                  <th className="px-4 py-3">Current Custody</th>
                  <th className="px-4 py-3">Physical Status</th>
                  <th className="px-4 py-3">Sales Disposition</th>
                  {meta.canViewCost && <th className="px-4 py-3 text-right">Landed Cost</th>}
                  <th className="w-20 px-3 py-3 text-right">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && !rows.length ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-20 text-center text-xs text-slate-400">
                      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-blue-600" />
                      Loading IMEI inventory…
                    </td>
                  </tr>
                ) : !rows.length ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-20 text-center">
                      <Smartphone className="mx-auto h-9 w-9 text-slate-300" />
                      <p className="mt-3 text-sm font-bold text-slate-700">No IMEI devices match</p>
                      <p className="mt-1 text-xs text-slate-400">
                        Adjust search filters or receive stock via Goods Receiving.
                      </p>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => void openDetail(row.id)}
                      className="cursor-pointer text-xs transition hover:bg-blue-50/50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
                            <Smartphone className="h-4 w-4" />
                          </span>
                          <div>
                            <b className="font-bold text-slate-900">{row.product.name}</b>
                            <span className="mt-0.5 block text-[10px] text-slate-400">
                              {row.variant.sku} ·{" "}
                              {[row.variant.color, row.variant.storageGb ? `${row.variant.storageGb} GB` : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-800">
                        {row.imei1 ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5">{row.imei1}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">
                        {row.imei2 ? (
                          <span className="rounded bg-slate-50 px-1.5 py-0.5">{row.imei2}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.purchase ? (
                          <>
                            <b className="text-blue-700">{row.purchase.receiptNumber}</b>
                            <span className="block text-[10px] text-slate-400">
                              {row.purchase.supplier.name} · {formatDate(row.purchase.receiptDate)}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-400">Direct / Opening balance</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.currentWarehouse ? (
                          <>
                            <b>{row.currentWarehouse.code}</b>
                            <span className="block text-[10px] text-slate-400">
                              {row.currentBranch?.code}
                              {row.currentLocation ? ` · ${row.currentLocation.code}` : ""}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-400">Dispatched / Sold</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone(row.status)}>{displayStatus(row.status)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {row.sale ? (
                          <>
                            <b className="text-blue-700">{row.sale.invoiceNumber}</b>
                            <span className="block text-[10px] text-slate-400">
                              {row.sale.customer.name} · {formatDate(row.sale.invoiceDate)}
                            </span>
                          </>
                        ) : (
                          <span className="font-medium text-emerald-600">In Stock</span>
                        )}
                      </td>
                      {meta.canViewCost && (
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-700">
                          {formatMoney(row.acquisitionCost || 0, currency)}
                        </td>
                      )}
                      <td className="px-3 py-3 text-right">
                        <span className="inline-flex items-center gap-1 font-bold text-blue-600 hover:underline">
                          View <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <footer className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            Showing {meta.total ? (page - 1) * meta.pageSize + 1 : 0}–
            {Math.min(page * meta.pageSize, meta.total)} of {meta.total} handsets
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || loading}
              onClick={() => void load(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="min-w-20 text-center text-xs font-bold">
              Page {page} / {pages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pages || loading}
              onClick={() => void load(page + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </footer>
      </section>

      {/* FULL HANDSET DOSSIER & PASSPORT MODAL */}
      {detailId && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm transition-all"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailId(null);
          }}
        >
          <aside className="h-full w-full max-w-4xl overflow-y-auto bg-slate-50 shadow-2xl">
            {/* Modal Header */}
            <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
                  <Smartphone className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-700">
                      Physical Handset Passport
                    </span>
                    <Badge tone={detail ? statusTone(detail.status) : "slate"}>
                      {detail ? displayStatus(detail.status) : "Loading…"}
                    </Badge>
                  </div>
                  <h2 className="text-xl font-black text-slate-950">
                    {detail?.product?.name || "Handset Lifecycle"}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.print()}
                  className="gap-1.5"
                >
                  <Printer className="h-4 w-4" />
                  Print Dossier
                </Button>
                <button
                  onClick={() => setDetailId(null)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>

            {detailLoading ? (
              <div className="grid min-h-[60vh] place-items-center text-sm text-slate-400">
                <div className="text-center">
                  <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-blue-600" />
                  <p className="font-bold text-slate-700">Loading complete IMEI lifecycle…</p>
                  <p className="text-xs text-slate-400">Retrieving procurement, custody, sales, and movement audit logs</p>
                </div>
              </div>
            ) : detail ? (
              <div className="space-y-5 p-6">
                {/* Official Printable Header (Visible on print) */}
                <div className="hidden print:block border-b-2 border-slate-900 pb-4 mb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h1 className="text-xl font-black uppercase">{company?.legalName || company?.name || "AXON ERP"}</h1>
                      <p className="text-xs text-slate-600">{[company?.addressLine1, company?.city, company?.province].filter(Boolean).join(", ")}</p>
                      <p className="text-[11px] text-slate-500">NTN / Tax Reg: {company?.taxRegistrationNumber || "N/A"}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-xs font-bold text-blue-700 block">OFFICIAL HANDSET PASSPORT</span>
                      <p className="text-xs text-slate-600">Printed: {new Date().toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* 1. Device Core Specification Banner */}
                <div className="surface p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {detail.product?.brand?.name || "Handset"} · SKU: {detail.product?.sku}
                      </p>
                      <h3 className="mt-1 text-lg font-black text-slate-900">
                        {detail.product?.name}
                      </h3>
                      <p className="mt-1 text-xs text-slate-600">
                        {[
                          detail.variant?.color,
                          detail.variant?.storageGb ? `${detail.variant.storageGb} GB Storage` : null,
                          detail.variant?.ramGb ? `${detail.variant.ramGb} GB RAM` : null,
                          detail.variant?.simConfiguration,
                          detail.variant?.networkType,
                          detail.variant?.regionVariant,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 text-right">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          PTA DIRBS Status
                        </span>
                        <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                          <ShieldCheck className="h-3.5 w-3.5" /> PTA Compliant / Tax Paid
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Identifiers Grid */}
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {detail.identifiers?.map((item: any) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-xs"
                      >
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                            {item.type} {item.slot ? `(Slot ${item.slot})` : ""}{" "}
                            {item.isPrimary ? "• Primary" : ""}
                          </span>
                          <span className="font-mono text-sm font-black text-slate-900 tracking-wider">
                            {item.value}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(item.value, item.type)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          title="Copy to clipboard"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Key Status & Custody Cards */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="surface p-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Physical Custody
                    </span>
                    <p className="mt-1 text-sm font-black text-slate-900">
                      {detail.currentWarehouse
                        ? `${detail.currentBranch?.code} · ${detail.currentWarehouse.name}`
                        : "Dispatched from warehouse"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {detail.currentLocation ? `Bin / Location: ${detail.currentLocation.code}` : "Standard Shelf"}
                    </p>
                  </div>

                  <div className="surface p-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Acquisition Date
                    </span>
                    <p className="mt-1 text-sm font-black text-slate-900">
                      {formatDate(detail.acquisitionDate)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {Math.max(
                        0,
                        Math.floor((Date.now() - new Date(detail.acquisitionDate).getTime()) / 86400000)
                      )}{" "}
                      days in system
                    </p>
                  </div>

                  <div className="surface p-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Retail Selling Price
                    </span>
                    <p className="mt-1 font-mono text-sm font-black text-slate-900">
                      {formatMoney(detail.variant?.retailPrice || 0, currency)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      Floor: {formatMoney(detail.variant?.minimumSellingPrice || 0, currency)}
                    </p>
                  </div>

                  <div className="surface p-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Landed Unit Cost
                    </span>
                    <p className="mt-1 font-mono text-sm font-black text-slate-900">
                      {detail.canViewCost
                        ? formatMoney(detail.acquisitionCost || 0, currency)
                        : "Protected"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">Specific unit costing</p>
                  </div>
                </div>

                {/* 3. Procurement & Inward Origin Dossier */}
                <div className="surface overflow-hidden">
                  <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3">
                    <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-700">
                      <PackageCheck className="h-4 w-4 text-blue-600" />
                      Inward Procurement & Supplier Origin
                    </h4>
                  </div>
                  <div className="p-5">
                    {detail.receiptUnits?.length ? (
                      detail.receiptUnits.map((ru: any) => {
                        const receipt = ru.receiptLine?.receipt;
                        return (
                          <div key={ru.id} className="grid gap-4 sm:grid-cols-2">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                Origin Supplier
                              </span>
                              <p className="text-sm font-black text-slate-900">
                                {receipt?.supplier?.name || "Direct Vendor"}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                Code: {receipt?.supplier?.code} · Phone: {receipt?.supplier?.phone || "—"}
                              </p>
                              {receipt?.supplier?.taxNumber && (
                                <p className="text-[10px] text-slate-400">NTN: {receipt.supplier.taxNumber}</p>
                              )}
                            </div>

                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-slate-500">Goods Receipt Note (GRN):</span>
                                <Link
                                  href={`/goods-receipts/${receipt?.id}`}
                                  target="_blank"
                                  className="font-bold text-blue-700 hover:underline inline-flex items-center gap-1"
                                >
                                  {receipt?.receiptNumber} <ExternalLink className="h-3 w-3" />
                                </Link>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">Receipt Date:</span>
                                <span className="font-bold text-slate-800">{formatDate(receipt?.receiptDate)}</span>
                              </div>
                              {receipt?.purchaseOrder && (
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Purchase Order:</span>
                                  <Link
                                    href={`/purchases/${receipt.purchaseOrder.id}`}
                                    target="_blank"
                                    className="font-bold text-blue-700 hover:underline inline-flex items-center gap-1"
                                  >
                                    {receipt.purchaseOrder.orderNumber} <ExternalLink className="h-3 w-3" />
                                  </Link>
                                </div>
                              )}
                              {receipt?.supplierInvoiceNumber && (
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Supplier Invoice / Bill:</span>
                                  <span className="font-mono font-bold text-slate-800">
                                    {receipt.supplierInvoiceNumber}
                                  </span>
                                </div>
                              )}
                              {detail.canViewCost && ru.receiptLine?.landedUnitCost && (
                                <div className="flex justify-between border-t border-slate-100 pt-1">
                                  <span className="text-slate-500">Landed Inward Cost:</span>
                                  <span className="font-mono font-bold text-slate-900">
                                    {formatMoney(ru.receiptLine.landedUnitCost, currency)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-slate-400">No goods receipt link. Device created via opening balance or direct entry.</p>
                    )}
                  </div>
                </div>

                {/* 4. Sales & Customer Outward Dossier */}
                <div className="surface overflow-hidden">
                  <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3">
                    <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-700">
                      <UserRound className="h-4 w-4 text-emerald-600" />
                      Sales Outward & Customer Warranty Record
                    </h4>
                  </div>
                  <div className="p-5">
                    {detail.salesUnits?.length ? (
                      detail.salesUnits.map((su: any) => {
                        const inv = su.invoiceLine?.invoice;
                        return (
                          <div key={su.id} className="grid gap-4 sm:grid-cols-2">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                Customer Information
                              </span>
                              <p className="text-sm font-black text-slate-900">
                                {inv?.customer?.name || "Counter Customer"}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                Account: {inv?.customer?.code} · Contact: {inv?.customer?.phone || "—"}
                              </p>
                            </div>

                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-slate-500">Sales Invoice:</span>
                                <Link
                                  href={`/sales/${inv?.id}`}
                                  target="_blank"
                                  className="font-bold text-blue-700 hover:underline inline-flex items-center gap-1"
                                >
                                  {inv?.invoiceNumber} <ExternalLink className="h-3 w-3" />
                                </Link>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">Invoice Date:</span>
                                <span className="font-bold text-slate-800">{formatDate(inv?.invoiceDate)}</span>
                              </div>
                              {inv?.salesperson && (
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Sales Officer:</span>
                                  <span className="font-bold text-slate-800">{inv.salesperson.fullName}</span>
                                </div>
                              )}
                              {su.invoiceLine?.unitPrice && (
                                <div className="flex justify-between border-t border-slate-100 pt-1">
                                  <span className="text-slate-500">Selling Price:</span>
                                  <span className="font-mono font-bold text-emerald-700">
                                    {formatMoney(su.invoiceLine.unitPrice, currency)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        <div>
                          <p className="font-bold text-slate-800">Unsold Stock Unit</p>
                          <p className="text-slate-400">This handset is in active warehouse stock and has not been billed to any customer.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 5. Returns & Exchange Records (if any) */}
                {detail.returnUnits?.length > 0 && (
                  <div className="surface overflow-hidden">
                    <div className="border-b border-slate-100 bg-amber-50/50 px-5 py-3">
                      <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-800">
                        <RotateCcw className="h-4 w-4 text-amber-600" />
                        Return & Reverse Logistics History
                      </h4>
                    </div>
                    <div className="divide-y divide-slate-100 p-5">
                      {detail.returnUnits.map((ru: any) => {
                        const ret = ru.returnLine?.stockReturn;
                        return (
                          <div key={ru.id} className="flex justify-between py-2 text-xs">
                            <div>
                              <p className="font-bold text-slate-900">{ret?.returnNumber}</p>
                              <p className="text-slate-500">
                                {titleCase(ret?.returnType || "Return")} · Condition: {ru.returnLine?.condition || "Good"}
                              </p>
                              <p className="text-[10px] text-slate-400">Disposition: {ru.returnLine?.disposition}</p>
                            </div>
                            <div className="text-right">
                              <b>{formatDate(ret?.returnDate)}</b>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 6. Chronological Custody & Stock Movement Timeline */}
                <div className="surface overflow-hidden">
                  <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3">
                    <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-700">
                      <History className="h-4 w-4 text-blue-600" />
                      Append-Only Custody Movement Timeline
                    </h4>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {detail.movements?.length ? (
                      detail.movements.map((m: any) => {
                        const href = movementLink(m);
                        const isOut = String(m.quantity || "").startsWith("-");
                        return (
                          <div
                            key={m.id}
                            className="grid gap-3 p-4 sm:grid-cols-[130px_1fr_auto] text-xs hover:bg-slate-50/60"
                          >
                            <div>
                              <span className="font-bold text-slate-900">{formatDate(m.postingDate)}</span>
                              <span className="mt-0.5 block text-[10px] text-slate-400">
                                {m.warehouse?.code} ({m.branch?.code})
                              </span>
                            </div>

                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge tone={isOut ? "red" : "green"}>{titleCase(m.movementType)}</Badge>
                                {href ? (
                                  <Link
                                    href={href}
                                    target="_blank"
                                    className="font-bold text-blue-700 hover:underline inline-flex items-center gap-1"
                                  >
                                    {m.sourceDocumentNumber} <ExternalLink className="h-3 w-3" />
                                  </Link>
                                ) : (
                                  <span className="font-bold text-slate-800">{m.sourceDocumentNumber}</span>
                                )}
                              </div>
                              <p className="mt-1 text-[10px] text-slate-400">
                                Posted by {m.createdBy?.fullName || "System"}
                                {m.journalEntry?.voucherNumber ? ` · GL Voucher: ${m.journalEntry.voucherNumber}` : ""}
                              </p>
                            </div>

                            <div className="text-right">
                              <span
                                className={`font-mono font-bold ${
                                  isOut ? "text-rose-600" : "text-emerald-600"
                                }`}
                              >
                                {m.quantity}
                              </span>
                              {detail.canViewCost && m.totalCost && (
                                <span className="block font-mono text-[10px] text-slate-400">
                                  {formatMoney(m.totalCost, currency)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="p-4 text-xs text-slate-400">No stock movements recorded.</p>
                    )}
                  </div>
                </div>

                {/* Printable Verification Footer */}
                <div className="hidden print:block pt-8 mt-8 border-t border-slate-300">
                  <div className="grid grid-cols-3 gap-4 text-center text-xs">
                    <div>
                      <div className="border-b border-slate-400 h-10 mb-1" />
                      <p className="font-bold text-slate-800">Verified by Inventory Custodian</p>
                    </div>
                    <div>
                      <div className="border-b border-slate-400 h-10 mb-1" />
                      <p className="font-bold text-slate-800">Checked by Branch Manager</p>
                    </div>
                    <div>
                      <div className="border-b border-slate-400 h-10 mb-1" />
                      <p className="font-bold text-slate-800">Customer / Auditor Signature</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      )}

      {auditModalOpen && (
        <ImeiAuditModal onClose={() => setAuditModalOpen(false)} warehouses={meta.warehouses} />
      )}
    </div>
  );
}
