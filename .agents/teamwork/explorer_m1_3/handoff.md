# Handoff Report: Historical Invoices & Invoice ISB--SI-FY2026-27-000004 Investigation

**Auditor / Explorer**: Explorer M1-3 (`explorer_m1_3`)  
**Target Milestone**: Milestone 1 — Order-to-Cash (Historical Invoices & Invoice 000004)  
**Date**: 2026-11-10T12:35:00Z  
**Handoff Type**: Hard Handoff (Investigation Complete)  
**Working Directory**: `d:\Inventory Managment Software\.agents\teamwork\explorer_m1_3`  

---

## 1. Observation

Direct forensic inspection of the codebase, database schema, route handlers, UI components, and historical database snapshots revealed the following direct observations:

### 1.1 State of Historical Invoice `ISB--SI-FY2026-27-000004`
- **Location**: Database records / `backups/axon-erp-20261030-115314.tar.gz`, `scratch/audit_invoice.mjs:7`, `src/lib/operations/sales.ts:447-466`.
- **Database Fields & State**:
  - `id`: UUID (e.g. `97c5d214-ad6e-4ce0-85ae-e45bed071d7a` in backup snapshot)
  - `invoiceNumber`: Exactly `"ISB--SI-FY2026-27-000004"` (retaining double hyphens `ISB--SI`).
  - `status`: `OperationalDocumentStatus.APPROVED`.
  - `journalEntryId`: `null` (No financial General Ledger entry has been linked or committed).
  - `reversalOfId`: `null`.
  - `preparedById`: Valid user UUID.
  - `approvedById`: Populated from legacy intermediate approval or `null`.
  - `postedById`: `null`.
  - `postedAt`: `null`.
  - `lines`: Linked to `SalesInvoiceLine` records specifying item quantities, unit prices, discounts, and tax amounts.
  - `units`: Linked through `SalesInvoiceUnit` to serialized `PhysicalStockUnit` records (IMEI tracked).
  - `allocations`: `0` payment allocations. (Under `src/lib/operations/payments.ts:270-273`, any attempt to allocate against an unposted invoice throws `409 INVALID_ALLOCATION`).
- **Root Cause of Status `APPROVED`**:
  In `src/lib/operations/sales.ts:454-465`:
  ```typescript
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
  ```
  The legacy implementation of `postSalesInvoice()` forced an artificial intermediate database update to `status: APPROVED` before proceeding to inventory deduction and GL journal posting. When an error halted execution, or when the document was approved via `/submit` and `/approve` routes without completing the posting step, the record was left permanently stored with `status: APPROVED`.

### 1.2 Root Cause of Double Hyphen `ISB--SI-...`
- **Location**: `src/lib/document-sequence.ts:24-34`, `src/lib/operations/accounting.ts:87-115`, `scripts/setup-cloud-db.ts:90`.
- **Root Cause**:
  1. The Islamabad retail branch was seeded with `documentPrefix: "ISB-"` (containing a trailing dash).
  2. `allocateOperationalNumber` concatenated `${branch.documentPrefix}-${cleanSuffix}`, yielding `ISB--SI`.
  3. `DocumentSequence` previously did not update `prefix` on `ON CONFLICT DO UPDATE`, causing `"ISB--SI"` to persist permanently for that fiscal year sequence.
- **Historical Immutability**:
  The historical string `ISB--SI-FY2026-27-000004` is persisted in the database column `SalesInvoice.invoiceNumber`. It is never updated or rewritten, guaranteeing that existing paper invoices, customer receipts, and historical references are never corrupted.

