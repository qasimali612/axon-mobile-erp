"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Barcode,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  Minus,
  PackageSearch,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  Send,
  ShoppingCart,
  Smartphone,
  Trash2,
  Wallet,
  X,
  Zap,
} from "lucide-react";

type Product = { id: string; sku: string; name: string; trackingMethod: string; taxRule?: { id: string; rate: string } | null };
type Variant = { id: string; sku: string; name: string; retailPrice: string; minimumSellingPrice: string };
type CartLine = { key: string; product: Product; variant: Variant; quantity: number; unitPrice: string; discountAmount: string; stockUnitIds: string[]; identifiers: string[]; availableQuantity: number; priceSource?: string; priceFloor?: string };
type PriceListOption = { id: string; code: string; name: string; priceLevel: string; isDefault: boolean };
type Lookup = {
  branches: Array<{ id: string; code: string; name: string }>;
  warehouses: Array<{ id: string; branchId: string; code: string; name: string; allowDispatch: boolean }>;
  customers: Array<{ id: string; branchId: string | null; code: string; name: string; paymentTermsDays: number; creditLimit?: string }>;
  users: Array<{ id: string; fullName: string }>;
};
type Props = { currency: string; userId: string; permissions: string[]; invoiceId?: string };

const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const money = (value: number, currency: string) => new Intl.NumberFormat("en-PK", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0);
const num = (value: string) => Number.isFinite(Number(value)) ? Number(value) : 0;

function playScanBeep(success = true) {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (success) {
      osc.type = "sine";
      osc.frequency.setValueAtTime(1760, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } else {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.22);
    }
  } catch {
    // Non-fatal if browser audio is silenced
  }
}

