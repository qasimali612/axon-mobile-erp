# Orchestrator Soft Handoff (State Dump) — Generation 1 to Generation 2

## 1. Observation (Completed Work)

### 1.1 Phase 0: Survey & Specification Mining
- Dispatched 3 parallel survey subagents:
  - `teamwork_explorer_survey_sys` (`8a8b8a6a-971d-41c6-96ea-8463663aa9c9`): Surveyed UI components, routing, shortcuts, scanner debounce, audio beeps.
  - `teamwork_explorer_survey_backend` (`e7b8f4dd-ee24-4d41-baba-ab8bdc758b26`): Surveyed Prisma models, double-entry GL journals, costing methods, stock movements, and sequence numbering.
  - `teamwork_spec_miner_pos_gen2` (`1fefa4fb-a152-4cd1-92ee-8cd506c08738`): Extracted full requirements for direct atomic posting, dual inventory custody, shift management, and 15 POS reports.
- Synthesized findings into master `PROJECT.md` mapping 32 features to 7 milestones.

### 1.2 Phase 1: Milestone 1 — Comprehensive POS Audit & Test Infrastructure
- Authored and verified all 9 required audit markdown files at repository root:
  - `POS_SYSTEM_AUDIT.md`, `POS_DATABASE_AUDIT.md`, `POS_API_AUDIT.md`, `POS_ACCOUNTING_AUDIT.md` (with Section 8 voucher audit), `POS_INVENTORY_AUDIT.md`, `POS_UI_UX_AUDIT.md`, `POS_MISSING_FEATURES.md`, `POS_IMPLEMENTATION_PLAN.md`, `POS_TEST_REPORT.md`.
- Concurrent E2E Testing Track completed by `test_writer_e2e`:
  - `TEST_INFRA.md` published at repository root (4-tier methodology: Feature coverage, Boundary/corner, Cross-feature, Real-world).
  - Authored 103 acceptance tests in `src/lib/operations/pos-acceptance.test.ts`.
  - Published `TEST_READY.md`.
- Committee Gate passed: Reviewer 1 (APPROVE), Reviewer 2 (APPROVE), Challenger 2 (APPROVE), Auditor 1 (CLEAN).

### 1.3 Phase 2: Milestone 2 — Database Schema, Shift Models & Document Numbering
- Schema updates in `prisma/schema.prisma`:
  - `ReceiptPrinterType` enum: `THERMAL_80MM`, `THERMAL_58MM`, `A4`.
  - `PosShiftStatus` enum: `OPEN`, `CLOSED`.
  - `PosTerminal` model with relations to `Company`, `Branch`, `Account`, `PosShift`, `SalesInvoice`, `Payment`.
  - `PosShift` model with relations to `Company`, `Branch`, `PosTerminal`, `User`, `SalesInvoice`, `Payment`.
  - Opposite relations configured on all related entities.
  - Non-destructive migration `prisma/migrations/20261115120000_pos_terminal_shift/migration.sql` created and verified.
- Document numbering in `src/lib/document-sequence.ts`:
  - `DOCUMENT_SEQUENCE_REGEX`: `^[A-Z0-9]+-[A-Z0-9]+-FY[0-9]{4}-[0-9]{2}-[0-9]{6}$` for new single-hyphen records (e.g. `ISB-SI-FY2026-27-000001`).
  - `HISTORICAL_DOCUMENT_SEQUENCE_REGEX`: `^[A-Z0-9]+--[A-Z0-9]+-FY[0-9]{4}-[0-9]{2}-[0-9]{6}$` strictly preserving legacy double-hyphen records (`ISB--SI-FY2026-27-000004`, `ISB--RC-FY2026-27-000001` through `000006`).
- Full verification completed by `worker_m2_gen2`:
  - `npx prisma validate` & `npx prisma generate` passed.
  - `npm run typecheck` across all 4 tsconfigs passed with exit code 0.
  - `npm test` passed 100% (363/363 tests across 19 suites).
  - Milestone 2 Gate marked PASS in `GATE_STATUS.md`.

