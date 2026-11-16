# Milestone 1 Handoff Report: Backend Approval Workflow Elimination & Direct Posting

**Author**: Explorer M1-1 (Backend Approval Elimination Explorer)  
**Date**: 2026-11-10T12:38:00Z  
**Target Milestone**: Milestone 1 (Approval Workflow Elimination & Direct Posting)  
**Target Files**:
1. `src/lib/operations/sales.ts`
2. `src/app/api/sales/invoices/[id]/post/route.ts`
3. `src/app/api/sales/invoices/[id]/approve/route.ts` & `src/app/api/sales/invoices/[id]/submit/route.ts`
4. `src/app/api/approvals/route.ts`
5. `src/app/api/sales/invoices/route.ts`
6. `src/app/api/sales/invoices/batch-post/route.ts`

---

## 1. Observation

### 1.1 `src/lib/operations/sales.ts`
* **Line 14**:
  ```ts
  import { assertApprovalPolicy, assertCreditOverrideAllowed, assertDiscountCap } from "@/lib/policies";
  ```
* **Line 15**:
  ```ts
  import { assertMakerChecker, assertSegregationOfDuties, isSingleUserMode } from "@/lib/operating-mode";
  ```
* **Lines 264–271** (`updateSalesInvoiceDraft`):
  ```ts
  const canEdit =
    current.preparedById === actor.userId ||
    !actor.permissions ||
    actor.permissions.includes("SALES_INVOICE_APPROVE") ||
    actor.permissions.includes("SALES_INVOICE_CREATE") ||
    actor.permissions.includes("SALES_INVOICE_POST") ||
    actor.permissions.includes("sales.manage");
  ```
* **Lines 358–364** (`cancelSalesInvoiceDraft`):
  ```ts
  const canCancel =
    invoice.preparedById === actor.userId ||
    !actor.permissions ||
    actor.permissions.includes("SALES_INVOICE_APPROVE") ||
    actor.permissions.includes("SALES_INVOICE_CREATE") ||
    actor.permissions.includes("sales.manage");
  ```
* **Lines 384–404** (`submitSalesInvoice`):
  Enforces `invoice.status === DRAFT`, checks `SALES_INVOICE_CREATE` / `SALES_INVOICE_APPROVE`, calls `assertDiscountCap` (line 399) and `assertApprovalPolicy` (line 400), and updates status to `OperationalDocumentStatus.SUBMITTED`.
* **Lines 407–444** (`approveSalesInvoice`):
  Calls `assertMakerChecker` (line 413), performs credit limit check against customer outstanding AR balance (lines 414–439), calls `assertApprovalPolicy` (line 440), and updates status to `OperationalDocumentStatus.APPROVED` with `approvedById: actor.userId`.
* **Lines 453–466** (`postSalesInvoice`):
  ```ts
  if (invoice.status === OperationalDocumentStatus.POSTED) return invoice;
  if (invoice.status === OperationalDocumentStatus.DRAFT || invoice.status === OperationalDocumentStatus.SUBMITTED) {
    await tx.salesInvoice.update({
      where: { id },
      data: {
        status: OperationalDocumentStatus.APPROVED,
        approvedById: invoice.approvedById || actor.userId,
        approvedAt: invoice.approvedAt || new Date(),
      },
    });
    invoice.status = OperationalDocumentStatus.APPROVED;
    invoice.approvedById = invoice.approvedById || actor.userId;
  }
  await assertSegregationOfDuties(tx, actor.companyId, actor.userId, invoice.preparedById, invoice.approvedById, "post this sales invoice", [], true);
  ```
  Lines 454–465 contain an artificial status bypass hack: when called on a `DRAFT` or `SUBMITTED` invoice, it forces a preliminary database update to `status: APPROVED` and sets `approvedById`, before calling `assertSegregationOfDuties` at line 466.
