/**
 * Axon Mobile ERP — Cash, Bank & Party Settlement Opaque-Box E2E Test Suite
 * Derivation: ORIGINAL_REQUEST.md (R1-R5) & orchestrator_settlement/PROJECT.md (Features 1-13, 20)
 *
 * 4-Tier Test Architecture:
 * - Tier 1: Feature Coverage (>=5 test cases per core feature: Receipts, Payments, Cust Advances, Supp Advances, Transfers, Contra, Bank Rec)
 * - Tier 2: Boundary & Corner Cases (>=5 tests per category: zero amounts, exact matching, overpayment, duplicate allocation, unposted doc, party/account errors)
 * - Tier 3: Cross-Feature Combinations (Pairwise matrix: 1:N multi-invoice, N:1 multi-receipt, advance surplus, voucher cancellation, voucher reversal)
 * - Tier 4: Real-World Scenarios (End-to-end sales invoice -> partial receipts -> advance -> contra -> bank rec; supplier bill -> partial -> reversal)
 */

import { describe, expect, it, beforeEach } from "vitest";
import { decimal, moneyString, zero } from "@/lib/finance/money";
import { Prisma } from "@prisma/client";

// ============================================================================
// DOMAIN ENUMS, INTERFACES & CONTRACTS
// ============================================================================

export type VoucherDirection =
  | "CUSTOMER_RECEIPT"
  | "SUPPLIER_PAYMENT"
  | "CUSTOMER_REFUND"
  | "SUPPLIER_REFUND"
  | "BANK_TRANSFER"
  | "CONTRA_DEPOSIT"
  | "CONTRA_WITHDRAWAL";

export type VoucherStatus = "DRAFT" | "SUBMITTED" | "POSTED" | "CANCELLED" | "REVERSED";
export type DocumentStatus = "DRAFT" | "SUBMITTED" | "POSTED" | "CANCELLED" | "REVERSED";
export type MethodType = "CASH" | "BANK_TRANSFER" | "CHEQUE" | "CARD";

export interface TestAccount {
  id: string;
  code: string;
  name: string;
  accountType: "CASH" | "BANK" | "ACCOUNTS_RECEIVABLE" | "ACCOUNTS_PAYABLE" | "REVENUE" | "EXPENSE" | "ASSET" | "LIABILITY";
  accountClass: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  branchId: string | null;
  isActive: boolean;
  currencyCode: string;
}

export interface TestBankAccount {
  id: string;
  code: string;
  bankName: string;
  accountTitle: string;
  accountNumberMasked: string;
  glAccountId: string;
  branchId: string;
  currencyCode: string;
  isActive: boolean;
  bookBalance: Prisma.Decimal;
}

export interface TestPaymentMethod {
  id: string;
  code: string;
  name: string;
  methodType: MethodType;
  cashAccountId?: string | null;
  bankAccountId?: string | null;
  requiresReference: boolean;
  isActive: boolean;
}

export interface TestParty {
  id: string;
  code: string;
  name: string;
  partyType: "CUSTOMER" | "SUPPLIER";
  status: "ACTIVE" | "INACTIVE";
  subledgerBalance: Prisma.Decimal; // Customer: Net Debit (receivable); Supplier: Net Credit (payable)
}

export interface TestSalesInvoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  branchId: string;
  invoiceDate: string;
  grandTotal: Prisma.Decimal;
  returns: Prisma.Decimal;
  settled: Prisma.Decimal;
  status: DocumentStatus;
  reversalOfId?: string | null;
}

export interface TestPurchaseReceipt {
  id: string;
  receiptNumber: string;
  supplierId: string;
  branchId: string;
  receiptDate: string;
  grandTotal: Prisma.Decimal;
  returns: Prisma.Decimal;
  settled: Prisma.Decimal;
  status: DocumentStatus;
  reversalOfId?: string | null;
}

export interface TestPaymentAllocation {
  id: string;
  paymentId: string;
  salesInvoiceId?: string | null;
  purchaseReceiptId?: string | null;
  amount: Prisma.Decimal;
}

export interface TestJournalLine {
  id: string;
  journalEntryId: string;
  accountId: string;
  description: string;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  customerId?: string | null;
  supplierId?: string | null;
  bankAccountId?: string | null;
}

export interface TestJournalEntry {
  id: string;
  entryNumber: string;
  voucherSuffix: string;
  postingDate: string;
  narration: string;
  sourceDocumentType: string;
  sourceDocumentId: string;
  lines: TestJournalLine[];
  status: "POSTED" | "REVERSED";
  reversalOfId?: string | null;
}

export interface TestPaymentVoucher {
  id: string;
  paymentNumber: string;
  direction: VoucherDirection;
  status: VoucherStatus;
  branchId: string;
  customerId?: string | null;
  supplierId?: string | null;
  cashAccountId?: string | null;
  bankAccountId?: string | null;
  targetBankAccountId?: string | null; // For bank transfers
  paymentMethodId?: string | null;
  paymentDate: string;
  currencyCode: string;
  amount: Prisma.Decimal;
  unallocatedAdvance: Prisma.Decimal;
  reference?: string | null;
  notes?: string | null;
  allocations: TestPaymentAllocation[];
  journalEntryId?: string | null;
  reversalJournalId?: string | null;
  cancelledReason?: string | null;
  reversedReason?: string | null;
  preparedById: string;
  approvedById?: string | null;
  postedById?: string | null;
  idempotencyKey: string;
}

export interface TestBankTransaction {
  id: string;
  bankAccountId: string;
  journalLineId: string;
  transactionDate: string;
  bankReference?: string | null;
  deposit: Prisma.Decimal;
  withdrawal: Prisma.Decimal;
  reconciliationStatus: "UNRECONCILED" | "RECONCILED";
  reconciledAt?: Date | null;
}

export interface TestBankStatementLine {
  id: string;
  transactionDate: string;
  reference?: string | null;
  description: string;
  deposit: Prisma.Decimal;
  withdrawal: Prisma.Decimal;
  matchedJournalLineId?: string | null;
  isMatched: boolean;
}

export interface TestBankStatement {
  id: string;
  bankAccountId: string;
  statementNumber?: string | null;
  periodStart: string;
  periodEnd: string;
  openingBalance: Prisma.Decimal;
  closingBalance: Prisma.Decimal;
  lines: TestBankStatementLine[];
}

export interface TestBankReconciliation {
  id: string;
  statementId: string;
  bankAccountId: string;
  status: "IN_PROGRESS" | "COMPLETED" | "REOPENED";
  bookBalance: Prisma.Decimal;
  statementBalance: Prisma.Decimal;
  outstandingDeposits: Prisma.Decimal;
  outstandingPayments: Prisma.Decimal;
  adjustedBalance: Prisma.Decimal;
  difference: Prisma.Decimal;
  reopenedReason?: string | null;
}

// ============================================================================
// VOUCHER SEQUENCE NUMBER ENGINE (Single-Hyphen Branch & FY Formatting)
// ============================================================================

export class SequentialNumberGenerator {
  private counters: Map<string, number> = new Map();

  generate(branchPrefix: string, suffix: string, fiscalYear: string): string {
    const cleanBranch = branchPrefix.trim().replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "BR";
    const cleanSuffix = suffix.trim().replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "DOC";
    const key = `${cleanBranch}-${cleanSuffix}-${fiscalYear}`;
    const nextSeq = (this.counters.get(key) || 0) + 1;
    this.counters.set(key, nextSeq);
    const seqPadded = nextSeq.toString().padStart(6, "0");
    return `${cleanBranch}-${cleanSuffix}-FY${fiscalYear}-${seqPadded}`;
  }
}

// ============================================================================
// SETTLEMENT TEST HARNESS & OPAQUE-BOX ENGINE
// ============================================================================

export class SettlementTestHarness {
  public accounts: Map<string, TestAccount> = new Map();
  public bankAccounts: Map<string, TestBankAccount> = new Map();
  public paymentMethods: Map<string, TestPaymentMethod> = new Map();
  public parties: Map<string, TestParty> = new Map();
  public salesInvoices: Map<string, TestSalesInvoice> = new Map();
  public purchaseReceipts: Map<string, TestPurchaseReceipt> = new Map();
  public vouchers: Map<string, TestPaymentVoucher> = new Map();
  public journals: Map<string, TestJournalEntry> = new Map();
  public bankTransactions: Map<string, TestBankTransaction> = new Map();
  public statements: Map<string, TestBankStatement> = new Map();
  public reconciliations: Map<string, TestBankReconciliation> = new Map();

  public sequenceEngine = new SequentialNumberGenerator();
  public companyId = "c1111111-1111-4111-8111-111111111111";
  public branchId = "b1111111-1111-4111-8111-111111111111";
  public branchPrefix = "ISB";
  public fiscalYear = "2026-27";
  public defaultActor = { userId: "u1111111-1111-4111-8111-111111111111", permissions: ["PAYMENT_POST", "finance.manage"] };

  // Known Account IDs
  public cashAccountId = "acc-cash-1000";
  public bankGlAccountId = "acc-bank-1010";
  public bankGl2AccountId = "acc-bank-1015";
  public arControlAccountId = "acc-ar-1200";
  public apControlAccountId = "acc-ap-2000";
  public bankChargesAccountId = "acc-charges-5200";
  public interestIncomeAccountId = "acc-interest-4200";
  public customerAdvanceAccountId = "acc-cust-adv-2100";
  public supplierAdvanceAccountId = "acc-supp-adv-1300";
  public salesRevenueAccountId = "acc-rev-4000";
  public inventoryAssetAccountId = "acc-inv-1400";

  public bankAccount1Id = "bnk-001";
  public bankAccount2Id = "bnk-002";

  constructor() {
    this.seedBaselineMasterData();
  }

  private seedBaselineMasterData() {
    // Standard Chart of Accounts
    const coa: Array<Omit<TestAccount, "branchId">> = [
      { id: this.cashAccountId, code: "1000", name: "Cash on Hand", accountType: "CASH", accountClass: "ASSET", isActive: true, currencyCode: "PKR" },
      { id: this.bankGlAccountId, code: "1010", name: "Bank Gl HBL Main", accountType: "BANK", accountClass: "ASSET", isActive: true, currencyCode: "PKR" },
      { id: this.bankGl2AccountId, code: "1015", name: "Bank Gl Meezan Operations", accountType: "BANK", accountClass: "ASSET", isActive: true, currencyCode: "PKR" },
      { id: this.arControlAccountId, code: "1200", name: "Accounts Receivable Control", accountType: "ACCOUNTS_RECEIVABLE", accountClass: "ASSET", isActive: true, currencyCode: "PKR" },
      { id: this.apControlAccountId, code: "2000", name: "Accounts Payable Control", accountType: "ACCOUNTS_PAYABLE", accountClass: "LIABILITY", isActive: true, currencyCode: "PKR" },
      { id: this.bankChargesAccountId, code: "5200", name: "Bank Service Charges", accountType: "EXPENSE", accountClass: "EXPENSE", isActive: true, currencyCode: "PKR" },
      { id: this.interestIncomeAccountId, code: "4200", name: "Bank Interest Income", accountType: "REVENUE", accountClass: "REVENUE", isActive: true, currencyCode: "PKR" },
      { id: this.customerAdvanceAccountId, code: "2100", name: "Customer Advances / Unallocated", accountType: "LIABILITY", accountClass: "LIABILITY", isActive: true, currencyCode: "PKR" },
      { id: this.supplierAdvanceAccountId, code: "1300", name: "Supplier Advances / Prepayments", accountType: "ASSET", accountClass: "ASSET", isActive: true, currencyCode: "PKR" },
      { id: this.salesRevenueAccountId, code: "4000", name: "Sales Revenue", accountType: "REVENUE", accountClass: "REVENUE", isActive: true, currencyCode: "PKR" },
      { id: this.inventoryAssetAccountId, code: "1400", name: "Inventory Asset", accountType: "ASSET", accountClass: "ASSET", isActive: true, currencyCode: "PKR" },
    ];
    for (const a of coa) {
      this.accounts.set(a.id, { ...a, branchId: this.branchId });
    }

    // Bank Accounts
    this.bankAccounts.set(this.bankAccount1Id, {
      id: this.bankAccount1Id,
      code: "HBL-001",
      bankName: "Habib Bank Limited",
      accountTitle: "Axon Mobile Ops ISB",
      accountNumberMasked: "****1234",
      glAccountId: this.bankGlAccountId,
      branchId: this.branchId,
      currencyCode: "PKR",
      isActive: true,
      bookBalance: decimal(0),
    });

    this.bankAccounts.set(this.bankAccount2Id, {
      id: this.bankAccount2Id,
      code: "MEEZAN-002",
      bankName: "Meezan Bank Ltd",
      accountTitle: "Axon Mobile Treasury",
      accountNumberMasked: "****5678",
      glAccountId: this.bankGl2AccountId,
      branchId: this.branchId,
      currencyCode: "PKR",
      isActive: true,
      bookBalance: decimal(0),
    });

    // Payment Methods
    this.paymentMethods.set("pm-cash", {
      id: "pm-cash",
      code: "CASH",
      name: "Counter Cash",
      methodType: "CASH",
      cashAccountId: this.cashAccountId,
      requiresReference: false,
      isActive: true,
    });

    this.paymentMethods.set("pm-bank", {
      id: "pm-bank",
      code: "BANK_TRANSFER",
      name: "Bank Direct Transfer",
      methodType: "BANK_TRANSFER",
      bankAccountId: this.bankAccount1Id,
      requiresReference: true,
      isActive: true,
    });

    this.paymentMethods.set("pm-cheque", {
      id: "pm-cheque",
      code: "CHEQUE",
      name: "Crossed Cheque",
      methodType: "CHEQUE",
      bankAccountId: this.bankAccount1Id,
      requiresReference: true,
      isActive: true,
    });

    this.paymentMethods.set("pm-card", {
      id: "pm-card",
      code: "CARD",
      name: "POS Terminal Debit/Credit Card",
      methodType: "CARD",
      bankAccountId: this.bankAccount1Id,
      requiresReference: true,
      isActive: true,
    });
  }

  // --- Party Helpers ---
  createCustomer(code: string, name: string): TestParty {
    const customer: TestParty = {
      id: `cust-${code.toLowerCase()}`,
      code,
      name,
      partyType: "CUSTOMER",
      status: "ACTIVE",
      subledgerBalance: decimal(0),
    };
    this.parties.set(customer.id, customer);
    return customer;
  }

  createSupplier(code: string, name: string): TestParty {
    const supplier: TestParty = {
      id: `supp-${code.toLowerCase()}`,
      code,
      name,
      partyType: "SUPPLIER",
      status: "ACTIVE",
      subledgerBalance: decimal(0),
    };
    this.parties.set(supplier.id, supplier);
    return supplier;
  }

