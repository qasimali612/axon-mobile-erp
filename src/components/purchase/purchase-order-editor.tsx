"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Barcode, FileSpreadsheet, Loader2, Paperclip, Plus, Printer, Save, Search, Send, Trash2, X } from "lucide-react";

type TaxRule = { id: string; code: string; name: string; rate: string; appliesToPurchases: boolean };
type Variant = { id: string; sku: string; name: string; purchasePrice?: string; color?: string | null; storageGb?: number | null; barcodes: Array<{ barcode: string; isPrimary: boolean }> };
type Product = {
  id: string; sku: string; name: string; model?: string | null; trackingMethod: string;
  brand?: { name: string } | null; unit: { code: string; name: string; decimalPlaces: number };
  taxRule?: { id: string; code: string; name: string; rate: string } | null;
  barcodes: Array<{ barcode: string; isPrimary: boolean }>;
  variants: Variant[];
};
type LookupData = {
  branches: Array<{ id: string; code: string; name: string }>;
  warehouses: Array<{ id: string; branchId: string; code: string; name: string; allowReceiving: boolean }>;
  suppliers: Array<{ id: string; code: string; name: string; paymentTermsDays: number }>;
  products: Product[];
  taxRules: TaxRule[];
};
type Row = {
  key: string; productId: string; variantId: string; description: string; quantity: string; unitCost: string;
  discountAmount: string; taxRuleId: string; taxRate: string;
};
type Props = { currency: string; permissions: string[]; orderId?: string };

const inputClass = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const number = (value: string) => Number.isFinite(Number(value)) ? Number(value) : 0;
const money = (value: number, currency: string) => new Intl.NumberFormat("en-PK", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0);

