## 2026-11-09T18:18:52Z
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
Implement a safe bulk posting feature ("Post All Submitted Vouchers") that pre-validates selected vouchers, executes each voucher within an independent atomic transaction, prevents cross-voucher failure corruption, and returns a detailed success/failure summary. Build a SAP Business One-inspired settlement dashboard featuring KPIs calculated strictly from posted records (unposted/submitted vouchers must not contribute to posted collection/disbursement totals) and a compact voucher grid with contextual actions. Fully implement all 20 settlement reports specified in the request (registers, ledgers, allocation reports, advances, bank reconciliation, collections, cash flow, posting, reversals, aging) with date, party, branch, account, payment method, and status filters, along with Excel, PDF, and print exports.

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


## 2026-11-09T18:13:28Z
Inspect, repair, optimize, and complete the existing Point of Sale (POS) module for Axon Mobile ERP as a high-performance retail counter terminal supporting dual-SIM IMEI handsets and quantity-based accessories and spare parts. Deliver an approval-free direct posting workflow with atomic inventory deduction, balanced accounting entries, multi-tender payments, shift management, receipts, and reporting while strictly preserving historical database records.

Working directory: d:\Inventory Managment Software
Integrity mode: development

### Requirements

#### R1. Comprehensive POS Audit and Repair
Inspect the complete existing POS implementation across UI, routing, database schema, scanner lookup, inventory ledger, pricing, taxes, payments, accounting journals, and permissions. Identify working, broken, missing, and duplicate functionality, as well as database and accounting risks, and document them in dedicated audit markdown reports (`POS_SYSTEM_AUDIT.md`, `POS_DATABASE_AUDIT.md`, `POS_API_AUDIT.md`, `POS_ACCOUNTING_AUDIT.md`, `POS_INVENTORY_AUDIT.md`, `POS_UI_UX_AUDIT.md`, `POS_MISSING_FEATURES.md`, `POS_IMPLEMENTATION_PLAN.md`, `POS_TEST_REPORT.md`) before modifying existing architecture.

#### R2. Counter Terminal Interface and Barcode Scanner Engine
Redesign the POS screen as a high-performance retail counter terminal optimized for desktop, touchscreen, keyboard shortcuts (F2 Catalog, F3 Scanner, F4 Customer, F6 Salesperson, F8 Clear Cart, F9 Park Draft, F10 Tender, Ctrl+Enter Quick Tender, Esc Close Dialog), and barcode scanners without decorative clutter or multi-step popups. Provide a prominent auto-focusing scanner input supporting Enter/Tab suffixes that resolves both IMEI1 and IMEI2 to the same single physical handset, verifies warehouse custody and availability, and auto-adds valid handsets or quantity-based items without duplicates.

#### R3. Dual Inventory Tracking, Pricing, and Multi-Tender Payments
Support two distinct inventory tracking models: individually tracked physical handsets (strictly one unit per device, manual quantity editing prohibited) and quantity-based accessories/spare parts. Support customer-specific and default price lists, line and invoice discounts, configured tax calculations, and flexible tender types including cash, card POS, digital wallets (EasyPaisa, JazzCash, Raast), bank deposits, customer credit accounts with credit limit validation, advance payments, and mixed payments.

#### R4. Direct Atomic Posting, Balanced Accounting, and Document Numbering
Eliminate all approval workflows, approval statuses, queues, and maker-checker restrictions so authorized users can post transactions directly. On sale completion, execute a single atomic, idempotent database transaction that validates all lines, deducts warehouse inventory, updates device custody, computes actual-cost COGS, posts revenue and taxes, records payment receipts/AR, balances GL journals, and assigns sequential numbering in `ISB-SI-FY2026-27-000001` format while preserving historical invoice references.

#### R5. Shift Management, Parked Sales, Returns, Printing, and Reporting
Provide shift and cash drawer tracking (opening cash, sales, cash refunds, expected vs. actual reconciliation), parked cart holding and retrieval without inventory reservation, invoice returns with original item/IMEI traceability and credit reversals, multi-format printing (A4 invoice, 80mm/58mm thermal receipts), and all 15 required POS reports querying real database transactions without altering historical posted records.

