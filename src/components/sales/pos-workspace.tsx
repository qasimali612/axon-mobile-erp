"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  Barcode,
  CheckCircle2,
  Clock3,
  Coins,
  CreditCard,
  HandCoins,
  Landmark,
  Layers,
  Loader2,
  Minus,
  PackageSearch,
  Plus,
  Printer,
  Receipt,
  ReceiptText,
  RotateCcw,
  Search,
  ShoppingCart,
  Smartphone,
  Trash2,
  UserCheck,
  Wallet,
  X,
  Zap,
} from "lucide-react";

type Product = { id: string; sku: string; name: string; trackingMethod: string; taxRule?: { id: string; rate: string } | null };
type Variant = { id: string; sku: string; name: string; retailPrice: string; minimumSellingPrice: string };
type CartLine = {
  key: string;
  product: Product;
  variant: Variant;
  quantity: number;
  unitPrice: string;
  discountAmount: string;
  stockUnitIds: string[];
  identifiers: string[];
  availableQuantity: number;
  priceSource?: string;
  priceFloor?: string;
};
type PriceListOption = { id: string; code: string; name: string; priceLevel: string; isDefault: boolean };
type Lookup = {
  branches: Array<{ id: string; code: string; name: string }>;
  warehouses: Array<{ id: string; branchId: string; code: string; name: string; allowDispatch: boolean }>;
  customers: Array<{ id: string; branchId: string | null; code: string; name: string; phone?: string; email?: string; taxNumber?: string; paymentTermsDays: number; creditLimit?: string }>;
  users: Array<{ id: string; fullName: string }>;
  banks?: Array<{ id: string; branchId: string | null; code: string; bankName: string; currencyCode: string }>;
  cashAccounts?: Array<{ id: string; branchId: string | null; code: string; name: string; currencyCode: string }>;
};
type PosTerminalRecord = { id: string; code: string; name: string; branchId: string; defaultCashAccountId?: string | null };
type PosShiftRecord = {
  id: string;
  terminalId: string;
  cashierId: string;
  status: "OPEN" | "CLOSED";
  openingFloat: string | number;
  openedAt: string;
  terminal?: PosTerminalRecord;
  cashier?: { id: string; fullName: string };
};
type Props = { currency: string; userId: string; permissions?: string[]; invoiceId?: string };

const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const money = (value: number, currency: string) => new Intl.NumberFormat("en-PK", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0);
const num = (value: string | number) => Number.isFinite(Number(value)) ? Number(value) : 0;

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

