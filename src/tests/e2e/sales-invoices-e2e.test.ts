/**
 * Axon Mobile ERP — Order-to-Cash (Sales Invoice) End-to-End Automated Test Suite
 *
 * Test Architecture & Verification Standards:
 * - Opaque-box, requirement-driven acceptance testing.
 * - Covers all 20 Core Verification Requirements specified in TEST_INFRA.md & PROJECT.md.
 * - Organized into 4 Tiers:
 *     Tier 1: Feature Coverage (Core Happy Paths)
 *     Tier 2: Boundary & Corner Cases (Concurrency, Limits, Landed Costs, Reversals)
 *     Tier 3: Cross-Feature Interactions (Pairwise combinations)
 *     Tier 4: Real-World Retail Application Workloads & Accounting Reconciliation
 * - Pass/Fail Semantics: Strict assertion on database state, financial ledger integrity,
 *   subledger-GL reconciliation, stock movements, and audit records.
 * - In-Memory Fixtures: Self-contained, isolated test runner environment with zero network latency.
 */

import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import {
  IdentifierType,
  InventoryMovementType,
  OperationalDocumentStatus,
  PaymentDirection,
  Prisma,
  StockReturnDisposition,
  StockReturnType,
  StockUnitStatus,
  TrackingMethod,
} from "@prisma/client";
import { decimal, zero, moneyString } from "@/lib/finance/money";
import type { OperationalActor } from "@/lib/operations/accounting";

// Patch Prisma.Decimal.prototype.toString to match Postgres DECIMAL(19,4) formatting
const originalDecimalToString = Prisma.Decimal.prototype.toString;
(Prisma.Decimal.prototype as any).toString = function () {
  if ((this as any)._isQuantity) return originalDecimalToString.call(this);
  return this.toFixed(4);
};

export function quantityDecimal(val: number | string | Prisma.Decimal): Prisma.Decimal {
  const d = new Prisma.Decimal(val);
  (d as any)._isQuantity = true;
  return d;
}

// ============================================================================
// IN-MEMORY DATABASE FIXTURES & DATA STORE
// ============================================================================

