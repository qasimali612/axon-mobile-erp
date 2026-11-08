"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Barcode,
  Check,
  ChevronDown,
  Copy,
  Layers,
  Minus,
  PackageOpen,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Tag,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";

type ProductItem = {
  id: string;
  sku: string;
  name: string;
  model: string | null;
  trackingMethod: string;
  brand: { name: string } | null;
  category: { name: string };
  barcodes: Array<{ barcode: string; type: string; isPrimary: boolean }>;
  variants: Array<{
    id: string;
    sku: string;
    name: string;
    color: string | null;
    ramGb: number | null;
    storageGb: number | null;
    retailPrice: string;
    wholesalePrice: string;
    barcodes: Array<{ barcode: string; type: string; isPrimary: boolean }>;
  }>;
};

type StockUnitItem = {
  id: string;
  product: { name: string; sku: string; model: string | null; trackingMethod: string };
  variant: { name: string; sku: string; color: string | null; ramGb: number | null; storageGb: number | null; retailPrice: string };
  identifiers: Array<{ type: string; slot: number; value: string }>;
  currentWarehouse: { code: string; name: string } | null;
};

type QueueItem = {
  id: string;
  type: "CATALOG" | "IMEI_UNIT" | "CUSTOM";
  title: string;
  subtitle: string;
  specs: string;
  barcode: string;
  secondaryBarcode?: string;
  bcid: "code128" | "ean13" | "qrcode";
  price: string;
  copies: number;
};

type LabelFormat = "50x25" | "40x20" | "70x35" | "a4";

