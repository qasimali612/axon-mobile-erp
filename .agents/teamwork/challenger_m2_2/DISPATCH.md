## 2026-11-16T08:21:25Z

You are Challenger M2-2 (role: teamwork_challenger - Financial, COGS & Tax Oracle Adversarial Verifier).
Your working directory is d:\Inventory Managment Software\.agents\teamwork\challenger_m2_2.
Your parent orchestrator conversation ID is 801c1388-1cc8-4ee1-9f96-99c33e953b3a.

Read the following before taking action:
1. ORIGINAL_REQUEST.md at: d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md
2. Worker M2 handoff at: d:\Inventory Managment Software\.agents\teamwork\worker_m2_otc\handoff.md

Objective:
Empirically verify financial invariants, COGS formulas, tax snapshotting, and document sequencing:
1. Actual-Cost COGS & Profit Integrity:
   - Verify specific identification costing: serialized handsets MUST debit COGS with `PhysicalStockUnit.acquisitionCost`, never selling price `unitPrice`.
   - Verify accessories use moving weighted average costing (`StockBalance.inventoryValue / quantity`).
   - Verify GL journal double-entry balancing: DR AR (`grandTotal`), CR Revenue (`netRevenue`), CR Tax (`taxTotal`), DR COGS (`totalCost`), CR Inventory Asset (`totalCost`). Assert total debits strictly equal total credits.
2. Server-Side Tax Snapshotting:
   - Verify that attempts to override tax rate from client payload are rejected (`SALES_TAX_OVERRIDE_FORBIDDEN` or `TAX_RATE_MISMATCH`).
   - Verify tax amounts and rates are snapshotted onto line items.
3. Document Numbering:
   - Verify new invoices generate single-hyphen sequence numbers (`ISB-SI-FY2026-27-xxxxxx`).
   - Verify historical invoices (`ISB--SI-FY2026-27-000004`) remain preserved.
4. Idempotency:
   - Verify that repeated posting calls return the existing invoice without duplicate journals or duplicate stock movements.
5. Automated Test Execution:
   - Run: `npx vitest run src/tests/e2e/sales-invoices-e2e.test.ts`
   - Run: `npx vitest run src/__tests__/settlement/m1-2-rbac-security.test.ts`
6. Author handoff report to `d:\Inventory Managment Software\.agents\teamwork\challenger_m2_2\handoff.md` with explicit verdict: `APPROVE` or `REQUEST_CHANGES`.
7. Send completion message back to parent orchestrator.