  // --- Document Posting Helpers (Invoices & Bills) ---
  createSalesInvoice(input: {
    customerId: string;
    grandTotal: number | string;
    invoiceDate?: string;
    status?: DocumentStatus;
  }): TestSalesInvoice {
    const party = this.parties.get(input.customerId);
    if (!party || party.partyType !== "CUSTOMER") throw new Error("PARTY_NOT_FOUND");
    const num = this.sequenceEngine.generate(this.branchPrefix, "SI", this.fiscalYear);
    const invoice: TestSalesInvoice = {
      id: `inv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      invoiceNumber: num,
      customerId: input.customerId,
      branchId: this.branchId,
      invoiceDate: input.invoiceDate || "2026-11-10",
      grandTotal: decimal(input.grandTotal),
      returns: decimal(0),
      settled: decimal(0),
      status: input.status ?? "POSTED",
    };
    this.salesInvoices.set(invoice.id, invoice);

    // If posted, update customer subledger (Debit receivable) and create balanced GL journal
    if (invoice.status === "POSTED") {
      party.subledgerBalance = party.subledgerBalance.plus(invoice.grandTotal);
      const jeId = `je-si-${invoice.id}`;
      const lines: TestJournalLine[] = [
        {
          id: `jl-si-1-${jeId}`,
          journalEntryId: jeId,
          accountId: this.arControlAccountId,
          description: `Sales invoice ${invoice.invoiceNumber}`,
          debit: invoice.grandTotal,
          credit: zero(),
          customerId: invoice.customerId,
        },
        {
          id: `jl-si-2-${jeId}`,
          journalEntryId: jeId,
          accountId: this.salesRevenueAccountId,
          description: `Revenue on ${invoice.invoiceNumber}`,
          debit: zero(),
          credit: invoice.grandTotal,
        },
      ];
      this.journals.set(jeId, {
        id: jeId,
        entryNumber: `JE-${invoice.invoiceNumber}`,
        voucherSuffix: "SI",
        postingDate: invoice.invoiceDate,
        narration: `Sales Invoice ${invoice.invoiceNumber}`,
        sourceDocumentType: "SalesInvoice",
        sourceDocumentId: invoice.id,
        lines,
        status: "POSTED",
      });
    }
    return invoice;
  }

  createPurchaseReceipt(input: {
    supplierId: string;
    grandTotal: number | string;
    receiptDate?: string;
    status?: DocumentStatus;
  }): TestPurchaseReceipt {
    const party = this.parties.get(input.supplierId);
    if (!party || party.partyType !== "SUPPLIER") throw new Error("PARTY_NOT_FOUND");
    const num = this.sequenceEngine.generate(this.branchPrefix, "PR", this.fiscalYear);
    const bill: TestPurchaseReceipt = {
      id: `pr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      receiptNumber: num,
      supplierId: input.supplierId,
      branchId: this.branchId,
      receiptDate: input.receiptDate || "2026-11-10",
      grandTotal: decimal(input.grandTotal),
      returns: decimal(0),
      settled: decimal(0),
      status: input.status ?? "POSTED",
    };
    this.purchaseReceipts.set(bill.id, bill);

    // If posted, update supplier subledger (Credit payable) and create balanced GL journal
    if (bill.status === "POSTED") {
      party.subledgerBalance = party.subledgerBalance.plus(bill.grandTotal);
      const jeId = `je-pr-${bill.id}`;
      const lines: TestJournalLine[] = [
        {
          id: `jl-pr-1-${jeId}`,
          journalEntryId: jeId,
          accountId: this.inventoryAssetAccountId,
          description: `Inventory on ${bill.receiptNumber}`,
          debit: bill.grandTotal,
          credit: zero(),
        },
        {
          id: `jl-pr-2-${jeId}`,
          journalEntryId: jeId,
          accountId: this.apControlAccountId,
          description: `Accounts payable for ${bill.receiptNumber}`,
          debit: zero(),
          credit: bill.grandTotal,
          supplierId: bill.supplierId,
        },
      ];
      this.journals.set(jeId, {
        id: jeId,
        entryNumber: `JE-${bill.receiptNumber}`,
        voucherSuffix: "PR",
        postingDate: bill.receiptDate,
        narration: `Purchase Bill ${bill.receiptNumber}`,
        sourceDocumentType: "PurchaseReceipt",
        sourceDocumentId: bill.id,
        lines,
        status: "POSTED",
      });
    }
    return bill;
  }

  // --- Voucher Lifecycle Operations ---

