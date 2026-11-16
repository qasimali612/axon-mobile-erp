# BRIEFING — 2026-11-16T08:29:00Z

## Mission
Implement Milestone 3: Allocation Engine, Advances & Payment Methods (lookups outstanding calculation, multi-allocation & advances, payment methods, validation, and test suite).

## 🔒 My Identity
- Archetype: teamwork_worker
- Roles: implementer, qa, specialist
- Working directory: d:\Inventory Managment Software\.agents\teamwork\teamwork_worker_m3
- Original parent: 111e024c-58b9-4873-b157-c2ff9db3ac0b
- Milestone: Milestone 3: Allocation Engine, Advances & Payment Methods

## 🔒 Key Constraints
- Minimal change principle: only modify what is necessary.
- Genuine implementation: no hardcoding, no facades, no circumventing.
- Reject duplicate allocations in draft schema and validateAllocations.
- Reject allocations to unposted/draft/cancelled invoices.
- Reject allocations exceeding document outstanding amount.
- Reject allocations exceeding total voucher amount.
- Surplus funds must be recorded as explicit Customer/Supplier Advance (salesInvoiceId: null) and credit Advance liability so zero funds are discarded. Support pure advance vouchers.
- Support payment methods: Cash, Bank Transfer, Cheque, Card with instrument metadata.
- Author comprehensive unit & integration tests in `src/__tests__/settlement/allocations.test.ts`.
- Verify vitest tests and typechecks pass.

## Current Parent
- Conversation ID: 111e024c-58b9-4873-b157-c2ff9db3ac0b
- Updated: not yet

## Task Summary
- **What to build**: Lookups calculation of outstandingAmount, allocation engine & validation (1:1, 1:many, many:1, partial, surplus advance, pure advance, validation rules), payment methods, and test suite.
- **Success criteria**: All tests pass, typechecks pass, zero regression on existing tests.
- **Interface contracts**: PROJECT.md
- **Code layout**: PROJECT.md

## Key Decisions Made
- Initializing briefing and progress tracking.

## Artifact Index
- DISPATCH.md — Worker assignment instructions
- BRIEFING.md — Working memory and status tracker
- progress.md — Heartbeat and step progress

## Change Tracker
- **Files modified**: None yet
- **Build status**: Untested
- **Pending issues**: None

## Quality Status
- **Build/test result**: Untested
- **Lint status**: Clean
- **Tests added/modified**: None yet

## Loaded Skills
None
