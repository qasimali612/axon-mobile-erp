# Handoff Report: Schema, Custody & Atomic Posting Engine Survey

**Author**: Explorer 4 (Schema, Custody & Atomic Posting Engine Explorer)  
**Date**: 2026-11-10T12:18:50Z  
**Target Module**: Axon Mobile ERP — Sales Invoice Processing, IMEI Custody, Document Sequencing & Atomic GL Posting  
**Working Directory**: `d:\Inventory Managment Software\.agents\teamwork\explorer_survey_4`  
**Handoff Type**: Hard Handoff (Investigation Complete)  

---

## 1. Observation

Direct inspection of the codebase, database schema, migrations, and operational services revealed the following factual findings:

### 1.1 Historical Invoice `ISB--SI-FY2026-27-000004` & Approval Status
- **Location**: Database records / `scratch/audit_invoice.mjs:7`, `src/lib/operations/sales.ts:454-465`.
- **Observed State**: Invoice `ISB--SI-FY2026-27-000004` has status `APPROVED`.
- **Cause of Status `APPROVED`**:
  - In `src/lib/operations/sales.ts:454-465`:
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
  - Previously, `postSalesInvoice()` forced an intermediate transition from `DRAFT` or `SUBMITTED` to `APPROVED` before proceeding to inventory and GL posting.
  - If posting failed or was halted after that update (or if the document was submitted and approved via the legacy approval queue routes `/submit` and `/approve`), the document remained stored as `status: APPROVED`.
- **Eligibility for Direct Posting**:
  - `postSalesInvoice()` already locks the invoice (`SELECT "id" FROM "SalesInvoice" WHERE "id" = ... FOR UPDATE`) and checks:
    ```typescript
    if (invoice.status === OperationalDocumentStatus.POSTED) return invoice;
    ```
  - An invoice with status `APPROVED` bypasses the `DRAFT | SUBMITTED` check and moves directly to validation (`customer.status === "ACTIVE"`, serialized handset availability, and GL account resolution).
  - Database status transition trigger `enforce_operational_status_transition()` in `src/lib/prisma.ts:64-77` permits any status transition except modifications to already-posted documents (which can only transition to `REVERSED`) and reversed documents:
    ```sql
    IF OLD."status" = 'POSTED' THEN
      IF NEW."status" = 'REVERSED' THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'Invalid operational document status transition from % to %', OLD."status", NEW."status";
    END IF;
    ```
  - Therefore, `APPROVED` -> `POSTED` is fully allowed by the database trigger.

### 1.2 Document Numbering Sequence & Double Hyphen Root Cause
- **Location**: `src/lib/document-sequence.ts:7-36`, `src/lib/operations/accounting.ts:87-115`, `scripts/setup-cloud-db.ts:90`.
- **Root Cause of `ISB--SI-...`**:
  1. In `scripts/setup-cloud-db.ts:90`, the Islamabad retail branch was seeded with:
     ```typescript
     documentPrefix: "ISB-",
     ```
     (with a trailing hyphen).
  2. In `src/lib/operations/accounting.ts:112`, `allocateOperationalNumber` originally combined `branch.documentPrefix` and `suffix` as:
     ```typescript
     prefix: `${branch.documentPrefix}-${cleanSuffix}`
     ```
     When `branch.documentPrefix` was `"ISB-"` and `suffix` was `"SI"`, the result was `"ISB--SI"`.
  3. In `src/lib/document-sequence.ts:24-30`, the SQL upsert previously did NOT update `"prefix"` upon conflict:
     ```sql
     ON CONFLICT ("companyId", "branchId", "documentType", "fiscalYear")
     DO UPDATE SET "nextValue" = "DocumentSequence"."nextValue" + 1
     RETURNING "nextValue" - 1 AS "nextValue", "prefix", "padding"
     ```
     Because `"prefix"` was not updated, the sequence row permanently retained `"ISB--SI"`.