### 1.3 Backend Posting Service Behavior (`src/lib/operations/sales.ts`)
- **Location**: `src/lib/operations/sales.ts:447-609` (`postSalesInvoice`).
- **Observed Flow**:
  1. Executes inside `prisma.$transaction` with `isolationLevel: Prisma.TransactionIsolationLevel.Serializable`.
  2. Acquires pessimistic row lock via `lockSalesInvoice(tx, id, actor.companyId)` (`SELECT ... FOR UPDATE`).
  3. Idempotency check (line 453): `if (invoice.status === OperationalDocumentStatus.POSTED) return invoice;`.
  4. Lines 454-465: The intermediate status update mutating `DRAFT` or `SUBMITTED` to `APPROVED`. If the invoice is already `APPROVED`, it skips this block.
  5. Line 466: Calls `assertSegregationOfDuties(...)`.
  6. Handset availability check (lines 477-488): Locks each `PhysicalStockUnit` (`SELECT ... FOR UPDATE`), verifies `unit.status === IN_STOCK`, `unit.currentWarehouseId === invoice.warehouseId`, and checks active reservations in `inventoryReservation`.
  7. General Ledger balancing (lines 523-545): Posts balanced double-entry commercial journal:
     - **DR** Accounts Receivable: `invoice.grandTotal`
     - **CR** Sales Revenue: `netRevenue` (`subtotal - discountTotal`)
     - **CR** Output Tax: `taxTotal` (if `taxTotal > 0`)
     - **DR** Cost of Goods Sold (COGS): `totalCost`
     - **CR** Inventory Asset: `totalCost`
  8. Stock deduction (lines 547-598): Updates `PhysicalStockUnit` to `status: SOLD`, sets custody to `null`, and appends `InventoryMovement` with `SALE_ISSUE`.
  9. Final update (lines 599-605): Updates `SalesInvoice` to `status: POSTED`, sets `journalEntryId = journal.id`, `postedById = actor.userId`, `postedAt = new Date()`, and records an immutable `AuditLog` entry.

### 1.4 Database Status Transition Trigger
- **Location**: `src/lib/prisma.ts:64-77` (`enforce_operational_status_transition`).
- **Verbatim Trigger Code**:
  ```sql
  CREATE OR REPLACE FUNCTION enforce_operational_status_transition()
  RETURNS TRIGGER AS $$
  BEGIN
    IF OLD."status" = 'POSTED' THEN
      IF NEW."status" = 'REVERSED' THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Invalid operational document status transition from % to %', OLD."status", NEW."status";
    END IF;
    IF OLD."status" = 'REVERSED' THEN
      RAISE EXCEPTION 'Reversed operational documents cannot transition to any other status.';
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  ```
- **Finding**: The database trigger strictly forbids mutating already-posted documents (except to `REVERSED`) and reversed documents. Transitions from `APPROVED` -> `POSTED` and `DRAFT` -> `POSTED` are completely valid and permitted by PostgreSQL.

### 1.5 UI Posting Controls & Action Buttons
- **`src/components/sales/sales-manager.tsx`**:
  - Line 604: `{(row.status === "DRAFT" || row.status === "SUBMITTED" || row.status === "APPROVED") && can("SALES_INVOICE_CREATE") && (`
  - Renders the "Post Now" button for any invoice in `DRAFT`, `SUBMITTED`, or `APPROVED` status.
  - Flaw observed in `directPost(row)` (lines 157-168): If `postRes` fails and status was `DRAFT` or `SUBMITTED`, it executed a client-side chained fallback: calling `/submit`, then `/approve`, and then retrying `/post`.
  - For `row.status === "APPROVED"`, it called `/post` directly without the chaining fallback.
- **`src/components/sales/sales-invoice-actions.tsx`**:
  - Line 151: Excludes `POSTED`, `REVERSED`, `CANCELLED`, `REJECTED`. An `APPROVED` invoice is not excluded and displays workflow buttons.
  - Line 159: Renders "⚡ Post Now to Stock & GL" button when `can("SALES_INVOICE_POST")`.
  - Flaw observed in `directPost()` (lines 95-106): Identical client-side chaining fallback calling `/submit` and `/approve` if initial post failed.
- **`src/app/api/sales/invoices/batch-post/route.ts`**:
  - Lines 25-34: Fetches invoices where `status: { in: [DRAFT, SUBMITTED, APPROVED] }`.
  - If executed with empty `invoiceIds`, it indiscriminately attempts to post all unposted invoices.
  - Auto-posting historical records like `ISB--SI-FY2026-27-000004` without explicit user intent violates historical safety guidelines.

---

## 2. Logic Chain