### Acceptance Criteria

#### Inventory & Device Custody
- [ ] Scanning either IMEI1 or IMEI2 resolves to the same single physical handset record; duplicate additions of the same handset are rejected.
- [ ] Handset cart quantity is strictly fixed at 1 per physical stock unit; selling two identical models requires two separate available physical units.
- [ ] Handset validation verifies device existence, active availability, warehouse custody, and absence of prior sale postings.
- [ ] Quantity-based accessories and spare parts support manual quantity entry, validate warehouse stock, and prevent negative stock.

#### Counter Workflow & Scanner Engine
- [ ] Scanner input automatically focuses on POS load, clears after valid scan, and immediately refocuses for the next scan.
- [ ] Scanner input handles barcode scanner Enter/Tab suffixes and transitions cleanly through searching, added, duplicate, out-of-stock, and invalid states.
- [ ] Standard retail keyboard shortcuts (F2 Catalog, F3 Scanner, F4 Customer, F6 Salesperson, F8 Clear Cart, F9 Park Draft, F10 Tender, Ctrl+Enter Quick Tender, Esc Close Dialog) function consistently without interfering with inputs.
- [ ] F2 product search allows server-side search by name, SKU, barcode, brand, model, variant, color, or IMEI with branch/warehouse stock filtering.

#### Pricing, Tax & Payment Allocation
- [ ] Financial calculations (prices, line/invoice discounts, taxes, totals) are computed and validated server-side.
- [ ] Line and invoice discounts require authorized permission, cannot exceed line values, and allocate consistently across tax and accounting.
- [ ] Mixed payment methods (cash, card POS, mobile wallets, bank transfer, credit account) can be combined within a single transaction.
- [ ] Advance payments against credit sales allocate to the invoice and calculate the remaining customer receivable without duplicate receipt posting.
- [ ] Customer credit sales validate outstanding balance against credit limits; zero credit limits are not treated as unlimited credit.

#### Direct Atomic Posting & Accounting
- [ ] All approval workflows, approval statuses (`Approved`, `Awaiting Approval`, `Approval Queue`), and maker-checker checks are completely removed from the POS workflow.
- [ ] Sale completion executes within a single atomic database transaction; any failure rolls back all inventory, journal, and document changes.
- [ ] Posting is idempotent; repeated submissions, duplicate clicks, or duplicate requests cannot create double stock deductions or journal entries.
- [ ] COGS entries use configured actual inventory costing and balance in GL (Debit: COGS, Credit: Inventory Asset).
- [ ] Revenue, output tax liability, cash/bank/wallet receipts, and Accounts Receivable entries balance in General Ledger journals and update customer subledgers.
- [ ] Sequential invoice numbering uses single separator format (e.g. `ISB-SI-FY2026-27-000001`) without modifying existing historical invoice references.

#### Shift Management, Parked Sales, Returns & Printing
- [ ] Shift management reconciles opening cash, cash sales, cash refunds, and actual closing cash per terminal/cashier without counting card/digital collections as cash.
- [ ] Parked carts store draft state without deducting stock, reserving IMEIs, or posting accounting entries, and revalidate inventory upon retrieval.
- [ ] Sales returns validate against original posted invoices and sold IMEIs, returning items to correct stock status and reversing accounting via credit notes.
- [ ] Thermal receipt (80mm / 58mm) and A4 invoice print previews generate accurate document details, line totals, IMEIs, and payment breakdowns.
- [ ] All 15 required POS reports query real database transactions with date, branch, warehouse, and salesperson filters.

#### Data Safety & Regression
- [ ] No historical invoice, receipt, stock movement, accounting journal, or database backup is deleted, truncated, or rewritten.
- [ ] TypeScript checks (`npx tsc --noEmit`), linter checks, and existing test suites pass with zero regressions.