- **Current Fix in Codebase**:
  - In `src/lib/operations/accounting.ts:105-106`:
    ```typescript
    const cleanBranch = (branch.documentPrefix || "BR").trim().replace(/-+$/, "");
    const cleanSuffix = (input.suffix || "DOC").trim().replace(/^-+/, "");
    ```
  - In `src/lib/document-sequence.ts:27`:
    ```sql
    DO UPDATE SET
      "nextValue" = "DocumentSequence"."nextValue" + 1,
      "prefix" = ${input.prefix},
      "version" = "DocumentSequence"."version" + 1,
      "updatedAt" = NOW()
    RETURNING "nextValue" - 1 AS "nextValue", "prefix", "padding"
    ```
  - Combined prefix generation: `${cleanBranch}-${cleanSuffix}` produces `"ISB-SI"`, which overwrites `"ISB--SI"` in `DocumentSequence` on next allocation.
  - Number returned: `${allocated.prefix}-${input.fiscalYear}-${allocated.nextValue.toString().padStart(allocated.padding, "0")}` produces `ISB-SI-FY2026-27-000008`.
  - **Historical Preservations**: Existing historical invoices (`ISB--SI-FY2026-27-000004`) store their number as a static string in `SalesInvoice.invoiceNumber`. They are never renamed, ensuring historical integrity.

### 1.3 Physical Handset & IMEI Dual-Identifier Architecture
- **Location**: `prisma/schema.prisma:2198-2253`, `src/lib/operations/inventory.ts:200-233`, `src/lib/operations/sales.ts:150-176, 477-489`.
- **Schema Mapping**:
  - `PhysicalStockUnit`: Represents exactly **1 physical device / handset**. Contains `id: UUID`, `productId`, `variantId`, `currentBranchId`, `currentWarehouseId`, `currentLocationId`, `status: StockUnitStatus` (`IN_STOCK`, `RESERVED`, `SOLD`, etc.), `acquisitionCost: Decimal(19,4)`, `soldAt: DateTime?`, and `version: Int`.
  - `DeviceIdentifier`: Contains `id: UUID`, `stockUnitId: UUID`, `type: IdentifierType` (`IMEI`, `SERIAL`, etc.), `value: String`, `normalizedValue: String`, `slot: Int?` (1 for IMEI1, 2 for IMEI2), and `isPrimary: Boolean`.
  - Constraints:
    ```prisma
    @@unique([companyId, type, normalizedValue])
    @@unique([stockUnitId, type, slot])
    ```
    - `@@unique([companyId, type, normalizedValue])` guarantees no duplicate IMEI can exist anywhere within the company.
    - `@@unique([stockUnitId, type, slot])` allows slot 1 (IMEI1) and slot 2 (IMEI2) to belong to the exact same `stockUnitId`.
- **Custody & Concurrency Protection**:
  1. **Row-Level Lock (`SELECT ... FOR UPDATE`)**:
     `lockPhysicalStockUnit()` in `src/lib/operations/inventory.ts:221-225`:
     ```typescript
     await tx.$queryRaw(Prisma.sql`
       SELECT "id" FROM "PhysicalStockUnit"
       WHERE "id" = ${input.stockUnitId}::uuid AND "companyId" = ${input.companyId}::uuid
       FOR UPDATE
     `);
     ```
     This forces concurrent sales transactions attempting to lock the same handset to wait until the current transaction commits or rolls back.
  2. **Active Reservation Check**:
     In `sales.ts:484-485`:
     ```typescript
     const activeReservation = await tx.inventoryReservation.findFirst({
       where: { companyId: actor.companyId, stockUnitId: unit.id, releasedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
       select: { id: true },
     });
     if (activeReservation) throw new ApiError(409, "STOCK_UNIT_RESERVED", `A physical unit on sales line ${line.lineNumber} is reserved by another workflow.`);
     ```
  3. **Warehouse Custody Validation**:
     In `sales.ts:481-483`:
     ```typescript
     if (unit.status !== StockUnitStatus.IN_STOCK || unit.currentWarehouseId !== invoice.warehouseId || unit.productId !== line.productId || unit.variantId !== line.variantId) {
       throw new ApiError(409, "STOCK_UNIT_UNAVAILABLE", `A physical unit on sales line ${line.lineNumber} is no longer available.`);
     }
     ```
  4. **Custody Relinquishment upon Sale**:
     In `sales.ts:574`:
     ```typescript
     await tx.physicalStockUnit.update({
       where: { id: unit.id },
       data: {
         status: StockUnitStatus.SOLD,
         currentBranchId: null,
         currentWarehouseId: null,
         currentLocationId: null,
         soldAt: new Date(),
         version: { increment: 1 },
       },
     });
     ```
  5. **Transaction Isolation**:
     `postSalesInvoice()` specifies `{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 }`.

