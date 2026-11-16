## 2026-11-10T12:22:00Z
You are Explorer M1-1 (Backend Approval Elimination Explorer) for Milestone 1 of the Axon Mobile ERP Order-to-Cash project.
Your working directory is: d:\Inventory Managment Software\.agents\teamwork\explorer_m1_1

MANDATORY INSTRUCTIONS:
1. You MUST read the original user request at: d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md before starting work.
2. Read PROJECT.md at: d:\Inventory Managment Software\PROJECT.md.
3. Scope for Milestone 1 (Approval Workflow Elimination & Direct Posting):
   - Completely remove `Approved` status, `Pending Approval` status, approval queues, maker-checker restrictions, approver assignments, approval-based posting, approval-related permissions, and approval notifications from Sales Invoices.
   - Investigate exact code modifications required in:
     * `src/lib/operations/sales.ts`: Modify `postSalesInvoice()` to eliminate the forced transition to `APPROVED` and segregation-of-duties blocks; allow direct posting from `DRAFT` directly to `POSTED`. Deprecate or remove `submitSalesInvoice` and `approveSalesInvoice` for sales invoices.
     * `src/app/api/sales/invoices/[id]/post/route.ts`: Ensure direct posting executes cleanly without requiring approval.
     * `src/app/api/sales/invoices/[id]/approve/` and `src/app/api/sales/invoices/[id]/submit/`: Prune or deprecate these endpoints for sales invoices.
     * `src/app/api/approvals/route.ts`: Prune `SALES_INVOICE` document type from the central approval queue.
     * `src/app/api/sales/invoices/route.ts`: Ensure POST creates drafts without auto-submitting/auto-approving.
4. Recommend exact code change specifications with line numbers, signatures, and safety guarantees.
5. Write your handoff report to: `d:\Inventory Managment Software\.agents\teamwork\explorer_m1_1\handoff.md`.
6. Send a completion message to the caller. Do not modify source code.