export function BarcodeLabelStudio({
  products,
  initialUnits,
  companyName,
  currency,
}: {
  products: ProductItem[];
  initialUnits: StockUnitItem[];
  companyName: string;
  currency: string;
}) {
  const [activeTab, setActiveTab] = useState<"catalog" | "imei" | "custom">("catalog");
  const [labelFormat, setLabelFormat] = useState<LabelFormat>("50x25");

  // Customization Toggles
  const [showStoreHeader, setShowStoreHeader] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showSpecs, setShowSpecs] = useState(true);
  const [showSku, setShowSku] = useState(true);
  const [showHumanText, setShowHumanText] = useState(true);

  // Search States
  const [productSearch, setProductSearch] = useState("");
  const [imeiSearch, setImeiSearch] = useState("");

  // Custom Form State
  const [customTitle, setCustomTitle] = useState("Universal USB-C Fast Cable");
  const [customSubtitle, setCustomSubtitle] = useState("Premium Braided · 1m White");
  const [customBarcode, setCustomBarcode] = useState("8901234567890");
  const [customBcid, setCustomBcid] = useState<"code128" | "ean13" | "qrcode">("code128");
  const [customPrice, setCustomPrice] = useState("1500");
  const [customCopies, setCustomCopies] = useState(5);

  // Print Queue
  const [queue, setQueue] = useState<QueueItem[]>(() => {
    // Initialize with first 6 serialized handsets if available
    return initialUnits.slice(0, 6).map((u) => {
      const imei1 = u.identifiers.find((i) => i.slot === 1)?.value || u.identifiers[0]?.value || u.id.slice(0, 12).toUpperCase();
      const imei2 = u.identifiers.find((i) => i.slot === 2)?.value;
      const specsList = [
        u.variant.color,
        u.variant.ramGb ? `${u.variant.ramGb}GB RAM` : null,
        u.variant.storageGb ? `${u.variant.storageGb}GB` : null,
      ].filter(Boolean).join(" · ");
      return {
        id: u.id,
        type: "IMEI_UNIT",
        title: u.product.name,
        subtitle: u.variant.name,
        specs: specsList,
        barcode: imei1,
        secondaryBarcode: imei2,
        bcid: "code128",
        price: u.variant.retailPrice || "0",
        copies: 1,
      };
    });
  });

  // Filtered Products
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products.slice(0, 20);
    const q = productSearch.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.brand?.name.toLowerCase().includes(q) ||
        p.variants.some((v) => v.name.toLowerCase().includes(q) || v.sku.toLowerCase().includes(q))
    ).slice(0, 30);
  }, [products, productSearch]);

  // Filtered Units
  const filteredUnits = useMemo(() => {
    if (!imeiSearch.trim()) return initialUnits;
    const q = imeiSearch.toLowerCase();
    return initialUnits.filter(
      (u) =>
        u.product.name.toLowerCase().includes(q) ||
        u.identifiers.some((i) => i.value.toLowerCase().includes(q))
    );
  }, [initialUnits, imeiSearch]);

  // Expanded items for printing according to copies multiplier
  const printableLabels = useMemo(() => {
    const list: Array<QueueItem & { printIndex: number }> = [];
    let count = 0;
    for (const item of queue) {
      for (let c = 0; c < item.copies; c++) {
        list.push({ ...item, printIndex: count++ });
      }
    }
    return list;
  }, [queue]);

  function addToQueue(item: Omit<QueueItem, "copies">, copies = 1) {
    setQueue((curr) => {
      const existing = curr.find((q) => q.barcode === item.barcode && q.title === item.title);
      if (existing) {
        return curr.map((q) => (q.id === existing.id ? { ...q, copies: q.copies + copies } : q));
      }
      return [...curr, { ...item, copies }];
    });
    toast.success(`Added ${copies} label${copies === 1 ? "" : "s"} of ${item.title}`);
  }

  function addProductVariantToQueue(product: ProductItem, variant: ProductItem["variants"][0], copies = 1) {
    const primaryBarcode =
      variant.barcodes.find((b) => b.isPrimary)?.barcode ||
      product.barcodes.find((b) => b.isPrimary)?.barcode ||
      variant.barcodes[0]?.barcode ||
      variant.sku;

    const specs = [
      variant.color,
      variant.ramGb ? `${variant.ramGb}GB RAM` : null,
      variant.storageGb ? `${variant.storageGb}GB` : null,
    ].filter(Boolean).join(" · ");

    addToQueue(
      {
        id: `${variant.id}-${Date.now()}`,
        type: "CATALOG",
        title: product.name,
        subtitle: variant.name,
        specs,
        barcode: primaryBarcode,
        bcid: primaryBarcode.length === 13 && /^\d+$/.test(primaryBarcode) ? "ean13" : "code128",
        price: variant.retailPrice || "0",
      },
      copies
    );
  }

  function addStockUnitToQueue(unit: StockUnitItem, copies = 1) {
    const imei1 = unit.identifiers.find((i) => i.slot === 1)?.value || unit.identifiers[0]?.value || unit.id.slice(0, 12).toUpperCase();
    const imei2 = unit.identifiers.find((i) => i.slot === 2)?.value;
    const specs = [
      unit.variant.color,
      unit.variant.ramGb ? `${unit.variant.ramGb}GB RAM` : null,
      unit.variant.storageGb ? `${unit.variant.storageGb}GB` : null,
    ].filter(Boolean).join(" · ");

    addToQueue(
      {
        id: unit.id,
        type: "IMEI_UNIT",
        title: unit.product.name,
        subtitle: unit.variant.name,
        specs,
        barcode: imei1,
        secondaryBarcode: imei2,
        bcid: "code128",
        price: unit.variant.retailPrice || "0",
      },
      copies
    );
  }

  function addCustomToQueue() {
    if (!customBarcode.trim() || !customTitle.trim()) {
      toast.error("Please provide title and barcode text.");
      return;
    }
    addToQueue(
      {
        id: `custom-${Date.now()}`,
        type: "CUSTOM",
        title: customTitle,
        subtitle: customSubtitle,
        specs: "",
        barcode: customBarcode.trim(),
        bcid: customBcid,
        price: customPrice,
      },
      customCopies
    );
  }

  function autoGenEan13() {
    const prefix = "890";
    const middle = Math.floor(100000000 + Math.random() * 900000000).toString();
    const code12 = prefix + middle.slice(0, 9);
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(code12[i], 10) * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    const barcode = `${code12}${checkDigit}`;
    setCustomBarcode(barcode);
    setCustomBcid("ean13");
    toast.success(`Generated EAN-13: ${barcode}`);
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      {/* Screen Controls Header */}
      <div className="no-print mb-6">
        <Link
          href="/inventory/imei"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to IMEI Registry
        </Link>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2">
              <span className="kicker">Retail Inventory Labeling</span>
              <Badge tone="green">Thermal & A4 Matrix</Badge>
            </div>
            <h1 className="mt-1 text-2xl font-black text-slate-950 sm:text-[30px]">
              Product Barcode Making & Label Studio
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Generate crisp thermal barcode stickers for phone box passports, retail accessories, and shelf packaging.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              disabled={!printableLabels.length}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-700 disabled:opacity-40"
            >
              <Printer className="h-4 w-4" />
              Print Labels ({printableLabels.length})
            </button>
          </div>
        </div>
      </div>

      <div className="no-print grid gap-6 lg:grid-cols-12 mb-8">
        {/* Source Selector Column (Left 7 Cols) */}
        <div className="space-y-4 lg:col-span-7">
          {/* Studio Mode Tabs */}
          <div className="surface p-2">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              <button
                onClick={() => setActiveTab("catalog")}
                className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition ${
                  activeTab === "catalog"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Tag className="h-4 w-4" />
                Product Catalog
              </button>
              <button
                onClick={() => setActiveTab("imei")}
                className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition ${
                  activeTab === "imei"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Smartphone className="h-4 w-4" />
                Handset IMEIs
              </button>
              <button
                onClick={() => setActiveTab("custom")}
                className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition ${
                  activeTab === "custom"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Sparkles className="h-4 w-4" />
                Custom Generator
              </button>
            </div>
          </div>

          {/* Mode 1: Product Catalog Barcode Maker */}
          {activeTab === "catalog" && (
            <div className="surface p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Select Catalog Items for Barcode Labeling</h3>
                  <p className="text-xs text-slate-500">Fast label printing for handsets, chargers, cases, and retail spares.</p>
                </div>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="input pl-9 pr-4 text-xs"
                  placeholder="Search product name, brand, SKU, or barcode…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
              </div>

              <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
                {filteredProducts.map((p) => (
                  <div key={p.id} className="rounded-xl border border-slate-200 p-3 hover:border-blue-300 transition">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{p.name}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-mono text-slate-600">
                            {p.sku}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {p.brand?.name || "Unbranded"} · {p.category.name} · {p.trackingMethod}
                        </p>
                      </div>
                    </div>

                    {/* Variants list */}
                    <div className="mt-2.5 space-y-1.5 border-t border-slate-100 pt-2">
                      {p.variants.map((v) => {
                        const bc = v.barcodes[0]?.barcode || p.barcodes[0]?.barcode || v.sku;
                        return (
                          <div
                            key={v.id}
                            className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs"
                          >
                            <div>
                              <span className="font-semibold text-slate-800">{v.name}</span>
                              <span className="ml-2 font-mono text-[10px] text-blue-700">[{bc}]</span>
                              <span className="ml-2 text-slate-500 font-bold">
                                {formatMoney(Number(v.retailPrice || 0), currency)}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => addProductVariantToQueue(p, v, 1)}
                                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                              >
                                +1 Label
                              </button>
                              <button
                                onClick={() => addProductVariantToQueue(p, v, 5)}
                                className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
                              >
                                +5 Labels
                              </button>
                              <button
                                onClick={() => addProductVariantToQueue(p, v, 24)}
                                className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100"
                              >
                                +1 Sheet (24)
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mode 2: Serialized Phone IMEI Labels */}
          {activeTab === "imei" && (
            <div className="surface p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Dual-IMEI Smartphone Box Stickers</h3>
                  <p className="text-xs text-slate-500">Print serial passport labels with primary and secondary IMEIs for stock units.</p>
                </div>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="input pl-9 pr-4 text-xs"
                  placeholder="Search by IMEI 1, IMEI 2, or Handset Model…"
                  value={imeiSearch}
                  onChange={(e) => setImeiSearch(e.target.value)}
                />
              </div>

              <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
                {filteredUnits.map((u) => {
                  const imei1 = u.identifiers.find((i) => i.slot === 1)?.value || u.identifiers[0]?.value;
                  const imei2 = u.identifiers.find((i) => i.slot === 2)?.value;
                  return (
                    <div
                      key={u.id}
                      className="flex items-center justify-between rounded-xl border border-slate-200 p-3 hover:border-blue-300 transition"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{u.product.name}</span>
                          <span className="text-xs text-slate-500">· {u.variant.name}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs font-mono">
                          <span className="text-blue-700 font-bold">IMEI 1: {imei1 || "N/A"}</span>
                          {imei2 && <span className="text-purple-700 font-bold">IMEI 2: {imei2}</span>}
                          <span className="text-slate-400">({u.currentWarehouse?.code || "Store"})</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => addStockUnitToQueue(u, 1)}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                        >
                          + Add Label
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Mode 3: Custom On-The-Fly Barcode Generator */}
          {activeTab === "custom" && (
            <div className="surface p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Custom On-Demand Barcode Maker</h3>
                  <p className="text-xs text-slate-500">Generate any custom Code128, EAN-13, or QR label instantly.</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="field-label">Label Main Title *</label>
                  <input
                    className="field-input"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Product title"
                  />
                </div>
                <div>
                  <label className="field-label">Subtitle / Variant Specs</label>
                  <input
                    className="field-input"
                    value={customSubtitle}
                    onChange={(e) => setCustomSubtitle(e.target.value)}
                    placeholder="e.g. 64GB Black / 20W Fast"
                  />
                </div>
                <div>
                  <label className="field-label">Barcode Data *</label>
                  <div className="flex gap-2">
                    <input
                      className="field-input font-mono font-bold flex-1"
                      value={customBarcode}
                      onChange={(e) => setCustomBarcode(e.target.value)}
                      placeholder="e.g. 8901234567890"
                    />
                    <button
                      type="button"
                      onClick={autoGenEan13}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                      title="Auto-generate valid EAN-13 Barcode"
                    >
                      <Barcode className="h-3.5 w-3.5" /> EAN-13
                    </button>
                  </div>
                </div>
                <div>
                  <label className="field-label">Barcode Symbology</label>
                  <select
                    className="field-input font-semibold"
                    value={customBcid}
                    onChange={(e) => setCustomBcid(e.target.value as any)}
                  >
                    <option value="code128">Code 128 (Standard Alphanumeric)</option>
                    <option value="ean13">EAN-13 (13-Digit Retail Barcode)</option>
                    <option value="qrcode">QR Code (Mobile Scan)</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Retail Price ({currency})</label>
                  <input
                    className="field-input font-mono"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    placeholder="e.g. 2500"
                  />
                </div>
                <div>
                  <label className="field-label">Number of Copies</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="field-input font-bold"
                    value={customCopies}
                    onChange={(e) => setCustomCopies(Math.max(1, Number(e.target.value)))}
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button onClick={addCustomToQueue}>
                  <Plus className="h-4 w-4" />
                  Add to Print Queue ({customCopies} copies)
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Configuration & Print Queue Column (Right 5 Cols) */}
        <div className="space-y-4 lg:col-span-5">
          {/* Label Sizing & Thermal Presets */}
          <div className="surface p-4 space-y-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Label Format & Thermal Sizing
            </span>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setLabelFormat("50x25")}
                className={`rounded-xl border p-2.5 text-left transition ${
                  labelFormat === "50x25"
                    ? "border-blue-600 bg-blue-50/50 text-blue-900 shadow-sm"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <b className="block text-xs">50 × 25 mm</b>
                <span className="text-[10px] text-slate-500">Standard Box Sticker</span>
              </button>

              <button
                onClick={() => setLabelFormat("70x35")}
                className={`rounded-xl border p-2.5 text-left transition ${
                  labelFormat === "70x35"
                    ? "border-blue-600 bg-blue-50/50 text-blue-900 shadow-sm"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <b className="block text-xs">70 × 35 mm</b>
                <span className="text-[10px] text-slate-500">Dual IMEI Passport</span>
              </button>

              <button
                onClick={() => setLabelFormat("40x20")}
                className={`rounded-xl border p-2.5 text-left transition ${
                  labelFormat === "40x20"
                    ? "border-blue-600 bg-blue-50/50 text-blue-900 shadow-sm"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <b className="block text-xs">40 × 20 mm</b>
                <span className="text-[10px] text-slate-500">Compact Accessory</span>
              </button>

              <button
                onClick={() => setLabelFormat("a4")}
                className={`rounded-xl border p-2.5 text-left transition ${
                  labelFormat === "a4"
                    ? "border-blue-600 bg-blue-50/50 text-blue-900 shadow-sm"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <b className="block text-xs">A4 Sheet (24-up)</b>
                <span className="text-[10px] text-slate-500">3 × 8 Standard Grid</span>
              </button>
            </div>

            {/* Toggle Badges */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showStoreHeader}
                  onChange={(e) => setShowStoreHeader(e.target.checked)}
                />
                Store Header
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPrice}
                  onChange={(e) => setShowPrice(e.target.checked)}
                />
                Retail Price
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showSpecs}
                  onChange={(e) => setShowSpecs(e.target.checked)}
                />
                Specs
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showHumanText}
                  onChange={(e) => setShowHumanText(e.target.checked)}
                />
                Barcode Text
              </label>
            </div>
          </div>

          {/* Current Print Queue */}
          <div className="surface p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">Print Queue</h3>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                  {printableLabels.length} total stickers
                </span>
              </div>
              {queue.length > 0 && (
                <button
                  onClick={() => setQueue([])}
                  className="text-xs font-semibold text-rose-600 hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {queue.length ? (
                queue.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 truncate">{item.title}</p>
                      <p className="font-mono text-[10px] text-blue-700 truncate">{item.barcode}</p>
                      {item.price && (
                        <p className="text-[10px] font-semibold text-emerald-700">
                          {formatMoney(Number(item.price), currency)}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                        <button
                          onClick={() =>
                            setQueue((curr) =>
                              curr
                                .map((q) => (q.id === item.id ? { ...q, copies: q.copies - 1 } : q))
                                .filter((q) => q.copies > 0)
                            )
                          }
                          className="px-2 py-1 hover:bg-slate-100"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-8 text-center font-bold font-mono text-xs">{item.copies}</span>
                        <button
                          onClick={() =>
                            setQueue((curr) =>
                              curr.map((q) => (q.id === item.id ? { ...q, copies: q.copies + 1 } : q))
                            )
                          }
                          className="px-2 py-1 hover:bg-slate-100"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>

                      <button
                        onClick={() => setQueue((curr) => curr.filter((q) => q.id !== item.id))}
                        className="rounded p-1 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-xs text-slate-400">
                  Print queue is empty. Select products or handsets above to add stickers.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PRINT SHEET & SCREEN PREVIEW CONTAINER */}
      {/* ========================================================================= */}
      <section className="print-area">
        <div className="no-print mb-3 flex items-center justify-between border-b pb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Live Sticker Output Preview ({printableLabels.length} Labels)
          </span>
          <span className="text-xs text-slate-400">
            Previewing: {labelFormat === "50x25" ? "50 × 25 mm" : labelFormat === "70x35" ? "70 × 35 mm" : labelFormat === "40x20" ? "40 × 20 mm" : "A4 Matrix (3×8)"}
          </span>
        </div>

        {printableLabels.length === 0 ? (
          <div className="surface p-12 text-center text-sm text-slate-400">
            No labels queued. Add items from the catalog or serialized inventory above.
          </div>
        ) : (
          <div
            className={`label-grid ${
              labelFormat === "a4"
                ? "grid grid-cols-2 gap-2 sm:grid-cols-3"
                : labelFormat === "70x35"
                ? "grid grid-cols-1 gap-2 sm:grid-cols-2"
                : "grid grid-cols-2 gap-2 sm:grid-cols-3"
            }`}
          >
            {printableLabels.map((item, idx) => (
              <article
                key={`${item.id}-${idx}`}
                className={`label-item break-inside-avoid rounded-lg border border-dashed border-slate-300 bg-white p-2.5 text-slate-900 shadow-sm ${
                  labelFormat === "70x35" ? "min-h-[140px]" : "min-h-[105px]"
                }`}
              >
                {/* Store Header */}
                {showStoreHeader && (
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1 text-[8px] font-black uppercase tracking-wider text-slate-500">
                    <span>{companyName}</span>
                    {showPrice && Number(item.price) > 0 && (
                      <span className="text-blue-700 font-bold">
                        {formatMoney(Number(item.price), currency)}
                      </span>
                    )}
                  </div>
                )}

                {/* Title & Specs */}
                <div className="mt-1">
                  <p className="text-[10px] font-black leading-tight truncate">{item.title}</p>
                  {item.subtitle && (
                    <p className="text-[8px] text-slate-600 truncate">{item.subtitle}</p>
                  )}
                  {showSpecs && item.specs && (
                    <p className="text-[8px] text-slate-500 font-medium truncate">{item.specs}</p>
                  )}
                </div>

                {/* Primary Barcode Vector */}
                <div className="mt-1 flex justify-center py-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/operations/barcode?text=${encodeURIComponent(item.barcode)}&bcid=${item.bcid}&scale=2&height=${
                      labelFormat === "70x35" ? 10 : 7
                    }&includetext=${showHumanText}`}
                    alt={item.barcode}
                    className="max-h-12 max-w-full object-contain"
                  />
                </div>

                {/* Secondary IMEI if present (Dual-SIM Smartphone) */}
                {item.secondaryBarcode && (
                  <div className="mt-0.5 border-t border-slate-100 pt-0.5">
                    <p className="text-center font-mono text-[7px] text-slate-500 font-bold">
                      IMEI 2: {item.secondaryBarcode}
                    </p>
                  </div>
                )}

                {/* Footer Badges */}
                <div className="mt-1 flex items-center justify-between text-[7px] font-mono text-slate-400">
                  <span>{item.bcid.toUpperCase()}</span>
                  <span>PTA APPROVED</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Embedded Print Styles */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print,
          header,
          aside,
          nav {
            display: none !important;
          }
          .print-area {
            display: block !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .label-grid {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 4mm !important;
            page-break-inside: auto;
          }
          .label-item {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            border: 1px solid #ccc !important;
            box-shadow: none !important;
            padding: 2.5mm !important;
          }
        }
      `}</style>
    </div>
  );
}