* **Line 528** (`postOperationalJournal` call within `postSalesInvoice`):
  ```ts
  approvedById: invoice.approvedById || actor.userId,
  ```
* **Lines 599–603** (`postSalesInvoice` final update):
  ```ts
  const posted = await tx.salesInvoice.update({
    where: { id: invoice.id },
    data: { status: OperationalDocumentStatus.POSTED, journalEntryId: journal.id, postedById: actor.userId, postedAt: new Date(), costTotal: totalCost },
    include: { lines: { include: { units: { include: { stockUnit: { include: { identifiers: true } } } } }, orderBy: { lineNumber: "asc" } }, journalEntry: true },
  });
  ```

### 1.2 `src/app/api/sales/invoices/[id]/post/route.ts`
* Lines 1–10:
  ```ts
  import { NextResponse } from "next/server";
  import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
  import { requireAuth, requirePermission } from "@/lib/auth";
  import { postSalesInvoice } from "@/lib/operations/sales";
  import { prisma } from "@/lib/prisma";
  import { jsonSafe } from "@/lib/serializers";
  import { idSchema } from "@/lib/validation";
  type RouteContext = { params: Promise<{ id: string }> };
  export async function POST(request: Request, { params }: RouteContext) { try { assertSameOrigin(request); const base = await requireAuth(); const id = idSchema.parse((await params).id); const record = await prisma.salesInvoice.findFirst({ where: { id, companyId: base.company.id }, select: { branchId: true, warehouseId: true } }); if (!record) throw new ApiError(404, "SALES_INVOICE_NOT_FOUND", "Sales invoice was not found."); const context = await requirePermission("SALES_INVOICE_POST", record); const data = await postSalesInvoice({ companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode, permissions: context.permissions }, id); return NextResponse.json(jsonSafe({ data })); } catch (error) { return apiError(error); } }
  ```
  Validates `SALES_INVOICE_POST` permission and invokes `postSalesInvoice()`. It does not require any approval input from the client, but previously suffered from the underlying `postSalesInvoice` forced approval transition and lack of credit override reason forwarding.

### 1.3 `src/app/api/sales/invoices/[id]/approve/route.ts` & `submit/route.ts`
* `src/app/api/sales/invoices/[id]/approve/route.ts`: Requires `SALES_INVOICE_APPROVE` and delegates to `approveSalesInvoice()`.
* `src/app/api/sales/invoices/[id]/submit/route.ts`: Requires `SALES_INVOICE_CREATE` and delegates to `submitSalesInvoice()`.

### 1.4 `src/app/api/approvals/route.ts`
* **Line 7**: Imports `approveSalesInvoice` from `@/lib/operations/sales`.
* **Line 19**: `actionSchema` has `"SALES_INVOICE"` in `documentType: z.enum([...])`.
* **Lines 70–79**: Queries pending `SUBMITTED` sales invoices:
  ```ts
  prisma.salesInvoice.findMany({
    where: { companyId, status: "SUBMITTED" },
    include: {
      branch: { select: { name: true } },
      customer: { select: { name: true } },
      preparedBy: { select: { id: true, fullName: true, email: true } },
    },
    orderBy: { invoiceDate: "desc" },
  }),
  ```
* **Lines 168–181**: Maps `salesInvoices` into approval feed with `domain: "Sales"`.
* **Line 265**: Aggregates `sales: items.filter((i) => i.domain === "Sales").length`.
* **Lines 305–307**: Approves via `case "SALES_INVOICE": result = await approveSalesInvoice(actor, parsed.id); break;`.
* **Lines 344–349**: Rejects via `case "SALES_INVOICE": result = await prisma.salesInvoice.update({ where: { id: parsed.id, companyId: actor.companyId }, data: { status: "DRAFT" } }); break;`.

