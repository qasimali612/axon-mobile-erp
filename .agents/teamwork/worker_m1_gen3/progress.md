# Progress Tracker — Milestone 1 (Order-to-Cash)

Last visited: 2026-11-15T12:12:00Z

## Phase 1: Investigation & Context Recovery
- [x] Read ORIGINAL_REQUEST.md and PROJECT.md
- [x] Read Explorer handoffs (backend, UI, historical records)
- [x] Inspect predecessor worker_m1 artifacts and current state of 11 owned files

## Phase 2: Implementation & Verification Across 11 Owned Files
- [x] 1. `src/lib/operations/sales.ts`
  - Cleaned imports, removed `assertApprovalPolicy`, `assertMakerChecker`, `assertSegregationOfDuties`.
  - Deprecated `submitSalesInvoice` and `approveSalesInvoice` to forward to `postSalesInvoice`.
  - Direct posting in `postSalesInvoice` from DRAFT/SUBMITTED/historical APPROVED to POSTED without intermediate status flip.
  - Direct discount cap check and credit limit validation with override auditing.
  - Fixed `tx as any` to `tx` in `ensureSingleUserDatabase(tx)`.
- [x] 2. `src/app/api/sales/invoices/[id]/post/route.ts`
  - Supports `overrideReason` from request body and forwards to `postSalesInvoice`.
- [x] 3. `src/app/api/sales/invoices/[id]/approve/route.ts`
  - Forwarded safely to `postSalesInvoice` with deprecation notice and `overrideReason`.
- [x] 4. `src/app/api/sales/invoices/[id]/submit/route.ts`
  - Forwarded safely to `postSalesInvoice` with deprecation notice and `overrideReason`.
- [x] 5. `src/app/api/approvals/route.ts`
  - Pruned `SALES_INVOICE` from action schema enum, query array, items mapper, and switch cases. Set `sales: 0`.
  - Removed unused `request` argument in `GET()`.
- [x] 6. `src/app/api/sales/invoices/route.ts`
  - Cleaned imports to only `createSalesInvoiceDraft` and `postSalesInvoice`.
  - Status independence: Line 172 uses `invoicePaymentStatus(...)` independently of `isPosted`.
  - Auto-post directly invokes `postSalesInvoice(actor, invoice.id)`.
- [x] 7. `src/app/api/sales/invoices/batch-post/route.ts`
  - Pruned unused approval imports, posts directly via `postSalesInvoice`.
- [x] 8. `src/components/sales/sales-manager.tsx`
  - Removed client-side auto-approval chaining hack.
  - Replaced `AWAITING` tab with `DRAFT` tab (`Draft Invoices`).
  - Cleaned status dropdown to `["DRAFT", "POSTED", "CANCELLED", "REVERSED"]`.
  - Deleted dead credit override modal and dead state.
  - Cleaned unused icon imports and unused destructured variables.
- [x] 9. `src/components/sales/sales-invoice-actions.tsx`
  - Removed client-side multi-step hack.
  - Removed `approvedById` from `Props`.
  - Deleted dead approval modal and dead state.
  - Removed unused eslint-disable directive.
- [x] 10. `src/app/(erp)/sales/[id]/page.tsx`
  - Removed `separated` segregation-of-duties check on reversals.
  - Removed `approvedById` passed to actions component.
  - Simplified edit condition to `status === DRAFT`.
  - Removed "Approved by" from audit timeline.
- [x] 11. `src/app/(erp)/sales/[id]/print/page.tsx`
  - Removed `approvedBy` from query include.
  - Converted signature section to 2-column layout (Prepared by, Posted by).
  - Clean draft footer without approval text.

## Phase 3: Verification & Quality Assurance
- [x] TypeScript compilation checked:
  - All 11 owned files have ZERO type errors.
  - `tsconfig.ops.json` passed with exit code 0.
- [x] ESLint checked:
  - Ran `npx eslint` across all 11 owned files: exited with code 0, 0 errors, 0 warnings.
- [x] Vitest acceptance tests:
  - `src/lib/operations/pos-acceptance.test.ts`: 103 passed tests (100% pass).
  - `src/lib/operations/validation.test.ts` & `src/lib/finance/money.test.ts`: 10 passed tests.
  - `src/lib/operating-mode.test.ts`, `src/lib/password-policy.test.ts`, `src/lib/imei.test.ts`: 8 passed tests.
  - `src/__tests__/settlement/numbering.test.ts`, `src/lib/finance/banking-validation.test.ts`, `src/lib/finance/asset-validation.test.ts`, `src/lib/catalog/pricing-validation.test.ts`: 61 passed tests.
- [ ] Write `handoff.md`
- [ ] Notify caller via `send_message`