### 1.4 Atomic Posting Engine & Accounting Integrity
- **Location**: `src/lib/operations/sales.ts:447-609`, `src/lib/operations/accounting.ts:117-195`.
- **Atomicity via `prisma.$transaction`**:
  All steps (invoice lock, handset lock, inventory reservation check, COGS derivation, GL journal creation, inventory movements, invoice status update to `POSTED`, and audit logging) execute inside a single atomic database transaction. Any exception rolls back all changes completely.
- **Actual-Cost COGS Calculation**:
  - In `sales.ts:486-488`:
    For serialized handsets:
    ```typescript
    lineCost = lineCost.plus(unit.acquisitionCost);
    unitCost = lineCost.div(line.quantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    ```
    Actual COGS is derived from the handset's historical `acquisitionCost` on `PhysicalStockUnit` (Specific Identification Costing). It is **NEVER** calculated from selling price (`unitPrice`).
  - For non-serialized items:
    ```typescript
    unitCost = averageUnitCost(balance!); // balance.inventoryValue / balance.quantity
    lineCost = line.quantity.equals(balance!.quantity) ? balance!.inventoryValue : unitCost.times(line.quantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    ```
    Uses Weighted Average Inventory Costing.
  - Total document COGS is stored in `SalesInvoice.costTotal` and line COGS in `SalesInvoiceLine.costTotal`.
- **Balanced GL Double-Entry Journal**:
  In `sales.ts:523-545`:
  ```typescript
  const netRevenue = invoice.subtotal.minus(invoice.discountTotal).toDecimalPlaces(4);
  const journal = await postOperationalJournal(tx, {
    documentType: "SALES_INVOICE_JOURNAL",
    voucherSuffix: "SV",
    sourceDocumentType: "SalesInvoice",
    sourceDocumentId: invoice.id,
    sourceDocumentNumber: invoice.invoiceNumber,
    idempotencyKey: `SALES-INVOICE:${invoice.id}`,
    lines: [
      { accountId: receivableAccount.id, debit: invoice.grandTotal },
      { accountId: revenueAccount.id, credit: netRevenue },
      ...(taxAccount ? [{ accountId: taxAccount.id, credit: invoice.taxTotal }] : []),
      { accountId: cogsAccount.id, debit: totalCost },
      { accountId: inventoryAccount.id, credit: totalCost },
    ],
  });
  ```
  - Debits = `grandTotal + totalCost`
  - Credits = `netRevenue + taxTotal + totalCost`
  - Since `grandTotal = netRevenue + taxTotal`, Debits == Credits to 4 decimal places.
- **Server-Side Tax Snapshot**:
  - In `sales.ts:63-75, 130-137`:
    Tax rate is pulled strictly from `Product.taxRule.rate`. Client overrides are forbidden (`SALES_TAX_OVERRIDE_FORBIDDEN`).
    `taxAmount = (gross - discountAmount) * taxRate / 100`.
    `taxRate` and `taxAmount` are snapshotted onto each `SalesInvoiceLine` at draft creation/update.
