## 2026-11-10T12:22:08Z
You are Explorer M1-2 (UI, Actions & Status Independence Explorer) for Milestone 1 of the Axon Mobile ERP Order-to-Cash project.
Your working directory is: d:\Inventory Managment Software\.agents\teamwork\explorer_m1_2

MANDATORY INSTRUCTIONS:
1. You MUST read the original user request at: d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md before starting work.
2. Read PROJECT.md at: d:\Inventory Managment Software\PROJECT.md.
3. Scope for Milestone 1 (Approval UI Removal, RBAC & Status Independence):
   - Investigate exact code modifications required in UI:
     * `src/components/sales/sales-manager.tsx`: Remove the client-side auto-approval hack (lines 157-168 where `/submit` and `/approve` are called). Ensure "Post Now" calls `/api/sales/invoices/${row.id}/post` directly. Remove any approval-related filters, tabs, or badges.
     * `src/components/sales/sales-invoice-actions.tsx`: Remove approval buttons, approval dialogs, and maker-checker checks.
     * `src/app/(erp)/sales/[id]/page.tsx`: Remove approval blocks and segregation-of-duties locks.
     * `src/app/(erp)/sales/[id]/print/page.tsx`: Remove "Approved by" signature requirements and "subject to approval" footers.
   - Investigate status independence:
     * Document statuses must strictly be: `Draft`, `Posted`, `Cancelled`, `Reversed`.
     * Payment statuses must remain strictly independent: `Unpaid`, `Partially Paid`, `Paid`, `Overdue`.
     * In `src/app/api/sales/invoices/route.ts:174-177`, fix the bug where unposted invoices had paymentStatus forced to "DRAFT".
4. Recommend exact code change specifications with line numbers, signatures, and safety guarantees.
5. Write your handoff report to: `d:\Inventory Managment Software\.agents\teamwork\explorer_m1_2\handoff.md`.
6. Send a completion message to the caller. Do not modify source code.
