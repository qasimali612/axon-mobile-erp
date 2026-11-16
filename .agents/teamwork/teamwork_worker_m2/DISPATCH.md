## 2026-11-15T12:12:53Z
You are teamwork_worker for Milestone 2: Approval Elimination, Direct Posting & Full Voucher Lifecycle.
Working directory: d:\Inventory Managment Software\.agents\teamwork\teamwork_worker_m2\

Read these files first:
- d:\Inventory Managment Software\.agents\teamwork\ORIGINAL_REQUEST.md
- d:\Inventory Managment Software\.agents\teamwork\orchestrator_settlement\PROJECT.md
- d:\Inventory Managment Software\.agents\teamwork\teamwork_explorer_survey_2\survey_backend_accounting.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Write Ownership (you exclusively own these files):
- src/lib/operations/payments.ts
- src/lib/operations/reversals.ts
- src/app/api/payments/[id]/cancel/route.ts
- src/app/api/payments/[id]/reverse/route.ts
- src/app/api/payments/[id]/post/route.ts
- src/app/api/payments/[id]/approve/route.ts
- src/app/api/approvals/route.ts
- src/__tests__/settlement/lifecycle.test.ts

Your tasks:
1. Approval Elimination & Direct Posting:
   - In src/lib/operations/payments.ts (postPayment):
     - Remove assertSegregationOfDuties and assertApprovalPolicy calls.
     - Eliminate mutation to OperationalDocumentStatus.APPROVED. Allow direct transition from DRAFT or SUBMITTED to POSTED.
     - Require PAYMENT_POST permission on the actor (allow maker/preparer with PAYMENT_POST to post directly).
   - In src/app/api/approvals/route.ts:
     - Remove Payment queries from the approval queue (lines 103-112).
     - Remove PAYMENT approval dispatch (line 312).
   - In src/app/api/payments/[id]/approve/route.ts:
     - Decouple or return 410 Gone / redirect to direct post.
   - In src/app/api/payments/[id]/post/route.ts:
     - Support direct posting from SUBMITTED status without awaiting any other user's approval.
2. Full Voucher Lifecycle (Cancel & Reverse):
   - In src/lib/operations/payments.ts:
     - Implement cancelPayment(actor: PaymentActor, id: string, reason?: string):
       - Requires PAYMENT_CANCEL.
       - Validates payment is DRAFT or SUBMITTED.
       - Transitions status to OperationalDocumentStatus.CANCELLED.
       - Preserves audit trail; does NOT delete database records.
     - Implement reversePayment(actor: PaymentActor, id: string, reason: string):
       - Requires PAYMENT_REVERSE.
       - Validates payment is POSTED.
       - Creates balanced reversing JournalEntry (reversalOfJournalId = payment.journalEntryId, inverted debit/credit lines).
       - Releases all invoice allocations tied to the payment so invoices regain their open balance.
       - Transitions payment status to OperationalDocumentStatus.REVERSED and sets reversalOfId.
   - Implement route POST /api/payments/[id]/cancel in src/app/api/payments/[id]/cancel/route.ts.
   - Implement route POST /api/payments/[id]/reverse in src/app/api/payments/[id]/reverse/route.ts.
3. Tests & Verification:
   - Author unit test suite in src/__tests__/settlement/lifecycle.test.ts covering:
     - Direct posting from SUBMITTED to POSTED by same user.
     - Elimination from approval queue.
     - Cancelling SUBMITTED voucher (status CANCELLED, no deletion).
     - Reversing POSTED voucher (reversing journal, balanced GL, allocation release, status REVERSED).
   - Run tests:
     `npx vitest run src/__tests__/settlement/lifecycle.test.ts`
     `npx vitest run src/__tests__/settlement/numbering.test.ts`
     `npx vitest run src/__tests__/settlement/settlement-e2e.test.ts`
   - Run typecheck: `npx tsc -p tsconfig.ops.json --noEmit` and `npx tsc -p tsconfig.finance.json --noEmit`.
4. Deliver handoff.md in your working directory and notify the orchestrator via send_message.
