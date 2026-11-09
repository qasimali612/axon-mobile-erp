"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Archive,
  Barcode,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Filter,
  Layers,
  MoreHorizontal,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  Smartphone,
  Tag,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { responseError } from "@/components/ui/form-error";
import { formatMoney, titleCase } from "@/lib/utils";

type Reference = { id: string; name: string; code: string };
type Variant = {
  id: string;
  sku: string;
  name: string;
  color: string | null;
  ramGb: number | null;
  storageGb: number | null;
  networkType: string | null;
  simConfiguration: string | null;
  regionVariant: string | null;
  purchasePrice: string;
  wholesalePrice: string;
  retailPrice: string;
  minimumSellingPrice: string;
  isActive: boolean;
};
export type Product = {
  id: string;
  sku: string;
  name: string;
  model: string | null;
  modelCode: string | null;
  productType: string;
  trackingMethod: string;
  costingMethod: string;
  standardPurchasePrice: string;
  reorderLevel: string;
  maxStockLevel: string;
  description: string | null;
  preferredSupplier: Reference | null;
  status: string;
  brand: Reference | null;
  category: Reference;
  unit: Reference;
  variants: Variant[];
  barcodes: Array<{ id: string; barcode: string; variantId: string | null; isPrimary: boolean }>;
};

type FormState = {
  sku: string;
  name: string;
  model: string;
  modelCode: string;
  categoryId: string;
  brandId: string;
  unitId: string;
  productType: string;
  trackingMethod: string;
  costingMethod: string;
  standardPurchasePrice: string;
  reorderLevel: string;
  maxStockLevel: string;
  description: string;
  preferredSupplierId: string;
  variant: {
    sku: string;
    name: string;
    color: string;
    ramGb: string;
    storageGb: string;
    networkType: string;
    simConfiguration: string;
    regionVariant: string;
    purchasePrice: string;
    wholesalePrice: string;
    retailPrice: string;
    minimumSellingPrice: string;
    barcode: string;
  };
};

const emptyForm = (refs: { categories: Reference[]; brands: Reference[]; units: Reference[]; suppliers: Reference[] }): FormState => ({
  sku: "",
  name: "",
  model: "",
  modelCode: "",
  categoryId: refs.categories[0]?.id || "",
  brandId: refs.brands[0]?.id || "",
  unitId: refs.units[0]?.id || "",
  productType: "SMARTPHONE",
  trackingMethod: "IMEI",
  costingMethod: "SPECIFIC",
  standardPurchasePrice: "0",
  reorderLevel: "0",
  maxStockLevel: "0",
  description: "",
  preferredSupplierId: refs.suppliers[0]?.id || "",
  variant: {
    sku: "",
    name: "",
    color: "",
    ramGb: "",
    storageGb: "",
    networkType: "5G",
    simConfiguration: "Dual SIM",
    regionVariant: "Pakistan",
    purchasePrice: "0",
    wholesalePrice: "0",
    retailPrice: "0",
    minimumSellingPrice: "0",
    barcode: "",
  },
});

function formFromProduct(product: Product): FormState {
  const variant = product.variants[0];
  const barcode = product.barcodes.find((item) => item.variantId === variant?.id && item.isPrimary);
  return {
    sku: product.sku,
    name: product.name,
    model: product.model || "",
    modelCode: product.modelCode || "",
    categoryId: product.category.id,
    brandId: product.brand?.id || "",
    unitId: product.unit.id,
    productType: product.productType,
    trackingMethod: product.trackingMethod,
    costingMethod: product.costingMethod,
    standardPurchasePrice: product.standardPurchasePrice,
    reorderLevel: product.reorderLevel,
    maxStockLevel: product.maxStockLevel || "0",
    description: product.description || "",
    preferredSupplierId: product.preferredSupplier?.id || "",
    variant: {
      sku: variant?.sku || "",
      name: variant?.name || "",
      color: variant?.color || "",
      ramGb: variant?.ramGb?.toString() || "",
      storageGb: variant?.storageGb?.toString() || "",
      networkType: variant?.networkType || "",
      simConfiguration: variant?.simConfiguration || "",
      regionVariant: variant?.regionVariant || "",
      purchasePrice: variant?.purchasePrice || "0",
      wholesalePrice: variant?.wholesalePrice || "0",
      retailPrice: variant?.retailPrice || "0",
      minimumSellingPrice: variant?.minimumSellingPrice || "0",
      barcode: barcode?.barcode || "",
    },
  };
}

