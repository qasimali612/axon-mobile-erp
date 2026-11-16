# Milestone 1 Challenger M1-2 Report: RBAC, Security & Isolation Adversarial Audit

**Agent**: Challenger M1-2 (`challenger_m1_2`)  
**Parent Agent**: `801c1388-1cc8-4ee1-9f96-99c33e953b3a`  
**Date**: 2026-11-15T12:32:00Z  
**Role**: Empirical Challenger (critic, specialist)  
**Verdict**: `REQUEST_CHANGES`  
**Working Directory**: `d:\Inventory Managment Software\.agents\teamwork\challenger_m1_2`  

---

## 1. Observation

Direct code inspection, AST verification, and execution of automated adversarial test suite `src/__tests__/settlement/m1-2-rbac-security.test.ts` (14 tests, 100% pass) revealed the following concrete observations across the security boundaries, RBAC permissions, and approval queue isolation:

### 1.1 Posting Endpoints & RBAC Permissions (`SALES_INVOICE_POST`)
1. **`POST /api/sales/invoices/[id]/post`** (`src/app/api/sales/invoices/[id]/post/route.ts:21`):
   ```typescript
   const context = await requirePermission("SALES_INVOICE_POST", record);
   ```
   Direct posting strictly checks `SALES_INVOICE_POST` with branch and warehouse scoping against the target invoice.
2. **`POST /api/sales/invoices/[id]/approve`** (`src/app/api/sales/invoices/[id]/approve/route.ts:25`):
   ```typescript
   const context = await requirePermission("SALES_INVOICE_POST", record);
   ```
   The deprecated approval forwarding endpoint requires `SALES_INVOICE_POST` (legacy `SALES_INVOICE_APPROVE` check was removed).
3. **`POST /api/sales/invoices/[id]/submit`** (`src/app/api/sales/invoices/[id]/submit/route.ts:25`):
   ```typescript
   const context = await requirePermission("SALES_INVOICE_POST", record);
   ```
   The deprecated submission forwarding endpoint requires `SALES_INVOICE_POST`.
4. **`POST /api/sales/invoices/batch-post`** (`src/app/api/sales/invoices/batch-post/route.ts:13`):
   ```typescript
   const context = await requirePermission("SALES_INVOICE_POST");
   ```
   Batch posting requires `SALES_INVOICE_POST` at the company level.
5. **UI Permission Gates**:
   - `src/components/sales/sales-manager.tsx:557`: "Post Now" button conditionally renders strictly with `can("SALES_INVOICE_POST")`.
   - `src/components/sales/sales-invoice-actions.tsx:150`: "⚡ Post Now to Stock & GL" button strictly requires `can("SALES_INVOICE_POST")`.

### 1.2 Reversals & Segregation of Duties: Critical Failure Mode Discovered
1. **Segregation of Duties Removal**:
   - In `src/lib/operating-mode.ts:186-198`, `assertSegregationOfDuties` has been neutralized to a no-op:
     ```typescript
     export async function assertSegregationOfDuties(...) {
       // No segregation restriction project-wide
       return;
     }
     ```
   - In `src/app/(erp)/sales/[id]/page.tsx:92`, the UI condition no longer requires `separated`:
     ```typescript
     const canReverse = invoice.status === OperationalDocumentStatus.POSTED && !invoice.reversalOfId && roleAllowsReversal;
     ```
     This allows users who prepared or posted the invoice to initiate reversal in the UI without segregation blocks.
2. **CRITICAL DEFECT — Domain Service Blocker in `src/lib/operations/reversals.ts:98`**:
   - In `src/lib/operations/reversals.ts:98-100`, `reversePostedSalesInvoice()` enforces:
     ```typescript
     if (invoice.status !== OperationalDocumentStatus.POSTED || !invoice.journalEntryId || !invoice.approvedById) {
       throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a posted sales invoice with complete approval and journal history can be reversed.");
     }
     ```
   - In Milestone 1, approval workflows were eliminated from sales invoices. Direct posting via `postSalesInvoice()` (`src/lib/operations/sales.ts:587-591`) writes:
     ```typescript
     where: { id: invoice.id },
     data: { status: OperationalDocumentStatus.POSTED, journalEntryId: journal.id, postedById: actor.userId, postedAt: new Date(), costTotal: totalCost },
     ```
     `approvedById` remains `null`.
   - **Empirical Consequence**: Because `invoice.approvedById` is `null` on all directly-posted sales invoices, line 98 evaluates `!invoice.approvedById` to `true` and throws `ApiError(409, "INVALID_DOCUMENT_STATE", "Only a posted sales invoice with complete approval and journal history can be reversed.")`.
   - **Result**: Under the current codebase, NO directly-posted sales invoice can EVER be reversed.
