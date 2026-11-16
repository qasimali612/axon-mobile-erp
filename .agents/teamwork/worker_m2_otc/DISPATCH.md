## 2026-11-16T08:14:58Z
You are Worker M2 Order-to-Cash (role: teamwork_worker).
Your working directory is d:\Inventory Managment Software\.agents\teamwork\worker_m2_otc.
Your parent orchestrator conversation ID is 801c1388-1cc8-4ee1-9f96-99c33e953b3a.

You MUST read the following files before taking any action:
1. ORIGINAL_REQUEST.md at: d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md
2. Explorer 4 Survey at: d:\Inventory Managment Software\.agents\teamwork\explorer_survey_4\handoff.md
3. TEST_READY.md at: d:\Inventory Managment Software\TEST_READY.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Exclusively Owned Files:
- src/lib/operations/sales.ts
- src/lib/operations/inventory.ts
- src/lib/operations/accounting.ts
- src/lib/document-sequence.ts

Objective:
Implement, verify, and harden all Milestone 2 capabilities (Atomic Posting Engine, Handset Custody & Document Numbering):
1. Handset Custody & Dual-IMEI Tracking:
   - Ensure `PhysicalStockUnit` represents exactly 1 physical phone.
   - Ensure `DeviceIdentifier` tracks slot 1 (IMEI1) and slot 2 (IMEI2) mapped to the same `stockUnitId`.
   - Prevent duplicate IMEI additions and sales with concurrency protection (`lockPhysicalStockUnit` executing `SELECT ... FOR UPDATE`).
   - Validate warehouse custody (`unit.currentWarehouseId === invoice.warehouseId`) and active status (`IN_STOCK`).
   - Transition unit status to `SOLD`, set `soldAt`, and clear warehouse/branch custody on sale.
2. Actual-Cost COGS Calculation & GL Double-Entry:
   - Specific identification costing for serialized handsets: derived strictly from `unit.acquisitionCost` (NEVER selling price `unitPrice`).
   - Weighted average costing for accessories: derived from `StockBalance.inventoryValue / quantity`.
   - Double-entry balanced GL journal generation:
     Debit: AR (`grandTotal`)
     Credit: Revenue (`netRevenue`)
     Credit: Tax Payable (`taxTotal`)
     Debit: COGS (`totalCost`)
     Credit: Inventory Asset (`totalCost`)
   - Ensure exact balance (Debits == Credits) to 4 decimal places.
3. Server-Side Tax Snapshotting:
   - Derive tax rate strictly from configured server tax rules (`Product.taxRule.rate`).
   - Reject client-side tax overrides (`SALES_TAX_OVERRIDE_FORBIDDEN`).
   - Snapshot `taxRate` and `taxAmount` onto `SalesInvoiceLine`.
4. Document Numbering Sequence Sanitization:
   - Enforce single-separator format (e.g. `ISB-SI-FY2026-27-000008` instead of `ISB--SI-FY2026-27-000008`) for new allocations.
   - Clean branch prefix trailing hyphens and suffix leading hyphens.
   - Ensure `DocumentSequence` upsert updates prefix upon conflict so legacy double hyphens are overwritten on new allocations.
   - Strictly preserve historical invoice and payment references in database without renaming.
5. Strict Idempotency:
   - Guard against duplicate posting (`if (invoice.status === POSTED) return invoice`).
   - Idempotency keys on journal entries and stock movements.
6. Verification:
   - Run: `npx vitest run src/tests/e2e/sales-invoices-e2e.test.ts`
   - Run: `npx vitest run src/lib/operations/sales-posting-adversarial.test.ts`
   - Run: `npx vitest run src/__tests__/settlement/m1-2-rbac-security.test.ts`
   - Run: `npx tsc -p tsconfig.ops.json --noEmit`
   - Run: `npx eslint src/lib/operations/sales.ts src/lib/operations/accounting.ts src/lib/document-sequence.ts`
7. Update `progress.md` in your directory as you execute.
8. Author comprehensive handoff report to `d:\Inventory Managment Software\.agents\teamwork\worker_m2_otc\handoff.md` following the Handoff Protocol.
9. Send completion message back via `send_message` to parent `801c1388-1cc8-4ee1-9f96-99c33e953b3a`.
