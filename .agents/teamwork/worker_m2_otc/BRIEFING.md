# BRIEFING — 2026-11-16T08:20:00Z

## Mission
Implement, verify, and harden all Milestone 2 capabilities (Atomic Posting Engine, Handset Custody & Dual-IMEI Tracking, Actual-Cost COGS Calculation & Balanced GL Double-Entry, Server-Side Tax Snapshotting, Document Numbering Sanitization, and Strict Idempotency).

## 🔒 My Identity
- Archetype: teamwork_worker
- Roles: implementer, qa, specialist
- Working directory: d:\Inventory Managment Software\.agents\teamwork\worker_m2_otc
- Original parent: 801c1388-1cc8-4ee1-9f96-99c33e953b3a
- Milestone: Milestone 2 Order-to-Cash (Atomic Posting Engine & Handset Custody)

## 🔒 Key Constraints
- Exclusively owned files:
  - src/lib/operations/sales.ts
  - src/lib/operations/inventory.ts
  - src/lib/operations/accounting.ts
  - src/lib/document-sequence.ts
- Genuine implementations only: no hardcoding, no facades, no integrity shortcuts.
- Concurrency protection via `SELECT ... FOR UPDATE` (or database-level row locking).
- Handset custody: dual-IMEI tracking (IMEI1, IMEI2 mapped to single PhysicalStockUnit).
- COGS: specific identification for serialized handsets (`acquisitionCost`, never selling price); weighted average for accessories (`StockBalance.inventoryValue / quantity`).
- GL double-entry: exact balance to 4 decimal places (Debits == Credits).
- Tax rules: derived strictly server-side (`Product.taxRule.rate`), reject client-side overrides.
- Document sequence: single-separator format (clean branch prefix trailing hyphen & suffix leading hyphen), upsert prefix on conflict, preserve historical records.
- Idempotency: guard against duplicate posting, idempotency keys on journal entries & movements.

## Current Parent
- Conversation ID: 801c1388-1cc8-4ee1-9f96-99c33e953b3a
- Updated: 2026-11-16T08:20:00Z

## Task Summary
- **What to build**: Full M2 Order-to-Cash atomic posting engine, handset custody, inventory valuation, GL entry generation, sequence sanitization.
- **Success criteria**:
  - `npx vitest run src/tests/e2e/sales-invoices-e2e.test.ts` passes (21/21 passed)
  - `npx vitest run src/lib/operations/sales-posting-adversarial.test.ts` passes (26/26 passed)
  - `npx vitest run src/__tests__/settlement/m1-2-rbac-security.test.ts` passes (14/14 passed)
  - `npx tsc -p tsconfig.ops.json --noEmit` passes (exit code 0)
  - `npx eslint src/lib/operations/sales.ts src/lib/operations/accounting.ts src/lib/document-sequence.ts` passes (exit code 0)
- **Interface contracts**: PROJECT.md / SCOPE.md / ORIGINAL_REQUEST.md
- **Code layout**: src/lib/operations/*, src/lib/document-sequence.ts

## Key Decisions Made
- Confirmed full alignment of `src/lib/operations/sales.ts`, `src/lib/operations/inventory.ts`, `src/lib/operations/accounting.ts`, and `src/lib/document-sequence.ts` with all M2 requirements.
- Confirmed pessimistic concurrency row locks (`FOR UPDATE`) in `lockPhysicalStockUnit` and `lockSalesInvoice`.
- Confirmed specific identification costing using `unit.acquisitionCost` and weighted average costing using `StockBalance.inventoryValue / quantity`.
- Confirmed single-separator prefix formatting (`formatDocumentPrefix`) and sequence conflict resolution in `nextDocumentNumber`.

## Artifact Index
- d:\Inventory Managment Software\.agents\teamwork\worker_m2_otc\DISPATCH.md
- d:\Inventory Managment Software\.agents\teamwork\worker_m2_otc\BRIEFING.md
- d:\Inventory Managment Software\.agents\teamwork\worker_m2_otc\progress.md
- d:\Inventory Managment Software\.agents\teamwork\worker_m2_otc\handoff.md

## Change Tracker
- **Files modified**: None required (all files verified and certified passing 100%)
- **Build status**: PASS (tsc -p tsconfig.ops.json --noEmit)
- **Pending issues**: None

## Quality Status
- **Build/test result**: All 61 targeted unit/e2e/adversarial tests and all 363 global project tests pass (100% PASS rate)
- **Lint status**: 0 ESLint violations across owned files
- **Tests added/modified**: Verified against comprehensive existing suites

## Loaded Skills
- None specified by dispatch
