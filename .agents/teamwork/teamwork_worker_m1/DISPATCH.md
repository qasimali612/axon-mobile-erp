## 2026-11-10T12:31:57Z

You are teamwork_worker for Milestone 1: Voucher Sequence Numbering, Prisma Guards & Historical Voucher Audit.
Working directory: d:\Inventory Managment Software\.agents\teamwork\teamwork_worker_m1\

Read these files first:
- d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md
- d:\Inventory Managment Software\.agents\teamwork\orchestrator_settlement\PROJECT.md
- d:\Inventory Managment Software\.agents\teamwork\teamwork_explorer_survey_1\survey_db_audit.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Write Ownership (you exclusively own these files):
- src/lib/operations/payments.ts
- src/lib/operations/accounting.ts
- src/lib/finance/posting.ts
- src/lib/document-sequence.ts
- src/lib/prisma.ts
- src/__tests__/settlement/numbering.test.ts
- d:\Inventory Managment Software\.agents\teamwork\orchestrator_settlement\HISTORICAL_VOUCHER_AUDIT.md

Your tasks:
1. Voucher Sequence Numbering Fix:
   - In src/lib/operations/payments.ts, change supplier payment voucher suffix from "PY" to "PV".
   - In src/lib/operations/accounting.ts, src/lib/finance/posting.ts, and src/lib/document-sequence.ts, sanitize branch prefix by stripping trailing/leading hyphens and non-alphanumeric characters (e.g. `(branch.documentPrefix || "BR").trim().replace(/[^A-Za-z0-9]/g, "")`) so that format is strictly single-hyphen: `${cleanBranch}-${cleanSuffix}-FY${year}-${seq6}` (e.g. `ISB-RC-FY2026-27-000001` and `ISB-PV-FY2026-27-000001`).
   - Verify concurrency safety: sequence generation must use PostgreSQL atomic upsert (`INSERT ... ON CONFLICT (company_id, branch_id, document_type, fiscal_year) DO UPDATE SET last_number = DocumentSequence.last_number + 1 RETURNING last_number`).
   - Historical preservation: Do NOT modify or rename any existing historical voucher numbers in the database.
2. Remove Rogue Deletion in Prisma Guard:
   - In src/lib/prisma.ts (initDbGuards), remove the hardcoded deletion query targeting voucher 'ISB--RC-FY2026-27-000006'.
3. Author Historical Voucher Audit & Safe Correction Plan:
   - Write d:\Inventory Managment Software\.agents\teamwork\orchestrator_settlement\HISTORICAL_VOUCHER_AUDIT.md.
   - Detail the six submitted vouchers (ISB--RC-FY2026-27-000001..6), invoice ISB--SI-FY2026-27-000008 (Palmpay Limited), why they were blocked (unposted invoice, legacy maker-checker), why duplicate allocations appeared (unposted payments omitted from settled totals during draft creation), and outline a safe correction plan without automatic posting or deleting records.
4. Author unit test:
   - Author src/__tests__/settlement/numbering.test.ts testing single-hyphen formatting, branch prefix sanitization, RC/PV suffixes, and concurrency handling.
5. Verification:
   - Run vitest on the new test file (`npx vitest run src/__tests__/settlement/numbering.test.ts`) and full test suite (`npm test`).
   - Ensure build passes and document all commands and passing outputs in your handoff.md.
6. Deliver handoff.md in your working directory and notify the orchestrator via send_message.