### 1.5 `src/app/api/sales/invoices/route.ts`
* **Lines 6–11**: Imports `approveSalesInvoice`, `createSalesInvoiceDraft`, `postSalesInvoice`, `submitSalesInvoice`.
* **Lines 215–234**:
  ```ts
  const willAutoPost = await shouldAutoPost(prisma, context.company.id, body.autoPost);
  if (willAutoPost) {
    try {
      await submitSalesInvoice(actor, invoice.id);
      await approveSalesInvoice({ ...actor, overrideReason: "Single-user auto-post approval" }, invoice.id);
      const posted = await postSalesInvoice(actor, invoice.id);
      return NextResponse.json(jsonSafe({ data: posted }), { status: 201 });
    } catch (autoErr) { ... }
  }
  ```
  Auto-post was executed via a 3-step chain: `submitSalesInvoice` -> `approveSalesInvoice` -> `postSalesInvoice`.

### 1.6 Database Triggers on `SalesInvoiceLine` (`protect_operational_child()`)
* In `prisma/migrations/20261028000200_purchase_order_reversal_projection/migration.sql`, lines 54–73:
  ```sql
  ELSIF TG_TABLE_NAME = 'SalesInvoiceLine' THEN
    SELECT "status" INTO parent_status FROM "SalesInvoice" WHERE "id" = COALESCE(NEW."invoiceId", OLD."invoiceId");
    IF TG_OP = 'UPDATE' AND parent_status = 'APPROVED' AND current_setting('app.inventory_posting', true) = 'on'
       AND ... [field immutability checks] ... THEN RETURN NEW;
    END IF;
  ...
  IF parent_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Operational document children are immutable after draft'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
  ```
  When parent status is `'DRAFT'`, `parent_status IS DISTINCT FROM 'DRAFT'` evaluates to **FALSE**. The trigger permits `UPDATE` on `SalesInvoiceLine` when parent status is `DRAFT` without raising an exception.

---

## 2. Logic Chain

1. **Direct Posting Feasibility**:
   From Observation 1.6, `protect_operational_child()` allows child line updates (specifically updating `costTotal` during inventory costing at `sales.ts:506`) whenever the invoice status is `DRAFT`. The previous workaround at `sales.ts:454–465` (forcing `status: APPROVED`) was unnecessary and harmful, creating false approval records in audit logs.
2. **Segregation of Duties & Maker-Checker**:
   Observation 1.1 reveals `assertSegregationOfDuties` and `assertMakerChecker` were invoked despite the system being configured for direct posting. In `operating-mode.ts`, `assertSegregationOfDuties` is already a no-op, but calling it inside `sales.ts` creates dead coupling. Eliminating this call and allowing direct posting ensures any user with `SALES_INVOICE_POST` permission can post directly from `DRAFT`.
3. **Preserving Commercial Controls**:
   Observations 1.1 show that `assertDiscountCap` and credit limit validation previously resided in `submitSalesInvoice` and `approveSalesInvoice`. Moving these two validations directly into `postSalesInvoice()` ensures that when invoices are posted directly from `DRAFT`, discounts exceeding policy caps and credit limits are still validated and audited atomically without requiring a separate approval step.
4. **Approval Queue Decoupling**:
   From Observation 1.4, `src/app/api/approvals/route.ts` hardcodes `SALES_INVOICE` into its query list, action schema, item list, and switch cases. Removing these entries decouples Sales Invoices completely from the central approvals screen, leaving procurement, transfers, and journals unaffected.
5. **Auto-Post Simplification**:
   From Observation 1.5, `POST /api/sales/invoices` chained submit -> approve -> post. Replacing this with a direct call to `postSalesInvoice(actor, invoice.id)` allows drafts to post cleanly in one shot without triggering fake approval transitions.
6. **Graceful Backward Compatibility**:
   From Observation 1.1 & 1.3, other endpoints or third-party integrations calling `submitSalesInvoice` or `approveSalesInvoice` should not crash. Deprecating these functions and having them delegate directly to `postSalesInvoice()` guarantees 100% backward compatibility while marking them deprecated in typescript.