export function ProductCatalog({
  initialProducts,
  initialTotal,
  initialStats,
  refs,
  currency,
  permissions,
}: {
  initialProducts: Product[];
  initialTotal: number;
  initialStats?: { total: number; imei: number; quantity: number; brands: number; categories: number };
  refs: { categories: Reference[]; brands: Reference[]; units: Reference[]; suppliers: Reference[] };
  currency: string;
  permissions: string[];
}) {
  const searchParams = useSearchParams();
  const canCreate = permissions.includes("catalog.product.create");
  const canEdit = permissions.includes("catalog.product.edit");
  const canArchive = permissions.includes("catalog.product.archive");
  const canExport = permissions.includes("catalog.product.export");
  const canViewCost = permissions.includes("catalog.cost.view");
  const canChangePrice = permissions.includes("catalog.price.change");

  const [products, setProducts] = useState(initialProducts);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [tracking, setTracking] = useState("");
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(refs));
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [actionsId, setActionsId] = useState<string | null>(null);
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [formStep, setFormStep] = useState<"identity" | "variant" | "pricing">("identity");

  useEffect(() => {
    if (searchParams.get("new") === "1" && canCreate) openCreate();
    const editId = searchParams.get("edit");
    if (editId && canEdit) {
      const match = products.find((p) => p.id === editId);
      if (match) openEdit(match);
      else {
        fetch(`/api/products/${editId}`)
          .then((res) => res.json())
          .then((body) => {
            if (body.data) openEdit(body.data as Product);
          })
          .catch(() => undefined);
      }
    }
    const variantId = searchParams.get("variants");
    if (variantId) {
      const match = products.find((p) => p.id === variantId);
      if (match) setVariantProduct(match);
      else {
        fetch(`/api/products/${variantId}`)
          .then((res) => res.json())
          .then((body) => {
            if (body.data) setVariantProduct(body.data as Product);
          })
          .catch(() => undefined);
      }
    }
    const requestedSearch = searchParams.get("search")?.trim() || "";
    const requestedTracking = searchParams.get("tracking")?.trim() || "";
    if (requestedSearch || requestedTracking) {
      setSearchInput(requestedSearch);
      setSearch(requestedSearch);
      setTracking(requestedTracking);
      void load(1, requestedSearch, requestedTracking, status, brandId, categoryId, pageSize);
    }
    // Only react to URL intent when the page first resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(
    nextPage = page,
    nextSearch = search,
    nextTracking = tracking,
    nextStatus = status,
    nextBrandId = brandId,
    nextCategoryId = categoryId,
    nextPageSize = pageSize
  ) {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: String(nextPageSize),
      status: nextStatus,
    });
    if (nextSearch) params.set("search", nextSearch);
    if (nextTracking) params.set("tracking", nextTracking);
    if (nextBrandId) params.set("brandId", nextBrandId);
    if (nextCategoryId) params.set("categoryId", nextCategoryId);

    const response = await fetch(`/api/products?${params}`);
    setLoading(false);
    if (!response.ok) {
      toast.error(await responseError(response));
      return;
    }
    const body = await response.json();
    setProducts(body.data);
    setTotal(body.meta.total);
    setPage(body.meta.page);
  }

  function applyFilters() {
    setSearch(searchInput.trim());
    setPage(1);
    void load(1, searchInput.trim(), tracking, status, brandId, categoryId, pageSize);
  }

  function changeTracking(value: string) {
    setTracking(value);
    setPage(1);
    void load(1, search, value, status, brandId, categoryId, pageSize);
  }

  function changeBrand(value: string) {
    setBrandId(value);
    setPage(1);
    void load(1, search, tracking, status, value, categoryId, pageSize);
  }

  function changeCategory(value: string) {
    setCategoryId(value);
    setPage(1);
    void load(1, search, tracking, status, brandId, value, pageSize);
  }

  function changeStatus(value: string) {
    setStatus(value);
    setPage(1);
    void load(1, search, tracking, value, brandId, categoryId, pageSize);
  }

  function changePageSize(size: number) {
    setPageSize(size);
    setPage(1);
    void load(1, search, tracking, status, brandId, categoryId, size);
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(refs));
    setFormStep("identity");
    setFormOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setForm(formFromProduct(product));
    setFormStep("identity");
    setFormOpen(true);
    setActionsId(null);
  }

  function autoGenerateProductSku() {
    const brandObj = refs.brands.find((b) => b.id === form.brandId);
    const brandPart = (brandObj?.code || brandObj?.name?.slice(0, 3) || "GEN").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const modelPart = (form.modelCode || form.model || form.name || "DEV")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8);
    const rand = Math.floor(100 + Math.random() * 900);
    const generated = `${brandPart}-${modelPart || "PRD"}-${rand}`;
    setRoot("sku", generated);
    toast.success(`Generated Product SKU: ${generated}`);
  }

  function autoGenerateVariantSku() {
    const baseSku = form.sku || "PRD";
    const colorPart = (form.variant.color || "STD").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
    const storagePart = form.variant.storageGb ? `${form.variant.storageGb}G` : "STD";
    const rand = Math.floor(10 + Math.random() * 90);
    const generated = `${baseSku}-${storagePart}-${colorPart}-${rand}`;
    setVariant("sku", generated);
    toast.success(`Generated Variant SKU: ${generated}`);
  }

  function autoGenerateBarcode() {
    const prefix = "890";
    const middle = Math.floor(100000000 + Math.random() * 900000000).toString();
    const code12 = prefix + middle.slice(0, 9);
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(code12[i], 10) * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    const barcode = `${code12}${checkDigit}`;
    setVariant("barcode", barcode);
    toast.success(`Generated Barcode: ${barcode}`);
  }

  function setRoot<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  function setVariant<K extends keyof FormState["variant"]>(key: K, value: FormState["variant"][K]) {
    setForm((current) => ({ ...current, variant: { ...current.variant, [key]: value } }));
  }

  function changeProductType(value: string) {
    const phone = value === "SMARTPHONE" || value === "FEATURE_PHONE";
    setForm((current) => ({
      ...current,
      productType: value,
      trackingMethod: phone ? "IMEI" : current.trackingMethod === "IMEI" ? "QUANTITY" : current.trackingMethod,
      costingMethod: phone ? "SPECIFIC" : current.costingMethod === "SPECIFIC" ? "WEIGHTED_AVERAGE" : current.costingMethod,
    }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      brandId: form.brandId || null,
      variant: {
        ...form.variant,
        ramGb: form.variant.ramGb ? Number(form.variant.ramGb) : null,
        storageGb: form.variant.storageGb ? Number(form.variant.storageGb) : null,
      },
    };
    const response = await fetch(editing ? `/api/products/${editing.id}` : "/api/products", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!response.ok) {
      toast.error(await responseError(response));
      return;
    }
    toast.success(editing ? "Product updated" : "Product created");
    setFormOpen(false);
    await load(1, search, tracking, status);
  }

  async function archive() {
    if (!archiveTarget || archiveReason.trim().length < 5) return;
    setArchiveLoading(true);
    const response = await fetch(`/api/products/${archiveTarget.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: archiveReason }),
    });
    setArchiveLoading(false);
    if (!response.ok) {
      toast.error(await responseError(response));
      return;
    }
    toast.success("Product archived with an audit record");
    setArchiveTarget(null);
    setArchiveReason("");
    await load(1, search, tracking, status);
  }

  function exportCsv() {
    const headers = ["SKU", "Product", "Brand", "Model", "Variant SKU", "Color", "RAM GB", "Storage GB", "Tracking", "Retail price", ...(canViewCost ? ["Purchase price"] : [])];
    const rows = products.map((product) => {
      const variant = product.variants[0];
      return [product.sku, product.name, product.brand?.name || "", product.model || "", variant?.sku || "", variant?.color || "", variant?.ramGb || "", variant?.storageGb || "", product.trackingMethod, variant?.retailPrice || "", ...(canViewCost ? [variant?.purchasePrice || ""] : [])];
    });
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `product-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${products.length} visible records`);
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const summary = useMemo(() => ({ imei: products.filter((item) => item.trackingMethod === "IMEI").length, quantity: products.filter((item) => item.trackingMethod === "QUANTITY").length }), [products]);

  return (
    <>
      {/* Executive KPI Summary Cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Active SKUs</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600">
              <Layers className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">{initialStats?.total ?? total}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Catalog master records</p>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">IMEI Handsets</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <Smartphone className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-700">{initialStats?.imei ?? summary.imei}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Unique device tracking</p>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Quantity Stock</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-600">
              <PackageOpen className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-amber-700">{initialStats?.quantity ?? summary.quantity}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Accessories & spares</p>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Brands & Categories</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-purple-50 text-purple-600">
              <Tag className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-purple-700">
            {initialStats?.brands ?? refs.brands.length} <span className="text-sm font-normal text-slate-400">/ {initialStats?.categories ?? refs.categories.length}</span>
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">Active manufacturers</p>
        </div>
      </div>

      <div className="surface overflow-visible">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <form onSubmit={(event) => { event.preventDefault(); applyFilters(); }} className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9 pr-9"
                placeholder="Search SKU, name, model, barcode…"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    setSearch("");
                    void load(1, "", tracking, status, brandId, categoryId, pageSize);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </form>

            <div className="relative">
              <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <select
                className="select min-w-36 pl-9 text-xs"
                value={tracking}
                onChange={(event) => changeTracking(event.target.value)}
              >
                <option value="">All tracking</option>
                <option value="IMEI">IMEI tracked</option>
                <option value="SERIAL">Serial tracked</option>
                <option value="BATCH">Batch tracked</option>
                <option value="QUANTITY">Quantity tracked</option>
              </select>
            </div>

            <select
              className="select min-w-36 text-xs"
              value={brandId}
              onChange={(event) => changeBrand(event.target.value)}
            >
              <option value="">All Brands</option>
              {refs.brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            <select
              className="select min-w-36 text-xs"
              value={categoryId}
              onChange={(event) => changeCategory(event.target.value)}
            >
              <option value="">All Categories</option>
              {refs.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              className="select min-w-28 text-xs"
              value={status}
              onChange={(event) => changeStatus(event.target.value)}
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="ARCHIVED">Archived</option>
              <option value="ALL">All statuses</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <select
              className="select h-9 text-xs"
              value={pageSize}
              onChange={(e) => changePageSize(Number(e.target.value))}
            >
              <option value={10}>10 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
            {canExport ? (
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="h-4 w-4" />
                Export
              </Button>
            ) : null}
            {canCreate ? (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                New product
              </Button>
            ) : null}
          </div>
        </div>

        <div className={loading ? "opacity-50 transition" : "transition"}>
          {products.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px]">
                <thead className="table-head"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Variant</th><th className="px-4 py-3">Tracking</th><th className="px-4 py-3">Category</th>{canViewCost ? <th className="px-4 py-3 text-right">Cost</th> : null}<th className="px-4 py-3 text-right">Retail</th><th className="px-4 py-3">Status</th><th className="w-14 px-4 py-3" /></tr></thead>
                <tbody>
                  {products.map((product) => {
                    const variant = product.variants[0];
                    const barcode = product.barcodes.find((item) => item.variantId === variant?.id && item.isPrimary);
                    return (
                      <tr key={product.id} className="group hover:bg-slate-50/60">
                        <td className="table-cell"><div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">{["SMARTPHONE", "FEATURE_PHONE", "TABLET"].includes(product.productType) ? <Smartphone className="h-[18px] w-[18px]" /> : <PackageOpen className="h-[18px] w-[18px]" />}</span><div><Link href={`/catalog/products/${product.id}`} className="max-w-[260px] truncate font-semibold text-slate-800 hover:text-blue-700 hover:underline block">{product.name}</Link><p className="mt-1 font-mono text-[10px] text-slate-400">{product.sku}{product.modelCode ? ` · ${product.modelCode}` : ""}</p></div></div></td>
                        <td className="table-cell">
                          <p className="text-xs font-semibold text-slate-800">{variant?.name || "No variant"}</p>
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            {[variant?.color, variant?.ramGb ? `${variant.ramGb} GB RAM` : null, variant?.storageGb ? `${variant.storageGb} GB` : null]
                              .filter(Boolean)
                              .join(" · ") || "Standard"}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setVariantProduct(product)}
                              className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 hover:bg-blue-100 hover:border-blue-300"
                              title="Click to view and add variations"
                            >
                              <Layers className="h-3 w-3" />
                              {product.variants.length} {product.variants.length === 1 ? "variant" : "variants"} · Manage
                            </button>
                            {barcode ? (
                              <span className="flex items-center gap-1 font-mono text-[9px] text-slate-400">
                                <Barcode className="h-3 w-3" />
                                {barcode.barcode}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="table-cell"><Badge tone={product.trackingMethod === "IMEI" ? "green" : product.trackingMethod === "BATCH" ? "amber" : "slate"}>{titleCase(product.trackingMethod)}</Badge></td>
                        <td className="table-cell"><p className="text-xs text-slate-600">{product.category.name}</p><p className="mt-1 text-[10px] text-slate-400">{product.brand?.name || "Unbranded"}</p></td>
                        {canViewCost ? <td className="table-cell text-right font-mono text-xs text-slate-600">{formatMoney(variant?.purchasePrice || 0, currency)}</td> : null}
                        <td className="table-cell text-right"><p className="font-mono text-xs font-semibold text-slate-800">{formatMoney(variant?.retailPrice || 0, currency)}</p><p className="mt-1 text-[9px] text-slate-400">Min {formatMoney(variant?.minimumSellingPrice || 0, currency)}</p></td>
                        <td className="table-cell"><Badge tone={product.status === "ACTIVE" ? "green" : product.status === "ARCHIVED" ? "red" : "amber"}>{titleCase(product.status)}</Badge></td>
                        <td className="table-cell relative"><button onClick={() => setActionsId(actionsId === product.id ? null : product.id)} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700 hover:shadow"><MoreHorizontal className="h-4 w-4" /></button>{actionsId === product.id ? <div className="absolute right-8 top-10 z-20 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-float"><Link href={`/catalog/products/${product.id}`} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"><Eye className="h-3.5 w-3.5" />View details</Link>{canEdit && product.status !== "ARCHIVED" ? <button onClick={() => { setVariantProduct(product); setActionsId(null); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"><Plus className="h-3.5 w-3.5" />Manage variants</button> : null}{canEdit && product.status !== "ARCHIVED" ? <button onClick={() => openEdit(product)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5" />Edit product</button> : null}{canArchive && product.status !== "ARCHIVED" ? <button onClick={() => { setArchiveTarget(product); setActionsId(null); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-red-600 hover:bg-red-50"><Archive className="h-3.5 w-3.5" />Archive</button> : null}</div> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <EmptyState icon={PackageOpen} title="No products match" description="Adjust the filters or add a properly tracked product master." action={canCreate ? <Button onClick={openCreate}><Plus className="h-4 w-4" />New product</Button> : undefined} />}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-slate-400">
            Showing {products.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} of {total} products
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              disabled={page <= 1 || loading}
              onClick={() => {
                setPage(page - 1);
                void load(page - 1, search, tracking, status, brandId, categoryId, pageSize);
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-xs font-semibold text-slate-600">
              Page {page} / {pages}
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={page >= pages || loading}
              onClick={() => {
                setPage(page + 1);
                void load(page + 1, search, tracking, status, brandId, categoryId, pageSize);
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Edit product master" : "Create product master"} description="Enterprise catalog record with enforced tracking policy and sellable variant specifications." size="xl">
        <form onSubmit={save}>
          {/* 3-Step Segmented Navigation Header */}
          <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-3 sm:px-6">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setFormStep("identity")}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-bold transition ${
                  formStep === "identity"
                    ? "bg-white text-blue-700 shadow-sm border border-slate-200"
                    : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
                }`}
              >
                <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${
                  formStep === "identity" ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"
                }`}>
                  1
                </span>
                <span className="truncate">01 · Identity</span>
              </button>

              <button
                type="button"
                onClick={() => setFormStep("variant")}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-bold transition ${
                  formStep === "variant"
                    ? "bg-white text-blue-700 shadow-sm border border-slate-200"
                    : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
                }`}
              >
                <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${
                  formStep === "variant" ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"
                }`}>
                  2
                </span>
                <span className="truncate">02 · Variant & Specs</span>
              </button>

              <button
                type="button"
                onClick={() => setFormStep("pricing")}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-bold transition ${
                  formStep === "pricing"
                    ? "bg-white text-blue-700 shadow-sm border border-slate-200"
                    : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
                }`}
              >
                <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${
                  formStep === "pricing" ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"
                }`}>
                  3
                </span>
                <span className="truncate">03 · Commercial Policy</span>
              </button>
            </div>
          </div>

          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-12">
            {/* Main Form Fields Column */}
            <div className="space-y-6 lg:col-span-8">
              {formStep === "identity" && (
                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Product Identity & Classification</h3>
                    <p className="text-xs text-slate-500">Define core brand, model, and physical tracking policy.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Product SKU" required>
                      <div className="flex gap-2">
                        <input className="input font-mono uppercase flex-1" value={form.sku} onChange={(e) => setRoot("sku", e.target.value.toUpperCase())} required />
                        <button
                          type="button"
                          onClick={autoGenerateProductSku}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-xs font-bold text-blue-700 hover:bg-blue-100"
                          title="Auto-generate standard SKU from Brand & Model"
                        >
                          <Zap className="h-3.5 w-3.5" /> Auto-Gen
                        </button>
                      </div>
                    </Field>
                    <Field label="Product name" required>
                      <input className="input" placeholder="e.g. iPhone 15 Pro Max" value={form.name} onChange={(e) => setRoot("name", e.target.value)} required />
                    </Field>
                    <Field label="Category" required>
                      <select className="select" value={form.categoryId} onChange={(e) => setRoot("categoryId", e.target.value)}>
                        {refs.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Brand">
                      <select className="select" value={form.brandId} onChange={(e) => setRoot("brandId", e.target.value)}>
                        <option value="">Unbranded</option>
                        {refs.brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Product type" required>
                      <select className="select" value={form.productType} onChange={(e) => changeProductType(e.target.value)}>
                        {["SMARTPHONE", "FEATURE_PHONE", "TABLET", "SMARTWATCH", "ACCESSORY", "SPARE_PART", "SERVICE", "OTHER"].map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
                      </select>
                    </Field>
                    <Field label="Tracking method" required>
                      <select className="select" value={form.trackingMethod} disabled={["SMARTPHONE", "FEATURE_PHONE"].includes(form.productType)} onChange={(e) => setRoot("trackingMethod", e.target.value)}>
                        {["IMEI", "SERIAL", "BATCH", "QUANTITY"].map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
                      </select>
                      {["SMARTPHONE", "FEATURE_PHONE"].includes(form.productType) && (
                        <p className="mt-1 text-[10px] font-semibold text-emerald-700">
                          🔒 Locked to IMEI: Enforced for cellular devices & PTA passport.
                        </p>
                      )}
                    </Field>
                    <Field label="Model">
                      <input className="input" placeholder="e.g. A3106" value={form.model} onChange={(e) => setRoot("model", e.target.value)} />
                    </Field>
                    <Field label="Model code">
                      <input className="input" placeholder="e.g. MQ023ZP/A" value={form.modelCode} onChange={(e) => setRoot("modelCode", e.target.value)} />
                    </Field>
                    <Field label="Base selling unit">
                      <select className="select" value={form.unitId} onChange={(e) => setRoot("unitId", e.target.value)}>
                        {refs.units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Description" wide>
                      <textarea className="input min-h-[64px]" placeholder="Optional product description or notes" value={form.description} onChange={(e) => setRoot("description", e.target.value)} />
                    </Field>
                  </div>
                </section>
              )}

              {formStep === "variant" && (
                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Sellable Variant & Technical Specifications</h3>
                    <p className="text-xs text-slate-500">Every master record starts with at least one active sellable variant.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Variant SKU" required>
                      <div className="flex gap-2">
                        <input className="input font-mono uppercase flex-1" value={form.variant.sku} onChange={(e) => setVariant("sku", e.target.value.toUpperCase())} required />
                        <button
                          type="button"
                          onClick={autoGenerateVariantSku}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-xs font-bold text-blue-700 hover:bg-blue-100"
                          title="Auto-generate variant SKU from Product SKU & Specs"
                        >
                          <Zap className="h-3.5 w-3.5" /> Auto-Gen
                        </button>
                      </div>
                    </Field>
                    <Field label="Variant name" required>
                      <input className="input" placeholder="e.g. 256 GB · Titanium Black" value={form.variant.name} onChange={(e) => setVariant("name", e.target.value)} required />
                    </Field>
                    <Field label="Color finish">
                      <input className="input" placeholder="e.g. Natural Titanium / Black" value={form.variant.color} onChange={(e) => setVariant("color", e.target.value)} />
                    </Field>
                    <Field label="Barcode (EAN-13 / Code-128)">
                      <div className="flex gap-2">
                        <input className="input font-mono flex-1" placeholder="Scan or enter barcode" value={form.variant.barcode} onChange={(e) => setVariant("barcode", e.target.value)} />
                        <button
                          type="button"
                          onClick={autoGenerateBarcode}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                          title="Auto-generate valid EAN-13 Barcode"
                        >
                          <Barcode className="h-3.5 w-3.5" /> EAN-13
                        </button>
                      </div>
                    </Field>
                    <Field label="RAM (GB)">
                      <input type="number" min="0" className="input" placeholder="e.g. 8" value={form.variant.ramGb} onChange={(e) => setVariant("ramGb", e.target.value)} />
                    </Field>
                    <Field label="Storage (GB)">
                      <input type="number" min="0" className="input" placeholder="e.g. 256" value={form.variant.storageGb} onChange={(e) => setVariant("storageGb", e.target.value)} />
                    </Field>
                    <Field label="Network technology">
                      <input className="input" placeholder="5G / 4G LTE" value={form.variant.networkType} onChange={(e) => setVariant("networkType", e.target.value)} />
                    </Field>
                    <Field label="SIM configuration">
                      <input className="input" placeholder="Dual SIM (Physical + eSIM)" value={form.variant.simConfiguration} onChange={(e) => setVariant("simConfiguration", e.target.value)} />
                    </Field>
                    <Field label="Market / Region variant">
                      <input className="input" placeholder="Pakistan PTA Approved" value={form.variant.regionVariant} onChange={(e) => setVariant("regionVariant", e.target.value)} />
                    </Field>
                    <Field label="Preferred supplier">
                      <select className="select" value={form.preferredSupplierId} onChange={(e) => setRoot("preferredSupplierId", e.target.value)}>
                        <option value="">Not assigned</option>
                        {refs.suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Reorder threshold">
                      <input inputMode="decimal" className="input" placeholder="Min stock quantity" value={form.reorderLevel} onChange={(e) => setRoot("reorderLevel", e.target.value)} />
                    </Field>
                    <Field label="Max capacity limit">
                      <input inputMode="decimal" className="input" placeholder="Max stock quantity" value={form.maxStockLevel} onChange={(e) => setRoot("maxStockLevel", e.target.value)} />
                    </Field>
                  </div>
                </section>
              )}

              {formStep === "pricing" && (
                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Commercial Policy & Cost Valuation</h3>
                    <p className="text-xs text-slate-500">Configure standard costs, selling prices, and mandatory selling floor.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Valuation costing method">
                      <select className="select" value={form.costingMethod} onChange={(e) => setRoot("costingMethod", e.target.value)}>
                        <option value="SPECIFIC">Specific unit cost (IMEI serialized)</option>
                        <option value="FIFO">First-In First-Out (FIFO)</option>
                        <option value="WEIGHTED_AVERAGE">Weighted Average Cost</option>
                      </select>
                      {form.costingMethod === "SPECIFIC" && (
                        <p className="mt-1 text-[10px] text-blue-700">
                          ℹ️ Specific Costing tracks exact landing purchase cost per physical IMEI handset.
                        </p>
                      )}
                    </Field>
                    <Field label="Standard purchase cost">
                      <MoneyInput value={form.standardPurchasePrice} onChange={(value) => setRoot("standardPurchasePrice", value)} disabled={editing !== null && !canViewCost} />
                    </Field>
                    <Field label="Variant purchase cost">
                      <MoneyInput value={form.variant.purchasePrice} onChange={(value) => setVariant("purchasePrice", value)} disabled={editing !== null && !canViewCost} />
                    </Field>
                    <Field label="Wholesale price">
                      <MoneyInput value={form.variant.wholesalePrice} onChange={(value) => setVariant("wholesalePrice", value)} disabled={editing !== null && !canChangePrice} />
                    </Field>
                    <Field label="Retail selling price">
                      <MoneyInput value={form.variant.retailPrice} onChange={(value) => setVariant("retailPrice", value)} disabled={editing !== null && !canChangePrice} />
                    </Field>
                    <Field label="Minimum price floor">
                      <MoneyInput value={form.variant.minimumSellingPrice} onChange={(value) => setVariant("minimumSellingPrice", value)} disabled={editing !== null && !canChangePrice} />
                    </Field>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    <p className="font-semibold text-slate-800">Commercial Policy Safeguard:</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Sales invoice lines cannot be priced below the Minimum Selling Floor without documented supervisor override. All values are stored with exact decimal precision (19,4).
                    </p>
                  </div>
                </section>
              )}
            </div>

            {/* Live Product Card Preview Column */}
            <div className="lg:col-span-4">
              <div className="sticky top-4 space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Live Catalog Preview
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      Active Preview
                    </span>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-white">
                      <div className="flex items-center justify-between">
                        <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                          {refs.categories.find((c) => c.id === form.categoryId)?.name || "Category"}
                        </span>
                        <span className="font-mono text-[10px] text-blue-300">
                          {refs.brands.find((b) => b.id === form.brandId)?.name || "Unbranded"}
                        </span>
                      </div>
                      <h4 className="mt-2 text-base font-bold text-white">
                        {form.name || "Product Name"}
                      </h4>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-300">
                        <span className="font-mono">{form.sku || "PENDING-SKU"}</span>
                        {form.model && <span>· {form.model}</span>}
                      </div>
                    </div>

                    <div className="p-3.5 space-y-3">
                      {/* Tracking & Costing Pills */}
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                          form.trackingMethod === "IMEI" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-700"
                        }`}>
                          {form.trackingMethod === "IMEI" ? <Smartphone className="h-3 w-3" /> : <PackageOpen className="h-3 w-3" />}
                          {form.trackingMethod} Tracking
                        </span>
                        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-mono text-slate-600">
                          {form.costingMethod}
                        </span>
                      </div>

                      {/* Variant Specifications */}
                      <div className="rounded-lg bg-slate-50 p-2.5 text-xs space-y-1.5">
                        <div className="font-semibold text-slate-800">
                          {form.variant.name || "Default Variant"}
                          <span className="ml-1 font-mono text-[10px] text-slate-400">({form.variant.sku || "VAR-SKU"})</span>
                        </div>
                        <div className="flex flex-wrap gap-1 text-[10px]">
                          {form.variant.color && <span className="rounded bg-white px-1.5 py-0.5 border border-slate-200 font-medium text-slate-700">🎨 {form.variant.color}</span>}
                          {(form.variant.ramGb || form.variant.storageGb) && (
                            <span className="rounded bg-white px-1.5 py-0.5 border border-slate-200 font-mono text-slate-700">
                              ⚡ {form.variant.ramGb ? `${form.variant.ramGb}GB / ` : ""}{form.variant.storageGb ? `${form.variant.storageGb}GB` : ""}
                            </span>
                          )}
                          {form.variant.networkType && <span className="rounded bg-white px-1.5 py-0.5 border border-slate-200 font-medium text-slate-700">📶 {form.variant.networkType}</span>}
                          {form.variant.simConfiguration && <span className="rounded bg-white px-1.5 py-0.5 border border-slate-200 font-medium text-slate-700">📱 {form.variant.simConfiguration}</span>}
                          {form.variant.regionVariant && <span className="rounded bg-white px-1.5 py-0.5 border border-slate-200 font-medium text-slate-700">🌍 {form.variant.regionVariant}</span>}
                        </div>
                      </div>

                      {/* Commercial Pricing Box */}
                      <div className="rounded-lg border border-slate-100 bg-white p-2.5 text-xs">
                        <div className="flex items-center justify-between text-slate-500">
                          <span>Retail Price</span>
                          <b className="font-mono text-slate-900">{formatMoney(Number(form.variant.retailPrice || 0), currency)}</b>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                          <span>Wholesale Price</span>
                          <span className="font-mono font-medium text-slate-600">{formatMoney(Number(form.variant.wholesalePrice || 0), currency)}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                          <span>Min Selling Floor</span>
                          <span className="font-mono font-medium text-rose-600">{formatMoney(Number(form.variant.minimumSellingPrice || 0), currency)}</span>
                        </div>
                        {canViewCost && Number(form.variant.purchasePrice || 0) > 0 && Number(form.variant.retailPrice || 0) > 0 && (
                          <div className="mt-2 border-t border-slate-100 pt-1.5 flex items-center justify-between text-[10px] text-emerald-700 font-semibold">
                            <span>Est. Gross Margin</span>
                            <span>
                              {Math.round(((Number(form.variant.retailPrice) - Number(form.variant.purchasePrice)) / Number(form.variant.retailPrice)) * 100)}%
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Barcode Visual */}
                      {form.variant.barcode ? (
                        <div className="rounded-lg border border-slate-200 bg-white p-2 text-center">
                          <div className="flex items-center justify-center gap-1 font-mono text-[10px] text-slate-600">
                            <Barcode className="h-4 w-4 text-slate-700" />
                            <span className="tracking-widest font-bold">{form.variant.barcode}</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stepped Modal Footer */}
          <div className="sticky bottom-0 flex items-center justify-between border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
            <div>
              {formStep !== "identity" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFormStep(formStep === "pricing" ? "variant" : "identity")}
                >
                  ← Back
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                  Cancel
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {formStep === "identity" && (
                <Button
                  type="button"
                  onClick={() => {
                    if (!form.sku || !form.name) {
                      toast.error("Please provide a Product SKU and Name to continue.");
                      return;
                    }
                    setFormStep("variant");
                  }}
                >
                  Next: Variant & Specs →
                </Button>
              )}

              {formStep === "variant" && (
                <Button
                  type="button"
                  onClick={() => {
                    if (!form.variant.sku || !form.variant.name) {
                      toast.error("Please provide a Variant SKU and Name to continue.");
                      return;
                    }
                    setFormStep("pricing");
                  }}
                >
                  Next: Commercial Policy →
                </Button>
              )}

              <Button type="submit" loading={saving}>
                {editing ? "Save changes" : "Create product master"}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <VariantManager product={variantProduct} currency={currency} canViewCost={canViewCost} canChangePrice={canChangePrice} onClose={() => setVariantProduct(null)} onChanged={async () => { await load(page, search, tracking, status); }}/>

      <Modal open={Boolean(archiveTarget)} onClose={() => setArchiveTarget(null)} title="Archive product" description="Archived products remain in historical records and cannot be selected for new transactions." size="md">
        <div className="p-6"><div className="rounded-xl bg-red-50 p-4 text-sm text-red-800"><strong>{archiveTarget?.name}</strong><span className="mt-1 block text-xs text-red-700/70">{archiveTarget?.sku}</span></div><label className="label mt-5">Reason for archive <span className="text-red-500">*</span></label><textarea className="textarea" placeholder="Provide an auditable reason (minimum 5 characters)" value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} /><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setArchiveTarget(null)}>Cancel</Button><Button variant="danger" loading={archiveLoading} disabled={archiveReason.trim().length < 5} onClick={archive}><Archive className="h-4 w-4" />Archive product</Button></div></div>
      </Modal>
    </>
  );
}

