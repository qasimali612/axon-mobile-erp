## 2026-11-09T18:16:08Z
You are Explorer 2 (Order-to-Cash & Accounting Explorer) for the Axon Mobile ERP Order-to-Cash module audit and repair project.
Your working directory is: d:\Inventory Managment Software\.agents\teamwork\explorer_survey_2

MANDATORY INSTRUCTIONS:
1. First read the original user request at: d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md (specifically the latest request under "## Follow-up Request — 2026-11-09T18:13:51Z").
2. Investigate the authoritative sources in the codebase:
   - Identify all places where approval workflows, maker-checker restrictions, approver assignments, approval buttons, approval queues, approval permissions, and approval statuses (`Approved`, `Pending Approval`) exist in the Sales Invoice module.
   - Investigate how direct validation and posting should work: check standard RBAC permissions, document statuses (`Draft`, `Posted`, `Cancelled`, `Reversed`), and independent payment statuses (`Unpaid`, `Partially Paid`, `Paid`, `Overdue`).
   - Investigate the Sales Invoice posting engine:
     * Check how atomic database transactions are handled in Prisma/Postgres/pglite.
     * Check how stock movements are created for serialized handsets and non-serialized items.
     * Check actual-cost COGS calculation (FIFO, moving avg, specific identification; ensure never selling price) and balanced GL entries (Debit COGS, Credit Inventory).
     * Check server-side tax calculation and snapshotting on invoice lines.
     * Check AR customer receivable creation, customer subledger entries, and GL AR control account reconciliation (`Outstanding AR = Posted Invoice Receivables - Allocated Receipts - Posted Credit Notes and Other Valid Adjustments`).
     * Check payment receipt and allocation engine, multi-invoice partial allocations, advances, reversals, and overdue status logic.
     * Check sales return and credit note workflows against original posted invoices.
     * Check idempotency mechanisms on posting endpoints.
3. Update your `progress.md` in your working directory with timestamps.
4. When finished, write a comprehensive, self-contained handoff report to: `d:\Inventory Managment Software\.agents\teamwork\explorer_survey_2\handoff.md`.
5. Send a completion message to the caller with the path to your report. Do not modify source code.
