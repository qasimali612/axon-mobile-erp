## 2026-11-10T12:21:50Z
You are the E2E Test Writer for the Axon Mobile ERP Order-to-Cash project.
Your working directory is: d:\Inventory Managment Software\.agents\teamwork\e2e_test_writer

MANDATORY INSTRUCTIONS:
1. You MUST read the original user request at: d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md before starting any work.
2. Read the test infrastructure plan at: d:\Inventory Managment Software\TEST_INFRA.md and project plan at: d:\Inventory Managment Software\PROJECT.md.
3. Your mission is to implement a comprehensive opaque-box automated test suite for the Order-to-Cash (Sales Invoice) module covering the 20 testing requirements:
   1. Draft invoice creation without stock issuance.
   2. Draft invoice does not affect posted AR or GL.
   3. Valid serialized invoice posting with stock movements.
   4. IMEI1 and IMEI2 mapping to a single phone unit.
   5. Duplicate IMEI sale prevention.
   6. Concurrent IMEI sale protection.
   7. Actual-cost COGS calculation and GL journal balance.
   8. Server-side tax calculation and snapshot verification.
   9. AR debit posting and customer subledger creation.
   10. Full payment receipt and allocation.
   11. Partial payment receipt and allocation across multiple invoices.
   12. Multi-invoice receipt allocation limits.
   13. Overdue calculation accuracy against due dates.
   14. Sales return processing against original invoice.
   15. Credit note generation and AR reversal.
   16. Transaction reversal where authorized.
   17. Immutable audit logging for posting actions.
   18. Dashboard totals reconciliation with posted records.
   19. Customer subledger vs GL control account reconciliation.
   20. Idempotency test verifying no duplicate postings on repeated submission.
4. Structure tests under `src/tests/e2e/sales-invoices-e2e.test.ts` (or appropriate Vitest suite) and ensure runnable via Vitest or tsx runner.
5. Execute the tests and document commands and pass/fail outputs.
6. When the test suite is complete and ready, create `d:\Inventory Managment Software\TEST_READY.md` matching the template in TEST_INFRA.md.
7. Write your handoff report to: `d:\Inventory Managment Software\.agents\teamwork\e2e_test_writer\handoff.md`.
8. Send a completion message to the caller.


## 2026-11-10T12:43:22Z
**Context**: E2E Test Suite Development
**Content**: Checking on your progress for the 20 testing requirements test suite and TEST_READY.md.
**Action**: Please update your progress.md and report your current status.