---

## 2. Logic Chain & Current Milestone State

| # | Milestone Name | Status | Key Deliverables & Verified State |
|---|----------------|--------|-----------------------------------|
| M1 | POS Audit Documents & Architecture Blueprint | DONE | 9 audit markdown files, `PROJECT.md`, `TEST_INFRA.md`, `TEST_READY.md`, Gate PASS |
| M2 | Database Schema, Shift Models & Document Numbering | DONE | `PosTerminal`, `PosShift`, non-destructive migration, single-hyphen sequence formatting, Gate PASS |
| M3 | Direct Atomic POS Posting Engine & GL Accounting | NOT STARTED | Core atomic checkout endpoint `POST /api/pos/checkout` to be implemented |
| M4 | Barcode Scanner Engine & Dual Inventory Custody | NOT STARTED | Catalog search bug fix, dual-SIM resolver verification, 1 handset = 1 cart row |
| M5 | Counter Terminal UI, Hotkeys & Multi-Tender Payments | NOT STARTED | Counter UI redesign, F2-F10 hotkeys, multi-tender split payment grid, credit limits |
| M6 | Shift Management, Parked Sales, Returns, Printing & 15 Reports | NOT STARTED | Shift opening/closing & cash reconciliation, parked recall, counter returns, 58mm thermal, 15 reports |
| M7 | Full E2E Test Suite Pass (100%) & Forensic Audit | NOT STARTED | 100% pass on 103 acceptance tests, Tier 5 adversarial hardening, clean auditor veto check |

---

## 3. Active Subagents & Running Tasks

- **Active Subagents**: None (all 16 subagents from Gen 1 have concluded).
- **Spawn Count**: 16 / 16 (Succession threshold reached; triggering Gen 2).
- **Background Tasks**: All background timers/crons from Gen 1 are cancelled upon succession; Gen 2 will initialize its own heartbeat cron.

---

## 4. Key Decisions & Hard Constraints

1. **DISPATCH-ONLY Constraint**: As orchestrator, NEVER write, modify, or create source code files directly. NEVER run build/test commands directly. Delegate ALL exploration, implementation, testing, and reviewing to subagents via `invoke_subagent`. Edit ONLY metadata/state files (.md) in `.agents/teamwork/`.
2. **Mandatory Subagent Dispatch Rule**: Every subagent dispatch MUST include the verbatim path `d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md`. Subagents must read it before starting work.
3. **Mandatory Worker Integrity Warning**: Every Worker dispatch MUST include verbatim:
   > DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
4. **Historical Data Preservation (Zero Tolerance)**: Never delete, truncate, or alter historical invoices (`ISB--SI-FY2026-27-000004`), submitted receipt vouchers (`ISB--RC-FY2026-27-000001` to `000006`), stock movements, or accounting journals.
5. **No Reuse of Subagents**: Once an agent delivers its handoff, it is permanently retired. Always spawn fresh agents.
6. **Auditor Veto**: A `teamwork_auditor` report of INTEGRITY VIOLATION is a non-negotiable binary veto.

---

## 5. Remaining Work & Concrete Next Steps for Successor (Milestone 3)

### Next Milestone: Milestone 3 — Direct Atomic POS Posting Engine & GL Accounting

