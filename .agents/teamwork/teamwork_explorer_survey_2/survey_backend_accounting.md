# Technical Survey & Architectural Report: Backend Services, Workflow Repair & Accounting Integration

**Document Reference:** `survey_backend_accounting.md`  
**Working Directory:** `d:\Inventory Managment Software\.agents\teamwork\teamwork_explorer_survey_2\`  
**Investigator:** `teamwork_explorer_survey_2` (Survey Phase — Backend Services & Double-Entry Accounting)  
**Date:** November 10, 2026  
**Target Module:** Cash, Bank & Party Settlement Module (Axon Mobile ERP)  
**Integrity Mode:** Strict Read-Only Survey & Architectural Blueprint  

---

## 1. Executive Summary & Core Survey Findings

A comprehensive technical and functional audit of the Axon Mobile ERP backend services, workflow engines, database models, and double-entry accounting integration was performed in accordance with `ORIGINAL_REQUEST.md`.

### Core Architectural Discoveries:
1. **Approval Workflow Decoupling Requirement**:
   - The system historically enforced maker-checker separation (`assertMakerChecker`, `assertSegregationOfDuties`), commercial approval policy bands (`ApprovalPolicy`), and operating mode checks (`system.operating_mode`).
   - In `src/lib/operating-mode.ts` and `src/lib/policies.ts`, stubs exist returning immediately, but `src/lib/operations/payments.ts` still contains legacy status mutation logic (forcing `status = APPROVED` inside `postPayment`), calls `assertSegregationOfDuties`, calls `assertApprovalPolicy`, and relies on a redundant `approvePayment` service.
   - Settlement vouchers still appear in the governance approval queue (`src/app/api/approvals/route.ts` lines 103–112).
   - **Correction**: Settlement vouchers must be completely excised from `src/app/api/approvals`, the redundant `approvePayment` step removed, and `postPayment` updated to transition directly from `SUBMITTED` (or `DRAFT`) to `POSTED` under standard `PAYMENT_POST` RBAC authority.

2. **Voucher Lifecycle Gaps**:
   - Voucher statuses are defined by `OperationalDocumentStatus` (`DRAFT`, `SUBMITTED`, `POSTED`, `CANCELLED`, `REVERSED`).
   - The current API has endpoints for `POST /api/payments` (Draft/Auto-post), `PATCH /api/payments/[id]` (Draft edit), `DELETE /api/payments/[id]` (hard delete), `POST /api/payments/[id]/submit`, and `POST /api/payments/[id]/post`.
   - **Critical Missing Endpoints**:
     * `POST /api/payments/[id]/cancel`: Does not exist. Currently unposted vouchers can only be hard-deleted from the database via `DELETE`, destroying audit trails.
     * `POST /api/payments/[id]/reverse`: Does not exist in the payments API or services. There is no `reversePayment` implementation in `src/lib/operations/payments.ts` or `src/lib/operations/reversals.ts`.

3. **Double-Entry Accounting & Zero Hardcoded Accounts**:
   - The General Ledger generation in `postOperationalJournal` (`src/lib/operations/accounting.ts`) generates atomic, balanced double entries linking settlement accounts (Cash/Bank) and party control accounts (`ACCOUNTS_RECEIVABLE` / `ACCOUNTS_PAYABLE`).
   - While `requirePostingAccount` dynamically resolves control accounts via COA `accountType`, hardcoded fallbacks were discovered in `src/app/api/finance/banking/transfers/route.ts` (lines 50, 137, 167) and `src/lib/finance/cash-in-hand.ts` (line 26) targeting `{ code: "1000" }` or name matches. These must be replaced with strict dynamic resolution of `accountType: "CASH"`.

4. **Allocation & Settlement Incompleteness**:
   - `/api/operations/lookups` currently returns posted invoices with only `grandTotal`. It **fails to calculate `previouslyPaid` or `outstandingAmount`**.
   - `paymentDraftSchema` does not prevent duplicate allocations against the same invoice in a single voucher.
   - `createPaymentDraft` does not validate that allocated invoices are `POSTED` or unreversed; over-allocation is only caught at posting time.
   - Crucially, `validateAllocations` in `payments.ts` checks against `grandTotal` without subtracting credit notes / returns (`StockReturn`), risking false overpayment rejections.
   - Unallocated amounts on customer receipts are credited to Accounts Receivable with `customerId` tagged, correctly reflected as on-account advances (`residual` in aging), maintaining 100% reconciliation with AR control accounts.

5. **Bulk Posting & Bank Reconciliation Gaps**:
   - `POST /api/payments/batch-post` exists but lacks pre-validation, lacks branch-level scoping, and only returns success counts without financial totals (`postedAmount`, `failedAmount`).
   - Bank reconciliation (`src/lib/finance/banking.ts`) computes book vs statement differences but lacks an integrated endpoint to post classified accounting entries for bank charges and interest directly from the statement reconciliation workflow.

---

## 2. Complete Backend Endpoint, Service & Repository Map

| Route / Endpoint | HTTP Method | Controller / Route Handler | Service Function | Primary Prisma Models | RBAC Permission | Current State & Required Corrections |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `/api/payments` | `GET` | `src/app/api/payments/route.ts:16` | Direct Prisma query | `Payment`, `PaymentAllocation`, `Customer`, `Supplier`, `BankAccount`, `Account` | `PAYMENT_VIEW` | **Existing**: Supports branch scoping, pagination, direction, status, search filters. Needs addition of date range filters. |
| `/api/payments` | `POST` | `src/app/api/payments/route.ts:47` | `createPaymentDraft`, `submitPayment`, `postPayment` | `Payment`, `PaymentAllocation`, `DocumentSequence`, `AuditLog` | `PAYMENT_CREATE` | **Needs Repair**: If `autoPost=true`, chains `submitPayment -> approvePayment -> postPayment`. Must eliminate `approvePayment` call. |
| `/api/payments/[id]` | `GET` | `src/app/api/payments/[id]/route.ts:12` | Direct Prisma query | `Payment`, `PaymentAllocation`, `JournalEntry`, `AuditLog` | `PAYMENT_VIEW` | **Existing**: Comprehensive detail query returning allocations, journal entries, and counterparty details. |
| `/api/payments/[id]` | `PATCH` | `src/app/api/payments/[id]/route.ts:192` | `updatePaymentDraft` | `Payment`, `PaymentAllocation`, `AuditLog` | `PAYMENT_CREATE` | **Needs Repair**: Reverts `SUBMITTED` or `APPROVED` to `DRAFT`. Must support editing `DRAFT` and `SUBMITTED` vouchers directly without approval resets. |
| `/api/payments/[id]` | `DELETE` | `src/app/api/payments/[id]/route.ts:215` | `deletePayment` | `Payment`, `PaymentAllocation`, `AuditLog` | `PAYMENT_CREATE` | **Existing**: Hard deletes unposted vouchers. Should be retained for draft cleanup, but `cancel` must be added for formal cancellation. |
| `/api/payments/[id]/submit` | `POST` | `src/app/api/payments/[id]/submit/route.ts:9` | `submitPayment` | `Payment`, `AuditLog` | `PAYMENT_CREATE` | **Existing**: Transitions `DRAFT` to `SUBMITTED`. Verifies permissions. |
| `/api/payments/[id]/approve` | `POST` | `src/app/api/payments/[id]/approve/route.ts:9` | `approvePayment` | `Payment`, `AuditLog` | `PAYMENT_APPROVE` | **REDUNDANT**: Approvals must be eliminated from settlement. Endpoint should be deprecated / removed or auto-pass without maker-checker. |
| `/api/payments/[id]/post` | `POST` | `src/app/api/payments/[id]/post/route.ts:9` | `postPayment` | `Payment`, `JournalEntry`, `JournalEntryLine`, `BankTransaction`, `DocumentSequence`, `AuditLog` | `PAYMENT_POST` | **Needs Repair**: Currently sets `status: APPROVED` before posting. Must post directly from `SUBMITTED` or `DRAFT` to `POSTED` atomically. |
| `/api/payments/[id]/cancel` | `POST` | **MISSING** (`src/app/api/payments/[id]/cancel/route.ts`) | **MISSING** (`cancelPayment` in `payments.ts`) | `Payment`, `AuditLog` | `PAYMENT_CREATE` | **NEW REQUIRED**: Must transition unposted voucher to `CANCELLED` with audit trail (`cancelledById`, `cancelledAt`, `reason`). |
| `/api/payments/[id]/reverse` | `POST` | **MISSING** (`src/app/api/payments/[id]/reverse/route.ts`) | **MISSING** (`reversePayment` in `payments.ts`) | `Payment`, `JournalEntry`, `JournalEntryLine`, `BankTransaction`, `AuditLog` | `PAYMENT_REVERSE` | **NEW REQUIRED**: Atomically reverses posted payment, generates reversal journal, releases allocations, marks payment `REVERSED`. |
| `/api/payments/batch-post` | `POST` | `src/app/api/payments/batch-post/route.ts:10` | `postPayment` (in loop) | `Payment`, `JournalEntry`, `AuditLog` | `PAYMENT_POST` | **Needs Repair**: Targets `DRAFT, SUBMITTED, APPROVED`. Must target `SUBMITTED`. Add pre-validation, branch scoping, and amount totals to response. |
| `/api/payments/outstanding-invoices` | `GET` | **MISSING** (`src/app/api/payments/outstanding-invoices/route.ts`) | New service query | `SalesInvoice`, `PurchaseReceipt`, `PaymentAllocation`, `StockReturn` | `PAYMENT_VIEW` | **NEW REQUIRED**: Returns open documents with `invoiceNumber`, dates, `grandTotal`, `previouslyPaid`, and true `outstandingAmount`. |
| `/api/payments/kpis` | `GET` | **MISSING** (`src/app/api/payments/kpis/route.ts`) | New aggregation service | `Payment` | `PAYMENT_VIEW` | **NEW REQUIRED**: Computes posted collections, posted disbursements, submitted voucher counts/amounts across the entire database. |
| `/api/finance/banking/transfers` | `GET` | `src/app/api/finance/banking/transfers/route.ts:25` | Direct Prisma query | `BankAccount`, `Account`, `Branch`, `JournalEntry` | `BANK_LEDGER_VIEW` | **Needs Repair**: Remove hardcoded `{ code: "1000" }` fallback for cash accounts. |
| `/api/finance/banking/transfers` | `POST` | `src/app/api/finance/banking/transfers/route.ts:102` | `createJournalDraft`, `postJournal` | `JournalEntry`, `BankTransaction`, `DocumentSequence`, `AuditLog` | `JOURNAL_CREATE` | **Needs Repair**: Remove operating-mode check and hardcoded cash account fallbacks. Auto-post or submit directly without `approveJournal`. |
| `/api/finance/bank-accounts` | `GET`, `POST` | `src/app/api/finance/bank-accounts/route.ts` | `createBankAccount` (`banking.ts`) | `BankAccount`, `Account`, `Branch`, `AuditLog` | `BANK_ACCOUNT_MANAGE` | **Existing**: Full CRUD with GL account linking and branch access control. |
| `/api/finance/bank-statements` | `GET`, `POST` | `src/app/api/finance/bank-statements/route.ts` | `createBankStatement` (`banking.ts`) | `BankStatement`, `BankStatementLine`, `AuditLog` | `BANK_RECONCILIATION_PREPARE` | **Existing**: Statement upload, date overlap validation, statement line storage. |
| `/api/finance/bank-statements/[id]/auto-match` | `POST` | `src/app/api/finance/bank-statements/[id]/auto-match/route.ts` | `autoMatchStatement` (`banking.ts`) | `BankStatementLine`, `BankTransaction`, `AuditLog` | `BANK_RECONCILIATION_PREPARE` | **Existing**: Exact and fuzzy match on date, amount, and reference within epsilon `0.005`. |
| `/api/finance/bank-statements/[id]/match` | `POST` | `src/app/api/finance/bank-statements/[id]/match/route.ts` | `matchStatementLine` (`banking.ts`) | `BankStatementLine`, `BankTransaction`, `AuditLog` | `BANK_RECONCILIATION_PREPARE` | **Existing**: Manual match / unmatch of individual lines. |
| `/api/finance/bank-statements/[id]/reconciliation` | `GET`, `POST` | `src/app/api/finance/bank-statements/[id]/reconciliation/route.ts` | `prepareReconciliation` (`banking.ts`) | `BankReconciliation`, `BankTransaction`, `AuditLog` | `BANK_RECONCILIATION_PREPARE` | **Existing**: Computes book balance, outstanding deposits/withdrawals, adjusted balance, and statement difference. |
| `/api/finance/bank-statements/[id]/charges-interest` | `POST` | **MISSING** | New service function in `banking.ts` | `JournalEntry`, `BankTransaction`, `BankStatementLine`, `AuditLog` | `BANK_RECONCILIATION_PREPARE` | **NEW REQUIRED**: Creates GL entries for bank fees (Debit Expense, Credit Bank) or interest (Debit Bank, Credit Income) and matches statement line. |
| `/api/finance/bank-reconciliations/[id]/complete` | `POST` | `src/app/api/finance/bank-reconciliations/[id]/complete/route.ts` | `completeReconciliation` (`banking.ts`) | `BankReconciliation`, `AuditLog` | `BANK_RECONCILIATION_APPROVE` | **Existing**: Enforces zero difference and 100% line matching. |
| `/api/finance/bank-reconciliations/[id]/reopen` | `POST` | `src/app/api/finance/bank-reconciliations/[id]/reopen/route.ts` | `reopenReconciliation` (`banking.ts`) | `BankReconciliation`, `AuditLog` | `BANK_RECONCILIATION_APPROVE` | **Existing**: Allows reopening completed reconciliation with audited reason. |
| `/api/finance/reports/cash-in-hand` | `GET` | `src/app/api/finance/reports/cash-in-hand/route.ts` | `getCashInHandReport` (`cash-in-hand.ts`) | `Account`, `JournalEntryLine`, `JournalEntry` | `FINANCE_DASHBOARD_VIEW` | **Needs Repair**: Remove hardcoded `{ code: "1000" }` fallback. Filter strictly on active accounts where `accountType = 'CASH'`. |
| `/api/finance/subledgers` | `GET` | `src/app/api/finance/subledgers/route.ts` | `getPartyAgingSummary` (`subledger.ts`) | `Customer`, `Supplier`, `JournalEntryLine`, `SalesInvoice`, `PurchaseReceipt`, `PaymentAllocation` | `CUSTOMER_LEDGER_VIEW` / `SUPPLIER_LEDGER_VIEW` | **Existing**: Calculates party aging buckets, total balance, open document balance, and residual advance balances. |
| `/api/finance/subledgers/[kind]/[id]` | `GET` | `src/app/api/finance/subledgers/[kind]/[id]/route.ts` | `getPartyStatement` (`subledger.ts`) | `Customer`, `Supplier`, `JournalEntryLine`, `SalesInvoice`, `PurchaseReceipt` | `CUSTOMER_LEDGER_VIEW` / `SUPPLIER_LEDGER_VIEW` | **Existing**: Chronological statement of account with running balance and open item list. |
| `/api/approvals` | `GET`, `POST` | `src/app/api/approvals/route.ts` | Approval dispatchers | `PurchaseOrder`, `PurchaseReceipt`, `SalesInvoice`, etc. | `requireAuth` | **Needs Repair**: Remove `PAYMENT` from approval queries (lines 103–112) and action handlers (lines 312, 363). |

---

## 3. Approval Workflow Removal & Voucher Lifecycle State Machine

### 3.1 Elimination of Approval Mechanisms
In compliance with Requirement R1:
> *"Completely remove user approval mechanisms (maker-checker, approver assignments, approval queues, approval bands, approval-based posting, operating mode restrictions) from the Cash, Bank & Party Settlement module while retaining standard RBAC permissions, branch access, cash/bank access, transaction ownership, and immutable audit logs."*

#### Specific Changes Required:
1. **Remove Payment Approvals from Governance Approval Queue**:
   - `src/app/api/approvals/route.ts`:
     - Delete `prisma.payment.findMany({ where: { companyId, status: "SUBMITTED" }, ... })` (lines 103–112).
     - Remove `case "PAYMENT": result = await approvePayment(actor, parsed.id); break;` (line 312).
     - Remove `case "PAYMENT": result = await prisma.payment.update(...)` (line 363).
     - Settlement vouchers will no longer appear in the governance pending approval workspace.

2. **Refactor `postPayment` in `src/lib/operations/payments.ts`**:
   - Delete lines 327–338 which mutate `status` to `OperationalDocumentStatus.APPROVED`.
   - Delete line 339: `await assertSegregationOfDuties(...)`.
   - Delete line 341: `await assertApprovalPolicy(...)`.
   - Allow `postPayment` to accept vouchers in `OperationalDocumentStatus.SUBMITTED` or `OperationalDocumentStatus.DRAFT`.
   - Leave `approvedById` and `approvedAt` null, or set `approvedById` to `actor.userId` purely for legacy DB column compatibility if non-nullable, but do not require maker-checker separation.

3. **Remove `approvePayment` Call from Auto-Post Paths**:
   - `src/app/api/payments/route.ts` line 59:
     - Remove `await approvePayment(actor, payment.id)`.
     - When `autoPost=true`, transition directly: `submitPayment(actor, payment.id)` then `postPayment(actor, payment.id)`.

4. **Direct Role-Based Posting in `src/app/api/payments/[id]/post/route.ts`**:
   - Verify caller holds `PAYMENT_POST` permission and has access to `record.branchId`.
   - Post the voucher directly without checking whether another user approved it.

### 3.2 Voucher Lifecycle State Machine

```
      +-------------+
      |    DRAFT    |<-----------------------+
      +------+------+                        | (Edit / Update Draft)
             |                               |
             | (submitPayment)               |
             v                               |
      +-------------+                        |
      |  SUBMITTED  |------------------------+
      +------+------+
             |
             +-----------------------+-----------------------+
             |                       |                       |
             | (Direct Post)         | (cancelPayment)       | (deletePayment)
             v                       v                       v
      +-------------+         +-------------+         +-------------+
      |   POSTED    |         |  CANCELLED  |         |   DELETED   |
      +------+------+         +-------------+         +-------------+
             |                 (Immutable)             (Hard Delete)
             | (reversePayment)
             v
      +-------------+
      |  REVERSED   |
      +-------------+
       (Immutable)
