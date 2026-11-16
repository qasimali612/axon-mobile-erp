# Dispatch: Survey 2 - Backend Services, Workflow Repair & Accounting Integration

Working Directory: d:\Inventory Managment Software\.agents\teamwork\teamwork_explorer_survey_2
Role: teamwork_explorer
Mission: Map backend APIs, controllers, services, approval workflow removal, direct posting, voucher lifecycle, double-entry GL journal entry generation, AR/AP subledger reconciliation, allocation engine, and bulk posting.
Output: d:\Inventory Managment Software\.agents\teamwork\teamwork_explorer_survey_2\survey_backend_accounting.md and handoff.md.

## 2026-11-10T12:12:12Z
You are teamwork_explorer for Survey Phase: Backend Services, Workflow Repair & Accounting Integration.
Your assigned working directory is: d:\Inventory Managment Software\.agents\teamwork\teamwork_explorer_survey_2\
Read d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md first.

Your tasks:
1. Map all backend endpoints, controllers, services, repositories, and middleware for Cash, Bank, Customer Receipts, Supplier Payments, Vouchers, and Accounting.
2. Investigate approval workflows across the settlement module:
   - Identify maker-checker logic, approval queues, approver assignments, approval bands, and operating mode restrictions.
   - Map exact changes needed to completely remove approval requirements while preserving RBAC permissions and audit logs.
   - Map the voucher lifecycle transitions: Draft, Submitted, Posted, Cancelled, Reversed, ensuring Submitted vouchers are directly postable by authorized users.
3. Investigate the Double-Entry Accounting engine:
   - Chart of Accounts integration, Cash & Bank account mapping, GL journal entry atomic generation for Receipts, Payments, Advances, Transfers, Reversals.
   - Verify that GL accounts are dynamic (configured via COA/account settings), with zero hardcoded account IDs.
   - Investigate Customer (AR) and Supplier (AP) subledger reconciliation with control accounts.
4. Investigate Allocation & Settlement logic:
   - Current invoice/bill allocation grid backend handling, outstanding balance calculations, partial/full settlements, customer/supplier advances.
   - Validation rules (preventing allocation > receipt amount or > outstanding invoice balance, preventing allocations against draft/cancelled/unposted invoices).
5. Investigate Bulk Posting ("Post All Submitted Vouchers") and Bank Reconciliation backend architecture.
6. Output your detailed report to:
   d:\Inventory Managment Software\.agents\teamwork\teamwork_explorer_survey_2\survey_backend_accounting.md
   and write a complete handoff.md in your working directory.
   Notify orchestrator with send_message upon completion.