export function PosWorkspace({ currency, userId, permissions = [], invoiceId }: Props) {
  const router = useRouter();
  const [lookups, setLookups] = useState<Lookup | null>(null);
  const [branchId, setBranchId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerDetails, setCustomerDetails] = useState<{ creditLimit?: string; outstanding?: string } | null>(null);
  const [priceLists, setPriceLists] = useState<PriceListOption[]>([]);
  const [priceListId, setPriceListId] = useState("");
  const [resolvedList, setResolvedList] = useState<{ id: string; code: string } | null>(null);
  const [salespersonId, setSalespersonId] = useState(userId);
  const [saleType, setSaleType] = useState<"cash" | "card" | "wallet" | "credit" | "split">("cash");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceInvoiceNumber, setSourceInvoiceNumber] = useState("");
  const [sourceIdempotencyKey, setSourceIdempotencyKey] = useState("");

  // Terminals & Shifts
  const [terminals, setTerminals] = useState<PosTerminalRecord[]>([]);
  const [selectedTerminalId, setSelectedTerminalId] = useState("");
  const [activeShift, setActiveShift] = useState<PosShiftRecord | null>(null);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [shiftAction, setShiftAction] = useState<"open" | "close">("open");
  const [openingFloat, setOpeningFloat] = useState("0");
  const [closingActualCash, setClosingActualCash] = useState("0");
  const [shiftNotes, setShiftNotes] = useState("");

  // Tender Inputs
  const [cashAccountId, setCashAccountId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [tendered, setTendered] = useState("");
  const [cardReference, setCardReference] = useState("");
  const [walletReference, setWalletReference] = useState("");

  // Split Payment Matrix State
  const [splitCash, setSplitCash] = useState("");
  const [splitCard, setSplitCard] = useState("");
  const [splitWallet, setSplitWallet] = useState("");

  // Credit Invoice Advance State
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceMethod, setAdvanceMethod] = useState<"CASH" | "BANK">("CASH");
  const [advanceReference, setAdvanceReference] = useState("");
  const [advanceTendered, setAdvanceTendered] = useState("");

  // Scanner & Cart State
  const [scanCode, setScanCode] = useState("");
  const [autoAdd, setAutoAdd] = useState(true);
  const autoScanTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [invoice, setInvoice] = useState<{ id: string; invoiceNumber: string; status: string } | null>(null);

  // Parked Sales State
  const [parkedOpen, setParkedOpen] = useState(false);
  const [parkedInvoices, setParkedInvoices] = useState<any[]>([]);
  const [loadingParked, setLoadingParked] = useState(false);

  // Credit Limit Override Dialog (Zero-Approval Direct Permission Check)
  const [creditOverrideDialog, setCreditOverrideDialog] = useState<any>(null);
  const [creditOverrideReason, setCreditOverrideReason] = useState("");

  // DOM Refs
  const scanRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLSelectElement>(null);
  const salespersonRef = useRef<HTMLSelectElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const tenderInputRef = useRef<HTMLInputElement>(null);

  // 1. Initial Data Loading
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

      const defaultCash = lookupPayload.data.cashAccounts?.[0]?.id || "";
      const defaultBank = lookupPayload.data.banks?.[0]?.id || "";
      setCashAccountId(defaultCash);
      setBankAccountId(defaultBank);

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
      if (source.status === "POSTED" || source.status === "REVERSED" || source.status === "CANCELLED") {
        throw new Error("Posted, reversed, or cancelled sales invoices cannot be edited.");
      }
      const canEdit =
        source.preparedById === userId ||
        permissions.includes("SALES_INVOICE_CREATE") ||
        permissions.includes("SALES_INVOICE_POST") ||
        permissions.includes("sales.manage");
      if (!canEdit) throw new Error("Only the invoice preparer or authorized staff can edit this sales draft.");
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

  // 2. Fetch Terminals & Shift for Selected Branch
  useEffect(() => {
    if (!branchId) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/pos/terminals?branchId=${branchId}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (active && res.ok && json?.data?.length) {
          setTerminals(json.data);
          const activeTerm = json.data[0];
          setSelectedTerminalId(activeTerm.id);
          if (activeTerm.defaultCashAccountId) {
            setCashAccountId(activeTerm.defaultCashAccountId);
          }
          // Fetch active shift
          const shiftRes = await fetch(`/api/pos/shifts/active?terminalId=${activeTerm.id}`, { cache: "no-store" });
          const shiftJson = await shiftRes.json().catch(() => null);
          if (active && shiftRes.ok) {
            setActiveShift(shiftJson?.data || null);
          }
        }
      } catch {
        // non-fatal
      }
    })();
    return () => { active = false; };
  }, [branchId]);

  // 3. Fetch Customer Outstanding & Credit Profile
  useEffect(() => {
    if (!customerId) { setCustomerDetails(null); return; }
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/customers/${customerId}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (active && res.ok && json?.data) {
          setCustomerDetails({
            creditLimit: json.data.creditLimit,
            outstanding: json.data.outstanding || "0.0000",
          });
        }
      } catch {
        // non-fatal
      }
    })();
    return () => { active = false; };
  }, [customerId]);

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
  }, [customerId, priceListId, invoiceDate]);

  const addResolved = useCallback(async (data: any) => {
    const product: Product = data.product;
    const variant: Variant = data.variant;
    const priced = await resolvePrice(variant.id);
    const unitPrice = String(priced?.price ?? variant.retailPrice);
    const priceFloor = String(priced?.minimumPrice ?? variant.minimumSellingPrice);
    const priceSource = priced?.source ?? "VARIANT";
    if (priced?.priceListId) setResolvedList({ id: priced.priceListId, code: priced.priceListCode || "" });

    if (data.resolutionType === "DEVICE_IDENTIFIER") {
      const stockUnitId = data.stockUnit.id;
      if (cart.some((line) => line.stockUnitIds.includes(stockUnitId))) {
        throw new Error("This physical handset is already in the cart. Both IMEI1 and IMEI2 resolve to the exact same device.");
      }
      setCart((current) => {
        const existing = current.find((line) => line.variant.id === variant.id && line.stockUnitIds.length > 0);
        if (existing) {
          return current.map((line) =>
            line.key === existing.key
              ? {
                  ...line,
                  quantity: line.quantity + 1,
                  stockUnitIds: [...line.stockUnitIds, stockUnitId],
                  identifiers: [...line.identifiers, data.stockUnit.identifiers.map((item: any) => item.value).join(" / ")],
                }
              : line
          );
        }
        return [
          ...current,
          {
            key: crypto.randomUUID(),
            product,
            variant,
            quantity: 1,
            unitPrice,
            discountAmount: "0",
            stockUnitIds: [stockUnitId],
            identifiers: [data.stockUnit.identifiers.map((item: any) => item.value).join(" / ")],
            availableQuantity: 1,
            priceSource,
            priceFloor,
          },
        ];
      });
    } else {
      if (["IMEI", "SERIAL"].includes(product.trackingMethod)) {
        throw new Error("Scan an IMEI or serial number to select the exact physical handset unit.");
      }
      const available = Number(data.availableQuantity || 0);
      setCart((current) => {
        const existing = current.find((line) => line.variant.id === variant.id && !line.stockUnitIds.length);
        if (existing) {
          if (existing.quantity + 1 > available) throw new Error(`Only ${available} units are available in this warehouse.`);
          return current.map((line) => (line.key === existing.key ? { ...line, quantity: line.quantity + 1, availableQuantity: available } : line));
        }
        if (available < 1) throw new Error("This item has no available stock in the selected dispatch warehouse.");
        return [
          ...current,
          {
            key: crypto.randomUUID(),
            product,
            variant,
            quantity: 1,
            unitPrice,
            discountAmount: "0",
            stockUnitIds: [],
            identifiers: [],
            availableQuantity: available,
            priceSource,
            priceFloor,
          },
        ];
      });
    }
  }, [cart, resolvePrice]);

  const isScanningRef = useRef(false);

  async function scan(overrideCode?: string) {
    if (autoScanTimerRef.current) {
      clearTimeout(autoScanTimerRef.current);
      autoScanTimerRef.current = null;
    }
    const code = (overrideCode ?? scanCode).trim();
    if (!code || !warehouseId) return;
    if (isScanningRef.current) return;
    isScanningRef.current = true;

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
      requestAnimationFrame(() => scanRef.current?.focus());
    }
  }

  async function searchCatalog(query = searchQuery) {
    setBusy(true);
    try {
      const response = await fetch(`/api/operations/catalog/search?mode=sale&warehouseId=${warehouseId}&q=${encodeURIComponent(query)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Catalog search failed.");
      setSearchResults(payload.data || []);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Catalog search failed." });
    } finally {
      setBusy(false);
    }
  }

  function updateQuantity(key: string, quantity: number) {
    setCart((current) => current.map((line) => {
      if (line.key !== key || line.stockUnitIds.length) return line;
      return { ...line, quantity: Math.max(1, Math.min(quantity, line.availableQuantity)) };
    }));
  }

  async function loadParkedSales() {
    setLoadingParked(true);
    try {
      const res = await fetch(`/api/pos/parked?branchId=${branchId}`);
      const json = await res.json().catch(() => null);
      if (res.ok && json?.data) {
        setParkedInvoices(json.data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingParked(false);
    }
  }

  function recallParkedSale(parked: any) {
    setCustomerId(parked.customerId);
    setBranchId(parked.branchId);
    setWarehouseId(parked.warehouseId);
    setSalespersonId(parked.salespersonId || userId);
    setInvoiceDate(String(parked.invoiceDate).slice(0, 10));
    setDueDate(parked.dueDate ? String(parked.dueDate).slice(0, 10) : "");
    setSaleType(parked.dueDate ? "credit" : "cash");
    setNotes(parked.notes || "");
    setSourceInvoiceNumber(parked.invoiceNumber);
    setSourceIdempotencyKey(parked.idempotencyKey);

    const loadedLines: CartLine[] = parked.lines.map((line: any) => {
      const serialized = ["IMEI", "SERIAL"].includes(line.product.trackingMethod);
      return {
        key: line.id,
        product: { id: line.productId, sku: line.product.sku, name: line.product.name, trackingMethod: line.product.trackingMethod, taxRule: line.taxRule ? { id: line.taxRule.id, rate: String(line.taxRule.rate) } : null },
        variant: { id: line.variantId, sku: line.variant.sku, name: line.variant.name, retailPrice: String(line.variant.retailPrice), minimumSellingPrice: String(line.variant.minimumSellingPrice) },
        quantity: Number(line.quantity),
        unitPrice: String(line.unitPrice),
        discountAmount: String(line.discountAmount),
        stockUnitIds: line.units.map((u: any) => u.stockUnitId),
        identifiers: line.units.map((u: any) => u.stockUnit?.identifiers?.map((i: any) => i.value).join(" / ") || ""),
        availableQuantity: Math.max(Number(line.quantity), serialized ? 1 : 10),
      };
    });
    setCart(loadedLines);
    setParkedOpen(false);
    setNotice({
      kind: "success",
      text: `Draft ${parked.invoiceNumber} recalled into active POS workspace.`,
    });
  }

  // 4. Primary Atomic POS Checkout Execution
  async function completeSale(overrideReason?: string) {
    if (!branchId || !warehouseId || !customerId || !cart.length) {
      setNotice({ kind: "error", text: "Select a customer and add at least one available item." });
      return;
    }

    setBusy(true);
    setNotice(null);

    // Prepare Tenders Payload
    const tendersPayload: any[] = [];
    let isCreditSale = false;

    if (saleType === "cash") {
      tendersPayload.push({
        paymentMethod: "CASH",
        cashAccountId,
        amount: String(totals.grand),
        tenderedAmount: tendered || String(totals.grand),
        changeAmount: String(Math.max(0, num(tendered) - totals.grand)),
      });
    } else if (saleType === "card") {
      tendersPayload.push({
        paymentMethod: "CARD",
        bankAccountId,
        amount: String(totals.grand),
        reference: cardReference || undefined,
      });
    } else if (saleType === "wallet") {
      tendersPayload.push({
        paymentMethod: "WALLET",
        bankAccountId,
        amount: String(totals.grand),
        reference: walletReference || undefined,
      });
    } else if (saleType === "credit") {
      isCreditSale = true;
      const advNum = num(advanceAmount);
      if (advNum > 0) {
        tendersPayload.push({
          paymentMethod: advanceMethod,
          cashAccountId: advanceMethod === "CASH" ? cashAccountId : null,
          bankAccountId: advanceMethod === "BANK" ? bankAccountId : null,
          amount: String(advNum),
          tenderedAmount: advanceTendered || String(advNum),
          reference: advanceReference || undefined,
        });
      }
    } else if (saleType === "split") {
      if (num(splitCash) > 0) {
        tendersPayload.push({ paymentMethod: "CASH", cashAccountId, amount: splitCash });
      }
      if (num(splitCard) > 0) {
        tendersPayload.push({ paymentMethod: "CARD", bankAccountId, amount: splitCard, reference: cardReference || undefined });
      }
      if (num(splitWallet) > 0) {
        tendersPayload.push({ paymentMethod: "WALLET", bankAccountId, amount: splitWallet, reference: walletReference || undefined });
      }
      const totalSplitTenders = num(splitCash) + num(splitCard) + num(splitWallet);
      if (totalSplitTenders < totals.grand) {
        isCreditSale = true;
      }
    }

    const checkoutBody = {
      branchId,
      warehouseId,
      customerId,
      salespersonId: salespersonId || null,
      terminalId: selectedTerminalId || null,
      shiftId: activeShift?.id || null,
      priceListId: priceListId || null,
      invoiceDate,
      dueDate: isCreditSale ? (dueDate || invoiceDate) : null,
      currencyCode: currency,
      notes: notes.trim() || undefined,
      idempotencyKey: sourceIdempotencyKey || `pos-${crypto.randomUUID()}`,
      lines: cart.map((line) => ({
        productId: line.product.id,
        variantId: line.variant.id,
        taxRuleId: line.product.taxRule?.id || null,
        taxRate: line.product.taxRule?.rate || "0",
        description: `${line.product.name} · ${line.variant.name}`,
        quantity: String(line.quantity),
        unitPrice: line.unitPrice,
        discountAmount: line.discountAmount || "0",
        stockUnitIds: line.stockUnitIds,
      })),
      tenders: tendersPayload,
      isCreditSale,
      creditOverrideReason: overrideReason || undefined,
    };

    try {
      const response = await fetch("/api/pos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checkoutBody),
      });
      const payload = await response.json();

      if (!response.ok) {
        if (payload?.error?.code === "CREDIT_LIMIT_EXCEEDED") {
          setCreditOverrideDialog({
            details: payload.error.details,
            grandTotal: totals.grand,
          });
          setCreditOverrideReason(`Counter credit checkout authorized for ${selectedCustomer?.name || "Customer"}`);
          throw new Error(`Customer credit limit exceeded. Managerial authorization required.`);
        }
        throw new Error(payload?.error?.message || "POS checkout failed.");
      }

      const inv = payload.data.invoice;
      const remainingBalance = payload.data.remainingCreditBalance;
      setInvoice({ id: inv.id, invoiceNumber: inv.invoiceNumber, status: "POSTED" });
      setCreditOverrideDialog(null);
      setCreditOverrideReason("");

      playScanBeep(true);
      setNotice({
        kind: "success",
        text: `⚡ ${inv.invoiceNumber} completed and POSTED! Handset custody updated to SOLD, inventory deducted, and GL journals balanced.${
          num(remainingBalance) > 0 ? ` Remaining credit balance: ${money(num(remainingBalance), currency)} due on terms.` : " Full payment received and settled."
        }`,
      });
    } catch (error) {
      playScanBeep(false);
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Checkout error." });
    } finally {
      setBusy(false);
    }
  }

  // 5. Park / Save as Draft Action
  async function parkSale() {
    if (!branchId || !warehouseId || !customerId || !cart.length) {
      setNotice({ kind: "error", text: "Select a customer and add items before parking." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const body = {
        branchId,
        warehouseId,
        customerId,
        salespersonId: salespersonId || null,
        priceListId: priceListId || null,
        invoiceDate,
        dueDate: dueDate || null,
        currencyCode: currency,
        notes: notes || "Parked counter sale",
        idempotencyKey: sourceIdempotencyKey || `park-${crypto.randomUUID()}`,
        lines: cart.map((line) => ({
          productId: line.product.id,
          variantId: line.variant.id,
          taxRuleId: line.product.taxRule?.id || null,
          taxRate: line.product.taxRule?.rate || "0",
          description: `${line.product.name} · ${line.variant.name}`,
          quantity: String(line.quantity),
          unitPrice: line.unitPrice,
          discountAmount: line.discountAmount || "0",
          stockUnitIds: line.stockUnitIds,
        })),
      };
      const response = await fetch("/api/sales/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Failed to park sale.");
      setCart([]);
      setNotice({
        kind: "success",
        text: `Sale draft ${payload.data.invoiceNumber} successfully parked. Recall it anytime using Parked Sales.`,
      });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Failed to park sale." });
    } finally {
      setBusy(false);
    }
  }

  // 6. Shift Management Handlers
  async function handleOpenShift() {
    if (!branchId || !selectedTerminalId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/pos/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          terminalId: selectedTerminalId,
          openingFloat: openingFloat || 0,
          notes: shiftNotes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Failed to open shift.");
      setActiveShift(json.data);
      setShiftModalOpen(false);
      setNotice({ kind: "success", text: `Shift opened on ${json.data.terminal?.code || "Terminal"} with opening float of ${money(num(openingFloat), currency)}.` });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Failed to open shift." });
    } finally {
      setBusy(false);
    }
  }

  async function handleCloseShift() {
    if (!activeShift) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/pos/shifts/${activeShift.id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          closingActualCash: closingActualCash || 0,
          notes: shiftNotes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Failed to close shift.");
      setActiveShift(null);
      setShiftModalOpen(false);
      const diff = num(json.data.cashDifference);
      setNotice({
        kind: "success",
        text: `Shift closed. Expected cash: ${money(num(json.data.closingExpectedCash), currency)} · Counted: ${money(num(json.data.closingActualCash), currency)} · Variance: ${money(diff, currency)}.`,
      });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Failed to close shift." });
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    if (invoiceId) { router.push("/sales"); return; }
    setCart([]);
    setInvoice(null);
    setTendered("");
    setAdvanceAmount("");
    setAdvanceReference("");
    setAdvanceTendered("");
    setSplitCash("");
    setSplitCard("");
    setSplitWallet("");
    setCardReference("");
    setWalletReference("");
    setNotes("");
    setNotice(null);
    setSourceInvoiceNumber("");
    setSourceIdempotencyKey("");
    requestAnimationFrame(() => scanRef.current?.focus());
  }

  // 7. Global Ergonomic Keyboard Shortcuts
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => { searchRef.current?.focus(); void searchCatalog(""); });
      }
      if (event.key === "F3") {
        event.preventDefault();
        scanRef.current?.focus();
      }
      if (event.key === "F4") {
        event.preventDefault();
        customerRef.current?.focus();
      }
      if (event.key === "F6") {
        event.preventDefault();
        salespersonRef.current?.focus();
      }
      if (event.key === "F8") {
        event.preventDefault();
        if (cart.length > 0 && !invoice) {
          if (window.confirm("Are you sure you want to clear all items from the cart?")) {
            setCart([]);
          }
        }
      }
      if (event.key === "F9") {
        event.preventDefault();
        if (cart.length > 0 && !invoice) {
          void parkSale();
        }
      }
      if (event.key === "F10") {
        event.preventDefault();
        tenderInputRef.current?.focus();
      }
      if (event.ctrlKey && event.key === "Enter") {
        event.preventDefault();
        void completeSale();
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setParkedOpen(false);
        setShiftModalOpen(false);
        setCreditOverrideDialog(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  if (!lookups) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-600" />
        <span className="text-sm text-slate-500">Opening POS counter terminal…</span>
      </div>
    );
  }

  const change = Math.max(0, num(tendered) - totals.grand);
  const shortage = Math.max(0, totals.grand - num(tendered));
  const advanceNum = num(advanceAmount);
  const remainingCreditDue = Math.max(0, totals.grand - advanceNum);
  const splitTendersSum = num(splitCash) + num(splitCard) + num(splitWallet);
  const splitRemainingDue = Math.max(0, totals.grand - splitTendersSum);

  return (
    <div className="-m-4 min-h-[calc(100vh-72px)] bg-slate-100 sm:-m-6 lg:-m-8">
      {/* AREA 1: TOP HEADER BAR */}
      <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-500/20">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-slate-950">
                  {invoiceId ? `Edit ${sourceInvoiceNumber || "Sales Draft"}` : "Point of Sale (POS)"}
                </h1>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                  Counter Terminal
                </span>
                {activeShift ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-800">
                    <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
                    Shift: {activeShift.terminal?.code || "POS-01"} (Open)
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                    Shift Closed
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Mixed IMEI Dual-SIM Handsets + Quantity Accessories & Spares{resolvedList ? ` · Active Price List: ${resolvedList.code}` : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            {/* Shift Drawer Button */}
            <button
              type="button"
              onClick={() => {
                if (activeShift) {
                  setShiftAction("close");
                  setClosingActualCash(String(activeShift.openingFloat));
                } else {
                  setShiftAction("open");
                  setOpeningFloat("0");
                }
                setShiftModalOpen(true);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition shadow-2xs"
            >
              <Coins className="h-3.5 w-3.5 text-amber-600" />
              {activeShift ? "Close Shift / Drawer" : "Open Shift Drawer"}
            </button>

            {/* Parked Sales Button */}
            <button
              type="button"
              onClick={() => {
                setParkedOpen(true);
                void loadParkedSales();
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition shadow-2xs"
            >
              <ReceiptText className="h-3.5 w-3.5 text-blue-600" />
              Parked Sales (F9)
            </button>

            {/* Keyboard Shortcuts Pills */}
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px]" title="Press F2 to search catalog">
              <b className="text-blue-700">F2</b> Catalog
            </span>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px]" title="Press F3 to focus barcode scanner">
              <b className="text-blue-700">F3</b> Scan
            </span>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px]" title="Press F4 to select customer">
              <b className="text-blue-700">F4</b> Customer
            </span>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px]" title="Press F6 to select salesperson">
              <b className="text-blue-700">F6</b> Staff
            </span>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px]" title="Press F8 to clear cart">
              <b className="text-blue-700">F8</b> Clear
            </span>
            <span className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 font-mono text-[11px] text-emerald-900 shadow-2xs" title="Press Ctrl+Enter to quick tender and complete sale">
              <b className="text-emerald-700">Ctrl+Enter</b> ⚡ Quick Tender
            </span>
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-137px)] lg:grid-cols-[minmax(0,1fr)_430px]">
        {/* LEFT MAIN: TERMINAL CONFIG, SCANNER & CART */}
        <main className="min-w-0 p-4 sm:p-5">
          {/* Terminal & Operational Header Context Fields */}
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
                <span className="label">Customer (F4)</span>
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
                <span className="label">Salesperson (F6)</span>
                <select ref={salespersonRef} className={inputClass} value={salespersonId} disabled={Boolean(invoice)} onChange={(event) => setSalespersonId(event.target.value)}>
                  {lookups.users.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}
                </select>
              </label>
              <label>
                <span className="label">Invoice date</span>
                <input type="date" className={inputClass} value={invoiceDate} disabled={Boolean(invoice)} onChange={(event) => setInvoiceDate(event.target.value)} />
              </label>
              <label>
                <span className="label">Price list</span>
                <select className={inputClass} value={priceListId} disabled={Boolean(invoice)} onChange={(event) => setPriceListId(event.target.value)}>
                  <option value="">Auto (customer / default)</option>
                  {priceLists.map((list) => <option key={list.id} value={list.id}>{list.code} · {list.priceLevel}{list.isDefault ? " · default" : ""}</option>)}
                </select>
              </label>
            </div>

            {/* Customer Profile & Credit Info Card */}
            {selectedCustomer && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700 border border-slate-200">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-blue-600" />
                  <span className="font-bold text-slate-900">{selectedCustomer.name}</span>
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-800">{selectedCustomer.code}</span>
                  {selectedCustomer.phone && <span className="text-[11px] text-slate-500 font-mono">📱 {selectedCustomer.phone}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span>Terms: <b className="text-slate-900">{selectedCustomer.paymentTermsDays === 0 ? "Immediate Cash" : `Net ${selectedCustomer.paymentTermsDays} Days`}</b></span>
                  {customerDetails?.creditLimit && (
                    <span>Credit Limit: <b className="text-blue-700">{money(Number(customerDetails.creditLimit), currency)}</b></span>
                  )}
                  {customerDetails?.outstanding && (
                    <span>Current AR: <b className="text-amber-800">{money(Number(customerDetails.outstanding), currency)}</b></span>
                  )}
                  {customerDetails?.creditLimit && customerDetails?.outstanding && (
                    <span>Available: <b className="text-emerald-700">{money(Math.max(0, Number(customerDetails.creditLimit) - Number(customerDetails.outstanding)), currency)}</b></span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* AREA 2: HIGH-CONTRAST BARCODE & SCANNER CONSOLE */}
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
              <div className="flex items-center gap-2.5 font-mono text-[11px]">
                <button
                  type="button"
                  onClick={() => setAutoAdd((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold transition ${
                    autoAdd
                      ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/50"
                      : "bg-slate-800 text-slate-400 hover:text-slate-300 ring-1 ring-slate-700"
                  }`}
                  title="Toggle Auto-Add Mode"
                >
                  <Zap className={`h-3 w-3 ${autoAdd ? "text-emerald-400 fill-emerald-400" : "text-slate-500"}`} />
                  AUTO-ADD: {autoAdd ? "ENABLED" : "OFF"}
                </button>
                <span className="text-slate-600">|</span>
                <span className="text-slate-400">Autofocus: On (F3)</span>
              </div>
            </div>
            <div className="flex items-center bg-slate-950">
              <div className="grid w-14 place-items-center text-blue-400">
                <Barcode className="h-7 w-7" />
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
                  if (!trimmed || !autoAdd) return;

                  if (
                    /^\d{15}$/.test(trimmed) ||
                    /^\d{14}$/.test(trimmed) ||
                    /^\d{13}$/.test(trimmed) ||
                    /^\d{12}$/.test(trimmed) ||
                    /^\d{8}$/.test(trimmed)
                  ) {
                    if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
                    void scan(trimmed);
                    return;
                  }

                  if (trimmed.length >= 3) {
                    if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
                    autoScanTimerRef.current = setTimeout(() => {
                      void scan(trimmed);
                    }, 140);
                  }
                }}
                onPaste={(event) => {
                  if (!autoAdd) return;
                  const pastedText = event.clipboardData.getData("text").trim();
                  if (pastedText) {
                    event.preventDefault();
                    if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
                    setScanCode("");
                    void scan(pastedText);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "Tab") {
                    event.preventDefault();
                    if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
                    void scan();
                  }
                }}
                placeholder={
                  autoAdd
                    ? "Scan barcode, IMEI, or SKU — auto-adds to cart and clears row for next scan..."
                    : "Type barcode / IMEI / SKU and click ADD..."
                }
              />
              {scanCode && (
                <button
                  type="button"
                  onClick={() => {
                    if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
                    setScanCode("");
                  }}
                  className="px-3 text-slate-400 hover:text-white"
                  title="Clear barcode input"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
              <button
                disabled={busy || Boolean(invoice)}
                onClick={() => {
                  if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
                  void scan();
                }}
                className="h-16 border-l border-slate-800 bg-blue-600 px-6 text-sm font-black text-white transition hover:bg-blue-500 active:scale-[0.98] disabled:opacity-50"
                title="Click or press Enter to add item"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "ADD"}
              </button>
              <button
                disabled={Boolean(invoice)}
                onClick={() => { setSearchOpen(true); requestAnimationFrame(() => { searchRef.current?.focus(); void searchCatalog(""); }); }}
                className="h-16 border-l border-slate-800 px-5 text-slate-300 transition hover:bg-slate-900 hover:text-white"
                title="Search Catalog (F2)"
              >
                <Search className="h-5 w-5" />
              </button>
            </div>
          </div>

          {notice && (
            <div className={`mt-3 flex items-start justify-between rounded-xl border p-3.5 text-sm ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
              <span className="font-medium">{notice.text}</span>
              <button onClick={() => setNotice(null)} className="ml-2 rounded p-0.5 hover:bg-black/5"><X className="h-4 w-4" /></button>
            </div>
          )}

          {/* AREA 3: SALES CART DATA TABLE */}
          <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-slate-900">Cart Items</h2>
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                  {cart.reduce((sum, line) => sum + line.quantity, 0)} units
                </span>
              </div>
              {cart.length > 0 && !invoice && (
                <button
                  onClick={() => {
                    if (window.confirm("Are you sure you want to clear all items from the cart?")) {
                      setCart([]);
                    }
                  }}
                  className="flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear cart (F8)
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3">Item / Dual-SIM IMEI Unit</th>
                    <th className="w-32 px-3 py-3 text-center">Quantity</th>
                    <th className="w-36 px-3 py-3 text-right">Unit Price</th>
                    <th className="w-28 px-3 py-3 text-right">Discount</th>
                    <th className="w-28 px-3 py-3 text-right">Tax</th>
                    <th className="w-36 px-4 py-3 text-right">Total</th>
                    <th className="w-10" />
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
                                <Smartphone className="h-3.5 w-3.5" />
                              </span>
                            ) : null}
                            <div>
                              <div className="font-bold text-slate-900">{line.product.name} · {line.variant.name}</div>
                              <div className="mt-0.5 text-xs text-slate-500">{line.variant.sku} · {line.product.trackingMethod}</div>
                              {line.identifiers.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {line.identifiers.map((item, index) => (
                                    <div key={`${item}-${index}`} className="inline-flex rounded-md bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-800 border border-blue-100">
                                      Handset #{index + 1}: {item}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          {line.stockUnitIds.length ? (
                            <div className="flex h-9 items-center justify-center rounded-lg bg-slate-100 font-mono text-sm font-bold text-slate-800" title="Serialized handset units are strictly 1 unit per device">
                              {line.quantity}
                            </div>
                          ) : (
                            <div className="flex h-9 overflow-hidden rounded-lg border border-slate-200">
                              <button disabled={Boolean(invoice)} onClick={() => updateQuantity(line.key, line.quantity - 1)} className="px-2 hover:bg-slate-50">
                                <Minus className="h-3 w-3" />
                              </button>
                              <input disabled={Boolean(invoice)} className="w-14 border-x border-slate-200 text-center text-sm font-bold outline-none" value={line.quantity} onChange={(event) => updateQuantity(line.key, Number(event.target.value))} />
                              <button disabled={Boolean(invoice)} onClick={() => updateQuantity(line.key, line.quantity + 1)} className="px-2 hover:bg-slate-50">
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                          <div className="mt-1 text-center text-[9px] text-slate-400">Available: {line.availableQuantity}</div>
                        </td>
                        <td className="px-3 py-3.5">
                          <input disabled={Boolean(invoice)} className={`${inputClass} text-right font-semibold`} value={line.unitPrice} onChange={(event) => setCart((current) => current.map((item) => item.key === line.key ? { ...item, unitPrice: event.target.value } : item))} />
                          <div className={`mt-1 text-right text-[9px] ${line.priceFloor && num(line.unitPrice) < num(line.priceFloor) ? "font-bold text-rose-600" : "text-slate-400"}`}>
                            {line.priceFloor ? `Min Floor: ${line.priceFloor}` : ""}
                            {line.priceSource ? ` · ${line.priceSource === "PRICE_LIST" ? "List Price" : "Variant Price"}` : ""}
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <input disabled={Boolean(invoice)} className={`${inputClass} text-right`} value={line.discountAmount} onChange={(event) => setCart((current) => current.map((item) => item.key === line.key ? { ...item, discountAmount: event.target.value } : item))} />
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
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!cart.length && (
                    <tr>
                      <td colSpan={7} className="py-20 text-center">
                        <PackageSearch className="mx-auto h-12 w-12 text-slate-300" />
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

        {/* AREA 4: TENDER & PAYMENT CHECKOUT SIDEBAR */}
        <aside className="border-l border-slate-200 bg-white p-5">
          <div className="sticky top-4 space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Tender & Payment Mode</p>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button disabled={Boolean(invoice)} onClick={() => setSaleType("cash")} className={`rounded-xl border p-2.5 text-left transition ${saleType === "cash" ? "border-emerald-500 bg-emerald-50 text-emerald-900 shadow-sm" : "border-slate-200 hover:bg-slate-50"}`}>
                  <Banknote className="h-4 w-4 text-emerald-600" />
                  <div className="mt-1.5 text-xs font-bold">Immediate Cash</div>
                  <div className="text-[10px] text-slate-500">Cash drawer register</div>
                </button>
                <button disabled={Boolean(invoice)} onClick={() => setSaleType("card")} className={`rounded-xl border p-2.5 text-left transition ${saleType === "card" ? "border-blue-500 bg-blue-50 text-blue-900 shadow-sm" : "border-slate-200 hover:bg-slate-50"}`}>
                  <CreditCard className="h-4 w-4 text-blue-600" />
                  <div className="mt-1.5 text-xs font-bold">Card POS</div>
                  <div className="text-[10px] text-slate-500">Bank debit / credit</div>
                </button>
                <button disabled={Boolean(invoice)} onClick={() => setSaleType("wallet")} className={`rounded-xl border p-2.5 text-left transition ${saleType === "wallet" ? "border-purple-500 bg-purple-50 text-purple-900 shadow-sm" : "border-slate-200 hover:bg-slate-50"}`}>
                  <Wallet className="h-4 w-4 text-purple-600" />
                  <div className="mt-1.5 text-xs font-bold">Mobile Wallet</div>
                  <div className="text-[10px] text-slate-500">Raast / EasyPaisa / Jazz</div>
                </button>
                <button disabled={Boolean(invoice)} onClick={() => setSaleType("credit")} className={`rounded-xl border p-2.5 text-left transition ${saleType === "credit" ? "border-amber-500 bg-amber-50 text-amber-900 shadow-sm" : "border-slate-200 hover:bg-slate-50"}`}>
                  <Clock3 className="h-4 w-4 text-amber-600" />
                  <div className="mt-1.5 text-xs font-bold">Credit Account</div>
                  <div className="text-[10px] text-slate-500">Terms & due date</div>
                </button>
              </div>

              {/* Multi-Tender Split Payment Switch */}
              <button
                type="button"
                disabled={Boolean(invoice)}
                onClick={() => setSaleType("split")}
                className={`mt-2 w-full rounded-xl border p-2 text-left flex items-center justify-between transition ${saleType === "split" ? "border-indigo-600 bg-indigo-50 text-indigo-950 font-bold shadow-xs" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
              >
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-indigo-600" />
                  <div>
                    <div className="text-xs font-bold">Split / Mixed Tender</div>
                    <div className="text-[10px] text-slate-500 font-normal">Split Cash + Card + Wallet + Credit</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold bg-white px-2 py-0.5 rounded border border-indigo-200 text-indigo-700">
                  Mixed Tender
                </span>
              </button>
            </div>

            {/* Render Tender Inputs According to Mode */}
            {saleType === "cash" && (
              <div>
                <div className="mb-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Cash Drawer Account
                  </label>
                  <select
                    value={cashAccountId}
                    disabled={Boolean(invoice)}
                    onChange={(e) => setCashAccountId(e.target.value)}
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-mono text-slate-900 focus:outline-none"
                  >
                    {(lookups?.cashAccounts || []).map((acc) => (
                      <option key={acc.id} value={acc.id}>💵 {acc.code} · {acc.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between mb-1">
                  <span className="label mb-0">Cash Tendered (F10)</span>
                  {tendered ? (
                    <button type="button" onClick={() => setTendered("")} className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-600">
                      <RotateCcw className="h-3 w-3" /> Clear
                    </button>
                  ) : null}
                </div>

                <div className="mb-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={Boolean(invoice) || totals.grand <= 0}
                    onClick={() => setTendered(String(totals.grand))}
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100"
                  >
                    Exact ({money(totals.grand, currency)})
                  </button>
                  {[500, 1000, 5000, 10000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      disabled={Boolean(invoice)}
                      onClick={() => setTendered((curr) => String(num(curr) + val))}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      +{val >= 1000 ? `${val / 1000}k` : val}
                    </button>
                  ))}
                </div>

                <input
                  ref={tenderInputRef}
                  className={`${inputClass} text-right font-mono text-xl font-black text-slate-900`}
                  inputMode="decimal"
                  value={tendered}
                  disabled={Boolean(invoice)}
                  placeholder="0.00"
                  onChange={(event) => setTendered(event.target.value)}
                />
              </div>
            )}

            {saleType === "card" && (
              <div className="space-y-2.5">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Card POS Settlement Bank
                  </label>
                  <select
                    value={bankAccountId}
                    disabled={Boolean(invoice)}
                    onChange={(e) => setBankAccountId(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-mono text-slate-900 focus:outline-none"
                  >
                    {(lookups?.banks || []).map((b) => (
                      <option key={b.id} value={b.id}>🏦 {b.code} · {b.bankName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Card Terminal Auth / Trace Ref
                  </label>
                  <input
                    type="text"
                    value={cardReference}
                    disabled={Boolean(invoice)}
                    onChange={(e) => setCardReference(e.target.value)}
                    placeholder="e.g. POS-AUTH-99182"
                    className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            {saleType === "wallet" && (
              <div className="space-y-2.5">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Digital Wallet Settlement Account
                  </label>
                  <select
                    value={bankAccountId}
                    disabled={Boolean(invoice)}
                    onChange={(e) => setBankAccountId(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-mono text-slate-900 focus:outline-none"
                  >
                    {(lookups?.banks || []).map((b) => (
                      <option key={b.id} value={b.id}>📱 {b.code} · {b.bankName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Raast / EasyPaisa / JazzCash Transaction ID
                  </label>
                  <input
                    type="text"
                    value={walletReference}
                    disabled={Boolean(invoice)}
                    onChange={(e) => setWalletReference(e.target.value)}
                    placeholder="e.g. TID-982189028"
                    className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            {saleType === "credit" && (
              <div className="space-y-3">
                <label className="block">
                  <div className="flex items-center justify-between mb-1">
                    <span className="label mb-0">Payment Due Date *</span>
                    <div className="flex gap-1 text-[10px]">
                      {[7, 15, 30].map((days) => (
                        <button
                          key={days}
                          type="button"
                          disabled={Boolean(invoice)}
                          onClick={() => {
                            const base = invoiceDate ? new Date(invoiceDate) : new Date();
                            base.setDate(base.getDate() + days);
                            setDueDate(base.toISOString().slice(0, 10));
                          }}
                          className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 font-bold text-amber-800 hover:bg-amber-100"
                        >
                          +{days}d
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="date"
                    className={inputClass}
                    min={invoiceDate}
                    value={dueDate}
                    disabled={Boolean(invoice)}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </label>

                {/* Advance Down Payment Section */}
                <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-3.5 shadow-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <HandCoins className="h-4 w-4 text-amber-700" />
                      <span className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                        Advance Received (Down Payment)
                      </span>
                    </div>
                    {advanceNum > 0 && (
                      <button
                        type="button"
                        disabled={Boolean(invoice)}
                        onClick={() => {
                          setAdvanceAmount("");
                          setAdvanceReference("");
                          setAdvanceTendered("");
                        }}
                        className="text-[10px] font-bold text-amber-800 hover:text-rose-600 underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 mb-2.5">
                    <button
                      type="button"
                      disabled={Boolean(invoice)}
                      onClick={() => setAdvanceMethod("CASH")}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs font-bold transition ${advanceMethod === "CASH" ? "border-emerald-600 bg-emerald-600 text-white shadow-xs" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                    >
                      <Banknote className="h-3.5 w-3.5" /> Cash Drawer
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(invoice)}
                      onClick={() => setAdvanceMethod("BANK")}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs font-bold transition ${advanceMethod === "BANK" ? "border-blue-600 bg-blue-600 text-white shadow-xs" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                    >
                      <Landmark className="h-3.5 w-3.5" /> Bank Deposit
                    </button>
                  </div>

                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={totals.grand}
                    placeholder="Advance amount (0.00)"
                    disabled={Boolean(invoice)}
                    value={advanceAmount}
                    onChange={(e) => setAdvanceAmount(e.target.value)}
                    className={`${inputClass} text-right font-mono text-base font-black text-slate-900 mb-2`}
                  />

                  {advanceNum > 0 && (
                    <div className="rounded-lg border border-amber-300/80 bg-white p-2 text-xs divide-y divide-slate-100">
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-500">Invoice Total</span>
                        <span className="font-mono font-bold text-slate-800">{money(totals.grand, currency)}</span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-emerald-700">Advance Paid</span>
                        <span className="font-mono font-bold text-emerald-700">− {money(advanceNum, currency)}</span>
                      </div>
                      <div className="flex justify-between pt-1 font-bold">
                        <span className="text-amber-950">Remaining Due on Terms</span>
                        <span className="font-mono text-sm text-amber-900">{money(remainingCreditDue, currency)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {saleType === "split" && (
              <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-950">Multi-Tender Breakdown</span>
                  <span className="text-[10px] font-mono text-slate-500">Total: {money(totals.grand, currency)}</span>
                </div>

                {/* Cash Allocation */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-700 flex items-center gap-1"><Banknote className="h-3.5 w-3.5 text-emerald-600" /> Cash:</span>
                  <input
                    type="number"
                    placeholder="0.00"
                    disabled={Boolean(invoice)}
                    value={splitCash}
                    onChange={(e) => setSplitCash(e.target.value)}
                    className="h-8 w-32 rounded border border-slate-300 px-2 text-right font-mono text-xs font-bold"
                  />
                </div>

                {/* Card Allocation */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-700 flex items-center gap-1"><CreditCard className="h-3.5 w-3.5 text-blue-600" /> Card POS:</span>
                  <input
                    type="number"
                    placeholder="0.00"
                    disabled={Boolean(invoice)}
                    value={splitCard}
                    onChange={(e) => setSplitCard(e.target.value)}
                    className="h-8 w-32 rounded border border-slate-300 px-2 text-right font-mono text-xs font-bold"
                  />
                </div>

                {/* Wallet Allocation */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-700 flex items-center gap-1"><Wallet className="h-3.5 w-3.5 text-purple-600" /> Wallet:</span>
                  <input
                    type="number"
                    placeholder="0.00"
                    disabled={Boolean(invoice)}
                    value={splitWallet}
                    onChange={(e) => setSplitWallet(e.target.value)}
                    className="h-8 w-32 rounded border border-slate-300 px-2 text-right font-mono text-xs font-bold"
                  />
                </div>

                {/* Split Reconciliation Summary */}
                <div className="mt-2 rounded-lg bg-white p-2 text-xs divide-y divide-slate-100 border border-indigo-200">
                  <div className="flex justify-between py-0.5">
                    <span className="text-slate-500">Allocated Payments:</span>
                    <span className="font-mono font-bold text-emerald-700">{money(splitTendersSum, currency)}</span>
                  </div>
                  <div className="flex justify-between pt-1 font-bold">
                    <span className="text-indigo-950">Remaining on Credit Terms:</span>
                    <span className="font-mono text-sm text-indigo-900">{money(splitRemainingDue, currency)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Change Return or Shortage Indicator */}
            {saleType === "cash" && num(tendered) > 0 && totals.grand > 0 && (
              <div>
                {num(tendered) >= totals.grand ? (
                  <div className="rounded-xl border border-emerald-400 bg-emerald-950 p-4 text-emerald-200 shadow-md">
                    <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-emerald-400">
                      <span>Change Return</span>
                      <span className="rounded bg-emerald-800 px-2 py-0.5 text-[10px] text-emerald-100">Ready to Hand Over</span>
                    </div>
                    <div className="mt-1 text-2xl font-black text-emerald-300">{money(change, currency)}</div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-400 bg-amber-950 p-4 text-amber-200 shadow-md">
                    <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-amber-400">
                      <span>Balance Remaining</span>
                      <span className="rounded bg-amber-800 px-2 py-0.5 text-[10px] text-amber-100">Pending Tender</span>
                    </div>
                    <div className="mt-1 text-2xl font-black text-amber-300">− {money(shortage, currency)}</div>
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
                  onClick={() => void completeSale()}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-black text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50"
                  title="Ctrl+Enter"
                >
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" />}
                  ⚡ Complete Sale & Post (Print)
                </button>

                <button
                  disabled={busy || !cart.length}
                  onClick={() => void parkSale()}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  title="F9"
                >
                  <ReceiptText className="h-4 w-4" />
                  Park / Save as Draft (F9)
                </button>
                <p className="text-center text-[10px] leading-4 text-slate-400">
                  ⚡ Single atomic checkout directly posts GL, updates handset custody, and settles counter receipts.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-center shadow-md">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
                <h3 className="mt-2 text-base font-black text-emerald-950">{invoice.invoiceNumber}</h3>
                <p className="mt-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
                  {invoice.status.replaceAll("_", " ")}
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <Link
                    href={`/sales/${invoice.id}/receipt`}
                    target="_blank"
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-bold text-white shadow hover:bg-blue-700"
                  >
                    <Receipt className="h-4 w-4" />
                    Print 80mm Thermal Receipt
                  </Link>
                  <Link
                    href={`/sales/${invoice.id}/print`}
                    target="_blank"
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 shadow-xs hover:bg-slate-50"
                  >
                    <Printer className="h-4 w-4" />
                    Print Standard A4 Invoice
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
              <Search className="h-5 w-5 text-blue-600" />
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
                <X className="h-5 w-5" />
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
                        {serialized ? " · Scan physical IMEI on scanner to add handset" : ` · Available: ${result.availableQuantity}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <b className="font-mono text-sm text-blue-700">{money(Number(result.variant.retailPrice), currency)}</b>
                      {!serialized && <Plus className="ml-auto mt-1 h-4 w-4 text-blue-600" />}
                    </div>
                  </button>
                );
              })}
              {!searchResults.length && (
                <div className="py-14 text-center text-sm text-slate-400">
                  Type a query or press Search to browse available stock.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Parked Sales Modal (F9 / Recalls directly into POS Cart) */}
      {parkedOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/50 p-4 pt-[10vh] backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setParkedOpen(false); }}>
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <ReceiptText className="h-5 w-5 text-blue-600" />
                <h2 className="text-base font-black text-slate-900">Parked / Held Sales Drafts</h2>
              </div>
              <button onClick={() => setParkedOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4">
              {loadingParked ? (
                <div className="flex items-center justify-center py-10 text-xs text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-blue-600" /> Loading parked sales…
                </div>
              ) : parkedInvoices.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500">
                  No parked sales drafts found. Use &quot;Park / Save as Draft (F9)&quot; to hold sales.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {parkedInvoices.map((inv: any) => (
                    <div key={inv.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-900">{inv.invoiceNumber}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{inv.customer?.name || "Walk-in"}</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {String(inv.invoiceDate).slice(0, 10)} · {inv.lines?.length || 0} line items
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-bold text-slate-900">
                          {money(Number(inv.grandTotal), currency)}
                        </span>
                        <button
                          onClick={() => recallParkedSale(inv)}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-blue-700"
                        >
                          Recall into POS Cart →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* POS Shift Management Modal */}
      {shiftModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setShiftModalOpen(false); }}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-black text-slate-950">
                  {shiftAction === "open" ? "Open POS Shift Drawer" : "Close POS Shift & Reconcile"}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Terminal: <b className="text-slate-800">{terminals.find((t) => t.id === selectedTerminalId)?.code || "POS-01"}</b> · Cashier: <b className="text-slate-800">{lookups.users.find((u) => u.id === userId)?.fullName || "Cashier"}</b>
                </p>
              </div>
              <button disabled={busy} onClick={() => setShiftModalOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            {shiftAction === "open" ? (
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-xs font-bold text-slate-700">Opening Cash Float ({currency}) *</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    autoFocus
                    value={openingFloat}
                    onChange={(e) => setOpeningFloat(e.target.value)}
                    className={`${inputClass} text-right font-mono text-base font-black text-slate-900 mt-1`}
                    placeholder="0.00"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-slate-700">Shift Notes</span>
                  <textarea
                    rows={2}
                    value={shiftNotes}
                    onChange={(e) => setShiftNotes(e.target.value)}
                    placeholder="e.g. Morning counter shift; 10,000 float received."
                    className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:border-blue-500"
                  />
                </label>
                <div className="mt-4 flex justify-end gap-2">
                  <button disabled={busy} onClick={() => setShiftModalOpen(false)} className="h-10 rounded-lg border px-4 text-xs font-bold">
                    Cancel
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void handleOpenShift()}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-black text-white hover:bg-blue-700"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
                    Open Shift Drawer
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                  <span className="text-slate-500">Opening Float:</span>
                  <div className="font-mono font-bold text-slate-900">{money(num(activeShift?.openingFloat || 0), currency)}</div>
                </div>
                <label className="block">
                  <span className="text-xs font-bold text-slate-700">Actual Counted Cash in Drawer ({currency}) *</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    autoFocus
                    value={closingActualCash}
                    onChange={(e) => setClosingActualCash(e.target.value)}
                    className={`${inputClass} text-right font-mono text-base font-black text-slate-900 mt-1`}
                    placeholder="0.00"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-slate-700">Closing Remarks</span>
                  <textarea
                    rows={2}
                    value={shiftNotes}
                    onChange={(e) => setShiftNotes(e.target.value)}
                    placeholder="e.g. End of day counter handover; physical cash verified."
                    className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:border-blue-500"
                  />
                </label>
                <div className="mt-4 flex justify-end gap-2">
                  <button disabled={busy} onClick={() => setShiftModalOpen(false)} className="h-10 rounded-lg border px-4 text-xs font-bold">
                    Cancel
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void handleCloseShift()}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-rose-600 px-4 text-xs font-black text-white hover:bg-rose-700"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Close & Reconcile Shift
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Direct Zero-Approval Managerial Credit Override Modal */}
      {creditOverrideDialog && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setCreditOverrideDialog(null); }}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  Customer Credit Limit Exceeded
                </div>
                <h2 className="mt-2 text-lg font-black text-slate-950">Managerial Credit Authorization</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Customer: <b className="text-slate-800">{selectedCustomer?.name || "Customer"}</b> ({selectedCustomer?.code})
                </p>
              </div>
              <button disabled={busy} onClick={() => setCreditOverrideDialog(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <div>
                <span className="text-slate-500">Configured Credit Limit:</span>
                <div className="font-bold text-slate-900">{money(Number(creditOverrideDialog.details?.creditLimit || selectedCustomer?.creditLimit || 0), currency)}</div>
              </div>
              <div>
                <span className="text-slate-500">Current AR Outstanding:</span>
                <div className="font-bold text-slate-900">{money(Number(creditOverrideDialog.details?.outstanding || 0), currency)}</div>
              </div>
              <div>
                <span className="text-slate-500">Sale Total:</span>
                <div className="font-bold text-blue-700">{money(Number(creditOverrideDialog.details?.invoiceTotal || totals.grand), currency)}</div>
              </div>
              <div>
                <span className="font-semibold text-amber-800">Exceeded Amount:</span>
                <div className="font-black text-rose-600">{money(Number(creditOverrideDialog.details?.exceededAmount || 0), currency)}</div>
              </div>
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-bold text-slate-700">Managerial Authorization Justification *</span>
              <textarea
                autoFocus
                rows={3}
                value={creditOverrideReason}
                onChange={(event) => setCreditOverrideReason(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500"
                placeholder="e.g. Authorized by Branch Manager; Customer post-dated cheque accepted; Approved corporate credit."
              />
            </label>
            <p className="mt-1.5 text-[11px] text-slate-400">
              Zero approval queue. This justification is stamped directly into the financial audit trail alongside your user credentials.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button disabled={busy} onClick={() => setCreditOverrideDialog(null)} className="h-10 rounded-lg border px-4 text-sm font-bold">
                Cancel
              </button>
              <button
                disabled={busy || creditOverrideReason.trim().length < 5}
                onClick={() => void completeSale(creditOverrideReason.trim())}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-amber-600 px-4 text-sm font-black text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {busy ? "Authorizing & Posting…" : "Authorize & Complete Sale"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
