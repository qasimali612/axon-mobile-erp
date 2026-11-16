## 2026-11-16T08:31:40Z

You are Worker M3 Order-to-Cash (role: teamwork_worker).
Your working directory is d:\Inventory Managment Software\.agents\teamwork\worker_m3_otc.
Your parent orchestrator conversation ID is 801c1388-1cc8-4ee1-9f96-99c33e953b3a.

You MUST read the following files before taking any action:
1. ORIGINAL_REQUEST.md at: d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md
2. Spec Miner Survey at: d:\Inventory Managment Software\.agents\teamwork\spec_miner_survey_3\handoff.md (specifically Edge Cases 2 & 3)
3. TEST_READY.md at: d:\Inventory Managment Software\TEST_READY.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Exclusively Owned Files:
- src/app/api/sales/invoices/route.ts
- src/app/(erp)/sales/dashboard/page.tsx
- src/lib/operations/payments.ts
- src/lib/finance/subledger.ts
- src/lib/operations/returns.ts

Objective:
Implement, verify, and reconcile Milestone 3 (Accounts Receivable & GL Reconciliation, Payment Allocations & Sales Returns):
1. Outstanding AR Formula with Sales Returns:
   - In `src/app/api/sales/invoices/route.ts:169` and `src/app/(erp)/sales/dashboard/page.tsx:135`, update the outstanding amount calculation:
     `Outstanding AR = grandTotal - returns - paid`
     Ensure posted sales returns / credit notes are deducted from invoice receivables, matching `src/lib/finance/subledger.ts` (`openAmount = grandTotal - returnsAmount - allocatedAmount`).
   - Only valid posted invoices contribute to AR. Draft, unposted, cancelled, or reversed invoices must never affect AR balances.
2. Payment Allocation Cap at Net Open Amount:
   - In `src/lib/operations/payments.ts:280-282`, update `validateAllocations()`:
     Compute `returnsAmount` from posted stock returns for the target invoice.
     Net open amount = `invoice.grandTotal - returnsAmount - settledAmount`.
     Validate that `allocation.amount` does not exceed the net open amount.
     Support single or multi-invoice allocations, partial or full settlements, without exceeding available receipt or invoice balances.
3. Subledger & GL Reconciliation:
   - Reconcile customer subledger with Accounts Receivable General Ledger control account. The total customer subledger must strictly reconcile to the GL AR control account balance without hardcoded values.
4. Overdue Status Accuracy:
   - Verify payment status (`UNPAID`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`) is calculated independently of posting status, based on due dates and company timezone.
   - Invoices with remaining balance past due date are marked `OVERDUE`; unposted or fully paid invoices are never marked overdue.
5. Verification Commands:
   - Run: `npx vitest run src/tests/e2e/sales-invoices-e2e.test.ts`
   - Run: `npx vitest run src/lib/operations/sales-posting-adversarial.test.ts`
   - Run: `npx vitest run src/__tests__/settlement/m1-2-rbac-security.test.ts`
   - Run: `npx tsc -p tsconfig.ops.json --noEmit`
   - Run: `npx eslint src/app/api/sales/invoices/route.ts src/lib/operations/payments.ts src/lib/finance/subledger.ts`
6. Update `progress.md` as you make progress.
7. Author handoff report to `d:\Inventory Managment Software\.agents\teamwork\worker_m3_otc\handoff.md` following the Handoff Protocol.
8. Send completion message back via `send_message` to parent `801c1388-1cc8-4ee1-9f96-99c33e953b3a`.
