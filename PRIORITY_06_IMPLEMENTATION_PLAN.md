# AXON MOBILE ERP — PRIORITY 06 IMPLEMENTATION PLAN
## Customer & Supplier Management System

**Project:** AXON MOBILE ERP  
**Company:** Gondal Mobile Center (AXON)  
**Target:** Professional Party Master Management, Profile Dashboards, Subledgers, Aging, Statements, and Credit Controls  
**Status:** Approved for Execution  

---

## 1. Objectives & Scope

1. **Party Master Management:**
   - Automatic unique code assignment (`CUST-XXXX`, `SUP-XXXX`).
   - Clean contact info, customer types (`RETAIL`, `WHOLESALE`, `DEALER`, `DISTRIBUTOR`, `CORPORATE`), credit limits, payment terms (days), and opening balances with automated GL synchronization.
   - Quick search and filtering across both customer and supplier registries.

2. **Customer & Supplier Profile Dashboards:**
   - Upgrade `src/app/(erp)/customers/[id]/page.tsx` and `src/app/(erp)/suppliers/[id]/page.tsx` with professional multi-tab interfaces:
     - **Tab 1: Overview:** KPI stat cards (Outstanding, Billed Volume, Available Credit, Advances, Contact Info) + Aging Ribbon.
     - **Tab 2: Invoices / Bills:** Complete document listing with dates, totals, payments, and open balances.
     - **Tab 3: Receipts / Payments:** Payment history with allocations and unallocated amounts.
     - **Tab 4: Account Ledger:** Chronological double-entry running balance subledger table.
     - **Tab 5: Aging & Open Items:** Detailed open invoices/bills by age bucket.
     - **Tab 6: Statement Print:** Direct access to professional printable statement.

3. **Supplier API Enhancement:**
   - Enhance `src/app/api/suppliers/[id]/route.ts` to calculate and return live GL `outstanding` balance.

4. **Aging & Statement Verification:**
   - Verify `src/app/(erp)/finance/subledgers/[kind]/[id]/print/page.tsx` renders running balances, aging summary, bank details, and signature blocks.
   - Verify CSV export and date-range filtering.

5. **Acceptance Testing & Verification:**
   - Create and run `scripts/test_priority_06.mjs` verifying:
     - Profile retrieval and balance calculation.
     - Subledger running balances.
     - Open-item allocation and advance tracking.
     - 100% GL reconciliation to Control Accounts 1100 and 2000.
   - Update governance files (`BUG_REGISTER.md`, `IMPLEMENTATION_LOG.md`, `IMPLEMENTATION_STATUS.md`, `MODULE_COMPLETION_MATRIX.md`, `FINAL_TEST_RESULTS.md`).

---

## 2. Implementation Work Breakdown

| Step | Component | Action | Verification |
| :---: | :--- | :--- | :--- |
| **Phase 1** | API Enhancements | Update `suppliers/[id]/route.ts` with GL balance query | API returns `data.outstanding` |
| **Phase 2** | Customer Profile Dashboard | Replace basic `customers/[id]` with multi-tab dashboard | Overview, Invoices, Receipts, Ledger, Aging tabs operational |
| **Phase 3** | Supplier Profile Dashboard | Replace basic `suppliers/[id]` with multi-tab dashboard | Overview, Bills, Payments, Ledger, Aging tabs operational |
| **Phase 4** | Automated Acceptance Suite | Write `scripts/test_priority_06.mjs` and execute tests | 100% test pass, 0 discrepancies |
| **Phase 5** | Governance & Documentation | Update all governance files and audit reports | Verified and committed |

---
© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
