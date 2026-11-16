# Progress Log - Worker M2 Order-to-Cash

Last visited: 2026-11-16T08:19:30Z

## Status
All Milestone 2 capabilities verified, audited, and certified against requirements:
1. Handset Custody & Dual-IMEI Tracking:
   - `PhysicalStockUnit` represents 1 physical device.
   - `DeviceIdentifier` tracks slot 1 (IMEI1) and slot 2 (IMEI2) mapped to the same `stockUnitId`.
   - Concurrency protection via `lockPhysicalStockUnit` executing `SELECT ... FOR UPDATE`.
   - Warehouse custody validation (`unit.currentWarehouseId === invoice.warehouseId`) and active status check (`IN_STOCK`).
   - Unit status transitions to `SOLD`, `soldAt` recorded, and warehouse/branch custody cleared on sale.
2. Actual-Cost COGS Calculation & Balanced GL Double-Entry:
   - Specific identification costing for serialized handsets derived strictly from `unit.acquisitionCost` (never selling price).
   - Weighted average costing for accessories derived from `StockBalance.inventoryValue / quantity`.
   - Double-entry balanced GL journal generation:
     - Debit: AR (`grandTotal`)
     - Credit: Revenue (`netRevenue`)
     - Credit: Tax Payable (`taxTotal`)
     - Debit: COGS (`totalCost`)
     - Credit: Inventory Asset (`totalCost`)
   - Exact balance (Debits == Credits) enforced to 4 decimal places.
3. Server-Side Tax Snapshotting:
   - Tax rate derived strictly from configured server tax rules (`Product.taxRule.rate`).
   - Client-side tax overrides rejected (`SALES_TAX_OVERRIDE_FORBIDDEN`).
   - Tax rate, tax amount, and line totals snapshotted onto `SalesInvoiceLine`.
4. Document Numbering Sequence Sanitization:
   - Single-separator format enforced (`ISB-SI-FY2026-27-000008`).
   - Branch prefix trailing hyphens and suffix leading hyphens sanitized.
   - `DocumentSequence` upsert updates prefix upon conflict to overwrite legacy double hyphens on new allocations.
   - Historical records preserved intact without renaming.
5. Strict Idempotency:
   - Duplicate posting guard (`if (invoice.status === POSTED) return invoice`).
   - Idempotency keys on journal entries (`SALES-INVOICE:${invoice.id}`) and stock movements (`SI:${invoice.id}:${line.id}:${unit.id}`).

## Verification Results
- `npx vitest run src/tests/e2e/sales-invoices-e2e.test.ts`: PASS (21/21 tests passed)
- `npx vitest run src/lib/operations/sales-posting-adversarial.test.ts`: PASS (26/26 tests passed)
- `npx vitest run src/__tests__/settlement/m1-2-rbac-security.test.ts`: PASS (14/14 tests passed)
- `npx tsc -p tsconfig.ops.json --noEmit`: PASS (0 errors, exit code 0)
- `npx eslint src/lib/operations/sales.ts src/lib/operations/accounting.ts src/lib/document-sequence.ts`: PASS (0 errors, exit code 0)
- `npx vitest run`: PASS (19 test files, 363 tests passed)
