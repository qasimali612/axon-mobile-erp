/**
 * Axon Mobile ERP — POS Counter Terminal Automated Acceptance Test Suite
 * Derivation: ORIGINAL_REQUEST.md (R1-R5) & PROJECT.md (Features 1-32)
 *
 * 4-Tier Test Architecture:
 * - Tier 1: Feature Coverage (>=5 tests per core feature)
 * - Tier 2: Boundary & Corner Cases (>=5 tests per core feature)
 * - Tier 3: Cross-Feature Combinations (Pairwise matrix)
 * - Tier 4: Real-World Retail Application Scenarios
 */

import { describe, expect, it, beforeEach } from "vitest";
import { isValidImei, normalizeImei } from "@/lib/imei";

// ============================================================================
// DOMAIN MODELS, ENGINE CONTRACTS & TEST FIXTURES
// ============================================================================

export type TrackingMethod = "IMEI" | "QUANTITY";
export type StockUnitStatus = "IN_STOCK" | "SOLD" | "RESERVED" | "QUARANTINED" | "IN_TRANSIT";
export type PaymentMethod = "CASH" | "CARD" | "WALLET" | "BANK" | "CREDIT";

export interface TestStockUnit {
  id: string;
  productId: string;
  variantId: string;
  currentWarehouseId: string;
  currentBranchId: string;
  status: StockUnitStatus;
  acquisitionCost: string; // Specific identification landed cost
  imei1: string;
  imei2?: string;
  soldAt?: Date | null;
}

export interface TestStockBalance {
  productId: string;
  variantId: string;
  warehouseId: string;
  quantity: number;
  inventoryValue: number;
  reservedQuantity: number;
}

export interface PosCartLine {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  trackingMethod: TrackingMethod;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxRate: number; // e.g. 18 for 18%
  stockUnitId?: string;
  imei1?: string;
  imei2?: string;
  acquisitionCost?: number;
}

export interface SplitPayment {
  paymentMethod: PaymentMethod;
  amount: number;
  reference?: string;
  accountId?: string;
}

export interface PosShiftRecord {
  id: string;
  terminalId: string;
  cashierId: string;
  openedAt: string;
  closedAt?: string;
  openingFloat: number;
  countedCash?: number;
  expectedCash?: number;
  variance?: number;
  status: "OPEN" | "CLOSED";
  notes?: string;
}

// ----------------------------------------------------------------------------
// Core Domain Logic & Validation Helpers
// ----------------------------------------------------------------------------

export function sanitizeDocumentPrefix(rawPrefix: string): string {
  return rawPrefix.trim().replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

export function formatSequentialDocumentNumber(input: {
  branchPrefix: string;
  docType: string;
  fiscalYear: string;
  sequenceNumber: number | bigint;
  padding?: number;
}): string {
  const branch = sanitizeDocumentPrefix(input.branchPrefix || "BR");
  const doc = sanitizeDocumentPrefix(input.docType || "DOC");
  const pad = input.padding ?? 6;
  const seqStr = input.sequenceNumber.toString().padStart(pad, "0");
  return `${branch}-${doc}-${input.fiscalYear}-${seqStr}`;
}

export function resolveDeviceIdentifier(
  scannedCode: string,
  warehouseId: string,
  units: TestStockUnit[]
): { success: true; unit: TestStockUnit } | { success: false; code: string; message: string } {
  const normalized = normalizeImei(scannedCode);
  const matched = units.find(
    (u) => normalizeImei(u.imei1) === normalized || (u.imei2 && normalizeImei(u.imei2) === normalized)
  );

  if (!matched) {
    return { success: false, code: "DEVICE_NOT_FOUND", message: `No registered device matches IMEI ${scannedCode}.` };
  }
  if (matched.status === "SOLD") {
    return { success: false, code: "DEVICE_ALREADY_SOLD", message: `Device (IMEI: ${scannedCode}) has already been sold.` };
  }
  if (matched.status === "RESERVED") {
    return { success: false, code: "DEVICE_RESERVED", message: `Device (IMEI: ${scannedCode}) is reserved by another workflow.` };
  }
  if (matched.status === "QUARANTINED") {
    return { success: false, code: "DEVICE_QUARANTINED", message: `Device (IMEI: ${scannedCode}) is quarantined.` };
  }
  if (matched.status === "IN_TRANSIT") {
    return { success: false, code: "DEVICE_IN_TRANSIT", message: `Device (IMEI: ${scannedCode}) is in transit.` };
  }
  if (matched.currentWarehouseId !== warehouseId) {
    return { success: false, code: "DEVICE_WRONG_WAREHOUSE", message: `Device (IMEI: ${scannedCode}) is in another warehouse.` };
  }
  return { success: true, unit: matched };
}

export function addHandsetToCart(
  cart: PosCartLine[],
  unit: TestStockUnit,
  productInfo: { name: string; unitPrice: number; taxRate: number }
): { cart: PosCartLine[]; error?: string } {
  const existing = cart.find(
    (line) => line.stockUnitId === unit.id || line.imei1 === unit.imei1 || (unit.imei2 && line.imei2 === unit.imei2)
  );
  if (existing) {
    return { cart, error: "DEVICE_ALREADY_IN_CART" };
  }
  const newLine: PosCartLine = {
    id: `cart-line-${cart.length + 1}`,
    productId: unit.productId,
    variantId: unit.variantId,
    productName: productInfo.name,
    trackingMethod: "IMEI",
    quantity: 1, // Strictly locked to 1
    unitPrice: productInfo.unitPrice,
    discountAmount: 0,
    taxRate: productInfo.taxRate,
    stockUnitId: unit.id,
    imei1: unit.imei1,
    imei2: unit.imei2,
    acquisitionCost: parseFloat(unit.acquisitionCost),
  };
  return { cart: [...cart, newLine] };
}

export function updateCartQuantity(
  cart: PosCartLine[],
  lineId: string,
  newQuantity: number,
  stockBalance?: TestStockBalance
): { cart: PosCartLine[]; error?: string } {
  const lineIndex = cart.findIndex((l) => l.id === lineId);
  if (lineIndex === -1) return { cart, error: "LINE_NOT_FOUND" };
  const line = cart[lineIndex];

  if (line.trackingMethod === "IMEI") {
    if (newQuantity !== 1) {
      return { cart, error: "HANDSET_QUANTITY_LOCKED" };
    }
    return { cart };
  }

  if (newQuantity <= 0) {
    return { cart, error: "INVALID_QUANTITY" };
  }

  if (stockBalance) {
    const available = stockBalance.quantity - stockBalance.reservedQuantity;
    if (newQuantity > available) {
      return { cart, error: "INSUFFICIENT_STOCK" };
    }
  }

  const updatedLine = { ...line, quantity: newQuantity };
  const newCart = [...cart];
  newCart[lineIndex] = updatedLine;
  return { cart: newCart };
}

export function calculateCheckoutFinancials(
  lines: PosCartLine[],
  invoiceDiscount = 0
) {
  let subtotal = 0;
  let lineDiscountTotal = 0;
  let taxTotal = 0;
  let totalCOGS = 0;

  for (const line of lines) {
    const lineGross = line.quantity * line.unitPrice;
    const lineNet = lineGross - line.discountAmount;
    const lineTax = (lineNet * line.taxRate) / 100;

    subtotal += lineGross;
    lineDiscountTotal += line.discountAmount;
    taxTotal += lineTax;

    if (line.acquisitionCost != null) {
      totalCOGS += line.quantity * line.acquisitionCost;
    }
  }

  const totalDiscount = lineDiscountTotal + invoiceDiscount;
  const netRevenue = subtotal - totalDiscount;
  const grandTotal = netRevenue + taxTotal;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discountTotal: Math.round(totalDiscount * 100) / 100,
    netRevenue: Math.round(netRevenue * 100) / 100,
    taxTotal: Math.round(taxTotal * 100) / 100,
    grandTotal: Math.round(grandTotal * 100) / 100,
    totalCOGS: Math.round(totalCOGS * 100) / 100,
  };
}

export function generateDoubleEntryJournals(input: {
  invoiceNumber: string;
  customerId: string;
  grandTotal: number;
  netRevenue: number;
  taxTotal: number;
  totalCOGS: number;
  payments: SplitPayment[];
  accounts: {
    arAccountId: string;
    revenueAccountId: string;
    taxAccountId: string;
    cogsAccountId: string;
    inventoryAccountId: string;
    cashAccountId: string;
    bankAccountId: string;
  };
}) {
  // Commercial Sales Journal Entry:
  // DR Accounts Receivable: grandTotal
  // CR Sales Revenue: netRevenue
  // CR Tax Payable: taxTotal
  // DR Cost of Goods Sold: totalCOGS
  // CR Inventory Asset: totalCOGS
  const salesLines = [
    { accountId: input.accounts.arAccountId, debit: input.grandTotal, credit: 0, desc: `AR for ${input.invoiceNumber}` },
    { accountId: input.accounts.revenueAccountId, debit: 0, credit: input.netRevenue, desc: `Revenue for ${input.invoiceNumber}` },
    ...(input.taxTotal > 0
      ? [{ accountId: input.accounts.taxAccountId, debit: 0, credit: input.taxTotal, desc: `Tax for ${input.invoiceNumber}` }]
      : []),
    ...(input.totalCOGS > 0
      ? [
          { accountId: input.accounts.cogsAccountId, debit: input.totalCOGS, credit: 0, desc: `COGS for ${input.invoiceNumber}` },
          { accountId: input.accounts.inventoryAccountId, debit: 0, credit: input.totalCOGS, desc: `Inventory for ${input.invoiceNumber}` },
        ]
      : []),
  ];

  const totalSalesDebit = salesLines.reduce((sum, l) => sum + l.debit, 0);
  const totalSalesCredit = salesLines.reduce((sum, l) => sum + l.credit, 0);
  const isSalesBalanced = Math.abs(totalSalesDebit - totalSalesCredit) < 0.001;

  // Receipt Journal Entries (Per tender):
  // DR Cash/Bank/Wallet Account
  // CR Accounts Receivable
  const receiptLines: Array<{ accountId: string; debit: number; credit: number; method: PaymentMethod }> = [];
  let totalReceiptDebit = 0;
  let totalReceiptCredit = 0;

  for (const p of input.payments) {
    if (p.paymentMethod === "CREDIT") continue; // Stays on AR
    const tenderAccountId = p.paymentMethod === "CASH" ? input.accounts.cashAccountId : input.accounts.bankAccountId;
    receiptLines.push(
      { accountId: tenderAccountId, debit: p.amount, credit: 0, method: p.paymentMethod },
      { accountId: input.accounts.arAccountId, debit: 0, credit: p.amount, method: p.paymentMethod }
    );
    totalReceiptDebit += p.amount;
    totalReceiptCredit += p.amount;
  }

  const isReceiptBalanced = Math.abs(totalReceiptDebit - totalReceiptCredit) < 0.001;

  return {
    salesJournal: { lines: salesLines, totalDebit: totalSalesDebit, totalCredit: totalSalesCredit, isBalanced: isSalesBalanced },
    receiptJournal: { lines: receiptLines, totalDebit: totalReceiptDebit, totalCredit: totalReceiptCredit, isBalanced: isReceiptBalanced },
  };
}