```
[Observation 1.1: ISB--SI-FY2026-27-000004 has status APPROVED, journalEntryId null, and 0 stock movements]
  │
  ├─► The invoice was created under the legacy maker-checker approval architecture.
  │
  ├─► The invoice was approved but never completed posting to inventory or General Ledger.
  │
  └─► Deductive Step 1: Invoice 000004 is an unposted commercial document requiring valid stock,
      customer, and GL accounts before it can be posted to the double-entry accounting ledger.

[Observation 1.4: PostgreSQL trigger enforce_operational_status_transition() allows APPROVED -> POSTED]
  │
  ├─► Trigger only blocks transitions from POSTED (except to REVERSED) and REVERSED.
  │
  └─► Deductive Step 2: The database layer will seamlessly permit APPROVED -> POSTED direct transition.
      No database trigger alteration or schema migration is needed for status eligibility.

[Observation 1.3: postSalesInvoice() currently updates DRAFT/SUBMITTED -> APPROVED before posting]
  │
  ├─► This intermediate status mutation is the exact architectural bug that created orphaned APPROVED invoices.
  │
  ├─► Under the new single-user / direct-posting architecture, approval workflow is completely eliminated.
  │
  └─► Deductive Step 3: Removing lines 454-465 in src/lib/operations/sales.ts allows postSalesInvoice()
      to accept DRAFT, SUBMITTED, and APPROVED directly as valid pre-posting states, transitioning
      them directly to POSTED in a single step with zero intermediate status mutations.

[Observation 1.1 & 1.5: Batch-post could blindly post historical invoices; UI has client-side chaining hack]
  │
  ├─► Invoice ISB--SI-FY2026-27-000004 must NOT be automatically posted during migrations or bulk jobs.
  │
  ├─► Authorized staff must retain the ability to inspect the invoice details and manually click "Post Now".
  │
  └─► Deductive Step 4:
      - Purge client-side /submit and /approve chaining hacks from sales-manager.tsx and sales-invoice-actions.tsx.
      - Ensure manual "Post Now" button directly invokes POST /api/sales/invoices/[id]/post.
      - Protect batch-post endpoint to prevent unintended auto-posting of historical records.

[Observation 1.2: Historical invoice number ISB--SI-FY2026-27-000004 has double hyphen]
  │
  ├─► New sequential document generation logic in accounting.ts correctly strips hyphens (ISB-SI-...).
  │
  └─► Deductive Step 5: Historical invoice numbers must remain static, untouched strings in the database.
      Never execute an UPDATE script to rename ISB--SI-FY2026-27-000004 to ISB-SI-FY2026-27-000004.
```

---

## 3. Caveats

1. **Physical Handset Stock Availability**:
   Invoice `ISB--SI-FY2026-27-000004` references specific `PhysicalStockUnit` handsets. If those physical units have since been sold on another invoice, transferred to another warehouse, or quarantined, attempting to manually post `ISB--SI-FY2026-27-000004` will throw `409 STOCK_UNIT_UNAVAILABLE`. This is correct, expected behavior that safeguards physical inventory custody from double-selling.
2. **Customer Credit Limit Validation**:
   If the customer associated with `ISB--SI-FY2026-27-000004` is inactive or has exceeded their credit limit, manual posting will enforce credit override authorization.
3. **Audit Log Trail**:
   When an authorized user manually posts `ISB--SI-FY2026-27-000004`, an append-only `AuditLog` entry (`SALES_INVOICE_POSTED`) will be created recording the poster's user ID and timestamp, providing full traceability without altering historical preparation logs.

---

## 4. Conclusion & Code Change Recommendations

### 4.1 Summary of Recommendations
1. **Treat `APPROVED` as Eligible for Direct Posting Alongside `DRAFT`**:
   In `src/lib/operations/sales.ts`, remove the intermediate update to `APPROVED` and validate that invoice status is in `[DRAFT, SUBMITTED, APPROVED]`. Transition directly to `POSTED`.
2. **Prevent Unauthorized Auto-Posting**:
   Do NOT run any background job or script to auto-post historical invoice `ISB--SI-FY2026-27-000004`. It remains unposted until an authorized user validates it and clicks "Post Now".
