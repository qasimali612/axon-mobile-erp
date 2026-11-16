# Project: Axon Mobile ERP Cash, Bank & Party Settlement Overhaul

## Architecture
- **Framework**: Next.js App Router (TypeScript), Node.js runtime, PostgreSQL / PGlite with Prisma ORM.
- **Accounting Architecture**: SAP Business One-inspired double-entry accounting.
  - Cash & Bank Accounts link dynamically to Chart of Accounts (COA) without hardcoded codes.
  - Control Accounts: Accounts Receivable (1200) reconciles with Customer subledgers; Accounts Payable (2000) reconciles with Supplier subledgers.
  - Vouchers (Customer Receipt `RC`, Supplier Payment `PV`, Advance, Transfer, Contra) post atomically to `Payment`, `PaymentAllocation`, and balanced `JournalEntry` / `JournalEntryLine`.
- **Workflow & Lifecycle**:
  - Elimination of approval queues, bands, and maker-checker gates.
  - Direct posting lifecycle: `DRAFT` -> `SUBMITTED` -> `POSTED`, with `CANCELLED` (for submitted) and `REVERSED` (for posted).
  - Bulk Posting: isolated atomic transactions per voucher with branch security and detailed result summary.
- **Reporting & Dashboard**:
  - Server-aggregated KPIs strictly computed on `POSTED` vouchers.
  - 20 comprehensive settlement reports (registers, subledgers, allocations, advances, bank rec, cash flows, audit logs, aging).
  - Fast compact voucher grid with contextual actions (View, Edit Draft, Post Now, Cancel, Reverse, Print, PDF).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Single-Hyphen Voucher Sequence | Concurrency-safe formatting (`ISB-RC-...`, `ISB-PV-...`), sanitize branch prefixes | M1 | Survey 1, R4 |
| 2 | Safe DB Guards & Historical Audit | Remove rogue deletion in `prisma.ts`, document audit & correction plan for ISB--RC vouchers and Palmpay invoice | M1 | Survey 1, R4 |
| 3 | Elimination of Approval Workflow | Remove maker-checker, segregation of duties, approval queues, `/approve` routes | M2 | Survey 2, R1 |
| 4 | Voucher Lifecycle: Cancel & Reverse | Implement `cancelPayment` and `reversePayment` with atomic allocation release and GL reversal | M2 | Survey 2, R1 |
| 5 | Role-Based Direct Posting | Allow authorized users with `PAYMENT_POST` to directly post submitted vouchers | M2 | Survey 2, R1 |
| 6 | Accurate Invoice/Bill Outstanding Lookup | Add `outstandingAmount` (`grandTotal - returns - settled`) and `previouslyPaid` to lookups | M3 | Survey 2, R2 |
| 7 | Multi-Party Allocation Engine | Full 1:1, 1:many, many:1 allocation support, partial & full settlement, reject duplicate allocation | M3 | Survey 2, R2 |
| 8 | Customer & Supplier Advances | Surplus or unallocated amounts safely preserved as advances (`salesInvoiceId: null`) | M3 | Survey 2, R2 |
| 9 | Multi-Payment Methods Support | Support Cash, Bank Transfer, Cheque, Card with full instrument details | M3 | Survey 3, R2 |
| 10 | Dynamic COA & Zero Hardcoded Accounts | Eliminate `{ code: "1000" }`, dynamically resolve cash/bank GL accounts | M4 | Survey 2, R3 |
| 11 | Atomic Balanced GL Journal Entries | Receipts, payments, advances, contra, transfers generate balanced debits/credits atomically | M4 | Survey 2, R3 |
| 12 | Subledger Reconciliations | Strict mathematical reconciliation between AR/AP control accounts and party subledgers | M4 | Survey 2, R3 |
| 13 | Bank Reconciliation & Charges/Interest | Statement reconciliation, difference tracking, dynamic journal booking for bank charges/interest | M4 | Survey 2, R3 |
| 14 | Isolated Bulk Posting | "Post All Submitted Vouchers" with per-voucher atomic transactions, branch scoping & summary | M5 | Survey 2, R5 |
| 15 | 20 Settlement Reports Hub | Implement registers, subledgers, allocation reports, advance registers, bank rec, audit logs, aging | M5 | Survey 3, R5 |
| 16 | Multi-Criteria Filters & Exports | Date, party, branch, account, method, status filtering with CSV/Excel (BOM), PDF, Print exports | M5 | Survey 3, R5 |
| 17 | Dashboard KPIs on Posted Records | KPI cards calculate strictly from `POSTED` records without client-side row truncation | M6 | Survey 3, R5 |
| 18 | Compact Voucher Grid & Contextual Actions | Action buttons: View, Edit Draft, Post Now, Cancel, Print, PDF, Reverse | M6 | Survey 3, R5 |
| 19 | Overhauled Allocation Grid UI | Grid displaying invoice #, date, total, previously paid, outstanding, current allocation, remaining | M6 | Survey 3, R2 |
| 20 | E2E Opaque-Box Test Suite (Tiers 1-4) | 28+ integration test scenarios covering receipts, payments, allocations, advances, GL, reversals | M7 (Phase 1) | Dual Track, R5 |
| 21 | Adversarial Coverage Hardening (Tier 5) | White-box stress tests, edge cases, concurrent sequences, and audit verification | M7 (Phase 2) | Dual Track |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Numbering Architecture & Historical Audit | Features 1, 2 | none | DONE |
| M2 | Approval Elimination & Voucher Lifecycle | Features 3, 4, 5 | M1 | DONE |
| M3 | Allocation Engine, Advances & Payment Methods | Features 6, 7, 8, 9 | M2 | PLANNED |
| M4 | Dynamic Double-Entry GL & Bank Reconciliation | Features 10, 11, 12, 13 | M3 | PLANNED |
| M5 | Bulk Posting Engine & 20 Settlement Reports | Features 14, 15, 16 | M4 | PLANNED |
| M6 | Settlement Dashboard & Frontend Grid UI | Features 17, 18, 19 | M5 | PLANNED |
| M7 | Final Acceptance: E2E Tests & Adversarial Hardening | Features 20, 21 | M6, E2E Test Suite | PLANNED |

