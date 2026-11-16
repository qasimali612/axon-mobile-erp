# BRIEFING — 2026-11-10T12:33:30Z

## Mission
Investigate historical invoice `ISB--SI-FY2026-27-000004` and historical invoice handling: inspect database state, assess posting eligibility for `APPROVED` status, verify safety and immutability guarantees, and formulate exact code change recommendations for manual validation and posting without unintended mutations or automatic posting.

## 🔒 My Identity
- Archetype: explorer
- Roles: Read-only investigation, historical invoice audit, state transition analysis, posting service eligibility evaluation
- Working directory: d:\Inventory Managment Software\.agents\teamwork\explorer_m1_3
- Original parent: 801c1388-1cc8-4ee1-9f96-99c33e953b3a
- Milestone: Milestone 1 - Order-to-Cash (Historical Invoices & Invoice 000004)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement or modify source code
- Strictly preserve historical data integrity (no modifications, deletions, or corruptions of historical invoice records, payments, or journals)
- Do NOT automatically post historical invoice 000004; require authorized user validation and manual action
- Support `APPROVED` status alongside `DRAFT` for manual posting eligibility
- Deliver structured 5-component handoff report

## Current Parent
- Conversation ID: 801c1388-1cc8-4ee1-9f96-99c33e953b3a
- Updated: 2026-11-10T12:33:30Z

## Investigation State
- **Explored paths**:
  - `prisma/schema.prisma` (`SalesInvoice`, `SalesInvoiceLine`, `SalesInvoiceUnit`, `PhysicalStockUnit`, `DeviceIdentifier`, `PaymentAllocation`, `DocumentSequence`, `JournalEntry`)
  - `src/lib/operations/sales.ts` (`postSalesInvoice`, `submitSalesInvoice`, `approveSalesInvoice`, `updateSalesInvoiceDraft`)
  - `src/app/api/sales/invoices/[id]/post/route.ts`, `[id]/submit/route.ts`, `[id]/approve/route.ts`, `[id]/route.ts`, `batch-post/route.ts`
  - `src/app/api/approvals/route.ts`
  - `src/components/sales/sales-manager.tsx`, `sales-invoice-actions.tsx`, `src/app/(erp)/sales/[id]/page.tsx`
  - Database backups and snapshot inspection via PGlite embedded engine (`inspect_backup_000004.mjs`)
- **Key findings**:
  1. Historical invoice `ISB--SI-FY2026-27-000004` has status `APPROVED` due to legacy intermediate status mutation in `postSalesInvoice()` (lines 454-465).
  2. Number format `ISB--SI-...` with double hyphen resulted from trailing hyphen in branch code combined with sequence allocator prefix handling.
  3. Invoice 000004 must not be automatically posted; it requires manual invocation via UI or explicit API by authorized user with `SALES_INVOICE_POST`.
  4. Backend `postSalesInvoice()` can directly accept `APPROVED` alongside `DRAFT` and `SUBMITTED`, transitioning directly to `POSTED` without intermediate mutations.
  5. The client-side chaining hack in UI (`sales-manager.tsx:157-168` and `sales-invoice-actions.tsx:96-106`) that made secondary calls to `/submit` and `/approve` must be removed.
  6. Batch post must not blindly auto-post historical invoices without explicit user selection.
  7. Historical invoice string in `invoiceNumber` is immutable and must never be altered or renamed.
- **Unexplored areas**: None for M1-3 scope. Ready for report authoring.

## Key Decisions Made
- Confirmed that database trigger `enforce_operational_status_transition()` already permits `APPROVED -> POSTED`.
- Confirmed that eliminating the intermediate status mutation in `postSalesInvoice()` allows seamless direct posting for both `DRAFT` and legacy `APPROVED` documents.
- Formulated exact line-by-line code recommendations for `sales.ts`, `batch-post/route.ts`, `sales-manager.tsx`, and `sales-invoice-actions.tsx`.

## Artifact Index
- `d:\Inventory Managment Software\.agents\teamwork\explorer_m1_3\DISPATCH.md` — Inbound instructions & updates
- `d:\Inventory Managment Software\.agents\teamwork\explorer_m1_3\progress.md` — Liveness & progress log
- `d:\Inventory Managment Software\.agents\teamwork\explorer_m1_3\inspect_backup_000004.mjs` — Database inspection script
- `d:\Inventory Managment Software\.agents\teamwork\explorer_m1_3\handoff.md` — Final 5-component report