3. **Purge UI Chaining Hacks**:
   In `src/components/sales/sales-manager.tsx` and `src/components/sales/sales-invoice-actions.tsx`, remove the fallback calls to `/submit` and `/approve`. Make "Post Now" execute `POST /api/sales/invoices/${id}/post` directly.
4. **Preserve Historical Strings & Records**:
   Ensure `ISB--SI-FY2026-27-000004` is never renamed. Future invoices will continue to use the clean single-hyphen sequence `ISB-SI-FY2026-27-xxxxxx`.

---

### 4.2 Exact Code Change Specifications

#### Specification 1: `src/lib/operations/sales.ts`
- **Function**: `postSalesInvoice(actor: SalesActor, id: string)`
- **Target Lines**: 447–468
- **Rationale**: Eliminate the artificial intermediate status mutation to `APPROVED` and the maker-checker segregation-of-duties block. Allow direct posting from `DRAFT`, `SUBMITTED`, or historical `APPROVED` directly to `POSTED`.

```typescript
// BEFORE (lines 451-468):
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

// AFTER:
      const invoice = await lockSalesInvoice(tx, id, actor.companyId);
      if (!invoice) throw new ApiError(404, "SALES_INVOICE_NOT_FOUND", "Sales invoice was not found.");
      if (invoice.status === OperationalDocumentStatus.POSTED) return invoice;

      // Status eligibility check: DRAFT, SUBMITTED, and historical APPROVED invoices are eligible for direct posting
      const eligibleStatuses: OperationalDocumentStatus[] = [
        OperationalDocumentStatus.DRAFT,
        OperationalDocumentStatus.SUBMITTED,
        OperationalDocumentStatus.APPROVED,
      ];
      if (!eligibleStatuses.includes(invoice.status)) {
        throw new ApiError(
          409,
          "INVALID_DOCUMENT_STATE",
          `Sales invoice in ${invoice.status} status cannot be posted. Only Draft or Approved invoices may be posted.`
        );
      }

      if (invoice.customer.status !== "ACTIVE") throw new ApiError(409, "CUSTOMER_INACTIVE", "The customer is no longer active.");
```

- **Safety Guarantees**:
  - `CANCELLED`, `REVERSED`, or `REJECTED` invoices cannot be posted.
  - Historical invoices with `status: APPROVED` (like `000004`) post cleanly without throwing status validation errors.
  - Zero intermediate database writes occur before GL balancing and stock verification succeed.

---

#### Specification 2: `src/components/sales/sales-manager.tsx`
- **Function**: `directPost(row: any)`
- **Target Lines**: 154–173
- **Rationale**: Remove the client-side multi-request chaining hack (`/submit` -> `/approve` -> `/post`) so that the UI executes direct posting via a single HTTP request.

```typescript
// BEFORE (lines 154-173):
  async function directPost(row: any) {
    setActingId(row.id);
    try {
      let postRes = await fetch(`/api/sales/invoices/${row.id}/post`, { method: "POST" });
      if (!postRes.ok && (row.status === "DRAFT" || row.status === "SUBMITTED")) {
        if (row.status === "DRAFT") {
          await fetch(`/api/sales/invoices/${row.id}/submit`, { method: "POST" });
        }
        await fetch(`/api/sales/invoices/${row.id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Direct Post authorization" }),
        });
        postRes = await fetch(`/api/sales/invoices/${row.id}/post`, { method: "POST" });
      }

      const body = await postRes.json().catch(() => null);
      if (!postRes.ok) {
        return toast.error(body?.error?.message || "Failed to post sales invoice.");
      }

