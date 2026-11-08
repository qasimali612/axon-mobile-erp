"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Barcode, Boxes, ChevronRight, FileSpreadsheet, Loader2, PackageCheck, Paperclip, Printer, Save, Search, Send, ShieldCheck, Smartphone, Trash2, X, Zap } from "lucide-react";
import { DeviceIdentifierEditor } from "@/components/purchase/device-identifier-editor";
import { isValidImei } from "@/lib/imei";

type TaxRule = { id: string; code: string; name: string; rate: string; appliesToPurchases: boolean };
type Variant = { id: string; sku: string; name: string; purchasePrice?: string; barcodes: Array<{ barcode: string; isPrimary: boolean }> };
type Product = { id: string; sku: string; name: string; model?: string | null; trackingMethod: "IMEI" | "SERIAL" | "BATCH" | "QUANTITY"; unit: { code: string; decimalPlaces: number }; taxRule?: { id: string; code: string; rate: string } | null; barcodes: Array<{ barcode: string }>; variants: Variant[] };
type PurchaseOrder = { id: string; branchId: string; warehouseId: string; supplierId: string; orderNumber: string; status: string; currencyCode: string; lines: Array<{ id: string; productId: string; variantId: string; taxRuleId?: string | null; description: string; orderedQuantity: string; receivedQuantity: string; unitCost: string; discountAmount: string; taxRate: string }> };
type Lookups = { branches: Array<{ id: string; code: string; name: string }>; warehouses: Array<{ id: string; branchId: string; code: string; name: string; allowReceiving: boolean }>; suppliers: Array<{ id: string; code: string; name: string }>; products: Product[]; taxRules: TaxRule[]; purchaseOrders: PurchaseOrder[] };
type Row = { key: string; orderLineId: string; productId: string; variantId: string; description: string; quantity: string; acceptedQuantity: string; rejectedQuantity: string; unitCost: string; discountAmount: string; taxRuleId: string; taxRate: string; unitText: string; inspectionNotes: string };
type Props = { currency: string; permissions: string[]; receiptId?: string; defaultBranchId?: string | null; defaultWarehouseId?: string | null; initialPurchaseOrderId?: string | null };

const inputClass = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const number = (value: string) => Number.isFinite(Number(value)) ? Number(value) : 0;
const money = (value: number, currency: string) => new Intl.NumberFormat("en-PK", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0);
const isSerialized = (method?: string) => method === "IMEI" || method === "SERIAL";

