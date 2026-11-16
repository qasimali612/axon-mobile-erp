# BRIEFING — 2026-11-09T18:16:00Z

## Mission
Survey the existing backend, Prisma schema, API routes, inventory ledger, GL journals, COGS, pricing/taxes, approvals, and permissions for POS and Sales Invoices in Axon Mobile ERP.

## 🔒 My Identity
- Archetype: explorer
- Roles: Backend & Accounting Explorer
- Working directory: d:\Inventory Managment Software\.agents\teamwork\teamwork_explorer_survey_backend
- Original parent: 2acf2e21-eff7-485c-8a83-76c5f4f3acfb
- Milestone: Survey Backend & Accounting

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do NOT modify project source code
- Strictly preserve historical database records and references

## Current Parent
- Conversation ID: 2acf2e21-eff7-485c-8a83-76c5f4f3acfb
- Updated: 2026-11-09T18:28:00Z

## Investigation State
- **Explored paths**:
  - `prisma/schema.prisma`: 94 models, enums (`StockUnitStatus`, `OperationalDocumentStatus`), indexes, relationships.
  - `src/lib/operations/sales.ts`: Draft creation, submission, approval, atomic posting, COGS calculation, GL journals, inventory movements.
  - `src/lib/operations/payments.ts`: Payment vouchers, approval, posting, allocation rules, Cash in Hand journal integration.
  - `src/lib/operations/accounting.ts` & `src/lib/document-sequence.ts`: Sequence allocation under row lock, prefix sanitization fixing double hyphen issue.
  - `src/app/api/operations/catalog/resolve/route.ts` & `search/route.ts`: Dual IMEI resolution, custody status validation, field name bug (`currentWarehouseId` vs `warehouseId`).
  - `src/lib/finance/cash-in-hand.ts`: Reconciliation mechanism, root cause of missing cash receipts due to unposted payment vouchers.
  - `src/lib/finance/subledger.ts`: Customer Subledger and AR formula (`grandTotal - returns - posted payments`).
  - `scripts/`: PGlite runtime configuration, 40 verification scripts.
  - TypeScript & Test Suite: `npm test` passes (11 files, 63 tests), `npm run typecheck` error located in `receipt/page.tsx` (`branch.address` vs `branch.addressLine1`).
- **Key findings**:
  1. Sale submission executes 8 sequential client HTTP calls; needs replacement with atomic `POST /api/pos/checkout`.
  2. Cash in Hand was missing cash receipts because payment voucher was left unposted (only posted journals are queried).
  3. Single-unit handset custody and dual-SIM mapping (IMEI1/IMEI2) works via `DeviceIdentifier` and `PhysicalStockUnit`, but cart grouping in UI improperly increments quantity instead of separate lines.
  4. Catalog search route has runtime query bug using non-existent field `warehouseId` on `PhysicalStockUnit`.
  5. Sequential numbering format `ISB-SI-FY2026-27-000001` fixed by prefix sanitization without affecting historical records (`ISB--SI-FY2026-27-000004`).
- **Unexplored areas**: None for Phase 0 survey.

## Key Decisions Made
- Deliver comprehensive survey findings in `handoff.md` and report to orchestrator.

## Artifact Index
- DISPATCH.md — Initial dispatch and heartbeat logs
- BRIEFING.md — Situational awareness
- progress.md — Liveness & heartbeat log
- handoff.md — 5-component survey report (Observation, Logic Chain, Caveats, Conclusion, Verification Method)