```

#### Status Transition Rules:
| Current Status | Target Status | Permitted Action | Required RBAC Permission | Business & Validation Rules |
| :--- | :--- | :--- | :--- | :--- |
| `DRAFT` | `SUBMITTED` | Submit Voucher | `PAYMENT_CREATE` | Validates party is active, settlement account is active, currency matches, total allocations $\le$ payment amount. |
| `DRAFT` | `CANCELLED` | Cancel Draft | `PAYMENT_CREATE` | Marks voucher `CANCELLED`, records `cancelledAt` and cancellation reason in `AuditLog`. No GL entry. |
| `DRAFT` | `DELETED` | Delete Draft | `PAYMENT_CREATE` | Removes row and allocation records. Permitted only on unposted drafts. |
| `DRAFT` | `POSTED` | Direct Post Now | `PAYMENT_POST` | Auto-submits and atomically posts to GL in a single transaction. |
| `SUBMITTED` | `DRAFT` | Revert to Draft | `PAYMENT_CREATE` | User selects "Edit Draft"; updates voucher header and allocations. |
| `SUBMITTED` | `POSTED` | Direct Post Now | `PAYMENT_POST` | Validates accounting period is OPEN, allocates voucher number, locks record, generates GL journal atomically, updates bank/cash balance, updates party subledger. **Zero approval delays**. |
| `SUBMITTED` | `CANCELLED` | Cancel Voucher | `PAYMENT_CREATE` | Marks voucher `CANCELLED`. Immutable. Audit log created. |
| `POSTED` | `REVERSED` | Reverse Voucher | `PAYMENT_REVERSE` | Posted vouchers are immutable and cannot be edited. Corrections are executed solely via `reversePayment`, which atomically posts an exact inverse GL journal, reverses bank transaction, un-allocates settled invoices, and marks voucher `REVERSED`. |
| `CANCELLED` | *Any* | *None* | *None* | Cancelled vouchers are completely terminal and immutable. |
| `REVERSED` | *Any* | *None* | *None* | Reversed vouchers are completely terminal and immutable. |

---

## 4. Double-Entry Accounting Engine & Ledger Integrity

### 4.1 Chart of Accounts Integration & Zero Hardcoded Accounts
Axon ERP utilizes a multi-tier Chart of Accounts modeled in `Account` and `AccountGroup`.
Every GL posting account is dynamically resolved via `requirePostingAccount` (`src/lib/operations/accounting.ts:59-86`):
```ts
export async function requirePostingAccount(
  tx: Prisma.TransactionClient,
  input: { companyId: string; branchId: string; accountType: string },
)
```
- Resolution Priority:
  1. Active account matching `accountType` with `branchId === input.branchId`.
  2. Fallback to active account matching `accountType` with `branchId === null` (company-wide default).
  3. Rejection with `ApiError(409, "POSTING_ACCOUNT_CONFIGURATION")` if 0 or $>1$ matching accounts are found.

#### Hardcoded Violation Fixes:
1. `src/app/api/finance/banking/transfers/route.ts`:
   - Line 50: Replace `{ code: "1000" }` with dynamic query on `accountType: "CASH"`.
   - Lines 137 & 167: Replace `OR: [{ accountType: "CASH" }, { code: "1000" }]` with `accountType: "CASH"`.
2. `src/lib/finance/cash-in-hand.ts`:
   - Line 26: Remove `{ code: "1000" }` and name pattern matching; filter strictly by `companyId`, `isActive: true`, and `accountType: "CASH"`.

### 4.2 Atomic Journal Entry Generation Matrix

Every posted settlement transaction executes inside a `Prisma.TransactionIsolationLevel.Serializable` transaction and invokes `postOperationalJournal`.

```
========================================================================================
VOUCHER TYPE          DEBIT ACCOUNT                         CREDIT ACCOUNT
========================================================================================
Customer Receipt      Bank GL (1010) or Cash GL (1000)      Accounts Receivable (1100)
                      [Tagged with bankAccountId]           [Tagged with customerId]
