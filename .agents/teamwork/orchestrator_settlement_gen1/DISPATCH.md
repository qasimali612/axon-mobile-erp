## 2026-11-16T08:18:24Z
You are the Project Orchestrator (Generation 1) for the Axon Mobile ERP Cash, Bank & Party Settlement module audit and development.

Your working directory is:
`d:\Inventory Managment Software\.agents\teamwork\orchestrator_settlement_gen1`

Parent Conversation ID: `aa8b0b28-a7c3-4909-be89-479e19e1c527`

### Read Authoritative State First
Before dispatching or executing anything, carefully read:
1. `d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md` (Verbatim user task prompt)
2. `d:\Inventory Managment Software\.agents\teamwork\orchestrator_settlement\handoff.md` (State dump from Gen 0)
3. `d:\Inventory Managment Software\.agents\teamwork\orchestrator_settlement\PROJECT.md` (Master Project Architecture & Scope)
4. `d:\Inventory Managment Software\.agents\teamwork\orchestrator_settlement\GATE_STATUS.md`
5. `d:\Inventory Managment Software\.agents\teamwork\orchestrator_settlement\HISTORICAL_VOUCHER_AUDIT.md`
6. `d:\Inventory Managment Software\.agents\teamwork\orchestrator_settlement\TEST_INFRA.md` & `TEST_READY.md`
7. `d:\Inventory Managment Software\.agents\teamwork\teamwork_worker_m2\handoff.md` & `d:\Inventory Managment Software\.agents\teamwork\teamwork_auditor_m2\handoff.md`

### Current Status & Concrete Next Steps
Gen 0 completed Phase 0 survey, authored 76/76 passing E2E tests (`settlement-e2e.test.ts`), completed & certified Milestone 1 (numbering & audit), and completed Milestone 2 implementation (Worker M2 26/26 passing tests; Auditor M2 verdict: CLEAN).

You must resume execution directly from Section 5 of `orchestrator_settlement/handoff.md`:
1. **Finalize Milestone 2 Gate**:
   - Dispatch `teamwork_reviewer` to review Milestone 2 code changes (`src/lib/operations/payments.ts`, `src/app/api/payments/[id]/*`, `src/__tests__/settlement/lifecycle.test.ts`).
   - If desired, dispatch `teamwork_challenger`.
   - Update `GATE_STATUS.md` and mark Milestone 2 as DONE in `PROJECT.md`.
2. **Execute Milestone 3: Allocation Engine, Advances & Payment Methods**:
   - Dispatch `teamwork_worker`. Implement multi-invoice allocation (1:1, 1:many, many:1), partial/full settlements, outstanding balance calculation, unallocated surplus funds as advances (`salesInvoiceId: null`), validation against over-allocation or draft invoices, and payment instrument support. Unit tests in `src/__tests__/settlement/allocations.test.ts`. Run Gate (Reviewer/Auditor).
3. **Execute Milestone 4: Dynamic GL & Bank Reconciliation**:
   - Dynamic COA lookups (zero hardcoded account IDs), atomic balanced GL entries for all voucher types, AR/AP subledger reconciliation, Bank Reconciliation module (statement import, differences, auto-match, bank charges/interest entries). Run Gate.
4. **Execute Milestone 5: Bulk Posting & 20 Settlement Reports**:
   - Safe bulk posting (`/api/payments/batch-post`) with per-voucher isolated atomic transactions. 20 settlement reports with multi-criteria filters and Excel/PDF/print exports. Run Gate.
5. **Execute Milestone 6: SAP Business One Settlement Dashboard & Voucher Grid UI**:
   - Overhaul dashboard with server-side KPIs calculated strictly from `POSTED` records. Compact voucher grid with fast party search and contextual actions. Run Gate.
6. **Execute Milestone 7: Final Acceptance & Adversarial Hardening**:
   - Run complete 76-scenario E2E test suite (`npx vitest run src/__tests__/settlement/settlement-e2e.test.ts`). Run Tier 5 adversarial tests.
   - Run full production build (`npm run build`).
7. **Report Completion**:
   - When all milestones pass gate review and build succeeds, deliver your final report and handoff to parent (`aa8b0b28-a7c3-4909-be89-479e19e1c527`).
