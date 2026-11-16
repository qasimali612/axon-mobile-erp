## 2026-11-09T18:13:51Z

Perform a complete technical and functional audit, repair, and optimization of the existing Axon Mobile ERP Order-to-Cash module (specifically Sales Invoices), removing approval workflows, correcting Accounts Receivable and GL reconciliation, ensuring atomic and idempotent inventory/accounting posting, and redesigning the invoice dashboard.

Working directory: d:\Inventory Managment Software
Integrity mode: development

## Requirements

### R1. Elimination of Approval Workflow & Direct Posting
- Completely remove `Approved` status, `Pending Approval` status, approval queues, maker-checker restrictions, approver assignments, approval buttons, approval-based posting, approval-related permissions, and approval notifications from the Sales Invoice module.
- Authorized users must be able to validate and directly post transactions using standard RBAC permissions.
- Document statuses must be strictly: `Draft`, `Posted`, `Cancelled`, `Reversed` (where existing architecture supports authorized reversals).
- Payment statuses must remain independent of document status: `Unpaid`, `Partially Paid`, `Paid`, `Overdue`.
- Investigate existing invoice `ISB--SI-FY2026-27-000004` (currently with Approved status). Remove its approval dependency and make it eligible for direct posting if valid, without automatically posting it or altering historical data.

### R2. Sales Invoice Workflow & Atomic Posting Engine
- Support full invoice lifecycle: Header creation, line items for serialized mobile phones (IMEI1 and IMEI2 mapping to a single physical unit) and non-serialized products/accessories, draft saving, and direct validation/posting.
- Draft invoices must not issue or reserve stock, create accounting journal entries, or affect posted AR.
- Invoice validation and posting must execute within a single atomic database transaction:
  1. Validate invoice status, customer, branch, warehouse, products, IMEI1/IMEI2 custody and availability, pricing, discounts, financial period, and account mappings.
  2. Prevent duplicate IMEI sales and verify warehouse custody with concurrency protection (database locking).
  3. Calculate tax on the server using existing configured tax policies; store tax rate and amount snapshots on invoice lines (never trust client-side tax calculations).
  4. Calculate actual-cost COGS based on configured costing policy (FIFO, moving average, or specific identification; never selling price).
  5. Atomically create stock movements, update device custody, generate balanced COGS journal entries (Debit: COGS, Credit: Inventory), generate revenue/tax journal entries, create customer receivable, mark invoice as Posted, and record immutable audit logs.
- Posting must be strictly idempotent: repeated API requests must never create duplicate stock movements or journal entries.

### R3. Accounts Receivable & General Ledger Reconciliation
- Only valid posted invoices contribute to Accounts Receivable. Draft, unposted, cancelled, or reversed invoices must never affect AR balances.
- Formula: `Outstanding AR = Posted Invoice Receivables - Allocated Receipts - Posted Credit Notes and Other Valid Adjustments`.
- Reconcile customer subledgers with the GL AR control account, payment allocations, and credit notes. The customer subledger total must strictly reconcile to the GL AR control account without hardcoded values.
- Support comprehensive payment receipt and multi-invoice/partial payment allocation workflows, customer advances, and authorized receipt reversals without exceeding available receipt or invoice balances.
- Calculate payment status and overdue status independently of posting status, based on due dates and company timezone/financial calendar settings.

### R4. Inventory Custody, Document Numbering & Sales Returns
- Ensure `PhysicalStockUnit`, `DeviceIdentifier`, and `StockMovement` accurately track physical handsets (1 phone = 1 unit; IMEI1 & IMEI2 identify the same unit).
- Correct document numbering sequence format to avoid duplicate separators (e.g. `ISB-SI-FY2026-27-000008` instead of `ISB--SI-FY2026-27-000008`) for new invoices, with branch and financial-year sequences, while preserving historical invoice references.
- Implement/verify sales return and credit note workflows against original posted invoices, restoring stock through controlled reversal entries and reversing tax/COGS/AR without editing original posted records.
- Preserve all existing database records, invoices, payments, and accounting history; do not perform destructive migrations or database resets.

### R5. Sales Invoice UI/UX Dashboard & Reports Reconciliation
- Redesign the Sales Invoice screen summary cards: Total Invoices, Drafts, Awaiting Posting (no approval terminology), Posted, Total Posted Sales, Outstanding Receivables, Overdue Receivables, and Paid Invoices.
- Enhance the invoice grid with document status, payment status, financial totals, paid/outstanding balances, due date, and contextual role-based actions (View, Edit Draft, Post, Receive Payment, Print, Download PDF, Return, Cancel/Reverse).
- Implement multi-criteria filtering (Invoice Number, Customer, Phone, SKU, IMEI1/IMEI2, Branch, Warehouse, Date ranges, Statuses).
- Verify and correct financial and operational reports directly tied to sales invoices, AR reconciliation, and invoice dashboard metrics.

## Acceptance Criteria

### Workflow & Permissions
- [ ] No approval-related statuses, queues, maker-checker checks, or approval buttons exist in the Sales Invoice module.
- [ ] Authorized users can save drafts, validate, and directly post invoices.
- [ ] Existing invoice `ISB--SI-FY2026-27-000004` has its approval dependency removed and is made eligible for manual validation and posting if valid.
- [ ] Document status (`Draft`, `Posted`, `Cancelled`, `Reversed`) and payment status (`Unpaid`, `Partially Paid`, `Paid`, `Overdue`) are tracked independently.

### Inventory & Accounting Integrity
- [ ] Draft invoices create zero stock movements, zero journal entries, and zero AR impacts.
- [ ] Posting executes atomically in one transaction; any validation failure rolls back the entire transaction.
- [ ] Repeated posting calls are idempotent and produce no duplicate entries.
- [ ] Two concurrent transactions attempting to post the same IMEI result in one success and one safe rejection (no duplicate sale).
- [ ] COGS is derived from configured actual inventory costing policy and balances in GL (Debit: COGS, Credit: Inventory).
- [ ] Output tax is computed server-side and snapshotted on invoice lines.
- [ ] Revenue, tax, and AR journal entries are balanced and correctly mapped to Chart of Accounts.

### AR & GL Reconciliation
- [ ] Outstanding AR calculation matches `Posted Invoices - Allocated Receipts - Posted Credit Notes`.
- [ ] Total customer subledger matches the Accounts Receivable General Ledger control account balance.
- [ ] Payment receipts can be allocated in full or partially across one or multiple invoices without exceeding receipt amounts.
- [ ] Invoices with remaining balance past due date are marked `Overdue`; unposted or paid invoices are not marked overdue.

### Data Safety, UI & Reporting
- [ ] No historical invoice, payment, IMEI, or journal record is deleted, altered, or corrupted.
- [ ] New invoices generate sequence numbers using single separator format (e.g. `ISB-SI-FY2026-27-000008`) without altering historical references.
- [ ] Summary cards, invoice grid, and sales-invoice-related reports accurately reflect live database figures without hardcoded values.
- [ ] All automated regression and verification tests pass and production build succeeds.

## Verification Resources
- The team will inspect the existing repository test setup and implement new automated test scripts covering the 20 testing requirements:
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