----------------------------------------------------------------------------------------
Customer Advance      Bank GL (1010) or Cash GL (1000)      Accounts Receivable (1100)
(Unallocated)         [Tagged with bankAccountId]           [Tagged with customerId]
----------------------------------------------------------------------------------------
Supplier Payment      Accounts Payable (2000)               Bank GL (1010) or Cash GL (1000)
                      [Tagged with supplierId]              [Tagged with bankAccountId]
----------------------------------------------------------------------------------------
Supplier Advance      Accounts Payable (2000)               Bank GL (1010) or Cash GL (1000)
(Unallocated)         [Tagged with supplierId]              [Tagged with bankAccountId]
----------------------------------------------------------------------------------------
Cash Deposit          Destination Bank GL (1010)            Source Cash GL (1000)
(Cash -> Bank)        [Tagged with bankAccountId]
----------------------------------------------------------------------------------------
Cash Withdrawal       Destination Cash GL (1000)            Source Bank GL (1010)
(Bank -> Cash)                                              [Tagged with bankAccountId]
----------------------------------------------------------------------------------------
Bank Transfer         Destination Bank GL (Bank B)          Source Bank GL (Bank A)
(Contra Voucher)      [Tagged with destBankAccountId]       [Tagged with srcBankAccountId]
----------------------------------------------------------------------------------------
Receipt Reversal      Accounts Receivable (1100)            Bank GL (1010) or Cash GL (1000)
                      [Tagged with customerId]              [Tagged with bankAccountId]
