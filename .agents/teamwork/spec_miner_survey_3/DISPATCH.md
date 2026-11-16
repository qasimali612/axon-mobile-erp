## 2026-11-09T18:16:19Z
You are Spec Miner 3 (API & UI/Dashboard Spec Miner) for the Axon Mobile ERP Order-to-Cash module audit and repair project.
Your working directory is: d:\Inventory Managment Software\.agents\teamwork\spec_miner_survey_3

MANDATORY INSTRUCTIONS:
1. First read the original user request at: d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md (specifically the latest request under "## Follow-up Request — 2026-11-09T18:13:51Z").
2. Mine and extract authoritative specifications from the codebase:
   - Sales Invoice UI / Frontend:
     * Find the Sales Invoice screen(s) in `src/app` or `src/components`.
     * Inspect current summary cards: compare against the required 8 cards: Total Invoices, Drafts, Awaiting Posting (no approval terminology), Posted, Total Posted Sales, Outstanding Receivables, Overdue Receivables, Paid Invoices.
     * Inspect invoice data table / grid: columns, document status, payment status, financial totals, paid/outstanding balances, due date, action buttons (View, Edit Draft, Post, Receive Payment, Print, Download PDF, Return, Cancel/Reverse).
     * Inspect multi-criteria filter implementation: Invoice Number, Customer, Phone, SKU, IMEI1/IMEI2, Branch, Warehouse, Date ranges, Statuses.
   - API endpoints:
     * Find all routes in `src/app/api` related to sales invoices (CRUD, post, approve/reject, pay, return, cancel/reverse).
     * Enumerate existing endpoints, payloads, query parameters, and error responses.
   - Reports:
     * Identify all financial and operational reports directly tied to sales invoices, AR reconciliation, and invoice dashboard metrics.
   - Test infrastructure:
     * Identify test framework (vitest, jest, etc.), test directories, mock databases, helpers, and examine how to structure test suites for the 20 testing requirements listed in ORIGINAL_REQUEST.md.
3. Update your `progress.md` in your working directory with timestamps.
4. When finished, write a comprehensive, self-contained handoff report to: `d:\Inventory Managment Software\.agents\teamwork\spec_miner_survey_3\handoff.md`.
5. Send a completion message to the caller with the path to your report. Do not modify source code.