export function PurchaseOrderEditor({ currency, permissions, orderId }: Props) {
  const [lookups, setLookups] = useState<LookupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [documentId, setDocumentId] = useState(orderId || "");
  const [documentNumber, setDocumentNumber] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const [header, setHeader] = useState({
    branchId: "", warehouseId: "", supplierId: "", orderDate: today(), expectedDate: "",
    supplierReference: "", paymentTermsDays: 0, currencyCode: currency, exchangeRate: "1",
    documentDiscount: "0", freightTotal: "0", otherCharges: "0", notes: "",
  });
  const [rows, setRows] = useState<Row[]>([]);

  const hydrateOrder = useCallback((record: Record<string, any>) => {
    setDocumentId(record.id);
    setDocumentNumber(record.orderNumber);
    setStatus(record.status);
    setHeader({
      branchId: record.branchId, warehouseId: record.warehouseId, supplierId: record.supplierId,
      orderDate: String(record.orderDate).slice(0, 10), expectedDate: record.expectedDate ? String(record.expectedDate).slice(0, 10) : "",
      supplierReference: record.supplierReference || "", paymentTermsDays: record.paymentTermsDays || 0,
      currencyCode: record.currencyCode, exchangeRate: String(record.exchangeRate), documentDiscount: String(record.documentDiscount),
      freightTotal: String(record.freightTotal), otherCharges: String(record.otherCharges), notes: record.notes || "",
    });
    setRows(record.lines.map((line: Record<string, any>) => ({
      key: line.id, productId: line.productId, variantId: line.variantId, description: line.description,
      quantity: String(line.orderedQuantity), unitCost: String(line.unitCost), discountAmount: String(line.discountAmount),
      taxRuleId: line.taxRuleId || "", taxRate: String(line.taxRate),
    })));
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/operations/lookups", { cache: "no-store" }).then((response) => response.json()),
      orderId ? fetch(`/api/purchases/orders/${orderId}`, { cache: "no-store" }).then((response) => response.json()) : Promise.resolve(null),
    ]).then(([lookupPayload, orderPayload]) => {
      if (!active) return;
      if (!lookupPayload.data) throw new Error(lookupPayload.error?.message || "Unable to load purchasing data.");
      setLookups(lookupPayload.data);
      setHeader((current) => ({
        ...current,
        branchId: current.branchId || lookupPayload.data.branches[0]?.id || "",
        warehouseId: current.warehouseId || lookupPayload.data.warehouses.find((item: any) => item.allowReceiving)?.id || "",
        supplierId: current.supplierId || lookupPayload.data.suppliers[0]?.id || "",
      }));
      if (orderPayload?.data) hydrateOrder(orderPayload.data);
      setLoading(false);
    }).catch((error) => {
      if (active) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to load purchase order." }); setLoading(false); }
    });
    return () => { active = false; };
  }, [hydrateOrder, orderId]);

  const catalogItems = useMemo(() => {
    if (!lookups) return [];
    const query = catalogQuery.trim().toLowerCase();
    return lookups.products.flatMap((product) => product.variants.map((variant) => ({ product, variant }))).filter(({ product, variant }) =>
      !query || [product.sku, product.name, product.model, product.brand?.name, variant.sku, variant.name, ...product.barcodes.map((item) => item.barcode), ...variant.barcodes.map((item) => item.barcode)]
        .some((value) => value?.toLowerCase().includes(query)),
    ).slice(0, 30);
  }, [catalogQuery, lookups]);

  const variantMap = useMemo(() => new Map((lookups?.products || []).flatMap((product) => product.variants.map((variant) => [variant.id, { product, variant }] as const))), [lookups]);

  const addCatalogItem = useCallback((product: Product, variant: Variant, quantity = 1, cost?: string) => {
    setRows((current) => {
      const existing = current.find((row) => row.variantId === variant.id);
      if (existing) return current.map((row) => row.key === existing.key ? { ...row, quantity: String(number(row.quantity) + quantity) } : row);
      return [...current, {
        key: crypto.randomUUID(), productId: product.id, variantId: variant.id,
        description: `${product.name} · ${variant.name}`, quantity: String(quantity),
        unitCost: cost ?? variant.purchasePrice ?? "0", discountAmount: "0",
        taxRuleId: product.taxRule?.id || "", taxRate: product.taxRule?.rate || "0",
      }];
    });
    setCatalogOpen(false);
    setCatalogQuery("");
  }, []);

  async function resolveScan(code: string, quantity = 1, cost?: string) {
    if (!code.trim()) return;
    setScanning(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/operations/catalog/resolve?mode=purchase&code=${encodeURIComponent(code.trim())}${header.warehouseId ? `&warehouseId=${header.warehouseId}` : ""}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Code was not found.");
      const match = variantMap.get(payload.data.variant.id);
      if (!match) throw new Error("Resolved product is not in the active purchasing catalog.");
      addCatalogItem(match.product, match.variant, quantity, cost);
      setScanCode("");
      setNotice({ kind: "success", text: `${match.product.name} added from ${payload.data.resolutionType.toLowerCase()}.` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to resolve code." });
    } finally { setScanning(false); }
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  }

  function changeVariant(row: Row, variantId: string) {
    const match = variantMap.get(variantId);
    if (!match) return;
    updateRow(row.key, {
      productId: match.product.id, variantId, description: `${match.product.name} · ${match.variant.name}`,
      unitCost: match.variant.purchasePrice ?? row.unitCost,
      taxRuleId: match.product.taxRule?.id || "", taxRate: match.product.taxRule?.rate || "0",
    });
  }

  function changeTax(row: Row, taxRuleId: string) {
    const rule = lookups?.taxRules.find((item) => item.id === taxRuleId);
    updateRow(row.key, { taxRuleId, taxRate: rule?.rate || "0" });
  }

  const totals = useMemo(() => {
    const values = rows.map((row) => {
      const gross = number(row.quantity) * number(row.unitCost);
      const discount = number(row.discountAmount);
      const taxable = Math.max(0, gross - discount);
      const tax = taxable * number(row.taxRate) / 100;
      return { gross, discount, tax, total: taxable + tax };
    });
    const subtotal = values.reduce((sum, value) => sum + value.gross, 0);
    const discount = values.reduce((sum, value) => sum + value.discount, 0);
    const tax = values.reduce((sum, value) => sum + value.tax, 0);
    return { subtotal, discount, tax, grand: subtotal - discount - number(header.documentDiscount) + tax + number(header.freightTotal) + number(header.otherCharges) };
  }, [header.documentDiscount, header.freightTotal, header.otherCharges, rows]);

  function validate() {
    if (!header.branchId || !header.warehouseId || !header.supplierId) return "Select a branch, receiving warehouse, and supplier.";
    if (!rows.length) return "Add at least one product line.";
    const invalid = rows.findIndex((row) => number(row.quantity) <= 0 || number(row.unitCost) < 0 || number(row.discountAmount) > number(row.quantity) * number(row.unitCost));
    if (invalid >= 0) return `Correct quantity, cost, or discount on line ${invalid + 1}.`;
    if (number(header.documentDiscount) > totals.subtotal - totals.discount) return "Document discount exceeds net goods value.";
    return null;
  }

  const saveDraft = useCallback(async () => {
    const validation = validate();
    if (validation) { setNotice({ kind: "error", text: validation }); return null; }
    setSaving(true); setNotice(null);
    try {
      const body = {
        ...header,
        expectedDate: header.expectedDate || null,
        supplierReference: header.supplierReference || null,
        notes: header.notes || null,
        idempotencyKey: documentId ? `edit-${documentId}` : `po-${crypto.randomUUID()}`,
        lines: rows.map((row) => ({
          productId: row.productId, variantId: row.variantId, taxRuleId: row.taxRuleId || null,
          description: row.description, quantity: row.quantity, unitCost: row.unitCost,
          discountAmount: row.discountAmount || "0", taxRate: row.taxRate,
        })),
      };
      const response = await fetch(documentId ? `/api/purchases/orders/${documentId}` : "/api/purchases/orders", {
        method: documentId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Purchase order could not be saved.");
      hydrateOrder(payload.data);
      setNotice({ kind: "success", text: `${payload.data.orderNumber} saved as a relational draft. Server total: ${money(Number(payload.data.grandTotal), currency)}.` });
      return payload.data.id as string;
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Purchase order could not be saved." });
      return null;
    } finally { setSaving(false); }
  // validate/totals are deliberately read from the current render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, documentId, header, hydrateOrder, rows]);

  async function saveAndSubmit() {
    const id = await saveDraft();
    if (!id) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/purchases/orders/${id}/submit`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Purchase order could not be submitted.");
      setStatus(payload.data.status);
      setNotice({ kind: "success", text: `${documentNumber || "Purchase order"} submitted for independent approval.` });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to submit." }); }
    finally { setSaving(false); }
  }

  async function uploadAttachment() {
    if (!documentId || !attachment) return;
    const form = new FormData(); form.set("entityType", "PurchaseOrder"); form.set("entityId", documentId); form.set("file", attachment);
    setSaving(true);
    try {
      const response = await fetch("/api/purchases/attachments", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Attachment upload failed.");
      setAttachment(null); if (fileRef.current) fileRef.current.value = "";
      setNotice({ kind: "success", text: `${payload.data.originalName} attached to ${documentNumber}.` });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Attachment upload failed." }); }
    finally { setSaving(false); }
  }

  async function importSpreadsheet(file: File) {
    setScanning(true); setNotice(null);
    try {
      const form = new FormData(); form.set("file", file);
      const response = await fetch("/api/operations/import-spreadsheet", { method: "POST", body: form });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || "Spreadsheet import failed.");
      const lines: string[][] = payload.data.rows;
      const headers = lines[0].map((value) => value.trim().toLowerCase().replaceAll(" ", "_"));
      const codeIndex = headers.findIndex((value) => ["sku", "barcode", "code"].includes(value));
      const quantityIndex = headers.findIndex((value) => ["quantity", "qty"].includes(value));
      const costIndex = headers.findIndex((value) => ["unitcost", "unit_cost", "unit_cost_pkr", "cost"].includes(value));
      if (codeIndex < 0 || quantityIndex < 0) throw new Error("Headers must include sku/barcode/code and quantity.");
      const groups = new Map<string, { quantity: number; cost?: string }>();
      for (const cells of lines.slice(1)) {
        const code = cells[codeIndex]?.trim(); if (!code) continue;
        const quantity = number(cells[quantityIndex]); if (quantity <= 0) throw new Error(`Quantity for ${code} must be greater than zero.`);
        const cost = costIndex >= 0 ? cells[costIndex]?.trim() : undefined;
        const existing = groups.get(code.toLowerCase());
        if (existing && cost && existing.cost && cost !== existing.cost) throw new Error(`Rows for ${code} contain different unit costs. Import them separately.`);
        groups.set(code.toLowerCase(), { quantity: (existing?.quantity || 0) + quantity, cost: existing?.cost || cost });
      }
      if (!groups.size) throw new Error("The spreadsheet does not contain any product rows.");
      for (const [code, values] of groups) await resolveScan(code, values.quantity, values.cost);
      setNotice({ kind: "success", text: `${payload.data.rowCount} ${file.name.toLowerCase().endsWith(".xlsx") ? "Excel" : "CSV"} rows imported into ${groups.size} catalog line(s). Review all values before saving.` });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Spreadsheet import failed." }); }
    finally { setScanning(false); if (importRef.current) importRef.current.value = ""; }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void saveDraft(); }
      if (event.key === "F2") { event.preventDefault(); setCatalogOpen(true); requestAnimationFrame(() => searchRef.current?.focus()); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [saveDraft]);

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-600"/>Loading purchase workspace…</div>;
  if (!lookups) return <div className="surface p-8 text-sm text-rose-700">{notice?.text || "Purchasing data is unavailable."}</div>;
  const editable = status === "DRAFT";
  const warehouses = lookups.warehouses.filter((item) => !header.branchId || item.branchId === header.branchId).filter((item) => item.allowReceiving);

  return <div className="space-y-4 pb-24">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <Link href="/purchases" className="mt-1 rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:text-blue-700"><ArrowLeft className="h-4 w-4"/></Link>
        <div><p className="text-xs font-bold uppercase tracking-[.15em] text-blue-700">Procurement · Purchase order</p><h1 className="mt-1 text-2xl font-bold text-slate-950">{documentNumber || "New purchase order"}</h1><p className="mt-1 text-sm text-slate-500">Multi-product draft · server-calculated totals · independent approval</p></div>
      </div>
      <div className="flex items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${status === "DRAFT" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>{status.replaceAll("_", " ")}</span>{documentId && <Link href={`/purchases/${documentId}/print`} target="_blank" className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"><Printer className="h-4 w-4"/>Print</Link>}</div>
    </div>

    {notice && <div className={`flex items-start justify-between rounded-xl border px-4 py-3 text-sm ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}><span>{notice.text}</span><button onClick={() => setNotice(null)}><X className="h-4 w-4"/></button></div>}

    <section className="surface overflow-hidden">
      <div className="border-b border-slate-100 bg-gradient-to-r from-blue-50/80 to-white px-5 py-3"><h2 className="text-sm font-bold text-slate-900">Document header</h2></div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6">
        <label><span className="label">Branch *</span><select className={inputClass} value={header.branchId} disabled={!editable} onChange={(event) => { const branchId = event.target.value; const first = lookups.warehouses.find((item) => item.branchId === branchId && item.allowReceiving); setHeader((current) => ({ ...current, branchId, warehouseId: first?.id || "" })); }}>{lookups.branches.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label><span className="label">Supplier *</span><select className={inputClass} value={header.supplierId} disabled={!editable} onChange={(event) => { const supplier = lookups.suppliers.find((item) => item.id === event.target.value); setHeader((current) => ({ ...current, supplierId: event.target.value, paymentTermsDays: supplier?.paymentTermsDays ?? current.paymentTermsDays })); }}>{lookups.suppliers.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label><span className="label">Receiving warehouse *</span><select className={inputClass} value={header.warehouseId} disabled={!editable} onChange={(event) => setHeader((current) => ({ ...current, warehouseId: event.target.value }))}>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label><span className="label">Order date *</span><input type="date" className={inputClass} value={header.orderDate} disabled={!editable} onChange={(event) => setHeader((current) => ({ ...current, orderDate: event.target.value }))}/></label>
        <label><span className="label">Expected delivery</span><input type="date" className={inputClass} value={header.expectedDate} disabled={!editable} onChange={(event) => setHeader((current) => ({ ...current, expectedDate: event.target.value }))}/></label>
        <label><span className="label">Supplier reference</span><input className={inputClass} value={header.supplierReference} disabled={!editable} placeholder="Quote / PI number" onChange={(event) => setHeader((current) => ({ ...current, supplierReference: event.target.value }))}/></label>
        <label><span className="label">Payment terms (days)</span><input type="number" min="0" className={inputClass} value={header.paymentTermsDays} disabled={!editable} onChange={(event) => setHeader((current) => ({ ...current, paymentTermsDays: Number(event.target.value) }))}/></label>
        <label><span className="label">Currency</span><input className={inputClass} maxLength={3} value={header.currencyCode} disabled={!editable} onChange={(event) => setHeader((current) => ({ ...current, currencyCode: event.target.value.toUpperCase() }))}/></label>
        <label><span className="label">Exchange rate</span><input className={inputClass} inputMode="decimal" value={header.exchangeRate} disabled={!editable} onChange={(event) => setHeader((current) => ({ ...current, exchangeRate: event.target.value }))}/></label>
        <label className="sm:col-span-2 xl:col-span-3"><span className="label">Internal notes</span><input className={inputClass} value={header.notes} disabled={!editable} placeholder="Delivery instructions or approval context" onChange={(event) => setHeader((current) => ({ ...current, notes: event.target.value }))}/></label>
      </div>
    </section>

    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <section className="surface min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div><h2 className="text-sm font-bold text-slate-900">Products <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{rows.length}</span></h2><p className="mt-0.5 text-xs text-slate-500">F2 product search · scan barcode/SKU · inline edits</p></div>
          {editable && <div className="flex flex-wrap gap-2"><div className="flex h-9 overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="flex items-center pl-2.5 text-slate-400"><Barcode className="h-4 w-4"/></div><input className="w-40 px-2 text-sm outline-none" value={scanCode} placeholder="Scan or type code" onChange={(event) => setScanCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void resolveScan(scanCode); }}/><button disabled={scanning} onClick={() => void resolveScan(scanCode)} className="border-l border-slate-200 px-3 text-xs font-bold text-blue-700">{scanning ? <Loader2 className="h-4 w-4 animate-spin"/> : "ADD"}</button></div><button onClick={() => { setCatalogOpen(true); requestAnimationFrame(() => searchRef.current?.focus()); }} className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"><Plus className="h-4 w-4"/>Add product</button><button onClick={() => importRef.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"><FileSpreadsheet className="h-4 w-4"/>Import CSV / Excel</button><input ref={importRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importSpreadsheet(file); }}/></div>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse"><thead><tr className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500"><th className="w-12 px-3 py-3 text-center">#</th><th className="min-w-72 px-3 py-3">Product / variant</th><th className="w-24 px-3 py-3 text-right">Qty</th><th className="w-32 px-3 py-3 text-right">Unit cost</th><th className="w-28 px-3 py-3 text-right">Discount</th><th className="w-44 px-3 py-3">Tax policy</th><th className="w-32 px-3 py-3 text-right">Line total</th><th className="w-12 px-2 py-3"/></tr></thead>
            <tbody>{rows.length ? rows.map((row, index) => {
              const match = variantMap.get(row.variantId); const gross = number(row.quantity) * number(row.unitCost); const tax = Math.max(0, gross - number(row.discountAmount)) * number(row.taxRate) / 100;
              return <tr key={row.key} className="border-t border-slate-100 align-top hover:bg-blue-50/20"><td className="px-3 py-3 text-center text-xs font-semibold text-slate-400">{index + 1}</td><td className="px-3 py-3"><select className={inputClass} value={row.variantId} disabled={!editable} onChange={(event) => changeVariant(row, event.target.value)}>{lookups.products.flatMap((product) => product.variants.map((variant) => <option key={variant.id} value={variant.id}>{product.sku} · {product.name} · {variant.name}</option>))}</select><input className="mt-1.5 w-full border-0 bg-transparent px-1 text-xs text-slate-500 outline-none" value={row.description} disabled={!editable} onChange={(event) => updateRow(row.key, { description: event.target.value })}/><div className="mt-1 flex gap-2 text-[10px] uppercase text-slate-400"><span>{match?.product.trackingMethod}</span><span>{match?.product.unit.code}</span><span>{match?.variant.sku}</span></div></td><td className="px-3 py-3"><input className={`${inputClass} text-right tabular-nums`} inputMode="decimal" value={row.quantity} disabled={!editable} onChange={(event) => updateRow(row.key, { quantity: event.target.value })}/></td><td className="px-3 py-3"><input className={`${inputClass} text-right tabular-nums`} inputMode="decimal" value={row.unitCost} disabled={!editable} onChange={(event) => updateRow(row.key, { unitCost: event.target.value })}/></td><td className="px-3 py-3"><input className={`${inputClass} text-right tabular-nums`} inputMode="decimal" value={row.discountAmount} disabled={!editable} onChange={(event) => updateRow(row.key, { discountAmount: event.target.value })}/></td><td className="px-3 py-3"><select className={inputClass} value={row.taxRuleId} disabled={!editable || !permissions.includes("PURCHASE_TAX_OVERRIDE")} onChange={(event) => changeTax(row, event.target.value)}><option value="">Zero / none</option>{lookups.taxRules.filter((rule) => rule.appliesToPurchases).map((rule) => <option key={rule.id} value={rule.id}>{rule.code} · {rule.rate}%</option>)}</select></td><td className="px-3 py-4 text-right text-sm font-bold tabular-nums text-slate-800">{money(gross - number(row.discountAmount) + tax, currency)}</td><td className="px-2 py-3">{editable && <button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}><Trash2 className="h-4 w-4"/></button>}</td></tr>;
            }) : <tr><td colSpan={8} className="px-6 py-16 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Plus className="h-6 w-6"/></div><h3 className="mt-3 text-sm font-bold text-slate-800">No product lines yet</h3><p className="mt-1 text-xs text-slate-500">Search the real catalog, scan a SKU/barcode, or import CSV/XLSX.</p></td></tr>}</tbody></table>
        </div>
      </section>

      <aside className="space-y-4 xl:sticky xl:top-4">
        <section className="surface p-4"><h2 className="text-sm font-bold text-slate-900">Document totals</h2><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between text-slate-600"><span>Subtotal</span><span className="font-semibold tabular-nums">{money(totals.subtotal, currency)}</span></div><div className="flex justify-between text-slate-600"><span>Line discounts</span><span className="font-semibold tabular-nums">− {money(totals.discount, currency)}</span></div><label className="grid grid-cols-[1fr_110px] items-center gap-2 text-slate-600"><span>Document discount</span><input className={`${inputClass} text-right`} value={header.documentDiscount} disabled={!editable} onChange={(event) => setHeader((current) => ({ ...current, documentDiscount: event.target.value }))}/></label><div className="flex justify-between text-slate-600"><span>Input tax</span><span className="font-semibold tabular-nums">{money(totals.tax, currency)}</span></div><label className="grid grid-cols-[1fr_110px] items-center gap-2 text-slate-600"><span>Freight</span><input className={`${inputClass} text-right`} value={header.freightTotal} disabled={!editable} onChange={(event) => setHeader((current) => ({ ...current, freightTotal: event.target.value }))}/></label><label className="grid grid-cols-[1fr_110px] items-center gap-2 text-slate-600"><span>Other charges</span><input className={`${inputClass} text-right`} value={header.otherCharges} disabled={!editable} onChange={(event) => setHeader((current) => ({ ...current, otherCharges: event.target.value }))}/></label><div className="border-t border-slate-200 pt-3"><div className="flex items-end justify-between"><span className="font-bold text-slate-900">Grand total</span><span className="text-lg font-black tabular-nums text-blue-700">{money(totals.grand, currency)}</span></div></div></div><p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-[11px] leading-4 text-blue-800">Preview only. The API recalculates every line and rejects altered totals.</p></section>
        {documentId && permissions.includes("PURCHASE_DOCUMENT_ATTACHMENT") && <section className="surface p-4"><h2 className="text-sm font-bold text-slate-900">Attachments</h2><input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx" className="mt-3 block w-full text-xs text-slate-500 file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1.5 file:text-xs file:font-semibold" onChange={(event) => setAttachment(event.target.files?.[0] || null)}/><button disabled={!attachment || saving} onClick={() => void uploadAttachment()} className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 text-sm font-semibold"><Paperclip className="h-4 w-4"/>Upload attachment</button></section>}
      </aside>
    </div>

    {editable && <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(15,23,42,.08)] backdrop-blur"><div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500"><span className="font-semibold text-slate-700">Ctrl/⌘ + S</span> saves draft · <span className="font-semibold text-slate-700">F2</span> opens product search</p><div className="flex gap-2"><button disabled={saving} onClick={() => void saveDraft()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4"/>}Save draft</button><button disabled={saving || !permissions.includes("PURCHASE_ORDER_CREATE")} onClick={() => void saveAndSubmit()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"><Send className="h-4 w-4"/>Save & submit</button></div></div></div>}

    {catalogOpen && <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 p-4 pt-[8vh] backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setCatalogOpen(false); }}><div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"><div className="flex items-center gap-3 border-b border-slate-100 p-4"><Search className="h-5 w-5 text-blue-600"/><input ref={searchRef} className="h-10 flex-1 border-0 text-base outline-none" value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Search name, model, brand, SKU or barcode…"/><button onClick={() => setCatalogOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5"/></button></div><div className="max-h-[60vh] overflow-y-auto p-2">{catalogItems.map(({ product, variant }) => <button key={variant.id} onClick={() => addCatalogItem(product, variant)} className="flex w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left hover:bg-blue-50"><div><div className="text-sm font-bold text-slate-900">{product.name} <span className="font-normal text-slate-500">· {variant.name}</span></div><div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500"><span>{product.sku}</span><span>•</span><span>{variant.sku}</span><span>•</span><span>{product.trackingMethod}</span>{variant.barcodes[0] && <><span>•</span><span>{variant.barcodes[0].barcode}</span></>}</div></div><div className="text-right"><div className="text-sm font-bold text-blue-700">{money(number(variant.purchasePrice || "0"), currency)}</div><Plus className="ml-auto mt-1 h-4 w-4 text-blue-600"/></div></button>)}{!catalogItems.length && <div className="px-4 py-12 text-center text-sm text-slate-500">No active catalog product matches your search.</div>}</div><div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500"><span>{catalogItems.length} catalog variants</span><span>Unknown barcodes are never auto-created.</span></div></div></div>}
  </div>;
}