1. **Iteration Loop Setup**:
   - Spawn Explorers (or review the comprehensive contract already documented in `PROJECT.md § Counter Terminal Checkout Contract`).
   - Implement `src/app/api/pos/checkout/route.ts` via `teamwork_worker`:
     - **Atomic Transaction**: Execute inside `prisma.$transaction(async (tx) => { ... }, { isolationLevel: 'Serializable', timeout: 15000 })`.
     - **Concurrency & Idempotency**:
       - Verify idempotency key (prevent duplicate postings on double-click).
       - Lock `PhysicalStockUnit` rows (`SELECT ... FOR UPDATE` or Prisma equivalent) to prevent concurrent double-selling of handsets.
       - Lock `StockBalance` rows for quantity-based items.
     - **Inventory Deductions**:
       - Handsets: Update `PhysicalStockUnit.status = 'SOLD'`, link `invoiceId`. Record `StockMovement` with type `SALE`.
       - Accessories: Deduct `StockBalance.quantityOnHand`. Record `StockMovement`.
     - **Direct Creation of SalesInvoice**:
       - Create `SalesInvoice` directly with `status: 'POSTED'` (no approval queue, no maker-checker, no `Approved` status).
       - Generate single-hyphen sequence number: `ISB-SI-FY2026-27-000001` via `nextDocumentNumber(tx, ...)`.
       - Create `SalesInvoiceLine` snapshots (unit price, discount, tax rate, cost).
     - **Costing & COGS Calculation**:
       - Handset: Specific identification actual acquisition cost from `PhysicalStockUnit.acquisitionCost`.
       - Accessory: Moving average unit cost from `StockBalance`.
     - **Balanced Commercial Journal Entry**:
       - DR 1100 Accounts Receivable (`grandTotal`)
       - CR 4000 Sales Revenue (`subtotal - discount`)
       - CR 2200 Output Tax Liability (`taxTotal`)
       - DR 5000 Cost of Goods Sold (`totalCOGS`)
       - CR 1200 Inventory Asset (`totalCOGS`)
       - Balanced invariant: Total Debits == Total Credits.
     - **Multi-Tender Payments & Receipt Journal**:
       - For each payment entry (Cash, Card, Wallet, Bank):
         - Create `Payment` record linked to invoice with `status: 'POSTED'`, sequence `ISB-RC-FY2026-27-000001`.
         - Balanced receipt journal: DR 1000 Cash / 1010 Bank, CR 1100 AR.
       - For Credit sales: customer balance increases by unpaid portion; validate credit limit!
     - **Shift Association**: Link `invoice.shiftId` and `payment.shiftId` if `shiftId` provided.
2. **Verification & Testing**:
   - Run Vitest suite: `npx vitest run src/lib/operations/pos-acceptance.test.ts`.
   - Run typecheck: `npm run typecheck`.
   - Run full test suite: `npm test`.
3. **Committee Gate Review**:
   - Dispatch Reviewers (`teamwork_reviewer`), Challengers (`teamwork_challenger`), and Forensic Auditor (`teamwork_auditor`).
   - Record verdicts in `GATE_STATUS.md`. Gate passes only if strict AND condition holds.
4. **Downstream Progression**:
   - Proceed sequentially to Milestone 4 (Scanner & Dual Inventory), Milestone 5 (UI & Hotkeys), Milestone 6 (Shifts, Parked, Returns, Reports), Milestone 7 (Final E2E & Forensic Audit).

---

## 6. Key Artifacts Index

- `d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md` — Authoritative verbatim user requirements
- `d:\Inventory Managment Software\.agents\teamwork\orchestrator\PROJECT.md` — Master project blueprint & milestone contracts
- `d:\Inventory Managment Software\.agents\teamwork\orchestrator\BRIEFING.md` — Persistent orchestrator memory
- `d:\Inventory Managment Software\.agents\teamwork\orchestrator\progress.md` — Orchestrator checklist & liveness heartbeat
- `d:\Inventory Managment Software\.agents\teamwork\orchestrator\GATE_STATUS.md` — Formal committee gate records
- `d:\Inventory Managment Software\TEST_INFRA.md` — 4-tier E2E testing framework specification
- `d:\Inventory Managment Software\TEST_READY.md` — Published E2E test readiness certification
- `d:\Inventory Managment Software\src\lib\operations\pos-acceptance.test.ts` — 103 acceptance tests for POS
- `d:\Inventory Managment Software\.agents\teamwork\worker_m2_gen2\handoff.md` — Milestone 2 verification report