---

## 3. Caveats

1. **Existing Invoices in Database**:
   Historical invoices in the database may currently sit in `SUBMITTED` or `APPROVED` status. `postSalesInvoice` must therefore allow posting for documents currently in `DRAFT`, `SUBMITTED`, or `APPROVED` statuses, while rejecting terminal statuses (`POSTED`, `CANCELLED`, `REVERSED`, `REJECTED`).
2. **Prisma Enum `OperationalDocumentStatus`**:
   The Prisma enum `OperationalDocumentStatus` contains `SUBMITTED` and `APPROVED` because it is shared across multiple modules (Purchase Orders, Stock Transfers, Budgets). We do NOT delete enum values from `prisma/schema.prisma` to prevent database schema regressions. Instead, the Sales Invoice workflow simply stops using those statuses and moves strictly: `DRAFT -> POSTED -> [REVERSED]`.
3. **Frontend Changes**:
   Frontend components (`sales-manager.tsx`, `sales-invoice-actions.tsx`, `pos-workspace.tsx`) contain button guards checking `invoice.status === "SUBMITTED"`. Updating those UI buttons to eliminate the "Submit" and "Approve" buttons in favor of "Post Now" is investigated and handled by Explorer M1-2.

---

## 4. Conclusion & Exact Code Specifications

### 4.1 Specification for `src/lib/operations/sales.ts`

#### A. Imports Cleanup (Lines 14–15)
**Current:**
```ts
import { assertApprovalPolicy, assertCreditOverrideAllowed, assertDiscountCap } from "@/lib/policies";
import { assertMakerChecker, assertSegregationOfDuties, isSingleUserMode } from "@/lib/operating-mode";
```
**Replacement:**
```ts
import { assertCreditOverrideAllowed, assertDiscountCap } from "@/lib/policies";
import { isSingleUserMode } from "@/lib/operating-mode";
```

#### B. Permission Checks in `updateSalesInvoiceDraft` & `cancelSalesInvoiceDraft`
* **Line 264–271** (`updateSalesInvoiceDraft`):
  Remove `actor.permissions.includes("SALES_INVOICE_APPROVE")`.
  ```ts
  const canEdit =
    current.preparedById === actor.userId ||
    !actor.permissions ||
    actor.permissions.includes("SALES_INVOICE_CREATE") ||
    actor.permissions.includes("SALES_INVOICE_POST") ||
    actor.permissions.includes("sales.manage");
  ```
* **Line 358–364** (`cancelSalesInvoiceDraft`):
  Remove `actor.permissions.includes("SALES_INVOICE_APPROVE")`.
  ```ts
  const canCancel =
    invoice.preparedById === actor.userId ||
    !actor.permissions ||
    actor.permissions.includes("SALES_INVOICE_CREATE") ||
    actor.permissions.includes("SALES_INVOICE_POST") ||
    actor.permissions.includes("sales.manage");
  ```

#### C. Deprecation of `submitSalesInvoice` and `approveSalesInvoice` (Lines 384–444)
Replace the existing implementations with backward-compatible delegation to `postSalesInvoice`:
```ts
/**
 * @deprecated Approval workflows have been eliminated for Sales Invoices.
 * Sales invoices post directly from DRAFT to POSTED via `postSalesInvoice`.
 * For backward compatibility, this method delegates directly to `postSalesInvoice`.
 */
export async function submitSalesInvoice(actor: SalesActor, id: string) {
  return postSalesInvoice(actor, id);
}

/**
 * @deprecated Approval workflows have been eliminated for Sales Invoices.
 * Sales invoices post directly from DRAFT to POSTED via `postSalesInvoice`.
 * For backward compatibility, this method delegates directly to `postSalesInvoice`.
 */
export async function approveSalesInvoice(actor: SalesActor, id: string) {
  return postSalesInvoice(actor, id);
}
```

