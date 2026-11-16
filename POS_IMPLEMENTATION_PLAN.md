# POS Implementation & Engineering Plan

**System**: Axon Mobile ERP Retail Point of Sale (POS) Counter Terminal  
**Auditor**: Teamwork Architecture & Audit Group (`worker_m1`)  
**Date**: 2026-11-10T12:29:00Z  
**Repository Working Directory**: `d:\Inventory Managment Software`  
**Audit Scope**: End-to-End Implementation Blueprint across Milestones M1 through M7, File Modification Matrix, Verification Protocols, and Risk Controls

---

## 1. Roadmap Overview & Milestone Structure

To transform the Axon Mobile ERP counter terminal into a production-grade, double-entry retail POS engine without disrupting existing operations, implementation is sequenced into seven distinct milestones:

```
[M1: Audit & Blueprint] ──► [M2: DB Schema & Shifts] ──► [M3: Atomic Checkout & GL]
                                                                  │
┌─────────────────────────────────────────────────────────────────┘
▼
[M4: Scanner & Custody] ──► [M5: Terminal UI & Hotkeys] ──► [M6: Shifts, Returns & Reports]
                                                                  │
┌─────────────────────────────────────────────────────────────────┘
▼
[M7: 100% E2E Test Suite & Forensic Audit]
```

---

## 2. Milestone Work Breakdown & Execution Details

### Milestone 1: POS Audit Documents & Architecture Blueprint
- **Scope**: Author authoritative `PROJECT.md` and 9 comprehensive technical audit markdown files at the project root covering UI, Database, APIs, Accounting, Inventory, Missing Features, Implementation Plan, and Test Reports.
- **Deliverables**:
  - `d:\Inventory Managment Software\PROJECT.md`
  - `d:\Inventory Managment Software\POS_SYSTEM_AUDIT.md`
  - `d:\Inventory Managment Software\POS_DATABASE_AUDIT.md`
  - `d:\Inventory Managment Software\POS_API_AUDIT.md`
  - `d:\Inventory Managment Software\POS_ACCOUNTING_AUDIT.md`
  - `d:\Inventory Managment Software\POS_INVENTORY_AUDIT.md`
  - `d:\Inventory Managment Software\POS_UI_UX_AUDIT.md`
  - `d:\Inventory Managment Software\POS_MISSING_FEATURES.md`
  - `d:\Inventory Managment Software\POS_IMPLEMENTATION_PLAN.md`
  - `d:\Inventory Managment Software\POS_TEST_REPORT.md`
- **Verification**: `npm run typecheck` passes with code 0; `npm test` passes 11 test files (63 tests).

---

### Milestone 2: Database Schema, Shift Models & Document Numbering
- **Scope**: Add `PosTerminal` and `PosShift` models to `prisma/schema.prisma`; apply Prisma migration without altering existing tables; enforce single-hyphen sequence formatting (`ISB-SI-FY2026-27-000001`) with concurrency protection while preserving historical records intact.
- **Target Files**:
  - `prisma/schema.prisma` — Add `PosTerminal`, `PosShift`, and `ReceiptPrinterType` models.
  - `src/lib/document-sequence.ts` — Upsert prefix with hyphen sanitization.
  - `src/lib/operations/accounting.ts` — Strip trailing/leading hyphens from branch prefix and suffix.
- **Execution Steps**:
  1. Append `PosTerminal` and `PosShift` definitions to `prisma/schema.prisma` along with required opposite relations on `Company`, `Branch`, `Account`, `User` and `terminalId`/`shiftId` relations on `SalesInvoice` and `Payment`.
  2. Run `npx prisma migrate dev --name add_pos_terminal_and_shift`.
  3. Update `allocateOperationalNumber` in `accounting.ts` to enforce single-hyphen formatting.
  4. Verify that historical invoice `ISB--SI-FY2026-27-000004` remains untouched.
- **Verification**: Run `npx prisma validate` and verify new sequences generate formatted numbers like `ISB-SI-FY2026-27-000001`.

---

### Milestone 3: Direct Atomic POS Posting Engine & GL Accounting
- **Scope**: Implement `POST /api/pos/checkout` atomic endpoint combining sales invoice creation, stock deduction, custody update, landed-cost COGS recognition, double-entry GL commercial entry, payment voucher creation, and receipt GL entry inside one serializable database transaction (< 250ms target). Prune approval checks in posting logic.
- **Target Files**:
  - `src/app/api/pos/checkout/route.ts` — Create dedicated atomic checkout route handler.
  - `src/lib/operations/sales.ts` — Eliminate maker-checker/approval checks; implement atomic sale execution.
  - `src/lib/operations/payments.ts` — Implement direct atomic receipt posting.
- **Execution Steps**:
  1. Author Zod validation schema for checkout request body (lines, payments, idempotencyKey).
  2. Implement `prisma.$transaction({ isolationLevel: Serializable })` pipeline:
     - Pessimistic row locking on `PhysicalStockUnit` and `StockBalance`.
     - Allocate invoice sequence number.
     - Insert `SalesInvoice` with `status: POSTED`.
     - Insert `InventoryMovement` (`SALE_ISSUE`) and update `PhysicalStockUnit` to `SOLD`.
     - Post balanced commercial `JournalEntry`: DR AR, CR Sales, CR Tax, DR COGS, CR Inventory.
     - Insert `Payment` vouchers with `status: POSTED` and `PaymentAllocation`.
     - Post receipt `JournalEntry`: DR Cash/Bank/Wallet, CR AR.
  3. Validate mathematical GL balance: Total Debits == Total Credits.
- **Verification**: Integration test creating mixed handset + accessory sale with Cash + Card tenders; verify GL balances and cash on hand debit.