3. **RESIDUAL APPROVAL TRANSITIONS in `src/lib/operations/reversals.ts:216-220`**:
   - During reversal document creation, lines 216-220 execute:
     ```typescript
     await tx.salesInvoice.update({ where: { id: reversal.id }, data: { status: OperationalDocumentStatus.SUBMITTED } });
     await tx.salesInvoice.update({
       where: { id: reversal.id },
       data: { status: OperationalDocumentStatus.APPROVED, approvedById: invoice.approvedById, approvedAt },
     });
     ```
   - The reversal record transitions through legacy approval states `SUBMITTED` -> `APPROVED` before being marked `POSTED`, directly conflicting with R1 approval eradication.

### 1.3 Approval Queue Isolation
1. **`GET /api/approvals`** (`src/app/api/approvals/route.ts`):
   - Lines 34-105: `Promise.all` queries `purchaseOrders`, `purchaseReceipts`, `stockTransfers`, `stockAdjustments`, `journals`, and `budgets`. Query for `prisma.salesInvoice.findMany` is completely absent.
   - Line 207: `counts.sales: 0` is hardcoded.
   - Lines 108-199: `items` mapping contains zero entries of type `SALES_INVOICE`.
2. **`POST /api/approvals`** (`src/app/api/approvals/route.ts`):
   - Lines 13-27: `actionSchema.documentType` is an enum of `["PURCHASE_ORDER", "PURCHASE_RECEIPT", "STOCK_TRANSFER", "STOCK_ADJUSTMENT", "JOURNAL", "BUDGET", "INCENTIVE", "REBATE"]`.
   - Attempting to submit `documentType: "SALES_INVOICE"` triggers Zod validation failure, returning HTTP 422 `VALIDATION_ERROR`.
   - Lines 240-307: Neither the `approve` nor `reject` switch statements contain a `case "SALES_INVOICE"`. Any bypassed call hits `default: throw new ApiError(400, "UNSUPPORTED_TYPE")`.

### 1.4 Credit Limit Validation & Override Audit Logging
1. **Credit Limit Boundary Enforcement** (`src/lib/operations/sales.ts:428-454`):
   - On direct post for term sales (`if (invoice.dueDate)`), computes customer Accounts Receivable balance:
     ```sql
     SELECT COALESCE(SUM(l."baseDebit" - l."baseCredit"),0)::numeric(19,4) AS balance
     FROM "JournalEntryLine" l JOIN "JournalEntry" j ON j."id" = l."entryId"
     WHERE j."companyId" = ${actor.companyId}::uuid AND j."status" = 'POSTED'
       AND l."accountId" = ${receivable.id}::uuid AND l."customerId" = ${invoice.customerId}::uuid
     ```
   - Verifies breach condition: `outstanding.plus(invoice.grandTotal).gt(invoice.customer.creditLimit)`.
2. **Override Reason & Audit Log**:
   - `assertCreditOverrideAllowed` (`src/lib/policies.ts:86-93`) uses `actor.overrideReason` if provided; defaults to `"Authorized credit transaction"`.
   - `postSalesInvoice` creates immutable audit event:
     - `action`: `"CREDIT_LIMIT_OVERRIDDEN"`
     - `module`: `"sales"`
     - `entityType`: `"SalesInvoice"`
     - `entityId`: `invoice.id`
     - `entityReference`: `invoice.invoiceNumber`
     - `metadata`: `{ reason, outstanding, invoiceTotal, creditLimit }`
   - `src/app/api/sales/invoices/[id]/post/route.ts:23-25`: extracts `body.reason` from HTTP payload and forwards to `actor.overrideReason`.

---

## 2. Logic Chain