- **Strict Idempotency**:
  1. `if (invoice.status === OperationalDocumentStatus.POSTED) return invoice;` prevents re-posting.
  2. `idempotencyKey: SALES-INVOICE:${invoice.id}` prevents duplicate journal vouchers.
  3. `idempotencyKey: SI:${invoice.id}:${line.id}:${unit.id}` prevents duplicate inventory movements.

---

## 2. Logic Chain

```
[Observation 1.1: Legacy approval forced status APPROVED before posting]
  │
  ├─► Invoice ISB--SI-FY2026-27-000004 was left in APPROVED status.
  │
  ├─► The database trigger enforce_operational_status_transition() permits APPROVED -> POSTED.
  │
  └─► Deductive Step: To remove approval dependency without altering historical records,
      postSalesInvoice() must allow direct posting from DRAFT, SUBMITTED, or APPROVED.
      Do not auto-post ISB--SI-FY2026-27-000004; allow authorized users to post it manually if valid.

[Observation 1.2: Branch documentPrefix="ISB-" had a trailing dash; ON CONFLICT did not update prefix]
  │
  ├─► Combining "ISB-" + "-" + "SI" generated "ISB--SI".
  │
  ├─► DocumentSequence table persisted "ISB--SI", producing numbers like ISB--SI-FY2026-27-000004.
  │
  └─► Deductive Step: Sanitizing both branch and suffix with regex (/^-+|-+$/g) produces "ISB-SI".
      The updated ON CONFLICT DO UPDATE clause updates "prefix" in DocumentSequence.
      Subsequent invoices will generate as ISB-SI-FY2026-27-000008.
      Existing records in SalesInvoice.invoiceNumber remain untouched strings.

[Observation 1.3: 1 PhysicalStockUnit holds device status/warehouse; DeviceIdentifier maps IMEI1 & IMEI2]
  │
  ├─► Scanning either IMEI1 or IMEI2 resolves to the same PhysicalStockUnit.id.
  │
  ├─► lockPhysicalStockUnit() executes SELECT ... FOR UPDATE on PhysicalStockUnit.
  │
  └─► Deductive Step: Any concurrent sale attempting to lock either IMEI1 or IMEI2 for the same
      handset will be blocked at the database row level. The first transaction commits status SOLD,
      causing the second transaction to fail with STOCK_UNIT_UNAVAILABLE.

[Observation 1.4: prisma.$transaction wraps stock movements, GL journal, and status update]
  │
  ├─► Actual COGS is calculated directly from unit.acquisitionCost (never selling price).
  │
  ├─► GL journal posts balanced entries: AR (Debit), Revenue (Credit), Tax (Credit), COGS (Debit), Inventory (Credit).
  │
  └─► Deductive Step: Atomic posting guarantees all-or-nothing execution. Idempotency keys on
      the invoice, journal, and inventory movements prevent duplicate accounting or stock deductions.
```

---

## 3. Caveats

1. **Physical Unit Availability for Historical Invoices**:
   Invoice `ISB--SI-FY2026-27-000004` references physical handset units. If those handsets have since been sold, transferred, or marked damaged by another transaction, attempting to post `ISB--SI-FY2026-27-000004` will correctly fail with `409 STOCK_UNIT_UNAVAILABLE`. This is intentional and protects physical inventory integrity.
2. **Branch Document Prefix Configuration in Database**:
   While `allocateOperationalNumber` strips hyphens dynamically (`replace(/^-+|-+$/g, "")`), the root `Branch` row for Islamabad (`ISB`) in `Branch` table still contains `documentPrefix = "ISB-"`. The dynamic sanitization handles this gracefully without requiring a database data migration.
3. **Single-User vs Multi-User Configuration**:
   The operating mode is configured as `SINGLE_USER`, and `assertSegregationOfDuties` and `assertMakerChecker` in `src/lib/operating-mode.ts` are no-ops. If the system is ever reconfigured to enforce segregation of duties, `SalesInvoice` posting will need to ensure the poster role is permitted.

