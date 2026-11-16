# Operational Plan: Cash, Bank & Party Settlement Module Overhaul

## Objective
Deliver a production-grade, double-entry accounting system for Customer Receipts, Supplier Payments, Cash, Bank, and Party Settlements in Axon Mobile ERP without approval workflows, satisfying all requirements R1-R5 and acceptance criteria.

## Strategy & Phasing
Following the **Project Pattern**:
1. **Phase 0: Survey & Discovery**
   - Spawn 3 Explorers in parallel to investigate:
     - Explorer 1 (Database & Audit): Prisma schema, voucher numbering logic, sequence tables, existing vouchers (`ISB--RC-FY2026-27-000001` through `000006`), Palmpay Limited receipts and invoice `ISB--SI-FY2026-27-000008`.
     - Explorer 2 (Backend & Accounting): Cash/Bank APIs, controllers, services, journal entry generation, Chart of Accounts, subledgers (AR/AP), direct posting logic, removal of maker-checker/approvals, bulk posting atomic transactions.
     - Explorer 3 (Frontend & Reports): Settlement dashboard, voucher grid, allocation UI, payment method handling, 20 settlement reports (registers, ledgers, aging, etc.), export utilities (Excel/PDF/print).
   - Merge into `PROJECT.md` at workspace root.

2. **Phase 1: Dual Track Execution**
   - **Track A (E2E Testing Track)**:
     - Spawn test writer/orchestrator to design opaque-box test runner and 4-tier test suite based strictly on user requirements in `ORIGINAL_REQUEST.md`.
     - Output: `TEST_INFRA.md` and `TEST_READY.md`.
   - **Track B (Implementation Track)**:
     - M1: Data Model, Concurrency-Safe Voucher Numbering (`ISB-RC-...`, `ISB-PV-...`), Audit of Existing Vouchers.
     - M2: Elimination of Approval Workflows, Direct Posting Engine, Voucher Lifecycle (Draft, Submitted, Posted, Cancelled, Reversed).
     - M3: Customer Receipts, Supplier Payments, 1:1/1:N/N:1 Allocations, Advances, Strict Validations.
     - M4: Cash & Bank Accounts Management, Balanced Double-Entry GL Journals, AR/AP Subledger Reconciliation, Bank Reconciliation.
     - M5: Bulk Posting ("Post All Submitted Vouchers") with isolated transactions & 20 Settlement Reports with filters & exports.
     - M6: SAP Business One-inspired Settlement Dashboard & Compact Voucher Grid UI.

3. **Phase 2: Final Milestone & Hardening**
   - Final Milestone Phase 1: 100% E2E test suite pass (Tiers 1-4).
   - Final Milestone Phase 2: Adversarial Coverage Hardening (Tier 5) with Challengers.
   - Comprehensive Forensic Audit (`teamwork_auditor`) verifying zero cheating/mocking.

4. **Phase 3: Final Delivery**
   - Document all verification results, audit findings, test outputs.
   - Final handoff to parent.