1. **RBAC Consistency**:
   - Direct posting via `/post`, `/batch-post`, `/approve` (deprecated), and `/submit` (deprecated) all mandate `SALES_INVOICE_POST`.
   - Scoped branch/warehouse RBAC checks prevent cross-branch or cross-warehouse unauthorized posting.
   - UI actions in both the sales manager grid and individual invoice detail view enforce `can("SALES_INVOICE_POST")`.
2. **Reversal Defect Mechanics**:
   - While Worker M1 Gen 3 neutralized `assertSegregationOfDuties` and updated UI `canReverse` in `sales/[id]/page.tsx`, the domain service `reversePostedSalesInvoice` in `src/lib/operations/reversals.ts:98` was overlooked.
   - Because Milestone 1 eliminated approval workflows, `postSalesInvoice` sets `postedById` but leaves `approvedById` as `null`.
   - The guard `if (... || !invoice.approvedById)` unconditionally blocks all newly posted sales invoices from reversal, returning HTTP 409 `INVALID_DOCUMENT_STATE`.
   - Furthermore, lines 216-220 perform intermediate status writes `SUBMITTED -> APPROVED`, violating the requirement to eliminate approval statuses from the system.
3. **Approval Queue Isolation**:
   - Removal of `salesInvoice` from both `GET /api/approvals` and `POST /api/approvals` guarantees complete queue isolation. Sales invoices cannot be viewed or approved through the legacy approvals dashboard.
4. **Credit Limit Validation Integrity**:
   - Term invoices exceeding credit limit trigger `assertCreditOverrideAllowed` and log `CREDIT_LIMIT_OVERRIDDEN` with complete numeric balances in metadata.

---

## 3. Caveats

1. **Auto-Post on Draft Creation Route**:
   - In `src/app/api/sales/invoices/route.ts:207-228`, draft creation checks `requirePermission("SALES_INVOICE_CREATE")`. When `shouldAutoPost` evaluates to `true`, `postSalesInvoice(actor, invoice.id)` is immediately invoked using the creator's actor context. While this supports single-operator checkout fluidity, users with `SALES_INVOICE_CREATE` but lacking `SALES_INVOICE_POST` can post via creation if autoPost is active.
2. **Database Engine Availability**:
   - Automated tests were verified via in-memory Vitest harness and AST/code contract testing. Standalone integration tests against PostgreSQL require the PGlite socket active on port `54329`.

---

## 4. Conclusion & Empirical Verdict

### Verdict: `REQUEST_CHANGES`

**Rationale**:  
While RBAC posting permissions, approval queue isolation, and credit limit audit logging have been properly implemented and verified, **sales invoice reversals are broken in the backend domain logic**. Any sales invoice directly posted under Milestone 1 cannot be reversed due to the legacy `!invoice.approvedById` check in `src/lib/operations/reversals.ts:98`.

### Required Remediations:
1. **Fix `src/lib/operations/reversals.ts:98`**:
   Remove `|| !invoice.approvedById`:
   ```typescript
   // BEFORE:
   if (invoice.status !== OperationalDocumentStatus.POSTED || !invoice.journalEntryId || !invoice.approvedById) {
     throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a posted sales invoice with complete approval and journal history can be reversed.");
   }

   // AFTER:
   if (invoice.status !== OperationalDocumentStatus.POSTED || !invoice.journalEntryId) {
     throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a posted sales invoice with complete journal history can be reversed.");
   }
   ```
2. **Fix `src/lib/operations/reversals.ts:216-220`**:
   Eliminate intermediate `SUBMITTED` and `APPROVED` status writes on reversal documents. Create reversal directly in `DRAFT` (or directly `POSTED` with journal entry), removing approval transitions and `approvedById` references.

---

## 5. Verification Method

To independently reproduce and verify this finding:

1. **Run the M1-2 Empirical Adversarial Test Suite**:
   ```powershell
   npx vitest run src/__tests__/settlement/m1-2-rbac-security.test.ts
   ```
   *Expected outcome*: 14 passed tests documenting and asserting the exact code paths and failure conditions.

2. **Inspect Domain Guard in `src/lib/operations/reversals.ts`**:
   View lines 98–101 of `src/lib/operations/reversals.ts`:
   Observe `!invoice.approvedById` in the fatal 409 condition.

3. **Inspect Posting Status Assignment in `src/lib/operations/sales.ts`**:
   View lines 587–591 of `src/lib/operations/sales.ts`:
   Observe that `approvedById` is never set during direct posting.