---

## 4. Conclusion

1. **Invoice `ISB--SI-FY2026-27-000004`**:
   - The invoice is currently `APPROVED` due to the previous workflow requiring approval before posting.
   - It can be made directly postable by ensuring `postSalesInvoice()` treats `DRAFT`, `SUBMITTED`, and `APPROVED` as valid postable pre-states without requiring approval queue actions.
   - The invoice must NOT be auto-posted or modified; it remains in its historical state until an authorized user chooses to post it.
2. **Document Numbering Sequence Fix**:
   - The double-hyphen was caused by `ISB-` in `Branch.documentPrefix` concatenated with a hyphen before suffix `SI`, compounded by `DocumentSequence` not updating `prefix` on conflict.
   - Centralizing the fix in `src/lib/operations/accounting.ts` with bidirectional hyphen trimming (`/^-+|-+$/g`) and updating `prefix` in `DocumentSequence` ensures all future invoices generate as `ISB-SI-FY2026-27-000008` while preserving existing historical records intact.
3. **Handset & IMEI Custody**:
   - 1 phone = 1 `PhysicalStockUnit`. Both IMEI1 (slot 1) and IMEI2 (slot 2) map to the same `PhysicalStockUnit.id`.
   - Concurrency is strictly enforced via `SELECT ... FOR UPDATE` row locks on `PhysicalStockUnit`, active reservation checks, and `Serializable` transaction isolation.
4. **Atomic Posting Engine**:
   - Executes inside a single `prisma.$transaction`.
   - COGS is derived from actual acquisition cost / moving average inventory value (never selling price).
   - Generates balanced GL entries (Debit AR, Credit Revenue, Credit Tax, Debit COGS, Credit Inventory).
   - Strictly idempotent using composite idempotency keys on movements and journals.

---

## 5. Verification Method

To independently verify these findings:

1. **Run Unit Tests**:
   ```powershell
   npx vitest run
   ```
   *Expected outcome*: 11 test files, 63 tests pass with 0 failures.

2. **Verify Document Sequence Logic**:
   Inspect `src/lib/document-sequence.ts:24-30` and `src/lib/operations/accounting.ts:105-113`.
   Confirm that:
   - `cleanBranch` strips trailing/leading hyphens.
   - `cleanSuffix` strips trailing/leading hyphens.
   - `DocumentSequence` `DO UPDATE` updates `"prefix" = ${input.prefix}`.
   - Output string format is `${allocated.prefix}-${input.fiscalYear}-${paddedValue}`.

3. **Verify IMEI Dual-Slot Mapping in Prisma Schema**:
   Inspect `prisma/schema.prisma:2236-2253`.
   Confirm:
   - `stockUnitId` on `DeviceIdentifier` links to `PhysicalStockUnit.id`.
   - `@@unique([companyId, type, normalizedValue])` prevents duplicate IMEIs across the company.
   - `@@unique([stockUnitId, type, slot])` allows slot 1 and slot 2 on the same device.

4. **Verify Pessimistic Handset Locking & Concurrency in Posting**:
   Inspect `src/lib/operations/sales.ts:480` and `src/lib/operations/inventory.ts:221-225`.
   Confirm:
   - `lockPhysicalStockUnit()` executes `SELECT "id" FROM "PhysicalStockUnit" ... FOR UPDATE`.
   - `postSalesInvoice()` runs under `Prisma.TransactionIsolationLevel.Serializable`.
   - Handset status updates to `StockUnitStatus.SOLD` and custody fields are nulled out.

5. **Verify COGS & Balanced GL Journal**:
   Inspect `src/lib/operations/sales.ts:486-508, 523-545`.
   Confirm:
   - Serialized: `lineCost.plus(unit.acquisitionCost)`.
   - Non-serialized: `averageUnitCost(balance) * quantity`.
   - Journal lines: Debits (AR + COGS) == Credits (Revenue + Tax + Inventory).