## Interface Contracts
### Voucher Numbering: `generateDocumentNumber`
- Function: `nextDocumentNumber(tx, { companyId, branchId, documentType, fiscalYear, prefix })`
- Format: `${cleanBranch}-${cleanSuffix}-FY${year}-${seq6}` (e.g. `ISB-RC-FY2026-27-000001`, `ISB-PV-FY2026-27-000001`).
- Suffix rules: Receipts/Customer Refund -> `"RC"`, Payments/Supplier Refund -> `"PV"`. Branch prefix sanitized: `replace(/[^A-Z0-9]/g, "")`.

### Voucher Lifecycle & Statuses
- Status enum: `DRAFT`, `SUBMITTED`, `POSTED`, `CANCELLED`, `REVERSED`.
- Functions in `src/lib/operations/payments.ts`:
  - `submitPayment(actor, id)`: `DRAFT` -> `SUBMITTED`
  - `postPayment(actor, id)`: `SUBMITTED` (or `DRAFT`) -> `POSTED` (direct posting, no approval checks, atomic GL creation)
  - `cancelPayment(actor, id, reason)`: `SUBMITTED` -> `CANCELLED` (audit log, no deletion)
  - `reversePayment(actor, id, reason)`: `POSTED` -> `REVERSED` (atomic reversal GL journal, release invoice allocations)

### Allocation Engine Contract
- Input: `allocations: Array<{ salesInvoiceId?: string; purchaseReceiptId?: string; amount: number | Decimal }>`
- Rule 1: Sum of allocations must be <= voucher amount. Excess = advance (`salesInvoiceId: null`).
- Rule 2: For each allocation, `amount <= invoice.grandTotal - invoice.returns - invoice.settled`.
- Rule 3: Target document must be in `POSTED` status and not reversed.
- Rule 4: Reject duplicate invoice references in allocation array.

### GL Journal Entry Contract
- Cash Account Dr/Cr <-> AR/AP Control Account Cr/Dr.
- Debits == Credits strictly enforced.
- Cash/Bank account resolved dynamically via `BankAccount` or `Account` where `accountType = CASH`. Zero hardcoded accounts.

## Code Layout
- Backend Operations: `src/lib/operations/payments.ts`, `src/lib/operations/accounting.ts`, `src/lib/operations/validation.ts`
- Backend Finance & Banking: `src/lib/finance/banking.ts`, `src/lib/finance/posting.ts`, `src/lib/finance/cash-in-hand.ts`, `src/lib/finance/settlement-reports.ts` (new)
- API Routes:
  - `src/app/api/payments/route.ts`
  - `src/app/api/payments/[id]/route.ts`, `submit/route.ts`, `post/route.ts`, `cancel/route.ts` (new), `reverse/route.ts` (new)
  - `src/app/api/payments/batch-post/route.ts`
  - `src/app/api/finance/reports/settlement/route.ts` (new)
  - `src/app/api/finance/banking/reconciliation/route.ts`
  - `src/app/api/operations/lookups/route.ts`
- Frontend UI:
  - `src/components/finance/payment-register.tsx`
  - `src/components/finance/settlement-reports-workspace.tsx` (new)
  - `src/app/(erp)/finance/payments/page.tsx`
  - `src/app/(erp)/finance/reports/settlement/page.tsx` (new)
- E2E Tests:
  - `src/__tests__/settlement/settlement-e2e.test.ts`
  - `src/__tests__/settlement/reports-e2e.test.ts`
  - `src/__tests__/settlement/adversarial-coverage.test.ts`
