## 2026-11-15T12:00:52Z
You are Worker M1 Gen 3 (replacing predecessor who encountered quota exhaustion) for Milestone 1 of the Axon Mobile ERP Order-to-Cash project.
Your working directory is: d:\Inventory Managment Software\.agents\teamwork\worker_m1_gen3

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY INSTRUCTIONS:
1. You MUST read ORIGINAL_REQUEST.md at: d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md before starting work.
2. Read PROJECT.md at: d:\Inventory Managment Software\PROJECT.md.
3. Read the detailed explorer specifications:
   - Backend Explorer: d:\Inventory Managment Software\.agents\teamwork\explorer_m1_1\handoff.md
   - UI Explorer: d:\Inventory Managment Software\.agents\teamwork\explorer_m1_2\handoff.md
   - Historical Records Explorer: d:\Inventory Managment Software\.agents\teamwork\explorer_m1_3\handoff.md
4. Your exclusive write ownership is strictly restricted to these 11 files:
   - `src/lib/operations/sales.ts`
   - `src/app/api/sales/invoices/[id]/post/route.ts`
   - `src/app/api/sales/invoices/[id]/approve/route.ts`
   - `src/app/api/sales/invoices/[id]/submit/route.ts`
   - `src/app/api/approvals/route.ts`
   - `src/app/api/sales/invoices/route.ts`
   - `src/app/api/sales/invoices/batch-post/route.ts`
   - `src/components/sales/sales-manager.tsx`
   - `src/components/sales/sales-invoice-actions.tsx`
   - `src/app/(erp)/sales/[id]/page.tsx`
   - `src/app/(erp)/sales/[id]/print/page.tsx`
5. Implementation & Verification:
   - Inspect the current state of each of these 11 files. Predecessor `worker_m1` already started applying edits to `sales.ts`, `sales-manager.tsx`, and `route.ts`.
   - Verify and complete all remaining edits per explorer handoff specifications:
     * `sales.ts`: Clean imports; direct posting from DRAFT/SUBMITTED/APPROVED to POSTED without intermediate status flip or segregation-of-duties; discount cap and credit limit checked directly; deprecate submitSalesInvoice and approveSalesInvoice.
     * `post/route.ts`: Support overrideReason.
     * `approve/route.ts` & `submit/route.ts`: Forward safely to postSalesInvoice with deprecation notice.
     * `approvals/route.ts`: Prune SALES_INVOICE from action schema, query array, mapped items, and switch cases.
     * `sales/invoices/route.ts`: Auto-post calls postSalesInvoice directly; line 172 fixes paymentStatus independence.
     * `batch-post/route.ts`: Remove unused approval imports.
     * `sales-manager.tsx`: Remove client-side auto-approval hack; replace AWAITING tab with DRAFT tab; clean status dropdown; delete dead modal creditOverrideTarget.
     * `sales-invoice-actions.tsx`: Remove client-side hack; remove approvedById from Props; delete dead approval modal.
     * `sales/[id]/page.tsx`: Remove `separated` check on reversals; remove Approved by from timeline.
     * `sales/[id]/print/page.tsx`: 2-column signature block; clean draft footer without approval text.
   - Run typecheck: `npx tsc --noEmit`. Fix any compilation issues in your owned files.
   - Run vitest: `npx vitest run`. Ensure all test suites pass.
   - Document all verification commands and verbatim outputs in your handoff report.
6. Write your handoff report to: `d:\Inventory Managment Software\.agents\teamwork\worker_m1_gen3\handoff.md`.
7. Send a completion message to the caller.

## 2026-11-15T12:11:37Z
**Context**: Milestone 1 Implementation & Test Verification
**Content**: Checking on your progress across the 11 target files, typecheck, and vitest runs.
**Action**: Please update your progress.md and continue finalizing your handoff.md report.