---

### Milestone 4: Barcode Scanner Engine & Dual Inventory Custody
- **Scope**: Fix catalog search warehouse property mismatch; verify dual-SIM IMEI resolution; enforce strict 1 handset = 1 cart row; clamp accessory quantity controls to warehouse stock.
- **Target Files**:
  - `src/app/api/operations/catalog/search/route.ts` — Fix `warehouseId` to `currentWarehouseId` and status to `IN_STOCK`.
  - `src/components/sales/pos-workspace.tsx` — Enforce 1 handset = 1 cart row; prevent multi-handset line grouping.
- **Execution Steps**:
  1. Modify `catalog/search/route.ts` line 28 to query `stockUnit: { currentWarehouseId: warehouseId, status: "IN_STOCK" }`.
  2. Modify `pos-workspace.tsx` `handleItemResolved`: when a handset is added, push a new row with `quantity: 1` rather than incrementing quantity on existing variant row.
  3. Verify scanner input auto-refocuses via `requestAnimationFrame` and plays 1760Hz/220Hz tones.
- **Verification**: Search catalog with warehouse filter; verify zero Prisma errors; scan two handsets of same model and verify two individual rows appear.

---

### Milestone 5: Counter Terminal UI, Hotkeys & Multi-Tender Payments
- **Scope**: Redesign counter UI tender panel into a multi-tender split payment grid; implement complete retail keyboard shortcuts (`F2`, `F3`, `F4`, `F6`, `F8`, `F9`, `F10`, `Ctrl+Enter`, `Esc`); customer credit limit checks; purge "Submit for Approval" button and approval UI remnants.
- **Target Files**:
  - `src/components/sales/pos-workspace.tsx` — Redesign tender panel, implement hotkeys listeners, remove approval button, and connect to `POST /api/pos/checkout`.
- **Execution Steps**:
  1. Replace single `saleType` radio button with multi-tender allocation table (Cash, Card, Wallet, Bank, Credit).
  2. Implement live balance computation: `Remaining = GrandTotal - Sum(Tenders)`.
  3. Add `F6` (focus salesperson), `F9` (park draft), `F10` (tender mode), and update `Esc` to dismiss all open modals.
  4. Delete line 1428 ("Submit for Approval" button).
  5. Bind checkout button to `POST /api/pos/checkout`.
- **Verification**: Enter mixed split payment (e.g. 50% cash, 50% card); trigger checkout with `Ctrl+Enter`; verify instant posting.

---

### Milestone 6: Shift Management, Parked Sales, Returns, Printing & 15 Reports
- **Scope**: Cashier shift opening and closing with cash drawer reconciliation; parked cart recall directly in `/pos` with active IMEI re-validation; counter returns modal with drawer cash refund; 58mm compact thermal receipt layout; implement all 15 required POS reports.
- **Target Files**:
  - `src/app/api/pos/shifts/route.ts` — Shift opening, closing, and active query route handlers.
  - `src/components/sales/pos-shift-dialog.tsx` — Shift open/close and denomination count modal.
  - `src/app/(erp)/sales/[id]/receipt-58mm/page.tsx` — 58mm thermal receipt printable layout.
  - `src/app/api/reports/operations/route.ts` — Implement the 7 missing POS reports.
  - `src/components/reports/operations-report-workspace.tsx` — Add UI views and filters for all 15 POS reports.
- **Execution Steps**:
  1. Build shift open/close modal and connect to `/api/pos/shifts/*`.
  2. Update parked cart recall in `pos-workspace.tsx` to set `params.invoiceId` without redirecting away from POS; run re-validation on all handset IMEIs.
  3. Build in-terminal customer return dialog restoring IMEI to `IN_STOCK` and recording drawer cash refund.
  4. Author 58mm thermal receipt layout with 32-column CSS print styling.
  5. Implement 7 missing POS reports in reporting service and operations workspace.
- **Verification**: Open shift with float, complete cash sales, close shift with physical count, verify expected vs actual cash reconciliation.

---

### Milestone 7: Full E2E Test Suite Pass (100%) & Forensic Audit
- **Scope**: Author and pass comprehensive automated Vitest integration test suite covering atomic checkout, dual inventory, shift reconciliation, hotkeys, and reports; run Tier 5 adversarial tests; verify clean inspection by `teamwork_auditor`.
- **Target Files**:
  - `src/tests/e2e/pos-checkout.test.ts`
  - `src/tests/e2e/pos-shifts.test.ts`
  - `src/tests/e2e/pos-inventory-custody.test.ts`
- **Execution Steps**:
  1. Author integration tests for all 28 required POS scenarios.
  2. Run `npm test` and ensure 100% pass rate.
  3. Run `npm run typecheck` and ensure 0 TypeScript errors.
  4. Conduct independent forensic audit verification.
- **Verification**: Clean exit code 0 on all test and build commands.

---

## 3. Risk Management & Historical Data Protection Controls

| Risk | Probability | Impact | Mitigation Strategy |
|:-----|:-----------:|:------:|:--------------------|
| **Historical Voucher Corruption** | Low | High | Enforce append-only migration policy; never alter historical invoice numbers (e.g. `ISB--SI-FY2026-27-000004`). |
| **Inventory Concurrency Collisions** | Medium | Critical | Pessimistic row locking (`SELECT ... FOR UPDATE`) inside `Serializable` transaction isolation. |
| **Cash Drawer Reconciliation Errors** | Medium | High | Strictly isolate non-cash tenders (Card, Wallets) from physical drawer cash calculation. |
| **TypeScript / Build Breakage** | Low | High | Continuous typechecking across all 4 `tsconfig` project files before committing code. |
