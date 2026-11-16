# Worker Dispatch — Milestone 3: Allocation Engine, Advances & Payment Methods

**Role**: Versatile Implementation Worker (`teamwork_worker`)
**Milestone**: Milestone 3: Allocation Engine, Advances & Payment Methods
**Working Directory**: `d:\Inventory Managment Software\.agents\teamwork\teamwork_worker_m3`
**Orchestrator ID**: `111e024c-58b9-4873-b157-c2ff9db3ac0b`

### Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

### Mandatory Reading
Read these authoritative files before starting work:
1. `d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md` (Specifically R2: Customer Receipts, Supplier Payments & Party Allocations)
2. `d:\Inventory Managment Software\.agents\teamwork\orchestrator_settlement\PROJECT.md` (§ Feature Inventory features 6, 7, 8, 9, § Interface Contracts, § Code Layout)
3. `d:\Inventory Managment Software\.agents\teamwork\orchestrator_settlement\HISTORICAL_VOUCHER_AUDIT.md` (Section 5 & 6 on settled calculation and advance handling)
4. `d:\Inventory Managment Software\.agents\teamwork\teamwork_worker_m2\handoff.md`

### Scope & Specific Requirements
1. **Invoice/Bill Outstanding Calculation in Lookups (`src/app/api/operations/lookups/route.ts`)**:
   - In `GET /api/operations/lookups?kind=salesInvoices` and `kind=purchaseReceipts` (or bills):
   - Include accurate `previouslyPaid` / `settled` and `outstandingAmount = Math.max(0, grandTotal - returns - settled)` for each document.
   - Filter to return documents that are in `POSTED` status and have `outstandingAmount > 0` (or allow open documents query).
2. **Multi-Party & Multi-Invoice Allocation Engine (`src/lib/operations/payments.ts`, `src/lib/operations/validation.ts`)**:
   - Support 1:1, 1:many (one payment receipt allocating to multiple invoices), and many:1 (multiple payments across time settling one invoice).
   - Support partial settlements (allocation amount < outstanding invoice balance) and full settlements (allocation amount == outstanding invoice balance).
   - In `paymentDraftSchema` and `validateAllocations`:
     - Reject duplicate invoice allocations (e.g. allocating twice to the same `salesInvoiceId` or `purchaseReceiptId` within the same voucher).
     - Reject allocations to unposted, draft, cancelled, or reversed documents.
     - Reject allocations exceeding the document's remaining open balance (`outstandingAmount = grandTotal - returns - settled`).
     - Reject allocations where the sum of allocations exceeds the total payment voucher amount.
3. **Surplus Funds as Customer/Supplier Advances**:
   - If voucher total amount > sum of invoice allocations:
     - Record the unallocated remainder as an Advance (`salesInvoiceId: null` or explicit advance allocation line).
     - NEVER silently discard unallocated surplus funds.
     - Customer Receipts with surplus funds credit Customer Advances Liability (or appropriate COA account) alongside AR Control.
     - Pure Advance vouchers (allocations empty or 100% advance) supported seamlessly.
4. **Payment Methods & Instrument Support**:
   - Support Cash, Bank Transfer, Cheque, and Card payment methods.
   - Support instrument details: cheque number, bank name, transfer reference, clearance date, card last 4.
5. **Unit & Integration Test Suite (`src/__tests__/settlement/allocations.test.ts`)**:
   - Author comprehensive tests covering:
     - 1:1 full settlement and partial settlement.
     - 1:many multi-invoice allocation (single receipt splitting across 3+ invoices).
     - many:1 progressive settlement (2 receipts settling 1 invoice).
     - Surplus unallocated amount recorded as customer advance (`salesInvoiceId: null`).
     - Pure advance receipt (no invoice allocations).
     - Rejection of duplicate invoice allocations in draft schema.
     - Rejection of over-allocation exceeding outstanding invoice balance.
     - Rejection of allocation against unposted/draft invoice.
     - Payment methods (Cash, Bank Transfer, Cheque, Card) with instrument metadata.
     - Reversal of a multi-allocation payment properly restoring outstanding balances to all invoices.
6. **Verification Requirements**:
   - Run vitest test suite: `npx vitest run src/__tests__/settlement/allocations.test.ts`
   - Run regression tests: `npx vitest run src/__tests__/settlement/lifecycle.test.ts`, `numbering.test.ts`, `settlement-e2e.test.ts`
   - Run typechecks: `npx tsc -p tsconfig.ops.json --noEmit` and `npx tsc -p tsconfig.finance.json --noEmit`.

### Output Requirements
Write your detailed handoff report to:
`d:\Inventory Managment Software\.agents\teamwork\teamwork_worker_m3\handoff.md`
Report your status and completion back to Orchestrator (`111e024c-58b9-4873-b157-c2ff9db3ac0b`) via `send_message`.


## 2026-11-16T08:28:34Z
[Message from 111e024c-58b9-4873-b157-c2ff9db3ac0b received]
