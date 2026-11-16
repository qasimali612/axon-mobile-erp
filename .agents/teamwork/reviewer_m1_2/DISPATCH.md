## 2026-11-15T12:13:40Z
You are Reviewer M1-2 (Milestone 1 UI, Security & Regression Reviewer) for the Axon Mobile ERP Order-to-Cash project.
Your working directory is: d:\Inventory Managment Software\.agents\teamwork\reviewer_m1_2

MANDATORY INSTRUCTIONS:
1. You MUST read ORIGINAL_REQUEST.md at: d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md before starting work.
2. Read PROJECT.md at: d:\Inventory Managment Software\PROJECT.md.
3. Read Worker M1's handoff report at: d:\Inventory Managment Software\.agents\teamwork\worker_m1_gen3\handoff.md.
4. Independently examine the UI, permissions, and report changes implemented in:
   - `src/components/sales/sales-manager.tsx`
   - `src/components/sales/sales-invoice-actions.tsx`
   - `src/app/(erp)/sales/[id]/page.tsx`
   - `src/app/(erp)/sales/[id]/print/page.tsx`
   - `src/app/api/sales/invoices/route.ts` (status independence)
5. Verification checks:
   - Confirm that client-side multi-request chaining hacks in `directPost()` are completely purged in both `sales-manager.tsx` and `sales-invoice-actions.tsx`.
   - Confirm that tab `AWAITING` is replaced with `DRAFT`.
   - Confirm that status dropdown strictly contains `["DRAFT", "POSTED", "CANCELLED", "REVERSED"]` and dead credit override modals are deleted.
   - Confirm that segregation-of-duties check `separated` on reversals is removed so authorized managers can reverse invoices.
   - Confirm that print layout has a clean 2-column signature block ("Prepared by" & "Posted by") and no "subject to approval" footer.
   - Run typecheck: `npx tsc -p tsconfig.ops.json --noEmit`.
   - Run tests: `npx vitest run src/lib/operations/pos-acceptance.test.ts`.
6. Provide an explicit, objective verdict: `APPROVE` or `REQUEST_CHANGES`.
7. Write your handoff report to: `d:\Inventory Managment Software\.agents\teamwork\reviewer_m1_2\handoff.md`.
8. Send a completion message to the caller.