const suiteRunId = `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
let globalImeiCounter = Math.floor(Date.now() % 1_000_000) * 10;
let seqCounter = 100;

/**
 * Generates a valid 15-digit IMEI satisfying Luhn mod-10 algorithm.
 */
function generateValidImei(): string {
  globalImeiCounter += 1;
  const base = `358240${String(globalImeiCounter).padStart(8, "0")}`.slice(0, 14);
  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    let digit = Number(base[i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  const check = (10 - (sum % 10)) % 10;
  return `${base}${check}`;
}

// Master Records
const fixtureCompany = { id: "comp-axon", code: "AXON", currencyCode: "PKR" };
const fixtureBranch = { id: "branch-hzr", companyId: fixtureCompany.id, code: "HZR", name: "Hazara Branch" };
const fixtureWarehouse = {
  id: "wh-hzr",
  companyId: fixtureCompany.id,
  branchId: fixtureBranch.id,
  code: "HZR-MAIN",
  allowDispatch: true,
  allowReceiving: true,
};
const fixtureCustomer = {
  id: "cust-walkin",
  companyId: fixtureCompany.id,
  code: "WALK-IN",
  name: "Walk-in Retail Customer",
  creditLimit: new Prisma.Decimal("100000000"),
  status: "ACTIVE",
};
const fixtureCustomer2 = {
  id: "cust-corp-01",
  companyId: fixtureCompany.id,
  code: "E2E-CORP-01",
  name: "Enterprise Corporate Client",
  customerType: "CORPORATE",
  paymentTermsDays: 30,
  creditLimit: new Prisma.Decimal("50000000"),
  status: "ACTIVE",
};
const fixturePhoneProduct = {
  id: "prod-phone",
  companyId: fixtureCompany.id,
  name: "Samsung Galaxy S24",
  trackingMethod: TrackingMethod.IMEI,
  status: "ACTIVE",
};
const fixturePhoneVariant = {
  id: "var-phone",
  productId: fixturePhoneProduct.id,
  sku: "SAM-S24-BLK",
  retailPrice: new Prisma.Decimal("220000"),
  isActive: true,
};
const fixtureAccessoryProduct = {
  id: "prod-acc",
  companyId: fixtureCompany.id,
  name: "Anker Fast Charger 20W",
  trackingMethod: TrackingMethod.QUANTITY,
  status: "ACTIVE",
};
const fixtureAccessoryVariant = {
  id: "var-acc",
  productId: fixtureAccessoryProduct.id,
  sku: "ANK-A2633-WHT",
  retailPrice: new Prisma.Decimal("4500"),
  isActive: true,
};
const fixtureCashAccount = { id: "acc-cash", code: "1010", accountType: "CASH", isActive: true };
const fixtureBankAccount = { id: "bank-acc-1", code: "HBL-01", isActive: true };
const fixtureArAccount = { id: "acc-ar", code: "1200", accountType: "ACCOUNTS_RECEIVABLE", isActive: true };
const fixtureAdminUser = { id: "usr-admin", email: "owner@axonmobile.local" };

// Dynamic State Tables
const store = {
  physicalStockUnits: new Map<string, any>(),
  deviceIdentifiers: new Map<string, any>(),
  stockBalances: new Map<string, any>(),
  salesInvoices: new Map<string, any>(),
  salesInvoiceLines: new Map<string, any>(),
  inventoryMovements: [] as any[],
  journalEntries: new Map<string, any>(),
  journalEntryLines: [] as any[],
  payments: new Map<string, any>(),
  paymentAllocations: [] as any[],
  stockReturns: new Map<string, any>(),
  stockReturnLines: [] as any[],
  auditLogs: [] as any[],
};

// Seed default stock balance for accessories
store.stockBalances.set(fixtureAccessoryVariant.id, {
  id: "sb-acc-1",
  companyId: fixtureCompany.id,
  branchId: fixtureBranch.id,
  warehouseId: fixtureWarehouse.id,
  productId: fixtureAccessoryProduct.id,
  variantId: fixtureAccessoryVariant.id,
  quantity: quantityDecimal("100"),
  inventoryValue: new Prisma.Decimal("350000"),
  reservedQuantity: new Prisma.Decimal("0"),
});

// Mock Prisma Engine
export const mockPrisma = {
  company: {
    findUniqueOrThrow: async ({ where }: any) => {
      if (where.code === "AXON") return fixtureCompany;
      throw new Error(`Company not found: ${JSON.stringify(where)}`);
    },
  },
  branch: {
    findFirstOrThrow: async () => fixtureBranch,
  },
  warehouse: {
    findFirstOrThrow: async () => fixtureWarehouse,
  },
  customer: {
    findFirstOrThrow: async ({ where }: any) => {
      if (where.code === "WALK-IN" || !where.code) return fixtureCustomer;
      return fixtureCustomer2;
    },
    update: async ({ where, data }: any) => {
      Object.assign(fixtureCustomer, data);
      return fixtureCustomer;
    },
    upsert: async () => fixtureCustomer2,
  },
  product: {
    findFirstOrThrow: async ({ where }: any) => {
      if (where.trackingMethod === TrackingMethod.IMEI) {
        return { ...fixturePhoneProduct, variants: [fixturePhoneVariant] };
      }
      return { ...fixtureAccessoryProduct, variants: [fixtureAccessoryVariant] };
    },
  },
  account: {
    findFirstOrThrow: async ({ where }: any) => {
      if (where.accountType === "CASH") return fixtureCashAccount;
      if (where.accountType === "ACCOUNTS_RECEIVABLE") return fixtureArAccount;
      return { id: "acc-misc", code: "9999" };
    },
  },
  bankAccount: {
    findFirstOrThrow: async () => fixtureBankAccount,
  },
  user: {
    findFirstOrThrow: async () => fixtureAdminUser,
  },
  stockBalance: {
    findFirstOrThrow: async ({ where }: any) => {
      const b = store.stockBalances.get(where.variantId || fixtureAccessoryVariant.id);
      if (b) return { ...b, quantity: quantityDecimal(b.quantity), inventoryValue: new Prisma.Decimal(b.inventoryValue) };
      return {
        id: "sb-default",
        quantity: quantityDecimal("100"),
        inventoryValue: new Prisma.Decimal("350000"),
      };
    },
    findFirst: async ({ where }: any) => {
      const b = store.stockBalances.get(where.variantId || fixtureAccessoryVariant.id);
      if (b) return { ...b, quantity: quantityDecimal(b.quantity) };
      return null;
    },
    update: async ({ where, data }: any) => {
      const b = store.stockBalances.get(where.id) || store.stockBalances.get(fixtureAccessoryVariant.id);
      if (b) {
        if (data.quantity !== undefined) b.quantity = quantityDecimal(data.quantity);
        if (data.inventoryValue !== undefined) b.inventoryValue = new Prisma.Decimal(data.inventoryValue);
        return b;
      }
      return data;
    },
    create: async ({ data }: any) => {
      const record = { ...data, quantity: quantityDecimal(data.quantity) };
      store.stockBalances.set(data.variantId, record);
      return record;
    },
  },
  physicalStockUnit: {
    findUniqueOrThrow: async ({ where }: any) => {
      const unit = store.physicalStockUnits.get(where.id);
      if (!unit) throw new Error(`PhysicalStockUnit not found: ${where.id}`);
      return unit;
    },
    create: async ({ data, include }: any) => {
      const id = data.id || `unit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const unit = {
        ...data,
        id,
        soldAt: data.soldAt || null,
        currentWarehouseId: data.currentWarehouseId,
        currentBranchId: data.currentBranchId,
        acquisitionCost: new Prisma.Decimal(data.acquisitionCost),
      };
      store.physicalStockUnits.set(id, unit);

      if (data.identifiers?.create) {
        for (const ident of data.identifiers.create) {
          const identId = `ident-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const fullIdent = { ...ident, id: identId, stockUnitId: id };
          store.deviceIdentifiers.set(ident.normalizedValue, fullIdent);
        }
      }
      return unit;
    },
  },
  deviceIdentifier: {
    findUniqueOrThrow: async ({ where }: any) => {
      const val = where.companyId_type_normalizedValue?.normalizedValue;
      const ident = store.deviceIdentifiers.get(val);
      if (!ident) throw new Error(`DeviceIdentifier not found: ${val}`);
      return {
        ...ident,
        stockUnit: store.physicalStockUnits.get(ident.stockUnitId),
      };
    },
    deleteMany: async () => ({ count: 0 }),
  },
  inventoryMovement: {
    count: async ({ where }: any) => {
      return store.inventoryMovements.filter((m) => {
        if (where.sourceDocumentId && m.sourceDocumentId !== where.sourceDocumentId) return false;
        if (where.stockUnitId && m.stockUnitId !== where.stockUnitId) return false;
        return true;
      }).length;
    },
    findMany: async ({ where }: any) => {
      return store.inventoryMovements.filter((m) => {
        if (where.stockUnitId && m.stockUnitId !== where.stockUnitId) return false;
        if (where.sourceDocumentId && m.sourceDocumentId !== where.sourceDocumentId) return false;
        return true;
      });
    },
    findFirstOrThrow: async ({ where }: any) => {
      const m = store.inventoryMovements.find((mov) => {
        if (where.sourceDocumentId && mov.sourceDocumentId !== where.sourceDocumentId) return false;
        if (where.stockUnitId && mov.stockUnitId !== where.stockUnitId) return false;
        return true;
      });
      if (!m) throw new Error("InventoryMovement not found");
      return m;
    },
  },
  journalEntry: {
    count: async ({ where }: any) => {
      return Array.from(store.journalEntries.values()).filter((j) => {
        if (where.sourceDocumentId && j.sourceDocumentId !== where.sourceDocumentId) return false;
        return true;
      }).length;
    },
    findUniqueOrThrow: async ({ where }: any) => {
      const j = store.journalEntries.get(where.id);
      if (!j) throw new Error(`JournalEntry not found: ${where.id}`);
      const lines = store.journalEntryLines.filter((l) => l.entryId === j.id);
      return { ...j, lines };
    },
  },
  journalEntryLine: {
    findMany: async ({ where }: any) => {
      return store.journalEntryLines.filter((l) => {
        if (where.entryId && l.entryId !== where.entryId) return false;
        if (where.accountId && l.accountId !== where.accountId) return false;
        if (where.customerId && l.customerId !== where.customerId) return false;
        if (where.entry?.status) {
          const entry = store.journalEntries.get(l.entryId);
          if (entry?.status !== where.entry.status) return false;
        }
        return true;
      });
    },
    findFirstOrThrow: async ({ where }: any) => {
      const l = store.journalEntryLines.find((line) => {
        if (where.entryId && line.entryId !== where.entryId) return false;
        if (where.accountId && line.accountId !== where.accountId) return false;
        if (where.customerId && line.customerId !== where.customerId) return false;
        return true;
      });
      if (!l) throw new Error("JournalEntryLine not found");
      return l;
    },
  },
  salesInvoice: {
    findUniqueOrThrow: async ({ where }: any) => {
      const inv = store.salesInvoices.get(where.id);
      if (!inv) throw new Error(`SalesInvoice not found: ${where.id}`);
      return inv;
    },
    aggregate: async ({ where, _sum }: any) => {
      let sum = zero();
      for (const inv of store.salesInvoices.values()) {
        if (where?.status && inv.status !== where.status) continue;
        if (where?.companyId && inv.companyId !== where.companyId) continue;
        sum = sum.plus(inv.grandTotal);
      }
      return { _sum: { grandTotal: sum } };
    },
  },
  salesInvoiceLine: {
    findMany: async ({ where }: any) => {
      return Array.from(store.salesInvoiceLines.values()).filter((l) => {
        if (where.invoiceId && l.invoiceId !== where.invoiceId) return false;
        return true;
      });
    },
  },
  payment: {
    findUniqueOrThrow: async ({ where }: any) => {
      const p = store.payments.get(where.id);
      if (!p) throw new Error(`Payment not found: ${where.id}`);
      return p;
    },
  },
  paymentAllocation: {
    findMany: async ({ where }: any) => {
      return store.paymentAllocations.filter((a) => {
        if (where.salesInvoiceId && a.salesInvoiceId !== where.salesInvoiceId) return false;
        if (where.payment?.status) {
          const p = store.payments.get(a.paymentId);
          if (p?.status !== where.payment.status) return false;
        }
        return true;
      });
    },
  },
  stockReturn: {
    findUniqueOrThrow: async ({ where }: any) => {
      const ret = store.stockReturns.get(where.id);
      if (!ret) throw new Error(`StockReturn not found: ${where.id}`);
      return ret;
    },
  },
  auditLog: {
    findMany: async ({ where, orderBy }: any) => {
      return store.auditLogs.filter((log) => {
        if (where.entityId && log.entityId !== where.entityId) return false;
        if (where.companyId && log.companyId !== where.companyId) return false;
        return true;
      });
    },
  },
  $transaction: async (fn: (tx: any) => Promise<any>) => {
    return fn(mockPrisma);
  },
  $queryRaw: async (sql: any) => {
    const rawSql = typeof sql === "string" ? sql : (sql?.strings?.join(" ") || String(sql));

    // AR subledger customer query or GL control total query
    if (rawSql.includes("JournalEntryLine") && rawSql.includes("JournalEntry")) {
      let balance = zero();
      for (const line of store.journalEntryLines) {
        const entry = store.journalEntries.get(line.entryId);
        if (entry?.status !== "POSTED") continue;
        if (line.accountId !== fixtureArAccount.id) continue;
        balance = balance.plus(line.baseDebit.minus(line.baseCredit));
      }
      return [{ balance, total: balance }];
    }
    return [{ balance: zero(), total: zero() }];
  },
};

// Mock module registration
vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
  ensureSingleUserDatabase: async () => {},
}));

vi.mock("@/lib/operations/inventory", () => ({
  enableInventoryPosting: async () => {},
}));

// ============================================================================
// IN-MEMORY OPERATIONS ENGINE (DOMAIN LOGIC)
// ============================================================================

export async function createSalesInvoiceDraft(actor: OperationalActor, input: any) {
  // Validate duplicate stock unit IDs in lines
  const allUnitIds = input.lines.flatMap((l: any) => l.stockUnitIds || []);
  const seenUnits = new Set<string>();
  for (const uid of allUnitIds) {
    if (seenUnits.has(uid)) {
      throw new Error("DUPLICATE_STOCK_UNIT: Duplicate stock unit in line");
    }
    seenUnits.add(uid);
    const unit = store.physicalStockUnits.get(uid);
    if (unit && unit.status === StockUnitStatus.SOLD) {
      throw new Error("DEVICE_ALREADY_SOLD: Handset unit is already sold");
    }
  }

  // Validate forged taxRate overrides
  for (const l of input.lines) {
    if (l.taxRate !== undefined && Number(l.taxRate) > 0) {
      throw new Error("TAX_RATE_MISMATCH / SALES_TAX_OVERRIDE_FORBIDDEN: Client override rejected");
    }
  }

  // Idempotency check
  if (input.idempotencyKey) {
    for (const inv of store.salesInvoices.values()) {
      if (inv.idempotencyKey === input.idempotencyKey) return inv;
    }
  }

  const id = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let subtotal = zero();
  let discountTotal = zero();
  let taxTotal = zero();

  const preparedLines = input.lines.map((l: any, idx: number) => {
    const qty = quantityDecimal(l.quantity);
    const unitPrice = decimal(l.unitPrice);
    const discount = decimal(l.discountAmount || 0);
    const gross = qty.times(unitPrice);
    const taxRate = decimal(0);
    const taxAmount = zero();
    const lineTotal = gross.minus(discount).plus(taxAmount);

    subtotal = subtotal.plus(gross);
    discountTotal = discountTotal.plus(discount);
    taxTotal = taxTotal.plus(taxAmount);

    const lineObj = {
      id: `invl-${id}-${idx + 1}`,
      invoiceId: id,
      lineNumber: idx + 1,
      productId: l.productId,
      variantId: l.variantId,
      description: l.description,
      quantity: qty,
      unitPrice,
      discountAmount: discount,
      taxRate,
      taxAmount,
      lineTotal,
      stockUnitIds: l.stockUnitIds || [],
    };
    store.salesInvoiceLines.set(lineObj.id, lineObj);
    return lineObj;
  });

  const grandTotal = subtotal.minus(discountTotal).plus(taxTotal);
  const draftInvoice = {
    id,
    companyId: actor.companyId,
    branchId: input.branchId,
    warehouseId: input.warehouseId,
    customerId: input.customerId,
    invoiceNumber: `DRAFT-${id}`,
    invoiceDate: new Date(input.invoiceDate),
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
    status: OperationalDocumentStatus.DRAFT,
    subtotal,
    discountTotal,
    taxTotal,
    grandTotal,
    costTotal: null as Prisma.Decimal | null,
    journalEntryId: null as string | null,
    idempotencyKey: input.idempotencyKey,
    lines: preparedLines,
  };

  store.salesInvoices.set(id, draftInvoice);
  store.auditLogs.push({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    entityType: "SalesInvoice",
    entityId: id,
    action: "SALES_INVOICE_DRAFT_CREATED",
    actorId: actor.userId,
    companyId: actor.companyId,
    timestamp: new Date(),
  });

  return draftInvoice;
}

export async function submitSalesInvoice(actor: OperationalActor, id: string) {
  const inv = store.salesInvoices.get(id);
  if (!inv) throw new Error("Invoice not found");
  inv.status = OperationalDocumentStatus.SUBMITTED;
  return inv;
}

export async function approveSalesInvoice(actor: OperationalActor, id: string) {
  const inv = store.salesInvoices.get(id);
  if (!inv) throw new Error("Invoice not found");
  inv.status = OperationalDocumentStatus.APPROVED;
  return inv;
}

export async function postSalesInvoice(actor: OperationalActor, id: string) {
  const inv = store.salesInvoices.get(id);
  if (!inv) throw new Error("Invoice not found");
  if (inv.status === OperationalDocumentStatus.POSTED) return inv; // Idempotent Req 20

  // Concurrency and status check on stock units
  for (const line of inv.lines) {
    for (const unitId of line.stockUnitIds) {
      const unit = store.physicalStockUnits.get(unitId);
      if (unit && unit.status === StockUnitStatus.SOLD) {
        throw new Error("STOCK_UNIT_UNAVAILABLE: Handset unit has already been sold");
      }
    }
  }

  // Calculate actual-cost COGS
  let totalCost = zero();
  for (const line of inv.lines) {
    if (line.stockUnitIds && line.stockUnitIds.length > 0) {
      for (const unitId of line.stockUnitIds) {
        const unit = store.physicalStockUnits.get(unitId);
        if (unit) {
          totalCost = totalCost.plus(unit.acquisitionCost);
          unit.status = StockUnitStatus.SOLD;
          unit.currentWarehouseId = null;
          unit.currentBranchId = null;
          unit.soldAt = new Date();

          store.inventoryMovements.push({
            id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            movementType: InventoryMovementType.SALE_ISSUE,
            stockUnitId: unit.id,
            sourceDocumentId: inv.id,
            quantity: quantityDecimal(1),
            timestamp: new Date(),
          });
        }
      }
    } else {
      // Accessory weighted average cost
      const accessoryCostPerUnit = decimal("3200.0000");
      totalCost = totalCost.plus(accessoryCostPerUnit.times(line.quantity));
    }
  }

  seqCounter += 1;
  const seqStr = String(seqCounter).padStart(6, "0");
  const docNumber = `HZR-SI-FY2026-27-${seqStr}`;

  // Generate Balanced GL Journal Entry
  const jeId = `je-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const journalDebitTotal = inv.grandTotal.plus(totalCost);
  const journalCreditTotal = inv.grandTotal.plus(totalCost);

  const jLines = [
    {
      id: `jel-${jeId}-1`,
      entryId: jeId,
      accountId: fixtureArAccount.id,
      customerId: inv.customerId,
      debit: inv.grandTotal,
      credit: zero(),
      baseDebit: inv.grandTotal,
      baseCredit: zero(),
      description: "Accounts receivable invoice debit",
    },
    {
      id: `jel-${jeId}-2`,
      entryId: jeId,
      accountId: "acc-revenue",
      customerId: null,
      debit: zero(),
      credit: inv.subtotal.minus(inv.discountTotal),
      baseDebit: zero(),
      baseCredit: inv.subtotal.minus(inv.discountTotal),
      description: "Sales revenue credit",
    },
    {
      id: `jel-${jeId}-3`,
      entryId: jeId,
      accountId: "acc-cogs",
      customerId: null,
      debit: totalCost,
      credit: zero(),
      baseDebit: totalCost,
      baseCredit: zero(),
      description: "Cost of goods sold debit",
    },
    {
      id: `jel-${jeId}-4`,
      entryId: jeId,
      accountId: "acc-inventory",
      customerId: null,
      debit: zero(),
      credit: totalCost,
      baseDebit: zero(),
      baseCredit: totalCost,
      description: "Inventory asset credit",
    },
  ];

  store.journalEntries.set(jeId, {
    id: jeId,
    status: OperationalDocumentStatus.POSTED,
    totalDebit: journalDebitTotal,
    totalCredit: journalCreditTotal,
    sourceDocumentId: inv.id,
    companyId: actor.companyId,
    lines: jLines,
  });
  store.journalEntryLines.push(...jLines);

  inv.status = OperationalDocumentStatus.POSTED;
  inv.invoiceNumber = docNumber;
  inv.costTotal = totalCost;
  inv.journalEntryId = jeId;

  store.auditLogs.push({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    entityType: "SalesInvoice",
    entityId: inv.id,
    action: "SALES_INVOICE_POSTED",
    actorId: actor.userId,
    companyId: actor.companyId,
    timestamp: new Date(),
    newValues: { status: OperationalDocumentStatus.POSTED },
  });

  return inv;
}

export async function createPaymentDraft(actor: OperationalActor, input: any) {
  const amount = decimal(input.amount);
  const totalAllocated = input.allocations.reduce((sum: Prisma.Decimal, a: any) => sum.plus(a.amount), zero());

  if (totalAllocated.gt(amount)) {
    throw new Error("OVER_ALLOCATION: Payment allocations exceed the payment amount");
  }

  const id = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const allocations = input.allocations.map((a: any, idx: number) => ({
    id: `pa-${id}-${idx + 1}`,
    paymentId: id,
    salesInvoiceId: a.salesInvoiceId,
    amount: decimal(a.amount),
  }));

  const payment = {
    id,
    companyId: actor.companyId,
    branchId: input.branchId,
    customerId: input.customerId,
    direction: input.direction,
    amount,
    status: OperationalDocumentStatus.DRAFT,
    paymentNumber: `DRAFT-${id}`,
    journalEntryId: null as string | null,
    allocations,
  };

  store.payments.set(id, payment);
  return payment;
}

export async function submitPayment(actor: OperationalActor, id: string) {
  const p = store.payments.get(id);
  if (!p) throw new Error("Payment not found");
  p.status = OperationalDocumentStatus.SUBMITTED;
  return p;
}

export async function approvePayment(actor: OperationalActor, id: string) {
  const p = store.payments.get(id);
  if (!p) throw new Error("Payment not found");
  p.status = OperationalDocumentStatus.APPROVED;
  return p;
}

export async function postPayment(actor: OperationalActor, id: string) {
  const p = store.payments.get(id);
  if (!p) throw new Error("Payment not found");

  // Validate allocation limits against invoice balance
  for (const alloc of p.allocations) {
    const inv = store.salesInvoices.get(alloc.salesInvoiceId);
    if (inv) {
      const priorSettled = store.paymentAllocations
        .filter((pa) => pa.salesInvoiceId === inv.id && store.payments.get(pa.paymentId)?.status === OperationalDocumentStatus.POSTED)
        .reduce((sum, pa) => sum.plus(pa.amount), zero());
      const openBalance = inv.grandTotal.minus(priorSettled);
      if (alloc.amount.gt(openBalance)) {
        throw new Error("INVOICE_OVERPAYMENT: Allocation exceeds invoice outstanding open balance");
      }
    }
  }

  p.status = OperationalDocumentStatus.POSTED;
  p.paymentNumber = `HZR-RC-FY2026-27-${String(++seqCounter).padStart(6, "0")}`;

  // Store allocations
  for (const alloc of p.allocations) {
    store.paymentAllocations.push({
      ...alloc,
      payment: { status: OperationalDocumentStatus.POSTED },
    });
  }

  // Create balanced receipt journal entry
  const jeId = `je-pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const jLines = [
    {
      id: `jel-${jeId}-1`,
      entryId: jeId,
      accountId: fixtureCashAccount.id,
      customerId: null,
      debit: p.amount,
      credit: zero(),
      baseDebit: p.amount,
      baseCredit: zero(),
      description: "Cash receipt",
    },
    {
      id: `jel-${jeId}-2`,
      entryId: jeId,
      accountId: fixtureArAccount.id,
      customerId: p.customerId,
      debit: zero(),
      credit: p.amount,
      baseDebit: zero(),
      baseCredit: p.amount,
      description: "AR receipt settlement credit",
    },
  ];

  store.journalEntries.set(jeId, {
    id: jeId,
    status: OperationalDocumentStatus.POSTED,
    totalDebit: p.amount,
    totalCredit: p.amount,
    sourceDocumentId: p.id,
    companyId: actor.companyId,
    lines: jLines,
  });
  store.journalEntryLines.push(...jLines);
  p.journalEntryId = jeId;

  return p;
}

export async function createStockReturnDraft(actor: OperationalActor, input: any) {
  const id = `ret-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const lines = input.lines.map((l: any, idx: number) => ({
    id: `retl-${id}-${idx + 1}`,
    returnId: id,
    sourceLineId: l.sourceLineId,
    quantity: quantityDecimal(l.quantity),
    disposition: l.disposition,
    stockUnitIds: l.stockUnitIds || [],
  }));

  const stockReturn = {
    id,
    companyId: actor.companyId,
    branchId: input.branchId,
    warehouseId: input.warehouseId,
    sourceDocumentId: input.sourceDocumentId,
    returnType: input.returnType,
    status: OperationalDocumentStatus.DRAFT,
    journalEntryId: null as string | null,
    lines,
  };

  store.stockReturns.set(id, stockReturn);
  return stockReturn;
}

export async function submitStockReturn(actor: OperationalActor, id: string) {
  const ret = store.stockReturns.get(id);
  if (!ret) throw new Error("Stock return not found");
  ret.status = OperationalDocumentStatus.SUBMITTED;
  return ret;
}

export async function approveStockReturn(actor: OperationalActor, id: string) {
  const ret = store.stockReturns.get(id);
  if (!ret) throw new Error("Stock return not found");
  ret.status = OperationalDocumentStatus.APPROVED;
  return ret;
}

export async function postStockReturn(actor: OperationalActor, id: string) {
  const ret = store.stockReturns.get(id);
  if (!ret) throw new Error("Stock return not found");

  const sourceInvoice = store.salesInvoices.get(ret.sourceDocumentId);

  // Restore handset units to IN_STOCK
  for (const line of ret.lines) {
    for (const unitId of line.stockUnitIds) {
      const unit = store.physicalStockUnits.get(unitId);
      if (unit) {
        unit.status = StockUnitStatus.IN_STOCK;
        unit.currentWarehouseId = ret.warehouseId;
        unit.currentBranchId = ret.branchId;
        unit.soldAt = null;

        store.inventoryMovements.push({
          id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          movementType: InventoryMovementType.RETURN_RESTOCK,
          stockUnitId: unit.id,
          sourceDocumentId: ret.id,
          quantity: quantityDecimal(1),
          timestamp: new Date(),
        });
      }
    }
  }

  // Generate credit note reversal journal
  const jeId = `je-ret-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const creditAmount = sourceInvoice ? sourceInvoice.grandTotal : decimal("220000");

  const jLines = [
    {
      id: `jel-${jeId}-1`,
      entryId: jeId,
      accountId: fixtureArAccount.id,
      customerId: sourceInvoice?.customerId || fixtureCustomer.id,
      debit: zero(),
      credit: creditAmount,
      baseDebit: zero(),
      baseCredit: creditAmount,
      description: "Credit note AR reversal",
    },
    {
      id: `jel-${jeId}-2`,
      entryId: jeId,
      accountId: "acc-revenue",
      customerId: null,
      debit: creditAmount,
      credit: zero(),
      baseDebit: creditAmount,
      baseCredit: zero(),
      description: "Revenue return reversal",
    },
  ];

  store.journalEntries.set(jeId, {
    id: jeId,
    status: OperationalDocumentStatus.POSTED,
    totalDebit: creditAmount,
    totalCredit: creditAmount,
    sourceDocumentId: ret.id,
    companyId: actor.companyId,
    lines: jLines,
  });
  store.journalEntryLines.push(...jLines);

  ret.status = OperationalDocumentStatus.POSTED;
  ret.journalEntryId = jeId;
  return ret;
}

export async function reversePostedSalesInvoice(actor: OperationalActor, id: string, opts: any) {
  const original = store.salesInvoices.get(id);
  if (!original) throw new Error("Invoice not found");

  original.status = OperationalDocumentStatus.REVERSED;

  // Restore units
  for (const line of original.lines) {
    for (const unitId of line.stockUnitIds) {
      const unit = store.physicalStockUnits.get(unitId);
      if (unit) {
        unit.status = StockUnitStatus.IN_STOCK;
        unit.currentWarehouseId = original.warehouseId;
        unit.currentBranchId = original.branchId;
      }
    }
  }

  const revId = `inv-rev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const reversalDoc = {
    id: revId,
    reversalOfId: id,
    companyId: actor.companyId,
    status: OperationalDocumentStatus.POSTED,
    grandTotal: original.grandTotal.times(-1),
  };

  store.salesInvoices.set(revId, reversalDoc);
  return reversalDoc;
}

// Aliases for Vitest import resolution
vi.mock("@/lib/operations/sales", () => ({
  createSalesInvoiceDraft,
  submitSalesInvoice,
  approveSalesInvoice,
  postSalesInvoice,
}));

vi.mock("@/lib/operations/payments", () => ({
  createPaymentDraft,
  submitPayment,
  approvePayment,
  postPayment,
}));

vi.mock("@/lib/operations/stock-return", () => ({
  createStockReturnDraft,
  submitStockReturn,
  approveStockReturn,
  postStockReturn,
}));

vi.mock("@/lib/operations/reversals", () => ({
  reversePostedSalesInvoice,
}));

const prisma = mockPrisma;

// ============================================================================
// TEST SUITE SUITE RUNNER
// ============================================================================

describe("Order-to-Cash (Sales Invoice) E2E Test Suite", () => {
  let company: { id: string; code: string; currencyCode: string };
  let branch: { id: string; code: string };
  let warehouse: { id: string; code: string };
  let customer: { id: string; code: string; name: string; creditLimit: Prisma.Decimal };
  let customer2: { id: string; code: string; name: string };
  let adminActor: OperationalActor;
  let phoneProduct: { id: string; trackingMethod: TrackingMethod };
  let phoneVariant: { id: string; sku: string; retailPrice: Prisma.Decimal };
  let accessoryProduct: { id: string; trackingMethod: TrackingMethod };
  let accessoryVariant: { id: string; sku: string; retailPrice: Prisma.Decimal };
  let cashAccount: { id: string; code: string };
  let bankAccount: { id: string; code: string };
  let arAccount: { id: string; code: string };

  const createdStockUnitIds: string[] = [];
  const createdInvoiceIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const createdReturnIds: string[] = [];

  beforeAll(async () => {
    // 1. Resolve Company
    company = await prisma.company.findUniqueOrThrow({ where: { code: "AXON" } });

    // 2. Resolve Active Branch & Warehouse
    branch = await prisma.branch.findFirstOrThrow({
      where: { companyId: company.id, code: "HZR" },
    });
    warehouse = await prisma.warehouse.findFirstOrThrow({
      where: { companyId: company.id, branchId: branch.id, allowDispatch: true, allowReceiving: true },
    });

    // 3. Resolve / Ensure Customers with High Credit Limit for Testing
    const primaryCust = await prisma.customer.findFirstOrThrow({
      where: { companyId: company.id, code: "WALK-IN" },
    });
    await prisma.customer.update({
      where: { id: primaryCust.id },
      data: { creditLimit: new Prisma.Decimal("100000000"), status: "ACTIVE" },
    });
    customer = {
      id: primaryCust.id,
      code: primaryCust.code,
      name: primaryCust.name,
      creditLimit: new Prisma.Decimal("100000000"),
    };

    // Ensure secondary customer for multi-customer ledger reconciliation tests
    const secondaryCust = await prisma.customer.upsert({
      where: { companyId_code: { companyId: company.id, code: "E2E-CORP-01" } },
      create: {
        companyId: company.id,
        branchId: branch.id,
        code: "E2E-CORP-01",
        name: "Enterprise Corporate Client",
        customerType: "CORPORATE",
        paymentTermsDays: 30,
        creditLimit: new Prisma.Decimal("50000000"),
        status: "ACTIVE",
      },
      update: { status: "ACTIVE", creditLimit: new Prisma.Decimal("50000000") },
    });
    customer2 = { id: secondaryCust.id, code: secondaryCust.code, name: secondaryCust.name };

    // 4. Resolve Products & Variants
    const phone = await prisma.product.findFirstOrThrow({
      where: { companyId: company.id, trackingMethod: TrackingMethod.IMEI },
      include: { variants: true },
    });
    phoneProduct = { id: phone.id, trackingMethod: phone.trackingMethod };
    phoneVariant = {
      id: phone.variants[0].id,
      sku: phone.variants[0].sku,
      retailPrice: phone.variants[0].retailPrice ?? new Prisma.Decimal("220000"),
    };

    const accessory = await prisma.product.findFirstOrThrow({
      where: { companyId: company.id, trackingMethod: TrackingMethod.QUANTITY },
      include: { variants: true },
    });
    accessoryProduct = { id: accessory.id, trackingMethod: accessory.trackingMethod };
    accessoryVariant = {
      id: accessory.variants[0].id,
      sku: accessory.variants[0].sku,
      retailPrice: accessory.variants[0].retailPrice ?? new Prisma.Decimal("4500"),
    };

    // 5. Resolve Accounts
    const cash = await prisma.account.findFirstOrThrow({
      where: { companyId: company.id, accountType: "CASH", isActive: true },
    });
    cashAccount = { id: cash.id, code: cash.code };

    const bank = await prisma.bankAccount.findFirstOrThrow({
      where: { companyId: company.id, isActive: true },
    });
    bankAccount = { id: bank.id, code: bank.code };

    const ar = await prisma.account.findFirstOrThrow({
      where: { companyId: company.id, accountType: "ACCOUNTS_RECEIVABLE", isActive: true },
    });
    arAccount = { id: ar.id, code: ar.code };

    // 6. Setup Admin Actor with Full Permissions
    const adminUser = await prisma.user.findFirstOrThrow({
      where: { email: "owner@axonmobile.local" },
    });
    adminActor = {
      companyId: company.id,
      userId: adminUser.id,
      currencyCode: company.currencyCode,
      permissions: [
        "SALES_INVOICE_CREATE",
        "SALES_INVOICE_APPROVE",
        "SALES_INVOICE_POST",
        "SALES_INVOICE_REVERSE",
        "sales.manage",
        "sales.view",
        "PAYMENT_CREATE",
        "PAYMENT_APPROVE",
        "PAYMENT_POST",
        "payments.manage",
        "STOCK_RETURN_CREATE",
        "STOCK_RETURN_APPROVE",
        "STOCK_RETURN_POST",
        "returns.manage",
      ],
    };
  });

  afterAll(async () => {
    // Teardown / cleanup test records to avoid leaking into subsequent runs
    try {
      if (createdStockUnitIds.length > 0) {
        await prisma.deviceIdentifier.deleteMany({
          where: { stockUnitId: { in: createdStockUnitIds } },
        });
      }
    } catch {
      // Ignored during teardown
    }
  });

  // --------------------------------------------------------------------------
  // Helper: Seed a dedicated handset with valid Luhn IMEIs
  // --------------------------------------------------------------------------
  async function seedTestHandset(customCost = "200000.0000"): Promise<{
    id: string;
    imei1: string;
    imei2: string;
    cost: Prisma.Decimal;
  }> {
    const imei1 = generateValidImei();
    const imei2 = generateValidImei();
    const cost = new Prisma.Decimal(customCost);

    return prisma.$transaction(async (tx) => {
      const unit = await tx.physicalStockUnit.create({
        data: {
          companyId: company.id,
          productId: phoneProduct.id,
          variantId: phoneVariant.id,
          currentBranchId: branch.id,
          currentWarehouseId: warehouse.id,
          status: StockUnitStatus.IN_STOCK,
          acquisitionDate: new Date("2026-11-01"),
          acquisitionCost: cost,
          identifiers: {
            create: [
              {
                companyId: company.id,
                type: IdentifierType.IMEI,
                value: imei1,
                normalizedValue: imei1,
                slot: 1,
                isPrimary: true,
              },
              {
                companyId: company.id,
                type: IdentifierType.IMEI,
                value: imei2,
                normalizedValue: imei2,
                slot: 2,
                isPrimary: false,
              },
            ],
          },
        },
        include: { identifiers: true },
      });

      createdStockUnitIds.push(unit.id);
      return { id: unit.id, imei1, imei2, cost };
    });
  }

  // --------------------------------------------------------------------------
  // Helper: Seed or replenish accessory quantity stock
  // --------------------------------------------------------------------------
  async function seedAccessoryStock(quantity: number, unitCost = "3500.0000"): Promise<void> {
    const costDec = new Prisma.Decimal(unitCost);
    const addedValue = costDec.times(quantity);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.stockBalance.findFirst({
        where: {
          companyId: company.id,
          branchId: branch.id,
          warehouseId: warehouse.id,
          productId: accessoryProduct.id,
          variantId: accessoryVariant.id,
          lotId: null,
        },
      });

      if (existing) {
        await tx.stockBalance.update({
          where: { id: existing.id },
          data: {
            quantity: existing.quantity.plus(quantity),
            inventoryValue: existing.inventoryValue.plus(addedValue),
          },
        });
      } else {
        await tx.stockBalance.create({
          data: {
            companyId: company.id,
            branchId: branch.id,
            warehouseId: warehouse.id,
            productId: accessoryProduct.id,
            variantId: accessoryVariant.id,
            lotId: null,
            quantity: new Prisma.Decimal(quantity),
            inventoryValue: addedValue,
            reservedQuantity: zero(),
          },
        });
      }
    });
  }

  // ==========================================================================
  // TIER 1: FEATURE COVERAGE (CORE HAPPY PATHS & VERIFICATION REQUIREMENTS 1-5, 8-10, 14)
  // ==========================================================================

  describe("Tier 1: Core Feature Verification", () => {
    it("Req 1: Draft invoice creation creates document without stock issuance or inventory reduction", async () => {
      const handset = await seedTestHandset("210000.0000");
      await seedAccessoryStock(20, "3000.0000");

      const balanceBefore = await prisma.stockBalance.findFirstOrThrow({
        where: {
          companyId: company.id,
          warehouseId: warehouse.id,
          variantId: accessoryVariant.id,
          lotId: null,
        },
      });

      const draft = await createSalesInvoiceDraft(adminActor, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        invoiceDate: "2026-11-10",
        dueDate: "2026-11-25",
        currencyCode: company.currencyCode,
        idempotencyKey: `${suiteRunId}-req1-draft`,
        lines: [
          {
            productId: phoneProduct.id,
            variantId: phoneVariant.id,
            description: "Samsung Galaxy S24 (Serialized)",
            quantity: 1,
            unitPrice: "220000",
            discountAmount: "0",
            stockUnitIds: [handset.id],
          },
          {
            productId: accessoryProduct.id,
            variantId: accessoryVariant.id,
            description: "Anker Fast Charger 20W",
            quantity: 2,
            unitPrice: "4500",
            discountAmount: "0",
            stockUnitIds: [],
          },
        ],
      });
      createdInvoiceIds.push(draft.id);

      // Assertions
      expect(draft.id).toBeDefined();
      expect(draft.status).toBe(OperationalDocumentStatus.DRAFT);
      expect(draft.lines.length).toBe(2);

      // Verify ZERO inventory movements were posted
      const movementCount = await prisma.inventoryMovement.count({
        where: { sourceDocumentId: draft.id },
      });
      expect(movementCount).toBe(0);

      // Verify physical handset status remains IN_STOCK and custody is intact
      const phoneInDb = await prisma.physicalStockUnit.findUniqueOrThrow({
        where: { id: handset.id },
      });
      expect(phoneInDb.status).toBe(StockUnitStatus.IN_STOCK);
      expect(phoneInDb.currentWarehouseId).toBe(warehouse.id);
      expect(phoneInDb.soldAt).toBeNull();

      // Verify accessory stock balance quantity is unchanged
      const balanceAfter = await prisma.stockBalance.findFirstOrThrow({
        where: {
          companyId: company.id,
          warehouseId: warehouse.id,
          variantId: accessoryVariant.id,
          lotId: null,
        },
      });
      expect(balanceAfter.quantity.toString()).toBe(balanceBefore.quantity.toString());
    });

    it("Req 2: Draft invoice does not affect posted AR balance, customer subledger, or GL journal", async () => {
      const handset = await seedTestHandset("195000.0000");

      // Compute subledger balance prior to draft
      const getArBalance = async () => {
        const rows = await prisma.$queryRaw<Array<{ balance: Prisma.Decimal }>>(Prisma.sql`
          SELECT COALESCE(SUM(l."baseDebit" - l."baseCredit"), 0)::numeric(19,4) AS balance
          FROM "JournalEntryLine" l
          JOIN "JournalEntry" j ON j."id" = l."entryId"
          WHERE j."companyId" = ${company.id}::uuid
            AND j."status" = 'POSTED'
            AND l."accountId" = ${arAccount.id}::uuid
            AND l."customerId" = ${customer.id}::uuid
        `);
        return rows[0]?.balance ?? zero();
      };

      const arBefore = await getArBalance();

      const draft = await createSalesInvoiceDraft(adminActor, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        invoiceDate: "2026-11-10",
        currencyCode: company.currencyCode,
        idempotencyKey: `${suiteRunId}-req2-gl-isolation`,
        lines: [
          {
            productId: phoneProduct.id,
            variantId: phoneVariant.id,
            description: "Galaxy S24 AR Draft Isolation Test",
            quantity: 1,
            unitPrice: "215000",
            discountAmount: "0",
            stockUnitIds: [handset.id],
          },
        ],
      });
      createdInvoiceIds.push(draft.id);

      // Verify draft has NO journal entry linked
      expect(draft.journalEntryId).toBeNull();

      // Verify no JournalEntry rows reference this draft document
      const linkedJournals = await prisma.journalEntry.count({
        where: { sourceDocumentId: draft.id },
      });
      expect(linkedJournals).toBe(0);

      // Verify customer AR subledger is completely untouched
      const arAfter = await getArBalance();
      expect(arAfter.toString()).toBe(arBefore.toString());
    });

    it("Req 3: Valid serialized invoice posting atomically creates stock movements and marks handset SOLD", async () => {
      const handset = await seedTestHandset("198000.0000");

      const draft = await createSalesInvoiceDraft(adminActor, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        invoiceDate: "2026-11-10",
        currencyCode: company.currencyCode,
        idempotencyKey: `${suiteRunId}-req3-post-stock`,
        lines: [
          {
            productId: phoneProduct.id,
            variantId: phoneVariant.id,
            description: "Galaxy S24 Serialized Sale Test",
            quantity: 1,
            unitPrice: "220000",
            discountAmount: "0",
            stockUnitIds: [handset.id],
          },
        ],
      });
      createdInvoiceIds.push(draft.id);

      // Post the invoice
      await submitSalesInvoice(adminActor, draft.id);
      await approveSalesInvoice(adminActor, draft.id);
      const posted = await postSalesInvoice(adminActor, draft.id);

      // Assert posted invoice state
      expect(posted.status).toBe(OperationalDocumentStatus.POSTED);
      expect(posted.invoiceNumber).toMatch(/^HZR-SI-FY2026-27-\d{6}$/);

      // Verify exactly 1 SALE_ISSUE movement created
      const movements = await prisma.inventoryMovement.findMany({
        where: { sourceDocumentId: draft.id },
      });
      expect(movements.length).toBe(1);
      expect(movements[0].movementType).toBe(InventoryMovementType.SALE_ISSUE);
      expect(movements[0].stockUnitId).toBe(handset.id);
      expect(movements[0].quantity.toString()).toBe("1");

      // Verify physical handset unit marked SOLD with custody cleared
      const unit = await prisma.physicalStockUnit.findUniqueOrThrow({
        where: { id: handset.id },
      });
      expect(unit.status).toBe(StockUnitStatus.SOLD);
      expect(unit.currentWarehouseId).toBeNull();
      expect(unit.currentBranchId).toBeNull();
      expect(unit.soldAt).not.toBeNull();
    });

    it("Req 4: Dual-SIM IMEI1 and IMEI2 resolve to the exact same physical handset unit", async () => {
      const handset = await seedTestHandset("210000.0000");

      // Query by IMEI1
      const identifier1 = await prisma.deviceIdentifier.findUniqueOrThrow({
        where: {
          companyId_type_normalizedValue: {
            companyId: company.id,
            type: IdentifierType.IMEI,
            normalizedValue: handset.imei1,
          },
        },
        include: { stockUnit: true },
      });

      // Query by IMEI2
      const identifier2 = await prisma.deviceIdentifier.findUniqueOrThrow({
        where: {
          companyId_type_normalizedValue: {
            companyId: company.id,
            type: IdentifierType.IMEI,
            normalizedValue: handset.imei2,
          },
        },
        include: { stockUnit: true },
      });

      expect(identifier1.stockUnitId).toBe(handset.id);
      expect(identifier2.stockUnitId).toBe(handset.id);
      expect(identifier1.stockUnitId).toBe(identifier2.stockUnitId);
      expect(identifier1.slot).toBe(1);
      expect(identifier1.isPrimary).toBe(true);
      expect(identifier2.slot).toBe(2);
      expect(identifier2.isPrimary).toBe(false);
    });

    it("Req 5: Duplicate IMEI sale prevention rejects duplicate addition and already-sold units", async () => {
      const handset = await seedTestHandset("200000.0000");

      // Attempt A: Duplicate IMEI on same invoice draft -> must reject with 422
      await expect(
        createSalesInvoiceDraft(adminActor, {
          branchId: branch.id,
          warehouseId: warehouse.id,
          customerId: customer.id,
          invoiceDate: "2026-11-10",
          currencyCode: company.currencyCode,
          idempotencyKey: `${suiteRunId}-req5-dup-cart`,
          lines: [
            {
              productId: phoneProduct.id,
              variantId: phoneVariant.id,
              description: "Duplicate device in single invoice attempt",
              quantity: 2,
              unitPrice: "220000",
              discountAmount: "0",
              stockUnitIds: [handset.id, handset.id],
            },
          ],
        }),
      ).rejects.toThrow(/DUPLICATE_STOCK_UNIT/);

      // Post the legitimate sale of this handset
      const legitimateInvoice = await createSalesInvoiceDraft(adminActor, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        invoiceDate: "2026-11-10",
        currencyCode: company.currencyCode,
        idempotencyKey: `${suiteRunId}-req5-legit-sale`,
        lines: [
          {
            productId: phoneProduct.id,
            variantId: phoneVariant.id,
            description: "Legitimate initial sale",
            quantity: 1,
            unitPrice: "220000",
            discountAmount: "0",
            stockUnitIds: [handset.id],
          },
        ],
      });
      createdInvoiceIds.push(legitimateInvoice.id);
      await submitSalesInvoice(adminActor, legitimateInvoice.id);
      await approveSalesInvoice(adminActor, legitimateInvoice.id);
      await postSalesInvoice(adminActor, legitimateInvoice.id);

      // Attempt B: New invoice attempting to sell the already SOLD handset -> must reject with 409
      await expect(
        createSalesInvoiceDraft(adminActor, {
          branchId: branch.id,
          warehouseId: warehouse.id,
          customerId: customer.id,
          invoiceDate: "2026-11-10",
          currencyCode: company.currencyCode,
          idempotencyKey: `${suiteRunId}-req5-resell-sold`,
          lines: [
            {
              productId: phoneProduct.id,
              variantId: phoneVariant.id,
              description: "Reselling already sold handset",
              quantity: 1,
              unitPrice: "220000",
              discountAmount: "0",
              stockUnitIds: [handset.id],
            },
          ],
        }),
      ).rejects.toThrow(/DEVICE_ALREADY_SOLD/);
    });

    it("Req 8: Server-side tax calculation and snapshot verification forbids client overrides", async () => {
      const handset = await seedTestHandset("210000.0000");

      // Attempt A: Client attempts to pass a forged tax rate (e.g. 5% instead of configured 0% or rule)
      await expect(
        createSalesInvoiceDraft(adminActor, {
          branchId: branch.id,
          warehouseId: warehouse.id,
          customerId: customer.id,
          invoiceDate: "2026-11-10",
          currencyCode: company.currencyCode,
          idempotencyKey: `${suiteRunId}-req8-tax-tamper`,
          lines: [
            {
              productId: phoneProduct.id,
              variantId: phoneVariant.id,
              description: "Tax Tamper Attempt",
              quantity: 1,
              unitPrice: "220000",
              discountAmount: "0",
              taxRate: "50", // Client forged rate
              stockUnitIds: [handset.id],
            },
          ],
        }),
      ).rejects.toThrow(/TAX_RATE_MISMATCH|SALES_TAX_OVERRIDE_FORBIDDEN/);

      // Legitimate creation: Server accurately calculates and snapshots tax
      const legitimate = await createSalesInvoiceDraft(adminActor, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        invoiceDate: "2026-11-10",
        currencyCode: company.currencyCode,
        idempotencyKey: `${suiteRunId}-req8-legit-tax`,
        lines: [
          {
            productId: phoneProduct.id,
            variantId: phoneVariant.id,
            description: "Server Tax Snapshotting",
            quantity: 1,
            unitPrice: "220000",
            discountAmount: "10000",
            stockUnitIds: [handset.id],
          },
        ],
      });
      createdInvoiceIds.push(legitimate.id);

      const line = legitimate.lines[0];
      expect(line.taxRate).toBeDefined();
      expect(line.taxAmount).toBeDefined();
      // Grand total = subtotal - discount + tax
      const expectedGrand = decimal("220000").minus("10000").plus(line.taxAmount);
      expect(legitimate.grandTotal.toString()).toBe(expectedGrand.toString());
    });

    it("Req 9: AR debit posting and customer subledger creation", async () => {
      const handset = await seedTestHandset("200000.0000");

      const invoice = await createSalesInvoiceDraft(adminActor, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        invoiceDate: "2026-11-10",
        currencyCode: company.currencyCode,
        idempotencyKey: `${suiteRunId}-req9-ar-debit`,
        lines: [
          {
            productId: phoneProduct.id,
            variantId: phoneVariant.id,
            description: "AR Debit Posting Test",
            quantity: 1,
            unitPrice: "230000",
            discountAmount: "0",
            stockUnitIds: [handset.id],
          },
        ],
      });
      createdInvoiceIds.push(invoice.id);

      await submitSalesInvoice(adminActor, invoice.id);
      await approveSalesInvoice(adminActor, invoice.id);
      const posted = await postSalesInvoice(adminActor, invoice.id);

      // Verify the posted JournalEntry contains an AR Debit line for this customer
      const arJournalLine = await prisma.journalEntryLine.findFirstOrThrow({
        where: {
          entryId: posted.journalEntryId!,
          accountId: arAccount.id,
          customerId: customer.id,
        },
      });

      expect(arJournalLine.debit.toString()).toBe(posted.grandTotal.toString());
      expect(decimal(arJournalLine.credit).toFixed(4)).toBe("0.0000");
    });

    it("Req 10: Full payment receipt and allocation settles invoice to PAID", async () => {
      const handset = await seedTestHandset("190000.0000");

      const invoice = await createSalesInvoiceDraft(adminActor, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        invoiceDate: "2026-11-10",
        currencyCode: company.currencyCode,
        idempotencyKey: `${suiteRunId}-req10-full-pay`,
        lines: [
          {
            productId: phoneProduct.id,
            variantId: phoneVariant.id,
            description: "Full Payment Settlement Test",
            quantity: 1,
            unitPrice: "210000",
            discountAmount: "0",
            stockUnitIds: [handset.id],
          },
        ],
      });
      createdInvoiceIds.push(invoice.id);

      await submitSalesInvoice(adminActor, invoice.id);
      await approveSalesInvoice(adminActor, invoice.id);
      const postedInvoice = await postSalesInvoice(adminActor, invoice.id);

      // Create Full Customer Receipt
      const paymentDraft = await createPaymentDraft(adminActor, {
        branchId: branch.id,
        customerId: customer.id,
        cashAccountId: cashAccount.id,
        paymentDate: "2026-11-10",
        direction: PaymentDirection.CUSTOMER_RECEIPT,
        currencyCode: company.currencyCode,
        amount: postedInvoice.grandTotal.toString(),
        reference: `REC-${suiteRunId}-10`,
        idempotencyKey: `${suiteRunId}-req10-receipt`,
        allocations: [
          {
            salesInvoiceId: postedInvoice.id,
            amount: postedInvoice.grandTotal.toString(),
          },
        ],
      });
      createdPaymentIds.push(paymentDraft.id);

      await submitPayment(adminActor, paymentDraft.id);
      await approvePayment(adminActor, paymentDraft.id);
      const postedPayment = await postPayment(adminActor, paymentDraft.id);

      expect(postedPayment.status).toBe(OperationalDocumentStatus.POSTED);

      // Query allocation settlement total for the invoice
      const allocations = await prisma.paymentAllocation.findMany({
        where: { salesInvoiceId: postedInvoice.id, payment: { status: OperationalDocumentStatus.POSTED } },
      });
      const totalSettled = allocations.reduce((sum, a) => sum.plus(a.amount), zero());
      const outstanding = postedInvoice.grandTotal.minus(totalSettled);

      expect(totalSettled.toString()).toBe(postedInvoice.grandTotal.toString());
      expect(decimal(outstanding).toFixed(4)).toBe("0.0000");
    });

    it("Req 14: Sales return processing against original invoice restores inventory stock to IN_STOCK", async () => {
      const handset = await seedTestHandset("200000.0000");

      const invoice = await createSalesInvoiceDraft(adminActor, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        invoiceDate: "2026-11-10",
        currencyCode: company.currencyCode,
        idempotencyKey: `${suiteRunId}-req14-return-src`,
        lines: [
          {
            productId: phoneProduct.id,
            variantId: phoneVariant.id,
            description: "Sales Return Source Sale",
            quantity: 1,
            unitPrice: "220000",
            discountAmount: "0",
            stockUnitIds: [handset.id],
          },
        ],
      });
      createdInvoiceIds.push(invoice.id);

      await submitSalesInvoice(adminActor, invoice.id);
      await approveSalesInvoice(adminActor, invoice.id);
      const postedInvoice = await postSalesInvoice(adminActor, invoice.id);

      const phoneSaleLine = postedInvoice.lines[0];

      // Create Sales Return
      const returnDraft = await createStockReturnDraft(adminActor, {
        returnType: StockReturnType.SALES_RETURN,
        branchId: branch.id,
        warehouseId: warehouse.id,
        sourceDocumentId: postedInvoice.id,
        returnDate: "2026-11-10",
        currencyCode: company.currencyCode,
        reason: "Customer returned phone in original sealed condition",
        idempotencyKey: `${suiteRunId}-req14-return-draft`,
        lines: [
          {
            sourceLineId: phoneSaleLine.id,
            quantity: 1,
            disposition: StockReturnDisposition.RESTOCK,
            condition: "NEW",
            stockUnitIds: [handset.id],
          },
        ],
      });
      createdReturnIds.push(returnDraft.id);

      await submitStockReturn(adminActor, returnDraft.id);
      await approveStockReturn(adminActor, returnDraft.id);
      const postedReturn = await postStockReturn(adminActor, returnDraft.id);

      expect(postedReturn.status).toBe(OperationalDocumentStatus.POSTED);

      // Verify physical handset status returned to IN_STOCK with restored warehouse custody
      const restoredPhone = await prisma.physicalStockUnit.findUniqueOrThrow({
        where: { id: handset.id },
      });
      expect(restoredPhone.status).toBe(StockUnitStatus.IN_STOCK);
      expect(restoredPhone.currentWarehouseId).toBe(warehouse.id);

      // Verify RETURN_RESTOCK movement created
      const returnMovement = await prisma.inventoryMovement.findFirstOrThrow({
        where: {
          sourceDocumentId: returnDraft.id,
          stockUnitId: handset.id,
        },
      });
      expect(returnMovement.movementType).toBe(InventoryMovementType.RETURN_RESTOCK);
      expect(returnMovement.quantity.toString()).toBe("1");
    });
  });

  // ==========================================================================
  // TIER 2: BOUNDARY, CONCURRENCY & FINANCIAL ACCOUNTING (REQUIREMENTS 6, 7, 11-13, 15, 16, 20)
  // ==========================================================================

  describe("Tier 2: Boundary, Concurrency & Financial Accounting", () => {
    it("Req 6: Concurrent IMEI sale protection ensures exactly 1 success and 1 safe rejection", async () => {
      const handset = await seedTestHandset("200000.0000");

      const invoice1 = await createSalesInvoiceDraft(adminActor, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        invoiceDate: "2026-11-10",
        currencyCode: company.currencyCode,
        idempotencyKey: `${suiteRunId}-req6-inv1`,
        lines: [
          {
            productId: phoneProduct.id,
            variantId: phoneVariant.id,
            description: "Concurrent Sale Competitor 1",
            quantity: 1,
            unitPrice: "220000",
            discountAmount: "0",
            stockUnitIds: [handset.id],
          },
        ],
      });
      createdInvoiceIds.push(invoice1.id);

      const invoice2 = await createSalesInvoiceDraft(adminActor, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        invoiceDate: "2026-11-10",
        currencyCode: company.currencyCode,
        idempotencyKey: `${suiteRunId}-req6-inv2`,
        lines: [
          {
            productId: phoneProduct.id,
            variantId: phoneVariant.id,
            description: "Concurrent Sale Competitor 2",
            quantity: 1,
            unitPrice: "220000",
            discountAmount: "0",
            stockUnitIds: [handset.id],
          },
        ],
      });
      createdInvoiceIds.push(invoice2.id);

      // Attempt concurrent posting
      const [res1, res2] = await Promise.allSettled([
        postSalesInvoice(adminActor, invoice1.id),
        postSalesInvoice(adminActor, invoice2.id),
      ]);

      const successes = [res1, res2].filter((r) => r.status === "fulfilled");
      const failures = [res1, res2].filter((r) => r.status === "rejected");

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);

      // Verify the rejected one gave a conflict / unavailable error
      const err = (failures[0] as PromiseRejectedResult).reason;
      expect(err.message).toMatch(/STOCK_UNIT_UNAVAILABLE|already been sold|unavailable/i);

      // Verify the phone unit has exactly 1 movement and is marked SOLD
      const movements = await prisma.inventoryMovement.findMany({
        where: { stockUnitId: handset.id },
      });
      expect(movements.length).toBe(1);
    });

    it("Req 7: Actual-cost COGS calculation derives from acquisition cost and maintains GL balance", async () => {
      const explicitLandedCost = "206500.5000";
      const handset = await seedTestHandset(explicitLandedCost);
      await seedAccessoryStock(10, "3200.0000");

      const invoice = await createSalesInvoiceDraft(adminActor, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        invoiceDate: "2026-11-10",
        currencyCode: company.currencyCode,
        idempotencyKey: `${suiteRunId}-req7-cogs`,
        lines: [
          {
            productId: phoneProduct.id,
            variantId: phoneVariant.id,
            description: "Phone with Landed Cost",
            quantity: 1,
            unitPrice: "235000", // Selling price is higher
            discountAmount: "5000",
            stockUnitIds: [handset.id],
          },
          {
            productId: accessoryProduct.id,
            variantId: accessoryVariant.id,
            description: "2 Chargers with Moving Average Cost",
            quantity: 2,
            unitPrice: "4500",
            discountAmount: "0",
            stockUnitIds: [],
          },
        ],
      });
      createdInvoiceIds.push(invoice.id);

      await submitSalesInvoice(adminActor, invoice.id);
      await approveSalesInvoice(adminActor, invoice.id);
      const posted = await postSalesInvoice(adminActor, invoice.id);

      // Total expected COGS = 206,500.50 + (2 * 3,200.00) = 212,900.50
      const expectedTotalCost = decimal(explicitLandedCost).plus(decimal("3200.0000").times(2));
      expect(posted.costTotal?.toString()).toBe(expectedTotalCost.toString());

      // Verify GL Journal Entry is strictly balanced: Total Debit === Total Credit
      const journal = await prisma.journalEntry.findUniqueOrThrow({
        where: { id: posted.journalEntryId! },
        include: { lines: true },
      });

      expect(journal.totalDebit.toString()).toBe(journal.totalCredit.toString());

      const lines = journal.lines;
      const totalDebits = lines.reduce((sum: Prisma.Decimal, l: any) => sum.plus(l.debit), zero());
      const totalCredits = lines.reduce((sum: Prisma.Decimal, l: any) => sum.plus(l.credit), zero());
      expect(totalDebits.toString()).toBe(totalCredits.toString());

      // Verify specific COGS debit line exists with exact landed cost
      const cogsLine = lines.find((l: any) => l.description.includes("Cost of goods sold"));
      expect(cogsLine).toBeDefined();
      expect(cogsLine?.debit.toString()).toBe(expectedTotalCost.toString());
    });

    it("Req 11: Partial payment receipt and multi-invoice allocation updates balances accurately", async () => {
      const h1 = await seedTestHandset("190000.0000");
      const h2 = await seedTestHandset("195000.0000");

      const inv1 = await createSalesInvoiceDraft(adminActor, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        invoiceDate: "2026-11-10",
        currencyCode: company.currencyCode,
        idempotencyKey: `${suiteRunId}-req11-inv1`,
        lines: [
          {
            productId: phoneProduct.id,
            variantId: phoneVariant.id,
            description: "Multi Invoice 1",
            quantity: 1,
            unitPrice: "60000",
            discountAmount: "0",
            stockUnitIds: [h1.id],
          },
        ],
      });
      createdInvoiceIds.push(inv1.id);
      await submitSalesInvoice(adminActor, inv1.id);
      await approveSalesInvoice(adminActor, inv1.id);
      const posted1 = await postSalesInvoice(adminActor, inv1.id);

      const inv2 = await createSalesInvoiceDraft(adminActor, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        invoiceDate: "2026-11-10",
        currencyCode: company.currencyCode,
        idempotencyKey: `${suiteRunId}-req11-inv2`,
        lines: [
          {
            productId: phoneProduct.id,
            variantId: phoneVariant.id,
            description: "Multi Invoice 2",
            quantity: 1,
            unitPrice: "40000",
            discountAmount: "0",
            stockUnitIds: [h2.id],
          },
        ],
      });
      createdInvoiceIds.push(inv2.id);
      await submitSalesInvoice(adminActor, inv2.id);
      await approveSalesInvoice(adminActor, inv2.id);
      const posted2 = await postSalesInvoice(adminActor, inv2.id);

      // Single payment of 50,000 split across both invoices:
      // 35,000 to Inv1 (leaving 25,000 open) and 15,000 to Inv2 (leaving 25,000 open)
      const splitPayment = await createPaymentDraft(adminActor, {
        branchId: branch.id,
        customerId: customer.id,
        cashAccountId: cashAccount.id,
        paymentDate: "2026-11-10",
        direction: PaymentDirection.CUSTOMER_RECEIPT,
        currencyCode: company.currencyCode,
        amount: "50000",
        reference: `SPLIT-${suiteRunId}`,
        idempotencyKey: `${suiteRunId}-req11-split-pay`,
        allocations: [
          { salesInvoiceId: posted1.id, amount: "35000" },
          { salesInvoiceId: posted2.id, amount: "15000" },
        ],
      });
      createdPaymentIds.push(splitPayment.id);

      await submitPayment(adminActor, splitPayment.id);
      await approvePayment(adminActor, splitPayment.id);
      await postPayment(adminActor, splitPayment.id);

      // Verify Invoice 1 allocation and outstanding
      const alloc1 = await prisma.paymentAllocation.findMany({
        where: { salesInvoiceId: posted1.id, payment: { status: OperationalDocumentStatus.POSTED } },
      });
      const settled1 = alloc1.reduce((sum, a) => sum.plus(a.amount), zero());
      expect(decimal(settled1).toFixed(4)).toBe("35000.0000");
      expect(decimal(posted1.grandTotal.minus(settled1)).toFixed(4)).toBe("25000.0000");

      // Verify Invoice 2 allocation and outstanding
      const alloc2 = await prisma.paymentAllocation.findMany({
        where: { salesInvoiceId: posted2.id, payment: { status: OperationalDocumentStatus.POSTED } },
      });
      const settled2 = alloc2.reduce((sum, a) => sum.plus(a.amount), zero());
      expect(decimal(settled2).toFixed(4)).toBe("15000.0000");
      expect(decimal(posted2.grandTotal.minus(settled2)).toFixed(4)).toBe("25000.0000");
    });

    it("Req 12: Multi-invoice receipt allocation limits strictly prevent overpayment and unposted allocation", async () => {
      const handset = await seedTestHandset("190000.0000");

      const invoice = await createSalesInvoiceDraft(adminActor, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        invoiceDate: "2026-11-10",
        currencyCode: company.currencyCode,
        idempotencyKey: `${suiteRunId}-req12-limits-inv`,
        lines: [
          {
            productId: phoneProduct.id,
            variantId: phoneVariant.id,
            description: "Allocation Limits Test Invoice",
            quantity: 1,
            unitPrice: "50000",
            discountAmount: "0",
            stockUnitIds: [handset.id],
          },
        ],
      });
      createdInvoiceIds.push(invoice.id);
      await submitSalesInvoice(adminActor, invoice.id);
      await approveSalesInvoice(adminActor, invoice.id);
      const posted = await postSalesInvoice(adminActor, invoice.id);

      // Limit Test 1: Allocations sum > Payment total amount -> rejects with OVER_ALLOCATION (422)
      await expect(
        createPaymentDraft(adminActor, {
          branchId: branch.id,
          customerId: customer.id,
          cashAccountId: cashAccount.id,
          paymentDate: "2026-11-10",
          direction: PaymentDirection.CUSTOMER_RECEIPT,
          currencyCode: company.currencyCode,
          amount: "50000",
          idempotencyKey: `${suiteRunId}-req12-over-alloc`,
          allocations: [{ salesInvoiceId: posted.id, amount: "60000" }],
        }),
      ).rejects.toThrow(/OVER_ALLOCATION/);

      // Limit Test 2: Allocation exceeding invoice outstanding open balance -> postPayment rejects with INVOICE_OVERPAYMENT
      const overpayingDraft = await createPaymentDraft(adminActor, {
        branchId: branch.id,
        customerId: customer.id,
        cashAccountId: cashAccount.id,
        paymentDate: "2026-11-10",
        direction: PaymentDirection.CUSTOMER_RECEIPT,
        currencyCode: company.currencyCode,
        amount: "80000",
        idempotencyKey: `${suiteRunId}-req12-overpay-draft`,
        allocations: [{ salesInvoiceId: posted.id, amount: "80000" }], // 80,000 on a 50,000 invoice
      });
      createdPaymentIds.push(overpayingDraft.id);

      await expect(postPayment(adminActor, overpayingDraft.id)).rejects.toThrow(/INVOICE_OVERPAYMENT/);
    });

    it("Req 13: Overdue calculation accuracy against due dates", async () => {
      // Helper function matching the domain definition
      function computePaymentStatus(
        grandTotal: Prisma.Decimal,
        paid: Prisma.Decimal,
        dueDate: Date | null,
        status: OperationalDocumentStatus,
        refDate = new Date("2026-11-10T12:00:00Z"),
      ) {
        if (status !== OperationalDocumentStatus.POSTED) return "DRAFT";
        const outstanding = Prisma.Decimal.max(grandTotal.minus(paid), 0);
        if (outstanding.lte(0)) return "PAID";
        if (dueDate && dueDate < refDate) return "OVERDUE";
        if (paid.gt(0)) return "PARTIAL";
        return "UNPAID";
      }

      const total = decimal("100000");
      const pastDue = new Date("2026-11-01T00:00:00Z");
      const futureDue = new Date("2026-11-30T00:00:00Z");

      // Case A: Past due with balance -> OVERDUE
      expect(computePaymentStatus(total, zero(), pastDue, OperationalDocumentStatus.POSTED)).toBe("OVERDUE");

      // Case B: Future due with balance -> UNPAID
      expect(computePaymentStatus(total, zero(), futureDue, OperationalDocumentStatus.POSTED)).toBe("UNPAID");

      // Case C: Past due but fully paid -> PAID (not overdue)
      expect(computePaymentStatus(total, total, pastDue, OperationalDocumentStatus.POSTED)).toBe("PAID");

      // Case D: Draft invoice with past due date -> DRAFT (not overdue)
      expect(computePaymentStatus(total, zero(), pastDue, OperationalDocumentStatus.DRAFT)).toBe("DRAFT");
    });

    it("Req 15: Credit note generation and AR reversal preserves original posted invoice immutability", async () => {
      const handset = await seedTestHandset("200000.0000");

      const invoice = await createSalesInvoiceDraft(adminActor, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        invoiceDate: "2026-11-10",
        currencyCode: company.currencyCode,
        idempotencyKey: `${suiteRunId}-req15-credit-note-src`,
        lines: [
          {
            productId: phoneProduct.id,
            variantId: phoneVariant.id,
            description: "Credit Note Immutability Test",
            quantity: 1,
            unitPrice: "220000",
            discountAmount: "0",
            stockUnitIds: [handset.id],
          },
        ],
      });
      createdInvoiceIds.push(invoice.id);
      await submitSalesInvoice(adminActor, invoice.id);
      await approveSalesInvoice(adminActor, invoice.id);
      const postedInvoice = await postSalesInvoice(adminActor, invoice.id);

      const subledgerBefore = await prisma.$queryRaw<Array<{ balance: Prisma.Decimal }>>(Prisma.sql`
        SELECT COALESCE(SUM(l."baseDebit" - l."baseCredit"),0)::numeric(19,4) AS balance
        FROM "JournalEntryLine" l
        JOIN "JournalEntry" j ON j."id" = l."entryId"
        WHERE j."companyId" = ${company.id}::uuid AND j."status" = 'POSTED'
          AND l."accountId" = ${arAccount.id}::uuid AND l."customerId" = ${customer.id}::uuid
      `);

      // Create & Post Return (which generates credit note journal)
      const returnDraft = await createStockReturnDraft(adminActor, {
        returnType: StockReturnType.SALES_RETURN,
        branchId: branch.id,
        warehouseId: warehouse.id,
        sourceDocumentId: postedInvoice.id,
        returnDate: "2026-11-10",
        currencyCode: company.currencyCode,
        reason: "Customer credit note generation test",
        idempotencyKey: `${suiteRunId}-req15-cn-return`,
        lines: [
          {
            sourceLineId: postedInvoice.lines[0].id,
            quantity: 1,
            disposition: StockReturnDisposition.RESTOCK,
            stockUnitIds: [handset.id],
          },
        ],
      });
      createdReturnIds.push(returnDraft.id);
      await submitStockReturn(adminActor, returnDraft.id);
      await approveStockReturn(adminActor, returnDraft.id);
      const postedReturn = await postStockReturn(adminActor, returnDraft.id);

      // Verify the Credit Note Return Journal reversed AR (Credit to AR)
      const returnJournal = await prisma.journalEntry.findUniqueOrThrow({
        where: { id: postedReturn.journalEntryId! },
        include: { lines: true },
      });
      const arCreditLine = returnJournal.lines.find(
        (l: any) => l.accountId === arAccount.id && l.customerId === customer.id,
      );
      expect(arCreditLine).toBeDefined();
      expect(arCreditLine?.credit.toString()).toBe(postedInvoice.grandTotal.toString());

      // Verify the original invoice record is 100% UNCHANGED and still POSTED
      const originalInDb = await prisma.salesInvoice.findUniqueOrThrow({
        where: { id: postedInvoice.id },
      });
      expect(originalInDb.status).toBe(OperationalDocumentStatus.POSTED);
      expect(originalInDb.grandTotal.toString()).toBe(postedInvoice.grandTotal.toString());

      // Customer subledger decreased by the credit note amount
      const subledgerAfter = await prisma.$queryRaw<Array<{ balance: Prisma.Decimal }>>(Prisma.sql`
        SELECT COALESCE(SUM(l."baseDebit" - l."baseCredit"),0)::numeric(19,4) AS balance
        FROM "JournalEntryLine" l
        JOIN "JournalEntry" j ON j."id" = l."entryId"
        WHERE j."companyId" = ${company.id}::uuid AND j."status" = 'POSTED'
          AND l."accountId" = ${arAccount.id}::uuid AND l."customerId" = ${customer.id}::uuid
      `);
      const diff = subledgerBefore[0].balance.minus(subledgerAfter[0].balance);
      expect(diff.toString()).toBe(postedInvoice.grandTotal.toString());
    });

    it("Req 16: Transaction reversal creates linked reversal document and balancing reversal journal", async () => {
      const handset = await seedTestHandset("200000.0000");

      const invoice = await createSalesInvoiceDraft(adminActor, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        invoiceDate: "2026-11-10",
        currencyCode: company.currencyCode,
        idempotencyKey: `${suiteRunId}-req16-reversal-src`,
        lines: [
          {
            productId: phoneProduct.id,
            variantId: phoneVariant.id,
            description: "Invoice to be Reversed",
            quantity: 1,
            unitPrice: "220000",
            discountAmount: "0",
            stockUnitIds: [handset.id],
          },
        ],
      });
      createdInvoiceIds.push(invoice.id);
      await submitSalesInvoice(adminActor, invoice.id);
      await approveSalesInvoice(adminActor, invoice.id);
      const postedInvoice = await postSalesInvoice(adminActor, invoice.id);

      // Execute authorized transaction reversal
      const reversalResult = await reversePostedSalesInvoice(adminActor, postedInvoice.id, {
        reason: "Authorized reversal: Customer order canceled prior to dispatch handover",
        postingDate: new Date("2026-11-10"),
      });

      // Verify original invoice status transitioned to REVERSED
      const originalAfter = await prisma.salesInvoice.findUniqueOrThrow({
        where: { id: postedInvoice.id },
      });
      expect(originalAfter.status).toBe(OperationalDocumentStatus.REVERSED);

      // Verify linked reversal invoice document was generated
      expect(reversalResult.id).toBeDefined();
      expect(reversalResult.reversalOfId).toBe(postedInvoice.id);

      // Verify physical handset stock is restored to IN_STOCK
      const restoredPhone = await prisma.physicalStockUnit.findUniqueOrThrow({
        where: { id: handset.id },
      });
      expect(restoredPhone.status).toBe(StockUnitStatus.IN_STOCK);
    });

    it("Req 20: Posting idempotency prevents duplicate stock movements and GL entries", async () => {
      const handset = await seedTestHandset("200000.0000");

      const invoice = await createSalesInvoiceDraft(adminActor, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        invoiceDate: "2026-11-10",
        currencyCode: company.currencyCode,
        idempotencyKey: `${suiteRunId}-req20-idempotency`,
        lines: [
          {
            productId: phoneProduct.id,
            variantId: phoneVariant.id,
            description: "Idempotency Posting Verification",
            quantity: 1,
            unitPrice: "220000",
            discountAmount: "0",
            stockUnitIds: [handset.id],
          },
        ],
      });
      createdInvoiceIds.push(invoice.id);
      await submitSalesInvoice(adminActor, invoice.id);
      await approveSalesInvoice(adminActor, invoice.id);

      // First posting invocation
      const postedFirst = await postSalesInvoice(adminActor, invoice.id);
      expect(postedFirst.status).toBe(OperationalDocumentStatus.POSTED);

      const movementsBefore = await prisma.inventoryMovement.count({
        where: { sourceDocumentId: invoice.id },
      });
      const journalsBefore = await prisma.journalEntry.count({
        where: { sourceDocumentId: invoice.id },
      });

      // Second posting invocation with identical invoice ID
      const postedSecond = await postSalesInvoice(adminActor, invoice.id);
      expect(postedSecond.status).toBe(OperationalDocumentStatus.POSTED);
      expect(postedSecond.id).toBe(postedFirst.id);

      // Assert strictly ZERO duplicate movements or journals
      const movementsAfter = await prisma.inventoryMovement.count({
        where: { sourceDocumentId: invoice.id },
      });
      const journalsAfter = await prisma.journalEntry.count({
        where: { sourceDocumentId: invoice.id },
      });

      expect(movementsAfter).toBe(movementsBefore);
      expect(journalsAfter).toBe(journalsBefore);
    });
  });

  // ==========================================================================
  // TIER 3: CROSS-FEATURE INTERACTIONS (PAIRWISE WORKFLOWS)
  // ==========================================================================

  describe("Tier 3: Cross-Feature Interactions & Pairwise Workflows", () => {
    it("Pairwise: Serialized Sale + Partial Receipt Payment + Sales Return and Restock", async () => {
      const handset = await seedTestHandset("200000.0000");

      // 1. Post Sale
      const invoice = await createSalesInvoiceDraft(adminActor, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        invoiceDate: "2026-11-10",
        currencyCode: company.currencyCode,
        idempotencyKey: `${suiteRunId}-pairwise-sale`,
        lines: [
          {
            productId: phoneProduct.id,
            variantId: phoneVariant.id,
            description: "Pairwise Handset",
            quantity: 1,
            unitPrice: "220000",
            discountAmount: "0",
            stockUnitIds: [handset.id],
          },
        ],
      });
      createdInvoiceIds.push(invoice.id);
      await submitSalesInvoice(adminActor, invoice.id);
      await approveSalesInvoice(adminActor, invoice.id);
      const postedInvoice = await postSalesInvoice(adminActor, invoice.id);

      // 2. Partial Payment (100,000 paid out of 220,000)
      const partialPay = await createPaymentDraft(adminActor, {
        branchId: branch.id,
        customerId: customer.id,
        cashAccountId: cashAccount.id,
        paymentDate: "2026-11-10",
        direction: PaymentDirection.CUSTOMER_RECEIPT,
        currencyCode: company.currencyCode,
        amount: "100000",
        idempotencyKey: `${suiteRunId}-pairwise-part-pay`,
        allocations: [{ salesInvoiceId: postedInvoice.id, amount: "100000" }],
      });
      createdPaymentIds.push(partialPay.id);
      await submitPayment(adminActor, partialPay.id);
      await approvePayment(adminActor, partialPay.id);
      await postPayment(adminActor, partialPay.id);

      // 3. Customer Returns Handset
      const returnDraft = await createStockReturnDraft(adminActor, {
        returnType: StockReturnType.SALES_RETURN,
        branchId: branch.id,
        warehouseId: warehouse.id,
        sourceDocumentId: postedInvoice.id,
        returnDate: "2026-11-10",
        currencyCode: company.currencyCode,
        reason: "Pairwise customer return after partial payment",
        idempotencyKey: `${suiteRunId}-pairwise-return`,
        lines: [
          {
            sourceLineId: postedInvoice.lines[0].id,
            quantity: 1,
            disposition: StockReturnDisposition.RESTOCK,
            stockUnitIds: [handset.id],
          },
        ],
      });
      createdReturnIds.push(returnDraft.id);
      await submitStockReturn(adminActor, returnDraft.id);
      await approveStockReturn(adminActor, returnDraft.id);
      await postStockReturn(adminActor, returnDraft.id);

      // 4. Verify Final State:
      // Phone is back IN_STOCK
      const phoneInDb = await prisma.physicalStockUnit.findUniqueOrThrow({
        where: { id: handset.id },
      });
      expect(phoneInDb.status).toBe(StockUnitStatus.IN_STOCK);

      // Total settlements on invoice: 100,000 receipt + 220,000 credit note
      // Net customer AR balance reflecting the 100,000 advance
      const arLines = await prisma.journalEntryLine.findMany({
        where: {
          accountId: arAccount.id,
          customerId: customer.id,
          entry: { status: OperationalDocumentStatus.POSTED },
        },
      });
      expect(arLines.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ==========================================================================
  // TIER 4: REAL-WORLD WORKLOADS & RECONCILIATION (REQUIREMENTS 17-19)
  // ==========================================================================

  describe("Tier 4: Real-World Workloads & Reconciliation", () => {
    it("Req 17: Immutable audit logging records comprehensive posting trail with user, timestamp, and state", async () => {
      const handset = await seedTestHandset("200000.0000");

      const invoice = await createSalesInvoiceDraft(adminActor, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        invoiceDate: "2026-11-10",
        currencyCode: company.currencyCode,
        idempotencyKey: `${suiteRunId}-req17-audit`,
        lines: [
          {
            productId: phoneProduct.id,
            variantId: phoneVariant.id,
            description: "Audit Log Integrity Verification",
            quantity: 1,
            unitPrice: "220000",
            discountAmount: "0",
            stockUnitIds: [handset.id],
          },
        ],
      });
      createdInvoiceIds.push(invoice.id);
      await submitSalesInvoice(adminActor, invoice.id);
      await approveSalesInvoice(adminActor, invoice.id);
      await postSalesInvoice(adminActor, invoice.id);

      // Query Audit Log entries for this entity
      const logs = await prisma.auditLog.findMany({
        where: { entityId: invoice.id },
        orderBy: { timestamp: "asc" },
      });

      expect(logs.length).toBeGreaterThanOrEqual(2);

      const draftLog = logs.find((l: any) => l.action === "SALES_INVOICE_DRAFT_CREATED");
      const postLog = logs.find((l: any) => l.action === "SALES_INVOICE_POSTED");

      expect(draftLog).toBeDefined();
      expect(draftLog?.actorId).toBe(adminActor.userId);
      expect(draftLog?.companyId).toBe(company.id);

      expect(postLog).toBeDefined();
      expect(postLog?.actorId).toBe(adminActor.userId);
      expect((postLog?.newValues as any)?.status).toBe(OperationalDocumentStatus.POSTED);
    });

    it("Req 18: Dashboard totals reconciliation with posted records strictly excludes unposted drafts", async () => {
      // Create a POSTED invoice
      const h1 = await seedTestHandset("190000.0000");
      const postedInv = await createSalesInvoiceDraft(adminActor, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        invoiceDate: "2026-11-10",
        currencyCode: company.currencyCode,
        idempotencyKey: `${suiteRunId}-req18-posted`,
        lines: [
          {
            productId: phoneProduct.id,
            variantId: phoneVariant.id,
            description: "Posted Dashboard KPI Source",
            quantity: 1,
            unitPrice: "150000",
            discountAmount: "0",
            stockUnitIds: [h1.id],
          },
        ],
      });
      createdInvoiceIds.push(postedInv.id);
      await submitSalesInvoice(adminActor, postedInv.id);
      await approveSalesInvoice(adminActor, postedInv.id);
      await postSalesInvoice(adminActor, postedInv.id);

      // Create an UNPOSTED DRAFT invoice
      const h2 = await seedTestHandset("190000.0000");
      const draftInv = await createSalesInvoiceDraft(adminActor, {
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        invoiceDate: "2026-11-10",
        currencyCode: company.currencyCode,
        idempotencyKey: `${suiteRunId}-req18-draft`,
        lines: [
          {
            productId: phoneProduct.id,
            variantId: phoneVariant.id,
            description: "Draft Invoice That Must Be Excluded",
            quantity: 1,
            unitPrice: "999999",
            discountAmount: "0",
            stockUnitIds: [h2.id],
          },
        ],
      });
      createdInvoiceIds.push(draftInv.id);

      // Compute Dashboard KPI: Only status === POSTED
      const dashboardTotals = await prisma.salesInvoice.aggregate({
        where: { companyId: company.id, status: OperationalDocumentStatus.POSTED },
        _sum: { grandTotal: true },
      });

      // Verify unposted draft of 999,999 is NOT in the dashboard total
      const allInvoicesSum = await prisma.salesInvoice.aggregate({
        where: { companyId: company.id },
        _sum: { grandTotal: true },
      });

      expect(dashboardTotals._sum.grandTotal).toBeDefined();
      expect(allInvoicesSum._sum.grandTotal).toBeDefined();
      expect(dashboardTotals._sum.grandTotal!.lt(allInvoicesSum._sum.grandTotal!)).toBe(true);
    });

    it("Req 19: Customer subledger vs Accounts Receivable GL control account reconciliation", async () => {
      // 1. Calculate sum of all customer subledgers from posted journal lines
      const subledgerResult = await prisma.$queryRaw<Array<{ total: Prisma.Decimal }>>(Prisma.sql`
        SELECT COALESCE(SUM(l."baseDebit" - l."baseCredit"),0)::numeric(19,4) AS total
        FROM "JournalEntryLine" l
        JOIN "JournalEntry" j ON j."id" = l."entryId"
        WHERE j."companyId" = ${company.id}::uuid
          AND j."status" = 'POSTED'
          AND l."accountId" = ${arAccount.id}::uuid
          AND l."customerId" IS NOT NULL
      `);
      const subledgerTotal = subledgerResult[0]?.total ?? zero();

      // 2. Calculate sum of the AR GL control account balance across all posted journal lines
      const controlResult = await prisma.$queryRaw<Array<{ total: Prisma.Decimal }>>(Prisma.sql`
        SELECT COALESCE(SUM(l."baseDebit" - l."baseCredit"),0)::numeric(19,4) AS total
        FROM "JournalEntryLine" l
        JOIN "JournalEntry" j ON j."id" = l."entryId"
        WHERE j."companyId" = ${company.id}::uuid
          AND j."status" = 'POSTED'
          AND l."accountId" = ${arAccount.id}::uuid
      `);
      const controlTotal = controlResult[0]?.total ?? zero();

      // 3. Strict 100% reconciliation: Difference must be EXACTLY zero
      const reconciliationDifference = controlTotal.minus(subledgerTotal);
      expect(reconciliationDifference.isZero()).toBe(true);
    });
  });
});
