## 2026-11-15T12:24:19Z

Read the authoritative user request at:
d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md

Subagent Identity:
- Name: worker_m2
- Role: M2 Schema & Numbering Worker
- Working directory: d:\Inventory Managment Software\.agents\teamwork\worker_m2\

Specification References:
- d:\Inventory Managment Software\PROJECT.md
- d:\Inventory Managment Software\POS_DATABASE_AUDIT.md (Section 3)
- d:\Inventory Managment Software\POS_ACCOUNTING_AUDIT.md (Section 8)

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Tasks for Milestone 2:
1. Update `prisma/schema.prisma` with the complete specification from `POS_DATABASE_AUDIT.md` Section 3:
   - Add `ReceiptPrinterType` enum: `THERMAL_80MM`, `THERMAL_58MM`, `A4`
   - Add `PosShiftStatus` enum: `OPEN`, `CLOSED`
   - Add `PosTerminal` model (id, companyId, branchId, code, name, defaultCashAccountId, receiptPrinterType, isActive, timestamps, relations to Company, Branch, Account, PosShift, SalesInvoice, Payment)
   - Add `PosShift` model (id, companyId, branchId, terminalId, cashierId, status, openedAt, closedAt, openingFloat, closingActualCash, closingExpectedCash, cashDifference, notes, timestamps, relations to Company, Branch, PosTerminal, User, SalesInvoice, Payment)
   - Add required opposite relations on existing models:
     - `Company`: `posTerminals PosTerminal[]`, `posShifts PosShift[]`
     - `Branch`: `posTerminals PosTerminal[]`, `posShifts PosShift[]`
     - `Account`: `terminalCashAccounts PosTerminal[] @relation("TerminalDefaultCashAccount")`
     - `User`: `cashierShifts PosShift[] @relation("CashierShifts")`
   - Add optional foreign keys and relations on `SalesInvoice` and `Payment`:
     - `terminalId String? @db.Uuid`, `shiftId String? @db.Uuid` with relations to `PosTerminal` and `PosShift`.
2. Validate schema: `npx prisma validate`.
3. Generate Prisma client: `npx prisma generate`.
4. Apply migration cleanly to local PostgreSQL (e.g. `npx prisma migrate dev --name pos_terminal_shift` or SQL migration) ensuring ZERO data loss and ZERO modification of historical records.
5. In `src/lib/document-sequence.ts` and `src/lib/operations/accounting.ts`:
   - Verify single-hyphen sequence formatting `ISB-SI-FY2026-27-000001` with regex `^[A-Z0-9]+-[A-Z0-9]+-FY[0-9]{4}-[0-9]{2}-[0-9]{6}$`.
   - Ensure leading/trailing hyphens are stripped during prefix concatenation.
   - Strictly preserve historical document numbers (e.g. `ISB--SI-FY2026-27-000004`, `ISB--RC-FY2026-27-000001` through `000006`).
6. Run verification checks:
   - `npm run typecheck` (MUST exit with code 0)
   - `npm test` (MUST pass 100% across all 12 test files / 166 tests)
7. Write your progress to `d:\Inventory Managment Software\.agents\teamwork\worker_m2\progress.md`.
8. Write your handoff report to `d:\Inventory Managment Software\.agents\teamwork\worker_m2\handoff.md` and notify orchestrator via send_message.

## 2026-11-15T12:34:51Z

**Context**: Milestone 2 Progress & Status Check
**Content**: Heartbeat and safety check. What is your current status on adding `PosTerminal` and `PosShift` to `prisma/schema.prisma` and running the migration?
**Action**: Please update your progress.md and report current status.

## 2026-11-15T12:45:42Z

**Context**: Milestone 2 Schema & Numbering Liveness Check
**Content**: Heartbeat check. Are you currently applying the changes to `prisma/schema.prisma`? If you encountered any errors or need any adjustments, please report your current state.
**Action**: Please update progress.md and respond with current status.
## 2026-11-15T12:59:01Z

**Context**: Milestone 2 Schema & Numbering Completion Check
**Content**: Heartbeat check. Have you completed step 22 (npm run typecheck) and are you assembling `handoff.md`?
**Action**: Please deliver your handoff report and notify orchestrator.
