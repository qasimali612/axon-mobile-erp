# Handoff Report: Survey Phase — Backend Services, Workflow Repair & Accounting Integration

**Document Reference:** `handoff.md`  
**Working Directory:** `d:\Inventory Managment Software\.agents\teamwork\teamwork_explorer_survey_2\`  
**Agent:** `teamwork_explorer_survey_2`  
**Parent Conversation ID:** `e8657fcc-1efa-46f3-99d0-8540dc43c347`  
**Timestamp:** `2026-11-10T12:35:00Z`  
**Handoff Type:** Hard (Survey Phase Complete)  

---

## 1. Observation

Direct observations and evidence collected from code inspection and database queries:

1. **Approval Workflow Remnants in Payments**:
   - `src/lib/operations/payments.ts:327–338`:
     ```ts
     if (payment.status === OperationalDocumentStatus.DRAFT || payment.status === OperationalDocumentStatus.SUBMITTED) {
       await tx.payment.update({
         where: { id },
         data: {
           status: OperationalDocumentStatus.APPROVED,
           approvedById: payment.approvedById || actor.userId,
           approvedAt: payment.approvedAt || new Date(),
         },
       });
       payment.status = OperationalDocumentStatus.APPROVED;
       payment.approvedById = payment.approvedById || actor.userId;
     }
     await assertSegregationOfDuties(tx, actor.companyId, actor.userId, payment.preparedById, payment.approvedById, "post this payment", [], true);
     ```
   - `src/lib/operations/payments.ts:341`:
     ```ts
     await assertApprovalPolicy(tx, { actor, documentType: "PAYMENT", amount: payment.amount, entityType: "Payment", entityId: id, reference: payment.paymentNumber });
     ```
   - `src/app/api/payments/route.ts:58–61`:
     ```ts
     await submitPayment(actor, payment.id);
     await approvePayment(actor, payment.id);
     const posted = await postPayment(actor, payment.id);
     ```
   - `src/app/api/approvals/route.ts:103–112`: Payments in `SUBMITTED` status are actively fetched into the governance pending approvals queue.
   - `src/app/api/approvals/route.ts:312`: Contains `case "PAYMENT": result = await approvePayment(actor, parsed.id); break;`.

2. **Missing Lifecycle Actions (Cancel & Reverse)**:
   - In `src/app/api/payments/[id]/`: Directory contains `route.ts`, `submit/route.ts`, `approve/route.ts`, `post/route.ts`. **There is no `cancel/route.ts` and no `reverse/route.ts`**.
   - `src/lib/operations/payments.ts`: Contains `createPaymentDraft`, `updatePaymentDraft`, `submitPayment`, `approvePayment`, `postPayment`, and `deletePayment`. **There is no `cancelPayment` and no `reversePayment` function**.
   - `src/lib/operations/reversals.ts`: Only implements `reversePostedSalesInvoice` and `reversePostedPurchaseReceipt`. No payment reversal logic exists.

3. **Hardcoded GL Account References**:
   - `src/app/api/finance/banking/transfers/route.ts:50`:
     ```ts
     { code: "1000" }
     ```
   - `src/app/api/finance/banking/transfers/route.ts:137, 167`:
     ```ts
     where: { companyId, OR: [{ accountType: "CASH" }, { code: "1000" }] }
     ```
   - `src/lib/finance/cash-in-hand.ts:26`:
     ```ts
     OR: [
       { accountType: "CASH" },
       { code: "1000" },
       { name: { contains: "Cash", mode: "insensitive" } },
     ]
     ```

4. **Allocation Grid Incomplete Data & Validation Flaws**:
   - `src/app/api/operations/lookups/route.ts:40–41`:
     ```ts
     prisma.salesInvoice.findMany({ where: { companyId: context.company.id, status: "POSTED", reversalOfId: null, ...documentScopeWhere }, select: { id: true, branchId: true, customerId: true, invoiceNumber: true, invoiceDate: true, grandTotal: true }, orderBy: { invoiceDate: "desc" }, take: 200 })
     ```
     Does not compute `previouslyPaid` or `outstandingAmount`.
   - `src/lib/operations/validation.ts:262–268`: `paymentDraftSchema` does not refine against duplicate `salesInvoiceId` or `purchaseReceiptId` entries in the `allocations` array.
   - `src/lib/operations/payments.ts:274–282`: `validateAllocations` compares `settled.plus(allocation.amount)` directly against `allocation.salesInvoice.grandTotal` without deducting credit notes / `StockReturn`s.
   - `src/lib/operations/payments.ts:46–55`: `createPaymentDraft` does not call `validateAllocations`; over-allocation is only caught if `postPayment` is invoked.

5. **Bulk Posting & Bank Reconciliation**:
   - `src/app/api/payments/batch-post/route.ts:27`: Queries `status: { in: [DRAFT, SUBMITTED, APPROVED] }` without branch scoping (`allowedBranches`), without pre-validation, and returns only count of posted items without currency amounts.
   - `src/lib/finance/banking.ts:252–300`: Bank reconciliation accurately calculates book balance, outstanding checks/deposits, and difference, but provides no endpoint or service to book bank charges or interest directly from the statement lines.

---

## 2. Logic Chain

1. **Approval Removal**:
   - From Observation 1, `postPayment` currently forces `status = APPROVED`, invokes `assertSegregationOfDuties`, and calls `assertApprovalPolicy`. Auto-post in `payments/route.ts` calls `approvePayment`.
   - Furthermore, `approvals/route.ts` lists submitted payments in the governance approval queue.
   - Therefore, to satisfy Requirement R1 ("No approval workflows, maker-checker checks, approver assignments, approval bands, or approval queues exist in the Cash, Bank & Party Settlement module"), settlement vouchers must be removed from `approvals/route.ts`, `postPayment` must post directly from `SUBMITTED` without mutating to `APPROVED`, and `assertSegregationOfDuties` and `assertApprovalPolicy` calls must be removed from the settlement flow.

2. **Voucher Lifecycle Completion**:
   - From Observation 2, unposted vouchers can only be removed via `DELETE FROM "Payment"`, which completely erases audit history. Posted vouchers have no reversal mechanism whatsoever.
   - Requirement R1 mandates strict statuses (`Draft`, `Submitted`, `Posted`, `Cancelled`, `Reversed`).
   - Therefore, adding `cancelPayment` (transitions to `CANCELLED`, records audit log) and `reversePayment` (posts inverse GL journal, releases allocations, marks payment `REVERSED`) is strictly necessary to complete the lifecycle without destructive deletion.

3. **Dynamic General Ledger Architecture**:
   - From Observation 3, explicit string literals `{ code: "1000" }` exist in `banking/transfers` and `cash-in-hand`.
   - Requirement R3 states: "manage multiple cash accounts... without hardcoded account IDs... Every posted voucher must generate balanced journal entries atomically... with zero hardcoded GL accounts."
   - Therefore, replacing `{ code: "1000" }` with dynamic queries using `requirePostingAccount` and `accountType: "CASH"` guarantees complete flexibility across custom Charts of Accounts.

4. **Allocation Engine Integrity**:
   - From Observation 4, `/api/operations/lookups` provides only `grandTotal`.
   - If an invoice of Rs 100,000 has already been settled by Rs 60,000, the UI receives 100,000 and attempts to allocate up to 100,000.
   - When `postPayment` runs, `validateAllocations` throws `INVOICE_OVERPAYMENT` (409) unexpectedly.
   - Furthermore, if the invoice had a posted return of Rs 20,000, `validateAllocations` does not know, because it checks only `grandTotal`.
   - Therefore, a dedicated query calculating `outstandingAmount = max(0, grandTotal - returnsAmount - settledAmount)` is required, and `validateAllocations` must be updated to subtract `StockReturn`s.

5. **Bulk Posting & Fault Isolation**:
   - From Observation 5, `batch-post` does not isolate branches or report financial totals.
   - Requirement R5 requires: "Bulk posting executes each submitted voucher in an isolated atomic transaction, reporting counts and amounts for successes and failures without corrupting any transaction."
   - Therefore, `batch-post` must be upgraded to pre-validate, scope to permitted branches, execute each voucher within an isolated transaction, and return `{ totalProcessed, postedCount, failedCount, totalPostedAmount, totalFailedAmount, results }`.

---

## 3. Caveats

1. **Read-Only Scope**: In accordance with the Explorer persona, no source code in `src/` was modified during this survey. Detailed diffs, architecture maps, and code snippets are provided in `survey_backend_accounting.md`.
2. **Database State**: The persistent PGlite database in `./.pglite/axon-erp` currently contains 0 payment records; historical voucher sequences (`HZR-RC`, `ISB-RC`) exist in `DocumentSequence`. Standalone test scripts must query PGlite in-process or start `pglite-server` with `BypassSandbox: true`.
3. **No Alternative Interpretations**: The requirement to eliminate approval workflows while preserving RBAC permissions is unambiguous and requires direct post capability from `SUBMITTED` status.

---

## 4. Conclusion

The Cash, Bank & Party Settlement backend is functionally sound at its core (Prisma transaction isolation, balanced GL journal creation in `accounting.ts`, subledger aging calculation in `subledger.ts`), but is obstructed by:
1. Residual maker-checker and approval queue dependencies.
2. Missing lifecycle handlers (`cancelPayment` and `reversePayment`).
3. Incomplete lookup data for invoice allocations (missing outstanding balance computation).
4. Hardcoded `{ code: "1000" }` fallbacks in cash and bank transfers.
5. Incomplete bulk-posting result metrics and missing bank charges/interest entry generation.

All required changes have been completely mapped, documented, and cross-referenced in:
`d:\Inventory Managment Software\.agents\teamwork\teamwork_explorer_survey_2\survey_backend_accounting.md`

---

## 5. Verification Method

To independently verify the survey findings:

1. **Inspect Maker-Checker Remnants**:
   - Run `grep_search` on `src/lib/operations/payments.ts` for `assertSegregationOfDuties` and `OperationalDocumentStatus.APPROVED`.
   - View `src/app/api/approvals/route.ts` lines 103–112 to confirm payment inclusion in the approval queue.

2. **Inspect Missing Routes**:
   - Run `find_by_name` on `src/app/api/payments` to confirm that `cancel` and `reverse` directories do not exist.
   - Run `grep_search` on `src/lib/operations/payments.ts` to confirm that `reversePayment` is absent.

3. **Inspect Hardcoded Accounts**:
   - Run `grep_search` on `src/app/api/finance/banking/transfers/route.ts` for `"1000"`.
   - Run `grep_search` on `src/lib/finance/cash-in-hand.ts` for `"1000"`.

4. **Inspect Allocation Lookup**:
   - View `src/app/api/operations/lookups/route.ts` lines 40–41 to confirm missing `outstandingAmount` and `previouslyPaid`.

5. **Typecheck & Test Execution**:
   - Execute TypeScript compilation check:
     `npx tsc -p tsconfig.finance.json --noEmit`
     `npx tsc -p tsconfig.ops.json --noEmit`
   - Execute Vitest test runner:
     `npx vitest run`