export function PosWorkspace({ currency, userId, invoiceId }: Props) {
  const router = useRouter();
  const [lookups, setLookups] = useState<Lookup | null>(null);
  const [branchId, setBranchId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [priceLists, setPriceLists] = useState<PriceListOption[]>([]);
  const [priceListId, setPriceListId] = useState("");
  const [resolvedList, setResolvedList] = useState<{ id: string; code: string } | null>(null);
  const [salespersonId, setSalespersonId] = useState(userId);
  const [saleType, setSaleType] = useState<"cash" | "card" | "wallet" | "credit">("cash");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceInvoiceNumber, setSourceInvoiceNumber] = useState("");
  const [sourceIdempotencyKey, setSourceIdempotencyKey] = useState("");
  const [tendered, setTendered] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [invoice, setInvoice] = useState<{ id: string; invoiceNumber: string; status: string } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLSelectElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [lookupResponse, invoiceResponse, priceListResponse] = await Promise.all([
        fetch("/api/operations/lookups", { cache: "no-store" }),
        invoiceId ? fetch(`/api/sales/invoices/${invoiceId}`, { cache: "no-store" }) : Promise.resolve(null),
        fetch("/api/catalog/price-lists", { cache: "no-store" }),
      ]);
      if (priceListResponse.ok) {
        const priceListPayload = await priceListResponse.json().catch(() => null);
        if (active) setPriceLists((priceListPayload?.data || []).filter((list: PriceListOption & { isActive: boolean }) => list.isActive).map((list: PriceListOption) => ({ id: list.id, code: list.code, name: list.name, priceLevel: list.priceLevel, isDefault: list.isDefault })));
      }
      const lookupPayload = await lookupResponse.json().catch(() => null);
      if (!lookupResponse.ok || !lookupPayload?.data) throw new Error(lookupPayload?.error?.message || "POS lookups are unavailable.");
      if (!active) return;
      setLookups(lookupPayload.data);
      if (!invoiceResponse) {
        const branch = lookupPayload.data.branches[0];
        const warehouse = lookupPayload.data.warehouses.find((item: any) => item.branchId === branch?.id && item.allowDispatch);
        const validCusts = (lookupPayload.data.customers || []).filter((item: any) => !item.branchId || item.branchId === branch?.id);
        const walkIn = validCusts.find((c: any) => c.code === "WALK-IN");
        setBranchId(branch?.id || "");
        setWarehouseId(warehouse?.id || "");
        setCustomerId(walkIn?.id || validCusts[0]?.id || "");
        return;
      }
      const invoicePayload = await invoiceResponse.json().catch(() => null);
      if (!invoiceResponse.ok || !invoicePayload?.data) throw new Error(invoicePayload?.error?.message || "Sales invoice could not be loaded.");
      const source = invoicePayload.data;
      if (source.status !== "DRAFT") throw new Error("Only a draft sales invoice can be edited.");
      if (source.preparedById !== userId) throw new Error("Only the invoice preparer can edit this draft.");
      const initialCart: CartLine[] = await Promise.all(source.lines.map(async (line: any) => {
        const serialized = ["IMEI", "SERIAL"].includes(line.product.trackingMethod);
        let availableQuantity = Math.max(Number(line.quantity), line.units.length);
        if (!serialized) {
          const response = await fetch(`/api/operations/catalog/search?mode=sale&warehouseId=${source.warehouseId}&q=${encodeURIComponent(line.variant.sku)}`, { cache: "no-store" });
          const payload = await response.json().catch(() => null);
          const match = payload?.data?.find((item: any) => item.variant.id === line.variantId);
          availableQuantity = Math.max(Number(line.quantity), Number(match?.availableQuantity || 0));
        }
        return {
          key: line.id,
          product: { id: line.productId, sku: line.product.sku, name: line.product.name, trackingMethod: line.product.trackingMethod, taxRule: line.taxRule ? { id: line.taxRule.id, rate: String(line.taxRule.rate) } : null },
          variant: { id: line.variantId, sku: line.variant.sku, name: line.variant.name, retailPrice: String(line.variant.retailPrice), minimumSellingPrice: String(line.variant.minimumSellingPrice) },
          quantity: Number(line.quantity),
          unitPrice: String(line.unitPrice),
          discountAmount: String(line.discountAmount),
          stockUnitIds: line.units.map((unit: any) => unit.stockUnitId),
          identifiers: line.units.map((unit: any) => unit.stockUnit.identifiers.map((identifier: any) => identifier.value).join(" / ")),
          availableQuantity,
        };
      }));
      if (!active) return;
      setBranchId(source.branchId);
      setWarehouseId(source.warehouseId);
      setCustomerId(source.customerId);
      setSalespersonId(source.salespersonId || userId);
      setInvoiceDate(String(source.invoiceDate).slice(0, 10));
      setDueDate(source.dueDate ? String(source.dueDate).slice(0, 10) : "");
      setSaleType(source.dueDate ? "credit" : "cash");
      setNotes(source.notes || "");
      setSourceInvoiceNumber(source.invoiceNumber);
      setSourceIdempotencyKey(source.idempotencyKey);
      setPriceListId(source.priceListId || "");
      setCart(initialCart);
    })().catch((error) => { if (active) setNotice({ kind: "error", text: error instanceof Error ? error.message : "POS could not load." }); });
    return () => { active = false; };
  }, [invoiceId, userId]);

  const warehouses = useMemo(() => (lookups?.warehouses || []).filter((item) => item.branchId === branchId && item.allowDispatch), [branchId, lookups]);
  const selectedCustomer = useMemo(() => lookups?.customers.find((c) => c.id === customerId), [lookups, customerId]);
  const validCustomers = useMemo(
    () => (lookups?.customers || []).filter((item) => !item.branchId || item.branchId === branchId),
    [lookups, branchId]
  );

  const totals = useMemo(() => {
    const subtotal = cart.reduce((sum, line) => sum + line.quantity * num(line.unitPrice), 0);
    const discount = cart.reduce((sum, line) => sum + num(line.discountAmount), 0);
    const tax = cart.reduce((sum, line) => sum + Math.max(0, line.quantity * num(line.unitPrice) - num(line.discountAmount)) * num(line.product.taxRule?.rate || "0") / 100, 0);
    return { subtotal, discount, tax, grand: Math.round((subtotal - discount + tax) * 100) / 100 };
  }, [cart]);

  const resolvePrice = useCallback(async (variantId: string) => {
    if (!customerId) return null;
    const params = new URLSearchParams({ customerId, variantId, date: invoiceDate });
    if (priceListId) params.set("priceListId", priceListId);
    const response = await fetch(`/api/catalog/prices/resolve?${params.toString()}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return null;
    return payload.data as { price: string; minimumPrice: string; source: string; priceListId: string | null; priceListCode: string | null };
  }, [customerId, invoiceDate, priceListId]);

  useEffect(() => {
    if (!customerId || !cart.length) return;
    let active = true;
    (async () => {
      const variantIds = [...new Set(cart.map((line) => line.variant.id))];
      const prices = new Map<string, { price: string; minimumPrice: string; source: string; priceListId: string | null; priceListCode: string | null }>();
      for (const variantId of variantIds) {
        const priced = await resolvePrice(variantId);
        if (priced) prices.set(variantId, priced);
      }
      if (!active || !prices.size) return;
      const first = prices.values().next().value;
      if (first?.priceListId) setResolvedList({ id: first.priceListId, code: first.priceListCode || "" });
      setCart((current) => current.map((line) => {
        const priced = prices.get(line.variant.id);
        if (!priced) return line;
        return { ...line, unitPrice: String(priced.price), priceFloor: String(priced.minimumPrice), priceSource: priced.source };
      }));
    })().catch(() => undefined);
    return () => { active = false; };
    // Cart identity is intentionally excluded so manual price edits are not overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, priceListId, invoiceDate]);

  const addResolved = useCallback(async (data: any) => {
    const product: Product = data.product; const variant: Variant = data.variant;
    const priced = await resolvePrice(variant.id);
    const unitPrice = String(priced?.price ?? variant.retailPrice);
    const priceFloor = String(priced?.minimumPrice ?? variant.minimumSellingPrice);
    const priceSource = priced?.source ?? "VARIANT";
    if (priced?.priceListId) setResolvedList({ id: priced.priceListId, code: priced.priceListCode || "" });
    if (data.resolutionType === "DEVICE_IDENTIFIER") {
      const stockUnitId = data.stockUnit.id;
      if (cart.some((line) => line.stockUnitIds.includes(stockUnitId))) throw new Error("This physical device is already in the cart. Either IMEI resolves to the same unit.");
      setCart((current) => {
        const existing = current.find((line) => line.variant.id === variant.id && line.stockUnitIds.length > 0);
        if (existing) return current.map((line) => line.key === existing.key ? { ...line, quantity: line.quantity + 1, stockUnitIds: [...line.stockUnitIds, stockUnitId], identifiers: [...line.identifiers, data.stockUnit.identifiers.map((item: any) => item.value).join(" / ")] } : line);
        return [...current, { key: crypto.randomUUID(), product, variant, quantity: 1, unitPrice, discountAmount: "0", stockUnitIds: [stockUnitId], identifiers: [data.stockUnit.identifiers.map((item: any) => item.value).join(" / ")], availableQuantity: 1, priceSource, priceFloor }];
      });
    } else {
      if (["IMEI", "SERIAL"].includes(product.trackingMethod)) throw new Error("Scan an IMEI or serial number to select the exact physical unit.");
      const available = Number(data.availableQuantity || 0);
      setCart((current) => {
        const existing = current.find((line) => line.variant.id === variant.id && !line.stockUnitIds.length);
        if (existing) {
          if (existing.quantity + 1 > available) throw new Error(`Only ${available} units are available.`);
          return current.map((line) => line.key === existing.key ? { ...line, quantity: line.quantity + 1, availableQuantity: available } : line);
        }
        if (available < 1) throw new Error("This item has no available quantity in the selected warehouse.");
        return [...current, { key: crypto.randomUUID(), product, variant, quantity: 1, unitPrice, discountAmount: "0", stockUnitIds: [], identifiers: [], availableQuantity: available, priceSource, priceFloor }];
      });
    }
  }, [cart, resolvePrice]);

  const isScanningRef = useRef(false);

  async function scan(overrideCode?: string) {
    const code = (overrideCode ?? scanCode).trim();
    if (!code || !warehouseId) return;
    if (isScanningRef.current) return;
    isScanningRef.current = true;

    // Instantly clear scanner input row so it's clean and ready for new scanning immediately
    setScanCode("");
    setBusy(true);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/operations/catalog/resolve?mode=sale&warehouseId=${warehouseId}&code=${encodeURIComponent(code)}`,
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message || "Item was not found or unavailable in this warehouse.");
      }

      await addResolved(payload.data);
      playScanBeep(true);
      setNotice({
        kind: "success",
        text: `⚡ ${payload.data.product.name} (${payload.data.variant.name}) auto-added to cart! Ready for next scan.`,
      });
    } catch (error) {
      playScanBeep(false);
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Scan failed.",
      });
    } finally {
      setBusy(false);
      isScanningRef.current = false;
      // Refocus the scanner input immediately so continuous gun scanning doesn't miss a beat
      requestAnimationFrame(() => scanRef.current?.focus());
    }
  }

  async function searchCatalog(query = searchQuery) {
    setBusy(true);
    try { const response = await fetch(`/api/operations/catalog/search?mode=sale&warehouseId=${warehouseId}&q=${encodeURIComponent(query)}`); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || "Catalog search failed."); setSearchResults(payload.data || []); }
    catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Catalog search failed." }); }
    finally { setBusy(false); }
  }

  function updateQuantity(key: string, quantity: number) {
    setCart((current) => current.map((line) => {
      if (line.key !== key || line.stockUnitIds.length) return line;
      return { ...line, quantity: Math.max(1, Math.min(quantity, line.availableQuantity)) };
    }));
  }

  async function createInvoice(submit: boolean, postNow = false) {
    if (!branchId || !warehouseId || !customerId || !cart.length) { setNotice({ kind: "error", text: "Select a customer and add at least one available item." }); return; }
    setBusy(true); setNotice(null);
    try {
      const body = {
        branchId, warehouseId, customerId, salespersonId: salespersonId || null, priceListId: priceListId || null, invoiceDate,
        dueDate: saleType === "credit" ? (dueDate || invoiceDate) : null, currencyCode: currency,
        notes: notes.trim() || `POS [${saleType.toUpperCase()}]${saleType === "cash" && tendered ? ` · tendered ${tendered} · change ${Math.max(0, num(tendered) - totals.grand).toFixed(2)}` : ""}. Counter checkout.`,
        idempotencyKey: sourceIdempotencyKey || `pos-${crypto.randomUUID()}`,
        lines: cart.map((line) => ({
          productId: line.product.id, variantId: line.variant.id, taxRuleId: line.product.taxRule?.id || null, taxRate: line.product.taxRule?.rate || "0",
          description: `${line.product.name} · ${line.variant.name}`, quantity: String(line.quantity), unitPrice: line.unitPrice,
          discountAmount: line.discountAmount || "0", stockUnitIds: line.stockUnitIds,
        })),
      };
      const response = await fetch(invoiceId ? `/api/sales/invoices/${invoiceId}` : "/api/sales/invoices", { method: invoiceId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || `Sales draft could not be ${invoiceId ? "updated" : "created"}.`);
      let status = payload.data.status;
      const targetInvoiceId = payload.data.id;
      const invNum = payload.data.invoiceNumber;

      if (submit || postNow) {
        const submitResponse = await fetch(`/api/sales/invoices/${targetInvoiceId}/submit`, { method: "POST" });
        const submitPayload = await submitResponse.json();
        if (!submitResponse.ok) throw new Error(submitPayload.error?.message || "Invoice was saved but could not be submitted.");
        status = submitPayload.data.status;
      }

      if (postNow) {
        // Fast-track auto approval and posting for single-user/authorized counter checkout
        try {
          const approveResponse = await fetch(`/api/sales/invoices/${targetInvoiceId}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
          const approvePayload = await approveResponse.json();
          if (approveResponse.ok) {
            status = approvePayload.data.status;
            // Now attempt posting to deduct physical inventory and write GL journals
            const postResponse = await fetch(`/api/sales/invoices/${targetInvoiceId}/post`, { method: "POST" });
            const postPayload = await postResponse.json();
            if (postResponse.ok) {
              status = "POSTED";
              setInvoice({ id: targetInvoiceId, invoiceNumber: invNum, status: "POSTED" });
              setNotice({ kind: "success", text: `⚡ ${invNum} completed and POSTED! Physical stock deducted and financial ledger updated.` });
              return;
            }
          }
        } catch {
          // If maker-checker in multi-user mode prevents self-approval, fall back gracefully to submitted
        }
      }

      setInvoice({ id: targetInvoiceId, invoiceNumber: invNum, status });
      setNotice({ kind: "success", text: `${invNum} ${submit ? "submitted for approval" : "parked as a draft"}. Physical stock remains reserved until posted.` });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "POS invoice could not be saved." }); }
    finally { setBusy(false); }
  }

  function reset() { if (invoiceId) { router.push("/sales"); return; } setCart([]); setInvoice(null); setTendered(""); setNotes(""); setNotice(null); requestAnimationFrame(() => scanRef.current?.focus()); }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "F2") { event.preventDefault(); setSearchOpen(true); requestAnimationFrame(() => { searchRef.current?.focus(); void searchCatalog(""); }); }
      if (event.key === "F4") { event.preventDefault(); customerRef.current?.focus(); }
      if (event.key === "F8") {
        event.preventDefault();
        if (cart.length > 0 && !invoice) setCart([]);
      }
      if (event.ctrlKey && event.key === "Enter") { event.preventDefault(); void createInvoice(true, true); }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
    // createInvoice reads current state and is intentionally rebound on render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, branchId, warehouseId, customerId, salespersonId, saleType, invoiceDate, dueDate, notes, tendered, invoiceId, sourceIdempotencyKey]);

  if (!lookups) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-600"/><span className="text-sm text-slate-500">Opening POS terminal…</span></div>;
  const change = Math.max(0, num(tendered) - totals.grand);
  const shortage = Math.max(0, totals.grand - num(tendered));

  return <div className="-m-4 min-h-[calc(100vh-72px)] bg-slate-100 sm:-m-6 lg:-m-8">
    {/* POS Header Bar */}
    <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-500/20">
              <ShoppingCart className="h-5 w-5"/>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-slate-950">
                  {invoiceId ? `Edit ${sourceInvoiceNumber || "Sales Draft"}` : "Point of Sale (POS)"}
                </h1>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                  Counter Terminal
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Mixed IMEI Dual-SIM Handsets + Quantity Accessories & Spares{resolvedList ? ` · Active Price List: ${resolvedList.code}` : ""}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px]">
            <b className="text-blue-700">F2</b> Search Catalog
          </span>
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px]">
            <b className="text-blue-700">F4</b> Customer
          </span>
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px]">
            <b className="text-blue-700">F8</b> Clear Cart
          </span>
          <span className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 font-mono text-[11px] text-emerald-900">
            <b className="text-emerald-700">Ctrl+Enter</b> ⚡ Quick Tender
          </span>
        </div>
      </div>
    </div>

    <div className="grid min-h-[calc(100vh-137px)] lg:grid-cols-[minmax(0,1fr)_410px]">
      <main className="min-w-0 p-4 sm:p-5">
        {/* Terminal Configuration & Context Fields */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <label>
              <span className="label">Branch</span>
              <select
                className={inputClass}
                value={branchId}
                disabled={Boolean(invoice)}
                onChange={(event) => {
                  const next = event.target.value;
                  setBranchId(next);
                  setWarehouseId(lookups.warehouses.find((item) => item.branchId === next && item.allowDispatch)?.id || "");
                  const nextAvail = (lookups.customers || []).filter((item) => !item.branchId || item.branchId === next);
                  if (!nextAvail.some((c) => c.id === customerId)) {
                    const walkIn = nextAvail.find((c) => c.code === "WALK-IN");
                    setCustomerId(walkIn?.id || nextAvail[0]?.id || "");
                  }
                  setCart([]);
                }}
              >
                {lookups.branches.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Dispatch warehouse</span>
              <select className={inputClass} value={warehouseId} disabled={Boolean(invoice)} onChange={(event) => { setWarehouseId(event.target.value); setCart([]); }}>
                {warehouses.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Customer</span>
              <select ref={customerRef} className={inputClass} value={customerId} disabled={Boolean(invoice)} onChange={(event) => setCustomerId(event.target.value)}>
                <option value="">Select customer…</option>
                {validCustomers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} · {item.name} {!item.branchId ? "(All Branches)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Salesperson</span>
              <select className={inputClass} value={salespersonId} disabled={Boolean(invoice)} onChange={(event) => setSalespersonId(event.target.value)}>
                {lookups.users.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Invoice date</span>
              <input type="date" className={inputClass} value={invoiceDate} disabled={Boolean(invoice)} onChange={(event) => setInvoiceDate(event.target.value)}/>
            </label>
            <label>
              <span className="label">Price list</span>
              <select className={inputClass} value={priceListId} disabled={Boolean(invoice)} onChange={(event) => setPriceListId(event.target.value)}>
                <option value="">Auto (customer / default)</option>
                {priceLists.map((list) => <option key={list.id} value={list.id}>{list.code} · {list.priceLevel}{list.isDefault ? " · default" : ""}</option>)}
              </select>
            </label>
          </div>

          {/* Customer Profile & Credit Terms Banner */}
          {selectedCustomer && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">{selectedCustomer.name}</span>
                <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-700">{selectedCustomer.code}</span>
              </div>
              <div className="flex items-center gap-3">
                <span>Terms: <b className="text-slate-800">{selectedCustomer.paymentTermsDays === 0 ? "Immediate Cash" : `Net ${selectedCustomer.paymentTermsDays} Days`}</b></span>
                {selectedCustomer.creditLimit && (
                  <span>Credit Limit: <b className="text-blue-700">{money(Number(selectedCustomer.creditLimit), currency)}</b></span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* High-Contrast Professional Barcode & Scanner Input Console */}
        <div className="mt-4 overflow-hidden rounded-2xl border-2 border-blue-600 bg-slate-950 shadow-[0_8px_30px_rgba(37,99,235,.2)]">
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 py-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
              </span>
              <span className="font-mono font-bold tracking-wide text-emerald-400">
                ● BARCODE SCANNER ACTIVE
              </span>
              <span className="hidden text-slate-400 sm:inline">
                (Dual-SIM IMEI 1 / IMEI 2 / Serial / Barcode / SKU)
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
              <span>Autofocus: On</span>
            </div>
          </div>
          <div className="flex items-center bg-slate-950">
            <div className="grid w-14 place-items-center text-blue-400">
              <Barcode className="h-7 w-7"/>
            </div>
            <input
              ref={scanRef}
              autoFocus
              disabled={Boolean(invoice)}
              className="h-16 flex-1 bg-transparent px-2 font-mono text-base font-bold text-white outline-none placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:text-slate-500 sm:text-lg"
              value={scanCode}
              onChange={(event) => {
                const val = event.target.value;
                setScanCode(val);
                const trimmed = val.trim();
                // Auto-trigger scan if hardware scanner inputs a full 15-digit IMEI or 13-digit EAN
                if (/^\d{15}$/.test(trimmed) || /^\d{13}$/.test(trimmed)) {
                  void scan(trimmed);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  void scan();
                }
              }}
              placeholder="Point barcode scanner gun (IMEI / Barcode / SKU) — auto-adds & clears row for continuous scanning…"
            />
            {scanCode && (
              <button onClick={() => setScanCode("")} className="px-3 text-slate-400 hover:text-white">
                <X className="h-5 w-5"/>
              </button>
            )}
            <button
              disabled={busy || Boolean(invoice)}
              onClick={() => void scan()}
              className="h-16 border-l border-slate-800 bg-blue-600 px-6 text-sm font-black text-white transition hover:bg-blue-500 active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin"/> : "ADD"}
            </button>
            <button
              disabled={Boolean(invoice)}
              onClick={() => { setSearchOpen(true); requestAnimationFrame(() => { searchRef.current?.focus(); void searchCatalog(""); }); }}
              className="h-16 border-l border-slate-800 px-5 text-slate-300 transition hover:bg-slate-900 hover:text-white"
              title="Search Catalog (F2)"
            >
              <Search className="h-5 w-5"/>
            </button>
          </div>
        </div>

        {notice && (
          <div className={`mt-3 flex items-start justify-between rounded-xl border p-3.5 text-sm ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
            <span className="font-medium">{notice.text}</span>
            <button onClick={() => setNotice(null)} className="ml-2 rounded p-0.5 hover:bg-black/5"><X className="h-4 w-4"/></button>
          </div>
        )}

        {/* Sales Cart Table */}
        <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black text-slate-900">Cart Items</h2>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                {cart.reduce((sum, line) => sum + line.quantity, 0)} units
              </span>
            </div>
            {cart.length > 0 && !invoice && (
              <button onClick={() => setCart([])} className="flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700">
                <Trash2 className="h-3.5 w-3.5"/>
                Clear cart (F8)
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Item / Serial Unit</th>
                  <th className="w-32 px-3 py-3 text-center">Quantity</th>
                  <th className="w-36 px-3 py-3 text-right">Unit Price</th>
                  <th className="w-28 px-3 py-3 text-right">Discount</th>
                  <th className="w-28 px-3 py-3 text-right">Tax</th>
                  <th className="w-36 px-4 py-3 text-right">Total</th>
                  <th className="w-10"/>
                </tr>
              </thead>
              <tbody>
                {cart.map((line) => {
                  const lineTax = Math.max(0, line.quantity * num(line.unitPrice) - num(line.discountAmount)) * num(line.product.taxRule?.rate || "0") / 100;
                  const lineTotal = line.quantity * num(line.unitPrice) - num(line.discountAmount) + lineTax;
                  return (
                    <tr key={line.key} className="border-t border-slate-100 align-top hover:bg-slate-50/50">
                      <td className="px-5 py-3.5">
                        <div className="flex items-start gap-2.5">
                          {line.stockUnitIds.length > 0 ? (
                            <span className="mt-0.5 grid h-6 w-6 place-items-center rounded bg-emerald-100 text-emerald-700">
                              <Smartphone className="h-3.5 w-3.5"/>
                            </span>
                          ) : null}
                          <div>
                            <div className="font-bold text-slate-900">{line.product.name} · {line.variant.name}</div>
                            <div className="mt-0.5 text-xs text-slate-500">{line.variant.sku} · {line.product.trackingMethod}</div>
                            {line.identifiers.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {line.identifiers.map((item, index) => (
                                  <div key={`${item}-${index}`} className="inline-flex rounded-md bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-800">
                                    Device #{index + 1}: {item}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        {line.stockUnitIds.length ? (
                          <div className="flex h-9 items-center justify-center rounded-lg bg-slate-100 font-mono text-sm font-bold text-slate-800">
                            {line.quantity}
                          </div>
                        ) : (
                          <div className="flex h-9 overflow-hidden rounded-lg border border-slate-200">
                            <button disabled={Boolean(invoice)} onClick={() => updateQuantity(line.key, line.quantity - 1)} className="px-2 hover:bg-slate-50">
                              <Minus className="h-3 w-3"/>
                            </button>
                            <input disabled={Boolean(invoice)} className="w-14 border-x border-slate-200 text-center text-sm font-bold outline-none" value={line.quantity} onChange={(event) => updateQuantity(line.key, Number(event.target.value))}/>
                            <button disabled={Boolean(invoice)} onClick={() => updateQuantity(line.key, line.quantity + 1)} className="px-2 hover:bg-slate-50">
                              <Plus className="h-3 w-3"/>
                            </button>
                          </div>
                        )}
                        <div className="mt-1 text-center text-[9px] text-slate-400">Available: {line.availableQuantity}</div>
                      </td>
                      <td className="px-3 py-3.5">
                        <input disabled={Boolean(invoice)} className={`${inputClass} text-right font-semibold`} value={line.unitPrice} onChange={(event) => setCart((current) => current.map((item) => item.key === line.key ? { ...item, unitPrice: event.target.value } : item))}/>
                        <div className={`mt-1 text-right text-[9px] ${line.priceFloor && num(line.unitPrice) < num(line.priceFloor) ? "font-bold text-rose-600" : "text-slate-400"}`}>
                          {line.priceFloor ? `Min Floor: ${line.priceFloor}` : ""}
                          {line.priceSource ? ` · ${line.priceSource === "PRICE_LIST" ? "List Price" : "Variant Price"}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        <input disabled={Boolean(invoice)} className={`${inputClass} text-right`} value={line.discountAmount} onChange={(event) => setCart((current) => current.map((item) => item.key === line.key ? { ...item, discountAmount: event.target.value } : item))}/>
                      </td>
                      <td className="px-3 py-4 text-right text-sm">
                        {money(lineTax, currency)}
                        <div className="text-[9px] text-slate-400">{line.product.taxRule?.rate || 0}%</div>
                      </td>
                      <td className="px-4 py-4 text-right text-sm font-black text-slate-900">
                        {money(lineTotal, currency)}
                      </td>
                      <td className="px-2 py-3.5">
                        {!invoice && (
                          <button onClick={() => setCart((current) => current.filter((item) => item.key !== line.key))} className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                            <Trash2 className="h-4 w-4"/>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!cart.length && (
                  <tr>
                    <td colSpan={7} className="py-20 text-center">
                      <PackageSearch className="mx-auto h-12 w-12 text-slate-300"/>
                      <h3 className="mt-3 text-base font-bold text-slate-700">POS Cart is Empty</h3>
                      <p className="mt-1 text-xs text-slate-400">
                        Scan handset IMEI, barcode sticker, or type SKU in the scanner above.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Checkout Sidebar Pane */}
      <aside className="border-l border-slate-200 bg-white p-5">
        <div className="sticky top-4 space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Tender & Payment Mode</p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <button disabled={Boolean(invoice)} onClick={() => setSaleType("cash")} className={`rounded-xl border p-2.5 text-left transition ${saleType === "cash" ? "border-emerald-500 bg-emerald-50 text-emerald-900 shadow-sm" : "border-slate-200 hover:bg-slate-50"}`}>
                <CreditCard className="h-4 w-4 text-emerald-600"/>
                <div className="mt-1.5 text-xs font-bold">Immediate Cash</div>
                <div className="text-[10px] text-slate-500">Direct cash register</div>
              </button>
              <button disabled={Boolean(invoice)} onClick={() => setSaleType("card")} className={`rounded-xl border p-2.5 text-left transition ${saleType === "card" ? "border-blue-500 bg-blue-50 text-blue-900 shadow-sm" : "border-slate-200 hover:bg-slate-50"}`}>
                <CreditCard className="h-4 w-4 text-blue-600"/>
                <div className="mt-1.5 text-xs font-bold">Card POS</div>
                <div className="text-[10px] text-slate-500">Bank debit / credit</div>
              </button>
              <button disabled={Boolean(invoice)} onClick={() => setSaleType("wallet")} className={`rounded-xl border p-2.5 text-left transition ${saleType === "wallet" ? "border-purple-500 bg-purple-50 text-purple-900 shadow-sm" : "border-slate-200 hover:bg-slate-50"}`}>
                <Wallet className="h-4 w-4 text-purple-600"/>
                <div className="mt-1.5 text-xs font-bold">Mobile Wallet</div>
                <div className="text-[10px] text-slate-500">EasyPaisa / Jazz / Raast</div>
              </button>
              <button disabled={Boolean(invoice)} onClick={() => setSaleType("credit")} className={`rounded-xl border p-2.5 text-left transition ${saleType === "credit" ? "border-amber-500 bg-amber-50 text-amber-900 shadow-sm" : "border-slate-200 hover:bg-slate-50"}`}>
                <Clock3 className="h-4 w-4 text-amber-600"/>
                <div className="mt-1.5 text-xs font-bold">Credit Account</div>
                <div className="text-[10px] text-slate-500">Terms & due date</div>
              </button>
            </div>
          </div>

          {saleType === "credit" ? (
            <label className="block">
              <span className="label">Payment Due Date *</span>
              <input type="date" className={inputClass} min={invoiceDate} value={dueDate} disabled={Boolean(invoice)} onChange={(event) => setDueDate(event.target.value)}/>
            </label>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <span className="label">Cash Tendered</span>
                {tendered ? (
                  <button type="button" onClick={() => setTendered("")} className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-600">
                    <RotateCcw className="h-3 w-3"/> Clear
                  </button>
                ) : null}
              </div>

              {/* Quick Cash Tender Denomination Chips */}
              <div className="mb-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={Boolean(invoice) || totals.grand <= 0}
                  onClick={() => setTendered(String(totals.grand))}
                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100"
                >
                  Exact ({money(totals.grand, currency)})
                </button>
                <button
                  type="button"
                  disabled={Boolean(invoice)}
                  onClick={() => setTendered((curr) => String(num(curr) + 500))}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  +500
                </button>
                <button
                  type="button"
                  disabled={Boolean(invoice)}
                  onClick={() => setTendered((curr) => String(num(curr) + 1000))}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  +1,000
                </button>
                <button
                  type="button"
                  disabled={Boolean(invoice)}
                  onClick={() => setTendered((curr) => String(num(curr) + 5000))}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  +5,000
                </button>
                <button
                  type="button"
                  disabled={Boolean(invoice)}
                  onClick={() => setTendered((curr) => String(num(curr) + 10000))}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  +10,000
                </button>
              </div>

              <input
                className={`${inputClass} text-right font-mono text-xl font-black text-slate-900`}
                inputMode="decimal"
                value={tendered}
                disabled={Boolean(invoice)}
                placeholder="0.00"
                onChange={(event) => setTendered(event.target.value)}
              />
            </div>
          )}

          {/* Prominent High-Contrast Change Return or Shortage Card */}
          {saleType !== "credit" && num(tendered) > 0 && totals.grand > 0 && (
            <div>
              {num(tendered) >= totals.grand ? (
                <div className="rounded-xl border border-emerald-400 bg-emerald-950 p-4 text-emerald-200 shadow-md">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-emerald-400">
                    <span>Change Return</span>
                    <span className="rounded bg-emerald-800 px-2 py-0.5 text-[10px] text-emerald-100">Ready to Hand Over</span>
                  </div>
                  <div className="mt-1 text-2xl font-black text-emerald-300">
                    {money(change, currency)}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-400 bg-amber-950 p-4 text-amber-200 shadow-md">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-amber-400">
                    <span>Balance Remaining</span>
                    <span className="rounded bg-amber-800 px-2 py-0.5 text-[10px] text-amber-100">Pending Tender</span>
                  </div>
                  <div className="mt-1 text-2xl font-black text-amber-300">
                    − {money(shortage, currency)}
                  </div>
                </div>
              )}
            </div>
          )}

          <label className="block">
            <span className="label">Invoice Notes</span>
            <textarea
              rows={2}
              className="w-full rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:border-blue-500"
              value={notes}
              disabled={Boolean(invoice)}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional customer reference or remarks"
            />
          </label>

          {/* Totals Summary Card */}
          <div className="rounded-2xl bg-slate-950 p-5 text-white shadow-xl">
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between text-slate-300">
                <span>Subtotal</span>
                <b className="font-mono">{money(totals.subtotal, currency)}</b>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Discount</span>
                <b className="font-mono">− {money(totals.discount, currency)}</b>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Sales Tax</span>
                <b className="font-mono">{money(totals.tax, currency)}</b>
              </div>
              <div className="border-t border-white/15 pt-3">
                <div className="flex items-end justify-between">
                  <span className="text-sm font-bold uppercase tracking-wider text-slate-200">Grand Total</span>
                  <span className="text-2xl font-black text-blue-300">{money(totals.grand, currency)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Checkout Action Buttons */}
          {!invoice ? (
            <div className="space-y-2 pt-1">
              <button
                disabled={busy || !cart.length}
                onClick={() => void createInvoice(true, true)}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-black text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin"/> : <Zap className="h-5 w-5"/>}
                ⚡ Complete Sale & Post (Print)
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={busy || !cart.length}
                  onClick={() => void createInvoice(true, false)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                >
                  <Send className="h-4 w-4"/>
                  Submit for Approval
                </button>
                <button
                  disabled={busy || !cart.length}
                  onClick={() => void createInvoice(false, false)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  <ReceiptText className="h-4 w-4"/>
                  {invoiceId ? "Save Changes" : "Park Draft"}
                </button>
              </div>
              <p className="text-center text-[10px] leading-4 text-slate-400">
                ⚡ Complete Sale directly decrements inventory and posts GL journals in authorized counter mode.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-center shadow-md">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600"/>
              <h3 className="mt-2 text-base font-black text-emerald-950">{invoice.invoiceNumber}</h3>
              <p className="mt-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
                {invoice.status.replaceAll("_", " ")}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Link
                  href={`/sales/${invoice.id}/print`}
                  target="_blank"
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 text-sm font-bold text-white shadow hover:bg-emerald-800"
                >
                  <Printer className="h-4 w-4"/>
                  Print Official Receipt / Invoice
                </Link>
                <button
                  onClick={reset}
                  className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-emerald-300 bg-white text-xs font-bold text-emerald-800 hover:bg-emerald-100/50"
                >
                  {invoiceId ? "Back to Register" : "+ Start Next Sale (Reset)"}
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>

    {/* Catalog Search Modal (F2) */}
    {searchOpen && (
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/50 p-4 pt-[8vh] backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
        <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex items-center gap-3 border-b border-slate-200 p-4">
            <Search className="h-5 w-5 text-blue-600"/>
            <input
              ref={searchRef}
              className="h-10 flex-1 outline-none placeholder:text-slate-400"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void searchCatalog(); }}
              placeholder="Search product name, brand, model, SKU, or barcode…"
            />
            <button onClick={() => void searchCatalog()} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700">
              Search
            </button>
            <button onClick={() => setSearchOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <X className="h-5 w-5"/>
            </button>
          </div>
          <div className="max-h-[62vh] overflow-y-auto p-2">
            {searchResults.map((result) => {
              const serialized = ["IMEI", "SERIAL"].includes(result.product.trackingMethod);
              return (
                <button
                  key={result.variant.id}
                  disabled={serialized || Number(result.availableQuantity) < 1}
                  onClick={() => { void addResolved({ ...result, resolutionType: "CATALOG" }).then(() => setSearchOpen(false)); }}
                  className="flex w-full items-center justify-between rounded-xl p-3.5 text-left transition hover:bg-blue-50 disabled:opacity-50"
                >
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      {result.product.name} · <span className="font-normal text-slate-500">{result.variant.name}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      <span className="font-mono">{result.variant.sku}</span> · {result.product.trackingMethod}
                      {serialized ? " · Scan physical IMEI on gun to select unit" : ` · Available: ${result.availableQuantity}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <b className="font-mono text-sm text-blue-700">{money(Number(result.variant.retailPrice), currency)}</b>
                    {!serialized && <Plus className="ml-auto mt-1 h-4 w-4 text-blue-600"/>}
                  </div>
                </button>
              );
            })}
            {!searchResults.length && (
              <div className="py-14 text-center text-sm text-slate-400">
                Type a query or press Search to browse available warehouse stock.
              </div>
            )}
          </div>
        </div>
      </div>
    )}
  </div>;
}
