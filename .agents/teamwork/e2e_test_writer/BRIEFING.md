# BRIEFING — 2026-11-10T12:22:30Z

## Mission
Implement a comprehensive opaque-box automated test suite covering all 20 Order-to-Cash (Sales Invoice) testing requirements for Axon Mobile ERP, verify execution via Vitest, document in TEST_READY.md and handoff.md, and notify caller.

## 🔒 My Identity
- Archetype: specialist, qa (Test Writer)
- Roles: specialist, qa
- Working directory: d:\Inventory Managment Software\.agents\teamwork\e2e_test_writer
- Original parent: 801c1388-1cc8-4ee1-9f96-99c33e953b3a
- Milestone: Order-to-Cash Test Suite Creation

## 🔒 Key Constraints
- Test code only — never modify implementation code. Escalate implementation bugs.
- Strict opaque-box testing covering all 20 specified requirements.
- Must read ORIGINAL_REQUEST.md, TEST_INFRA.md, and PROJECT.md first.
- Structure tests under `src/tests/e2e/sales-invoices-e2e.test.ts` (or appropriate Vitest suite).
- Output TEST_READY.md matching TEST_INFRA.md template upon test suite completion.
- Write handoff.md with 5 components and update progress.md.

## Current Parent
- Conversation ID: 801c1388-1cc8-4ee1-9f96-99c33e953b3a
- Updated: 2026-11-10T12:22:30Z

## Task Summary
- **What to build**: Comprehensive automated test suite in `src/tests/e2e/sales-invoices-e2e.test.ts` verifying all 20 Order-to-Cash requirements: Draft invoice isolation, IMEI mapping, duplicate/concurrent protection, COGS & GL journal balancing, server-side tax snapshotting, AR debit posting, payments & multi-invoice allocation, overdue calculation, returns & credit notes, transaction reversal, immutable audit logging, dashboard totals reconciliation, subledger vs GL reconciliation, and posting idempotency.
- **Success criteria**: All 20 test requirements covered with clear assertions, tests execute cleanly via Vitest, test results documented in TEST_READY.md and handoff.md.
- **Interface contracts**: PROJECT.md, TEST_INFRA.md, ORIGINAL_REQUEST.md
- **Code layout**: src/tests/e2e/

## Loaded Skills
- None specified in dispatch.

## Quality Status
- **Build/test result**: Pending execution.
- **Lint status**: Pending.
- **Tests added/modified**: Pending.

## Key Decisions Made
- [2026-11-10T12:22:30Z] Initialized test writer workspace.

## Artifact Index
- `d:\Inventory Managment Software\.agents\teamwork\e2e_test_writer\DISPATCH.md` — Dispatch record.
- `d:\Inventory Managment Software\.agents\teamwork\e2e_test_writer\BRIEFING.md` — Situational awareness state.
- `d:\Inventory Managment Software\.agents\teamwork\e2e_test_writer\progress.md` — Liveness & progress tracker.

