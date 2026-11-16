## 2026-11-10T12:07:11Z
From: 801c1388-1cc8-4ee1-9f96-99c33e953b3a
Priority: MESSAGE_PRIORITY_HIGH

You are Explorer 4 (Schema, Custody & Atomic Posting Engine Explorer), replacing prior explorers who were interrupted by rate limits.
Your working directory is: d:\Inventory Managment Software\.agents\teamwork\explorer_survey_4

PRIOR CONTEXT:
Spec Miner 3 has already thoroughly mined the Sales Invoice UI, API routes, and reports (see report at: d:\Inventory Managment Software\.agents\teamwork\spec_miner_survey_3\handoff.md).
You should focus specifically on the following deep technical areas:

1. Read ORIGINAL_REQUEST.md: d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md.
2. Investigate invoice `ISB--SI-FY2026-27-000004`:
   - Inspect the database / seeds / migrations / scratch scripts (`scratch/audit_invoice.mjs`).
   - Examine how its status is currently `APPROVED`.
   - How can we remove its approval dependency and make it eligible for direct posting if valid, without automatically posting it or altering historical records?
3. Document Numbering Sequence:
   - Inspect `src/lib/document-sequence.ts`, `src/lib/operations/accounting.ts`, `src/lib/operations/sales.ts`.
   - Find why `ISB--SI-FY...` had double separators and verify the exact sequence generation fix so new invoices use `ISB-SI-FY2026-27-000008` format while preserving historical references intact.
4. Physical handset & IMEI tracking:
   - Check `PhysicalStockUnit`, `DeviceIdentifier`, `StockMovement`.
   - Verify that 1 phone = 1 physical stock unit, and IMEI1 & IMEI2 both map to this same unit.
   - Verify warehouse custody checks and concurrency protection (e.g. database locking or transaction isolation) to prevent concurrent sales of the same IMEI.
5. Atomic Posting Engine & Accounting Integrity:
   - Inspect `postSalesInvoice()` in `src/lib/operations/sales.ts` and related accounting/inventory services.
   - How does the atomic database transaction work? (Prisma `$transaction`).
   - How is actual-cost COGS calculated? (Must be based on configured inventory costing: FIFO, moving average, or specific identification; NEVER selling price). Check debit COGS, credit Inventory entries.
   - How is server-side tax calculated and snapshotted on invoice lines?
   - How are revenue, tax, and AR entries generated?
   - How is posting made strictly idempotent so repeated calls do not create duplicate stock movements or journals?
6. Write a comprehensive, self-contained handoff report to: `d:\Inventory Managment Software\.agents\teamwork\explorer_survey_4\handoff.md`.
7. Send a completion message to the caller with your report path. Do not modify source code.

## 2026-11-10T12:17:29Z
From: 801c1388-1cc8-4ee1-9f96-99c33e953b3a
Priority: MESSAGE_PRIORITY_HIGH

**Context**: Survey Phase - Schema & Atomic Posting Exploration
**Content**: Checking on your progress. How are your findings on invoice ISB--SI-FY2026-27-000004, the sequence numbering fix, IMEI tracking/locking, and the atomic posting engine?
**Action**: Please update your progress.md and continue compiling your handoff.md report.