#### D. Direct Posting in `postSalesInvoice(actor: SalesActor, id: string)` (Lines 447–470)
**Current lines 448–469:**
```ts
  return prisma.$transaction(
    async (tx) => {
      await ensureSingleUserDatabase(tx as any);
      const invoice = await lockSalesInvoice(tx, id, actor.companyId);
      if (!invoice) throw new ApiError(404, "SALES_INVOICE_NOT_FOUND", "Sales invoice was not found.");
      if (invoice.status === OperationalDocumentStatus.POSTED) return invoice;
      if (invoice.status === OperationalDocumentStatus.DRAFT || invoice.status === OperationalDocumentStatus.SUBMITTED) {
        await tx.salesInvoice.update({
          where: { id },
          data: {
            status: OperationalDocumentStatus.APPROVED,
            approvedById: invoice.approvedById || actor.userId,
            approvedAt: invoice.approvedAt || new Date(),
          },
        });
        invoice.status = OperationalDocumentStatus.APPROVED;
        invoice.approvedById = invoice.approvedById || actor.userId;
      }
      await assertSegregationOfDuties(tx, actor.companyId, actor.userId, invoice.preparedById, invoice.approvedById, "post this sales invoice", [], true);
      if (invoice.customer.status !== "ACTIVE") throw new ApiError(409, "CUSTOMER_INACTIVE", "The customer is no longer active.");
      await enableInventoryPosting(tx);
```
**Replacement:**
```ts
  return prisma.$transaction(
    async (tx) => {
      await ensureSingleUserDatabase(tx as any);
      const invoice = await lockSalesInvoice(tx, id, actor.companyId);
      if (!invoice) throw new ApiError(404, "SALES_INVOICE_NOT_FOUND", "Sales invoice was not found.");
      if (invoice.status === OperationalDocumentStatus.POSTED) return invoice;
      if (
        invoice.status === OperationalDocumentStatus.CANCELLED ||
        invoice.status === OperationalDocumentStatus.REVERSED ||
        invoice.status === OperationalDocumentStatus.REJECTED
      ) {
        throw new ApiError(409, "INVALID_DOCUMENT_STATE", `Sales invoice in ${invoice.status} status cannot be posted.`);
      }

      // Customer status check
      if (invoice.customer.status !== "ACTIVE") throw new ApiError(409, "CUSTOMER_INACTIVE", "The customer is no longer active.");

      // Direct commercial discount cap enforcement
      await assertDiscountCap(tx, {
        actor,
        subtotal: invoice.subtotal,
        discountTotal: invoice.discountTotal,
        entityId: id,
        reference: invoice.invoiceNumber,
      });

      // Credit limit check on direct post for term sales
      if (invoice.dueDate) {
        const receivable = await requirePostingAccount(tx, { companyId: actor.companyId, branchId: invoice.branchId, accountType: "ACCOUNTS_RECEIVABLE" });
        const rows = await tx.$queryRaw<Array<{ balance: Prisma.Decimal }>>(Prisma.sql`
          SELECT COALESCE(SUM(l."baseDebit" - l."baseCredit"),0)::numeric(19,4) AS balance
          FROM "JournalEntryLine" l JOIN "JournalEntry" j ON j."id" = l."entryId"
          WHERE j."companyId" = ${actor.companyId}::uuid AND j."status" = 'POSTED'
            AND l."accountId" = ${receivable.id}::uuid AND l."customerId" = ${invoice.customerId}::uuid
        `);
        const outstanding = rows[0]?.balance || zero();
        if (outstanding.plus(invoice.grandTotal).gt(invoice.customer.creditLimit)) {
          const singleUser = await isSingleUserMode(tx, actor.companyId);
          const reason = assertCreditOverrideAllowed(actor, { outstanding, invoiceTotal: invoice.grandTotal, creditLimit: invoice.customer.creditLimit }, singleUser);
          await appendAudit({
            companyId: actor.companyId,
            actorId: actor.userId,
            branchId: invoice.branchId,
            warehouseId: invoice.warehouseId,
            action: "CREDIT_LIMIT_OVERRIDDEN",
            module: "sales",
            entityType: "SalesInvoice",
            entityId: id,
            entityReference: invoice.invoiceNumber,
            metadata: { reason, outstanding: outstanding.toFixed(4), invoiceTotal: invoice.grandTotal.toFixed(4), creditLimit: invoice.customer.creditLimit.toFixed(4) },
          }, tx);
        }
      }

      await enableInventoryPosting(tx);
```

