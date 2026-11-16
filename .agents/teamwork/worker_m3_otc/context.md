# Worker M3 Order-to-Cash Context

- Milestone: Milestone 3 — Accounts Receivable & General Ledger Reconciliation, Payment Allocations & Sales Returns
- Working Directory: d:\Inventory Managment Software\.agents\teamwork\worker_m3_otc
- Mission: Reconcile AR and customer subledger with GL AR control account, correct outstanding AR calculation to deduct posted sales returns/credit notes, cap payment allocations at net open amount, and verify overdue status calculations.
- Target Files:
  - `src/app/api/sales/invoices/route.ts`
  - `src/app/(erp)/sales/dashboard/page.tsx`
  - `src/lib/operations/payments.ts`
  - `src/lib/finance/subledger.ts`
  - `src/lib/operations/returns.ts`
- Authoritative References:
  - `d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md`
  - `d:\Inventory Managment Software\.agents\teamwork\spec_miner_survey_3\handoff.md` (Edge Cases 2 & 3)
  - `d:\Inventory Managment Software\TEST_READY.md`