export function GoodsReceiptEditor({ currency, permissions, receiptId, defaultBranchId, defaultWarehouseId, initialPurchaseOrderId }: Props) {
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [documentId, setDocumentId] = useState(receiptId || "");
  const [documentNumber, setDocumentNumber] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [entryMode, setEntryMode] = useState<"search" | "scan" | "import">("search");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [serialEditor, setSerialEditor] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [header, setHeader] = useState({
    receiptType: "PO_BASED" as "PO_BASED" | "DIRECT", purchaseOrderId: initialPurchaseOrderId || "", branchId: defaultBranchId || "", warehouseId: defaultWarehouseId || "", supplierId: "",
    receiptDate: today(), supplierInvoiceNumber: "", supplierDeliveryNote: "", directReceiptReason: "",
    allowOverReceipt: false, overReceiptReason: "", requiresInspection: false,
    invoiceDate: "", dueDate: "", currencyCode: currency, documentDiscount: "0", freightTotal: "0", otherCharges: "0", notes: "",
  });
  const [rows, setRows] = useState<Row[]>([]);

  const hydrateReceipt = useCallback((record: Record<string, any>) => {
    setDocumentId(record.id); setDocumentNumber(record.receiptNumber); setStatus(record.status);
    setHeader({
      receiptType: record.receiptType, purchaseOrderId: record.purchaseOrderId || "", branchId: record.branchId, warehouseId: record.warehouseId, supplierId: record.supplierId,
      receiptDate: String(record.receiptDate).slice(0, 10), supplierInvoiceNumber: record.supplierInvoiceNumber || "", supplierDeliveryNote: record.supplierDeliveryNote || "",
      directReceiptReason: record.directReceiptReason || "", allowOverReceipt: record.allowOverReceipt, overReceiptReason: record.overReceiptReason || "",
      requiresInspection: record.requiresInspection, invoiceDate: record.invoiceDate ? String(record.invoiceDate).slice(0, 10) : "", dueDate: record.dueDate ? String(record.dueDate).slice(0, 10) : "",
      currencyCode: record.currencyCode, documentDiscount: String(record.documentDiscount), freightTotal: String(record.freightTotal), otherCharges: String(record.otherCharges), notes: record.notes || "",
    });
    setRows(record.lines.map((line: Record<string, any>) => ({
      key: line.id, orderLineId: line.orderLineId || "", productId: line.productId, variantId: line.variantId, description: line.description,
      quantity: String(line.quantity), acceptedQuantity: String(line.acceptedQuantity), rejectedQuantity: String(line.rejectedQuantity), unitCost: String(line.unitCost),
      discountAmount: String(line.discountAmount), taxRuleId: line.taxRuleId || "", taxRate: String(line.taxRate), inspectionNotes: line.inspectionNotes || "",
      unitText: (line.units || []).map((unit: Record<string, any>) => (unit.identifiers || []).map((identifier: Record<string, any>) => identifier.value).join(",")).join("\n"),
    })));
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/operations/lookups", { cache: "no-store" }).then((response) => response.json()),
      receiptId ? fetch(`/api/purchases/receipts/${receiptId}`, { cache: "no-store" }).then((response) => response.json()) : Promise.resolve(null),
    ]).then(([lookupPayload, receiptPayload]) => {
      if (!active) return;
      if (!lookupPayload.data) throw new Error(lookupPayload.error?.message || "Unable to load receiving data.");
      setLookups(lookupPayload.data);
      const selectedOrder = initialPurchaseOrderId ? lookupPayload.data.purchaseOrders.find((order: PurchaseOrder) => order.id === initialPurchaseOrderId) : null;
      const firstBranch = lookupPayload.data.branches[0];
      const branchId = selectedOrder?.branchId || (lookupPayload.data.branches.some((branch: { id: string }) => branch.id === defaultBranchId) ? defaultBranchId : firstBranch?.id) || "";
      const warehouseId = selectedOrder?.warehouseId || (lookupPayload.data.warehouses.some((warehouse: { id: string; branchId: string; allowReceiving: boolean }) => warehouse.id === defaultWarehouseId && warehouse.branchId === branchId && warehouse.allowReceiving) ? defaultWarehouseId : lookupPayload.data.warehouses.find((warehouse: { branchId: string; allowReceiving: boolean }) => warehouse.branchId === branchId && warehouse.allowReceiving)?.id) || "";
      setHeader((current) => ({ ...current, purchaseOrderId: selectedOrder?.id || "", branchId, warehouseId, supplierId: selectedOrder?.supplierId || "" }));
      if (receiptPayload?.data) hydrateReceipt(receiptPayload.data);
      setLoading(false);
    }).catch((error) => { if (active) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to load receiving data." }); setLoading(false); } });
    return () => { active = false; };
  }, [defaultBranchId, defaultWarehouseId, hydrateReceipt, initialPurchaseOrderId, receiptId]);

  const productMap = useMemo(() => new Map((lookups?.products || []).map((product) => [product.id, product])), [lookups]);
  const variantMap = useMemo(() => new Map((lookups?.products || []).flatMap((product) => product.variants.map((variant) => [variant.id, { product, variant }] as const))), [lookups]);
  const catalogItems = useMemo(() => {
    const query = catalogQuery.trim().toLowerCase();
    return (lookups?.products || []).flatMap((product) => product.variants.map((variant) => ({ product, variant }))).filter(({ product, variant }) => !query || [product.sku, product.name, product.model, variant.sku, variant.name, ...variant.barcodes.map((code) => code.barcode)].some((value) => value?.toLowerCase().includes(query))).slice(0, 30);
  }, [catalogQuery, lookups]);

  const rowFromCatalog = useCallback((product: Product, variant: Variant, patch: Partial<Row> = {}): Row => ({
    key: crypto.randomUUID(), orderLineId: "", productId: product.id, variantId: variant.id, description: `${product.name} · ${variant.name}`,
    quantity: "1", acceptedQuantity: "1", rejectedQuantity: "0", unitCost: variant.purchasePrice || "0", discountAmount: "0",
    taxRuleId: product.taxRule?.id || "", taxRate: product.taxRule?.rate || "0", unitText: "", inspectionNotes: "", ...patch,
  }), []);

  const loadPurchaseOrder = useCallback((orderId: string) => {
    if (!lookups) return;
    const order = lookups.purchaseOrders.find((item) => item.id === orderId);
    if (!order) return;
    const orderRows = order.lines.map((line) => {
      const match = variantMap.get(line.variantId); const outstanding = Math.max(0, number(line.orderedQuantity) - number(line.receivedQuantity));
      const proratedDiscount = number(line.orderedQuantity) ? number(line.discountAmount) * outstanding / number(line.orderedQuantity) : 0;
      return match ? rowFromCatalog(match.product, match.variant, { orderLineId: line.id, description: line.description, quantity: String(outstanding), acceptedQuantity: String(outstanding), unitCost: String(line.unitCost), discountAmount: proratedDiscount.toFixed(4), taxRuleId: line.taxRuleId || match.product.taxRule?.id || "", taxRate: String(line.taxRate) }) : null;
    }).filter((row): row is Row => Boolean(row && number(row.quantity) > 0));
    setHeader((current) => ({ ...current, receiptType: "PO_BASED", purchaseOrderId: order.id, branchId: order.branchId, warehouseId: order.warehouseId, supplierId: order.supplierId, currencyCode: order.currencyCode, directReceiptReason: "" }));
    setRows(orderRows);
    setNotice({ kind: "success", text: `${order.orderNumber} loaded with ${orderRows.length} outstanding product lines. Edit received quantities for this delivery.` });
  }, [lookups, rowFromCatalog, variantMap]);

  useEffect(() => {
    if (!receiptId && lookups && !rows.length && header.receiptType === "PO_BASED" && header.purchaseOrderId) loadPurchaseOrder(header.purchaseOrderId);
    // Run only when initial lookup data arrives; later row edits must never be erased.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookups]);

  function updateRow(key: string, patch: Partial<Row>) { setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row)); }
  function updateQuantity(row: Row, quantity: string) {
    const next = Math.max(0, number(quantity)); const rejected = Math.min(number(row.rejectedQuantity), next);
    updateRow(row.key, { quantity, rejectedQuantity: String(rejected), acceptedQuantity: String(Math.max(0, next - rejected)) });
  }
  function updateRejected(row: Row, rejectedQuantity: string) {
    const rejected = Math.max(0, Math.min(number(rejectedQuantity), number(row.quantity)));
    updateRow(row.key, { rejectedQuantity, acceptedQuantity: String(Math.max(0, number(row.quantity) - rejected)) });
  }
  function addProduct(product: Product, variant: Variant, patch: Partial<Row> = {}) {
    setRows((current) => {
      const existing = current.find((row) => row.variantId === variant.id);
      if (existing) {
        const quantity = number(existing.quantity) + number(patch.quantity || "1");
        const unitText = [existing.unitText, patch.unitText].filter(Boolean).join("\n");
        return current.map((row) => row.key === existing.key ? { ...row, quantity: String(quantity), acceptedQuantity: String(quantity - number(row.rejectedQuantity)), unitText } : row);
      }
      return [...current, rowFromCatalog(product, variant, patch)];
    });
    setCatalogOpen(false); setCatalogQuery("");
  }

  async function resolveScan(code: string, patch: Partial<Row> = {}) {
    if (!code.trim()) return;
    setSaving(true); setNotice(null);
    try {
      const response = await fetch(`/api/operations/catalog/resolve?mode=purchase&code=${encodeURIComponent(code.trim())}${header.warehouseId ? `&warehouseId=${header.warehouseId}` : ""}`);
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || "Code was not found.");
      const match = variantMap.get(payload.data.variant.id); if (!match) throw new Error("Resolved item is outside the active catalog.");
      if (header.receiptType === "PO_BASED") {
        const target = rows.find((row) => row.variantId === match.variant.id);
        if (!target) throw new Error("Scanned product is not on the selected purchase order.");
        const next = number(target.quantity) + number(patch.quantity || "1");
        updateQuantity(target, String(next));
      } else addProduct(match.product, match.variant, patch);
      setScanCode(""); setNotice({ kind: "success", text: `${match.product.name} resolved from ${payload.data.resolutionType.toLowerCase()}.` });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to resolve code." }); }
    finally { setSaving(false); }
  }

  function parseUnits(row: Row) {
    const product = productMap.get(row.productId); if (!isSerialized(product?.trackingMethod)) return [];
    const physicalRows = row.unitText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return physicalRows.map((line, index) => {
      const values = line.split(/[\s,;|]+/).map((value) => value.trim()).filter(Boolean);
      const rejected = index >= Math.max(0, number(row.quantity) - number(row.rejectedQuantity));
      return {
        identifiers: values.map((value, identifierIndex) => ({ type: product?.trackingMethod === "IMEI" ? "IMEI" : "SERIAL", value, slot: product?.trackingMethod === "IMEI" ? identifierIndex + 1 : null, isPrimary: identifierIndex === 0 })),
        condition: "NEW",
        inspectionStatus: header.requiresInspection ? "PENDING" : rejected ? "REJECTED" : "ACCEPTED",
      };
    });
  }

  const totals = useMemo(() => {
    const lines = rows.map((row) => { const gross = number(row.acceptedQuantity) * number(row.unitCost); const discount = number(row.discountAmount); const tax = Math.max(0, gross - discount) * number(row.taxRate) / 100; return { gross, discount, tax }; });
    const subtotal = lines.reduce((sum, line) => sum + line.gross, 0), discount = lines.reduce((sum, line) => sum + line.discount, 0), tax = lines.reduce((sum, line) => sum + line.tax, 0);
    return { subtotal, discount, tax, grand: subtotal - discount - number(header.documentDiscount) + tax + number(header.freightTotal) + number(header.otherCharges), accepted: rows.reduce((sum, row) => sum + number(row.acceptedQuantity), 0), rejected: rows.reduce((sum, row) => sum + number(row.rejectedQuantity), 0) };
  }, [header.documentDiscount, header.freightTotal, header.otherCharges, rows]);

  function validate() {
    if (!header.branchId || !header.warehouseId || !header.supplierId) return "Select branch, warehouse, and supplier.";
    if (header.receiptType === "PO_BASED" && !header.purchaseOrderId) return "Select an approved purchase order.";
    if (header.receiptType === "DIRECT" && header.directReceiptReason.trim().length < 10) return "Enter a direct-receipt reason of at least 10 characters.";
    if (header.allowOverReceipt && header.overReceiptReason.trim().length < 10) return "Enter an over-receipt reason of at least 10 characters.";
    if (!rows.length) return "Add at least one received product.";
    for (const [index, row] of rows.entries()) {
      if (number(row.quantity) <= 0 || number(row.acceptedQuantity) + number(row.rejectedQuantity) !== number(row.quantity)) return `Line ${index + 1} accepted plus rejected must equal received quantity.`;
      const product = productMap.get(row.productId); if (isSerialized(product?.trackingMethod)) {
        if (!Number.isInteger(number(row.quantity))) return `Line ${index + 1} serialized quantity must be a whole number.`;
        const units = parseUnits(row); if (units.length !== number(row.quantity)) return `Line ${index + 1} requires ${row.quantity} physical identifier rows; ${units.length} were entered.`;
        if (units.some((unit) => !unit.identifiers.length || (product?.trackingMethod === "IMEI" && unit.identifiers.some((identifier) => !isValidImei(identifier.value))))) return `Line ${index + 1} contains a missing or invalid 15-digit IMEI (including its check digit).`;
      }
    }
    if (number(header.documentDiscount) > totals.subtotal - totals.discount) return "Document discount exceeds accepted net goods value.";
    return null;
  }

  const saveDraft = useCallback(async () => {
    const error = validate(); if (error) { setNotice({ kind: "error", text: error }); return null; }
    setSaving(true); setNotice(null);
    try {
      const body = {
        ...header, purchaseOrderId: header.receiptType === "PO_BASED" ? header.purchaseOrderId : null,
        supplierInvoiceNumber: header.supplierInvoiceNumber || null, supplierDeliveryNote: header.supplierDeliveryNote || null,
        directReceiptReason: header.receiptType === "DIRECT" ? header.directReceiptReason : null,
        overReceiptReason: header.allowOverReceipt ? header.overReceiptReason : null,
        invoiceDate: header.invoiceDate || null, dueDate: header.dueDate || null, notes: header.notes || null,
        idempotencyKey: documentId ? `edit-${documentId}` : `grn-${crypto.randomUUID()}`,
        lines: rows.map((row) => ({
          orderLineId: row.orderLineId || null, productId: row.productId, variantId: row.variantId, taxRuleId: row.taxRuleId || null,
          description: row.description, quantity: row.quantity, acceptedQuantity: row.acceptedQuantity, rejectedQuantity: row.rejectedQuantity,
          unitCost: row.unitCost, discountAmount: row.discountAmount, taxRate: row.taxRate, inspectionNotes: row.inspectionNotes || null, units: parseUnits(row),
        })),
      };
      const response = await fetch(documentId ? `/api/purchases/receipts/${documentId}` : "/api/purchases/receipts", { method: documentId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || "Goods receipt could not be saved.");
      hydrateReceipt(payload.data); setNotice({ kind: "success", text: `${payload.data.receiptNumber} saved. No stock or accounting entry has been posted.` }); return payload.data.id as string;
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Goods receipt could not be saved." }); return null; }
    finally { setSaving(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, header, hydrateReceipt, rows]);

  async function saveAndSubmit() {
    const id = await saveDraft(); if (!id) return; setSaving(true);
    try { const response = await fetch(`/api/purchases/receipts/${id}/submit`, { method: "POST" }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || "Unable to submit receipt."); setStatus(payload.data.status); setNotice({ kind: "success", text: payload.data.status === "INSPECTION" ? "Receipt sent to quality inspection. Stock is unchanged." : "Receipt submitted for independent approval. Stock is unchanged." }); }
    catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to submit receipt." }); } finally { setSaving(false); }
  }

  async function saveAndDirectPost() {
    const id = await saveDraft(); if (!id) return;
    setSaving(true);
    try {
      const subRes = await fetch(`/api/purchases/receipts/${id}/submit`, { method: "POST" });
      const subBody = await subRes.json();
      if (!subRes.ok) throw new Error(subBody.error?.message || "Submit failed.");
      
      const appRes = await fetch(`/api/purchases/receipts/${id}/approve`, { method: "POST" });
      const appBody = await appRes.json();
      if (!appRes.ok) throw new Error(appBody.error?.message || "Approval failed.");

      const postRes = await fetch(`/api/purchases/receipts/${id}/post`, { method: "POST" });
      const postBody = await postRes.json();
      if (!postRes.ok) throw new Error(postBody.error?.message || "Posting failed.");

      hydrateReceipt(postBody.data);
      setNotice({ kind: "success", text: `✓ ${postBody.data.receiptNumber} directly posted! Inventory and GL journals are active.` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Direct posting failed." });
    } finally {
      setSaving(false);
    }
  }

  async function importSpreadsheet(file: File) {
    setSaving(true); setNotice(null);
    try {
      const form = new FormData(); form.set("file", file);
      const response = await fetch("/api/operations/import-spreadsheet", { method: "POST", body: form });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || "Spreadsheet import failed.");
      const lines: string[][] = payload.data.rows;
      const heads = lines[0].map((value) => value.trim().toLowerCase().replaceAll(" ", "_"));
      const codeIndex = heads.findIndex((value) => ["sku", "barcode", "code"].includes(value));
      const qtyIndex = heads.findIndex((value) => ["quantity", "qty"].includes(value));
      const costIndex = heads.findIndex((value) => ["unitcost", "unit_cost", "unit_cost_pkr", "cost"].includes(value));
      const imei1Index = heads.findIndex((value) => ["imei1", "imei_1"].includes(value));
      const imei2Index = heads.findIndex((value) => ["imei2", "imei_2"].includes(value));
      const serialIndex = heads.findIndex((value) => ["serial", "serial_number"].includes(value));
      if (codeIndex < 0) throw new Error("Headers must include sku, barcode, or code.");
      const groups = new Map<string, { code: string; quantity: number; cost?: string; unitLines: string[] }>();
      for (const cells of lines.slice(1)) {
        const code = cells[codeIndex]?.trim(); if (!code) continue;
        const quantity = qtyIndex >= 0 && cells[qtyIndex] ? number(cells[qtyIndex]) : 1;
        if (quantity <= 0) throw new Error(`Quantity for ${code} must be greater than zero.`);
        const cost = costIndex >= 0 ? cells[costIndex]?.trim() : undefined;
        const unitLine = [imei1Index >= 0 ? cells[imei1Index] : "", imei2Index >= 0 ? cells[imei2Index] : ""].filter(Boolean).join(",") || (serialIndex >= 0 ? cells[serialIndex] : "");
        const key = code.toLowerCase(); const existing = groups.get(key);
        if (existing && cost && existing.cost && cost !== existing.cost) throw new Error(`Rows for ${code} contain different unit costs. Import them separately.`);
        groups.set(key, { code, quantity: (existing?.quantity || 0) + quantity, cost: existing?.cost || cost, unitLines: [...(existing?.unitLines || []), ...(unitLine ? [unitLine] : [])] });
      }
      if (!groups.size) throw new Error("The spreadsheet does not contain any product rows.");
      for (const values of groups.values()) {
        const resolved = await fetch(`/api/operations/catalog/resolve?mode=purchase&code=${encodeURIComponent(values.code)}${header.warehouseId ? `&warehouseId=${header.warehouseId}` : ""}`);
        const resolvedPayload = await resolved.json(); if (!resolved.ok) throw new Error(resolvedPayload.error?.message || `${values.code} was not found.`);
        const match = variantMap.get(resolvedPayload.data.variant.id); if (!match) throw new Error(`${values.code} is outside the active catalog.`);
        const unitText = values.unitLines.join("\n");
        if (header.receiptType === "PO_BASED") {
          const target = rows.find((row) => row.variantId === match.variant.id);
          if (!target) throw new Error(`${values.code} is not on the selected purchase order.`);
          const rejected = Math.min(number(target.rejectedQuantity), values.quantity);
          setRows((current) => current.map((row) => row.key === target.key ? { ...row, quantity: String(values.quantity), acceptedQuantity: String(values.quantity - rejected), rejectedQuantity: String(rejected), unitCost: values.cost || row.unitCost, unitText: unitText || row.unitText } : row));
        } else {
          addProduct(match.product, match.variant, { quantity: String(values.quantity), acceptedQuantity: String(values.quantity), unitCost: values.cost || match.variant.purchasePrice || "0", unitText });
        }
      }
      setNotice({ kind: "success", text: `${payload.data.rowCount} ${file.name.toLowerCase().endsWith(".xlsx") ? "Excel" : "CSV"} rows imported into ${groups.size} catalog line(s). Existing unrelated lines were preserved.` });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Spreadsheet import failed." }); }
    finally { setSaving(false); if (importRef.current) importRef.current.value = ""; }
  }

  async function uploadAttachment() {
    if (!documentId || !attachment) return; const form = new FormData(); form.set("entityType", "PurchaseReceipt"); form.set("entityId", documentId); form.set("file", attachment); setSaving(true);
    try { const response = await fetch("/api/purchases/attachments", { method: "POST", body: form }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || "Attachment upload failed."); setAttachment(null); if (fileRef.current) fileRef.current.value = ""; setNotice({ kind: "success", text: `${payload.data.originalName} attached.` }); }
    catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Attachment upload failed." }); } finally { setSaving(false); }
  }

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-600"/>Loading receiving workspace…</div>;
  if (!lookups) return <div className="surface p-8 text-sm text-rose-700">{notice?.text || "Receiving data is unavailable."}</div>;
  const editable = status === "DRAFT";
  const warehouses = lookups.warehouses.filter((warehouse) => warehouse.branchId === header.branchId && warehouse.allowReceiving);
  const activeRow = rows.find((row) => row.key === serialEditor); const activeProduct = activeRow ? productMap.get(activeRow.productId) : null;

  return <div className="space-y-4 pb-24">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><Link href="/purchases" className="mt-1 rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:text-blue-700"><ArrowLeft className="h-4 w-4"/></Link><div><p className="text-xs font-bold uppercase tracking-[.15em] text-blue-700">Procurement · Goods receipt</p><h1 className="mt-1 text-2xl font-bold text-slate-950">{documentNumber || "New goods receipt"}</h1><p className="mt-1 text-sm text-slate-500">Partial receiving · inspection · dual-IMEI physical units · exact-once posting</p></div></div><div className="flex items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${status === "DRAFT" ? "bg-amber-100 text-amber-800" : status === "POSTED" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}`}>{status.replaceAll("_", " ")}</span>{documentId && <Link href={`/goods-receipts/${documentId}/print`} target="_blank" className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold"><Printer className="h-4 w-4"/>Print GRN</Link>}</div></div>
    {notice && <div className={`flex items-start justify-between rounded-xl border px-4 py-3 text-sm ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}><span>{notice.text}</span><button onClick={() => setNotice(null)}><X className="h-4 w-4"/></button></div>}

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
      <div className="space-y-4 min-w-0">
        <section className="surface overflow-hidden"><div className="border-b border-slate-100 bg-gradient-to-r from-blue-50 to-white px-5 py-3"><div className="flex items-center gap-2"><PackageCheck className="h-4 w-4 text-blue-600"/><h2 className="text-sm font-bold">Receipt header</h2></div></div><div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6">
          <label><span className="label">Receipt type *</span><select className={inputClass} value={header.receiptType} disabled={!editable} onChange={(event) => { const receiptType = event.target.value as "PO_BASED" | "DIRECT"; if (receiptType === "DIRECT" && !permissions.includes("PURCHASE_DIRECT_RECEIPT_CREATE")) { setNotice({ kind: "error", text: "You do not have direct-receipt permission." }); return; } setHeader((current) => ({ ...current, receiptType, purchaseOrderId: receiptType === "DIRECT" ? "" : current.purchaseOrderId })); }}><option value="PO_BASED">Against approved PO</option>{permissions.includes("PURCHASE_DIRECT_RECEIPT_CREATE") && <option value="DIRECT">Direct receipt</option>}</select></label>
          {header.receiptType === "PO_BASED" ? <label className="sm:col-span-2"><span className="label">Purchase order *</span><select className={inputClass} value={header.purchaseOrderId} disabled={!editable} onChange={(event) => { const orderId = event.target.value; if (orderId) loadPurchaseOrder(orderId); else { setHeader((current) => ({ ...current, purchaseOrderId: "", supplierId: "" })); setRows([]); setNotice(null); } }}><option value="">Select open PO…</option>{lookups.purchaseOrders.map((order) => <option key={order.id} value={order.id}>{order.orderNumber} · {order.status.replaceAll("_", " ")}</option>)}</select></label> : <label className="sm:col-span-2"><span className="label">Direct receipt reason *</span><input className={inputClass} value={header.directReceiptReason} disabled={!editable} placeholder="Why no purchase order exists" onChange={(event) => setHeader((current) => ({ ...current, directReceiptReason: event.target.value }))}/></label>}
          <label><span className="label">Receipt date *</span><input type="date" className={inputClass} value={header.receiptDate} disabled={!editable} onChange={(event) => setHeader((current) => ({ ...current, receiptDate: event.target.value }))}/></label>
          <label><span className="label">Supplier invoice</span><input className={inputClass} value={header.supplierInvoiceNumber} disabled={!editable} onChange={(event) => setHeader((current) => ({ ...current, supplierInvoiceNumber: event.target.value }))}/></label>
          <label><span className="label">Delivery note</span><input className={inputClass} value={header.supplierDeliveryNote} disabled={!editable} onChange={(event) => setHeader((current) => ({ ...current, supplierDeliveryNote: event.target.value }))}/></label>
          <label><span className="label">Branch *</span><select className={inputClass} value={header.branchId} disabled={!editable || header.receiptType === "PO_BASED"} onChange={(event) => setHeader((current) => ({ ...current, branchId: event.target.value, warehouseId: lookups.warehouses.find((item) => item.branchId === event.target.value && item.allowReceiving)?.id || "" }))}>{lookups.branches.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
          <label><span className="label">Supplier *</span><select className={inputClass} value={header.supplierId} disabled={!editable || header.receiptType === "PO_BASED"} onChange={(event) => setHeader((current) => ({ ...current, supplierId: event.target.value }))}>{lookups.suppliers.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
          <label><span className="label">Warehouse *</span><select className={inputClass} value={header.warehouseId} disabled={!editable || header.receiptType === "PO_BASED"} onChange={(event) => setHeader((current) => ({ ...current, warehouseId: event.target.value }))}>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
          <label><span className="label">Invoice date</span><input type="date" className={inputClass} value={header.invoiceDate} disabled={!editable} onChange={(event) => setHeader((current) => ({ ...current, invoiceDate: event.target.value }))}/></label><label><span className="label">Due date</span><input type="date" className={inputClass} value={header.dueDate} disabled={!editable} onChange={(event) => setHeader((current) => ({ ...current, dueDate: event.target.value }))}/></label>
          <label className="sm:col-span-2"><span className="label">Notes</span><input className={inputClass} value={header.notes} disabled={!editable} onChange={(event) => setHeader((current) => ({ ...current, notes: event.target.value }))}/></label>
        </div></section>



        <section className="surface min-w-0 overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><div><h2 className="text-sm font-bold">Received products <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{rows.length}</span></h2><p className="mt-0.5 text-xs text-slate-500">Received quantity never changes stock until approved posting.</p></div>{editable && <div className="flex rounded-lg bg-slate-100 p-1">{(["search", "scan", "import"] as const).map((mode) => <button key={mode} onClick={() => setEntryMode(mode)} className={`rounded-md px-3 py-1.5 text-xs font-bold capitalize ${entryMode === mode ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>{mode}</button>)}</div>}</div>
          {editable && <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
            {entryMode === "search" && <button disabled={header.receiptType === "PO_BASED"} onClick={() => { setCatalogOpen(true); requestAnimationFrame(() => searchRef.current?.focus()); }} className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"><Search className="h-4 w-4"/>Search real catalog</button>}
            {entryMode === "scan" && <div className="flex h-9 overflow-hidden rounded-lg border border-slate-200 bg-white"><Barcode className="ml-2.5 mt-2.5 h-4 w-4 text-slate-400"/><input className="w-64 px-2 text-sm outline-none" value={scanCode} autoFocus placeholder="Barcode or SKU, then Enter" onChange={(event) => setScanCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void resolveScan(scanCode); }}/><button onClick={() => void resolveScan(scanCode)} className="border-l px-3 text-xs font-bold text-blue-700">Add</button></div>}
            {entryMode === "import" && <><button onClick={() => importRef.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold"><FileSpreadsheet className="h-4 w-4 text-blue-600"/>Import CSV / Excel</button><input ref={importRef} className="hidden" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importSpreadsheet(file); }}/><span className="text-xs text-slate-500">CSV/XLSX columns: SKU/barcode, quantity, unitCost, IMEI1, IMEI2 or serial. Existing unrelated lines remain.</span></>}
            {header.receiptType === "PO_BASED" && <span className="text-xs text-slate-500">PO mode restricts entry to outstanding order products.</span>}
          </div>}
          <div className="overflow-x-auto"><table className="w-full min-w-[1220px]"><thead><tr className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500"><th className="w-10 px-3 py-3">#</th><th className="min-w-64 px-3 py-3">Product</th><th className="w-24 px-2 py-3 text-right">Received</th><th className="w-24 px-2 py-3 text-right">Accepted</th><th className="w-24 px-2 py-3 text-right">Rejected</th><th className="w-28 px-2 py-3 text-right">Unit cost</th><th className="w-28 px-2 py-3 text-right">Discount</th><th className="w-32 px-2 py-3">Tax</th><th className="w-32 px-2 py-3">Identifiers</th><th className="w-28 px-3 py-3 text-right">Total</th><th className="w-10"/></tr></thead><tbody>{rows.map((row, index) => { const match = variantMap.get(row.variantId); const product = match?.product; const gross = number(row.acceptedQuantity) * number(row.unitCost); const tax = Math.max(0, gross - number(row.discountAmount)) * number(row.taxRate) / 100; const enteredUnits = row.unitText.split(/\r?\n/).filter((line) => line.trim()).length; return <tr key={row.key} className="border-t border-slate-100 align-top"><td className="px-3 py-4 text-xs font-semibold text-slate-400">{index + 1}</td><td className="px-3 py-3"><div className="text-sm font-bold text-slate-900">{product?.name}</div><div className="mt-1 text-xs text-slate-500">{match?.variant.name} · {match?.variant.sku}</div><div className="mt-1 flex gap-2 text-[10px] font-semibold uppercase text-slate-400"><span>{product?.trackingMethod}</span><span>{product?.unit.code}</span>{row.orderLineId && <span className="text-blue-600">PO line</span>}</div></td><td className="px-2 py-3"><input className={`${inputClass} text-right`} value={row.quantity} disabled={!editable} onChange={(event) => updateQuantity(row, event.target.value)}/></td><td className="px-2 py-3"><input className={`${inputClass} text-right bg-emerald-50/50`} value={row.acceptedQuantity} disabled title="Accepted is received minus rejected" readOnly/></td><td className="px-2 py-3"><input className={`${inputClass} text-right ${number(row.rejectedQuantity) ? "border-rose-300 bg-rose-50" : ""}`} value={row.rejectedQuantity} disabled={!editable} onChange={(event) => updateRejected(row, event.target.value)}/></td><td className="px-2 py-3"><input className={`${inputClass} text-right`} value={row.unitCost} disabled={!editable} onChange={(event) => updateRow(row.key, { unitCost: event.target.value })}/></td><td className="px-2 py-3"><input className={`${inputClass} text-right`} value={row.discountAmount} disabled={!editable} onChange={(event) => updateRow(row.key, { discountAmount: event.target.value })}/></td><td className="px-2 py-3"><select className={inputClass} value={row.taxRuleId} disabled={!editable || !permissions.includes("PURCHASE_TAX_OVERRIDE")} onChange={(event) => { const rule = lookups.taxRules.find((item) => item.id === event.target.value); updateRow(row.key, { taxRuleId: event.target.value, taxRate: rule?.rate || "0" }); }}><option value="">Zero</option>{lookups.taxRules.filter((rule) => rule.appliesToPurchases).map((rule) => <option key={rule.id} value={rule.id}>{rule.code} {rule.rate}%</option>)}</select></td><td className="px-2 py-3">{isSerialized(product?.trackingMethod) ? <button onClick={() => setSerialEditor(row.key)} className={`flex h-9 w-full items-center justify-center gap-1 rounded-lg border text-xs font-bold ${enteredUnits === number(row.quantity) ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}><Barcode className="h-3.5 w-3.5"/>{product?.trackingMethod === "IMEI" ? "Record IMEIs" : "Record serials"} · {enteredUnits}/{row.quantity}</button> : <span className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">Quantity only</span>}</td><td className="px-3 py-4 text-right text-sm font-bold tabular-nums">{money(gross - number(row.discountAmount) + tax, currency)}</td><td className="px-1 py-3">{editable && header.receiptType === "DIRECT" && <button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}><Trash2 className="h-4 w-4"/></button>}</td></tr>; })}{!rows.length && <tr><td colSpan={11} className="px-6 py-16 text-center"><Boxes className="mx-auto h-9 w-9 text-blue-300"/><h3 className="mt-3 text-sm font-bold">No received products</h3><p className="mt-1 text-xs text-slate-500">Choose an open PO or add direct receipt products.</p></td></tr>}</tbody></table></div>
        </section>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-4">
        <section className="surface overflow-hidden"><div className="border-b bg-slate-50 px-4 py-3"><h2 className="text-sm font-bold">Receiving controls</h2></div><div className="space-y-3 p-4"><label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" className="mt-0.5 rounded border-slate-300 text-blue-600" checked={header.requiresInspection} disabled={!editable} onChange={(event) => setHeader((current) => ({ ...current, requiresInspection: event.target.checked }))}/><span><span className="block text-sm font-bold">Quality inspection</span><span className="mt-0.5 block text-xs leading-4 text-slate-500">Route through inspection before approval. Pending units do not post.</span></span></label>{permissions.includes("PURCHASE_OVER_RECEIPT") && header.receiptType === "PO_BASED" && <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" className="mt-0.5 rounded border-slate-300 text-blue-600" checked={header.allowOverReceipt} disabled={!editable} onChange={(event) => setHeader((current) => ({ ...current, allowOverReceipt: event.target.checked, overReceiptReason: event.target.checked ? current.overReceiptReason : "" }))}/><span><span className="block text-sm font-bold">Authorized over-receipt</span><span className="mt-0.5 block text-xs text-slate-500">Requires permission, reason, and audit trail.</span></span></label>}{header.allowOverReceipt && <textarea className="min-h-20 w-full rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm outline-none" value={header.overReceiptReason} placeholder="Reason for excess receipt…" onChange={(event) => setHeader((current) => ({ ...current, overReceiptReason: event.target.value }))}/>}<div className="grid grid-cols-2 gap-2"><div className="rounded-xl bg-emerald-50 p-3"><div className="text-[10px] font-bold uppercase text-emerald-700">Accepted</div><div className="mt-1 text-xl font-black text-emerald-800">{totals.accepted}</div></div><div className="rounded-xl bg-rose-50 p-3"><div className="text-[10px] font-bold uppercase text-rose-700">Rejected</div><div className="mt-1 text-xl font-black text-rose-800">{totals.rejected}</div></div></div></div></section>
        <section className="surface p-4"><h2 className="text-sm font-bold">Valuation</h2><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate-600">Accepted goods</span><b>{money(totals.subtotal, currency)}</b></div><div className="flex justify-between"><span className="text-slate-600">Line discounts</span><b>− {money(totals.discount, currency)}</b></div><label className="grid grid-cols-[1fr_105px] items-center gap-2"><span className="text-slate-600">Document discount</span><input className={`${inputClass} text-right`} value={header.documentDiscount} disabled={!editable} onChange={(event) => setHeader((current) => ({ ...current, documentDiscount: event.target.value }))}/></label><div className="flex justify-between"><span className="text-slate-600">Input tax</span><b>{money(totals.tax, currency)}</b></div><label className="grid grid-cols-[1fr_105px] items-center gap-2"><span className="text-slate-600">Freight</span><input className={`${inputClass} text-right`} value={header.freightTotal} disabled={!editable} onChange={(event) => setHeader((current) => ({ ...current, freightTotal: event.target.value }))}/></label><label className="grid grid-cols-[1fr_105px] items-center gap-2"><span className="text-slate-600">Other charges</span><input className={`${inputClass} text-right`} value={header.otherCharges} disabled={!editable} onChange={(event) => setHeader((current) => ({ ...current, otherCharges: event.target.value }))}/></label><div className="flex items-end justify-between border-t pt-3"><b>Grand total</b><span className="text-lg font-black text-blue-700">{money(totals.grand, currency)}</span></div></div><p className="mt-3 rounded-lg bg-blue-50 p-2 text-[11px] leading-4 text-blue-800">Landed cost allocations and tax are recalculated by the server. Only accepted quantities affect stock and GL.</p></section>
        {documentId && permissions.includes("PURCHASE_DOCUMENT_ATTACHMENT") && <section className="surface p-4"><h2 className="text-sm font-bold">Attachments</h2><input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx" className="mt-3 block w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1.5" onChange={(event) => setAttachment(event.target.files?.[0] || null)}/><button disabled={!attachment || saving} onClick={() => void uploadAttachment()} className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border text-sm font-bold"><Paperclip className="h-4 w-4"/>Upload</button></section>}
      </aside>
    </div>

    {editable && <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(15,23,42,.08)] backdrop-blur"><div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4 text-blue-600"/>Draft, scan, and submit never alter stock.</div><div className="flex gap-2"><button disabled={saving} onClick={() => void saveDraft()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-bold">{saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4"/>}Save draft</button><button disabled={saving} onClick={() => void saveAndSubmit()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-600 bg-blue-50 px-4 text-sm font-bold text-blue-700 hover:bg-blue-100"><Send className="h-4 w-4"/>Submit</button>{permissions.includes("PURCHASE_RECEIPT_POST") && <button disabled={saving} onClick={() => void saveAndDirectPost()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-700 shadow-sm"><Zap className="h-4 w-4"/>Direct Post Now</button>}</div></div></div>}

    {serialEditor && activeRow && activeProduct && <DeviceIdentifierEditor trackingMethod={activeProduct.trackingMethod as "IMEI" | "SERIAL"} productName={activeRow.description} quantity={Math.max(0, Math.floor(number(activeRow.quantity)))} value={activeRow.unitText} onChange={(value) => updateRow(activeRow.key, { unitText: value })} onClose={() => setSerialEditor(null)} readOnly={!editable}/>}

    {catalogOpen && <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 p-4 pt-[8vh] backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setCatalogOpen(false); }}><div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center gap-3 border-b p-4"><Search className="h-5 w-5 text-blue-600"/><input ref={searchRef} className="h-10 flex-1 outline-none" value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Search name, model, SKU or barcode…"/><button onClick={() => setCatalogOpen(false)}><X className="h-5 w-5 text-slate-400"/></button></div><div className="max-h-[60vh] overflow-y-auto p-2">{catalogItems.map(({ product, variant }) => <button key={variant.id} onClick={() => addProduct(product, variant)} className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left hover:bg-blue-50"><div><div className="text-sm font-bold">{product.name} <span className="font-normal text-slate-500">· {variant.name}</span></div><div className="mt-1 text-xs text-slate-500">{product.sku} · {variant.sku} · {product.trackingMethod}</div></div><ChevronRight className="h-4 w-4 text-blue-600"/></button>)}</div></div></div>}
  </div>;
}