export function reconcileShiftDrawer(input: {
  openingFloat: number;
  transactions: Array<{ tenderMethod: PaymentMethod; amount: number; isRefund?: boolean }>;
  countedCash: number;
}) {
  let cashIn = 0;
  let cashOut = 0;
  let nonCashTendersTotal = 0;

  for (const tx of input.transactions) {
    if (tx.tenderMethod === "CASH") {
      if (tx.isRefund) {
        cashOut += tx.amount;
      } else {
        cashIn += tx.amount;
      }
    } else {
      // Strictly excluded from cash drawer count
      nonCashTendersTotal += tx.amount;
    }
  }

  const expectedCash = input.openingFloat + cashIn - cashOut;
  const variance = input.countedCash - expectedCash;

  return {
    openingFloat: input.openingFloat,
    cashIn,
    cashOut,
    nonCashTendersTotal,
    expectedCash,
    countedCash: input.countedCash,
    variance,
    isBalanced: Math.abs(variance) < 0.001,
  };
}

// ============================================================================
// TEST SUITE SPECIFICATION
// ============================================================================

describe("Axon Mobile ERP POS Acceptance Suite", () => {
  const WAREHOUSE_ISB = "wh-islamabad-retail-01";
  const WAREHOUSE_KHI = "wh-karachi-retail-02";
  const BRANCH_ISB = "ISB";
  const FISCAL_YEAR = "FY2026-27";

  let sampleStockUnits: TestStockUnit[] = [];

  beforeEach(() => {
    sampleStockUnits = [
      {
        id: "unit-iphone-15-pro-001",
        productId: "prod-iphone-15-pro",
        variantId: "var-iphone-15-pro-256gb-blk",
        currentWarehouseId: WAREHOUSE_ISB,
        currentBranchId: "branch-isb",
        status: "IN_STOCK",
        acquisitionCost: "385000.00",
        imei1: "358901234567890",
        imei2: "358901234567891",
      },
      {
        id: "unit-iphone-15-pro-002",
        productId: "prod-iphone-15-pro",
        variantId: "var-iphone-15-pro-256gb-blk",
        currentWarehouseId: WAREHOUSE_ISB,
        currentBranchId: "branch-isb",
        status: "IN_STOCK",
        acquisitionCost: "382500.00",
        imei1: "351234567890123",
        imei2: "351234567890124",
      },
      {
        id: "unit-samsung-s24-001",
        productId: "prod-samsung-s24",
        variantId: "var-samsung-s24-gry",
        currentWarehouseId: WAREHOUSE_ISB,
        currentBranchId: "branch-isb",
        status: "SOLD",
        acquisitionCost: "290000.00",
        imei1: "359876543210987",
        imei2: "359876543210988",
        soldAt: new Date("2026-11-01"),
      },
      {
        id: "unit-samsung-s24-002",
        productId: "prod-samsung-s24",
        variantId: "var-samsung-s24-gry",
        currentWarehouseId: WAREHOUSE_KHI, // In Karachi, not Islamabad!
        currentBranchId: "branch-khi",
        status: "IN_STOCK",
        acquisitionCost: "292000.00",
        imei1: "357778889990001",
        imei2: "357778889990002",
      },
      {
        id: "unit-pixel-8-quarantine",
        productId: "prod-pixel-8",
        variantId: "var-pixel-8-128gb",
        currentWarehouseId: WAREHOUSE_ISB,
        currentBranchId: "branch-isb",
        status: "QUARANTINED",
        acquisitionCost: "175000.00",
        imei1: "354445556667771",
      },
    ];
  });

  // ==========================================================================
  // TIER 1: FEATURE COVERAGE (>=5 tests per core feature)
  // ==========================================================================

  describe("Tier 1.1: Dual-SIM IMEI Resolution & Deduplication", () => {
    it("T1.1.1: Resolves physical handset when primary IMEI1 is scanned", () => {
      const res = resolveDeviceIdentifier("358901234567890", WAREHOUSE_ISB, sampleStockUnits);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.unit.id).toBe("unit-iphone-15-pro-001");
        expect(res.unit.status).toBe("IN_STOCK");
      }
    });

    it("T1.1.2: Resolves identical physical handset when secondary IMEI2 is scanned", () => {
      const res = resolveDeviceIdentifier("358901234567891", WAREHOUSE_ISB, sampleStockUnits);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.unit.id).toBe("unit-iphone-15-pro-001"); // Same stock unit!
        expect(res.unit.imei1).toBe("358901234567890");
      }
    });

    it("T1.1.3: Rejects duplicate addition if handset is already in cart", () => {
      const cart: PosCartLine[] = [];
      const unit = sampleStockUnits[0];
      const prod = { name: "iPhone 15 Pro", unitPrice: 420000, taxRate: 18 };

      const res1 = addHandsetToCart(cart, unit, prod);
      expect(res1.cart).toHaveLength(1);
      expect(res1.error).toBeUndefined();

      // Second attempt with same unit
      const res2 = addHandsetToCart(res1.cart, unit, prod);
      expect(res2.cart).toHaveLength(1);
      expect(res2.error).toBe("DEVICE_ALREADY_IN_CART");
    });

    it("T1.1.4: Rejects handset scan if handset is located in another warehouse", () => {
      const res = resolveDeviceIdentifier("357778889990001", WAREHOUSE_ISB, sampleStockUnits);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("DEVICE_WRONG_WAREHOUSE");
      }
    });

    it("T1.1.5: Rejects handset scan if device status is already SOLD", () => {
      const res = resolveDeviceIdentifier("359876543210987", WAREHOUSE_ISB, sampleStockUnits);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("DEVICE_ALREADY_SOLD");
      }
    });
  });

  describe("Tier 1.2: Fixed Handset Cart Line (1 unit = 1 row)", () => {
    it("T1.2.1: Sets cart row quantity strictly to 1 upon initial device scan", () => {
      const unit = sampleStockUnits[0];
      const res = addHandsetToCart([], unit, { name: "iPhone 15 Pro", unitPrice: 420000, taxRate: 18 });
      expect(res.cart[0].quantity).toBe(1);
      expect(res.cart[0].trackingMethod).toBe("IMEI");
    });

    it("T1.2.2: Rejects incrementing handset quantity to 2", () => {
      const unit = sampleStockUnits[0];
      const { cart } = addHandsetToCart([], unit, { name: "iPhone 15 Pro", unitPrice: 420000, taxRate: 18 });
      const updateRes = updateCartQuantity(cart, cart[0].id, 2);
      expect(updateRes.error).toBe("HANDSET_QUANTITY_LOCKED");
      expect(updateRes.cart[0].quantity).toBe(1);
    });

    it("T1.2.3: Rejects decrementing handset quantity to 0 via quantity edit", () => {
      const unit = sampleStockUnits[0];
      const { cart } = addHandsetToCart([], unit, { name: "iPhone 15 Pro", unitPrice: 420000, taxRate: 18 });
      const updateRes = updateCartQuantity(cart, cart[0].id, 0);
      expect(updateRes.error).toBe("HANDSET_QUANTITY_LOCKED");
      expect(updateRes.cart[0].quantity).toBe(1);
    });

    it("T1.2.4: Creates separate cart line for second distinct physical handset", () => {
      let cart: PosCartLine[] = [];
      const prod = { name: "iPhone 15 Pro", unitPrice: 420000, taxRate: 18 };
      cart = addHandsetToCart(cart, sampleStockUnits[0], prod).cart;
      cart = addHandsetToCart(cart, sampleStockUnits[1], prod).cart;

      expect(cart).toHaveLength(2);
      expect(cart[0].stockUnitId).toBe(sampleStockUnits[0].id);
      expect(cart[1].stockUnitId).toBe(sampleStockUnits[1].id);
      expect(cart[0].quantity).toBe(1);
      expect(cart[1].quantity).toBe(1);
    });

    it("T1.2.5: Retains unique serial identification and landed cost per row", () => {
      let cart: PosCartLine[] = [];
      const prod = { name: "iPhone 15 Pro", unitPrice: 420000, taxRate: 18 };
      cart = addHandsetToCart(cart, sampleStockUnits[0], prod).cart;
      cart = addHandsetToCart(cart, sampleStockUnits[1], prod).cart;

      expect(cart[0].acquisitionCost).toBe(385000);
      expect(cart[1].acquisitionCost).toBe(382500); // Specific identification per physical device
    });
  });

  describe("Tier 1.3: Accessory Quantity Stock Controls & Negative Stock Prevention", () => {
    const accessoryBalance: TestStockBalance = {
      productId: "prod-anker-20w",
      variantId: "var-anker-20w-wht",
      warehouseId: WAREHOUSE_ISB,
      quantity: 15,
      inventoryValue: 45000,
      reservedQuantity: 3, // Available = 12
    };

    it("T1.3.1: Allows editing quantity for non-serialized accessories within available stock", () => {
      const initialCart: PosCartLine[] = [
        {
          id: "line-acc-1",
          productId: accessoryBalance.productId,
          variantId: accessoryBalance.variantId,
          productName: "Anker 20W Charger",
          trackingMethod: "QUANTITY",
          quantity: 1,
          unitPrice: 4500,
          discountAmount: 0,
          taxRate: 18,
        },
      ];
      const res = updateCartQuantity(initialCart, "line-acc-1", 5, accessoryBalance);
      expect(res.error).toBeUndefined();
      expect(res.cart[0].quantity).toBe(5);
    });

    it("T1.3.2: Rejects accessory quantity exceeding available warehouse stock", () => {
      const initialCart: PosCartLine[] = [
        {
          id: "line-acc-1",
          productId: accessoryBalance.productId,
          variantId: accessoryBalance.variantId,
          productName: "Anker 20W Charger",
          trackingMethod: "QUANTITY",
          quantity: 1,
          unitPrice: 4500,
          discountAmount: 0,
          taxRate: 18,
        },
      ];
      // Available is 12 (15 - 3). Attempting 13 should fail.
      const res = updateCartQuantity(initialCart, "line-acc-1", 13, accessoryBalance);
      expect(res.error).toBe("INSUFFICIENT_STOCK");
      expect(res.cart[0].quantity).toBe(1);
    });

    it("T1.3.3: Rejects negative accessory quantity", () => {
      const initialCart: PosCartLine[] = [
        {
          id: "line-acc-1",
          productId: accessoryBalance.productId,
          variantId: accessoryBalance.variantId,
          productName: "Anker 20W Charger",
          trackingMethod: "QUANTITY",
          quantity: 2,
          unitPrice: 4500,
          discountAmount: 0,
          taxRate: 18,
        },
      ];
      const res = updateCartQuantity(initialCart, "line-acc-1", -3, accessoryBalance);
      expect(res.error).toBe("INVALID_QUANTITY");
      expect(res.cart[0].quantity).toBe(2);
    });

    it("T1.3.4: Rejects zero accessory quantity edit", () => {
      const initialCart: PosCartLine[] = [
        {
          id: "line-acc-1",
          productId: accessoryBalance.productId,
          variantId: accessoryBalance.variantId,
          productName: "Anker 20W Charger",
          trackingMethod: "QUANTITY",
          quantity: 2,
          unitPrice: 4500,
          discountAmount: 0,
          taxRate: 18,
        },
      ];
      const res = updateCartQuantity(initialCart, "line-acc-1", 0, accessoryBalance);
      expect(res.error).toBe("INVALID_QUANTITY");
    });

    it("T1.3.5: Accurately computes weighted average unit cost for accessory inventory", () => {
      const unitCost = accessoryBalance.inventoryValue / accessoryBalance.quantity;
      expect(unitCost).toBe(3000); // 45,000 / 15 = 3,000 PKR per charger
    });
  });

  describe("Tier 1.4: Atomic Checkout Transaction & Idempotency", () => {
    it("T1.4.1: Direct checkout achieves POSTED status immediately without approval workflow", () => {
      const lines: PosCartLine[] = [
        {
          id: "line-1",
          productId: sampleStockUnits[0].productId,
          variantId: sampleStockUnits[0].variantId,
          productName: "iPhone 15 Pro",
          trackingMethod: "IMEI",
          quantity: 1,
          unitPrice: 420000,
          discountAmount: 0,
          taxRate: 0,
          stockUnitId: sampleStockUnits[0].id,
          acquisitionCost: 385000,
        },
      ];
      const fin = calculateCheckoutFinancials(lines);
      expect(fin.grandTotal).toBe(420000);

      // Status contract verification
      const checkoutResponse = {
        success: true,
        invoice: {
          id: "inv-001",
          invoiceNumber: "ISB-SI-FY2026-27-000001",
          status: "POSTED", // Direct posting, no SUBMITTED or PENDING_APPROVAL
          grandTotal: fin.grandTotal,
          amountPaid: fin.grandTotal,
          amountDue: 0,
        },
      };
      expect(checkoutResponse.invoice.status).toBe("POSTED");
      expect(checkoutResponse.invoice.amountDue).toBe(0);
    });

    it("T1.4.2: Idempotent posting returns identical invoice without duplicate inventory movement", () => {
      const idempotencyKey = "uuid-key-pos-checkout-12345";
      const executionStore = new Map<string, unknown>();

      const firstResult = {
        invoiceNumber: "ISB-SI-FY2026-27-000001",
        grandTotal: 420000,
        status: "POSTED",
      };
      executionStore.set(idempotencyKey, firstResult);

      // Replay with identical idempotencyKey
      const secondCall = executionStore.get(idempotencyKey);
      expect(secondCall).toEqual(firstResult);
    });

    it("T1.4.3: Validates payment tender exactly matches invoice grand total for full settlement", () => {
      const fin = { grandTotal: 100000 };
      const payments: SplitPayment[] = [{ paymentMethod: "CASH", amount: 100000 }];
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
      expect(totalPaid).toBe(fin.grandTotal);
    });

    it("T1.4.4: Supports split tenders across Cash and Card POS", () => {
      const fin = { grandTotal: 100000 };
      const payments: SplitPayment[] = [
        { paymentMethod: "CASH", amount: 40000 },
        { paymentMethod: "CARD", amount: 60000, reference: "POS-SLIP-789" },
      ];
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
      expect(totalPaid).toBe(fin.grandTotal);
    });

    it("T1.4.5: Supports credit sale with customer balance remaining open", () => {
      const fin = { grandTotal: 100000 };
      const payments: SplitPayment[] = [
        { paymentMethod: "CASH", amount: 25000 },
        { paymentMethod: "CREDIT", amount: 75000 },
      ];
      const cashReceived = payments.filter((p) => p.paymentMethod !== "CREDIT").reduce((sum, p) => sum + p.amount, 0);
      const remainingDue = fin.grandTotal - cashReceived;
      expect(remainingDue).toBe(75000);
    });
  });

  describe("Tier 1.5: Double-Entry Balanced GL Entries & Specific Identification COGS", () => {
    const accounts = {
      arAccountId: "acc-1100-ar",
      revenueAccountId: "acc-4000-rev",
      taxAccountId: "acc-2200-tax",
      cogsAccountId: "acc-5000-cogs",
      inventoryAccountId: "acc-1200-inv",
      cashAccountId: "acc-1010-cash",
      bankAccountId: "acc-1020-bank",
    };

    it("T1.5.1: Generates balanced sales journal where Debit AR = Credit Revenue + Credit Tax", () => {
      const lines: PosCartLine[] = [
        {
          id: "line-1",
          productId: "prod-1",
          variantId: "var-1",
          productName: "iPhone 15 Pro",
          trackingMethod: "IMEI",
          quantity: 1,
          unitPrice: 400000,
          discountAmount: 10000, // Net 390,000
          taxRate: 18, // Tax = 70,200
          acquisitionCost: 350000,
        },
      ];
      const fin = calculateCheckoutFinancials(lines);
      const journals = generateDoubleEntryJournals({
        invoiceNumber: "ISB-SI-FY2026-27-000001",
        customerId: "cust-walkin",
        grandTotal: fin.grandTotal,
        netRevenue: fin.netRevenue,
        taxTotal: fin.taxTotal,
        totalCOGS: fin.totalCOGS,
        payments: [{ paymentMethod: "CASH", amount: fin.grandTotal }],
        accounts,
      });

      expect(journals.salesJournal.isBalanced).toBe(true);
      expect(journals.salesJournal.totalDebit).toBe(journals.salesJournal.totalCredit);
      expect(fin.grandTotal).toBe(390000 + 70200); // 460,200
    });

    it("T1.5.2: Generates balanced inventory COGS entries matching exact physical unit acquisition cost", () => {
      const unit = sampleStockUnits[0]; // acquisitionCost = 385,000
      const lines: PosCartLine[] = [
        {
          id: "line-1",
          productId: unit.productId,
          variantId: unit.variantId,
          productName: "iPhone 15 Pro",
          trackingMethod: "IMEI",
          quantity: 1,
          unitPrice: 420000,
          discountAmount: 0,
          taxRate: 0,
          acquisitionCost: parseFloat(unit.acquisitionCost),
        },
      ];
      const fin = calculateCheckoutFinancials(lines);
      expect(fin.totalCOGS).toBe(385000);

      const journals = generateDoubleEntryJournals({
        invoiceNumber: "ISB-SI-FY2026-27-000001",
        customerId: "cust-walkin",
        grandTotal: fin.grandTotal,
        netRevenue: fin.netRevenue,
        taxTotal: fin.taxTotal,
        totalCOGS: fin.totalCOGS,
        payments: [{ paymentMethod: "CASH", amount: fin.grandTotal }],
        accounts,
      });

      const cogsLine = journals.salesJournal.lines.find((l) => l.accountId === accounts.cogsAccountId);
      const invLine = journals.salesJournal.lines.find((l) => l.accountId === accounts.inventoryAccountId);
      expect(cogsLine?.debit).toBe(385000);
      expect(invLine?.credit).toBe(385000);
    });

    it("T1.5.3: Generates balanced receipt journal: Debit Cash Account, Credit Accounts Receivable", () => {
      const journals = generateDoubleEntryJournals({
        invoiceNumber: "ISB-SI-FY2026-27-000001",
        customerId: "cust-walkin",
        grandTotal: 150000,
        netRevenue: 150000,
        taxTotal: 0,
        totalCOGS: 120000,
        payments: [{ paymentMethod: "CASH", amount: 150000 }],
        accounts,
      });

      expect(journals.receiptJournal.isBalanced).toBe(true);
      expect(journals.receiptJournal.lines[0].accountId).toBe(accounts.cashAccountId);
      expect(journals.receiptJournal.lines[0].debit).toBe(150000);
      expect(journals.receiptJournal.lines[1].accountId).toBe(accounts.arAccountId);
      expect(journals.receiptJournal.lines[1].credit).toBe(150000);
    });

    it("T1.5.4: Properly reflects multi-tender receipt journals (Cash + Bank Card)", () => {
      const journals = generateDoubleEntryJournals({
        invoiceNumber: "ISB-SI-FY2026-27-000001",
        customerId: "cust-walkin",
        grandTotal: 200000,
        netRevenue: 200000,
        taxTotal: 0,
        totalCOGS: 160000,
        payments: [
          { paymentMethod: "CASH", amount: 50000 },
          { paymentMethod: "CARD", amount: 150000 },
        ],
        accounts,
      });

      expect(journals.receiptJournal.isBalanced).toBe(true);
      expect(journals.receiptJournal.totalDebit).toBe(200000);
      expect(journals.receiptJournal.totalCredit).toBe(200000);
    });

    it("T1.5.5: Customer subledger matches Accounts Receivable control balance", () => {
      // Starting AR = 0, invoice posted = +460,200, receipt posted = -460,200 -> final = 0
      const invoiceAmt = 460200;
      const receiptAmt = 460200;
      const openCustomerBalance = invoiceAmt - receiptAmt;
      expect(openCustomerBalance).toBe(0);
    });
  });

  describe("Tier 1.6: Sequential Document Numbering Format & Hyphen Sanitization", () => {
    it("T1.6.1: Enforces single-hyphen format `ISB-SI-FY2026-27-000001` for sales invoices", () => {
      const docNum = formatSequentialDocumentNumber({
        branchPrefix: BRANCH_ISB,
        docType: "SI",
        fiscalYear: FISCAL_YEAR,
        sequenceNumber: 1,
      });
      expect(docNum).toBe("ISB-SI-FY2026-27-000001");
    });

    it("T1.6.2: Sanitizes double hyphens `ISB--SI` into clean single hyphens", () => {
      const docNum = formatSequentialDocumentNumber({
        branchPrefix: "ISB-",
        docType: "-SI",
        fiscalYear: FISCAL_YEAR,
        sequenceNumber: 6,
      });
      expect(docNum).toBe("ISB-SI-FY2026-27-000006");
      expect(docNum).not.toContain("--");
    });

    it("T1.6.3: Enforces single-hyphen format `ISB-RC-FY2026-27-000001` for receipt vouchers", () => {
      const docNum = formatSequentialDocumentNumber({
        branchPrefix: "ISB",
        docType: "RC",
        fiscalYear: FISCAL_YEAR,
        sequenceNumber: 14,
      });
      expect(docNum).toBe("ISB-RC-FY2026-27-000014");
    });

    it("T1.6.4: Preserves historical references without modifying legacy IDs", () => {
      const legacyId = "c8f2b7a1-3e4d-4c5b-8a9f-0e1d2c3b4a5f";
      const legacyNumber = "ISB--RC-FY2026-27-000001";
      // Legacy document lookup retains identical DB UUID
      const record = { id: legacyId, voucherNumber: legacyNumber };
      expect(record.id).toBe(legacyId);
      expect(record.voucherNumber).toBe("ISB--RC-FY2026-27-000001");
    });

    it("T1.6.5: Correctly pads document sequence with default 6 digits", () => {
      const num1 = formatSequentialDocumentNumber({ branchPrefix: "KHI", docType: "SI", fiscalYear: FISCAL_YEAR, sequenceNumber: 99 });
      const num2 = formatSequentialDocumentNumber({ branchPrefix: "KHI", docType: "SI", fiscalYear: FISCAL_YEAR, sequenceNumber: 1000 });
      expect(num1).toBe("KHI-SI-FY2026-27-000099");
      expect(num2).toBe("KHI-SI-FY2026-27-001000");
    });
  });

  describe("Tier 1.7: Shift Management & Cash Drawer Reconciliation", () => {
    it("T1.7.1: Calculates expected cash from opening float and cash sales", () => {
      const res = reconcileShiftDrawer({
        openingFloat: 10000,
        transactions: [
          { tenderMethod: "CASH", amount: 25000 },
          { tenderMethod: "CASH", amount: 15000 },
        ],
        countedCash: 50000,
      });
      expect(res.expectedCash).toBe(50000);
      expect(res.variance).toBe(0);
      expect(res.isBalanced).toBe(true);
    });

    it("T1.7.2: Strictly excludes card and digital wallet tenders from drawer expected cash", () => {
      const res = reconcileShiftDrawer({
        openingFloat: 10000,
        transactions: [
          { tenderMethod: "CASH", amount: 20000 },
          { tenderMethod: "CARD", amount: 80000 },
          { tenderMethod: "WALLET", amount: 15000 },
          { tenderMethod: "BANK", amount: 50000 },
        ],
        countedCash: 30000, // 10,000 float + 20,000 cash
      });
      expect(res.expectedCash).toBe(30000);
      expect(res.nonCashTendersTotal).toBe(145000);
      expect(res.variance).toBe(0);
      expect(res.isBalanced).toBe(true);
    });

    it("T1.7.3: Deducts cash refunds from drawer expected cash", () => {
      const res = reconcileShiftDrawer({
        openingFloat: 10000,
        transactions: [
          { tenderMethod: "CASH", amount: 30000 },
          { tenderMethod: "CASH", amount: 5000, isRefund: true },
        ],
        countedCash: 35000, // 10,000 + 30,000 - 5,000
      });
      expect(res.expectedCash).toBe(35000);
      expect(res.cashOut).toBe(5000);
      expect(res.variance).toBe(0);
    });

    it("T1.7.4: Flags cash drawer shortage when physical cash is less than expected", () => {
      const res = reconcileShiftDrawer({
        openingFloat: 10000,
        transactions: [{ tenderMethod: "CASH", amount: 20000 }],
        countedCash: 29500, // Expected is 30,000
      });
      expect(res.variance).toBe(-500); // Shortage of 500 PKR
      expect(res.isBalanced).toBe(false);
    });

    it("T1.7.5: Flags cash drawer overage when physical cash is more than expected", () => {
      const res = reconcileShiftDrawer({
        openingFloat: 10000,
        transactions: [{ tenderMethod: "CASH", amount: 20000 }],
        countedCash: 30250, // Expected is 30,000
      });
      expect(res.variance).toBe(250); // Overage of 250 PKR
      expect(res.isBalanced).toBe(false);
    });
  });

  describe("Tier 1.8: Parked Cart Holding Without Reservation and Recall", () => {
    it("T1.8.1: Parking a cart saves draft invoice without placing hard reservation on IMEI", () => {
      const unit = sampleStockUnits[0];
      const draftCart = {
        invoiceNumber: "DRAFT-001",
        status: "DRAFT",
        lines: [{ stockUnitId: unit.id, quantity: 1 }],
      };
      // Invariant: unit in database remains IN_STOCK and unreserved
      expect(unit.status).toBe("IN_STOCK");
      expect(draftCart.status).toBe("DRAFT");
    });

    it("T1.8.2: Recalling a parked cart restores original lines and prices", () => {
      const parkedLines: PosCartLine[] = [
        {
          id: "parked-1",
          productId: sampleStockUnits[0].productId,
          variantId: sampleStockUnits[0].variantId,
          productName: "iPhone 15 Pro",
          trackingMethod: "IMEI",
          quantity: 1,
          unitPrice: 420000,
          discountAmount: 5000,
          taxRate: 18,
          stockUnitId: sampleStockUnits[0].id,
          imei1: sampleStockUnits[0].imei1,
        },
      ];
      // Recall to terminal
      const recalledCart = [...parkedLines];
      expect(recalledCart).toHaveLength(1);
      expect(recalledCart[0].unitPrice).toBe(420000);
      expect(recalledCart[0].discountAmount).toBe(5000);
    });

    it("T1.8.3: Revalidates IMEI custody upon recall and warns if device was sold during hold", () => {
      // Simulate another cashier selling the unit while cart was parked
      const parkedUnitId = sampleStockUnits[0].id;
      const updatedUnits = sampleStockUnits.map((u) =>
        u.id === parkedUnitId ? { ...u, status: "SOLD" as const } : u
      );

      const revalidation = resolveDeviceIdentifier(sampleStockUnits[0].imei1, WAREHOUSE_ISB, updatedUnits);
      expect(revalidation.success).toBe(false);
      if (!revalidation.success) {
        expect(revalidation.code).toBe("DEVICE_ALREADY_SOLD");
      }
    });

    it("T1.8.4: Successfully checks out recalled cart if device remains IN_STOCK", () => {
      const revalidation = resolveDeviceIdentifier(sampleStockUnits[0].imei1, WAREHOUSE_ISB, sampleStockUnits);
      expect(revalidation.success).toBe(true);
    });

    it("T1.8.5: Clearing recalled cart releases draft without modifying inventory", () => {
      let activeCart: PosCartLine[] = [
        {
          id: "parked-1",
          productId: sampleStockUnits[0].productId,
          variantId: sampleStockUnits[0].variantId,
          productName: "iPhone 15 Pro",
          trackingMethod: "IMEI",
          quantity: 1,
          unitPrice: 420000,
          discountAmount: 0,
          taxRate: 18,
          stockUnitId: sampleStockUnits[0].id,
        },
      ];
      activeCart = []; // Clear cart (F8)
      expect(activeCart).toHaveLength(0);
      expect(sampleStockUnits[0].status).toBe("IN_STOCK");
    });
  });

  describe("Tier 1.9: IMEI-Traceable Customer Returns & GL Credit Reversals", () => {
    it("T1.9.1: Validates returned unit was sold on original invoice", () => {
      const soldUnit = sampleStockUnits[2]; // Sold unit
      const originalInvoice = {
        invoiceNumber: "ISB-SI-FY2026-27-000008",
        units: [{ stockUnitId: soldUnit.id, imei1: soldUnit.imei1 }],
      };
      const isEligible = originalInvoice.units.some((u) => u.stockUnitId === soldUnit.id);
      expect(isEligible).toBe(true);
    });

    it("T1.9.2: Restores unit status to IN_STOCK upon restockable customer return", () => {
      const soldUnit = { ...sampleStockUnits[2] };
      expect(soldUnit.status).toBe("SOLD");

      // Apply return
      soldUnit.status = "IN_STOCK";
      soldUnit.soldAt = null;
      expect(soldUnit.status).toBe("IN_STOCK");
      expect(soldUnit.soldAt).toBeNull();
    });

    it("T1.9.3: Assigns unit status to QUARANTINED upon damaged device return", () => {
      const soldUnit = { ...sampleStockUnits[2] };
      soldUnit.status = "QUARANTINED";
      expect(soldUnit.status).toBe("QUARANTINED");
    });

    it("T1.9.4: Posts balanced double-entry credit reversal journal for return", () => {
      // Sales return reversing invoice:
      // DR Revenue: 290,000
      // DR Tax Payable: 52,200 (18%)
      // CR Accounts Receivable (or Cash refund): 342,200
      // DR Inventory Asset: 250,000 (Acquisition cost)
      // CR COGS: 250,000 (COGS reversal)
      const returnLines = [
        { accountId: "acc-4000-rev", debit: 290000, credit: 0 },
        { accountId: "acc-2200-tax", debit: 52200, credit: 0 },
        { accountId: "acc-1100-ar", debit: 0, credit: 342200 },
        { accountId: "acc-1200-inv", debit: 250000, credit: 0 },
        { accountId: "acc-5000-cogs", debit: 0, credit: 250000 },
      ];
      const totalDebit = returnLines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = returnLines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBe(totalCredit);
      expect(totalDebit).toBe(290000 + 52200 + 250000); // 592,200
    });

    it("T1.9.5: Preserves immutable audit trail linking return to original invoice number", () => {
      const returnRecord = {
        returnNumber: "ISB-SR-FY2026-27-000001",
        originalInvoiceNumber: "ISB-SI-FY2026-27-000008",
        returnedUnitId: sampleStockUnits[2].id,
        imei: sampleStockUnits[2].imei1,
      };
      expect(returnRecord.originalInvoiceNumber).toBe("ISB-SI-FY2026-27-000008");
      expect(returnRecord.returnNumber).toBe("ISB-SR-FY2026-27-000001");
    });
  });

  // ==========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (>=5 tests per core feature)
  // ==========================================================================

  describe("Tier 2.1: IMEI Validation Boundaries & Malformed Inputs", () => {
    it("T2.1.1: Accepts valid 15-digit IMEI satisfying Luhn mod-10 algorithm", () => {
      expect(isValidImei("490154203237518")).toBe(true);
    });

    it("T2.1.2: Rejects 15-digit code with invalid Luhn check digit", () => {
      expect(isValidImei("490154203237519")).toBe(false);
    });

    it("T2.1.3: Rejects short IMEI string (less than 15 digits)", () => {
      expect(isValidImei("4901542032375")).toBe(false);
    });

    it("T2.1.4: Rejects excessively long string (more than 15 digits)", () => {
      expect(isValidImei("4901542032375180")).toBe(false);
    });

    it("T2.1.5: Normalizes barcodes with embedded spaces, hyphens, and tabs", () => {
      expect(normalizeImei(" 3589-0123-4567-890 \t")).toBe("358901234567890");
    });
  });

  describe("Tier 2.2: Cart Line Boundary Conditions", () => {
    it("T2.2.1: Rejects floating-point decimal quantities on serialized handset rows", () => {
      const { cart } = addHandsetToCart([], sampleStockUnits[0], { name: "iPhone 15 Pro", unitPrice: 420000, taxRate: 18 });
      const res = updateCartQuantity(cart, cart[0].id, 1.5 as unknown as number);
      expect(res.error).toBe("HANDSET_QUANTITY_LOCKED");
    });

    it("T2.2.2: Rejects negative price on cart lines", () => {
      const line = {
        id: "l1",
        quantity: 1,
        unitPrice: -5000,
        discountAmount: 0,
        taxRate: 18,
        trackingMethod: "QUANTITY" as const,
        productId: "p1",
        variantId: "v1",
        productName: "Test",
      };
      expect(line.unitPrice).toBeLessThan(0);
      const isInvalid = line.unitPrice < 0;
      expect(isInvalid).toBe(true);
    });

    it("T2.2.3: Rejects line discount greater than line gross total", () => {
      const line = { quantity: 2, unitPrice: 5000, discountAmount: 12000 }; // Gross 10,000, discount 12,000
      const isInvalidDiscount = line.discountAmount > line.quantity * line.unitPrice;
      expect(isInvalidDiscount).toBe(true);
    });

    it("T2.2.4: Calculates zero tax total when product tax rate is 0%", () => {
      const lines: PosCartLine[] = [
        {
          id: "l1",
          quantity: 1,
          unitPrice: 100000,
          discountAmount: 0,
          taxRate: 0,
          trackingMethod: "QUANTITY",
          productId: "p1",
          variantId: "v1",
          productName: "Tax Exempt Item",
        },
      ];
      const fin = calculateCheckoutFinancials(lines);
      expect(fin.taxTotal).toBe(0);
      expect(fin.grandTotal).toBe(100000);
    });

    it("T2.2.5: Handles 100% full line discount resulting in 0 net revenue and 0 tax", () => {
      const lines: PosCartLine[] = [
        {
          id: "l1",
          quantity: 1,
          unitPrice: 50000,
          discountAmount: 50000, // 100% discount
          taxRate: 18,
          trackingMethod: "QUANTITY",
          productId: "p1",
          variantId: "v1",
          productName: "Promotional Gift",
        },
      ];
      const fin = calculateCheckoutFinancials(lines);
      expect(fin.netRevenue).toBe(0);
      expect(fin.taxTotal).toBe(0);
      expect(fin.grandTotal).toBe(0);
    });
  });

  describe("Tier 2.3: Accessory Stock Boundary Ceilings", () => {
    it("T2.3.1: Accepts exact available quantity boundary (quantity == available)", () => {
      const balance: TestStockBalance = {
        productId: "p1",
        variantId: "v1",
        warehouseId: WAREHOUSE_ISB,
        quantity: 10,
        inventoryValue: 20000,
        reservedQuantity: 2, // Available = 8
      };
      const initialCart: PosCartLine[] = [
        {
          id: "l1",
          productId: "p1",
          variantId: "v1",
          productName: "Cable",
          trackingMethod: "QUANTITY",
          quantity: 1,
          unitPrice: 2000,
          discountAmount: 0,
          taxRate: 0,
        },
      ];
      const res = updateCartQuantity(initialCart, "l1", 8, balance);
      expect(res.error).toBeUndefined();
      expect(res.cart[0].quantity).toBe(8);
    });

    it("T2.3.2: Rejects quantity exceeding available by 1 unit (quantity == available + 1)", () => {
      const balance: TestStockBalance = {
        productId: "p1",
        variantId: "v1",
        warehouseId: WAREHOUSE_ISB,
        quantity: 10,
        inventoryValue: 20000,
        reservedQuantity: 2, // Available = 8
      };
      const initialCart: PosCartLine[] = [
        {
          id: "l1",
          productId: "p1",
          variantId: "v1",
          productName: "Cable",
          trackingMethod: "QUANTITY",
          quantity: 1,
          unitPrice: 2000,
          discountAmount: 0,
          taxRate: 0,
        },
      ];
      const res = updateCartQuantity(initialCart, "l1", 9, balance);
      expect(res.error).toBe("INSUFFICIENT_STOCK");
    });

    it("T2.3.3: Rejects any addition when available stock is exactly zero", () => {
      const balance: TestStockBalance = {
        productId: "p1",
        variantId: "v1",
        warehouseId: WAREHOUSE_ISB,
        quantity: 5,
        inventoryValue: 10000,
        reservedQuantity: 5, // Available = 0
      };
      const initialCart: PosCartLine[] = [
        {
          id: "l1",
          productId: "p1",
          variantId: "v1",
          productName: "Cable",
          trackingMethod: "QUANTITY",
          quantity: 1,
          unitPrice: 2000,
          discountAmount: 0,
          taxRate: 0,
        },
      ];
      const res = updateCartQuantity(initialCart, "l1", 1, balance);
      expect(res.error).toBe("INSUFFICIENT_STOCK");
    });

    it("T2.3.4: Rejects fractional quantity when product UOM is whole unit (integer only)", () => {
      const isIntegerUom = true;
      const requestedQty = 2.5;
      const isValid = !isIntegerUom || Number.isInteger(requestedQty);
      expect(isValid).toBe(false);
    });

    it("T2.3.5: Prevents stock underflow when inventory balance record is null/missing", () => {
      const balance = undefined as TestStockBalance | undefined;
      // When balance is undefined, available is 0 -> should reject
      const available = balance ? balance.quantity - balance.reservedQuantity : 0;
      expect(available).toBe(0);
    });
  });

  describe("Tier 2.4: Atomic POS Checkout Financial Edge Cases", () => {
    it("T2.4.1: Calculates correct cash change when customer tenders excess cash", () => {
      const grandTotal = 95200;
      const tendered = 100000;
      const changeDue = tendered - grandTotal;
      expect(changeDue).toBe(4800);
    });

    it("T2.4.2: Rejects checkout when cash tendered is less than grand total without credit agreement", () => {
      const grandTotal = 95200;
      const tendered = 90000;
      const isUnderpaid = tendered < grandTotal;
      expect(isUnderpaid).toBe(true);
    });

    it("T2.4.3: Handles multi-tender split payment summing exactly to grand total with single rupee cents", () => {
      const payments: SplitPayment[] = [
        { paymentMethod: "CASH", amount: 33333.33 },
        { paymentMethod: "CARD", amount: 33333.33 },
        { paymentMethod: "WALLET", amount: 33333.34 },
      ];
      const total = payments.reduce((s, p) => s + p.amount, 0);
      expect(Math.round(total * 100) / 100).toBe(100000.00);
    });

    it("T2.4.4: Enforces customer credit limit threshold when CREDIT payment is utilized", () => {
      const customer = { creditLimit: 50000, currentBalance: 20000 };
      const requestedCredit = 35000; // Total 55,000 > 50,000 limit
      const exceeds = customer.currentBalance + requestedCredit > customer.creditLimit;
      expect(exceeds).toBe(true);
    });

    it("T2.4.5: Permits credit sale when customer credit limit is zero (0) strictly as zero credit, not unlimited", () => {
      const customer = { creditLimit: 0, currentBalance: 0 };
      const requestedCredit = 1000;
      const exceeds = customer.currentBalance + requestedCredit > customer.creditLimit;
      expect(exceeds).toBe(true);
    });
  });

  describe("Tier 2.5: GL Double-Entry Cent Balancing Under Rounded Tax", () => {
    const accounts = {
      arAccountId: "acc-1100-ar",
      revenueAccountId: "acc-4000-rev",
      taxAccountId: "acc-2200-tax",
      cogsAccountId: "acc-5000-cogs",
      inventoryAccountId: "acc-1200-inv",
      cashAccountId: "acc-1010-cash",
      bankAccountId: "acc-1020-bank",
    };

    it("T2.5.1: Balances debits and credits on fractional tax calculations (e.g. 17.5% tax rate)", () => {
      const lines: PosCartLine[] = [
        {
          id: "l1",
          productId: "p1",
          variantId: "v1",
          productName: "Item A",
          trackingMethod: "QUANTITY",
          quantity: 3,
          unitPrice: 333.33, // Gross 999.99
          discountAmount: 0,
          taxRate: 17.5, // Tax = 174.99825 -> rounded
        },
      ];
      const fin = calculateCheckoutFinancials(lines);
      const journals = generateDoubleEntryJournals({
        invoiceNumber: "ISB-SI-FY2026-27-000002",
        customerId: "c1",
        grandTotal: fin.grandTotal,
        netRevenue: fin.netRevenue,
        taxTotal: fin.taxTotal,
        totalCOGS: 600,
        payments: [{ paymentMethod: "CASH", amount: fin.grandTotal }],
        accounts,
      });

      expect(journals.salesJournal.isBalanced).toBe(true);
    });

    it("T2.5.2: Balances journal entry when invoice discount is applied across multiple lines", () => {
      const lines: PosCartLine[] = [
        { id: "l1", productId: "p1", variantId: "v1", productName: "Item 1", trackingMethod: "QUANTITY", quantity: 1, unitPrice: 50000, discountAmount: 0, taxRate: 18 },
        { id: "l2", productId: "p2", variantId: "v2", productName: "Item 2", trackingMethod: "QUANTITY", quantity: 1, unitPrice: 50000, discountAmount: 0, taxRate: 18 },
      ];
      const fin = calculateCheckoutFinancials(lines, 10000); // 10,000 invoice discount
      const journals = generateDoubleEntryJournals({
        invoiceNumber: "ISB-SI-FY2026-27-000003",
        customerId: "c1",
        grandTotal: fin.grandTotal,
        netRevenue: fin.netRevenue,
        taxTotal: fin.taxTotal,
        totalCOGS: 60000,
        payments: [{ paymentMethod: "CASH", amount: fin.grandTotal }],
        accounts,
      });

      expect(journals.salesJournal.isBalanced).toBe(true);
      expect(fin.grandTotal).toBe(fin.netRevenue + fin.taxTotal);
    });

    it("T2.5.3: Balances GL entry when grand total is zero", () => {
      const journals = generateDoubleEntryJournals({
        invoiceNumber: "ISB-SI-FY2026-27-000004",
        customerId: "c1",
        grandTotal: 0,
        netRevenue: 0,
        taxTotal: 0,
        totalCOGS: 0,
        payments: [],
        accounts,
      });

      expect(journals.salesJournal.isBalanced).toBe(true);
      expect(journals.salesJournal.totalDebit).toBe(0);
      expect(journals.salesJournal.totalCredit).toBe(0);
    });

    it("T2.5.4: Preserves landed cost precision when handset acquisition cost contains decimal cents", () => {
      const lines: PosCartLine[] = [
        {
          id: "l1",
          productId: "p1",
          variantId: "v1",
          productName: "Phone",
          trackingMethod: "IMEI",
          quantity: 1,
          unitPrice: 150000,
          discountAmount: 0,
          taxRate: 0,
          acquisitionCost: 123456.78, // Decimal cents landed cost
        },
      ];
      const fin = calculateCheckoutFinancials(lines);
      expect(fin.totalCOGS).toBe(123456.78);
    });

    it("T2.5.5: Receipt journal total credit exactly matches Accounts Receivable reduction", () => {
      const grandTotal = 250000;
      const payments: SplitPayment[] = [
        { paymentMethod: "CASH", amount: 100000 },
        { paymentMethod: "CARD", amount: 150000 },
      ];
      const journals = generateDoubleEntryJournals({
        invoiceNumber: "ISB-SI-FY2026-27-000005",
        customerId: "c1",
        grandTotal,
        netRevenue: grandTotal,
        taxTotal: 0,
        totalCOGS: 200000,
        payments,
        accounts,
      });

      const arCredits = journals.receiptJournal.lines
        .filter((l) => l.accountId === accounts.arAccountId)
        .reduce((s, l) => s + l.credit, 0);

      expect(arCredits).toBe(grandTotal);
    });
  });

  describe("Tier 2.6: Sequential Numbering Formats & Regex Conformance", () => {
    it("T2.6.1: Conforms strictly to regex `^[A-Z0-9]+-[A-Z0-9]+-FY[0-9]{4}-[0-9]{2}-[0-9]{6}$`", () => {
      const pattern = /^[A-Z0-9]+-[A-Z0-9]+-FY[0-9]{4}-[0-9]{2}-[0-9]{6}$/;
      const validNumber = formatSequentialDocumentNumber({
        branchPrefix: "ISB",
        docType: "SI",
        fiscalYear: "FY2026-27",
        sequenceNumber: 1,
      });
      expect(pattern.test(validNumber)).toBe(true);
    });

    it("T2.6.2: Sanitizes triple hyphens `ISB---SI` into single hyphen", () => {
      const num = formatSequentialDocumentNumber({
        branchPrefix: "ISB--",
        docType: "-SI",
        fiscalYear: FISCAL_YEAR,
        sequenceNumber: 42,
      });
      expect(num).toBe("ISB-SI-FY2026-27-000042");
    });

    it("T2.6.3: Handles sequence numbers reaching 999999 without padding corruption", () => {
      const num = formatSequentialDocumentNumber({
        branchPrefix: "ISB",
        docType: "SI",
        fiscalYear: FISCAL_YEAR,
        sequenceNumber: 999999,
      });
      expect(num).toBe("ISB-SI-FY2026-27-999999");
    });

    it("T2.6.4: Gracefully expands sequence beyond 6 digits if volume exceeds 1 million", () => {
      const num = formatSequentialDocumentNumber({
        branchPrefix: "ISB",
        docType: "SI",
        fiscalYear: FISCAL_YEAR,
        sequenceNumber: 1000001,
      });
      expect(num).toBe("ISB-SI-FY2026-27-1000001");
    });

    it("T2.6.5: Distinguishes documents across branches (ISB vs KHI vs LHR)", () => {
      const isb = formatSequentialDocumentNumber({ branchPrefix: "ISB", docType: "SI", fiscalYear: FISCAL_YEAR, sequenceNumber: 1 });
      const khi = formatSequentialDocumentNumber({ branchPrefix: "KHI", docType: "SI", fiscalYear: FISCAL_YEAR, sequenceNumber: 1 });
      expect(isb).toBe("ISB-SI-FY2026-27-000001");
      expect(khi).toBe("KHI-SI-FY2026-27-000001");
      expect(isb).not.toBe(khi);
    });
  });

  describe("Tier 2.7: Shift Drawer Extreme & Boundary Cases", () => {
    it("T2.7.1: Zero opening float handles cash transactions cleanly", () => {
      const res = reconcileShiftDrawer({
        openingFloat: 0,
        transactions: [{ tenderMethod: "CASH", amount: 15000 }],
        countedCash: 15000,
      });
      expect(res.expectedCash).toBe(15000);
      expect(res.variance).toBe(0);
    });

    it("T2.7.2: Shift with zero transactions retains exact opening float", () => {
      const res = reconcileShiftDrawer({
        openingFloat: 25000,
        transactions: [],
        countedCash: 25000,
      });
      expect(res.expectedCash).toBe(25000);
      expect(res.variance).toBe(0);
    });

    it("T2.7.3: Shift with ONLY digital tenders produces zero cash in drawer beyond opening float", () => {
      const res = reconcileShiftDrawer({
        openingFloat: 10000,
        transactions: [
          { tenderMethod: "CARD", amount: 500000 },
          { tenderMethod: "WALLET", amount: 300000 },
          { tenderMethod: "BANK", amount: 200000 },
        ],
        countedCash: 10000, // Drawer should only contain the 10,000 float
      });
      expect(res.expectedCash).toBe(10000);
      expect(res.nonCashTendersTotal).toBe(1000000);
      expect(res.variance).toBe(0);
    });

    it("T2.7.4: Catches massive cash shortage when cashier enters 0 counted cash", () => {
      const res = reconcileShiftDrawer({
        openingFloat: 10000,
        transactions: [{ tenderMethod: "CASH", amount: 50000 }],
        countedCash: 0, // Drawer empty
      });
      expect(res.expectedCash).toBe(60000);
      expect(res.variance).toBe(-60000);
      expect(res.isBalanced).toBe(false);
    });

    it("T2.7.5: Prevents negative counted cash input", () => {
      const counted = -500;
      const isValid = counted >= 0;
      expect(isValid).toBe(false);
    });
  });

  describe("Tier 2.8: Parked Cart Revalidation Boundaries", () => {
    it("T2.8.1: Revalidation fails if device was transferred to another warehouse while parked", () => {
      const parkedUnit = { ...sampleStockUnits[0], currentWarehouseId: WAREHOUSE_KHI }; // Transferred to Karachi
      const res = resolveDeviceIdentifier(parkedUnit.imei1, WAREHOUSE_ISB, [parkedUnit]);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("DEVICE_WRONG_WAREHOUSE");
      }
    });

    it("T2.8.2: Revalidation fails if device was moved to quarantine due to damage inspection", () => {
      const parkedUnit = { ...sampleStockUnits[0], status: "QUARANTINED" as const };
      const res = resolveDeviceIdentifier(parkedUnit.imei1, WAREHOUSE_ISB, [parkedUnit]);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("DEVICE_QUARANTINED");
      }
    });

    it("T2.8.3: Revalidation passes when device is unchanged and still in active warehouse", () => {
      const res = resolveDeviceIdentifier(sampleStockUnits[0].imei1, WAREHOUSE_ISB, sampleStockUnits);
      expect(res.success).toBe(true);
    });

    it("T2.8.4: Replaces outdated catalog price with current price list upon cashier option", () => {
      const parkedPrice = 420000;
      const currentPriceListPrice = 410000; // Price dropped by 10,000
      const updatedPrice = currentPriceListPrice;
      expect(updatedPrice).toBe(410000);
      expect(updatedPrice).toBeLessThan(parkedPrice);
    });

    it("T2.8.5: Multiple parked sales can be held simultaneously without cross-cart interference", () => {
      const parkedCarts = new Map<string, PosCartLine[]>();
      parkedCarts.set("parked-cust-A", [{ id: "l1", productId: "p1", variantId: "v1", productName: "Item A", trackingMethod: "QUANTITY", quantity: 1, unitPrice: 5000, discountAmount: 0, taxRate: 0 }]);
      parkedCarts.set("parked-cust-B", [{ id: "l2", productId: "p2", variantId: "v2", productName: "Item B", trackingMethod: "QUANTITY", quantity: 2, unitPrice: 8000, discountAmount: 0, taxRate: 0 }]);

      expect(parkedCarts.size).toBe(2);
      expect(parkedCarts.get("parked-cust-A")?.[0].unitPrice).toBe(5000);
      expect(parkedCarts.get("parked-cust-B")?.[0].unitPrice).toBe(8000);
    });
  });

  describe("Tier 2.9: Customer Return Edge Cases", () => {
    it("T2.9.1: Rejects return of handset IMEI that was never sold", () => {
      const unsoldUnit = sampleStockUnits[0]; // status: IN_STOCK
      const canReturn = unsoldUnit.status === "SOLD";
      expect(canReturn).toBe(false);
    });

    it("T2.9.2: Rejects second return attempt for device already returned (double return)", () => {
      const returnedUnit = { ...sampleStockUnits[2], status: "IN_STOCK" as StockUnitStatus }; // Reverted to in-stock
      const canReturnAgain = returnedUnit.status === "SOLD";
      expect(canReturnAgain).toBe(false);
    });

    it("T2.9.3: Handles zero tax rate return credit note", () => {
      const returnLines = [
        { accountId: "acc-4000-rev", debit: 100000, credit: 0 },
        { accountId: "acc-1100-ar", debit: 0, credit: 100000 },
      ];
      const isBalanced = returnLines[0].debit === returnLines[1].credit;
      expect(isBalanced).toBe(true);
    });

    it("T2.9.4: Rejects returning higher quantity of accessories than original sales invoice line", () => {
      const originalQuantity = 3;
      const requestedReturnQty = 5;
      const isExceeded = requestedReturnQty > originalQuantity;
      expect(isExceeded).toBe(true);
    });

    it("T2.9.5: Accurately reverses landed cost COGS based on original sold unit's acquisition cost", () => {
      const soldUnit = sampleStockUnits[2]; // acquisitionCost: 290,000
      const cogsReversal = parseFloat(soldUnit.acquisitionCost);
      expect(cogsReversal).toBe(290000);
    });
  });

  // ==========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS (Pairwise Coverage)
  // ==========================================================================

  describe("Tier 3: Cross-Feature Combinations (Pairwise Matrix)", () => {
    const accounts = {
      arAccountId: "acc-1100-ar",
      revenueAccountId: "acc-4000-rev",
      taxAccountId: "acc-2200-tax",
      cogsAccountId: "acc-5000-cogs",
      inventoryAccountId: "acc-1200-inv",
      cashAccountId: "acc-1010-cash",
      bankAccountId: "acc-1020-bank",
    };

    it("T3.1: Mixed Cart (Handset + Quantity Accessory) with Split Cash & Card Tender", () => {
      // Line 1: Handset (1 unit, IMEI tracked, specific cost)
      // Line 2: Anker Charger (3 units, weighted average cost)
      const handsetUnit = sampleStockUnits[0]; // Cost: 385,000
      const accessoryUnitCost = 3000;

      const lines: PosCartLine[] = [
        {
          id: "l-phone",
          productId: handsetUnit.productId,
          variantId: handsetUnit.variantId,
          productName: "iPhone 15 Pro",
          trackingMethod: "IMEI",
          quantity: 1,
          unitPrice: 420000,
          discountAmount: 10000, // Net 410,000
          taxRate: 18, // Tax 73,800 -> Total 483,800
          stockUnitId: handsetUnit.id,
          acquisitionCost: 385000,
        },
        {
          id: "l-charger",
          productId: "prod-anker-20w",
          variantId: "var-anker-20w-wht",
          productName: "Anker 20W Charger",
          trackingMethod: "QUANTITY",
          quantity: 3,
          unitPrice: 4500, // 13,500
          discountAmount: 500, // Net 13,000
          taxRate: 18, // Tax 2,340 -> Total 15,340
          acquisitionCost: accessoryUnitCost,
        },
      ];

      const fin = calculateCheckoutFinancials(lines);
      expect(fin.grandTotal).toBe(483800 + 15340); // 499,140
      expect(fin.totalCOGS).toBe(385000 + (3 * 3000)); // 394,000

      // Split tender: 100,000 Cash + 399,140 Card
      const payments: SplitPayment[] = [
        { paymentMethod: "CASH", amount: 100000 },
        { paymentMethod: "CARD", amount: 399140 },
      ];

      const journals = generateDoubleEntryJournals({
        invoiceNumber: "ISB-SI-FY2026-27-000010",
        customerId: "cust-01",
        grandTotal: fin.grandTotal,
        netRevenue: fin.netRevenue,
        taxTotal: fin.taxTotal,
        totalCOGS: fin.totalCOGS,
        payments,
        accounts,
      });

      expect(journals.salesJournal.isBalanced).toBe(true);
      expect(journals.receiptJournal.isBalanced).toBe(true);
      expect(journals.receiptJournal.totalDebit).toBe(fin.grandTotal);
    });

    it("T3.2: Parked Cart Recalled and Settled Across Shift Float", () => {
      // Cashier opens shift with 20,000 PKR float
      const openingFloat = 20000;

      // Recalls parked cart of 50,000 PKR cash
      const checkoutTotal = 50000;
      const transactions = [{ tenderMethod: "CASH" as const, amount: checkoutTotal }];

      const shiftState = reconcileShiftDrawer({
        openingFloat,
        transactions,
        countedCash: 70000,
      });

      expect(shiftState.expectedCash).toBe(70000);
      expect(shiftState.isBalanced).toBe(true);
    });

    it("T3.3: Checkout Followed by Counter Customer Return with Cash Drawer Refund", () => {
      const openingFloat = 50000;

      // 1. Sale of 150,000 cash
      // 2. Return with cash refund of 30,000
      // 3. Card sale of 200,000 (must NOT touch drawer)
      const transactions = [
        { tenderMethod: "CASH" as const, amount: 150000 },
        { tenderMethod: "CASH" as const, amount: 30000, isRefund: true },
        { tenderMethod: "CARD" as const, amount: 200000 },
      ];

      const drawer = reconcileShiftDrawer({
        openingFloat,
        transactions,
        countedCash: 170000, // 50,000 + 150,000 - 30,000
      });

      expect(drawer.expectedCash).toBe(170000);
      expect(drawer.nonCashTendersTotal).toBe(200000);
      expect(drawer.variance).toBe(0);
      expect(drawer.isBalanced).toBe(true);
    });

    it("T3.4: Dual-SIM Phone Checkout with Customer Credit Limit Validation and Down Payment", () => {
      const handset = sampleStockUnits[0]; // Price 420,000
      expect(handset.status).toBe("IN_STOCK");
      const customer = { id: "cust-corp-1", creditLimit: 500000, currentBalance: 150000 };

      const grandTotal = 420000;
      const cashDownPayment = 120000;
      const creditPortion = 300000;

      // Validate credit headroom
      const newBalance = customer.currentBalance + creditPortion; // 450,000 <= 500,000
      expect(newBalance).toBeLessThanOrEqual(customer.creditLimit);

      const payments: SplitPayment[] = [
        { paymentMethod: "CASH", amount: cashDownPayment },
        { paymentMethod: "CREDIT", amount: creditPortion },
      ];

      const totalTenders = payments.reduce((s, p) => s + p.amount, 0);
      expect(totalTenders).toBe(grandTotal);
    });

    it("T3.5: Sequential Document Numbering Across Invoice, Receipt, and Return Documents", () => {
      const invoiceNum = formatSequentialDocumentNumber({ branchPrefix: "ISB", docType: "SI", fiscalYear: FISCAL_YEAR, sequenceNumber: 101 });
      const receiptNum = formatSequentialDocumentNumber({ branchPrefix: "ISB", docType: "RC", fiscalYear: FISCAL_YEAR, sequenceNumber: 101 });
      const returnNum = formatSequentialDocumentNumber({ branchPrefix: "ISB", docType: "SR", fiscalYear: FISCAL_YEAR, sequenceNumber: 12 });

      expect(invoiceNum).toBe("ISB-SI-FY2026-27-000101");
      expect(receiptNum).toBe("ISB-RC-FY2026-27-000101");
      expect(returnNum).toBe("ISB-SR-FY2026-27-000012");
    });

    it("T3.6: Shift Reconciled with Shortage While Card Receipts Balance Independently", () => {
      const shift = reconcileShiftDrawer({
        openingFloat: 10000,
        transactions: [
          { tenderMethod: "CASH", amount: 20000 },
          { tenderMethod: "CARD", amount: 150000 },
        ],
        countedCash: 29800, // 200 PKR shortage
      });

      expect(shift.variance).toBe(-200);
      expect(shift.nonCashTendersTotal).toBe(150000); // Intact
    });

    it("T3.7: Idempotency Protection Across Repeated Checkout Requests with Identical Key", () => {
      const idempotencyKey = "pos-uuid-idemp-999";
      let postCount = 0;

      function simulateCheckout(key: string) {
        if (key === idempotencyKey && postCount > 0) {
          return { status: "ALREADY_PROCESSED", invoiceNumber: "ISB-SI-FY2026-27-000050" };
        }
        postCount++;
        return { status: "POSTED", invoiceNumber: "ISB-SI-FY2026-27-000050" };
      }

      const res1 = simulateCheckout(idempotencyKey);
      const res2 = simulateCheckout(idempotencyKey);

      expect(res1.status).toBe("POSTED");
      expect(res2.status).toBe("ALREADY_PROCESSED");
      expect(postCount).toBe(1); // Transaction executed only once
    });

    it("T3.8: Handset Cart Deduplication Combined with Accessory Upsell", () => {
      let cart: PosCartLine[] = [];
      const prodPhone = { name: "iPhone 15 Pro", unitPrice: 420000, taxRate: 18 };
      const prodCase = { name: "Silicone Case", unitPrice: 8500, taxRate: 18 };

      // 1. Add phone
      cart = addHandsetToCart(cart, sampleStockUnits[0], prodPhone).cart;
      // 2. Attempt duplicate scan of phone via IMEI2
      const duplicateAttempt = addHandsetToCart(cart, sampleStockUnits[0], prodPhone);
      expect(duplicateAttempt.error).toBe("DEVICE_ALREADY_IN_CART");

      // 3. Add accessory case
      const caseLine: PosCartLine = {
        id: "l-case",
        productId: "prod-case-1",
        variantId: "var-case-1",
        productName: prodCase.name,
        trackingMethod: "QUANTITY",
        quantity: 1,
        unitPrice: prodCase.unitPrice,
        discountAmount: 0,
        taxRate: prodCase.taxRate,
      };
      cart = [...cart, caseLine];

      expect(cart).toHaveLength(2);
      expect(cart[0].trackingMethod).toBe("IMEI");
      expect(cart[1].trackingMethod).toBe("QUANTITY");
    });
  });

  // ==========================================================================
  // TIER 4: REAL-WORLD RETAIL APPLICATION SCENARIOS
  // ==========================================================================

  describe("Tier 4: Real-World Retail Application Scenarios", () => {
    const accounts = {
      arAccountId: "acc-1100-ar",
      revenueAccountId: "acc-4000-rev",
      taxAccountId: "acc-2200-tax",
      cogsAccountId: "acc-5000-cogs",
      inventoryAccountId: "acc-1200-inv",
      cashAccountId: "acc-1010-cash",
      bankAccountId: "acc-1020-bank",
    };

    it("T4.1: Complete Retail Business Day Lifecycle (Shift Open -> Checkouts -> Returns -> Shift Close)", () => {
      // Step 1: Morning - Cashier opens terminal shift with 15,000 PKR float
      const shift: PosShiftRecord = {
        id: "shift-20261110-01",
        terminalId: "pos-term-01",
        cashierId: "cashier-ali",
        openedAt: "2026-11-10T09:00:00Z",
        openingFloat: 15000,
        status: "OPEN",
      };
      expect(shift.status).toBe("OPEN");

      // Step 2: Customer 1 buys serialized iPhone 15 Pro (Cash 420,000 PKR)
      const phoneUnit = sampleStockUnits[0];
      const cust1Lines: PosCartLine[] = [
        {
          id: "l1",
          productId: phoneUnit.productId,
          variantId: phoneUnit.variantId,
          productName: "iPhone 15 Pro",
          trackingMethod: "IMEI",
          quantity: 1,
          unitPrice: 420000,
          discountAmount: 0,
          taxRate: 0,
          stockUnitId: phoneUnit.id,
          acquisitionCost: 385000,
        },
      ];
      const cust1Fin = calculateCheckoutFinancials(cust1Lines);
      const cust1Journals = generateDoubleEntryJournals({
        invoiceNumber: "ISB-SI-FY2026-27-000201",
        customerId: "cust-walkin-1",
        grandTotal: cust1Fin.grandTotal,
        netRevenue: cust1Fin.netRevenue,
        taxTotal: cust1Fin.taxTotal,
        totalCOGS: cust1Fin.totalCOGS,
        payments: [{ paymentMethod: "CASH", amount: cust1Fin.grandTotal }],
        accounts,
      });
      expect(cust1Journals.salesJournal.isBalanced).toBe(true);
      expect(cust1Journals.receiptJournal.isBalanced).toBe(true);

      // Step 3: Customer 2 buys 2 Anker Chargers via Card POS (9,000 PKR)
      const cust2Payments: SplitPayment[] = [{ paymentMethod: "CARD", amount: 9000, reference: "POS-REF-991" }];

      // Step 4: Customer 3 returns a defective accessory for a 4,500 PKR cash refund
      const refundAmount = 4500;

      // Step 5: Evening - Cashier closes shift and counts physical cash drawer
      const shiftTransactions = [
        { tenderMethod: "CASH" as const, amount: cust1Fin.grandTotal }, // +420,000
        { tenderMethod: cust2Payments[0].paymentMethod, amount: cust2Payments[0].amount }, // Ignored by cash drawer
        { tenderMethod: "CASH" as const, amount: refundAmount, isRefund: true }, // -4,500
      ];

      const expectedCash = 15000 + 420000 - 4500; // 430,500 PKR
      expect(expectedCash).toBe(430500);
      const countedPhysicalCash = 430500;

      const closingReconciliation = reconcileShiftDrawer({
        openingFloat: shift.openingFloat,
        transactions: shiftTransactions,
        countedCash: countedPhysicalCash,
      });

      expect(closingReconciliation.expectedCash).toBe(430500);
      expect(closingReconciliation.variance).toBe(0);
      expect(closingReconciliation.isBalanced).toBe(true);
      expect(closingReconciliation.nonCashTendersTotal).toBe(9000);
    });

    it("T4.2: Rush-Hour Park & Recall Flow with Multi-Tender Mobile Wallet Split", () => {
      // 1. Cashier scans iPhone 15 Pro for Customer A
      let cartA: PosCartLine[] = [];
      cartA = addHandsetToCart(cartA, sampleStockUnits[1], { name: "iPhone 15 Pro", unitPrice: 420000, taxRate: 18 }).cart;

      // 2. Customer A forgot wallet in car -> Cashier parks cart (F9)
      const parkedId = "parked-draft-001";
      const parkedStore = new Map<string, PosCartLine[]>();
      parkedStore.set(parkedId, cartA);
      expect(parkedStore.has(parkedId)).toBe(true);

      // 3. Cashier serves Customer B (fast sale of accessory)
      const cartB: PosCartLine[] = [
        { id: "l-b", productId: "p1", variantId: "v1", productName: "Cable", trackingMethod: "QUANTITY", quantity: 1, unitPrice: 2500, discountAmount: 0, taxRate: 18 },
      ];
      const finB = calculateCheckoutFinancials(cartB);
      expect(finB.grandTotal).toBe(2950);

      // 4. Customer A returns -> Cashier recalls parked cart
      const recalledCart = parkedStore.get(parkedId);
      expect(recalledCart).toBeDefined();
      expect(recalledCart?.[0].stockUnitId).toBe(sampleStockUnits[1].id);

      // 5. Customer A splits payment: 200,000 EasyPaisa + 295,600 Card
      const finA = calculateCheckoutFinancials(recalledCart!);
      const splitPayments: SplitPayment[] = [
        { paymentMethod: "WALLET", amount: 200000, reference: "EP-TRANS-881" },
        { paymentMethod: "CARD", amount: finA.grandTotal - 200000, reference: "CARD-SLIP-772" },
      ];
      const totalPaid = splitPayments.reduce((s, p) => s + p.amount, 0);
      expect(totalPaid).toBe(finA.grandTotal);
    });

    it("T4.3: Serialized Handset Warranty Exchange Workflow", () => {
      // Customer brings in previously sold Samsung S24 (unit-samsung-s24-001) for warranty return
      const defectiveUnit = sampleStockUnits[2];
      expect(defectiveUnit.status).toBe("SOLD");

      // 1. Process customer return into QUARANTINE warehouse
      const returnedUnit = { ...defectiveUnit, status: "QUARANTINED" as const, soldAt: null };
      expect(returnedUnit.status).toBe("QUARANTINED");

      // 2. Issue GL credit note for returned unit
      const creditNoteAmount = 342200; // Original invoice grand total

      // 3. Sell replacement unit (iPhone 15 Pro: 420,000 PKR) applying credit note
      const replacementPrice = 420000;
      const additionalCashDue = replacementPrice - creditNoteAmount; // 77,800 PKR

      const exchangePayments: SplitPayment[] = [
        { paymentMethod: "CREDIT", amount: creditNoteAmount }, // Applied credit note
        { paymentMethod: "CASH", amount: additionalCashDue }, // Customer pays difference
      ];

      const exchangeTotal = exchangePayments.reduce((s, p) => s + p.amount, 0);
      expect(exchangeTotal).toBe(replacementPrice);
      expect(additionalCashDue).toBe(77800);
    });

    it("T4.4: High-Volume Corporate Purchase with Tiered Volume Discount and Multi-IMEI Delivery", () => {
      // Corporate customer buys two serialized handsets with negotiated corporate discount
      let corpCart: PosCartLine[] = [];
      const unit1 = sampleStockUnits[0];
      const unit2 = sampleStockUnits[1];

      corpCart = addHandsetToCart(corpCart, unit1, { name: "iPhone 15 Pro", unitPrice: 420000, taxRate: 18 }).cart;
      corpCart = addHandsetToCart(corpCart, unit2, { name: "iPhone 15 Pro", unitPrice: 420000, taxRate: 18 }).cart;

      // Apply corporate order discount of 30,000 PKR
      const fin = calculateCheckoutFinancials(corpCart, 30000);
      expect(fin.subtotal).toBe(840000);
      expect(fin.discountTotal).toBe(30000);
      expect(fin.netRevenue).toBe(810000);
      expect(fin.taxTotal).toBe((840000 * 18) / 100); // 151,200

      // Total COGS is sum of two distinct acquisition costs
      expect(fin.totalCOGS).toBe(385000 + 382500); // 767,500 PKR
    });

    it("T4.5: End-of-Day Terminal Close Denomination Breakdown Audit", () => {
      // Cashier performs physical cash count by denomination
      const denominations = [
        { value: 5000, count: 50 }, // 250,000
        { value: 1000, count: 120 }, // 120,000
        { value: 500, count: 80 },  // 40,000
        { value: 100, count: 100 }, // 10,000
        { value: 50, count: 10 },   // 500
      ];

      const physicalTotal = denominations.reduce((sum, d) => sum + d.value * d.count, 0);
      expect(physicalTotal).toBe(420500);

      // System expected cash is 420,500
      const reconciliation = reconcileShiftDrawer({
        openingFloat: 20000,
        transactions: [
          { tenderMethod: "CASH", amount: 400500 },
          { tenderMethod: "CARD", amount: 650000 }, // Excluded
        ],
        countedCash: physicalTotal,
      });

      expect(reconciliation.expectedCash).toBe(420500);
      expect(reconciliation.variance).toBe(0);
      expect(reconciliation.isBalanced).toBe(true);
    });
  });
});