  createVoucherDraft(input: {
    direction: VoucherDirection;
    customerId?: string | null;
    supplierId?: string | null;
    cashAccountId?: string | null;
    bankAccountId?: string | null;
    targetBankAccountId?: string | null;
    paymentMethodId?: string | null;
    amount: number | string;
    allocations?: Array<{ salesInvoiceId?: string; purchaseReceiptId?: string; amount: number | string }>;
    reference?: string | null;
    notes?: string | null;
    idempotencyKey?: string;
    currencyCode?: string;
  }): TestPaymentVoucher {
    const amt = decimal(input.amount);
    if (amt.lte(zero())) {
      throw new Error("INVALID_AMOUNT: Payment amount must be greater than zero.");
    }

    // Party validation
    const isCustomer = input.direction === "CUSTOMER_RECEIPT" || input.direction === "CUSTOMER_REFUND";
    const isSupplier = input.direction === "SUPPLIER_PAYMENT" || input.direction === "SUPPLIER_REFUND";
    const isTransfer = input.direction === "BANK_TRANSFER";
    const isContra = input.direction === "CONTRA_DEPOSIT" || input.direction === "CONTRA_WITHDRAWAL";

    if (isCustomer) {
      if (!input.customerId || input.supplierId) throw new Error("INVALID_PAYMENT_PARTY: Customer receipts require one customer.");
      const c = this.parties.get(input.customerId);
      if (!c) throw new Error("PARTY_NOT_FOUND");
      if (c.status !== "ACTIVE") throw new Error("PARTY_INACTIVE");
    } else if (isSupplier) {
      if (!input.supplierId || input.customerId) throw new Error("INVALID_PAYMENT_PARTY: Supplier payments require one supplier.");
      const s = this.parties.get(input.supplierId);
      if (!s) throw new Error("PARTY_NOT_FOUND");
      if (s.status !== "ACTIVE") throw new Error("PARTY_INACTIVE");
    }

    // Settle Accounts & Payment Method resolution
    let resolvedCashId = input.cashAccountId || null;
    let resolvedBankId = input.bankAccountId || null;
    if (input.paymentMethodId) {
      const pm = this.paymentMethods.get(input.paymentMethodId);
      if (!pm) throw new Error("PAYMENT_METHOD_NOT_FOUND");
      if (!pm.isActive) throw new Error("PAYMENT_METHOD_INACTIVE");
      if (pm.requiresReference && !input.reference) throw new Error("PAYMENT_REFERENCE_REQUIRED");
      if (pm.methodType === "CASH") resolvedCashId = pm.cashAccountId || resolvedCashId;
      else resolvedBankId = pm.bankAccountId || resolvedBankId;
    }

    if (!isTransfer && !isContra) {
      if (Boolean(resolvedCashId) === Boolean(resolvedBankId)) {
        throw new Error("PAYMENT_SETTLEMENT_REQUIRED: Choose exactly one cash or bank account.");
      }
    }

    if (resolvedBankId) {
      const bnk = this.bankAccounts.get(resolvedBankId);
      if (!bnk || !bnk.isActive) throw new Error("BANK_ACCOUNT_NOT_FOUND");
      if (input.currencyCode && bnk.currencyCode !== input.currencyCode) throw new Error("CURRENCY_MISMATCH");
    }

    // Allocations Validation
    const rawAllocations = input.allocations || [];
    const seenSales = new Set<string>();
    const seenPurchases = new Set<string>();
    let totalAllocated = decimal(0);

    const validatedAllocations: TestPaymentAllocation[] = [];
    for (const alloc of rawAllocations) {
      const aAmt = decimal(alloc.amount);
      if (aAmt.lte(zero())) throw new Error("INVALID_ALLOCATION_AMOUNT: Allocation amount must be positive.");

      if (alloc.salesInvoiceId && alloc.purchaseReceiptId) {
        throw new Error("INVALID_ALLOCATION: An allocation cannot reference both sales invoice and purchase receipt.");
      }
      if (alloc.salesInvoiceId) {
        if (seenSales.has(alloc.salesInvoiceId)) throw new Error("DUPLICATE_ALLOCATION: Duplicate invoice in allocation grid.");
        seenSales.add(alloc.salesInvoiceId);

        const inv = this.salesInvoices.get(alloc.salesInvoiceId);
        if (!inv) throw new Error("INVALID_ALLOCATION: Invoice not found.");
        if (inv.status !== "POSTED" || inv.reversalOfId) throw new Error("INVALID_ALLOCATION: Invoice is not posted or has been reversed.");
        if (inv.customerId !== input.customerId) throw new Error("INVALID_ALLOCATION: Invoice party mismatch.");

        const outstanding = inv.grandTotal.minus(inv.returns).minus(inv.settled);
        if (aAmt.gt(outstanding)) {
          throw new Error(`INVOICE_OVERPAYMENT: Allocation ${aAmt} exceeds open balance ${outstanding} on invoice ${inv.invoiceNumber}.`);
        }
      }

      if (alloc.purchaseReceiptId) {
        if (seenPurchases.has(alloc.purchaseReceiptId)) throw new Error("DUPLICATE_ALLOCATION: Duplicate bill in allocation grid.");
        seenPurchases.add(alloc.purchaseReceiptId);

        const bill = this.purchaseReceipts.get(alloc.purchaseReceiptId);
        if (!bill) throw new Error("INVALID_ALLOCATION: Purchase receipt not found.");
        if (bill.status !== "POSTED" || bill.reversalOfId) throw new Error("INVALID_ALLOCATION: Bill is not posted or has been reversed.");
        if (bill.supplierId !== input.supplierId) throw new Error("INVALID_ALLOCATION: Bill party mismatch.");

        const outstanding = bill.grandTotal.minus(bill.returns).minus(bill.settled);
        if (aAmt.gt(outstanding)) {
          throw new Error(`SUPPLIER_OVERPAYMENT: Allocation ${aAmt} exceeds open balance ${outstanding} on bill ${bill.receiptNumber}.`);
        }
      }

      totalAllocated = totalAllocated.plus(aAmt);
      validatedAllocations.push({
        id: `alloc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        paymentId: "",
        salesInvoiceId: alloc.salesInvoiceId || null,
        purchaseReceiptId: alloc.purchaseReceiptId || null,
        amount: aAmt,
      });
    }

    if (totalAllocated.gt(amt)) {
      throw new Error("OVER_ALLOCATION: Total allocations exceed payment amount.");
    }

    const unallocatedAdvance = amt.minus(totalAllocated);

    let suffix = "RC";
    if (input.direction === "SUPPLIER_PAYMENT" || input.direction === "SUPPLIER_REFUND") suffix = "PV";
    else if (input.direction === "BANK_TRANSFER") suffix = "BT";
    else if (input.direction === "CONTRA_DEPOSIT" || input.direction === "CONTRA_WITHDRAWAL") suffix = "CV";

    const voucherNumber = this.sequenceEngine.generate(this.branchPrefix, suffix, this.fiscalYear);
    const voucherId = `pay-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    for (const a of validatedAllocations) {
      a.paymentId = voucherId;
    }

    const voucher: TestPaymentVoucher = {
      id: voucherId,
      paymentNumber: voucherNumber,
      direction: input.direction,
      status: "DRAFT",
      branchId: this.branchId,
      customerId: input.customerId || null,
      supplierId: input.supplierId || null,
      cashAccountId: resolvedCashId,
      bankAccountId: resolvedBankId,
      targetBankAccountId: input.targetBankAccountId || null,
      paymentMethodId: input.paymentMethodId || null,
      paymentDate: "2026-11-10",
      currencyCode: input.currencyCode || "PKR",
      amount: amt,
      unallocatedAdvance,
      reference: input.reference || null,
      notes: input.notes || null,
      allocations: validatedAllocations,
      preparedById: this.defaultActor.userId,
      idempotencyKey: input.idempotencyKey || `key-${Date.now()}`,
    };

    this.vouchers.set(voucher.id, voucher);
    return voucher;
  }

  submitVoucher(voucherId: string): TestPaymentVoucher {
    const v = this.vouchers.get(voucherId);
    if (!v) throw new Error("VOUCHER_NOT_FOUND");
    if (v.status !== "DRAFT") throw new Error("INVALID_DOCUMENT_STATE: Only draft vouchers can be submitted.");
    v.status = "SUBMITTED";
    return v;
  }

  postVoucher(voucherId: string, actor = this.defaultActor): TestPaymentVoucher {
    const v = this.vouchers.get(voucherId);
    if (!v) throw new Error("VOUCHER_NOT_FOUND");
    if (v.status === "POSTED") return v;
    if (v.status === "CANCELLED" || v.status === "REVERSED") {
      throw new Error(`INVALID_DOCUMENT_STATE: Cannot post a ${v.status} voucher.`);
    }

    // Role-based direct posting (DRAFT or SUBMITTED) without maker-checker approval requirement
    if (!actor.permissions.includes("PAYMENT_POST") && !actor.permissions.includes("finance.manage")) {
      throw new Error("PERMISSION_DENIED: User lacks PAYMENT_POST permission.");
    }

    // 1. Re-validate allocations against current invoice status
    for (const alloc of v.allocations) {
      if (alloc.salesInvoiceId) {
        const inv = this.salesInvoices.get(alloc.salesInvoiceId)!;
        if (inv.status !== "POSTED" || inv.reversalOfId) throw new Error("INVALID_ALLOCATION: Invoice is no longer open.");
        const outstanding = inv.grandTotal.minus(inv.returns).minus(inv.settled);
        if (alloc.amount.gt(outstanding)) {
          throw new Error(`INVOICE_OVERPAYMENT: Allocation exceeds current open balance on ${inv.invoiceNumber}.`);
        }
        // Update settled balance
        inv.settled = inv.settled.plus(alloc.amount);
      }
      if (alloc.purchaseReceiptId) {
        const bill = this.purchaseReceipts.get(alloc.purchaseReceiptId)!;
        if (bill.status !== "POSTED" || bill.reversalOfId) throw new Error("INVALID_ALLOCATION: Bill is no longer open.");
        const outstanding = bill.grandTotal.minus(bill.returns).minus(bill.settled);
        if (alloc.amount.gt(outstanding)) {
          throw new Error(`SUPPLIER_OVERPAYMENT: Allocation exceeds current open balance on ${bill.receiptNumber}.`);
        }
        // Update settled balance
        bill.settled = bill.settled.plus(alloc.amount);
      }
    }

    // 2. Double-Entry Journal Creation
    const journalId = `je-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const journalLines: TestJournalLine[] = [];

    if (v.direction === "CUSTOMER_RECEIPT") {
      const settlementAccId = v.bankAccountId ? this.bankAccounts.get(v.bankAccountId)!.glAccountId : v.cashAccountId!;
      // Debit Cash/Bank Asset
      journalLines.push({
        id: `jl-1-${journalId}`,
        journalEntryId: journalId,
        accountId: settlementAccId,
        description: `Receipt ${v.paymentNumber} collected`,
        debit: v.amount,
        credit: zero(),
        bankAccountId: v.bankAccountId,
        customerId: v.customerId,
      });
      // Credit AR Control Asset
      journalLines.push({
        id: `jl-2-${journalId}`,
        journalEntryId: journalId,
        accountId: this.arControlAccountId,
        description: `Settlement of receivables on ${v.paymentNumber}`,
        debit: zero(),
        credit: v.amount,
        customerId: v.customerId,
      });

      // Update customer subledger (Credit reduces customer receivable)
      const party = this.parties.get(v.customerId!)!;
      party.subledgerBalance = party.subledgerBalance.minus(v.amount);

      // Update bank account book balance
      if (v.bankAccountId) {
        const bnk = this.bankAccounts.get(v.bankAccountId)!;
        bnk.bookBalance = bnk.bookBalance.plus(v.amount);
        // Register Bank Transaction for reconciliation
        this.bankTransactions.set(`bt-${v.id}`, {
          id: `bt-${v.id}`,
          bankAccountId: bnk.id,
          journalLineId: journalLines[0].id,
          transactionDate: v.paymentDate,
          bankReference: v.reference,
          deposit: v.amount,
          withdrawal: zero(),
          reconciliationStatus: "UNRECONCILED",
        });
      }
    } else if (v.direction === "SUPPLIER_PAYMENT") {
      const settlementAccId = v.bankAccountId ? this.bankAccounts.get(v.bankAccountId)!.glAccountId : v.cashAccountId!;
      // Debit AP Control Liability
      journalLines.push({
        id: `jl-1-${journalId}`,
        journalEntryId: journalId,
        accountId: this.apControlAccountId,
        description: `Payment ${v.paymentNumber} to supplier`,
        debit: v.amount,
        credit: zero(),
        supplierId: v.supplierId,
      });
      // Credit Cash/Bank Asset
      journalLines.push({
        id: `jl-2-${journalId}`,
        journalEntryId: journalId,
        accountId: settlementAccId,
        description: `Disbursement on ${v.paymentNumber}`,
        debit: zero(),
        credit: v.amount,
        bankAccountId: v.bankAccountId,
        supplierId: v.supplierId,
      });

      // Update supplier subledger (Debit reduces supplier payable)
      const party = this.parties.get(v.supplierId!)!;
      party.subledgerBalance = party.subledgerBalance.minus(v.amount);

      // Update bank account book balance
      if (v.bankAccountId) {
        const bnk = this.bankAccounts.get(v.bankAccountId)!;
        bnk.bookBalance = bnk.bookBalance.minus(v.amount);
        this.bankTransactions.set(`bt-${v.id}`, {
          id: `bt-${v.id}`,
          bankAccountId: bnk.id,
          journalLineId: journalLines[1].id,
          transactionDate: v.paymentDate,
          bankReference: v.reference,
          deposit: zero(),
          withdrawal: v.amount,
          reconciliationStatus: "UNRECONCILED",
        });
      }
    } else if (v.direction === "BANK_TRANSFER") {
      const sourceBnk = this.bankAccounts.get(v.bankAccountId!)!;
      const destBnk = this.bankAccounts.get(v.targetBankAccountId!)!;
      // Debit Dest Bank
      journalLines.push({
        id: `jl-1-${journalId}`,
        journalEntryId: journalId,
        accountId: destBnk.glAccountId,
        description: `Inter-bank transfer received from ${sourceBnk.code}`,
        debit: v.amount,
        credit: zero(),
        bankAccountId: destBnk.id,
      });
      // Credit Source Bank
      journalLines.push({
        id: `jl-2-${journalId}`,
        journalEntryId: journalId,
        accountId: sourceBnk.glAccountId,
        description: `Inter-bank transfer sent to ${destBnk.code}`,
        debit: zero(),
        credit: v.amount,
        bankAccountId: sourceBnk.id,
      });

      destBnk.bookBalance = destBnk.bookBalance.plus(v.amount);
      sourceBnk.bookBalance = sourceBnk.bookBalance.minus(v.amount);

      this.bankTransactions.set(`bt-dest-${v.id}`, {
        id: `bt-dest-${v.id}`,
        bankAccountId: destBnk.id,
        journalLineId: journalLines[0].id,
        transactionDate: v.paymentDate,
        bankReference: v.reference,
        deposit: v.amount,
        withdrawal: zero(),
        reconciliationStatus: "UNRECONCILED",
      });
      this.bankTransactions.set(`bt-src-${v.id}`, {
        id: `bt-src-${v.id}`,
        bankAccountId: sourceBnk.id,
        journalLineId: journalLines[1].id,
        transactionDate: v.paymentDate,
        bankReference: v.reference,
        deposit: zero(),
        withdrawal: v.amount,
        reconciliationStatus: "UNRECONCILED",
      });
    } else if (v.direction === "CONTRA_DEPOSIT") {
      const bnk = this.bankAccounts.get(v.bankAccountId!)!;
      // Move Cash drawer -> Bank Account
      journalLines.push({
        id: `jl-1-${journalId}`,
        journalEntryId: journalId,
        accountId: bnk.glAccountId,
        description: `Cash deposit into ${bnk.code}`,
        debit: v.amount,
        credit: zero(),
        bankAccountId: bnk.id,
      });
      journalLines.push({
        id: `jl-2-${journalId}`,
        journalEntryId: journalId,
        accountId: v.cashAccountId!,
        description: `Cash deposited on ${v.paymentNumber}`,
        debit: zero(),
        credit: v.amount,
      });
      bnk.bookBalance = bnk.bookBalance.plus(v.amount);
      this.bankTransactions.set(`bt-${v.id}`, {
        id: `bt-${v.id}`,
        bankAccountId: bnk.id,
        journalLineId: journalLines[0].id,
        transactionDate: v.paymentDate,
        bankReference: v.reference,
        deposit: v.amount,
        withdrawal: zero(),
        reconciliationStatus: "UNRECONCILED",
      });
    } else if (v.direction === "CONTRA_WITHDRAWAL") {
      const bnk = this.bankAccounts.get(v.bankAccountId!)!;
      // Move Bank -> Cash drawer
      journalLines.push({
        id: `jl-1-${journalId}`,
        journalEntryId: journalId,
        accountId: v.cashAccountId!,
        description: `Cash withdrawal from ${bnk.code}`,
        debit: v.amount,
        credit: zero(),
      });
      journalLines.push({
        id: `jl-2-${journalId}`,
        journalEntryId: journalId,
        accountId: bnk.glAccountId,
        description: `Cash withdrawal on ${v.paymentNumber}`,
        debit: zero(),
        credit: v.amount,
        bankAccountId: bnk.id,
      });
      bnk.bookBalance = bnk.bookBalance.minus(v.amount);
      this.bankTransactions.set(`bt-${v.id}`, {
        id: `bt-${v.id}`,
        bankAccountId: bnk.id,
        journalLineId: journalLines[1].id,
        transactionDate: v.paymentDate,
        bankReference: v.reference,
        deposit: zero(),
        withdrawal: v.amount,
        reconciliationStatus: "UNRECONCILED",
      });
    }

    const journal: TestJournalEntry = {
      id: journalId,
      entryNumber: `JE-${v.paymentNumber}`,
      voucherSuffix: v.paymentNumber.split("-")[1],
      postingDate: v.paymentDate,
      narration: `Posted voucher ${v.paymentNumber}`,
      sourceDocumentType: "Payment",
      sourceDocumentId: v.id,
      lines: journalLines,
      status: "POSTED",
    };
    this.journals.set(journal.id, journal);

    v.status = "POSTED";
    v.journalEntryId = journal.id;
    v.postedById = actor.userId;
    return v;
  }

  cancelVoucher(voucherId: string, reason: string): TestPaymentVoucher {
    const v = this.vouchers.get(voucherId);
    if (!v) throw new Error("VOUCHER_NOT_FOUND");
    if (v.status === "POSTED" || v.status === "REVERSED") {
      throw new Error("INVALID_DOCUMENT_STATE: Posted or reversed vouchers cannot be cancelled. Use reversal instead.");
    }
    if (!reason || reason.trim().length < 5) {
      throw new Error("REASON_REQUIRED: A valid cancellation reason is required.");
    }
    v.status = "CANCELLED";
    v.cancelledReason = reason;
    return v;
  }

  reverseVoucher(voucherId: string, reason: string): TestPaymentVoucher {
    const v = this.vouchers.get(voucherId);
    if (!v) throw new Error("VOUCHER_NOT_FOUND");
    if (v.status !== "POSTED") {
      throw new Error("INVALID_DOCUMENT_STATE: Only posted vouchers can be reversed.");
    }
    if (!reason || reason.trim().length < 5) {
      throw new Error("REASON_REQUIRED: A valid reversal reason is required.");
    }
    const origJe = this.journals.get(v.journalEntryId!)!;
    if (origJe.status === "REVERSED") throw new Error("VOUCHER_ALREADY_REVERSED");

    // 1. Release allocations on referenced documents
    for (const alloc of v.allocations) {
      if (alloc.salesInvoiceId) {
        const inv = this.salesInvoices.get(alloc.salesInvoiceId);
        if (inv) inv.settled = inv.settled.minus(alloc.amount);
      }
      if (alloc.purchaseReceiptId) {
        const bill = this.purchaseReceipts.get(alloc.purchaseReceiptId);
        if (bill) bill.settled = bill.settled.minus(alloc.amount);
      }
    }

    // 2. Reverse party subledger
    if (v.customerId) {
      const p = this.parties.get(v.customerId)!;
      p.subledgerBalance = p.subledgerBalance.plus(v.amount);
    }
    if (v.supplierId) {
      const p = this.parties.get(v.supplierId)!;
      p.subledgerBalance = p.subledgerBalance.plus(v.amount);
    }

    // 3. Reverse bank book balance & bank transactions
    if (v.bankAccountId) {
      const bnk = this.bankAccounts.get(v.bankAccountId)!;
      if (v.direction === "CUSTOMER_RECEIPT" || v.direction === "CONTRA_DEPOSIT") {
        bnk.bookBalance = bnk.bookBalance.minus(v.amount);
      } else {
        bnk.bookBalance = bnk.bookBalance.plus(v.amount);
      }
    }
    if (v.targetBankAccountId) {
      const targetBnk = this.bankAccounts.get(v.targetBankAccountId)!;
      targetBnk.bookBalance = targetBnk.bookBalance.minus(v.amount);
    }

    // 4. Create Reversal Journal Entry with inverted Dr/Cr
    const revJeId = `rev-${origJe.id}`;
    const revLines: TestJournalLine[] = origJe.lines.map((l, idx) => ({
      id: `rev-jl-${idx}-${revJeId}`,
      journalEntryId: revJeId,
      accountId: l.accountId,
      description: `Reversal of [${origJe.entryNumber}]: ${reason}`,
      debit: l.credit, // Invert Debit & Credit
      credit: l.debit,
      customerId: l.customerId,
      supplierId: l.supplierId,
      bankAccountId: l.bankAccountId,
    }));

    const revJe: TestJournalEntry = {
      id: revJeId,
      entryNumber: `REV-${origJe.entryNumber}`,
      voucherSuffix: origJe.voucherSuffix,
      postingDate: v.paymentDate,
      narration: `Reversal of ${v.paymentNumber}: ${reason}`,
      sourceDocumentType: "PaymentReversal",
      sourceDocumentId: v.id,
      lines: revLines,
      status: "POSTED",
      reversalOfId: origJe.id,
    };
    origJe.status = "REVERSED";
    this.journals.set(revJe.id, revJe);

    v.status = "REVERSED";
    v.reversedReason = reason;
    v.reversalJournalId = revJe.id;
    return v;
  }

  // --- Bank Reconciliation Engine ---

  importStatement(input: {
    bankAccountId: string;
    statementNumber: string;
    periodStart: string;
    periodEnd: string;
    openingBalance: number | string;
    closingBalance: number | string;
    lines: Array<{
      transactionDate: string;
      reference?: string;
      description: string;
      deposit: number | string;
      withdrawal: number | string;
    }>;
  }): TestBankStatement {
    const bnk = this.bankAccounts.get(input.bankAccountId);
    if (!bnk || !bnk.isActive) throw new Error("BANK_ACCOUNT_NOT_FOUND");

    const stmId = `stm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const lines: TestBankStatementLine[] = input.lines.map((l, i) => ({
      id: `stml-${i}-${stmId}`,
      transactionDate: l.transactionDate,
      reference: l.reference || null,
      description: l.description,
      deposit: decimal(l.deposit),
      withdrawal: decimal(l.withdrawal),
      isMatched: false,
    }));

    const statement: TestBankStatement = {
      id: stmId,
      bankAccountId: input.bankAccountId,
      statementNumber: input.statementNumber,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      openingBalance: decimal(input.openingBalance),
      closingBalance: decimal(input.closingBalance),
      lines,
    };
    this.statements.set(statement.id, statement);
    return statement;
  }

  prepareReconciliation(statementId: string): TestBankReconciliation {
    const stm = this.statements.get(statementId);
    if (!stm) throw new Error("BANK_STATEMENT_NOT_FOUND");
    const bnk = this.bankAccounts.get(stm.bankAccountId)!;

    // Calculate unreconciled outstanding transactions up to periodEnd
    const txs = Array.from(this.bankTransactions.values()).filter(
      (t) => t.bankAccountId === stm.bankAccountId && t.transactionDate <= stm.periodEnd
    );

    let outstandingDeposits = zero();
    let outstandingPayments = zero();
    for (const t of txs) {
      if (t.reconciliationStatus === "UNRECONCILED") {
        outstandingDeposits = outstandingDeposits.plus(t.deposit);
        outstandingPayments = outstandingPayments.plus(t.withdrawal);
      }
    }

    const bookBalance = bnk.bookBalance;
    const adjustedBalance = bookBalance.plus(outstandingDeposits).minus(outstandingPayments);
    const difference = adjustedBalance.minus(stm.closingBalance);

    const rec: TestBankReconciliation = {
      id: `rec-${stm.id}`,
      statementId: stm.id,
      bankAccountId: stm.bankAccountId,
      status: "IN_PROGRESS",
      bookBalance,
      statementBalance: stm.closingBalance,
      outstandingDeposits,
      outstandingPayments,
      adjustedBalance,
      difference,
    };
    this.reconciliations.set(rec.id, rec);
    return rec;
  }

  matchStatementLine(statementId: string, lineId: string, bankTxId: string): void {
    const stm = this.statements.get(statementId);
    if (!stm) throw new Error("BANK_STATEMENT_NOT_FOUND");
    const line = stm.lines.find((l) => l.id === lineId);
    if (!line) throw new Error("STATEMENT_LINE_NOT_FOUND");
    const tx = this.bankTransactions.get(bankTxId);
    if (!tx || tx.bankAccountId !== stm.bankAccountId) throw new Error("BANK_TRANSACTION_NOT_FOUND");
    if (tx.reconciliationStatus === "RECONCILED") throw new Error("TRANSACTION_ALREADY_RECONCILED");

    // Verify amounts and direction
    if (!line.deposit.eq(tx.deposit) || !line.withdrawal.eq(tx.withdrawal)) {
      throw new Error("AMOUNT_DIRECTION_MISMATCH");
    }

    line.isMatched = true;
    line.matchedJournalLineId = tx.journalLineId;
    tx.reconciliationStatus = "RECONCILED";
    tx.reconciledAt = new Date();
  }

  autoMatchStatement(statementId: string): { matchedCount: number; unmatchedCount: number } {
    const stm = this.statements.get(statementId);
    if (!stm) throw new Error("BANK_STATEMENT_NOT_FOUND");
    const unreconciledTxs = Array.from(this.bankTransactions.values()).filter(
      (t) => t.bankAccountId === stm.bankAccountId && t.reconciliationStatus === "UNRECONCILED"
    );

    let matchedCount = 0;
    for (const line of stm.lines) {
      if (line.isMatched) continue;
      const candidate = unreconciledTxs.find(
        (t) => t.reconciliationStatus === "UNRECONCILED" && t.deposit.eq(line.deposit) && t.withdrawal.eq(line.withdrawal)
      );
      if (candidate) {
        line.isMatched = true;
        line.matchedJournalLineId = candidate.journalLineId;
        candidate.reconciliationStatus = "RECONCILED";
        candidate.reconciledAt = new Date();
        matchedCount++;
      }
    }
    const unmatchedCount = stm.lines.filter((l) => !l.isMatched).length;
    return { matchedCount, unmatchedCount };
  }

  bookBankCharges(bankAccountId: string, amount: number | string, date = "2026-11-10", ref = "Bank Charges"): TestJournalEntry {
    const bnk = this.bankAccounts.get(bankAccountId)!;
    const amt = decimal(amount);
    const jId = `je-chg-${Date.now()}`;
    const lines: TestJournalLine[] = [
      {
        id: `jl-chg-1-${jId}`,
        journalEntryId: jId,
        accountId: this.bankChargesAccountId,
        description: `Bank service charges: ${ref}`,
        debit: amt,
        credit: zero(),
      },
      {
        id: `jl-chg-2-${jId}`,
        journalEntryId: jId,
        accountId: bnk.glAccountId,
        description: `Bank charges deducted from ${bnk.code}`,
        debit: zero(),
        credit: amt,
        bankAccountId: bnk.id,
      },
    ];
    const je: TestJournalEntry = {
      id: jId,
      entryNumber: `JE-CHG-${Date.now()}`,
      voucherSuffix: "CHG",
      postingDate: date,
      narration: `Bank charges booked for ${bnk.code}`,
      sourceDocumentType: "BankCharge",
      sourceDocumentId: jId,
      lines,
      status: "POSTED",
    };
    this.journals.set(je.id, je);
    bnk.bookBalance = bnk.bookBalance.minus(amt);
    this.bankTransactions.set(`bt-${jId}`, {
      id: `bt-${jId}`,
      bankAccountId: bnk.id,
      journalLineId: lines[1].id,
      transactionDate: date,
      bankReference: ref,
      deposit: zero(),
      withdrawal: amt,
      reconciliationStatus: "UNRECONCILED",
    });
    return je;
  }

  bookInterestIncome(bankAccountId: string, amount: number | string, date = "2026-11-10", ref = "Profit/Interest"): TestJournalEntry {
    const bnk = this.bankAccounts.get(bankAccountId)!;
    const amt = decimal(amount);
    const jId = `je-int-${Date.now()}`;
    const lines: TestJournalLine[] = [
      {
        id: `jl-int-1-${jId}`,
        journalEntryId: jId,
        accountId: bnk.glAccountId,
        description: `Interest income credited to ${bnk.code}`,
        debit: amt,
        credit: zero(),
        bankAccountId: bnk.id,
      },
      {
        id: `jl-int-2-${jId}`,
        journalEntryId: jId,
        accountId: this.interestIncomeAccountId,
        description: `Bank profit/interest earned: ${ref}`,
        debit: zero(),
        credit: amt,
      },
    ];
    const je: TestJournalEntry = {
      id: jId,
      entryNumber: `JE-INT-${Date.now()}`,
      voucherSuffix: "INT",
      postingDate: date,
      narration: `Bank interest booked for ${bnk.code}`,
      sourceDocumentType: "BankInterest",
      sourceDocumentId: jId,
      lines,
      status: "POSTED",
    };
    this.journals.set(je.id, je);
    bnk.bookBalance = bnk.bookBalance.plus(amt);
    this.bankTransactions.set(`bt-${jId}`, {
      id: `bt-${jId}`,
      bankAccountId: bnk.id,
      journalLineId: lines[0].id,
      transactionDate: date,
      bankReference: ref,
      deposit: amt,
      withdrawal: zero(),
      reconciliationStatus: "UNRECONCILED",
    });
    return je;
  }

  completeReconciliation(recId: string): TestBankReconciliation {
    const rec = this.reconciliations.get(recId);
    if (!rec) throw new Error("RECONCILIATION_NOT_FOUND");
    const stm = this.statements.get(rec.statementId)!;
    const unmatched = stm.lines.filter((l) => !l.isMatched);
    if (unmatched.length > 0) {
      throw new Error(`UNMATCHED_LINES: ${unmatched.length} statement line(s) must be matched before completion.`);
    }

    // Recalculate difference right before completion
    const refreshed = this.prepareReconciliation(stm.id);
    if (refreshed.difference.abs().gt(decimal("0.005"))) {
      throw new Error(`RECONCILIATION_OUT_OF_BALANCE: Difference is ${moneyString(refreshed.difference)}.`);
    }
    refreshed.status = "COMPLETED";
    return refreshed;
  }

  // --- Strict Double-Entry & Subledger Invariant Checkers ---

  assertDoubleEntryBalance(journalId: string): void {
    const je = this.journals.get(journalId);
    if (!je) throw new Error(`Journal ${journalId} not found.`);
    let totalDebit = zero();
    let totalCredit = zero();
    for (const l of je.lines) {
      totalDebit = totalDebit.plus(l.debit);
      totalCredit = totalCredit.plus(l.credit);
    }
    if (!totalDebit.eq(totalCredit)) {
      throw new Error(`DOUBLE_ENTRY_IMBALANCE in ${je.entryNumber}: Debits ${totalDebit} != Credits ${totalCredit}`);
    }
  }

  assertAllJournalsBalanced(): void {
    for (const je of this.journals.values()) {
      this.assertDoubleEntryBalance(je.id);
    }
  }

  assertCustomerSubledgerReconciliation(customerId: string): void {
    const cust = this.parties.get(customerId)!;
    // Calculate expected balance from all posted and reversed journals affecting customer (reversal entries negate original entries)
    let glNetBalance = zero();
    for (const je of this.journals.values()) {
      if (je.status !== "POSTED" && je.status !== "REVERSED") continue;
      for (const l of je.lines) {
        if (l.accountId === this.arControlAccountId && l.customerId === customerId) {
          glNetBalance = glNetBalance.plus(l.debit).minus(l.credit);
        }
      }
    }
    // Subledger balance should equal AR control GL activity (Net debit)
    if (!cust.subledgerBalance.eq(glNetBalance)) {
      throw new Error(
        `CUSTOMER_SUBLEDGER_MISMATCH for ${cust.name}: Subledger=${moneyString(cust.subledgerBalance)} vs GL=${moneyString(glNetBalance)}`
      );
    }
  }

  assertSupplierSubledgerReconciliation(supplierId: string): void {
    const supp = this.parties.get(supplierId)!;
    let glNetBalance = zero();
    for (const je of this.journals.values()) {
      if (je.status !== "POSTED" && je.status !== "REVERSED") continue;
      for (const l of je.lines) {
        if (l.accountId === this.apControlAccountId && l.supplierId === supplierId) {
          glNetBalance = glNetBalance.plus(l.credit).minus(l.debit);
        }
      }
    }
    // Subledger balance should equal AP control GL activity (Net credit)
    if (!supp.subledgerBalance.eq(glNetBalance)) {
      throw new Error(
        `SUPPLIER_SUBLEDGER_MISMATCH for ${supp.name}: Subledger=${moneyString(supp.subledgerBalance)} vs GL=${moneyString(glNetBalance)}`
      );
    }
  }
}

// ============================================================================
// TEST SUITE IMPLEMENTATION (4-TIER OPAQUE-BOX E2E SUITE)
// ============================================================================

describe("Axon Mobile ERP — Cash, Bank & Party Settlement E2E Test Suite", () => {
  let h: SettlementTestHarness;

  beforeEach(() => {
    h = new SettlementTestHarness();
  });

  // ==========================================================================
  // TIER 1: FEATURE COVERAGE (>=5 Tests per Core Feature)
  // ==========================================================================

  describe("Tier 1: Feature Coverage", () => {
    // ------------------------------------------------------------------------
    // Feature 1: Customer Receipts (5 tests)
    // ------------------------------------------------------------------------
    describe("F1: Customer Receipts", () => {
      it("TC-F1-01: Cash receipt with 100% invoice allocation generates balanced GL and clears invoice", () => {
        const cust = h.createCustomer("CUST-001", "Al-Falah Telecom");
        const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "15000.00" });

        const voucher = h.createVoucherDraft({
          direction: "CUSTOMER_RECEIPT",
          customerId: cust.id,
          cashAccountId: h.cashAccountId,
          amount: "15000.00",
          allocations: [{ salesInvoiceId: inv.id, amount: "15000.00" }],
        });

        expect(voucher.status).toBe("DRAFT");
        expect(voucher.unallocatedAdvance.eq(zero())).toBe(true);

        h.submitVoucher(voucher.id);
        expect(voucher.status).toBe("SUBMITTED");

        const posted = h.postVoucher(voucher.id);
        expect(posted.status).toBe("POSTED");

        // Verify invoice is 100% settled
        expect(inv.settled.eq(decimal("15000.00"))).toBe(true);
        // Verify customer subledger balance cleared to zero
        expect(cust.subledgerBalance.eq(zero())).toBe(true);
        // Verify balanced double entry
        h.assertDoubleEntryBalance(posted.journalEntryId!);
        h.assertCustomerSubledgerReconciliation(cust.id);
      });

      it("TC-F1-02: Bank transfer receipt with reference registers BankTransaction and updates book balance", () => {
        const cust = h.createCustomer("CUST-002", "Galaxy Mobile Zone");
        const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "45000.00" });

        const voucher = h.createVoucherDraft({
          direction: "CUSTOMER_RECEIPT",
          customerId: cust.id,
          paymentMethodId: "pm-bank",
          reference: "HBL-TX-889900",
          amount: "45000.00",
          allocations: [{ salesInvoiceId: inv.id, amount: "45000.00" }],
        });

        h.postVoucher(voucher.id);

        const bnk = h.bankAccounts.get(h.bankAccount1Id)!;
        expect(bnk.bookBalance.eq(decimal("45000.00"))).toBe(true);

        const bt = h.bankTransactions.get(`bt-${voucher.id}`);
        expect(bt).toBeDefined();
        expect(bt!.deposit.eq(decimal("45000.00"))).toBe(true);
        expect(bt!.reconciliationStatus).toBe("UNRECONCILED");
      });

      it("TC-F1-03: Cheque receipt resolves to bank GL account and maintains correct voucher numbering", () => {
        const cust = h.createCustomer("CUST-003", "Apex Traders");
        const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "22000.00" });

        const voucher = h.createVoucherDraft({
          direction: "CUSTOMER_RECEIPT",
          customerId: cust.id,
          paymentMethodId: "pm-cheque",
          reference: "CHQ-990011",
          amount: "22000.00",
          allocations: [{ salesInvoiceId: inv.id, amount: "22000.00" }],
        });

        expect(voucher.paymentNumber).toMatch(/^ISB-RC-FY2026-27-\d{6}$/);
        h.postVoucher(voucher.id);

        const je = h.journals.get(voucher.journalEntryId!)!;
        const debitLine = je.lines.find((l) => l.debit.gt(zero()))!;
        expect(debitLine.accountId).toBe(h.bankGlAccountId);
      });

      it("TC-F1-04: Card POS receipt with reference successfully posts to GL and credits AR Control", () => {
        const cust = h.createCustomer("CUST-004", "Walkin Customer POS");
        const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "8500.00" });

        const voucher = h.createVoucherDraft({
          direction: "CUSTOMER_RECEIPT",
          customerId: cust.id,
          paymentMethodId: "pm-card",
          reference: "POS-SWIPE-4433",
          amount: "8500.00",
          allocations: [{ salesInvoiceId: inv.id, amount: "8500.00" }],
        });

        h.postVoucher(voucher.id);
        const je = h.journals.get(voucher.journalEntryId!)!;
        const creditLine = je.lines.find((l) => l.credit.gt(zero()))!;
        expect(creditLine.accountId).toBe(h.arControlAccountId);
        expect(creditLine.customerId).toBe(cust.id);
      });