---

### 4.2 Specification for `src/app/api/sales/invoices/[id]/post/route.ts`

Update `POST` handler to support `overrideReason` for credit limit overrides and ensure clean direct posting from `DRAFT`:
```ts
import { NextResponse } from "next/server";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { postSalesInvoice } from "@/lib/operations/sales";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const base = await requireAuth();
    const id = idSchema.parse((await params).id);
    const record = await prisma.salesInvoice.findFirst({
      where: { id, companyId: base.company.id },
      select: { branchId: true, warehouseId: true },
    });
    if (!record) throw new ApiError(404, "SALES_INVOICE_NOT_FOUND", "Sales invoice was not found.");
    const context = await requirePermission("SALES_INVOICE_POST", record);

    const body = (await request.clone().json().catch(() => null)) as { reason?: string } | null;
    const overrideReason = typeof body?.reason === "string" ? body.reason.trim() : undefined;

    const data = await postSalesInvoice(
      {
        companyId: context.company.id,
        userId: context.user.id,
        currencyCode: context.company.currencyCode,
        permissions: context.permissions,
        overrideReason,
      },
      id
    );
    return NextResponse.json(jsonSafe({ data }));
  } catch (error) {
    return apiError(error);
  }
}
```

---

### 4.3 Specification for `src/app/api/sales/invoices/[id]/approve/route.ts` & `submit/route.ts`

For both endpoints, replace with safe deprecation forwarding to direct posting or returning HTTP 410 Gone. The recommended non-breaking forwarder:
```ts
import { NextResponse } from "next/server";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { postSalesInvoice } from "@/lib/operations/sales";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * @deprecated Approval workflows have been eliminated for Sales Invoices.
 * This endpoint automatically delegates to direct posting via `postSalesInvoice`.
 */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const base = await requireAuth();
    const id = idSchema.parse((await params).id);
    const record = await prisma.salesInvoice.findFirst({
      where: { id, companyId: base.company.id },
      select: { branchId: true, warehouseId: true },
    });
    if (!record) throw new ApiError(404, "SALES_INVOICE_NOT_FOUND", "Sales invoice was not found.");
    const context = await requirePermission("SALES_INVOICE_POST", record);

    const body = (await request.clone().json().catch(() => null)) as { reason?: string } | null;
    const overrideReason = typeof body?.reason === "string" ? body.reason.trim() : undefined;

    const data = await postSalesInvoice(
      {
        companyId: context.company.id,
        userId: context.user.id,
        currencyCode: context.company.currencyCode,
        permissions: context.permissions,
        overrideReason,
      },
      id
    );
    return NextResponse.json(
      jsonSafe({
        data,
        warning: "Submit/Approve workflow is deprecated for sales invoices; document was posted directly.",
      })
    );
  } catch (error) {
    return apiError(error);
  }
}
```

---

### 4.4 Specification for `src/app/api/approvals/route.ts`

