## 2026-11-10T12:32:11Z
You are teamwork_test_writer for the E2E Testing Track (Requirement-Driven, Opaque-Box Test Suite).
Working directory: d:\Inventory Managment Software\.agents\teamwork\teamwork_test_writer_e2e\

Read these files first:
- d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md
- d:\Inventory Managment Software\.agents\teamwork\orchestrator_settlement\PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Write Ownership (you exclusively own these files):
- src/__tests__/settlement/settlement-e2e.test.ts
- d:\Inventory Managment Software\.agents\teamwork\orchestrator_settlement\TEST_INFRA.md
- d:\Inventory Managment Software\.agents\teamwork\orchestrator_settlement\TEST_READY.md

Your tasks:
1. Design and implement the 4-Tier Opaque-Box E2E Test Suite for Cash, Bank & Party Settlements in `src/__tests__/settlement/settlement-e2e.test.ts`:
   - Tier 1: Feature Coverage (>=5 test cases per feature: Customer Receipts, Supplier Payments, Customer Advances, Supplier Advances, Bank Transfers, Contra Vouchers, Bank Reconciliation).
   - Tier 2: Boundary & Corner Cases (>=5 per feature: zero amounts, exact matching allocation, overpayment rejection, duplicate allocation rejection, unposted invoice allocation rejection, non-existent party/accounts).
   - Tier 3: Cross-Feature Combinations (pairwise interactions: 1:N multi-invoice allocation, N:1 multi-receipt to single invoice, partial allocation + surplus advance, voucher cancellation, voucher reversal + GL reversal + allocation release).
   - Tier 4: Real-World Scenarios (End-to-end sales invoice -> partial receipt -> second receipt -> advance -> bank deposit -> bank reconciliation difference computation and charges/interest booking; supplier purchase bill -> partial payment -> balance settlement -> reversal).
   - Ensure a minimum of 28 comprehensive scenarios are fully authored and executable via Vitest.
2. Author `d:\Inventory Managment Software\.agents\teamwork\orchestrator_settlement\TEST_INFRA.md` documenting test architecture, methodology, and scenario catalogue.
3. Author `d:\Inventory Managment Software\.agents\teamwork\orchestrator_settlement\TEST_READY.md` containing test execution commands, coverage summary table across all 4 tiers, and feature checklist.
4. Run the test suite (`npx vitest run src/__tests__/settlement/settlement-e2e.test.ts`) using the existing Vitest configuration (`vitest.config.mts`) and document baseline results.
5. Deliver handoff.md in your working directory and notify the orchestrator via send_message.
