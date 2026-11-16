## 2026-11-16T08:20:34Z
You are Reviewer M2-1 (role: teamwork_reviewer - Code, Custody & Accounting Reviewer).
Your working directory is d:\Inventory Managment Software\.agents\teamwork\reviewer_m2_1.
Your parent orchestrator conversation ID is 801c1388-1cc8-4ee1-9f96-99c33e953b3a.

Read the following before taking action:
1. ORIGINAL_REQUEST.md at: d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md
2. Worker M2 handoff at: d:\Inventory Managment Software\.agents\teamwork\worker_m2_otc\handoff.md

Objective:
Independently review the Milestone 2 implementation:
1. Handset Custody & Dual-IMEI Tracking:
   - Verify `PhysicalStockUnit` (1 handset = 1 unit) and `DeviceIdentifier` (slot 1 = IMEI1, slot 2 = IMEI2).
   - Verify duplicate IMEI prevention and warehouse custody check (`unit.currentWarehouseId === invoice.warehouseId`).
   - Verify row lock `lockPhysicalStockUnit` (`SELECT ... FOR UPDATE`) in `src/lib/operations/inventory.ts:221-225`.
2. Actual-Cost COGS & GL Double-Entry:
   - Verify specific identification costing: derived from `unit.acquisitionCost` (NEVER selling price `unitPrice`).
   - Verify moving weighted average for accessories: derived from `StockBalance.inventoryValue / quantity`.
   - Verify GL double-entry journal balance: Debits (`grandTotal + totalCost`) == Credits (`netRevenue + taxTotal + totalCost`) to 4 decimal places.
3. Server-Side Tax Policy & Snapshotting:
   - Verify tax rate derived strictly from configured server tax rules.
   - Verify rejection of client-side tax overrides (`SALES_TAX_OVERRIDE_FORBIDDEN`).
   - Verify tax snapshots on `SalesInvoiceLine`.
4. Document Numbering Sanitization:
   - Verify single-hyphen format (`ISB-SI-FY2026-27-000008`) for new allocations.
   - Verify historical record preservation (no renaming of existing documents like `ISB--SI-FY2026-27-000004`).
5. Idempotency:
   - Verify re-posting guard and unique composite idempotency keys.
6. Verification commands:
   - Run: `npx vitest run src/tests/e2e/sales-invoices-e2e.test.ts`
   - Run: `npx vitest run src/lib/operations/sales-posting-adversarial.test.ts`
   - Run: `npx tsc -p tsconfig.ops.json --noEmit`
7. Author handoff report to `d:\Inventory Managment Software\.agents\teamwork\reviewer_m2_1\handoff.md` with explicit verdict: `APPROVE` or `REQUEST_CHANGES`.
8. Send completion message back to parent orchestrator.
