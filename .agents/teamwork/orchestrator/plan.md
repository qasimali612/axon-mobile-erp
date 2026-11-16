# Orchestration Plan: Cash, Bank & Party Settlement Module

## Mission
Deliver a comprehensive, audited, reliable double-entry accounting system for customer receipts, supplier payments, cash, bank, and party settlements in Axon Mobile ERP without approval workflows, meeting all requirements R1 through R5 and 28 required test scenarios.

## Execution Strategy
Pattern: Project Pattern with Dual Track (Implementation Track + E2E Testing Track).

### Phase 0: Survey & Scope Mapping (Current Phase)
- Dispatch 3 parallel Explorers:
  1. `explorer_survey_backend_settlement`: Deep dive into Prisma schema, DB models (Voucher, JournalEntry, Account, Invoice, Bill, PartyAllocation, Sequence), current payment/receipt APIs, GL posting logic, and audit of the six existing vouchers (ISB--RC-FY2026-27-000001 through 000006) and Palmpay invoice ISB--SI-FY2026-27-000008.
  2. `explorer_survey_frontend_settlement`: Audit UI components for customer receipts, supplier payments, settlement dashboard, voucher grid, bulk posting UI, and all 20 required financial reports and export formats (Excel, PDF, print).
  3. `spec_miner_survey_settlement`: Map functional requirements (R1-R5), eliminate maker-checker/approval logic, define voucher status machine (Draft, Submitted, Posted, Cancelled, Reversed), define double-entry rules, bank reconciliation specs, and Vitest test runner setup for the 28 required scenarios.
- Merge survey findings into `PROJECT.md` (Architecture, Feature Inventory, Milestones, Interface Contracts, Code Layout).

### Phase 1: Dual Track Decomposition & Dispatch
- Implementation Track:
  - Sub-Orchestrator M1: Workflow Repair & Direct Posting (R1)
  - Sub-Orchestrator M2: Receipts, Payments & Party Allocation Engine (R2)
  - Sub-Orchestrator M3: Cash & Bank Accounts, Double-Entry GL Posting & Bank Reconciliation (R3)
  - Sub-Orchestrator M4: Historical Voucher Audit, Data Integrity & Numbering Series (R4)
  - Sub-Orchestrator M5: Bulk Posting, Settlement Dashboard & 20 Reports (R5)
- E2E Testing Track:
  - E2E Testing Orchestrator: Author and verify the comprehensive Vitest test suite covering Tiers 1-4 across all 28 scenarios; publish `TEST_READY.md`.

### Phase 2: Final Milestone & Adversarial Hardening
- Final Milestone Sub-Orchestrator:
  - Phase 1: 100% pass of E2E test suite (Tiers 1-4).
  - Phase 2: Adversarial coverage hardening with Challengers (Tier 5).
  - Forensic integrity audit (zero cheating tolerance).

### Phase 3: Synthesis & Verification
- Compile audit reports, test execution results, and deliver full structured handoff.
