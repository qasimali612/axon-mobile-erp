Perform a complete technical and functional audit, accounting validation, workflow repair, and professional development of the Axon Mobile ERP Cash, Bank & Party Settlement module, acting as a Senior ERP Architect, SAP Business One Finance Consultant, Chartered Management Accountant, PostgreSQL/Prisma Database Engineer, Backend Developer, Frontend Developer, and QA Engineer, delivering a complete, reliable, double-entry accounting system for customer receipts, supplier payments, cash, bank, and party settlements without approval workflows.

Working directory: d:\Inventory Managment Software
Integrity mode: development

## Requirements

### R1. Elimination of Approval Workflow & Role-Based Direct Posting
Completely remove user approval mechanisms (maker-checker, approver assignments, approval queues, approval bands, approval-based posting, operating mode restrictions) from the Cash, Bank & Party Settlement module while retaining standard RBAC permissions, branch access, cash/bank access, transaction ownership, and immutable audit logs. Voucher statuses must strictly follow Draft, Submitted, Posted, Cancelled, and Reversed, where Submitted indicates readiness for direct posting without awaiting another user's approval. Authorized users must be able to directly create, validate, submit, post, or cancel vouchers.

### R2. Customer Receipts, Supplier Payments & Party Allocations
Implement comprehensive Customer Receipt and Supplier Payment modules supporting full invoice/bill lifecycles, multiple payment methods (Cash, Bank Transfer, Cheque, Card), and detailed allocation grids (Invoice/Bill number, dates, total, previously paid, outstanding, current allocation, remaining balance). Support single or multi-invoice allocations, partial or full settlements, multiple receipts against a single invoice, and customer/supplier advances. Strictly validate that allocations do not exceed receipt amounts or outstanding invoice balances, prevent allocation against draft, unposted, or cancelled documents, prevent duplicate allocations, and record unallocated amounts as advances without silently discarding them.

### R3. Cash & Bank Management, Bank Reconciliation & Double-Entry Accounting
Integrate with the existing Chart of Accounts to manage multiple cash accounts (Cash on Hand, Branch Cash, Petty Cash) and bank accounts with masked account numbers, book/reconciled balances, and branch-level access control without hardcoded account IDs. Every posted voucher must generate balanced journal entries atomically (Customer Receipts, Supplier Payments, Customer Advances, Supplier Advances, Bank Transfers, Contra Vouchers, Cash Deposits/Withdrawals), ensuring posted vouchers cannot be edited directly and errors are corrected solely via authorized reversals. Maintain customer and supplier subledgers that reconcile strictly with Accounts Receivable and Accounts Payable General Ledger control accounts, and provide a bank reconciliation module supporting statement reconciliation, difference computation, and explicit accounting entries for bank charges and interest.

### R4. Audit and Safe Correction of Existing Vouchers & Numbering Architecture
Audit the six existing submitted customer receipt vouchers (ISB--RC-FY2026-27-000001 through 000006) and investigate the Palmpay Limited receipts referencing invoice ISB--SI-FY2026-27-000008 against actual database records, reporting actual findings and documenting a safe correction plan without automatically posting or modifying historical records. Correct voucher sequence numbering to use single-hyphen branch-specific and financial-year-specific formatting (e.g., ISB-RC-FY2026-27-000006, ISB-PV-FY2026-27-000001) with concurrency protection while preserving existing historical references. Inspect the Prisma schema and reuse existing models where possible, ensuring decimal financial fields, unique constraints, and transaction safety without deleting posted transactions or resetting the database.

### R5. Bulk Posting, Dashboard KPIs & Reporting Infrastructure
Implement a safe bulk posting feature ("Post All Submitted Vouchers") that pre-validates selected vouchers, executes each voucher within an independent atomic transaction, prevents cross-voucher failure corruption, and returns a detailed success/failure summary. Build a SAP Business One-inspired settlement dashboard featuring KPIs calculated strictly from posted records (unposted/submitted vouchers must not contribute to posted collection/disbursement totals) and a compact voucher grid with contextual actions. Fully implement all 20 settlement reports specified in the request (registers, ledgers, allocation reports, advances, bank reconciliation, collections, cash flow, posting, reversals, aging) with date, party, branch, account, payment method, and status filters, along with Excel, PDF, and print export capabilities.

## Acceptance Criteria

### Workflow & Permissions
- [ ] No approval workflows, maker-checker checks, approver assignments, approval bands, or approval queues exist in the Cash, Bank & Party Settlement module.
- [ ] Authorized users can create, validate, submit, post, and cancel vouchers directly based on RBAC permissions.
- [ ] Voucher statuses strictly follow Draft, Submitted, Posted, Cancelled, and Reversed, where Submitted vouchers display Post Now, Edit, View, and Cancel actions.

### Receipts, Payments & Allocations
- [ ] Customer receipts and supplier payments allocate against outstanding invoices/bills with full support for 1:1, 1:many, and many:1 allocations.
- [ ] Partial settlements, full settlements, and unallocated amounts (recorded as advances) operate correctly without discarding funds.
- [ ] Allocations exceeding receipt amounts, outstanding invoice balances, or applied against draft/cancelled/unposted invoices are rejected with specific validation errors.
- [ ] Bulk posting executes each submitted voucher in an isolated atomic transaction, reporting counts and amounts for successes and failures without corrupting any transaction.

### Double-Entry Accounting & Ledgers
- [ ] Every posted voucher atomically generates balanced General Ledger journal entries using the configured Chart of Accounts with zero hardcoded GL accounts.
- [ ] Customer subledgers strictly reconcile with Accounts Receivable GL control accounts across invoices, receipts, advances, and credit notes.
- [ ] Supplier subledgers strictly reconcile with Accounts Payable GL control accounts across bills, payments, advances, and credit notes.
- [ ] Posted vouchers are immutable and cannot be edited directly; corrections can only occur via authorized reversal transactions.
- [ ] Bank reconciliation accurately computes differences against statement opening/closing balances and properly records bank charges and interest as classified accounting entries.

### Audit, Data Integrity & Numbers
- [ ] The six existing submitted receipt vouchers (ISB--RC-FY2026-27-000001 through 000006) and Palmpay Limited invoice allocations are audited against database records, and findings are documented without unauthorized automatic posting.
- [ ] New voucher numbers are generated using the single-hyphen format (`ISB-RC-...`, `ISB-PV-...`), are branch/financial-year specific, concurrency-safe, and do not rename or alter existing historical records.
- [ ] All database changes preserve existing historical ERP data, avoid schema duplication, and ensure decimal precision for financial values.

### Dashboard & Reporting
- [ ] Dashboard KPIs reflect only posted transactions; submitted vouchers do not contribute to posted totals.
- [ ] Voucher grid provides fast search, party filtering, compact layout, and actions (View, Edit Draft, Post Now, Print, PDF, Reverse).
- [ ] All 20 settlement reports support multi-criteria filtering (date, party, branch, account, payment method, status) and Excel, PDF, and print exports.
- [ ] Automated integration tests covering receipts, payments, advances, transfers, reversals, allocations, and GL balancing pass using the existing Vitest and Prisma test setup, and the production build completes successfully.

## Verification Resources
- Use the existing Vitest test runner (`vitest.config.mts`) and Prisma database infrastructure to author and run automated integration and regression test suites covering the 28 required scenarios.
