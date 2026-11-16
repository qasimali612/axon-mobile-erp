# Backend, Database & Accounting Survey Report

**Module**: POS Counter Terminal, Sales Invoices, Inventory Ledger & Financial Accounting  
**Working Directory**: `d:\Inventory Managment Software\.agents\teamwork\teamwork_explorer_survey_backend\`  
**Date**: 2026-11-09T18:28:00Z  
**Author**: Backend & Accounting Explorer (`teamwork_explorer_survey_backend`)

---

## 1. Observation

### 1.1 Database Schema & Entity Relationships
- **File**: `prisma/schema.prisma` (3,433 lines, 94 models, 33 enums)
- **Core Entities & Model Constraints**:
  - **`PhysicalStockUnit`** (lines 2198–2234):
    - Status enum: `StockUnitStatus` (`IN_STOCK`, `RESERVED`, `IN_TRANSIT`, `SOLD`, `RETURNED`, `QUARANTINED`, `SCRAPPED`). Note: No `"AVAILABLE"` enum value exists.
    - Fields: `currentBranchId`, `currentWarehouseId` (Note: Field is named `currentWarehouseId`, NOT `warehouseId`), `currentLocationId`, `acquisitionCost` (`Decimal(19,4)`), `soldAt` (`DateTime?`), `version` (`Int @default(0)` for optimistic concurrency).
    - Unique indexes: `@@index([companyId, status, currentWarehouseId])`, `@@index([companyId, productId, variantId])`.
  - **`DeviceIdentifier`** (lines 2236–2253):
    - Fields: `stockUnitId`, `type` (`IdentifierType`: `IMEI`, `SERIAL`, `MAC`, `OTHER`), `value`, `normalizedValue`, `slot` (`Int?`, 1 for IMEI1, 2 for IMEI2), `isPrimary` (`Boolean`).
    - Uniqueness: `@@unique([companyId, type, normalizedValue])` enforces that an IMEI value can only be registered once per company.
    - Slot uniqueness: `@@unique([stockUnitId, type, slot])` ensures one unit cannot have two identifiers in the same slot.
  - **`StockBalance`** (lines 2279–2302):
    - Fields: `quantity` (`Decimal(19,4)`), `inventoryValue` (`Decimal(19,4)`), `balanceKey`, `version`.
    - Uniqueness: `@@unique([companyId, balanceKey])`, `@@index([companyId, warehouseId, productId, variantId])`.
  - **`InventoryMovement`** (lines 2304–2350):
    - Fields: `movementType` (`InventoryMovementType`: `SALE_ISSUE`, `SALES_RETURN`, etc.), `quantity`, `unitCost`, `totalCost`, `stockUnitId`, `journalEntryId`, `reversalOfId`, `idempotencyKey` (`@@unique([companyId, idempotencyKey])`).
  - **`SalesInvoice` & `SalesInvoiceLine` & `SalesInvoiceUnit`** (lines 2879–2972):
    - `SalesInvoice.status`: `OperationalDocumentStatus` (`DRAFT`, `SUBMITTED`, `INSPECTION`, `APPROVED`, `PARTIALLY_RECEIVED`, `FULLY_RECEIVED`, `POSTED`, `CLOSED`, `REJECTED`, `CANCELLED`, `REVERSED`).
    - Note: There is **no separate `PaymentStatus` column** on `SalesInvoice`. Payment status is computed dynamically from `allocations` (`PaymentAllocation`).
    - Link to accounting: `journalEntryId String? @unique @db.Uuid`.
    - Link to reversal: `reversalOfId String? @unique @db.Uuid`.
    - `SalesInvoiceUnit`: `@@unique([invoiceLineId, stockUnitId])` enforces that a physical unit cannot appear twice on the same invoice line.
  - **`Payment` & `PaymentAllocation`** (lines 3072–3140):
    - `Payment.direction`: `PaymentDirection` (`CUSTOMER_RECEIPT`, `SUPPLIER_PAYMENT`, `CUSTOMER_REFUND`, `SUPPLIER_REFUND`).
    - Accounts: `cashAccountId` (`Account?`), `bankAccountId` (`BankAccount?`), `paymentMethodId` (`PaymentMethod?`), `journalEntryId` (`JournalEntry?`).
    - `PaymentAllocation`: `paymentId`, `salesInvoiceId`, `amount` (`Decimal(19,4)`).
  - **`JournalEntry` & `JournalEntryLine`** (lines 1286–1400):
    - `JournalEntry`: `voucherNumber`, `voucherType` (`JournalType`), `status` (`JournalStatus`: `DRAFT`, `SUBMITTED`, `APPROVED`, `POSTED`, `CANCELLED`, `REVERSED`), `sourceModule`, `sourceDocumentType`, `sourceDocumentId`, `sourceDocumentNumber`, `totalDebit`, `totalCredit`.
    - `JournalEntryLine`: `accountId`, `branchId`, `customerId` (critical for Customer Subledger), `salespersonId`, `debit`, `credit`, `baseDebit`, `baseCredit`, `invoiceNumber`, `dueDate`.
  - **Missing Models in Schema**:
    - There are **no tables for `POSTerminal` or `POSShift`** in `prisma/schema.prisma`.
    - There is **no table for `ParkedSale`**; parked carts currently save as draft `SalesInvoice` records.

### 1.2 POS Sale Submission & Sales Invoice Workflow
- **File**: `src/lib/operations/sales.ts`
  - Lines 185–245 (`createSalesDraftInvoice`): Creates draft invoice with status `DRAFT`, assigns sequential invoice number via `allocateOperationalNumber`, records audit log with `metadata: { stockEffect: "NONE_UNTIL_POSTING" }`. Draft creation creates zero inventory movements and zero journal entries.
  - Lines 384–404 (`submitSalesInvoice`): Transitions status to `SUBMITTED`. Validates discount cap (`assertDiscountCap`) and approval policy (`assertApprovalPolicy`).
  - Lines 407–444 (`approveSalesInvoice`): Transitions status to `APPROVED`. Checks customer credit limits (lines 414–438) against posted journal entries on `ACCOUNTS_RECEIVABLE` control account.
  - Lines 447–609 (`postSalesInvoice`):
    - Enclosed in `prisma.$transaction({ isolationLevel: Serializable, maxWait: 10_000, timeout: 30_000 })`.
    - Locks invoice via `lockSalesInvoice` (`SELECT ... FOR UPDATE`).
    - Idempotency: If `invoice.status === POSTED`, returns immediately without re-processing (line 453).
    - Status bypass hack (lines 454–465): If `DRAFT` or `SUBMITTED`, updates status to `APPROVED` on the fly.
    - Line 466: Calls `assertSegregationOfDuties` (which is a no-op in `src/lib/operating-mode.ts`).
    - Handset / Serialized Unit Processing (lines 477–488):
      - Verifies `line.quantity.isInteger()` and `line.units.length === line.quantity.toNumber()`.
      - Locks each `PhysicalStockUnit` using `lockPhysicalStockUnit` (`SELECT ... FOR UPDATE`).
      - Validates: `unit.status === IN_STOCK`, `unit.currentWarehouseId === invoice.warehouseId`, `unit.productId === line.productId`, `unit.variantId === line.variantId`.
      - Verifies unit is not held in `inventoryReservation`.
      - COGS: Computes actual acquisition cost `lineCost = lineCost.plus(unit.acquisitionCost)`.
    - Non-Serialized Product Processing (lines 489–505):
      - Locks `StockBalance` using `SELECT "id" FROM "StockBalance" ... FOR UPDATE`.
      - Checks `assertSufficientBalance(balance, line.quantity)`.
      - Checks active reservations `inventoryReservation.aggregate`.
      - Computes weighted average unit cost `averageUnitCost(balance)`.
    - General Ledger Entry (lines 523–545):
      - Creates balanced `JournalEntry` via `postOperationalJournal`:
        - **DR** Accounts Receivable (`ACCOUNTS_RECEIVABLE`): `invoice.grandTotal` (tagged with `customerId: invoice.customerId`, `invoiceNumber`, `dueDate`).
        - **CR** Sales Revenue (`SALES_REVENUE`): `netRevenue` (`invoice.subtotal - invoice.discountTotal`).
        - **CR** Output Tax (`TAX_PAYABLE`): `invoice.taxTotal` (if `taxTotal > 0`).
        - **DR** Cost of Goods Sold (`COGS`): `totalCost`.
        - **CR** Inventory Asset (`INVENTORY`): `totalCost`.
      - Total Debit = `GrandTotal + TotalCost`. Total Credit = `(NetRevenue + TaxTotal) + TotalCost = GrandTotal + TotalCost`. Balance is exact to 4 decimal places.
    - Inventory Movements & Custody Update (lines 547–598):
      - For handsets: Creates `InventoryMovement` with `movementType: SALE_ISSUE`, `quantity: "-1"`, `unitCost: unit.acquisitionCost`. Updates `PhysicalStockUnit`: `status: SOLD`, `currentBranchId: null`, `currentWarehouseId: null`, `currentLocationId: null`, `soldAt: new Date()`, `version: increment`.
      - For accessories: Creates `InventoryMovement` with `movementType: SALE_ISSUE`, `quantity: -line.quantity`, `totalCost: -cost.total`.
    - Final state update (lines 599–603): Sets `SalesInvoice.status = POSTED`, `journalEntryId = journal.id`, `postedById = actor.userId`, `postedAt = new Date()`.

### 1.3 The Core Counter Flaw: Multi-Request HTTP Chaining
- **File**: `src/components/sales/pos-workspace.tsx` lines 380–515
  - When cashier completes a sale, the browser executes up to 8 sequential HTTP requests:
    1. `POST /api/sales/invoices` (creates Draft)
    2. `POST /api/sales/invoices/${id}/submit`
    3. `POST /api/sales/invoices/${id}/approve`
    4. `POST /api/sales/invoices/${id}/post` (deducts stock and posts commercial journal)
    5. `POST /api/payments` (creates Payment Draft with allocation)
    6. `POST /api/payments/${payId}/submit`
    7. `POST /api/payments/${payId}/approve`
    8. `POST /api/payments/${payId}/post` (posts receipt journal to Cash in Hand)
- **Payment Allocation Requirement**:
  - `src/lib/operations/payments.ts` lines 270–273:
    ```ts
    if (allocation.salesInvoice) {
      if (allocation.salesInvoice.companyId !== payment.companyId ||
          allocation.salesInvoice.customerId !== payment.customerId ||
          allocation.salesInvoice.status !== OperationalDocumentStatus.POSTED ||
          allocation.salesInvoice.reversalOfId !== null) {
        throw new ApiError(409, "INVALID_ALLOCATION", "A sales allocation does not reference a posted invoice for this customer.");
      }
    ```
  - Payment cannot be allocated to an invoice unless the invoice is already `POSTED`.
  - When payment posting fails mid-flight (due to network glitch, approval policy, or maker-checker triggers):
    - The sales invoice remains `POSTED` (inventory deducted, AR debited).
    - The payment voucher remains `SUBMITTED` or unposted.
    - Because `src/lib/finance/cash-in-hand.ts` lines 68 & 86 queries only `entry.status IN ('POSTED', 'REVERSED')`, the unposted receipt generates **no journal line**, causing cash received to be **completely missing from Cash in Hand reports**!

### 1.4 Device Custody & IMEI Scanning Engine
- **File**: `src/app/api/operations/catalog/resolve/route.ts` lines 29–88
  - Resolves barcode/IMEI with `mode=sale`:
    ```ts
    const identifier = await prisma.deviceIdentifier.findFirst({
      where: { companyId: context.company.id, normalizedValue: normalized },
      include: { stockUnit: { include: { product: true, variant: true, currentWarehouse: true, identifiers: true, salesUnits: true } } }
    });
    ```
  - Scanning either IMEI1 or IMEI2 resolves to the same `identifier.stockUnit.id`.
  - Enforces custody guards:
    - If `unit.status === SOLD`: throws `409 DEVICE_ALREADY_SOLD` with previous invoice number and customer name.
    - If `unit.status === RESERVED`: throws `409 DEVICE_RESERVED`.
    - If `unit.status === QUARANTINED`: throws `409 DEVICE_QUARANTINED`.
    - If `unit.status === IN_TRANSIT`: throws `409 DEVICE_IN_TRANSIT`.
    - If `warehouseId && unit.currentWarehouseId !== warehouseId`: throws `409 DEVICE_WRONG_WAREHOUSE`.
    - If `unit.status !== IN_STOCK`: throws `409 DEVICE_UNAVAILABLE`.
  - **Defect in Catalog Search (`src/app/api/operations/catalog/search/route.ts`)**:
    - Lines 26–34 query `deviceIdentifier.findMany` with:
      ```ts
      stockUnit: {
        companyId: context.company.id,
        ...(warehouseId ? { warehouseId } : {}),        // BUG: Property is currentWarehouseId, not warehouseId
        ...(mode === "sale" ? { status: "IN_STOCK" } : {}),
      }
      ```
    - In Prisma schema, `PhysicalStockUnit` has no field `warehouseId`; querying `stockUnit: { warehouseId }` triggers a Prisma runtime validation error when `warehouseId` is provided.

### 1.5 Document Numbering Sequence
- **File**: `src/lib/document-sequence.ts` lines 18–35
  - Under row lock:
    ```sql
    INSERT INTO "DocumentSequence" (...) VALUES (...)
    ON CONFLICT ("companyId", "branchId", "documentType", "fiscalYear")
    DO UPDATE SET "nextValue" = "DocumentSequence"."nextValue" + 1, "prefix" = ${input.prefix}, "version" = "DocumentSequence"."version" + 1
    RETURNING "nextValue" - 1 AS "nextValue", "prefix", "padding"
    ```
  - Format: `${allocated.prefix}-${input.fiscalYear}-${allocated.nextValue.toString().padStart(allocated.padding, "0")}`
  - **Duplicate separator cause**:
    - In `src/lib/operations/accounting.ts`, previously `prefix: \`${branch.documentPrefix}-${input.suffix}\``.
    - If `branch.documentPrefix` stored in DB was `"ISB-"`, the prefix became `"ISB--SI"`.
    - Because `ON CONFLICT` did not previously update `"prefix"`, once `"ISB--SI"` was recorded in `DocumentSequence`, all subsequent numbers retained the double hyphen (e.g. `ISB--SI-FY2026-27-000004`).
    - Fix already present in working copy: Stripping trailing/leading hyphens (`cleanBranch = branch.documentPrefix.trim().replace(/-+$/, "")`) and updating `"prefix"` in the upsert.

### 1.6 Accounts Receivable & Subledger Reconciliation
- **File**: `src/lib/finance/subledger.ts` lines 67–130
  - General Ledger AR balance: `SUM(baseDebit - baseCredit)` on `ACCOUNTS_RECEIVABLE` control account where `JournalEntry.status IN ('POSTED', 'REVERSED')`.
  - Customer Open Documents:
    ```sql
    openAmount = d."grandTotal" - COALESCE(r.amount, 0) - COALESCE(p.amount, 0)
    ```
    Where `r.amount` is posted `StockReturn` and `p.amount` is posted `PaymentAllocation`.
  - Condition: `d."status" IN ('POSTED', 'REVERSED') AND d."reversalOfId" IS NULL`.
  - **Draft, unposted, or cancelled invoices never affect AR balances or subledgers.**

### 1.7 Database Migrations & Safety
- **Prisma Migrations**: 44 migrations present in `prisma/migrations/`.
- Latest migrations:
  - `20261108000100_single_user_maker_checker`
  - `20261109180000_disable_maker_checker_triggers`: replaced `enforce_document_maker_checker()` trigger with a no-op returning `NEW`.
  - `20261109190000_remove_voucher_and_allow_payment_delete`: cleanly deleted orphan voucher `ISB--RC-FY2026-27-000006`.
- **Historical invoice `ISB--SI-FY2026-27-000004`**:
  - Database status is `APPROVED`.
  - Historical reference must not be renamed or deleted.
  - Making `postSalesInvoice` accept `APPROVED` or `DRAFT` directly without maker-checker/approval-queue dependency makes `ISB--SI-FY2026-27-000004` eligible for immediate posting by authorized staff when requested.

### 1.8 Existing Test Suites & Quality Checks
- `npm test` (`vitest run`): 11 test files, 63 unit tests pass in 2.67s.
- `npm run typecheck`: Fails on 1 file:
  `src/app/(erp)/sales/[id]/receipt/page.tsx(130,27): error TS2339: Property 'address' does not exist on type 'Branch'`.
  (Branch has `addressLine1` and `addressLine2`).

---

## 2. Logic Chain

1. **Why Cash in Hand Was Missing Cash Receipts**:
   - POS checkout completed invoice creation and posted the invoice, but the follow-up payment voucher remained in `SUBMITTED` state or failed on chained approve/post.
   - `src/lib/finance/cash-in-hand.ts` filters strictly on posted journal lines (`status: { in: ['POSTED', 'REVERSED'] }`).
   - Because the payment never posted to GL, zero debits were recorded against Account 1000 (Cash on Hand).
   - Therefore, Cash in Hand showed Rs 0 for that receipt.

2. **Why a Single Atomic `/api/pos/checkout` Endpoint is Required**:
   - Splitting sale creation and payment across 8 separate client HTTP requests introduces network vulnerability, latency (2–4 seconds), race conditions on device custody, and orphan unposted payments.
   - Wrapping invoice creation, inventory deduction, custody update, COGS entry, and payment receipt into a **single database transaction** guarantees all-or-nothing atomicity.
   - If payment validation fails, the invoice rolls back completely.
   - If checkout succeeds, cash in hand and customer AR update instantaneously.

3. **Why Handset Cart Lines Must Be Strictly 1 Unit per Line**:
   - `pos-workspace.tsx` line 268 currently groups multiple physical handsets of the same variant into a single line with `quantity > 1` and `stockUnitIds: [id1, id2]`.
   - The user specification mandates: "Handset cart quantity is strictly fixed at 1 per physical stock unit; selling two identical models requires two separate available physical units."
   - Handset lines must never support manual quantity editing or multi-unit grouping; each scanned handset must occupy its own row with quantity locked to 1.

4. **Why Double Hyphens Occurred in Document Sequences**:
   - `cleanBranch` previously concatenated `branch.documentPrefix` (`ISB-`) and `input.suffix` (`SI`) into `ISB--SI`.
   - `DocumentSequence` retained `prefix = 'ISB--SI'` on conflicts.
   - Enforcing string sanitization (`.trim().replace(/-+$/, "")`) on branch prefix and (`.trim().replace(/^-+/, "")`) on suffix guarantees clean single-hyphen sequence formatting (`ISB-SI-FY2026-27-000001`).

5. **Why Shift Management Must Be Modeled Cleanly**:
   - Requirement R5 mandates shift tracking (opening float, sales, refunds, expected vs actual cash reconciliation).
   - `prisma/schema.prisma` currently has no `POSTerminal` or `POSShift` model.
   - Shift tracking can be implemented with dedicated Prisma models (`PosTerminal`, `PosShift`) or lightweight state backed by existing cash registers.

---

## 3. Caveats

1. **Database Runtime**: The local development database runs via `@electric-sql/pglite` socket server at `127.0.0.1:54329` with persistent data in `./.pglite/axon-erp`. Standalone scripts querying the DB directly can instantiate `new PGlite('./.pglite/axon-erp')` or connect through `DATABASE_URL` when `pglite-server` is listening.
2. **Historical Invoices**: Historical documents (e.g. `ISB--SI-FY2026-27-000004` and prior migrations) must remain unmodified.
3. **No Project Code Write Permission**: In accordance with the explorer archetype, no source files outside `.agents/teamwork/teamwork_explorer_survey_backend/` were altered.

---

## 4. Conclusion

The Axon Mobile ERP backend and accounting engine possesses strong foundational controls (serializable transactions, row-level locks, double-entry GL balancing, and specific identification COGS). However, to fulfill the POS counter terminal and direct posting requirements, the following architectural fixes are necessary:

1. **Implement Single Atomic POS Checkout Endpoint (`POST /api/pos/checkout`)**:
   - Combine draft creation, IMEI custody check, stock deduction, COGS journal posting, payment voucher creation, payment allocation, and cash journal posting into a single atomic transaction under 250ms.
2. **Eliminate All Residual Approval Checks in Sales & Payments**:
   - Remove maker-checker and approval queue dependencies from `postSalesInvoice` and `postPayment`.
   - Keep document statuses strictly: `DRAFT`, `POSTED`, `CANCELLED`, `REVERSED`.
   - Make `ISB--SI-FY2026-27-000004` directly postable without requiring approval queue transition.
3. **Fix Catalog Search Bug in `src/app/api/operations/catalog/search/route.ts`**:
   - Change `warehouseId` to `currentWarehouseId` and `status: "AVAILABLE"` to `status: "IN_STOCK"`.
4. **Fix Branch Property in Thermal Receipt (`src/app/(erp)/sales/[id]/receipt/page.tsx`)**:
   - Replace `branch.address` with `branch.addressLine1` to fix the `npm run typecheck` error.
5. **Support Multi-Tender Payment Allocation**:
   - Allow an array of tender payments (Cash, Card POS, Mobile Wallet, Credit) in `POST /api/pos/checkout` and allocate each to the invoice with corresponding GL journal lines.
6. **Enforce Single Separator Document Numbering**:
   - Ensure all document prefixes strictly sanitize leading/trailing hyphens to format numbers as `ISB-SI-FY2026-27-000001`.
7. **Add POS Shift Tracking**:
   - Add models/services to track cashier shifts, opening drawer cash, cash transactions, and closing cash counts with reconciliation.

---

## 5. Verification Method

To independently verify all observations and conclusions:

1. **Typecheck Verification**:
   ```powershell
   npm run typecheck
   ```
   *Expected result*: Exactly 2 errors in `src/app/(erp)/sales/[id]/receipt/page.tsx` line 130 and 132 (`Property 'address' does not exist on type 'Branch'`).

2. **Unit Test Suite Verification**:
   ```powershell
   npm test
   ```
   *Expected result*: 11 test files pass, 63 tests pass.

3. **Verify Prisma Schema Models & Fields**:
   - View `prisma/schema.prisma` lines 2198–2253: Note `PhysicalStockUnit.currentWarehouseId` (not `warehouseId`) and `StockUnitStatus` enums (`IN_STOCK`, `SOLD`, etc. - no `AVAILABLE`).
   - View `prisma/schema.prisma` lines 2879–2972: Note `SalesInvoice` relations and absence of `PaymentStatus` column.

4. **Verify POS Chained Calls vs Direct Posting**:
   - View `src/components/sales/pos-workspace.tsx` lines 380–515: Verify 8 chained HTTP requests.
   - View `src/lib/operations/sales.ts` lines 447–608: Verify `postSalesInvoice` atomic inventory deduction and balanced GL entries.
   - View `src/lib/operations/payments.ts` lines 270–273: Verify that `validateAllocations` rejects allocations to unposted invoices.

5. **Verify Cash in Hand Dependency on Posted Journals**:
   - View `src/lib/finance/cash-in-hand.ts` lines 68 & 86: Verify that only `JournalStatus.POSTED` and `REVERSED` entries contribute to cash movements.