----------------------------------------------------------------------------------------
Payment Reversal      Bank GL (1010) or Cash GL (1000)      Accounts Payable (2000)
                      [Tagged with bankAccountId]           [Tagged with supplierId]
========================================================================================
```

### 4.3 Subledger Reconciliation Mathematical Model
In Axon ERP, strict reconciliation between Party Subledgers and General Ledger Control Accounts is maintained by construction:

1. **Customer Subledger to Accounts Receivable**:
   $$\text{GL Balance}_{\text{AR}} = \sum_{l \in \text{Lines}} (l.\text{baseDebit} - l.\text{baseCredit}) \quad \text{where } a.\text{accountType} = \text{'ACCOUNTS\_RECEIVABLE'}$$
   $$\text{Subledger Balance}(C) = \sum_{l \in \text{Lines}, l.\text{customerId} = C} (l.\text{baseDebit} - l.\text{baseCredit})$$
   $$\text{GL Balance}_{\text{AR}} \equiv \sum_{C \in \text{Customers}} \text{Subledger Balance}(C)$$
   - Sales Invoices debit AR with `customerId` tagged.
   - Customer Receipts credit AR with `customerId` tagged.
   - Sales Returns credit AR with `customerId` tagged.
   - Any unallocated receipt amount remains as a credit on the customer's AR subledger balance. In aging calculations (`subledger.ts:170`), this appears as `aging.residual = aging.balance - aging.documentOpen`, accurately representing on-account advance deposits without diverging from the GL.

2. **Supplier Subledger to Accounts Payable**:
   $$\text{GL Balance}_{\text{AP}} = \sum_{l \in \text{Lines}} (l.\text{baseCredit} - l.\text{baseDebit}) \quad \text{where } a.\text{accountType} = \text{'ACCOUNTS\_PAYABLE'}$$
   $$\text{Subledger Balance}(S) = \sum_{l \in \text{Lines}, l.\text{supplierId} = S} (l.\text{baseCredit} - l.\text{baseDebit})$$
   $$\text{GL Balance}_{\text{AP}} \equiv \sum_{S \in \text{Suppliers}} \text{Subledger Balance}(S)$$

---

## 5. Allocation & Settlement Logic Investigation

### 5.1 Current Allocation Handling & Critical Shortcomings
In `PaymentAllocation`:
- Fields: `id`, `paymentId`, `salesInvoiceId`, `purchaseReceiptId`, `amount`.
- Current lookup handling (`/api/operations/lookups:40-41`):
  ```ts
  prisma.salesInvoice.findMany({
    where: { companyId: context.company.id, status: "POSTED", reversalOfId: null, ...documentScopeWhere },
    select: { id: true, branchId: true, customerId: true, invoiceNumber: true, invoiceDate: true, grandTotal: true },
    take: 200
  })
  ```
- **Defects Identified**:
  1. The API returns `grandTotal` but does not calculate `previouslyPaid` or `outstandingAmount`.
  2. The frontend allocation grid is forced to use `doc.grandTotal` as the outstanding balance.
  3. If an invoice of Rs 100,000 has already been partially settled by Rs 40,000, the user sees Rs 100,000 as outstanding, causing confusion and overpayment errors.

### 5.2 Mathematical Formulation for Open Balance
The backend must provide a dedicated query or endpoint (`/api/payments/outstanding-invoices`) that computes:

$$\text{Gross Total} = \text{invoice}.\text{grandTotal}$$
$$\text{Returns Amount} = \sum \text{StockReturn}.\text{grandTotal} \quad (\text{status} = \text{'POSTED'})$$
$$\text{Settled Amount} = \sum_{\text{Allocations}} \text{pa}.\text{amount} \times (\text{if direction} = \text{RECEIPT then } +1 \text{ else } -1) \quad (\text{payment}.\text{status} = \text{'POSTED'})$$
$$\text{Outstanding Balance} = \max(0, \, \text{Gross Total} - \text{Returns Amount} - \text{Settled Amount})$$

### 5.3 Strict Validation Rules Matrix
| Validation Rule | Condition | Error Code | HTTP Status | Action Taken |
| :--- | :--- | :--- | :---: | :--- |
| **Total Allocation vs Payment Amount** | $\sum \text{allocations}.\text{amount} > \text{payment}.\text{amount}$ | `OVER_ALLOCATION` | 422 | Rejects transaction. Unallocated amounts ($\ge 0$) become advances. |
| **Duplicate Invoice Allocation** | Multiple entries for same `salesInvoiceId` in `allocations` array | `DUPLICATE_ALLOCATION` | 422 | Rejects transaction. Invoices must appear at most once per voucher. |
| **Allocation vs Invoice Open Balance** | $\text{allocation}.\text{amount} > \text{invoice}.\text{outstandingBalance}$ | `INVOICE_OVERPAYMENT` | 409 | Rejects transaction with message quoting invoice number and remaining open balance. |
| **Invoice Status Gate** | `invoice.status !== 'POSTED'` (e.g. `DRAFT`, `SUBMITTED`, `CANCELLED`) | `INVALID_ALLOCATION` | 409 | Rejects allocation. Postings are only allowed against immutable posted documents. |
| **Invoice Reversal Gate** | `invoice.reversalOfId !== null` or invoice has posted reversal | `INVOICE_REVERSED` | 409 | Rejects allocation against reversed invoices. |
| **Party Ownership Gate** | `invoice.customerId !== payment.customerId` | `PARTY_MISMATCH` | 422 | Rejects allocation across different customers/suppliers. |

---

## 6. Bulk Posting & Bank Reconciliation Architecture

### 6.1 Bulk Posting Architecture ("Post All Submitted Vouchers")
The user request mandates a reliable bulk posting engine:
- **Location**: `src/app/api/payments/batch-post/route.ts`
- **Execution Workflow**:
  ```
  1. Auth Check: requirePermission("PAYMENT_POST")
  2. Scope Check: allowedBranches = permittedBranchIds(context, "PAYMENT_POST")
  3. Query Target Vouchers:
     status = "SUBMITTED"
     branchId IN allowedBranches
     take: 100
  4. Pre-Validation:
     Verify open accounting period for voucherDate
     Verify active counterparty and settlement accounts
  5. Execution Loop (Independent Transactions):
     For each voucher:
       BEGIN ISOLATED TRANSACTION
         postPayment(actor, voucher.id)
       COMMIT TRANSACTION
       On Success: record id, paymentNumber, amount, success: true
       On Failure: ROLLBACK; record id, paymentNumber, amount, success: false, error message
  6. Return Summary Response:
     {
       totalProcessed: N,
       postedCount: S,
       failedCount: F,
       totalPostedAmount: "...",
       totalFailedAmount: "...",
       results: [...]
     }
  ```
- **Key Guarantee**: Cross-voucher fault isolation. Failure of voucher 3 due to an inactive customer account will never abort or corrupt voucher 1, 2, 4, or 5.

### 6.2 Bank Reconciliation Architecture
Modeled in `src/lib/finance/banking.ts`:

1. **Book Balance vs Statement Balance**:
   - `bookBalance`: Calculated by summing all deposits minus withdrawals of posted bank transactions up to `statement.periodEnd`.
   - `outstandingDeposits`: Unreconciled deposits up to `statement.periodEnd` (funds deposited in ERP not yet cleared on bank statement).
   - `outstandingPayments`: Unreconciled withdrawals up to `statement.periodEnd` (cheques issued not yet presented).
   - `adjustedBalance = bookBalance + outstandingDeposits - outstandingPayments`.
   - `difference = adjustedBalance - statement.closingBalance`.
   - A reconciliation can only be marked `COMPLETED` when $\lvert \text{difference} \rvert \le 0.005$ and all statement lines are matched.

2. **Bank Charges & Interest Implementation Gap**:
   - When importing statements, banks frequently assess account maintenance fees or credit interest that have no prior entry in ERP.
   - **Solution Blueprint**: Implement `POST /api/finance/bank-statements/[id]/charges-interest`:
     * Input: `{ lineId: string, type: "CHARGE" | "INTEREST", accountId: string, narration?: string }`
     * For `CHARGE`: Creates JournalEntry (Debit `accountId` e.g. Bank Charges Expense `6000`, Credit `bank.glAccountId`), creates matching `BankTransaction`, matches line to transaction, sets `reconciliationStatus = "RECONCILED"`.
     * For `INTEREST`: Creates JournalEntry (Debit `bank.glAccountId`, Credit `accountId` e.g. Interest Income `4020`), creates matching `BankTransaction`, matches line to transaction, sets `reconciliationStatus = "RECONCILED"`.

---

## 7. Concrete Implementation Roadmap for Subsequent Phases

```
+-----------------------------------------------------------------------------------+
| PHASE 1: WORKFLOW & APPROVAL REMOVAL (Priority: High)                              |
| - Remove payment queries & handlers from src/app/api/approvals/route.ts           |
| - Update src/lib/operations/payments.ts: remove maker-checker, policy checks      |
| - Support direct posting from SUBMITTED status without approvePayment             |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| PHASE 2: LIFECYCLE REPAIR: CANCEL & REVERSE (Priority: High)                      |
| - Implement cancelPayment service & POST /api/payments/[id]/cancel                |
| - Implement reversePayment service & POST /api/payments/[id]/reverse              |
| - Wire audit logs for PAYMENT_CANCELLED and PAYMENT_REVERSED                      |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| PHASE 3: ALLOCATION GRID & DYNAMIC COA (Priority: High)                           |
| - Add GET /api/payments/outstanding-invoices with true remaining balance          |
| - Enhance validateAllocations to account for StockReturns                         |
| - Reject duplicate allocations in paymentDraftSchema                              |
| - Cleanse hardcoded "1000" fallbacks in banking/transfers & cash-in-hand          |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| PHASE 4: BULK POSTING & BANK RECONCILIATION CHARGES (Priority: Medium)            |
| - Upgrade batch-post route with pre-validation and financial totals               |
| - Add charges-interest endpoint for bank statements in banking.ts                 |
+-----------------------------------------------------------------------------------+
```

---

## 8. Independent Verification Method

1. **Syntax & Type Safety**:
   ```powershell
   npx tsc -p tsconfig.finance.json --noEmit
   npx tsc -p tsconfig.ops.json --noEmit
   ```
2. **Automated Acceptance & Regression Tests**:
   ```powershell
   npx vitest run
   ```
3. **Double-Entry Balance Verification**:
   - Query JournalEntry lines for newly posted customer receipt:
     Ensure $\sum \text{Debit} \equiv \sum \text{Credit}$.
     Ensure Debit targets Cash/Bank asset account and Credit targets Accounts Receivable with `customerId` tagged.
4. **Approval Removal Verification**:
   - Create a customer receipt voucher in `DRAFT`.
   - Submit voucher (`status = SUBMITTED`).
   - Query `/api/approvals`: Verify count is 0 and voucher is NOT present in approval queues.
   - Post voucher directly using `POST /api/payments/[id]/post`: Verify voucher transitions immediately to `POSTED` with GL journal entry and zero maker-checker errors.
