/**
 * Milestone 2 Unit & Integration Test Suite: Approval Elimination, Direct Posting & Full Voucher Lifecycle
 * Target: src/__tests__/settlement/lifecycle.test.ts
 *
 * Requirements Covered:
 * - R1: Approval Elimination & Role-Based Direct Posting
 * - Voucher Lifecycle: Draft -> Submitted -> Posted, with Cancelled & Reversed
 * - Audit Trail Preservation & Reversing Journal Entry Integrity
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { OperationalDocumentStatus, PaymentDirection, Prisma, JournalStatus, JournalType } from "@prisma/client";

// ============================================================================
// HOISTED TEST FIXTURES & MOCK SERVICES
// ============================================================================

const {
  COMPANY_ID,
  BRANCH_ID,
  USER_MAKER_ID,
  CUSTOMER_ID,
  SUPPLIER_ID,
  CASH_ACCOUNT_ID,
  AR_CONTROL_ID,
  AP_CONTROL_ID,
  FISCAL_PERIOD_ID,
  store,
  mockTxClient,
  authState,
} = vi.hoisted(() => {
  const COMPANY_ID = "c1111111-1111-4111-8111-111111111111";
  const BRANCH_ID = "b2222222-2222-4222-8222-222222222222";
  const USER_MAKER_ID = "u3333333-3333-4333-8333-333333333333";
  const CUSTOMER_ID = "cust-1111-1111-1111-111111111111";
  const SUPPLIER_ID = "supp-2222-2222-2222-222222222222";
  const CASH_ACCOUNT_ID = "acc-cash-1000-0000-000000000000";
  const AR_CONTROL_ID = "acc-ar-1200-0000-000000000000";
  const AP_CONTROL_ID = "acc-ap-2000-0000-000000000000";
  const FISCAL_PERIOD_ID = "fp-2026-27-0000-000000000000";

  const store = {
    payments: new Map<string, any>(),
    journals: new Map<string, any>(),
    auditLogs: [] as any[],
    deletedPaymentIds: [] as string[],
    salesInvoices: new Map<string, any>(),
    purchaseReceipts: new Map<string, any>(),
    accounts: new Map<string, any>(),
    customers: new Map<string, any>(),
    suppliers: new Map<string, any>(),
    seqCounter: 1,

    reset() {
      this.payments.clear();
      this.journals.clear();
      this.auditLogs = [];
      this.deletedPaymentIds = [];
      this.salesInvoices.clear();
      this.purchaseReceipts.clear();
      this.accounts.clear();
      this.customers.clear();
      this.suppliers.clear();
      this.seqCounter = 1;

      // Seed master accounts
      this.accounts.set(CASH_ACCOUNT_ID, {
        id: CASH_ACCOUNT_ID,
        companyId: COMPANY_ID,
        branchId: BRANCH_ID,
        code: "1000",
        name: "Cash on Hand",
        accountType: "CASH",
        currencyCode: "PKR",
        isActive: true,
      });
      this.accounts.set(AR_CONTROL_ID, {
        id: AR_CONTROL_ID,
        companyId: COMPANY_ID,
        branchId: BRANCH_ID,
        code: "1200",
        name: "Accounts Receivable Control",
        accountType: "ACCOUNTS_RECEIVABLE",
        currencyCode: "PKR",
        isActive: true,
      });
      this.accounts.set(AP_CONTROL_ID, {
        id: AP_CONTROL_ID,
        companyId: COMPANY_ID,
        branchId: BRANCH_ID,
        code: "2000",
        name: "Accounts Payable Control",
        accountType: "ACCOUNTS_PAYABLE",
        currencyCode: "PKR",
        isActive: true,
      });

      // Seed active counter-parties
      this.customers.set(CUSTOMER_ID, {
        id: CUSTOMER_ID,
        companyId: COMPANY_ID,
        code: "CUST-01",
        name: "Palmpay Limited",
        status: "ACTIVE",
      });
      this.suppliers.set(SUPPLIER_ID, {
        id: SUPPLIER_ID,
        companyId: COMPANY_ID,
        code: "SUPP-01",
        name: "Samsung Electronics",
        status: "ACTIVE",
      });

      // Seed posted sales invoice for allocation tests
      this.salesInvoices.set("inv-palmpay-001", {
        id: "inv-palmpay-001",
        companyId: COMPANY_ID,
        customerId: CUSTOMER_ID,
        invoiceNumber: "ISB-SI-FY2026-27-000001",
        status: "POSTED",
        reversalOfId: null,
        grandTotal: { toString: () => "100000.0000" },
      });

      // Seed posted purchase receipt for allocation tests
      this.purchaseReceipts.set("rec-samsung-001", {
        id: "rec-samsung-001",
        companyId: COMPANY_ID,
        supplierId: SUPPLIER_ID,
        receiptNumber: "ISB-PV-FY2026-27-000001",
        status: "POSTED",
        reversalOfId: null,
        grandTotal: { toString: () => "80000.0000" },
      });
    },
  };

  const authState = {
    user: {
      id: USER_MAKER_ID,
      fullName: "Senior Finance Officer",
      email: "finance@axon.local",
    },
    company: {
      id: COMPANY_ID,
      currencyCode: "PKR",
    },
    permissions: ["PAYMENT_POST", "PAYMENT_CANCEL", "PAYMENT_REVERSE", "PAYMENT_VIEW", "PAYMENT_CREATE"],
  };

  const mockTxClient = {
    $queryRaw: vi.fn(async (firstArg: any, ...restValues: any[]) => {
      let rawSql = "";
      let values = restValues;
      if (firstArg && typeof firstArg === "object" && "strings" in firstArg && Array.isArray(firstArg.strings)) {
        rawSql = firstArg.strings.join("?");
        values = firstArg.values ?? restValues;
      } else if (Array.isArray(firstArg)) {
        rawSql = firstArg.join("?");
        values = restValues;
      } else {
        rawSql = String(firstArg);
      }
      if (rawSql.includes('SELECT "id" FROM "Payment"')) {
        const id = values[0];
        return [{ id }];
      }
      if (rawSql.includes('FROM "PaymentAllocation" a JOIN "Payment" p')) {
        const invoiceId = values[0];
        let settled = 0;
        for (const p of store.payments.values()) {
          if (p.status === "POSTED") {
            for (const a of p.allocations || []) {
              const amt = Number(a.amount.toString());
              if (a.salesInvoiceId === invoiceId) {
                if (p.direction === "CUSTOMER_RECEIPT") settled += amt;
                else settled -= amt;
              }
              if (a.purchaseReceiptId === invoiceId) {
                if (p.direction === "SUPPLIER_PAYMENT") settled += amt;
                else settled -= amt;
              }
            }
          }
        }
        return [{ settled: { gt: (val: any) => settled > Number(val?.toString() || val), toString: () => settled.toString(), plus: (val: any) => ({ gt: (target: any) => (settled + Number(val?.toString() || val)) > Number(target?.toString() || target) }) } }];
      }
      if (rawSql.includes('INSERT INTO "DocumentSequence"')) {
        const next = BigInt(store.seqCounter++);
        return [{ nextValue: next, prefix: "ISB-RC", padding: 6 }];
      }
      return [];
    }),

    payment: {
      findFirst: vi.fn(async ({ where }: { where: any }) => {
        if (where.reversalOfId) {
          for (const p of store.payments.values()) {
            if (p.reversalOfId === where.reversalOfId) return p;
          }
          return null;
        }
        const record = store.payments.get(where.id);
        if (!record || (where.companyId && record.companyId !== where.companyId)) return null;
        return {
          ...record,
          customer: record.customerId ? store.customers.get(record.customerId) || null : null,
          supplier: record.supplierId ? store.suppliers.get(record.supplierId) || null : null,
          bankAccount: null,
          cashAccount: record.cashAccountId ? store.accounts.get(record.cashAccountId) || null : null,
          allocations: record.allocations.map((a: any) => ({
            ...a,
            salesInvoice: a.salesInvoiceId ? store.salesInvoices.get(a.salesInvoiceId) || null : null,
            purchaseReceipt: a.purchaseReceiptId ? store.purchaseReceipts.get(a.purchaseReceiptId) || null : null,
          })),
          journalEntry: record.journalEntryId ? store.journals.get(record.journalEntryId) || null : null,
        };
      }),
      findMany: vi.fn(async ({ where }: { where: any }) => {
        const res: any[] = [];
        for (const p of store.payments.values()) {
          if (where.companyId && p.companyId !== where.companyId) continue;
          if (where.status && p.status !== where.status) continue;
          res.push(p);
        }
        return res;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const current = store.payments.get(where.id);
        if (!current) throw new Error("Payment not found");
        const updated = {
          ...current,
          status: data.status !== undefined ? data.status : current.status,
          journalEntryId: data.journalEntryId !== undefined ? data.journalEntryId : current.journalEntryId,
          reversalOfId: data.reversalOfId !== undefined ? data.reversalOfId : current.reversalOfId,
          postedById: data.postedById !== undefined ? data.postedById : current.postedById,
          postedAt: data.postedAt !== undefined ? data.postedAt : current.postedAt,
          reversedById: data.reversedById !== undefined ? data.reversedById : current.reversedById,
          reversedAt: data.reversedAt !== undefined ? data.reversedAt : current.reversedAt,
          reversalReason: data.reversalReason !== undefined ? data.reversalReason : current.reversalReason,
          notes: data.notes !== undefined ? data.notes : current.notes,
          approvedById: data.approvedById !== undefined ? data.approvedById : current.approvedById,
          approvedAt: data.approvedAt !== undefined ? data.approvedAt : current.approvedAt,
        };
        store.payments.set(where.id, updated);
        return {
          ...updated,
          allocations: updated.allocations,
          journalEntry: updated.journalEntryId ? store.journals.get(updated.journalEntryId) : null,
        };
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        store.deletedPaymentIds.push(where.id);
        store.payments.delete(where.id);
        return { id: where.id };
      }),
    },

    paymentAllocation: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },

    account: {
      findFirst: vi.fn(async ({ where }: { where: any }) => {
        for (const acc of store.accounts.values()) {
          if (where.id && acc.id === where.id) return acc;
          if (where.accountType && acc.accountType === where.accountType && acc.isActive) return acc;
        }
        return null;
      }),
      findMany: vi.fn(async ({ where }: { where: any }) => {
        const results = [];
        for (const acc of store.accounts.values()) {
          if (where.id && acc.id !== where.id) continue;
          if (where.accountType && acc.accountType !== where.accountType) continue;
          if (where.isActive !== undefined && acc.isActive !== where.isActive) continue;
          results.push(acc);
        }
        return results;
      }),
      count: vi.fn(async ({ where }: { where: any }) => {
        if (where.id?.in) {
          return where.id.in.filter((id: string) => store.accounts.has(id)).length;
        }
        return store.accounts.size;
      }),
    },

    branch: {
      findFirst: vi.fn(async () => ({
        id: BRANCH_ID,
        documentPrefix: "ISB-",
        isActive: true,
      })),
    },

    accountingPeriod: {
      findFirst: vi.fn(async () => ({
        id: FISCAL_PERIOD_ID,
        code: "FP-2026-11",
        fiscalYear: { code: "FY2026-27" },
      })),
    },

    fiscalPeriod: {
      findFirst: vi.fn(async () => ({
        id: FISCAL_PERIOD_ID,
        code: "FP-2026-11",
        fiscalYear: { code: "FY2026-27" },
      })),
    },

    journalEntry: {
      findFirst: vi.fn(async ({ where }: { where: any }) => {
        return store.journals.get(where.id) || null;
      }),
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: { data: any }) => {
        const id = `je-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const lines = (data.lines?.create || []).map((l: any, idx: number) => ({
          id: `jl-${idx}-${id}`,
          journalEntryId: id,
          ...l,
          baseDebit: l.debit,
          baseCredit: l.credit,
        }));
        const entry = {
          id,
          companyId: data.companyId,
          branchId: data.branchId,
          periodId: data.periodId,
          voucherNumber: data.voucherNumber,
          voucherDate: data.voucherDate,
          postingDate: data.postingDate,
          voucherType: data.voucherType || "SYSTEM",
          status: "DRAFT",
          narration: data.narration,
          referenceDocument: data.referenceDocument || null,
          sourceModule: data.sourceModule,
          sourceDocumentType: data.sourceDocumentType,
          sourceDocumentId: data.sourceDocumentId,
          sourceDocumentNumber: data.sourceDocumentNumber,
          idempotencyKey: data.idempotencyKey,
          reversalOfId: data.reversalOfId || null,
          totalDebit: data.totalDebit,
          totalCredit: data.totalCredit,
          preparedById: data.preparedById,
          approvedById: null,
          postedById: null,
          lines,
        };
        store.journals.set(id, entry);
        return entry;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const entry = store.journals.get(where.id);
        if (!entry) throw new Error("Journal entry not found");
        const updated = {
          ...entry,
          status: data.status !== undefined ? data.status : entry.status,
          approvedById: data.approvedById !== undefined ? data.approvedById : entry.approvedById,
          postedById: data.postedById !== undefined ? data.postedById : entry.postedById,
        };
        store.journals.set(where.id, updated);
        return updated;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: any; data: any }) => {
        let count = 0;
        for (const [id, entry] of store.journals.entries()) {
          if (where.id && entry.id !== where.id) continue;
          if (where.companyId && entry.companyId !== where.companyId) continue;
          if (where.status && entry.status !== where.status) continue;
          const updated = {
            ...entry,
            status: data.status !== undefined ? data.status : entry.status,
            reversedById: data.reversedById !== undefined ? data.reversedById : entry.reversedById,
            reversedAt: data.reversedAt !== undefined ? data.reversedAt : entry.reversedAt,
          };
          store.journals.set(id, updated);
          count++;
        }
        return { count };
      }),
    },

    purchaseOrder: { findMany: vi.fn(async () => []) },
    purchaseReceipt: { findMany: vi.fn(async () => []) },
    stockTransfer: { findMany: vi.fn(async () => []) },
    stockAdjustment: { findMany: vi.fn(async () => []) },
    budget: { findMany: vi.fn(async () => []) },

    bankTransaction: {
      create: vi.fn(async ({ data }: { data: any }) => ({ id: `bt-${Date.now()}`, ...data })),
    },

    auditLog: {
      create: vi.fn(async ({ data }: { data: any }) => {
        store.auditLogs.push(data);
        return { id: `audit-${Date.now()}`, ...data };
      }),
    },

    systemSetting: {
      findUnique: vi.fn(async () => null),
    },
  };

  return {
    COMPANY_ID,
    BRANCH_ID,
    USER_MAKER_ID,
    CUSTOMER_ID,
    SUPPLIER_ID,
    CASH_ACCOUNT_ID,
    AR_CONTROL_ID,
    AP_CONTROL_ID,
    FISCAL_PERIOD_ID,
    store,
    mockTxClient,
    authState,
  };
});

// Mock prisma module
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ...mockTxClient,
    $transaction: vi.fn(async (cb: any) => cb(mockTxClient)),
  },
  ensureSingleUserDatabase: vi.fn(async () => {}),
}));

// Mock auth module
vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(async () => ({
    user: authState.user,
    company: authState.company,
    permissions: authState.permissions,
    roles: [{ permissions: authState.permissions, branchId: BRANCH_ID }],
  })),
  requirePermission: vi.fn(async (perm: string) => {
    if (!authState.permissions.includes(perm) && !authState.permissions.includes("finance.manage")) {
      const err = new Error("You do not have permission to perform this action.") as any;
      err.status = 403;
      err.code = "FORBIDDEN";
      throw err;
    }
    return {
      user: authState.user,
      company: authState.company,
      permissions: authState.permissions,
      roles: [{ permissions: authState.permissions, branchId: BRANCH_ID }],
    };
  }),
}));

// Import implementations under test after vi.mock declarations
import { postPayment, cancelPayment, reversePayment } from "@/lib/operations/payments";
import { POST as approveRouteHandler } from "@/app/api/payments/[id]/approve/route";
import { POST as postRouteHandler } from "@/app/api/payments/[id]/post/route";
import { POST as cancelRouteHandler } from "@/app/api/payments/[id]/cancel/route";
import { POST as reverseRouteHandler } from "@/app/api/payments/[id]/reverse/route";
import { GET as approvalsGetHandler, POST as approvalsPostHandler } from "@/app/api/approvals/route";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Helper to seed a payment
function seedPayment(overrides: Partial<any> = {}) {
  const id = overrides.id || crypto.randomUUID();
  const payment = {
    id,
    companyId: COMPANY_ID,
    branchId: BRANCH_ID,
    customerId: CUSTOMER_ID,
    supplierId: null,
    bankAccountId: null,
    cashAccountId: CASH_ACCOUNT_ID,
    paymentMethodId: null,
    journalEntryId: null,
    reversalOfId: null,
    paymentNumber: "ISB-RC-FY2026-27-000001",
    paymentDate: new Date("2026-11-10"),
    direction: PaymentDirection.CUSTOMER_RECEIPT,
    status: OperationalDocumentStatus.SUBMITTED,
    currencyCode: "PKR",
    amount: new Prisma.Decimal("25000.0000"),
    reference: "REF-001",
    notes: "Customer on-account receipt",
    idempotencyKey: `PAY-KEY-${id}`,
    preparedById: USER_MAKER_ID,
    approvedById: null,
    postedById: null,
    reversedById: null,
    approvedAt: null,
    postedAt: null,
    reversedAt: null,
    reversalReason: null,
    allocations: [
      {
        id: `alloc-1-${id}`,
        paymentId: id,
        salesInvoiceId: "inv-palmpay-001",
        purchaseReceiptId: null,
        amount: new Prisma.Decimal("25000.0000"),
      },
    ],
    ...overrides,
  };
  store.payments.set(id, payment);
  return payment;
}

// ============================================================================
// TEST SUITE: APPROVAL ELIMINATION, DIRECT POSTING & FULL LIFECYCLE
// ============================================================================

describe("Milestone 2: Approval Elimination, Direct Posting & Full Voucher Lifecycle", () => {
  beforeEach(() => {
    store.reset();
    authState.permissions = ["PAYMENT_POST", "PAYMENT_CANCEL", "PAYMENT_REVERSE", "PAYMENT_VIEW", "PAYMENT_CREATE"];
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. APPROVAL ELIMINATION & DIRECT POSTING
  // --------------------------------------------------------------------------
  describe("Feature 3 & 5: Approval Elimination & Role-Based Direct Posting", () => {
    it("TC-LIFE-01: Maker/preparer can directly post a SUBMITTED voucher to POSTED without Segregation of Duties block", async () => {
      const payment = seedPayment({
        status: OperationalDocumentStatus.SUBMITTED,
        preparedById: USER_MAKER_ID, // Same user who prepared it
      });

      const actor = {
        companyId: COMPANY_ID,
        userId: USER_MAKER_ID, // Same user posts it!
        currencyCode: "PKR",
        permissions: ["PAYMENT_POST"],
      };

      const result = await postPayment(actor, payment.id);

      expect(result.status).toBe(OperationalDocumentStatus.POSTED);
      expect(result.postedById).toBe(USER_MAKER_ID);
      expect(result.journalEntryId).toBeDefined();

      // Ensure payment in store has status POSTED, NOT APPROVED
      const updated = store.payments.get(payment.id);
      expect(updated?.status).toBe(OperationalDocumentStatus.POSTED);

      // Verify atomic balanced GL journal entry
      const journal = store.journals.get(result.journalEntryId!);
      expect(journal).toBeDefined();
      expect(journal?.status).toBe(JournalStatus.POSTED);
      expect(journal?.totalDebit.toString()).toBe(journal?.totalCredit.toString());
      expect(journal?.lines.length).toBe(2);

      // Check debits and credits: Debit Cash, Credit AR Control
      const debitLine = journal?.lines.find((l: any) => Number(l.debit?.toString() || l.debit) > 0);
      const creditLine = journal?.lines.find((l: any) => Number(l.credit?.toString() || l.credit) > 0);
      expect(debitLine?.accountId).toBe(CASH_ACCOUNT_ID);
      expect(creditLine?.accountId).toBe(AR_CONTROL_ID);
      expect(creditLine?.customerId).toBe(CUSTOMER_ID);

      // Audit log check
      const audit = store.auditLogs.find((a) => a.action === "PAYMENT_POSTED");
      expect(audit).toBeDefined();
      expect(audit?.entityId).toBe(payment.id);
    });

    it("TC-LIFE-02: Direct posting operates directly from DRAFT without requiring prior submission or approval", async () => {
      const payment = seedPayment({
        status: OperationalDocumentStatus.DRAFT,
        preparedById: USER_MAKER_ID,
      });

      const actor = {
        companyId: COMPANY_ID,
        userId: USER_MAKER_ID,
        currencyCode: "PKR",
        permissions: ["PAYMENT_POST"],
      };

      const result = await postPayment(actor, payment.id);
      expect(result.status).toBe(OperationalDocumentStatus.POSTED);
      expect(result.journalEntryId).toBeTruthy();
    });

    it("TC-LIFE-03: postPayment does NOT set status to APPROVED during posting transition", async () => {
      const payment = seedPayment({
        status: OperationalDocumentStatus.SUBMITTED,
        preparedById: USER_MAKER_ID,
      });

      const actor = {
        companyId: COMPANY_ID,
        userId: USER_MAKER_ID,
        currencyCode: "PKR",
        permissions: ["PAYMENT_POST"],
      };

      await postPayment(actor, payment.id);

      // Verify that tx.payment.update was never called with status: APPROVED
      const updateCalls = (mockTxClient.payment.update as any).mock.calls;
      const approvedCalls = updateCalls.filter((c: any) => c[0]?.data?.status === OperationalDocumentStatus.APPROVED);
      expect(approvedCalls.length).toBe(0);
    });

    it("TC-LIFE-04: Rejects direct posting when actor lacks PAYMENT_POST permission", async () => {
      const payment = seedPayment({ status: OperationalDocumentStatus.SUBMITTED });

      const actorWithoutPost = {
        companyId: COMPANY_ID,
        userId: USER_MAKER_ID,
        currencyCode: "PKR",
        permissions: ["PAYMENT_VIEW", "PAYMENT_CREATE"], // Lacks PAYMENT_POST
      };

      await expect(postPayment(actorWithoutPost, payment.id)).rejects.toMatchObject({
        status: 403,
        code: "FORBIDDEN",
      });
    });

    it("TC-LIFE-05: Direct posting is idempotent when voucher is already POSTED", async () => {
      const payment = seedPayment({
        status: OperationalDocumentStatus.POSTED,
        journalEntryId: "je-existing-1",
      });

      const actor = {
        companyId: COMPANY_ID,
        userId: USER_MAKER_ID,
        currencyCode: "PKR",
        permissions: ["PAYMENT_POST"],
      };

      const result = await postPayment(actor, payment.id);
      expect(result.status).toBe(OperationalDocumentStatus.POSTED);
      expect(mockTxClient.journalEntry.create).not.toHaveBeenCalled();
    });

    it("TC-LIFE-06: Rejects posting when voucher is in terminal CANCELLED or REVERSED state", async () => {
      const cancelledPayment = seedPayment({ status: OperationalDocumentStatus.CANCELLED });
      const reversedPayment = seedPayment({ status: OperationalDocumentStatus.REVERSED });

      const actor = {
        companyId: COMPANY_ID,
        userId: USER_MAKER_ID,
        currencyCode: "PKR",
        permissions: ["PAYMENT_POST"],
      };

      await expect(postPayment(actor, cancelledPayment.id)).rejects.toMatchObject({
        status: 409,
        code: "INVALID_DOCUMENT_STATE",
      });

      await expect(postPayment(actor, reversedPayment.id)).rejects.toMatchObject({
        status: 409,
        code: "INVALID_DOCUMENT_STATE",
      });
    });

    it("TC-LIFE-07: Static code analysis confirms eradication of assertSegregationOfDuties & assertApprovalPolicy in payments.ts", () => {
      const paymentsTs = fs.readFileSync(path.resolve("src/lib/operations/payments.ts"), "utf-8");

      expect(paymentsTs).not.toContain("assertSegregationOfDuties");
      expect(paymentsTs).not.toContain("assertApprovalPolicy");
      expect(paymentsTs).not.toContain("assertMakerChecker");

      // Verify postPayment specifically does not mutate status to APPROVED
      const postPaymentBlock = paymentsTs.slice(paymentsTs.indexOf("export async function postPayment"));
      expect(postPaymentBlock).not.toContain("status: OperationalDocumentStatus.APPROVED");
    });
  });

  // --------------------------------------------------------------------------
  // 2. APPROVAL QUEUE & ENDPOINT ELIMINATION
  // --------------------------------------------------------------------------
  describe("Approval Queue & Legacy Endpoint Decoupling", () => {
    it("TC-APPR-01: Approvals GET route does not query or return Payment vouchers", async () => {
      const res = await approvalsGetHandler();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toBeDefined();
      const items = Array.isArray(body.data) ? body.data : body.data.items;
      const paymentItems = items.filter((item: any) => item.documentType === "PAYMENT");
      expect(paymentItems.length).toBe(0);
    });

    it("TC-APPR-02: Approvals POST route rejects PAYMENT documentType with 400 or 422", async () => {
      const req = new Request("http://localhost:3000/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: "PAYMENT",
          id: "33333333-3333-4333-8333-333333333333",
          action: "approve",
        }),
      });

      const res = await approvalsPostHandler(req);
      expect([400, 422]).toContain(res.status);
    });

    it("TC-APPR-03: POST /api/payments/[id]/approve returns HTTP 410 Gone", async () => {
      const req = new Request("http://localhost:3000/api/payments/pay-123/approve", {
        method: "POST",
      });

      const res = await approveRouteHandler(req, { params: Promise.resolve({ id: "pay-123" }) });
      expect(res.status).toBe(410);

      const body = await res.json();
      expect(body.error?.code).toBe("APPROVAL_WORKFLOW_ELIMINATED");
    });

    it("TC-APPR-04: Static code analysis confirms prisma.payment is completely removed from approvals route.ts", () => {
      const approvalsRouteTs = fs.readFileSync(path.resolve("src/app/api/approvals/route.ts"), "utf-8");
      expect(approvalsRouteTs).not.toContain("prisma.payment");
      expect(approvalsRouteTs).not.toContain("approvePayment");
    });
  });

  // --------------------------------------------------------------------------
  // 3. VOUCHER CANCELLATION LIFECYCLE
  // --------------------------------------------------------------------------
  describe("Feature 4: Voucher Cancellation Lifecycle", () => {
    it("TC-CANC-01: Successfully cancels a SUBMITTED voucher and records reason without deleting records", async () => {
      const payment = seedPayment({
        status: OperationalDocumentStatus.SUBMITTED,
        notes: "Initial note",
      });

      const actor = {
        companyId: COMPANY_ID,
        userId: USER_MAKER_ID,
        currencyCode: "PKR",
        permissions: ["PAYMENT_CANCEL"],
      };

      const result = await cancelPayment(actor, payment.id, "Customer cheque bounced before banking");

      expect(result.status).toBe(OperationalDocumentStatus.CANCELLED);
      expect(result.notes).toContain("Cancellation reason: Customer cheque bounced before banking");

      // Verify record is preserved in database and NOT deleted
      expect(store.deletedPaymentIds).not.toContain(payment.id);
      const stored = store.payments.get(payment.id);
      expect(stored?.status).toBe(OperationalDocumentStatus.CANCELLED);
      expect(stored?.allocations.length).toBe(1); // Allocations preserved

      // Audit log check
      const audit = store.auditLogs.find((a) => a.action === "PAYMENT_CANCELLED");
      expect(audit).toBeDefined();
      expect(audit?.metadata?.reason).toBe("Customer cheque bounced before banking");
    });

    it("TC-CANC-02: Successfully cancels a DRAFT voucher", async () => {
      const payment = seedPayment({ status: OperationalDocumentStatus.DRAFT });
      const actor = {
        companyId: COMPANY_ID,
        userId: USER_MAKER_ID,
        currencyCode: "PKR",
        permissions: ["PAYMENT_CANCEL"],
      };

      const result = await cancelPayment(actor, payment.id, "User abandoned draft entry");
      expect(result.status).toBe(OperationalDocumentStatus.CANCELLED);
    });

    it("TC-CANC-03: Rejects cancellation if voucher is already POSTED (must use reversal instead)", async () => {
      const payment = seedPayment({ status: OperationalDocumentStatus.POSTED });
      const actor = {
        companyId: COMPANY_ID,
        userId: USER_MAKER_ID,
        currencyCode: "PKR",
        permissions: ["PAYMENT_CANCEL"],
      };

      await expect(cancelPayment(actor, payment.id, "Trying to cancel posted voucher")).rejects.toMatchObject({
        status: 409,
        code: "INVALID_DOCUMENT_STATE",
      });
    });

    it("TC-CANC-04: Rejects cancellation if actor lacks PAYMENT_CANCEL permission", async () => {
      const payment = seedPayment({ status: OperationalDocumentStatus.SUBMITTED });
      const actorWithoutCancel = {
        companyId: COMPANY_ID,
        userId: USER_MAKER_ID,
        currencyCode: "PKR",
        permissions: ["PAYMENT_VIEW"], // No cancel permission
      };

      await expect(cancelPayment(actorWithoutCancel, payment.id, "Valid reason")).rejects.toMatchObject({
        status: 403,
        code: "FORBIDDEN",
      });
    });

    it("TC-CANC-05: Cancelling an already CANCELLED voucher is idempotent", async () => {
      const payment = seedPayment({ status: OperationalDocumentStatus.CANCELLED });
      const actor = {
        companyId: COMPANY_ID,
        userId: USER_MAKER_ID,
        currencyCode: "PKR",
        permissions: ["PAYMENT_CANCEL"],
      };

      const result = await cancelPayment(actor, payment.id);
      expect(result.status).toBe(OperationalDocumentStatus.CANCELLED);
    });
  });

  // --------------------------------------------------------------------------
  // 4. VOUCHER REVERSAL LIFECYCLE
  // --------------------------------------------------------------------------
  describe("Feature 4: Voucher Reversal Lifecycle", () => {
    it("TC-REV-01: Reversing a POSTED voucher creates balanced reversing GL journal with inverted Dr/Cr", async () => {
      const originalJournalId = "je-orig-receipt-001";
      const originalJournal = {
        id: originalJournalId,
        companyId: COMPANY_ID,
        branchId: BRANCH_ID,
        periodId: FISCAL_PERIOD_ID,
        voucherNumber: "ISB-RC-FY2026-27-000001",
        voucherDate: new Date("2026-11-10"),
        postingDate: new Date("2026-11-10"),
        voucherType: JournalType.SYSTEM,
        status: JournalStatus.POSTED,
        narration: "CUSTOMER RECEIPT ISB-RC-001",
        referenceDocument: "REF-001",
        sourceModule: "PAYMENTS",
        sourceDocumentType: "Payment",
        sourceDocumentId: "pay-posted-001",
        sourceDocumentNumber: "ISB-RC-FY2026-27-000001",
        idempotencyKey: "PAYMENT:pay-posted-001",
        reversalOfId: null,
        totalDebit: new Prisma.Decimal("25000.0000"),
        totalCredit: new Prisma.Decimal("25000.0000"),
        preparedById: USER_MAKER_ID,
        approvedById: USER_MAKER_ID,
        postedById: USER_MAKER_ID,
        lines: [
          {
            id: "jl-1",
            journalEntryId: originalJournalId,
            accountId: CASH_ACCOUNT_ID,
            description: "Settlement received",
            debit: new Prisma.Decimal("25000.0000"),
            credit: new Prisma.Decimal("0.0000"),
            baseDebit: new Prisma.Decimal("25000.0000"),
            baseCredit: new Prisma.Decimal("0.0000"),
            customerId: CUSTOMER_ID,
            supplierId: null,
            bankAccountId: null,
          },
          {
            id: "jl-2",
            journalEntryId: originalJournalId,
            accountId: AR_CONTROL_ID,
            description: "Party ledger settlement",
            debit: new Prisma.Decimal("0.0000"),
            credit: new Prisma.Decimal("25000.0000"),
            baseDebit: new Prisma.Decimal("0.0000"),
            baseCredit: new Prisma.Decimal("25000.0000"),
            customerId: CUSTOMER_ID,
            supplierId: null,
            bankAccountId: null,
          },
        ],
      };
      store.journals.set(originalJournalId, originalJournal);

      const payment = seedPayment({
        id: "pay-posted-001",
        status: OperationalDocumentStatus.POSTED,
        journalEntryId: originalJournalId,
      });

      const actor = {
        companyId: COMPANY_ID,
        userId: USER_MAKER_ID,
        currencyCode: "PKR",
        permissions: ["PAYMENT_REVERSE"],
      };

      const reversed = await reversePayment(actor, payment.id, "Customer payment credited in error to wrong party");

      expect(reversed.status).toBe(OperationalDocumentStatus.REVERSED);
      expect(reversed.reversalOfId).toBe(payment.id);
      expect(reversed.reversedById).toBe(USER_MAKER_ID);
      expect(reversed.reversalReason).toBe("Customer payment credited in error to wrong party");

      // Verify reversing journal created with inverted Dr/Cr
      const reversalJournal = Array.from(store.journals.values()).find((j) => j.reversalOfId === originalJournalId);
      expect(reversalJournal).toBeDefined();
      expect(reversalJournal?.status).toBe(JournalStatus.POSTED);
      expect(reversalJournal?.voucherType).toBe(JournalType.REVERSAL);
      expect(reversalJournal?.totalDebit.toString()).toBe(reversalJournal?.totalCredit.toString());

      // Inverted lines verification: Debit AR, Credit Cash
      const revDebitLine = reversalJournal?.lines.find((l: any) => Number(l.debit?.toString() || l.debit) > 0);
      const revCreditLine = reversalJournal?.lines.find((l: any) => Number(l.credit?.toString() || l.credit) > 0);
      expect(revDebitLine?.accountId).toBe(AR_CONTROL_ID); // AR is now Debited!
      expect(revCreditLine?.accountId).toBe(CASH_ACCOUNT_ID); // Cash is now Credited!

      // Audit log check
      const audit = store.auditLogs.find((a) => a.action === "PAYMENT_REVERSED");
      expect(audit).toBeDefined();
      expect(audit?.entityId).toBe(payment.id);
      expect(audit?.metadata?.reason).toBe("Customer payment credited in error to wrong party");
    });

    it("TC-REV-02: Reversing a payment releases allocations so invoices regain their open balance", async () => {
      const originalJournalId = "je-orig-receipt-002";
      store.journals.set(originalJournalId, {
        id: originalJournalId,
        companyId: COMPANY_ID,
        branchId: BRANCH_ID,
        periodId: FISCAL_PERIOD_ID,
        voucherNumber: "ISB-RC-FY2026-27-000002",
        voucherDate: new Date("2026-11-10"),
        postingDate: new Date("2026-11-10"),
        voucherType: JournalType.SYSTEM,
        status: JournalStatus.POSTED,
        narration: "RECEIPT",
        referenceDocument: "REF-002",
        sourceModule: "PAYMENTS",
        sourceDocumentType: "Payment",
        sourceDocumentId: "pay-posted-002",
        sourceDocumentNumber: "ISB-RC-FY2026-27-000002",
        idempotencyKey: "PAYMENT:pay-posted-002",
        reversalOfId: null,
        totalDebit: new Prisma.Decimal("25000.0000"),
        totalCredit: new Prisma.Decimal("25000.0000"),
        preparedById: USER_MAKER_ID,
        approvedById: USER_MAKER_ID,
        postedById: USER_MAKER_ID,
        lines: [
          { id: "jl-1", journalEntryId: originalJournalId, accountId: CASH_ACCOUNT_ID, description: "Dr", debit: new Prisma.Decimal("25000"), credit: new Prisma.Decimal(0), baseDebit: new Prisma.Decimal("25000"), baseCredit: new Prisma.Decimal(0), customerId: CUSTOMER_ID, supplierId: null, bankAccountId: null },
          { id: "jl-2", journalEntryId: originalJournalId, accountId: AR_CONTROL_ID, description: "Cr", debit: new Prisma.Decimal(0), credit: new Prisma.Decimal("25000"), baseDebit: new Prisma.Decimal(0), baseCredit: new Prisma.Decimal("25000"), customerId: CUSTOMER_ID, supplierId: null, bankAccountId: null },
        ],
      });

      const payment = seedPayment({
        id: "pay-posted-002",
        status: OperationalDocumentStatus.POSTED,
        journalEntryId: originalJournalId,
        allocations: [{ id: "alloc-002", paymentId: "pay-posted-002", salesInvoiceId: "inv-palmpay-001", purchaseReceiptId: null, amount: new Prisma.Decimal("25000.0000") }],
      });

      // Before reversal: query settled amount on invoice
      const beforeQuery = await mockTxClient.$queryRaw`SELECT COALESCE(SUM(CASE p."direction" WHEN 'CUSTOMER_RECEIPT' THEN a."amount" ELSE -a."amount" END),0)::numeric(19,4) AS settled FROM "PaymentAllocation" a JOIN "Payment" p ON p."id" = a."paymentId" WHERE a."salesInvoiceId" = ${"inv-palmpay-001"}::uuid AND p."status" = 'POSTED'`;
      expect(beforeQuery[0].settled.toString()).toBe("25000");

      const actor = { companyId: COMPANY_ID, userId: USER_MAKER_ID, currencyCode: "PKR", permissions: ["PAYMENT_REVERSE"] };
      await reversePayment(actor, payment.id, "Authorized financial reversal");

      // After reversal: query settled amount on invoice
      const afterQuery = await mockTxClient.$queryRaw`SELECT COALESCE(SUM(CASE p."direction" WHEN 'CUSTOMER_RECEIPT' THEN a."amount" ELSE -a."amount" END),0)::numeric(19,4) AS settled FROM "PaymentAllocation" a JOIN "Payment" p ON p."id" = a."paymentId" WHERE a."salesInvoiceId" = ${"inv-palmpay-001"}::uuid AND p."status" = 'POSTED'`;
      expect(afterQuery[0].settled.toString()).toBe("0"); // 100% released!
    });

    it("TC-REV-03: Reversing a supplier payment voucher restores Accounts Payable control balance", async () => {
      const origJournalId = "je-orig-supplier-001";
      store.journals.set(origJournalId, {
        id: origJournalId,
        companyId: COMPANY_ID,
        branchId: BRANCH_ID,
        periodId: FISCAL_PERIOD_ID,
        voucherNumber: "ISB-PV-FY2026-27-000001",
        voucherDate: new Date("2026-11-10"),
        postingDate: new Date("2026-11-10"),
        voucherType: JournalType.SYSTEM,
        status: JournalStatus.POSTED,
        narration: "SUPPLIER PAYMENT",
        referenceDocument: "REF-PV-001",
        sourceModule: "PAYMENTS",
        sourceDocumentType: "Payment",
        sourceDocumentId: "pay-supplier-001",
        sourceDocumentNumber: "ISB-PV-FY2026-27-000001",
        idempotencyKey: "PAYMENT:pay-supplier-001",
        reversalOfId: null,
        totalDebit: new Prisma.Decimal("40000.0000"),
        totalCredit: new Prisma.Decimal("40000.0000"),
        preparedById: USER_MAKER_ID,
        approvedById: USER_MAKER_ID,
        postedById: USER_MAKER_ID,
        lines: [
          { id: "jl-1", journalEntryId: origJournalId, accountId: AP_CONTROL_ID, description: "Dr AP", debit: new Prisma.Decimal("40000"), credit: new Prisma.Decimal(0), baseDebit: new Prisma.Decimal("40000"), baseCredit: new Prisma.Decimal(0), customerId: null, supplierId: SUPPLIER_ID, bankAccountId: null },
          { id: "jl-2", journalEntryId: origJournalId, accountId: CASH_ACCOUNT_ID, description: "Cr Cash", debit: new Prisma.Decimal(0), credit: new Prisma.Decimal("40000"), baseDebit: new Prisma.Decimal(0), baseCredit: new Prisma.Decimal("40000"), customerId: null, supplierId: SUPPLIER_ID, bankAccountId: null },
        ],
      });

      const payment = seedPayment({
        id: "pay-supplier-001",
        direction: PaymentDirection.SUPPLIER_PAYMENT,
        customerId: null,
        supplierId: SUPPLIER_ID,
        status: OperationalDocumentStatus.POSTED,
        journalEntryId: origJournalId,
        amount: new Prisma.Decimal("40000.0000"),
        allocations: [{ id: "alloc-pv-01", paymentId: "pay-supplier-001", salesInvoiceId: null, purchaseReceiptId: "rec-samsung-001", amount: new Prisma.Decimal("40000.0000") }],
      });

      const actor = { companyId: COMPANY_ID, userId: USER_MAKER_ID, currencyCode: "PKR", permissions: ["PAYMENT_REVERSE"] };
      const reversed = await reversePayment(actor, payment.id, "Cancelled supplier disbursement due to incorrect vendor IBAN");

      expect(reversed.status).toBe(OperationalDocumentStatus.REVERSED);

      // Reversal journal has Dr Cash, Cr AP
      const revJournal = Array.from(store.journals.values()).find((j) => j.reversalOfId === origJournalId);
      expect(revJournal).toBeDefined();
      const drLine = revJournal?.lines.find((l: any) => Number(l.debit?.toString() || l.debit) > 0);
      const crLine = revJournal?.lines.find((l: any) => Number(l.credit?.toString() || l.credit) > 0);
      expect(drLine?.accountId).toBe(CASH_ACCOUNT_ID);
      expect(crLine?.accountId).toBe(AP_CONTROL_ID);
    });

    it("TC-REV-04: Rejects reversal if voucher is unposted (DRAFT or SUBMITTED)", async () => {
      const draft = seedPayment({ status: OperationalDocumentStatus.DRAFT });
      const submitted = seedPayment({ status: OperationalDocumentStatus.SUBMITTED });
      const actor = { companyId: COMPANY_ID, userId: USER_MAKER_ID, currencyCode: "PKR", permissions: ["PAYMENT_REVERSE"] };

      await expect(reversePayment(actor, draft.id, "Valid reason for reversal")).rejects.toMatchObject({
        status: 409,
        code: "INVALID_DOCUMENT_STATE",
      });

      await expect(reversePayment(actor, submitted.id, "Valid reason for reversal")).rejects.toMatchObject({
        status: 409,
        code: "INVALID_DOCUMENT_STATE",
      });
    });

    it("TC-REV-05: Rejects double reversal on an already REVERSED voucher", async () => {
      const payment = seedPayment({
        status: OperationalDocumentStatus.REVERSED,
        journalEntryId: "je-some-id",
        reversalOfId: "pay-prev-id",
      });
      const actor = { companyId: COMPANY_ID, userId: USER_MAKER_ID, currencyCode: "PKR", permissions: ["PAYMENT_REVERSE"] };

      await expect(reversePayment(actor, payment.id, "Attempting double reversal")).rejects.toMatchObject({
        status: 409,
        code: "PAYMENT_ALREADY_REVERSED",
      });
    });

    it("TC-REV-06: Rejects reversal when reason is missing or shorter than 5 characters", async () => {
      const payment = seedPayment({ status: OperationalDocumentStatus.POSTED, journalEntryId: "je-id" });
      const actor = { companyId: COMPANY_ID, userId: USER_MAKER_ID, currencyCode: "PKR", permissions: ["PAYMENT_REVERSE"] };

      await expect(reversePayment(actor, payment.id, "")).rejects.toMatchObject({
        status: 422,
        code: "REASON_REQUIRED",
      });

      await expect(reversePayment(actor, payment.id, "bad")).rejects.toMatchObject({
        status: 422,
        code: "REASON_REQUIRED",
      });
    });

    it("TC-REV-07: Rejects reversal when actor lacks PAYMENT_REVERSE permission", async () => {
      const payment = seedPayment({ status: OperationalDocumentStatus.POSTED, journalEntryId: "je-id" });
      const actorWithoutReverse = {
        companyId: COMPANY_ID,
        userId: USER_MAKER_ID,
        currencyCode: "PKR",
        permissions: ["PAYMENT_VIEW", "PAYMENT_POST"], // No reverse permission
      };

      await expect(reversePayment(actorWithoutReverse, payment.id, "Valid reason")).rejects.toMatchObject({
        status: 403,
        code: "FORBIDDEN",
      });
    });
  });

  // --------------------------------------------------------------------------
  // 5. HTTP ROUTE ENDPOINTS INTEGRATION
  // --------------------------------------------------------------------------
  describe("HTTP Route Handlers: Post, Cancel, Reverse", () => {
    it("TC-ROUTE-01: POST /api/payments/[id]/post executes direct post", async () => {
      const payment = seedPayment({ status: OperationalDocumentStatus.SUBMITTED });
      const req = new Request(`http://localhost:3000/api/payments/${payment.id}/post`, { method: "POST" });
      const res = await postRouteHandler(req, { params: Promise.resolve({ id: payment.id }) });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe(OperationalDocumentStatus.POSTED);
    });

    it("TC-ROUTE-02: POST /api/payments/[id]/cancel executes cancellation with reason", async () => {
      const payment = seedPayment({ status: OperationalDocumentStatus.SUBMITTED });
      const req = new Request(`http://localhost:3000/api/payments/${payment.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Customer requested cancellation via call" }),
      });

      const res = await cancelRouteHandler(req, { params: Promise.resolve({ id: payment.id }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe(OperationalDocumentStatus.CANCELLED);
    });

    it("TC-ROUTE-03: POST /api/payments/[id]/reverse executes reversal with reason", async () => {
      const httpPaymentId = "88888888-8888-4888-8888-888888888888";
      const origJournalId = "je-http-rev-01";
      store.journals.set(origJournalId, {
        id: origJournalId,
        companyId: COMPANY_ID,
        branchId: BRANCH_ID,
        periodId: FISCAL_PERIOD_ID,
        voucherNumber: "ISB-RC-FY2026-27-000009",
        voucherDate: new Date("2026-11-10"),
        postingDate: new Date("2026-11-10"),
        voucherType: JournalType.SYSTEM,
        status: JournalStatus.POSTED,
        narration: "RECEIPT",
        referenceDocument: "REF-009",
        sourceModule: "PAYMENTS",
        sourceDocumentType: "Payment",
        sourceDocumentId: httpPaymentId,
        sourceDocumentNumber: "ISB-RC-FY2026-27-000009",
        idempotencyKey: `PAYMENT:${httpPaymentId}`,
        reversalOfId: null,
        totalDebit: new Prisma.Decimal("10000"),
        totalCredit: new Prisma.Decimal("10000"),
        preparedById: USER_MAKER_ID,
        approvedById: USER_MAKER_ID,
        postedById: USER_MAKER_ID,
        lines: [
          { id: "jl-1", journalEntryId: origJournalId, accountId: CASH_ACCOUNT_ID, description: "Dr", debit: new Prisma.Decimal("10000"), credit: new Prisma.Decimal(0), baseDebit: new Prisma.Decimal("10000"), baseCredit: new Prisma.Decimal(0), customerId: CUSTOMER_ID, supplierId: null, bankAccountId: null },
          { id: "jl-2", journalEntryId: origJournalId, accountId: AR_CONTROL_ID, description: "Cr", debit: new Prisma.Decimal(0), credit: new Prisma.Decimal("10000"), baseDebit: new Prisma.Decimal(0), baseCredit: new Prisma.Decimal("10000"), customerId: CUSTOMER_ID, supplierId: null, bankAccountId: null },
        ],
      });

      const payment = seedPayment({
        id: httpPaymentId,
        status: OperationalDocumentStatus.POSTED,
        journalEntryId: origJournalId,
      });

      const req = new Request(`http://localhost:3000/api/payments/${payment.id}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Reversing due to duplicate customer bank transfer" }),
      });

      const res = await reverseRouteHandler(req, { params: Promise.resolve({ id: payment.id }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe(OperationalDocumentStatus.REVERSED);
      expect(body.data.reversalOfId).toBe(payment.id);
    });
  });
});