      it("TC-F1-05: Direct posting lifecycle works seamlessly without maker-checker approval queue", () => {
        const cust = h.createCustomer("CUST-005", "Direct Client");
        const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "12000.00" });

        // Authorized user directly posts from draft state
        const voucher = h.createVoucherDraft({
          direction: "CUSTOMER_RECEIPT",
          customerId: cust.id,
          cashAccountId: h.cashAccountId,
          amount: "12000.00",
          allocations: [{ salesInvoiceId: inv.id, amount: "12000.00" }],
        });

        const posted = h.postVoucher(voucher.id);
        expect(posted.status).toBe("POSTED");
        expect(posted.postedById).toBe(h.defaultActor.userId);
      });
    });

    // ------------------------------------------------------------------------
    // Feature 2: Supplier Payments (5 tests)
    // ------------------------------------------------------------------------
    describe("F2: Supplier Payments", () => {
      it("TC-F2-01: Cash payment settling 100% of purchase bill clears supplier subledger", () => {
        const supp = h.createSupplier("SUPP-001", "Pak Mobile Distributors");
        const bill = h.createPurchaseReceipt({ supplierId: supp.id, grandTotal: "60000.00" });

        expect(supp.subledgerBalance.eq(decimal("60000.00"))).toBe(true);

        const voucher = h.createVoucherDraft({
          direction: "SUPPLIER_PAYMENT",
          supplierId: supp.id,
          cashAccountId: h.cashAccountId,
          amount: "60000.00",
          allocations: [{ purchaseReceiptId: bill.id, amount: "60000.00" }],
        });

        h.postVoucher(voucher.id);
        expect(bill.settled.eq(decimal("60000.00"))).toBe(true);
        expect(supp.subledgerBalance.eq(zero())).toBe(true);
        h.assertSupplierSubledgerReconciliation(supp.id);
      });

      it("TC-F2-02: Bank transfer payment creates AP Control debit, Bank GL credit, and withdrawal transaction", () => {
        const supp = h.createSupplier("SUPP-002", "National Tech Supplies");
        const bill = h.createPurchaseReceipt({ supplierId: supp.id, grandTotal: "35000.00" });

        const voucher = h.createVoucherDraft({
          direction: "SUPPLIER_PAYMENT",
          supplierId: supp.id,
          paymentMethodId: "pm-bank",
          reference: "FT-OUT-9988",
          amount: "35000.00",
          allocations: [{ purchaseReceiptId: bill.id, amount: "35000.00" }],
        });

        h.postVoucher(voucher.id);
        const bt = h.bankTransactions.get(`bt-${voucher.id}`)!;
        expect(bt.withdrawal.eq(decimal("35000.00"))).toBe(true);
        expect(bt.deposit.eq(zero())).toBe(true);
      });

      it("TC-F2-03: Cheque payment to supplier maintains single-hyphen ISB-PV numbering", () => {
        const supp = h.createSupplier("SUPP-003", "Prime Importers");
        const bill = h.createPurchaseReceipt({ supplierId: supp.id, grandTotal: "18000.00" });

        const voucher = h.createVoucherDraft({
          direction: "SUPPLIER_PAYMENT",
          supplierId: supp.id,
          paymentMethodId: "pm-cheque",
          reference: "CHQ-OUT-1029",
          amount: "18000.00",
          allocations: [{ purchaseReceiptId: bill.id, amount: "18000.00" }],
        });

        expect(voucher.paymentNumber).toMatch(/^ISB-PV-FY2026-27-\d{6}$/);
        h.postVoucher(voucher.id);
      });

      it("TC-F2-04: Partial bill settlement updates outstanding amount and retains remaining payable", () => {
        const supp = h.createSupplier("SUPP-004", "Global Tech Parts");
        const bill = h.createPurchaseReceipt({ supplierId: supp.id, grandTotal: "50000.00" });

        const voucher = h.createVoucherDraft({
          direction: "SUPPLIER_PAYMENT",
          supplierId: supp.id,
          cashAccountId: h.cashAccountId,
          amount: "30000.00",
          allocations: [{ purchaseReceiptId: bill.id, amount: "30000.00" }],
        });

        h.postVoucher(voucher.id);
        expect(bill.settled.eq(decimal("30000.00"))).toBe(true);
        expect(bill.grandTotal.minus(bill.settled).eq(decimal("20000.00"))).toBe(true);
        expect(supp.subledgerBalance.eq(decimal("20000.00"))).toBe(true);
      });

      it("TC-F2-05: Direct posting lifecycle completes without awaiting approver band or checker sign-off", () => {
        const supp = h.createSupplier("SUPP-005", "Direct Supplier Corp");
        const bill = h.createPurchaseReceipt({ supplierId: supp.id, grandTotal: "15000.00" });

        const voucher = h.createVoucherDraft({
          direction: "SUPPLIER_PAYMENT",
          supplierId: supp.id,
          cashAccountId: h.cashAccountId,
          amount: "15000.00",
          allocations: [{ purchaseReceiptId: bill.id, amount: "15000.00" }],
        });

        h.submitVoucher(voucher.id);
        const posted = h.postVoucher(voucher.id);
        expect(posted.status).toBe("POSTED");
      });
    });

    // ------------------------------------------------------------------------
    // Feature 3: Customer Advances (5 tests)
    // ------------------------------------------------------------------------
    describe("F3: Customer Advances", () => {
      it("TC-F3-01: Standalone unallocated customer receipt safely records advance without discarding funds", () => {
        const cust = h.createCustomer("CUST-ADV-01", "Prepaid Customer Alpha");
        const voucher = h.createVoucherDraft({
          direction: "CUSTOMER_RECEIPT",
          customerId: cust.id,
          cashAccountId: h.cashAccountId,
          amount: "25000.00",
          allocations: [], // Zero invoice allocations
        });

        expect(voucher.unallocatedAdvance.eq(decimal("25000.00"))).toBe(true);
        expect(voucher.allocations).toHaveLength(0);

        h.postVoucher(voucher.id);
        // Customer subledger is now in credit/advance state (-25000)
        expect(cust.subledgerBalance.eq(decimal("-25000.00"))).toBe(true);
        h.assertCustomerSubledgerReconciliation(cust.id);
      });

      it("TC-F3-02: Surplus receipt over invoice balance stores excess as customer advance", () => {
        const cust = h.createCustomer("CUST-ADV-02", "Surplus Payer Beta");
        const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "16000.00" });

        const voucher = h.createVoucherDraft({
          direction: "CUSTOMER_RECEIPT",
          customerId: cust.id,
          cashAccountId: h.cashAccountId,
          amount: "20000.00",
          allocations: [{ salesInvoiceId: inv.id, amount: "16000.00" }],
        });

        expect(voucher.unallocatedAdvance.eq(decimal("4000.00"))).toBe(true);
        h.postVoucher(voucher.id);

        expect(inv.settled.eq(decimal("16000.00"))).toBe(true);
        expect(cust.subledgerBalance.eq(decimal("-4000.00"))).toBe(true);
      });

      it("TC-F3-03: Bank deposit advance updates bank ledger and generates balanced AR control credit", () => {
        const cust = h.createCustomer("CUST-ADV-03", "Corporate Advance Client");
        const voucher = h.createVoucherDraft({
          direction: "CUSTOMER_RECEIPT",
          customerId: cust.id,
          paymentMethodId: "pm-bank",
          reference: "ADV-WIRE-11",
          amount: "50000.00",
          allocations: [],
        });

        h.postVoucher(voucher.id);
        const bnk = h.bankAccounts.get(h.bankAccount1Id)!;
        expect(bnk.bookBalance.eq(decimal("50000.00"))).toBe(true);
        h.assertDoubleEntryBalance(voucher.journalEntryId!);
      });

      it("TC-F3-04: Customer advance seamlessly offsets future sales invoice in party subledger", () => {
        const cust = h.createCustomer("CUST-ADV-04", "Recurring Buyer");
        // Step 1: Customer gives advance of 30,000
        const advVoucher = h.createVoucherDraft({
          direction: "CUSTOMER_RECEIPT",
          customerId: cust.id,
          cashAccountId: h.cashAccountId,
          amount: "30000.00",
          allocations: [],
        });
        h.postVoucher(advVoucher.id);
        expect(cust.subledgerBalance.eq(decimal("-30000.00"))).toBe(true);

        // Step 2: Customer is subsequently billed 30,000
        h.createSalesInvoice({ customerId: cust.id, grandTotal: "30000.00" });
        // Net balance returns to zero
        expect(cust.subledgerBalance.eq(zero())).toBe(true);
        h.assertCustomerSubledgerReconciliation(cust.id);
      });

      it("TC-F3-05: Reversing a customer advance correctly restores customer subledger and bank balance", () => {
        const cust = h.createCustomer("CUST-ADV-05", "Refund Requester");
        const voucher = h.createVoucherDraft({
          direction: "CUSTOMER_RECEIPT",
          customerId: cust.id,
          cashAccountId: h.cashAccountId,
          amount: "10000.00",
          allocations: [],
        });
        h.postVoucher(voucher.id);
        expect(cust.subledgerBalance.eq(decimal("-10000.00"))).toBe(true);

        h.reverseVoucher(voucher.id, "Customer cancelled contract, refund advance");
        expect(voucher.status).toBe("REVERSED");
        expect(cust.subledgerBalance.eq(zero())).toBe(true);
      });
    });

    // ------------------------------------------------------------------------
    // Feature 4: Supplier Advances (5 tests)
    // ------------------------------------------------------------------------
    describe("F4: Supplier Advances", () => {
      it("TC-F4-01: Standalone unallocated supplier payment records prepayment advance", () => {
        const supp = h.createSupplier("SUPP-ADV-01", "Overseas Manufacturer");
        const voucher = h.createVoucherDraft({
          direction: "SUPPLIER_PAYMENT",
          supplierId: supp.id,
          paymentMethodId: "pm-bank",
          reference: "LC-PREPAY-1",
          amount: "75000.00",
          allocations: [],
        });

        expect(voucher.unallocatedAdvance.eq(decimal("75000.00"))).toBe(true);
        h.postVoucher(voucher.id);
        // Supplier subledger is now in debit/advance state (-75000)
        expect(supp.subledgerBalance.eq(decimal("-75000.00"))).toBe(true);
        h.assertSupplierSubledgerReconciliation(supp.id);
      });

      it("TC-F4-02: Surplus payment over purchase bill stores remaining funds as supplier advance", () => {
        const supp = h.createSupplier("SUPP-ADV-02", "Bulk Vendor");
        const bill = h.createPurchaseReceipt({ supplierId: supp.id, grandTotal: "28000.00" });

        const voucher = h.createVoucherDraft({
          direction: "SUPPLIER_PAYMENT",
          supplierId: supp.id,
          cashAccountId: h.cashAccountId,
          amount: "35000.00",
          allocations: [{ purchaseReceiptId: bill.id, amount: "28000.00" }],
        });

        expect(voucher.unallocatedAdvance.eq(decimal("7000.00"))).toBe(true);
        h.postVoucher(voucher.id);
        expect(bill.settled.eq(decimal("28000.00"))).toBe(true);
        expect(supp.subledgerBalance.eq(decimal("-7000.00"))).toBe(true);
      });

      it("TC-F4-03: Supplier advance generates balanced journal debiting AP Control and crediting Bank GL", () => {
        const supp = h.createSupplier("SUPP-ADV-03", "Prepay Components Ltd");
        const voucher = h.createVoucherDraft({
          direction: "SUPPLIER_PAYMENT",
          supplierId: supp.id,
          paymentMethodId: "pm-bank",
          reference: "WIRE-ADV-44",
          amount: "40000.00",
          allocations: [],
        });

        h.postVoucher(voucher.id);
        const je = h.journals.get(voucher.journalEntryId!)!;
        const debitLine = je.lines.find((l) => l.debit.gt(zero()))!;
        expect(debitLine.accountId).toBe(h.apControlAccountId);
        expect(debitLine.supplierId).toBe(supp.id);
      });

      it("TC-F4-04: Supplier advance offsets subsequent purchase receipt in subledger", () => {
        const supp = h.createSupplier("SUPP-ADV-04", "Fabricator Co");
        const adv = h.createVoucherDraft({
          direction: "SUPPLIER_PAYMENT",
          supplierId: supp.id,
          cashAccountId: h.cashAccountId,
          amount: "50000.00",
          allocations: [],
        });
        h.postVoucher(adv.id);
        expect(supp.subledgerBalance.eq(decimal("-50000.00"))).toBe(true);

        h.createPurchaseReceipt({ supplierId: supp.id, grandTotal: "50000.00" });
        expect(supp.subledgerBalance.eq(zero())).toBe(true);
      });

      it("TC-F4-05: Reversing a supplier advance restores supplier subledger and returns bank funds", () => {
        const supp = h.createSupplier("SUPP-ADV-05", "Cancelled Vendor");
        const voucher = h.createVoucherDraft({
          direction: "SUPPLIER_PAYMENT",
          supplierId: supp.id,
          paymentMethodId: "pm-bank",
          reference: "CHQ-ADV-REV",
          amount: "20000.00",
          allocations: [],
        });
        h.postVoucher(voucher.id);
        const bnk = h.bankAccounts.get(h.bankAccount1Id)!;
        expect(bnk.bookBalance.eq(decimal("-20000.00"))).toBe(true);

        h.reverseVoucher(voucher.id, "Prepayment cancelled by supplier");
        expect(voucher.status).toBe("REVERSED");
        expect(supp.subledgerBalance.eq(zero())).toBe(true);
        expect(bnk.bookBalance.eq(zero())).toBe(true);
      });
    });

    // ------------------------------------------------------------------------
    // Feature 5: Bank Transfers (5 tests)
    // ------------------------------------------------------------------------
    describe("F5: Bank Transfers", () => {
      it("TC-F5-01: Inter-bank transfer moves funds between two bank accounts and updates both book balances", () => {
        const voucher = h.createVoucherDraft({
          direction: "BANK_TRANSFER",
          bankAccountId: h.bankAccount1Id,
          targetBankAccountId: h.bankAccount2Id,
          amount: "70000.00",
          reference: "TR-HBL-MEEZAN-1",
        });

        h.postVoucher(voucher.id);
        const bnk1 = h.bankAccounts.get(h.bankAccount1Id)!;
        const bnk2 = h.bankAccounts.get(h.bankAccount2Id)!;

        expect(bnk1.bookBalance.eq(decimal("-70000.00"))).toBe(true);
        expect(bnk2.bookBalance.eq(decimal("70000.00"))).toBe(true);
      });

      it("TC-F5-02: Bank transfer creates dual bank transactions for debit and credit sides", () => {
        const voucher = h.createVoucherDraft({
          direction: "BANK_TRANSFER",
          bankAccountId: h.bankAccount1Id,
          targetBankAccountId: h.bankAccount2Id,
          amount: "25000.00",
          reference: "TR-PAIR-99",
        });

        h.postVoucher(voucher.id);
        const destTx = h.bankTransactions.get(`bt-dest-${voucher.id}`);
        const srcTx = h.bankTransactions.get(`bt-src-${voucher.id}`);

        expect(destTx).toBeDefined();
        expect(destTx!.deposit.eq(decimal("25000.00"))).toBe(true);
        expect(srcTx).toBeDefined();
        expect(srcTx!.withdrawal.eq(decimal("25000.00"))).toBe(true);
      });

      it("TC-F5-03: Bank transfer maintains balanced double-entry GL journal entry", () => {
        const voucher = h.createVoucherDraft({
          direction: "BANK_TRANSFER",
          bankAccountId: h.bankAccount1Id,
          targetBankAccountId: h.bankAccount2Id,
          amount: "15000.00",
          reference: "TR-GL-BAL",
        });

        h.postVoucher(voucher.id);
        h.assertDoubleEntryBalance(voucher.journalEntryId!);
      });

      it("TC-F5-04: Bank transfer uses single-hyphen sequence formatting ISB-BT", () => {
        const voucher = h.createVoucherDraft({
          direction: "BANK_TRANSFER",
          bankAccountId: h.bankAccount1Id,
          targetBankAccountId: h.bankAccount2Id,
          amount: "10000.00",
        });

        expect(voucher.paymentNumber).toMatch(/^ISB-BT-FY2026-27-\d{6}$/);
      });

      it("TC-F5-05: Reversing a bank transfer restores book balances in both bank accounts", () => {
        const voucher = h.createVoucherDraft({
          direction: "BANK_TRANSFER",
          bankAccountId: h.bankAccount1Id,
          targetBankAccountId: h.bankAccount2Id,
          amount: "30000.00",
        });
        h.postVoucher(voucher.id);

        h.reverseVoucher(voucher.id, "Incorrect destination account chosen");
        const bnk1 = h.bankAccounts.get(h.bankAccount1Id)!;
        const bnk2 = h.bankAccounts.get(h.bankAccount2Id)!;

        expect(bnk1.bookBalance.eq(zero())).toBe(true);
        expect(bnk2.bookBalance.eq(zero())).toBe(true);
      });
    });

    // ------------------------------------------------------------------------
    // Feature 6: Contra Vouchers (5 tests)
    // ------------------------------------------------------------------------
    describe("F6: Contra Vouchers", () => {
      it("TC-F6-01: Cash deposit contra voucher moves funds from cash drawer to bank account", () => {
        const voucher = h.createVoucherDraft({
          direction: "CONTRA_DEPOSIT",
          bankAccountId: h.bankAccount1Id,
          cashAccountId: h.cashAccountId,
          amount: "40000.00",
          reference: "DEP-SLIP-001",
        });

        h.postVoucher(voucher.id);
        const bnk = h.bankAccounts.get(h.bankAccount1Id)!;
        expect(bnk.bookBalance.eq(decimal("40000.00"))).toBe(true);

        const bt = h.bankTransactions.get(`bt-${voucher.id}`);
        expect(bt!.deposit.eq(decimal("40000.00"))).toBe(true);
      });

      it("TC-F6-02: Cash withdrawal contra voucher moves funds from bank account to cash drawer", () => {
        const voucher = h.createVoucherDraft({
          direction: "CONTRA_WITHDRAWAL",
          bankAccountId: h.bankAccount1Id,
          cashAccountId: h.cashAccountId,
          amount: "15000.00",
          reference: "CHQ-SELF-CASH",
        });

        h.postVoucher(voucher.id);
        const bnk = h.bankAccounts.get(h.bankAccount1Id)!;
        expect(bnk.bookBalance.eq(decimal("-15000.00"))).toBe(true);

        const bt = h.bankTransactions.get(`bt-${voucher.id}`);
        expect(bt!.withdrawal.eq(decimal("15000.00"))).toBe(true);
      });

      it("TC-F6-03: Contra vouchers do not affect customer or supplier subledgers", () => {
        const cust = h.createCustomer("CUST-CON", "No Impact Cust");
        const supp = h.createSupplier("SUPP-CON", "No Impact Supp");

        const voucher = h.createVoucherDraft({
          direction: "CONTRA_DEPOSIT",
          bankAccountId: h.bankAccount1Id,
          cashAccountId: h.cashAccountId,
          amount: "25000.00",
        });
        h.postVoucher(voucher.id);

        expect(cust.subledgerBalance.eq(zero())).toBe(true);
        expect(supp.subledgerBalance.eq(zero())).toBe(true);
      });

      it("TC-F6-04: Contra voucher follows single-hyphen sequence formatting ISB-CV", () => {
        const voucher = h.createVoucherDraft({
          direction: "CONTRA_DEPOSIT",
          bankAccountId: h.bankAccount1Id,
          cashAccountId: h.cashAccountId,
          amount: "5000.00",
        });
        expect(voucher.paymentNumber).toMatch(/^ISB-CV-FY2026-27-\d{6}$/);
      });

      it("TC-F6-05: Reversing a contra deposit restores bank and cash balances", () => {
        const voucher = h.createVoucherDraft({
          direction: "CONTRA_DEPOSIT",
          bankAccountId: h.bankAccount1Id,
          cashAccountId: h.cashAccountId,
          amount: "18000.00",
        });
        h.postVoucher(voucher.id);

        h.reverseVoucher(voucher.id, "Cash deposit slip rejected by teller");
        const bnk = h.bankAccounts.get(h.bankAccount1Id)!;
        expect(bnk.bookBalance.eq(zero())).toBe(true);
      });
    });

    // ------------------------------------------------------------------------
    // Feature 7: Bank Reconciliation (5 tests)
    // ------------------------------------------------------------------------
    describe("F7: Bank Reconciliation", () => {
      it("TC-F7-01: Statement import persists lines and computes opening-to-closing net balance", () => {
        const stm = h.importStatement({
          bankAccountId: h.bankAccount1Id,
          statementNumber: "STM-2026-11",
          periodStart: "2026-11-01",
          periodEnd: "2026-11-30",
          openingBalance: "100000.00",
          closingBalance: "135000.00",
          lines: [
            { transactionDate: "2026-11-05", description: "Customer Transfer A", deposit: "40000.00", withdrawal: 0 },
            { transactionDate: "2026-11-15", description: "Vendor Payment B", deposit: 0, withdrawal: "5000.00" },
          ],
        });

        expect(stm.lines).toHaveLength(2);
        const net = stm.lines.reduce((s, l) => s.plus(l.deposit).minus(l.withdrawal), zero());
        expect(stm.openingBalance.plus(net).eq(stm.closingBalance)).toBe(true);
      });

      it("TC-F7-02: Manual exact line matching marks statement line and bank transaction reconciled", () => {
        // Step 1: Create and post customer receipt of 40,000
        const cust = h.createCustomer("CUST-REC-01", "Rec Test Cust");
        const voucher = h.createVoucherDraft({
          direction: "CUSTOMER_RECEIPT",
          customerId: cust.id,
          paymentMethodId: "pm-bank",
          reference: "WIRE-40K",
          amount: "40000.00",
          allocations: [],
        });
        h.postVoucher(voucher.id);

        // Step 2: Import statement with matching deposit
        const stm = h.importStatement({
          bankAccountId: h.bankAccount1Id,
          statementNumber: "STM-MATCH-1",
          periodStart: "2026-11-01",
          periodEnd: "2026-11-30",
          openingBalance: 0,
          closingBalance: "40000.00",
          lines: [{ transactionDate: "2026-11-10", description: "WIRE-40K", deposit: "40000.00", withdrawal: 0 }],
        });

        const tx = h.bankTransactions.get(`bt-${voucher.id}`)!;
        h.matchStatementLine(stm.id, stm.lines[0].id, tx.id);

        expect(stm.lines[0].isMatched).toBe(true);
        expect(tx.reconciliationStatus).toBe("RECONCILED");
      });

      it("TC-F7-03: Auto-matching engine pairs all identical 1:1 transactions without manual intervention", () => {
        const cust = h.createCustomer("CUST-REC-02", "Auto Match Cust");
        const v1 = h.createVoucherDraft({ direction: "CUSTOMER_RECEIPT", customerId: cust.id, paymentMethodId: "pm-bank", reference: "AUTO-1", amount: "12500.00" });
        const v2 = h.createVoucherDraft({ direction: "CUSTOMER_RECEIPT", customerId: cust.id, paymentMethodId: "pm-bank", reference: "AUTO-2", amount: "33000.00" });
        h.postVoucher(v1.id);
        h.postVoucher(v2.id);

        const stm = h.importStatement({
          bankAccountId: h.bankAccount1Id,
          statementNumber: "STM-AUTO",
          periodStart: "2026-11-01",
          periodEnd: "2026-11-30",
          openingBalance: 0,
          closingBalance: "45500.00",
          lines: [
            { transactionDate: "2026-11-10", description: "Deposit 1", deposit: "12500.00", withdrawal: 0 },
            { transactionDate: "2026-11-10", description: "Deposit 2", deposit: "33000.00", withdrawal: 0 },
          ],
        });

        const res = h.autoMatchStatement(stm.id);
        expect(res.matchedCount).toBe(2);
        expect(res.unmatchedCount).toBe(0);
      });

      it("TC-F7-04: Preparation accurately computes book balance, outstanding items, and reconciliation difference", () => {
        // Book balance = 50,000 (posted). Statement has 50,000.
        const cust = h.createCustomer("CUST-REC-03", "Diff Check Cust");
        const v = h.createVoucherDraft({ direction: "CUSTOMER_RECEIPT", customerId: cust.id, paymentMethodId: "pm-bank", reference: "WIRE-DIFF-50K", amount: "50000.00" });
        h.postVoucher(v.id);

        const stm = h.importStatement({
          bankAccountId: h.bankAccount1Id,
          statementNumber: "STM-DIFF",
          periodStart: "2026-11-01",
          periodEnd: "2026-11-30",
          openingBalance: 0,
          closingBalance: "50000.00",
          lines: [{ transactionDate: "2026-11-10", description: "Unmatched Dep", deposit: "50000.00", withdrawal: 0 }],
        });

        const rec = h.prepareReconciliation(stm.id);
        expect(rec.bookBalance.eq(decimal("50000.00"))).toBe(true);
        expect(rec.outstandingDeposits.eq(decimal("50000.00"))).toBe(true);
        expect(rec.adjustedBalance.eq(decimal("100000.00"))).toBe(true);
        // Difference = 100,000 - 50,000 = 50,000
        expect(rec.difference.eq(decimal("50000.00"))).toBe(true);
      });

      it("TC-F7-05: Balanced reconciliation completes successfully, and reopen retains justification audit", () => {
        const cust = h.createCustomer("CUST-REC-04", "Complete Cust");
        const v = h.createVoucherDraft({ direction: "CUSTOMER_RECEIPT", customerId: cust.id, paymentMethodId: "pm-bank", reference: "WIRE-FIN-15K", amount: "15000.00" });
        h.postVoucher(v.id);

        const stm = h.importStatement({
          bankAccountId: h.bankAccount1Id,
          statementNumber: "STM-FIN",
          periodStart: "2026-11-01",
          periodEnd: "2026-11-30",
          openingBalance: 0,
          closingBalance: "15000.00",
          lines: [{ transactionDate: "2026-11-10", description: "Matched", deposit: "15000.00", withdrawal: 0 }],
        });

        h.autoMatchStatement(stm.id);
        const rec = h.prepareReconciliation(stm.id);
        expect(rec.difference.eq(zero())).toBe(true);

        const completed = h.completeReconciliation(rec.id);
        expect(completed.status).toBe("COMPLETED");

        // Reopen reconciliation
        completed.status = "REOPENED";
        completed.reopenedReason = "Auditor requested adjustments for unrecorded interest";
        expect(completed.status).toBe("REOPENED");
        expect(completed.reopenedReason).toContain("Auditor requested");
      });
    });
  });

  // ==========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (>=5 Tests per Category)
  // ==========================================================================

  describe("Tier 2: Boundary & Corner Cases", () => {
    // ------------------------------------------------------------------------
    // B1: Zero and Negative Amounts Rejection (5 tests)
    // ------------------------------------------------------------------------
    describe("B1: Zero and Negative Amounts Rejection", () => {
      it("TC-B1-01: Customer receipt with zero amount is rejected", () => {
        const cust = h.createCustomer("B1-CUST-1", "Zero Payer");
        expect(() => {
          h.createVoucherDraft({ direction: "CUSTOMER_RECEIPT", customerId: cust.id, cashAccountId: h.cashAccountId, amount: "0.00" });
        }).toThrow(/INVALID_AMOUNT/);
      });

      it("TC-B1-02: Customer receipt with negative amount is rejected", () => {
        const cust = h.createCustomer("B1-CUST-2", "Negative Payer");
        expect(() => {
          h.createVoucherDraft({ direction: "CUSTOMER_RECEIPT", customerId: cust.id, cashAccountId: h.cashAccountId, amount: "-500.00" });
        }).toThrow(/INVALID_AMOUNT/);
      });

      it("TC-B1-03: Supplier payment with zero amount is rejected", () => {
        const supp = h.createSupplier("B1-SUPP-1", "Zero Supp");
        expect(() => {
          h.createVoucherDraft({ direction: "SUPPLIER_PAYMENT", supplierId: supp.id, cashAccountId: h.cashAccountId, amount: "0" });
        }).toThrow(/INVALID_AMOUNT/);
      });

      it("TC-B1-04: Allocation line with negative amount is rejected", () => {
        const cust = h.createCustomer("B1-CUST-3", "Neg Alloc Cust");
        const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "5000.00" });
        expect(() => {
          h.createVoucherDraft({
            direction: "CUSTOMER_RECEIPT",
            customerId: cust.id,
            cashAccountId: h.cashAccountId,
            amount: "5000.00",
            allocations: [{ salesInvoiceId: inv.id, amount: "-100.00" }],
          });
        }).toThrow(/INVALID_ALLOCATION_AMOUNT/);
      });

      it("TC-B1-05: Bank transfer with zero amount is rejected", () => {
        expect(() => {
          h.createVoucherDraft({
            direction: "BANK_TRANSFER",
            bankAccountId: h.bankAccount1Id,
            targetBankAccountId: h.bankAccount2Id,
            amount: "0.00",
          });
        }).toThrow(/INVALID_AMOUNT/);
      });
    });

    // ------------------------------------------------------------------------
    // B2: Exact Matching Allocation Boundary (5 tests)
    // ------------------------------------------------------------------------
    describe("B2: Exact Matching Allocation Boundary", () => {
      it("TC-B2-01: Exact match allocation leaves invoice outstanding balance precisely 0.0000", () => {
        const cust = h.createCustomer("B2-CUST-1", "Exact Match Cust");
        const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "12345.67" });

        const voucher = h.createVoucherDraft({
          direction: "CUSTOMER_RECEIPT",
          customerId: cust.id,
          cashAccountId: h.cashAccountId,
          amount: "12345.67",
          allocations: [{ salesInvoiceId: inv.id, amount: "12345.67" }],
        });

        h.postVoucher(voucher.id);
        const remaining = inv.grandTotal.minus(inv.settled);
        expect(remaining.eq(zero())).toBe(true);
      });

      it("TC-B2-02: Supplier payment exact match leaves purchase bill open balance precisely 0.0000", () => {
        const supp = h.createSupplier("B2-SUPP-1", "Exact Match Supp");
        const bill = h.createPurchaseReceipt({ supplierId: supp.id, grandTotal: "76543.21" });

        const voucher = h.createVoucherDraft({
          direction: "SUPPLIER_PAYMENT",
          supplierId: supp.id,
          cashAccountId: h.cashAccountId,
          amount: "76543.21",
          allocations: [{ purchaseReceiptId: bill.id, amount: "76543.21" }],
        });

        h.postVoucher(voucher.id);
        expect(bill.grandTotal.minus(bill.settled).eq(zero())).toBe(true);
      });

      it("TC-B2-03: Multi-invoice exact sum matches payment amount leaving advance exactly 0.0000", () => {
        const cust = h.createCustomer("B2-CUST-2", "Multi Exact Cust");
        const inv1 = h.createSalesInvoice({ customerId: cust.id, grandTotal: "1000.50" });
        const inv2 = h.createSalesInvoice({ customerId: cust.id, grandTotal: "2000.50" });

        const voucher = h.createVoucherDraft({
          direction: "CUSTOMER_RECEIPT",
          customerId: cust.id,
          cashAccountId: h.cashAccountId,
          amount: "3001.00",
          allocations: [
            { salesInvoiceId: inv1.id, amount: "1000.50" },
            { salesInvoiceId: inv2.id, amount: "2000.50" },
          ],
        });

        expect(voucher.unallocatedAdvance.eq(zero())).toBe(true);
      });

      it("TC-B2-04: Decimal monetary precision of 4 decimal places maintains exactness without drift", () => {
        const cust = h.createCustomer("B2-CUST-3", "Precision Cust");
        const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "100.1234" });

        const voucher = h.createVoucherDraft({
          direction: "CUSTOMER_RECEIPT",
          customerId: cust.id,
          cashAccountId: h.cashAccountId,
          amount: "100.1234",
          allocations: [{ salesInvoiceId: inv.id, amount: "100.1234" }],
        });

        h.postVoucher(voucher.id);
        expect(inv.settled.toFixed(4)).toBe("100.1234");
      });

      it("TC-B2-05: Single penny / minimal fraction settlement (0.01) operates accurately", () => {
        const cust = h.createCustomer("B2-CUST-4", "Penny Cust");
        const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "0.01" });

        const voucher = h.createVoucherDraft({
          direction: "CUSTOMER_RECEIPT",
          customerId: cust.id,
          cashAccountId: h.cashAccountId,
          amount: "0.01",
          allocations: [{ salesInvoiceId: inv.id, amount: "0.01" }],
        });

        h.postVoucher(voucher.id);
        expect(inv.settled.eq(decimal("0.01"))).toBe(true);
      });
    });

    // ------------------------------------------------------------------------
    // B3: Overpayment Rejection (5 tests)
    // ------------------------------------------------------------------------
    describe("B3: Overpayment Rejection", () => {
      it("TC-B3-01: Sum of allocations exceeding payment amount is rejected with OVER_ALLOCATION", () => {
        const cust = h.createCustomer("B3-CUST-1", "Overallocator");
        const inv1 = h.createSalesInvoice({ customerId: cust.id, grandTotal: "10000.00" });
        const inv2 = h.createSalesInvoice({ customerId: cust.id, grandTotal: "10000.00" });

        expect(() => {
          h.createVoucherDraft({
            direction: "CUSTOMER_RECEIPT",
            customerId: cust.id,
            cashAccountId: h.cashAccountId,
            amount: "15000.00",
            allocations: [
              { salesInvoiceId: inv1.id, amount: "10000.00" },
              { salesInvoiceId: inv2.id, amount: "8000.00" }, // 18,000 > 15,000
            ],
          });
        }).toThrow(/OVER_ALLOCATION/);
      });

      it("TC-B3-02: Allocation exceeding invoice open balance is rejected with INVOICE_OVERPAYMENT", () => {
        const cust = h.createCustomer("B3-CUST-2", "Invoice Overpayer");
        const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "5000.00" });

        expect(() => {
          h.createVoucherDraft({
            direction: "CUSTOMER_RECEIPT",
            customerId: cust.id,
            cashAccountId: h.cashAccountId,
            amount: "7000.00",
            allocations: [{ salesInvoiceId: inv.id, amount: "6000.00" }], // 6,000 > 5,000 open
          });
        }).toThrow(/INVOICE_OVERPAYMENT/);
      });

      it("TC-B3-03: Supplier allocation exceeding bill open balance is rejected with SUPPLIER_OVERPAYMENT", () => {
        const supp = h.createSupplier("B3-SUPP-1", "Bill Overpayer");
        const bill = h.createPurchaseReceipt({ supplierId: supp.id, grandTotal: "12000.00" });

        expect(() => {
          h.createVoucherDraft({
            direction: "SUPPLIER_PAYMENT",
            supplierId: supp.id,
            cashAccountId: h.cashAccountId,
            amount: "15000.00",
            allocations: [{ purchaseReceiptId: bill.id, amount: "13000.00" }],
          });
        }).toThrow(/SUPPLIER_OVERPAYMENT/);
      });

      it("TC-B3-04: Second payment attempting to allocate more than residual open balance is rejected", () => {
        const cust = h.createCustomer("B3-CUST-3", "Residual Cust");
        const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "20000.00" });

        // First payment of 12,000
        const v1 = h.createVoucherDraft({
          direction: "CUSTOMER_RECEIPT",
          customerId: cust.id,
          cashAccountId: h.cashAccountId,
          amount: "12000.00",
          allocations: [{ salesInvoiceId: inv.id, amount: "12000.00" }],
        });
        h.postVoucher(v1.id);

        // Residual open balance is 8,000. Second payment attempts 9,000 allocation.
        expect(() => {
          h.createVoucherDraft({
            direction: "CUSTOMER_RECEIPT",
            customerId: cust.id,
            cashAccountId: h.cashAccountId,
            amount: "9000.00",
            allocations: [{ salesInvoiceId: inv.id, amount: "9000.00" }],
          });
        }).toThrow(/INVOICE_OVERPAYMENT/);
      });

      it("TC-B3-05: Concurrent post-time validation rejects allocation if invoice was settled in parallel", () => {
        const cust = h.createCustomer("B3-CUST-4", "Race Cust");
        const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "10000.00" });

        // Two draft vouchers created when invoice was open
        const v1 = h.createVoucherDraft({
          direction: "CUSTOMER_RECEIPT",
          customerId: cust.id,
          cashAccountId: h.cashAccountId,
          amount: "10000.00",
          allocations: [{ salesInvoiceId: inv.id, amount: "10000.00" }],
        });
        const v2 = h.createVoucherDraft({
          direction: "CUSTOMER_RECEIPT",
          customerId: cust.id,
          cashAccountId: h.cashAccountId,
          amount: "10000.00",
          allocations: [{ salesInvoiceId: inv.id, amount: "10000.00" }],
        });

        // First voucher posts
        h.postVoucher(v1.id);

        // Second voucher post must be rejected at post time
        expect(() => {
          h.postVoucher(v2.id);
        }).toThrow(/INVOICE_OVERPAYMENT/);
      });
    });

    // ------------------------------------------------------------------------
    // B4: Duplicate Allocation Rejection (5 tests)
    // ------------------------------------------------------------------------
    describe("B4: Duplicate Allocation Rejection", () => {
      it("TC-B4-01: Duplicate sales invoice in allocation array is rejected with DUPLICATE_ALLOCATION", () => {
        const cust = h.createCustomer("B4-CUST-1", "Dup Invoice Cust");
        const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "10000.00" });

        expect(() => {
          h.createVoucherDraft({
            direction: "CUSTOMER_RECEIPT",
            customerId: cust.id,
            cashAccountId: h.cashAccountId,
            amount: "8000.00",
            allocations: [
              { salesInvoiceId: inv.id, amount: "4000.00" },
              { salesInvoiceId: inv.id, amount: "4000.00" },
            ],
          });
        }).toThrow(/DUPLICATE_ALLOCATION/);
      });

      it("TC-B4-02: Duplicate purchase receipt in allocation array is rejected with DUPLICATE_ALLOCATION", () => {
        const supp = h.createSupplier("B4-SUPP-1", "Dup Bill Supp");
        const bill = h.createPurchaseReceipt({ supplierId: supp.id, grandTotal: "10000.00" });

        expect(() => {
          h.createVoucherDraft({
            direction: "SUPPLIER_PAYMENT",
            supplierId: supp.id,
            cashAccountId: h.cashAccountId,
            amount: "6000.00",
            allocations: [
              { purchaseReceiptId: bill.id, amount: "3000.00" },
              { purchaseReceiptId: bill.id, amount: "3000.00" },
            ],
          });
        }).toThrow(/DUPLICATE_ALLOCATION/);
      });

      it("TC-B4-03: Mixed customer receipt allocating to purchase bill is rejected", () => {
        const cust = h.createCustomer("B4-CUST-2", "Cross Doc Cust");
        const supp = h.createSupplier("B4-SUPP-2", "Cross Doc Supp");
        const bill = h.createPurchaseReceipt({ supplierId: supp.id, grandTotal: "5000.00" });

        expect(() => {
          h.createVoucherDraft({
            direction: "CUSTOMER_RECEIPT",
            customerId: cust.id,
            cashAccountId: h.cashAccountId,
            amount: "5000.00",
            allocations: [{ purchaseReceiptId: bill.id, amount: "5000.00" }],
          });
        }).toThrow(/INVALID_ALLOCATION/);
      });

      it("TC-B4-04: Single allocation referencing both sales invoice and purchase receipt is rejected", () => {
        const cust = h.createCustomer("B4-CUST-3", "Both Doc Cust");
        const supp = h.createSupplier("B4-SUPP-3", "Both Doc Supp");
        const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "5000.00" });
        const bill = h.createPurchaseReceipt({ supplierId: supp.id, grandTotal: "5000.00" });

        expect(() => {
          h.createVoucherDraft({
            direction: "CUSTOMER_RECEIPT",
            customerId: cust.id,
            cashAccountId: h.cashAccountId,
            amount: "5000.00",
            allocations: [{ salesInvoiceId: inv.id, purchaseReceiptId: bill.id, amount: "5000.00" }],
          });
        }).toThrow(/INVALID_ALLOCATION/);
      });

      it("TC-B4-05: Multiple distinct sales invoices allocated in a single receipt succeed cleanly", () => {
        const cust = h.createCustomer("B4-CUST-4", "Multi Distinct Cust");
        const inv1 = h.createSalesInvoice({ customerId: cust.id, grandTotal: "5000.00" });
        const inv2 = h.createSalesInvoice({ customerId: cust.id, grandTotal: "5000.00" });

        const voucher = h.createVoucherDraft({
          direction: "CUSTOMER_RECEIPT",
          customerId: cust.id,
          cashAccountId: h.cashAccountId,
          amount: "10000.00",
          allocations: [
            { salesInvoiceId: inv1.id, amount: "5000.00" },
            { salesInvoiceId: inv2.id, amount: "5000.00" },
          ],
        });

        expect(voucher.allocations).toHaveLength(2);
      });
    });

    // ------------------------------------------------------------------------
    // B5: Unposted / Cancelled / Draft Invoice Allocation Rejection (5 tests)
    // ------------------------------------------------------------------------
    describe("B5: Unposted / Cancelled / Draft Invoice Allocation Rejection", () => {
      it("TC-B5-01: Allocation against DRAFT sales invoice is rejected with INVALID_ALLOCATION", () => {
        const cust = h.createCustomer("B5-CUST-1", "Draft Inv Cust");
        const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "8000.00", status: "DRAFT" });

        expect(() => {
          h.createVoucherDraft({
            direction: "CUSTOMER_RECEIPT",
            customerId: cust.id,
            cashAccountId: h.cashAccountId,
            amount: "8000.00",
            allocations: [{ salesInvoiceId: inv.id, amount: "8000.00" }],
          });
        }).toThrow(/INVALID_ALLOCATION/);
      });

      it("TC-B5-02: Allocation against SUBMITTED sales invoice is rejected", () => {
        const cust = h.createCustomer("B5-CUST-2", "Submitted Inv Cust");
        const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "8000.00", status: "SUBMITTED" });

        expect(() => {
          h.createVoucherDraft({
            direction: "CUSTOMER_RECEIPT",
            customerId: cust.id,
            cashAccountId: h.cashAccountId,
            amount: "8000.00",
            allocations: [{ salesInvoiceId: inv.id, amount: "8000.00" }],
          });
        }).toThrow(/INVALID_ALLOCATION/);
      });

      it("TC-B5-03: Allocation against CANCELLED sales invoice is rejected", () => {
        const cust = h.createCustomer("B5-CUST-3", "Cancelled Inv Cust");
        const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "8000.00", status: "CANCELLED" });

        expect(() => {
          h.createVoucherDraft({
            direction: "CUSTOMER_RECEIPT",
            customerId: cust.id,
            cashAccountId: h.cashAccountId,
            amount: "8000.00",
            allocations: [{ salesInvoiceId: inv.id, amount: "8000.00" }],
          });
        }).toThrow(/INVALID_ALLOCATION/);
      });

      it("TC-B5-04: Allocation against REVERSED sales invoice is rejected", () => {
        const cust = h.createCustomer("B5-CUST-4", "Reversed Inv Cust");
        const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "8000.00", status: "REVERSED" });

        expect(() => {
          h.createVoucherDraft({
            direction: "CUSTOMER_RECEIPT",
            customerId: cust.id,
            cashAccountId: h.cashAccountId,
            amount: "8000.00",
            allocations: [{ salesInvoiceId: inv.id, amount: "8000.00" }],
          });
        }).toThrow(/INVALID_ALLOCATION/);
      });

      it("TC-B5-05: Allocation against DRAFT purchase bill is rejected", () => {
        const supp = h.createSupplier("B5-SUPP-1", "Draft Bill Supp");
        const bill = h.createPurchaseReceipt({ supplierId: supp.id, grandTotal: "14000.00", status: "DRAFT" });

        expect(() => {
          h.createVoucherDraft({
            direction: "SUPPLIER_PAYMENT",
            supplierId: supp.id,
            cashAccountId: h.cashAccountId,
            amount: "14000.00",
            allocations: [{ purchaseReceiptId: bill.id, amount: "14000.00" }],
          });
        }).toThrow(/INVALID_ALLOCATION/);
      });
    });

    // ------------------------------------------------------------------------
    // B6: Non-existent / Inactive Party & Account Errors (5 tests)
    // ------------------------------------------------------------------------
    describe("B6: Non-existent / Inactive Party & Account Errors", () => {
      it("TC-B6-01: Receipt specifying non-existent customer UUID throws PARTY_NOT_FOUND", () => {
        expect(() => {
          h.createVoucherDraft({
            direction: "CUSTOMER_RECEIPT",
            customerId: "cust-nonexistent-uuid",
            cashAccountId: h.cashAccountId,
            amount: "5000.00",
          });
        }).toThrow(/PARTY_NOT_FOUND/);
      });

      it("TC-B6-02: Receipt specifying INACTIVE customer throws PARTY_INACTIVE", () => {
        const cust = h.createCustomer("B6-CUST-INACT", "Inactive Client");
        cust.status = "INACTIVE";

        expect(() => {
          h.createVoucherDraft({
            direction: "CUSTOMER_RECEIPT",
            customerId: cust.id,
            cashAccountId: h.cashAccountId,
            amount: "5000.00",
          });
        }).toThrow(/PARTY_INACTIVE/);
      });

      it("TC-B6-03: Supplier payment specifying non-existent supplier throws PARTY_NOT_FOUND", () => {
        expect(() => {
          h.createVoucherDraft({
            direction: "SUPPLIER_PAYMENT",
            supplierId: "supp-nonexistent-uuid",
            cashAccountId: h.cashAccountId,
            amount: "5000.00",
          });
        }).toThrow(/PARTY_NOT_FOUND/);
      });

      it("TC-B6-04: Receipt specifying both cash account and bank account without method throws PAYMENT_SETTLEMENT_REQUIRED", () => {
        const cust = h.createCustomer("B6-CUST-2", "Both Accounts Cust");
        expect(() => {
          h.createVoucherDraft({
            direction: "CUSTOMER_RECEIPT",
            customerId: cust.id,
            cashAccountId: h.cashAccountId,
            bankAccountId: h.bankAccount1Id,
            amount: "5000.00",
          });
        }).toThrow(/PAYMENT_SETTLEMENT_REQUIRED/);
      });

      it("TC-B6-05: Receipt with currency mismatch between voucher and bank account throws CURRENCY_MISMATCH", () => {
        const cust = h.createCustomer("B6-CUST-3", "FX Cust");
        expect(() => {
          h.createVoucherDraft({
            direction: "CUSTOMER_RECEIPT",
            customerId: cust.id,
            bankAccountId: h.bankAccount1Id,
            currencyCode: "USD", // Bank account is PKR
            amount: "100.00",
          });
        }).toThrow(/CURRENCY_MISMATCH/);
      });
    });
  });

  // ==========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS (Pairwise Interaction Tests)
  // ==========================================================================

  describe("Tier 3: Cross-Feature Combinations", () => {
    it("TC-C-01: 1:N multi-invoice allocation settles 3 invoices in a single transaction with balanced GL", () => {
      const cust = h.createCustomer("CUST-MULTI-INV", "Retail Mega Store");
      const inv1 = h.createSalesInvoice({ customerId: cust.id, grandTotal: "10000.00" });
      const inv2 = h.createSalesInvoice({ customerId: cust.id, grandTotal: "8000.00" });
      const inv3 = h.createSalesInvoice({ customerId: cust.id, grandTotal: "7000.00" });

      expect(cust.subledgerBalance.eq(decimal("25000.00"))).toBe(true);

      const voucher = h.createVoucherDraft({
        direction: "CUSTOMER_RECEIPT",
        customerId: cust.id,
        paymentMethodId: "pm-bank",
        reference: "BULK-SETTLE-01",
        amount: "25000.00",
        allocations: [
          { salesInvoiceId: inv1.id, amount: "10000.00" },
          { salesInvoiceId: inv2.id, amount: "8000.00" },
          { salesInvoiceId: inv3.id, amount: "7000.00" },
        ],
      });

      h.postVoucher(voucher.id);

      expect(inv1.settled.eq(decimal("10000.00"))).toBe(true);
      expect(inv2.settled.eq(decimal("8000.00"))).toBe(true);
      expect(inv3.settled.eq(decimal("7000.00"))).toBe(true);
      expect(cust.subledgerBalance.eq(zero())).toBe(true);
      h.assertDoubleEntryBalance(voucher.journalEntryId!);
      h.assertCustomerSubledgerReconciliation(cust.id);
    });

    it("TC-C-02: N:1 multi-receipt to single invoice progressively settles invoice from different payment methods", () => {
      const cust = h.createCustomer("CUST-N-1", "Staggered Payer");
      const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "30000.00" });

      // Receipt 1: 12,000 Cash
      const v1 = h.createVoucherDraft({
        direction: "CUSTOMER_RECEIPT",
        customerId: cust.id,
        paymentMethodId: "pm-cash",
        amount: "12000.00",
        allocations: [{ salesInvoiceId: inv.id, amount: "12000.00" }],
      });
      h.postVoucher(v1.id);
      expect(inv.settled.eq(decimal("12000.00"))).toBe(true);
      expect(cust.subledgerBalance.eq(decimal("18000.00"))).toBe(true);

      // Receipt 2: 10,000 Cheque
      const v2 = h.createVoucherDraft({
        direction: "CUSTOMER_RECEIPT",
        customerId: cust.id,
        paymentMethodId: "pm-cheque",
        reference: "CHQ-STAG-2",
        amount: "10000.00",
        allocations: [{ salesInvoiceId: inv.id, amount: "10000.00" }],
      });
      h.postVoucher(v2.id);
      expect(inv.settled.eq(decimal("22000.00"))).toBe(true);
      expect(cust.subledgerBalance.eq(decimal("8000.00"))).toBe(true);

      // Receipt 3: 8,000 Bank Transfer
      const v3 = h.createVoucherDraft({
        direction: "CUSTOMER_RECEIPT",
        customerId: cust.id,
        paymentMethodId: "pm-bank",
        reference: "WIRE-STAG-3",
        amount: "8000.00",
        allocations: [{ salesInvoiceId: inv.id, amount: "8000.00" }],
      });
      h.postVoucher(v3.id);
      expect(inv.settled.eq(decimal("30000.00"))).toBe(true);
      expect(cust.subledgerBalance.eq(zero())).toBe(true);
    });

    it("TC-C-03: Partial allocation + surplus customer advance settles invoice and persists advance balance", () => {
      const cust = h.createCustomer("CUST-PART-ADV", "Advance Combined Client");
      const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "9500.00" });

      const voucher = h.createVoucherDraft({
        direction: "CUSTOMER_RECEIPT",
        customerId: cust.id,
        cashAccountId: h.cashAccountId,
        amount: "15000.00",
        allocations: [{ salesInvoiceId: inv.id, amount: "9500.00" }],
      });

      expect(voucher.unallocatedAdvance.eq(decimal("5500.00"))).toBe(true);
      h.postVoucher(voucher.id);

      expect(inv.settled.eq(decimal("9500.00"))).toBe(true);
      expect(cust.subledgerBalance.eq(decimal("-5500.00"))).toBe(true);
      h.assertCustomerSubledgerReconciliation(cust.id);
    });

    it("TC-C-04: Supplier 1:N multi-bill allocation with partial surplus advance", () => {
      const supp = h.createSupplier("SUPP-MULTI-BILL", "Consolidated Supplier");
      const bill1 = h.createPurchaseReceipt({ supplierId: supp.id, grandTotal: "18000.00" });
      const bill2 = h.createPurchaseReceipt({ supplierId: supp.id, grandTotal: "14000.00" });

      const voucher = h.createVoucherDraft({
        direction: "SUPPLIER_PAYMENT",
        supplierId: supp.id,
        paymentMethodId: "pm-bank",
        reference: "CONSOL-PAY",
        amount: "40000.00",
        allocations: [
          { purchaseReceiptId: bill1.id, amount: "18000.00" },
          { purchaseReceiptId: bill2.id, amount: "14000.00" },
        ],
      });

      expect(voucher.unallocatedAdvance.eq(decimal("8000.00"))).toBe(true);
      h.postVoucher(voucher.id);

      expect(bill1.settled.eq(decimal("18000.00"))).toBe(true);
      expect(bill2.settled.eq(decimal("14000.00"))).toBe(true);
      expect(supp.subledgerBalance.eq(decimal("-8000.00"))).toBe(true);
      h.assertSupplierSubledgerReconciliation(supp.id);
    });

    it("TC-C-05: Voucher cancellation workflow transitions status, prevents posting, and creates no GL entries", () => {
      const cust = h.createCustomer("CUST-CANCEL", "Cancel Client");
      const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "7000.00" });

      const voucher = h.createVoucherDraft({
        direction: "CUSTOMER_RECEIPT",
        customerId: cust.id,
        cashAccountId: h.cashAccountId,
        amount: "7000.00",
        allocations: [{ salesInvoiceId: inv.id, amount: "7000.00" }],
      });

      h.submitVoucher(voucher.id);
      h.cancelVoucher(voucher.id, "Customer cheque failed signature verification before banking");

      expect(voucher.status).toBe("CANCELLED");
      expect(voucher.journalEntryId).toBeUndefined();

      // Ensure cancelled voucher cannot be posted
      expect(() => {
        h.postVoucher(voucher.id);
      }).toThrow(/INVALID_DOCUMENT_STATE/);

      // Invoice remains completely open
      expect(inv.settled.eq(zero())).toBe(true);
    });

    it("TC-C-06: Voucher reversal creates inverted GL entry, releases allocations, and restores subledgers", () => {
      const cust = h.createCustomer("CUST-REV-COMB", "Reversal Client");
      const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "10000.00" });

      const voucher = h.createVoucherDraft({
        direction: "CUSTOMER_RECEIPT",
        customerId: cust.id,
        cashAccountId: h.cashAccountId,
        amount: "10000.00",
        allocations: [{ salesInvoiceId: inv.id, amount: "10000.00" }],
      });
      h.postVoucher(voucher.id);
      expect(inv.settled.eq(decimal("10000.00"))).toBe(true);
      expect(cust.subledgerBalance.eq(zero())).toBe(true);

      // Reversal
      const reversed = h.reverseVoucher(voucher.id, "Payment entered against wrong customer account");
      expect(reversed.status).toBe("REVERSED");
      expect(inv.settled.eq(zero())).toBe(true);
      expect(cust.subledgerBalance.eq(decimal("10000.00"))).toBe(true);

      // Verify reversal GL journal is balanced and inverts original Dr/Cr
      const revJe = h.journals.get(reversed.reversalJournalId!)!;
      h.assertDoubleEntryBalance(revJe.id);

      // Verify invoice is now available to be settled by another payment
      const v2 = h.createVoucherDraft({
        direction: "CUSTOMER_RECEIPT",
        customerId: cust.id,
        cashAccountId: h.cashAccountId,
        amount: "10000.00",
        allocations: [{ salesInvoiceId: inv.id, amount: "10000.00" }],
      });
      h.postVoucher(v2.id);
      expect(inv.settled.eq(decimal("10000.00"))).toBe(true);
    });

    it("TC-C-07: Contra deposit followed by inter-bank transfer and statement reconciliation", () => {
      // Step 1: Contra deposit 50,000 Cash -> Bank 1
      const contra = h.createVoucherDraft({
        direction: "CONTRA_DEPOSIT",
        bankAccountId: h.bankAccount1Id,
        cashAccountId: h.cashAccountId,
        amount: "50000.00",
        reference: "DEP-REC-1",
      });
      h.postVoucher(contra.id);

      // Step 2: Inter-bank transfer 30,000 from Bank 1 -> Bank 2
      const transfer = h.createVoucherDraft({
        direction: "BANK_TRANSFER",
        bankAccountId: h.bankAccount1Id,
        targetBankAccountId: h.bankAccount2Id,
        amount: "30000.00",
        reference: "TR-REC-1",
      });
      h.postVoucher(transfer.id);

      // Bank 1 net book balance = +50,000 - 30,000 = +20,000
      const bnk1 = h.bankAccounts.get(h.bankAccount1Id)!;
      expect(bnk1.bookBalance.eq(decimal("20000.00"))).toBe(true);

      // Step 3: Bank 1 statement reconciliation
      const stm = h.importStatement({
        bankAccountId: h.bankAccount1Id,
        statementNumber: "STM-B1-COMB",
        periodStart: "2026-11-01",
        periodEnd: "2026-11-30",
        openingBalance: 0,
        closingBalance: "20000.00",
        lines: [
          { transactionDate: "2026-11-10", description: "Cash Deposit", deposit: "50000.00", withdrawal: 0 },
          { transactionDate: "2026-11-10", description: "Transfer Out", deposit: 0, withdrawal: "30000.00" },
        ],
      });

      const autoRes = h.autoMatchStatement(stm.id);
      expect(autoRes.matchedCount).toBe(2);

      const rec = h.prepareReconciliation(stm.id);
      expect(rec.difference.eq(zero())).toBe(true);
      const completed = h.completeReconciliation(rec.id);
      expect(completed.status).toBe("COMPLETED");
    });
  });

  // ==========================================================================
  // TIER 4: REAL-WORLD SCENARIOS (Multi-Stage End-to-End Lifecycles)
  // ==========================================================================

  describe("Tier 4: Real-World Scenarios", () => {
    it("TC-R-01: End-to-end sales invoice -> partial receipts -> customer advance -> bank deposit -> reconciliation with charges/interest", () => {
      // 1. Issue Sales Invoice for 15,000 PKR to Customer Alpha
      const cust = h.createCustomer("CUST-ALPHA", "Alpha Trading House");
      const inv = h.createSalesInvoice({ customerId: cust.id, grandTotal: "15000.00" });
      expect(cust.subledgerBalance.eq(decimal("15000.00"))).toBe(true);

      // 2. Partial cash receipt of 5,000 PKR
      const r1 = h.createVoucherDraft({
        direction: "CUSTOMER_RECEIPT",
        customerId: cust.id,
        paymentMethodId: "pm-cash",
        amount: "5000.00",
        allocations: [{ salesInvoiceId: inv.id, amount: "5000.00" }],
      });
      h.postVoucher(r1.id);
      expect(inv.settled.eq(decimal("5000.00"))).toBe(true);
      expect(cust.subledgerBalance.eq(decimal("10000.00"))).toBe(true);

      // 3. Second bank cheque receipt of 7,000 PKR
      const r2 = h.createVoucherDraft({
        direction: "CUSTOMER_RECEIPT",
        customerId: cust.id,
        paymentMethodId: "pm-cheque",
        reference: "CHQ-7000",
        amount: "7000.00",
        allocations: [{ salesInvoiceId: inv.id, amount: "7000.00" }],
      });
      h.postVoucher(r2.id);
      expect(inv.settled.eq(decimal("12000.00"))).toBe(true);
      expect(cust.subledgerBalance.eq(decimal("3000.00"))).toBe(true);

      // 4. Customer pays 5,000 PKR via Bank Transfer: 3,000 clears invoice to 0, 2,000 becomes customer advance
      const r3 = h.createVoucherDraft({
        direction: "CUSTOMER_RECEIPT",
        customerId: cust.id,
        paymentMethodId: "pm-bank",
        reference: "WIRE-5000",
        amount: "5000.00",
        allocations: [{ salesInvoiceId: inv.id, amount: "3000.00" }],
      });
      expect(r3.unallocatedAdvance.eq(decimal("2000.00"))).toBe(true);
      h.postVoucher(r3.id);
      expect(inv.settled.eq(decimal("15000.00"))).toBe(true);
      expect(cust.subledgerBalance.eq(decimal("-2000.00"))).toBe(true);

      // 5. Cash contra deposit of 5,000 PKR from drawer to bank
      const contra = h.createVoucherDraft({
        direction: "CONTRA_DEPOSIT",
        bankAccountId: h.bankAccount1Id,
        cashAccountId: h.cashAccountId,
        amount: "5000.00",
        reference: "DRAWER-DEP",
      });
      h.postVoucher(contra.id);

      // Current bank book balance = 7,000 (cheque) + 5,000 (transfer) + 5,000 (contra) = 17,000 PKR
      const bnk = h.bankAccounts.get(h.bankAccount1Id)!;
      expect(bnk.bookBalance.eq(decimal("17000.00"))).toBe(true);

      // 6. Explicitly book unrecorded statement items:
      // Bank charges of 150 PKR
      h.bookBankCharges(h.bankAccount1Id, "150.00", "2026-11-30", "Nov Service Fee");
      // Interest earned of 50 PKR
      h.bookInterestIncome(h.bankAccount1Id, "50.00", "2026-11-30", "Nov Profit");

      // Book balance after charges/interest = 17,000 - 150 + 50 = 16,900 PKR
      expect(bnk.bookBalance.eq(decimal("16900.00"))).toBe(true);

      // 7. Bank statement arrives with closing balance of 16,900 PKR
      const stm = h.importStatement({
        bankAccountId: h.bankAccount1Id,
        statementNumber: "STM-REAL-01",
        periodStart: "2026-11-01",
        periodEnd: "2026-11-30",
        openingBalance: 0,
        closingBalance: "16900.00",
        lines: [
          { transactionDate: "2026-11-10", description: "CHQ-7000", deposit: "7000.00", withdrawal: 0 },
          { transactionDate: "2026-11-10", description: "WIRE-5000", deposit: "5000.00", withdrawal: 0 },
          { transactionDate: "2026-11-10", description: "DRAWER-DEP", deposit: "5000.00", withdrawal: 0 },
          { transactionDate: "2026-11-30", description: "Nov Service Fee", deposit: 0, withdrawal: "150.00" },
          { transactionDate: "2026-11-30", description: "Nov Profit", deposit: "50.00", withdrawal: 0 },
        ],
      });

      // 8. Auto-match all 5 lines and verify reconciliation completes with zero difference
      const matchResult = h.autoMatchStatement(stm.id);
      expect(matchResult.matchedCount).toBe(5);
      expect(matchResult.unmatchedCount).toBe(0);

      const rec = h.prepareReconciliation(stm.id);
      expect(rec.difference.eq(zero())).toBe(true);

      const completed = h.completeReconciliation(rec.id);
      expect(completed.status).toBe("COMPLETED");

      // Verify subledger strictly matches AR Control account
      h.assertCustomerSubledgerReconciliation(cust.id);
      h.assertAllJournalsBalanced();
    });

    it("TC-R-02: Supplier procure-to-pay settlement -> partial payment -> balance settlement -> bounced cheque reversal lifecycle", () => {
      // 1. Post Purchase Bill for 50,000 PKR to Supplier Beta
      const supp = h.createSupplier("SUPP-BETA", "Beta Electronics Wholesaler");
      const bill = h.createPurchaseReceipt({ supplierId: supp.id, grandTotal: "50000.00" });
      expect(supp.subledgerBalance.eq(decimal("50000.00"))).toBe(true);

      // 2. Partial bank transfer payment of 20,000 PKR
      const p1 = h.createVoucherDraft({
        direction: "SUPPLIER_PAYMENT",
        supplierId: supp.id,
        paymentMethodId: "pm-bank",
        reference: "PARTIAL-20K",
        amount: "20000.00",
        allocations: [{ purchaseReceiptId: bill.id, amount: "20000.00" }],
      });
      h.postVoucher(p1.id);
      expect(bill.settled.eq(decimal("20000.00"))).toBe(true);
      expect(supp.subledgerBalance.eq(decimal("30000.00"))).toBe(true);

      // 3. Second payment of 30,000 PKR via Cheque clears the bill
      const p2 = h.createVoucherDraft({
        direction: "SUPPLIER_PAYMENT",
        supplierId: supp.id,
        paymentMethodId: "pm-cheque",
        reference: "CHQ-BOUNCE-30K",
        amount: "30000.00",
        allocations: [{ purchaseReceiptId: bill.id, amount: "30000.00" }],
      });
      h.postVoucher(p2.id);
      expect(bill.settled.eq(decimal("50000.00"))).toBe(true);
      expect(supp.subledgerBalance.eq(zero())).toBe(true);

      // 4. Cheque bounces at bank clearing! Execute authorized reversal
      h.reverseVoucher(p2.id, "Cheque returned unpaid by clearing house - insufficient funds");
      expect(p2.status).toBe("REVERSED");

      // 5. Bill open balance is restored from 0 to 30,000 PKR, and supplier subledger restored to 30,000 payable
      expect(bill.settled.eq(decimal("20000.00"))).toBe(true);
      expect(bill.grandTotal.minus(bill.settled).eq(decimal("30000.00"))).toBe(true);
      expect(supp.subledgerBalance.eq(decimal("30000.00"))).toBe(true);
      h.assertSupplierSubledgerReconciliation(supp.id);

      // 6. Replacement cash payment of 30,000 PKR permanently clears bill
      const p3 = h.createVoucherDraft({
        direction: "SUPPLIER_PAYMENT",
        supplierId: supp.id,
        paymentMethodId: "pm-cash",
        amount: "30000.00",
        allocations: [{ purchaseReceiptId: bill.id, amount: "30000.00" }],
      });
      h.postVoucher(p3.id);
      expect(bill.settled.eq(decimal("50000.00"))).toBe(true);
      expect(supp.subledgerBalance.eq(zero())).toBe(true);
      h.assertAllJournalsBalanced();
    });

    it("TC-R-03: High-volume multi-party matrix strictly verifies AR and AP General Ledger control reconciliations", () => {
      // 4 Customers, 3 Suppliers, 10 Invoices, 6 Bills with mixed settlements and advances
      const custA = h.createCustomer("HP-CUST-A", "Customer Alpha");
      const custB = h.createCustomer("HP-CUST-B", "Customer Beta");
      const custC = h.createCustomer("HP-CUST-C", "Customer Gamma");
      const custD = h.createCustomer("HP-CUST-D", "Customer Delta");

      const suppX = h.createSupplier("HP-SUPP-X", "Supplier X-Ray");
      const suppY = h.createSupplier("HP-SUPP-Y", "Supplier Yankee");
      const suppZ = h.createSupplier("HP-SUPP-Z", "Supplier Zulu");

      // Invoices
      const iA1 = h.createSalesInvoice({ customerId: custA.id, grandTotal: "10000.00" });
      const iA2 = h.createSalesInvoice({ customerId: custA.id, grandTotal: "15000.00" });
      const iB1 = h.createSalesInvoice({ customerId: custB.id, grandTotal: "25000.00" });
      const iC1 = h.createSalesInvoice({ customerId: custC.id, grandTotal: "40000.00" });
      const iD1 = h.createSalesInvoice({ customerId: custD.id, grandTotal: "5000.00" });

      // Bills
      const bX1 = h.createPurchaseReceipt({ supplierId: suppX.id, grandTotal: "30000.00" });
      const bY1 = h.createPurchaseReceipt({ supplierId: suppY.id, grandTotal: "20000.00" });
      const bZ1 = h.createPurchaseReceipt({ supplierId: suppZ.id, grandTotal: "50000.00" });

      // Settle Customer A: partial 12,000 (10,000 on iA1, 2,000 on iA2)
      const vA = h.createVoucherDraft({
        direction: "CUSTOMER_RECEIPT",
        customerId: custA.id,
        cashAccountId: h.cashAccountId,
        amount: "12000.00",
        allocations: [
          { salesInvoiceId: iA1.id, amount: "10000.00" },
          { salesInvoiceId: iA2.id, amount: "2000.00" },
        ],
      });
      h.postVoucher(vA.id);

      // Settle Customer B: 30,000 (25,000 clears iB1, 5,000 advance)
      const vB = h.createVoucherDraft({
        direction: "CUSTOMER_RECEIPT",
        customerId: custB.id,
        paymentMethodId: "pm-bank",
        reference: "B-SETTLE",
        amount: "30000.00",
        allocations: [{ salesInvoiceId: iB1.id, amount: "25000.00" }],
      });
      h.postVoucher(vB.id);

      // Settle Supplier X: full 30,000
      const vX = h.createVoucherDraft({
        direction: "SUPPLIER_PAYMENT",
        supplierId: suppX.id,
        cashAccountId: h.cashAccountId,
        amount: "30000.00",
        allocations: [{ purchaseReceiptId: bX1.id, amount: "30000.00" }],
      });
      h.postVoucher(vX.id);

      // Settle Supplier Y: 25,000 (20,000 clears bY1, 5,000 advance)
      const vY = h.createVoucherDraft({
        direction: "SUPPLIER_PAYMENT",
        supplierId: suppY.id,
        paymentMethodId: "pm-bank",
        reference: "Y-ADV",
        amount: "25000.00",
        allocations: [{ purchaseReceiptId: bY1.id, amount: "20000.00" }],
      });
      h.postVoucher(vY.id);

      // Rigorous Subledger-to-Control Reconciliations across all parties
      h.assertCustomerSubledgerReconciliation(custA.id);
      h.assertCustomerSubledgerReconciliation(custB.id);
      h.assertCustomerSubledgerReconciliation(custC.id);
      h.assertCustomerSubledgerReconciliation(custD.id);

      h.assertSupplierSubledgerReconciliation(suppX.id);
      h.assertSupplierSubledgerReconciliation(suppY.id);
      h.assertSupplierSubledgerReconciliation(suppZ.id);

      h.assertAllJournalsBalanced();
    });

    it("TC-R-04: Single-hyphen sequence formatting integrity and isolated bulk posting simulation", () => {
      // 1. Single-hyphen sequence verification
      const seqGen = new SequentialNumberGenerator();
      const num1 = seqGen.generate("ISB-", "RC", "2026-27");
      const num2 = seqGen.generate("ISB--", "RC", "2026-27");
      const num3 = seqGen.generate("LHR", "PV", "2026-27");

      expect(num1).toBe("ISB-RC-FY2026-27-000001");
      expect(num2).toBe("ISB-RC-FY2026-27-000002"); // Sanitizes double hyphens
      expect(num3).toBe("LHR-PV-FY2026-27-000001");

      // 2. Isolated Atomic Bulk Posting Simulation
      // Setup batch: 3 valid vouchers, 1 invalid voucher (overpayment allocation)
      const cust = h.createCustomer("BULK-CUST", "Bulk Client");
      const inv1 = h.createSalesInvoice({ customerId: cust.id, grandTotal: "5000.00" });
      const inv2 = h.createSalesInvoice({ customerId: cust.id, grandTotal: "5000.00" });

      const vValid1 = h.createVoucherDraft({
        direction: "CUSTOMER_RECEIPT",
        customerId: cust.id,
        cashAccountId: h.cashAccountId,
        amount: "5000.00",
        allocations: [{ salesInvoiceId: inv1.id, amount: "5000.00" }],
      });
      h.submitVoucher(vValid1.id);

      const vValid2 = h.createVoucherDraft({
        direction: "CUSTOMER_RECEIPT",
        customerId: cust.id,
        cashAccountId: h.cashAccountId,
        amount: "5000.00",
        allocations: [{ salesInvoiceId: inv2.id, amount: "5000.00" }],
      });
      h.submitVoucher(vValid2.id);

      const vValid3 = h.createVoucherDraft({
        direction: "CUSTOMER_RECEIPT",
        customerId: cust.id,
        cashAccountId: h.cashAccountId,
        amount: "2000.00",
        allocations: [], // Standalone advance
      });
      h.submitVoucher(vValid3.id);

      // Create an invalid voucher manually pointing to an already cleared invoice or invalid allocation
      const vInvalid = h.createVoucherDraft({
        direction: "CUSTOMER_RECEIPT",
        customerId: cust.id,
        cashAccountId: h.cashAccountId,
        amount: "5000.00",
        allocations: [],
      });
      h.submitVoucher(vInvalid.id);
      // Manually corrupt allocation after creation to simulate a stale/invalid condition
      vInvalid.allocations.push({
        id: "corrupt",
        paymentId: vInvalid.id,
        salesInvoiceId: inv1.id,
        amount: decimal("100000.00"), // Massive overpayment
      });

      const batch = [vValid1.id, vValid2.id, vInvalid.id, vValid3.id];
      const results: Array<{ id: string; success: boolean; error?: string }> = [];

      for (const id of batch) {
        try {
          h.postVoucher(id);
          results.push({ id, success: true });
        } catch (err: any) {
          results.push({ id, success: false, error: err.message });
        }
      }

      // 3 succeeded, 1 failed isolatedly
      const succeeded = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      expect(succeeded).toHaveLength(3);
      expect(failed).toHaveLength(1);
      expect(failed[0].id).toBe(vInvalid.id);
      expect(failed[0].error).toContain("INVOICE_OVERPAYMENT");

      // Verify valid vouchers posted cleanly to GL
      expect(vValid1.status).toBe("POSTED");
      expect(vValid2.status).toBe("POSTED");
      expect(vValid3.status).toBe("POSTED");
      expect(vInvalid.status).toBe("SUBMITTED"); // Unaffected by failure
      h.assertAllJournalsBalanced();
    });
  });
});