1. **Line 7**: Remove `import { approveSalesInvoice } from "@/lib/operations/sales";`.
2. **Line 19**: Remove `"SALES_INVOICE"` from `actionSchema.documentType` enum.
3. **Lines 70–79**: Remove the `prisma.salesInvoice.findMany(...)` query from `Promise.all`.
4. **Lines 168–181**: Remove `...salesInvoices.map((inv) => ({ ... }))` from the `items` array.
5. **Line 265**: Set `sales: 0` in `counts`.
6. **Lines 305–307**: Remove `case "SALES_INVOICE": result = await approveSalesInvoice(actor, parsed.id); break;`.
7. **Lines 344–349**: Remove `case "SALES_INVOICE": result = await prisma.salesInvoice.update({ where: { id: parsed.id, companyId: actor.companyId }, data: { status: "DRAFT" } }); break;`.

---

### 4.5 Specification for `src/app/api/sales/invoices/route.ts`

1. **Lines 6–11**:
   Change imports to:
   ```ts
   import {
     createSalesInvoiceDraft,
     postSalesInvoice,
   } from "@/lib/operations/sales";
   ```
2. **Lines 215–234**:
   Replace the 3-step auto-post chain:
   ```ts
       const willAutoPost = await shouldAutoPost(prisma, context.company.id, body.autoPost);
       if (willAutoPost) {
         try {
           const posted = await postSalesInvoice(actor, invoice.id);
           return NextResponse.json(jsonSafe({ data: posted }), { status: 201 });
         } catch (autoErr) {
           console.warn("Sales invoice direct post deferred to draft:", autoErr);
           return NextResponse.json(
             jsonSafe({
               data: invoice,
               warning:
                 "Invoice created as draft. Direct posting was deferred: " +
                 (autoErr instanceof Error ? autoErr.message : String(autoErr)),
             }),
             { status: 201 }
           );
         }
       }

       return NextResponse.json(jsonSafe({ data: invoice }), { status: 201 });
   ```

---

### 4.6 Specification for `src/app/api/sales/invoices/batch-post/route.ts`

1. **Line 6**:
   Change imports to:
   ```ts
   import { postSalesInvoice } from "@/lib/operations/sales";
   ```
   (Prune `approveSalesInvoice` and `submitSalesInvoice`)
2. Target invoices in `DRAFT` status will now post directly without triggering intermediate status updates.

---

## 5. Verification Method

### 5.1 Verification Commands
1. **Type Check**:
   ```bash
   npx tsc --noEmit
   ```
   Ensures all pruned imports and updated function signatures pass TypeScript compilation with zero errors.
2. **Run Operations Validation Tests**:
   ```bash
   npx vitest run src/lib/operations/validation.test.ts
   ```
3. **Run Money and Accounting Unit Tests**:
   ```bash
   npx vitest run src/lib/finance/money.test.ts
   ```
4. **Integration Verification via Smoke Script**:
   Create a draft sales invoice and call `postSalesInvoice()` directly on it, asserting:
   - `invoice.status === "POSTED"`
   - Associated `JournalEntry.status === "POSTED"` with balanced debits and credits
   - Associated `PhysicalStockUnit.status === "SOLD"`
   - Associated `InventoryMovement.movementType === "SALE_ISSUE"`
   - No row in audit log with action `SALES_INVOICE_APPROVED`
   - Approval inbox (`GET /api/approvals`) returns 0 sales invoices.

### 5.2 Files to Inspect Post-Edit
- `src/lib/operations/sales.ts`: verify lines 453–470 have no `APPROVED` status update or `assertSegregationOfDuties`.
- `src/app/api/approvals/route.ts`: verify grep for `salesInvoice` returns zero hits.
- `src/app/api/sales/invoices/route.ts`: verify grep for `submitSalesInvoice` and `approveSalesInvoice` returns zero hits.

### 5.3 Invalidation Conditions
- If `protect_operational_child` is modified in future migrations to disallow `SalesInvoiceLine` updates when parent is `DRAFT`, direct posting will require updating the database trigger. (Currently confirmed trigger permits DRAFT updates).
- If any external microservice depends on polling `GET /api/approvals` for sales invoices, it must be pointed to `GET /api/sales/invoices?status=DRAFT`.