type VariantDraft = { sku: string; name: string; color: string; ramGb: string; storageGb: string; networkType: string; simConfiguration: string; regionVariant: string; purchasePrice: string; wholesalePrice: string; retailPrice: string; minimumSellingPrice: string; isActive: boolean; barcodeText: string };
const blankVariant = (): VariantDraft => ({ sku: "", name: "", color: "", ramGb: "", storageGb: "", networkType: "", simConfiguration: "", regionVariant: "", purchasePrice: "0", wholesalePrice: "0", retailPrice: "0", minimumSellingPrice: "0", isActive: true, barcodeText: "" });
function VariantManager({
  product: initial,
  currency,
  canViewCost,
  canChangePrice: _canChangePrice,
  onClose,
  onChanged,
}: {
  product: Product | null;
  currency: string;
  canViewCost: boolean;
  canChangePrice: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [product, setProduct] = useState<Product | null>(initial);
  const [editing, setEditing] = useState<Variant | "new" | null>(null);
  const [draft, setDraft] = useState<VariantDraft>(blankVariant());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setProduct(initial);
    setEditing(null);
  }, [initial]);

  function autoGenSku() {
    if (!product) return;
    const base = product.sku || "PRD";
    const colorPart = (draft.color || "STD").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
    const storagePart = draft.storageGb ? `${draft.storageGb}G` : "STD";
    const rand = Math.floor(10 + Math.random() * 90);
    const generated = `${base}-${storagePart}-${colorPart}-${rand}`;
    patch("sku", generated);
    toast.success(`Generated SKU: ${generated}`);
  }

  function autoGenBarcode() {
    const prefix = "890";
    const middle = Math.floor(100000000 + Math.random() * 900000000).toString();
    const code12 = prefix + middle.slice(0, 9);
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(code12[i], 10) * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    const barcode = `${code12}${checkDigit}`;
    patch("barcodeText", draft.barcodeText ? `${draft.barcodeText}\n${barcode}` : barcode);
    toast.success(`Generated Barcode: ${barcode}`);
  }

  function suggestName() {
    if (!product) return;
    const parts = [
      product.name,
      draft.storageGb ? `${draft.storageGb}GB` : null,
      draft.ramGb ? `${draft.ramGb}GB RAM` : null,
      draft.color || null,
      draft.regionVariant || null,
    ].filter(Boolean);
    const suggested = parts.join(" ");
    patch("name", suggested);
    toast.success(`Generated Name: ${suggested}`);
  }

  function copyFromPrimary() {
    const primary = product?.variants[0];
    if (!primary) return;
    setDraft((current) => ({
      ...current,
      purchasePrice: primary.purchasePrice,
      wholesalePrice: primary.wholesalePrice,
      retailPrice: primary.retailPrice,
      minimumSellingPrice: primary.minimumSellingPrice,
      networkType: primary.networkType || current.networkType,
      simConfiguration: primary.simConfiguration || current.simConfiguration,
      regionVariant: primary.regionVariant || current.regionVariant,
    }));
    toast.success("Copied commercial policy from default variant");
  }

  function openVariant(variant: Variant | "new") {
    setEditing(variant);
    if (variant === "new") {
      const primary = product?.variants[0];
      setDraft({
        ...blankVariant(),
        networkType: primary?.networkType || "5G",
        simConfiguration: primary?.simConfiguration || "Dual SIM",
        regionVariant: primary?.regionVariant || "Pakistan",
        purchasePrice: primary?.purchasePrice || "0",
        wholesalePrice: primary?.wholesalePrice || "0",
        retailPrice: primary?.retailPrice || "0",
        minimumSellingPrice: primary?.minimumSellingPrice || "0",
      });
    } else {
      const barcodes = (product?.barcodes || [])
        .filter((item) => item.variantId === variant.id)
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
      setDraft({
        sku: variant.sku,
        name: variant.name,
        color: variant.color || "",
        ramGb: variant.ramGb?.toString() || "",
        storageGb: variant.storageGb?.toString() || "",
        networkType: variant.networkType || "",
        simConfiguration: variant.simConfiguration || "",
        regionVariant: variant.regionVariant || "",
        purchasePrice: variant.purchasePrice,
        wholesalePrice: variant.wholesalePrice,
        retailPrice: variant.retailPrice,
        minimumSellingPrice: variant.minimumSellingPrice,
        isActive: variant.isActive,
        barcodeText: barcodes.map((item) => item.barcode).join("\n"),
      });
    }
  }

  function patch(key: keyof VariantDraft, value: string | boolean) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function refresh() {
    if (!product) return;
    const response = await fetch(`/api/products/${product.id}`);
    if (response.ok) {
      const body = await response.json();
      setProduct(body.data);
    }
    await onChanged();
  }

  async function saveVariant(event: React.FormEvent) {
    event.preventDefault();
    if (!product || !editing) return;
    const barcodes = draft.barcodeText
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((barcode, index) => ({
        barcode,
        type: barcode.length === 13 ? "EAN13" : "CODE128",
        isPrimary: index === 0,
      }));
    const { barcodeText: _barcodeText, ...fields } = draft;
    void _barcodeText;
    const payload = {
      ...fields,
      ramGb: draft.ramGb ? Number(draft.ramGb) : null,
      storageGb: draft.storageGb ? Number(draft.storageGb) : null,
      barcodes,
    };
    setSaving(true);
    const response = await fetch(
      editing === "new" ? `/api/products/${product.id}/variants` : `/api/products/${product.id}/variants/${editing.id}`,
      {
        method: editing === "new" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    setSaving(false);
    if (!response.ok) return toast.error(await responseError(response));
    toast.success(editing === "new" ? "Variant created successfully" : "Variant updated successfully");
    setEditing(null);
    await refresh();
  }

  return (
    <>
      <Modal
        open={Boolean(initial)}
        onClose={onClose}
        title={product ? `${product.sku} · ${product.name}` : "Product variants"}
        description="Maintain every sellable configuration, storage, color, and scanner barcodes."
        size="xl"
      >
        {product ? (
          <div className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-700">
                  {product.variants.length} Sellable {product.variants.length === 1 ? "Configuration" : "Configurations"}
                </p>
                <p className="text-[11px] text-slate-400">Add colors, RAM/storage combinations, or regional models</p>
              </div>
              <Button onClick={() => openVariant("new")} className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add new variation
              </Button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[860px] text-left text-xs">
                <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Variant</th>
                    <th className="px-4 py-3">Configuration</th>
                    <th className="px-4 py-3">Barcodes</th>
                    {canViewCost ? <th className="px-4 py-3 text-right">Cost</th> : null}
                    <th className="px-4 py-3 text-right">Retail / Minimum</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {product.variants.map((variant) => {
                    const barcodes = product.barcodes.filter((item) => item.variantId === variant.id);
                    return (
                      <tr key={variant.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-900">{variant.name}</p>
                          <small className="block font-mono text-[10px] text-slate-400">{variant.sku}</small>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {[
                            variant.color,
                            variant.ramGb ? `${variant.ramGb} GB RAM` : null,
                            variant.storageGb ? `${variant.storageGb} GB` : null,
                            variant.networkType,
                            variant.simConfiguration,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-[10px] text-slate-500">
                          {barcodes.map((item) => item.barcode).join(" · ") || "—"}
                        </td>
                        {canViewCost ? (
                          <td className="px-4 py-3 text-right font-mono text-slate-600">
                            {formatMoney(variant.purchasePrice, currency)}
                          </td>
                        ) : null}
                        <td className="px-4 py-3 text-right">
                          <p className="font-mono font-bold text-slate-900">{formatMoney(variant.retailPrice, currency)}</p>
                          <small className="block text-[10px] text-slate-400">
                            Min {formatMoney(variant.minimumSellingPrice, currency)}
                          </small>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={variant.isActive ? "green" : "slate"}>
                            {variant.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="outline" onClick={() => openVariant(variant)}>
                            Edit
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add product variation" : "Edit product variation"}
        description="SKU and barcode must remain unique company-wide across all catalog items."
        size="lg"
      >
        <form onSubmit={saveVariant} className="space-y-4 p-5">
          {editing === "new" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-blue-50/80 p-3 text-xs text-blue-900">
              <span>Creating a new variation for <b>{product?.name}</b></span>
              <button
                type="button"
                onClick={copyFromPrimary}
                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100"
              >
                Copy prices from base variant
              </button>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Variant SKU" required>
              <div className="flex gap-1.5">
                <input
                  className="input font-mono uppercase flex-1"
                  value={draft.sku}
                  onChange={(event) => patch("sku", event.target.value.toUpperCase())}
                  required
                />
                <button
                  type="button"
                  onClick={autoGenSku}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100"
                  title="Auto-generate variant SKU"
                >
                  <Zap className="h-3.5 w-3.5" />
                </button>
              </div>
            </Field>

            <Field label="Variant name" required wide>
              <div className="flex gap-1.5">
                <input
                  className="input flex-1"
                  placeholder="e.g. iPhone 15 Pro Max 256GB Black Titanium"
                  value={draft.name}
                  onChange={(event) => patch("name", event.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={suggestName}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
                  title="Suggest name from specs"
                >
                  Auto-Fill
                </button>
              </div>
            </Field>

            <Field label="Color">
              <input
                className="input"
                placeholder="e.g. Natural Titanium, Black, Blue"
                value={draft.color}
                onChange={(event) => patch("color", event.target.value)}
              />
            </Field>

            <Field label="RAM (GB)">
              <input
                type="number"
                min="0"
                className="input font-mono"
                placeholder="e.g. 8"
                value={draft.ramGb}
                onChange={(event) => patch("ramGb", event.target.value)}
              />
            </Field>

            <Field label="Storage (GB)">
              <input
                type="number"
                min="0"
                className="input font-mono"
                placeholder="e.g. 256 or 512"
                value={draft.storageGb}
                onChange={(event) => patch("storageGb", event.target.value)}
              />
            </Field>

            <Field label="Network">
              <input
                className="input"
                placeholder="e.g. 5G, 4G LTE"
                value={draft.networkType}
                onChange={(event) => patch("networkType", event.target.value)}
              />
            </Field>

            <Field label="SIM configuration">
              <input
                className="input"
                placeholder="e.g. Physical Dual SIM, eSIM"
                value={draft.simConfiguration}
                onChange={(event) => patch("simConfiguration", event.target.value)}
              />
            </Field>

            <Field label="Region / Approval">
              <input
                className="input"
                placeholder="e.g. PTA Approved, Global"
                value={draft.regionVariant}
                onChange={(event) => patch("regionVariant", event.target.value)}
              />
            </Field>

            <Field label="Purchase cost">
              <MoneyInput
                value={draft.purchasePrice}
                onChange={(value) => patch("purchasePrice", value)}
                disabled={!canViewCost}
              />
            </Field>

            <Field label="Wholesale price">
              <MoneyInput
                value={draft.wholesalePrice}
                onChange={(value) => patch("wholesalePrice", value)}
              />
            </Field>

            <Field label="Retail price">
              <MoneyInput
                value={draft.retailPrice}
                onChange={(value) => patch("retailPrice", value)}
              />
            </Field>

            <Field label="Minimum selling price">
              <MoneyInput
                value={draft.minimumSellingPrice}
                onChange={(value) => patch("minimumSellingPrice", value)}
              />
            </Field>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-800">
                Barcodes (EAN / UPC / Custom) — one per line
              </label>
              <button
                type="button"
                onClick={autoGenBarcode}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800"
              >
                <Barcode className="h-3.5 w-3.5" />
                Auto-Gen Barcode
              </button>
            </div>
            <textarea
              className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-200 p-3 font-mono text-xs focus:border-blue-500 focus:outline-none"
              placeholder="e.g. 8901234567890"
              value={draft.barcodeText}
              onChange={(event) => patch("barcodeText", event.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-xs font-semibold text-slate-800">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) => patch("isActive", event.target.checked)}
              className="rounded"
            />
            Active and available for purchase, inventory, and sales
          </label>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing === "new" ? "Create variant" : "Save variant"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function Field({ label, required, children, wide }: { label: string; required?: boolean; children: React.ReactNode; wide?: boolean }) {
  return <div className={wide ? "sm:col-span-2" : ""}><label className="label">{label}{required ? <span className="ml-1 text-red-500">*</span> : null}</label>{children}</div>;
}

function MoneyInput({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400">PKR</span><input className="input pl-11 font-mono" inputMode="decimal" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></div>;
}