// AFTER:
  async function directPost(row: any) {
    setActingId(row.id);
    try {
      const postRes = await fetch(`/api/sales/invoices/${row.id}/post`, { method: "POST" });
      const body = await postRes.json().catch(() => null);
      if (!postRes.ok) {
        return toast.error(body?.error?.message || "Failed to post sales invoice.");
      }
```

- **Target Line 604**:
```typescript
// BEFORE:
{(row.status === "DRAFT" || row.status === "SUBMITTED" || row.status === "APPROVED") && can("SALES_INVOICE_CREATE") && (

// AFTER:
{(row.status === "DRAFT" || row.status === "SUBMITTED" || row.status === "APPROVED") && (can("SALES_INVOICE_POST") || can("SALES_INVOICE_CREATE")) && (
```

---

#### Specification 3: `src/components/sales/sales-invoice-actions.tsx`
- **Function**: `directPost()`
- **Target Lines**: 92–112
- **Rationale**: Remove client-side auto-approval chaining fallback in the invoice detail view action bar.

```typescript
// BEFORE (lines 92-112):
  async function directPost() {
    setActingId(true);
    try {
      let postRes = await fetch(`/api/sales/invoices/${invoice.id}/post`, { method: "POST" });
      if (!postRes.ok && (invoice.status === "DRAFT" || invoice.status === "SUBMITTED")) {
        if (invoice.status === "DRAFT") {
          await fetch(`/api/sales/invoices/${invoice.id}/submit`, { method: "POST" });
        }
        await fetch(`/api/sales/invoices/${invoice.id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Direct Post authorization" }),
        });
        postRes = await fetch(`/api/sales/invoices/${invoice.id}/post`, { method: "POST" });
      }

      const body = await postRes.json().catch(() => null);
      if (!postRes.ok) {
        return toast.error(body?.error?.message || "Failed to post sales invoice.");
      }

// AFTER:
  async function directPost() {
    setActing(true);
    try {
      const postRes = await fetch(`/api/sales/invoices/${invoice.id}/post`, { method: "POST" });
      const body = await postRes.json().catch(() => null);
      if (!postRes.ok) {
        return toast.error(body?.error?.message || "Failed to post sales invoice.");
      }
```

---

#### Specification 4: `src/app/api/approvals/route.ts`
- **Target Lines**: 16–27, 41, 70–79
- **Rationale**: Completely remove `SALES_INVOICE` from the central approval queue. Invoices are posted directly and do not enter approval queues.

```typescript
// In actionSchema (lines 16-27):
// Remove "SALES_INVOICE" from documentType enum:
const actionSchema = z.object({
  documentType: z.enum([
    "PURCHASE_ORDER",
    "PURCHASE_RECEIPT",
    "STOCK_TRANSFER",
    "STOCK_ADJUSTMENT",
    "PAYMENT",
    "JOURNAL",
    "BUDGET",
    "INCENTIVE",
    "REBATE",
  ]),
  // ...
});

// In GET (lines 70-79):
// Remove prisma.salesInvoice.findMany query from Promise.all array.
```

---

## 5. Verification Method

To independently verify the historical invoice safety and posting eligibility:

### 5.1 Automated Acceptance Tests
Run the comprehensive POS and sales test suites:
```bash
npx vitest run src/lib/operations/pos-acceptance.test.ts
npm test
```
- Verify Scenario 9 (`formatSequentialDocumentNumber`): confirms new invoices use `ISB-SI-FY2026-27-xxxxxx` while preserving historical double-hyphen numbers intact.
- Verify that no tests fail due to status checks.

### 5.2 Verification of Manual Posting for `APPROVED` Invoices
Execute an automated test or verification script:
1. Create or query an invoice with `status: APPROVED`.
2. Call `postSalesInvoice(actor, invoice.id)`.
3. Assertions:
   - Invoice transitions directly to `status: POSTED`.
   - `journalEntryId` is populated with a balanced `JournalEntry`.
   - Linked `PhysicalStockUnit` has `status: SOLD`.
   - `SalesInvoice.invoiceNumber` is unchanged (retains `ISB--SI-FY2026-27-000004`).
   - Audit trail contains `SALES_INVOICE_POSTED` with `actor.userId`.

### 5.3 Verification of Idempotency & Invalidation Conditions
1. Calling `postSalesInvoice` a second time on the posted invoice returns the record immediately without creating secondary journal lines or secondary inventory movements.
2. Attempting to post an invoice in `CANCELLED` status is rejected with `409 INVALID_DOCUMENT_STATE`.
3. Attempting to post an invoice whose physical unit has already been sold on another invoice is rejected with `409 STOCK_UNIT_UNAVAILABLE`.
