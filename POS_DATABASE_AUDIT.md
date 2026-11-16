# POS Database, Prisma Schema & Concurrency Technical Audit Report

**System**: Axon Mobile ERP Retail Point of Sale (POS) Counter Terminal  
**Auditor**: Teamwork Architecture & Audit Group (`worker_m1`)  
**Date**: 2026-11-10T12:23:00Z  
**Repository Working Directory**: `d:\Inventory Managment Software`  
**Audit Scope**: Database Schema Topology, Prisma ORM Models, Concurrency Controls, Row-Level Locking, Historical Data Preservation, and Schema Roadmap

---

## 1. Schema Topology & Database Statistics

Axon Mobile ERP relies on PostgreSQL 16 (accessed via `@electric-sql/pglite` socket server at `127.0.0.1:54329`) managed through Prisma ORM 6.19.3.
- **Schema File**: `prisma/schema.prisma` (3,433 lines of definitions).
- **Entities**: 94 database models and 33 enums.
- **Migration History**: 44 migrations recorded in `prisma/migrations/`.
- **Financial Precision Standard**: All monetary values, quantities, unit costs, and valuations are strictly defined as `Decimal @db.Decimal(19, 4)` to eliminate floating-point drift and guarantee sub-cent accuracy.

The database architecture is designed with high data integrity: relational integrity, strict uniqueness constraints, append-only immutable audit journals, and pessimistic row locking for concurrent inventory reservations.

---

## 2. In-Depth Audit of Existing Core Models

### 2.1 Serialized Device Inventory: `PhysicalStockUnit` & `DeviceIdentifier`

#### `PhysicalStockUnit` Model (`prisma/schema.prisma` lines 2198–2234)
Represents a single, physical mobile handset or serialized hardware device.
- **Key Fields**:
  - `id`: `String @id @default(uuid()) @db.Uuid`
  - `companyId`: `String @db.Uuid`
  - `productId`: `String @db.Uuid`
  - `variantId`: `String @db.Uuid`
  - `currentBranchId`: `String? @db.Uuid`
  - `currentWarehouseId`: `String? @db.Uuid` (Note: the column is named `currentWarehouseId`, **NOT** `warehouseId`).
  - `currentLocationId`: `String? @db.Uuid`
  - `status`: `StockUnitStatus` (Enum: `IN_STOCK`, `RESERVED`, `IN_TRANSIT`, `SOLD`, `RETURNED`, `QUARANTINED`, `SCRAPPED`). Note: There is **no `"AVAILABLE"` enum value** in PostgreSQL; active unsold handsets have status `IN_STOCK`.
  - `acquisitionCost`: `Decimal @db.Decimal(19, 4)` — Exact landed cost recorded upon purchase receipt (GRN) used for Specific Identification COGS.
  - `soldAt`: `DateTime?` — Timestamp populated when sale posts.
  - `version`: `Int @default(0)` — Optimistic concurrency tracking counter.
- **Indexes & Constraints**:
  - `@@index([companyId, status, currentWarehouseId])`
  - `@@index([companyId, productId, variantId])`

#### `DeviceIdentifier` Model (`prisma/schema.prisma` lines 2236–2253)
Represents identity slots for physical units (Dual-SIM IMEIs, Serial Numbers, MAC addresses).
- **Key Fields**:
  - `id`: `String @id @default(uuid()) @db.Uuid`
  - `stockUnitId`: `String @db.Uuid`
  - `type`: `IdentifierType` (`IMEI`, `SERIAL`, `MAC`, `OTHER`)
  - `value`: Raw scanned string (e.g., `"864321041234567"`)
  - `normalizedValue`: Stripped, uppercase alphanumeric string used for index searching.
  - `slot`: `Int?` (1 for IMEI1, 2 for IMEI2)
  - `isPrimary`: `Boolean @default(false)`
- **Constraints**:
  - `@@unique([companyId, type, normalizedValue])` — Strictly prevents any company from registering duplicate IMEIs across distinct units.
  - `@@unique([stockUnitId, type, slot])` — Enforces that a single physical phone cannot have conflicting identifiers in the same slot.

### 2.2 Non-Serialized Inventory & Movement Ledger: `StockBalance` & `InventoryMovement`

#### `StockBalance` Model (`prisma/schema.prisma` lines 2279–2302)
Maintains current on-hand quantities and total asset values for non-serialized accessories and spare parts.
- **Key Fields**:
  - `id`: `String @id @default(uuid()) @db.Uuid`
  - `companyId`: `String @db.Uuid`
  - `warehouseId`: `String @db.Uuid`
  - `productId`: `String @db.Uuid`
  - `variantId`: `String @db.Uuid`
  - `quantity`: `Decimal @db.Decimal(19, 4)`
  - `inventoryValue`: `Decimal @db.Decimal(19, 4)`
  - `balanceKey`: Synthetic unique key (`companyId_warehouseId_productId_variantId`)
  - `version`: `Int @default(0)`
- **Cost Calculation**: Weighted Average Cost is computed as:
  $$\text{Unit Cost} = \frac{\text{inventoryValue}}{\text{quantity}}$$

#### `InventoryMovement` Model (`prisma/schema.prisma` lines 2304–2350)
The immutable, append-only perpetual inventory ledger.
- **Key Fields**:
  - `id`: `String @id @default(uuid()) @db.Uuid`
  - `movementType`: `InventoryMovementType` (`PURCHASE_RECEIPT`, `SALE_ISSUE`, `SALES_RETURN`, `TRANSFER_OUT`, `TRANSFER_IN`, `ADJUSTMENT_WRITE_OFF`, `ADJUSTMENT_WRITE_IN`)
  - `quantity`: `Decimal @db.Decimal(19, 4)` (Negative for issues, positive for receipts)
  - `unitCost`: `Decimal @db.Decimal(19, 4)`
  - `totalCost`: `Decimal @db.Decimal(19, 4)`
  - `stockUnitId`: `String? @db.Uuid` (Populated for serialized handsets)
  - `journalEntryId`: `String? @db.Uuid` (Direct link to the financial GL entry)
  - `reversalOfId`: `String? @unique @db.Uuid`
  - `idempotencyKey`: `String @db.VarChar(128)`
- **Constraints**:
  - `@@unique([companyId, idempotencyKey])` — Guarantees that inventory is never deducted twice for the same sale transaction.

### 2.3 Sales Commercial Engine: `SalesInvoice`, `SalesInvoiceLine`, `SalesInvoiceUnit`

#### `SalesInvoice` Model (`prisma/schema.prisma` lines 2879–2928)
Header record for counter sales invoices.
- **Key Fields**:
  - `invoiceNumber`: `String @db.VarChar(64)` (Format: `ISB-SI-FY2026-27-000001`)
  - `status`: `OperationalDocumentStatus` (`DRAFT`, `SUBMITTED`, `APPROVED`, `POSTED`, `CANCELLED`, `REVERSED`).
  - `customerId`: `String @db.Uuid`
  - `branchId`: `String @db.Uuid`
  - `warehouseId`: `String @db.Uuid`
  - `salespersonId`: `String? @db.Uuid`
  - `subtotal`: `Decimal @db.Decimal(19, 4)`
  - `discountTotal`: `Decimal @db.Decimal(19, 4)`
  - `taxTotal`: `Decimal @db.Decimal(19, 4)`
  - `grandTotal`: `Decimal @db.Decimal(19, 4)`
  - `costTotal`: `Decimal @db.Decimal(19, 4)`
  - `journalEntryId`: `String? @unique @db.Uuid`
  - `reversalOfId`: `String? @unique @db.Uuid`
  - `idempotencyKey`: `String? @db.VarChar(128)`
- **Payment Status Architecture Note**: There is **no static `paymentStatus` column** on `SalesInvoice`. Payment status (`UNPAID`, `PARTIALLY_PAID`, `PAID`) is computed dynamically from related `allocations` (`PaymentAllocation`).
- **Constraints**:
  - `@@unique([companyId, invoiceNumber])`
  - `@@unique([companyId, idempotencyKey])`

#### `SalesInvoiceLine` & `SalesInvoiceUnit` (`prisma/schema.prisma` lines 2930–2972)
- `SalesInvoiceLine`: Defines items, quantities, unit prices, discounts, and taxes.
- `SalesInvoiceUnit`: Junction table linking `SalesInvoiceLine` to `PhysicalStockUnit`.
  - Constraint: `@@unique([invoiceLineId, stockUnitId])` ensures a single physical unit cannot be assigned twice to the same line.

### 2.4 Settlements: `Payment` & `PaymentAllocation`

#### `Payment` Model (`prisma/schema.prisma` lines 3072–3115)
Financial settlement voucher for customer receipts and supplier payments.
- **Key Fields**:
  - `paymentNumber`: `String @db.VarChar(60)` (e.g., `ISB-RC-FY2026-27-000001`)
  - `direction`: `PaymentDirection` (`CUSTOMER_RECEIPT`, `SUPPLIER_PAYMENT`, `CUSTOMER_REFUND`, `SUPPLIER_REFUND`)
  - `amount`: `Decimal @db.Decimal(19, 4)`
  - `cashAccountId`: `String? @db.Uuid` (Account 1000 Cash on Hand)
  - `bankAccountId`: `String? @db.Uuid`
  - `paymentMethodId`: `String? @db.Uuid`
  - `terminalId`: `String? @db.Uuid` (Counter Terminal binding)
  - `shiftId`: `String? @db.Uuid` (Cashier Shift binding)
  - `journalEntryId`: `String? @unique @db.Uuid`
  - `idempotencyKey`: `String? @db.VarChar(120)`
- **Constraints**:
  - `@@unique([companyId, paymentNumber])`
  - `@@unique([companyId, idempotencyKey])`

#### `PaymentAllocation` Model (`prisma/schema.prisma` lines 3117–3140)
Settles a receipt against an outstanding sales invoice.
- **Key Fields**:
  - `paymentId`: `String @db.Uuid`
  - `salesInvoiceId`: `String? @db.Uuid`
  - `amount`: `Decimal @db.Decimal(19, 4)`
- **Business Rule**: `src/lib/operations/payments.ts` lines 270–273 validates that `salesInvoice.status === POSTED`. Allocations against unposted drafts are strictly rejected.

### 2.5 General Ledger: `JournalEntry` & `JournalEntryLine`

#### `JournalEntry` (`prisma/schema.prisma` lines 1286–1340)
Double-entry accounting journal voucher.
- **Key Fields**:
  - `voucherNumber`: `String @db.VarChar(64)`
  - `status`: `JournalStatus` (`DRAFT`, `SUBMITTED`, `APPROVED`, `POSTED`, `CANCELLED`, `REVERSED`)
  - `sourceModule`: `SourceModule` (`SALES`, `PAYMENTS`, `INVENTORY`, etc.)
  - `sourceDocumentType`: `String @db.VarChar(64)`
  - `sourceDocumentId`: `String @db.Uuid`
  - `totalDebit`: `Decimal @db.Decimal(19, 4)`
  - `totalCredit`: `Decimal @db.Decimal(19, 4)`
- **Balancing Invariant**: `totalDebit.equals(totalCredit)` is strictly enforced prior to posting.

#### `JournalEntryLine` (`prisma/schema.prisma` lines 1342–1400)
Individual debit/credit lines.
- **Key Fields**:
  - `accountId`: `String @db.Uuid`
  - `branchId`: `String @db.Uuid`
  - `customerId`: `String? @db.Uuid` — Subledger tag for Accounts Receivable reconciliation.
  - `salespersonId`: `String? @db.Uuid`
  - `debit`: `Decimal @db.Decimal(19, 4)`
  - `credit`: `Decimal @db.Decimal(19, 4)`
  - `invoiceNumber`: `String? @db.VarChar(64)`
  - `dueDate`: `DateTime?`

### 2.6 Sequential Numbering: `DocumentSequence` (`prisma/schema.prisma` lines 1475–1500)
- Manages sequence counters per company, branch, document type, and fiscal year.
- **Concurrency Mechanism**:
  ```sql
  INSERT INTO "DocumentSequence" ("companyId", "branchId", "documentType", "fiscalYear", "prefix", "nextValue", "padding", "version")
  VALUES (...)
  ON CONFLICT ("companyId", "branchId", "documentType", "fiscalYear")
  DO UPDATE SET "nextValue" = "DocumentSequence"."nextValue" + 1, "prefix" = ${input.prefix}, "version" = "DocumentSequence"."version" + 1
  RETURNING "nextValue" - 1 AS "nextValue", "prefix", "padding"
  ```
- Strips trailing/leading hyphens (`cleanBranch = branch.documentPrefix.trim().replace(/-+$/, "")`) to guarantee single-hyphen sequence formatting (`ISB-SI-FY2026-27-000001`).

---

## 3. Missing Models to Add in Milestone 2

To support counter terminal hardware binding and cashier shift cash reconciliation, two dedicated models will be added to `prisma/schema.prisma`:

### 3.1 `PosTerminal` Model
```prisma
model PosTerminal {
  id                    String              @id @default(uuid()) @db.Uuid
  companyId             String              @db.Uuid
  branchId              String              @db.Uuid
  code                  String              @db.VarChar(32)
  name                  String              @db.VarChar(128)
  defaultCashAccountId  String?             @db.Uuid
  receiptPrinterType    ReceiptPrinterType  @default(THERMAL_80MM)
  isActive              Boolean             @default(true)
  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt

  company               Company             @relation(fields: [companyId], references: [id], onDelete: Cascade)
  branch                Branch              @relation(fields: [branchId], references: [id], onDelete: Restrict)
  defaultCashAccount    Account?            @relation("TerminalDefaultCashAccount", fields: [defaultCashAccountId], references: [id], onDelete: SetNull)
  shifts                PosShift[]
  invoices              SalesInvoice[]
  payments              Payment[]

  @@unique([companyId, code])
  @@index([companyId, branchId, isActive])
}

enum ReceiptPrinterType {
  THERMAL_80MM
  THERMAL_58MM
  A4
}
```

### 3.2 `PosShift` Model
```prisma
model PosShift {
  id                  String          @id @default(uuid()) @db.Uuid
  companyId           String          @db.Uuid
  branchId            String          @db.Uuid
  terminalId          String          @db.Uuid
  cashierId           String          @db.Uuid
  status              PosShiftStatus  @default(OPEN)
  openedAt            DateTime        @default(now())
  closedAt            DateTime?
  openingFloat        Decimal         @default(0) @db.Decimal(19, 4)
  closingActualCash   Decimal?        @db.Decimal(19, 4)
  closingExpectedCash Decimal?        @db.Decimal(19, 4)
  cashDifference      Decimal?        @db.Decimal(19, 4)
  notes               String?         @db.Text
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt

  company             Company         @relation(fields: [companyId], references: [id], onDelete: Cascade)
  branch              Branch          @relation(fields: [branchId], references: [id], onDelete: Restrict)
  terminal            PosTerminal     @relation(fields: [terminalId], references: [id], onDelete: Restrict)
  cashier             User            @relation("CashierShifts", fields: [cashierId], references: [id], onDelete: Restrict)
  invoices            SalesInvoice[]
  payments            Payment[]

  @@index([companyId, terminalId, status])
  @@index([companyId, cashierId, status])
}

enum PosShiftStatus {
  OPEN
  CLOSED
}
```

### 3.3 Required Opposite Relations & Transaction Foreign Keys
To satisfy Prisma schema validation without relation errors during migration, the following opposite relation fields must be appended to existing models in `prisma/schema.prisma`:

#### Opposite Relations on Existing Core Models:
- **`Company`** (`prisma/schema.prisma` lines 360–425):
  ```prisma
  posTerminals        PosTerminal[]
  posShifts           PosShift[]
  ```
- **`Branch`** (`prisma/schema.prisma` lines 430–480):
  ```prisma
  posTerminals        PosTerminal[]
  posShifts           PosShift[]
  ```
- **`Account`** (`prisma/schema.prisma` lines 1220–1270):
  ```prisma
  terminalCashAccounts PosTerminal[]    @relation("TerminalDefaultCashAccount")
  ```
- **`User`** (`prisma/schema.prisma` lines 580–640):
  ```prisma
  cashierShifts       PosShift[]       @relation("CashierShifts")
  ```

#### Transaction Relations on Sales & Payment Models:
- **`SalesInvoice`** (`prisma/schema.prisma` lines 2860–2928):
  ```prisma
  terminalId          String?          @db.Uuid
  shiftId             String?          @db.Uuid
  terminal            PosTerminal?     @relation(fields: [terminalId], references: [id], onDelete: SetNull)
  shift               PosShift?        @relation(fields: [shiftId], references: [id], onDelete: SetNull)
  ```
- **`Payment`** (`prisma/schema.prisma` lines 3072–3125):
  ```prisma
  terminalId          String?          @db.Uuid
  shiftId             String?          @db.Uuid
  terminal            PosTerminal?     @relation(fields: [terminalId], references: [id], onDelete: SetNull)
  shift               PosShift?        @relation(fields: [shiftId], references: [id], onDelete: SetNull)
  ```

---

## 4. Concurrency Control & Row-Level Locking Architecture

Mobile phone retail encounters frequent concurrency conflicts when two counter terminals attempt to scan or sell the same device, or when cashier checkouts run in parallel.

### 4.1 Row-Level Locking Implementation
Within the atomic checkout transaction:
1. **Handset Locking**:
   ```sql
   SELECT "id", "status", "currentWarehouseId", "acquisitionCost"
   FROM "PhysicalStockUnit"
   WHERE "id" = ${unitId}
   FOR UPDATE;
   ```
   Locks the handset record immediately. If another terminal attempts to checkout the same phone, it waits until the first transaction commits or rolls back, detecting `status === SOLD` and throwing `409 STOCK_UNIT_UNAVAILABLE`.
2. **Accessory StockBalance Locking**:
   ```sql
   SELECT "id", "quantity", "inventoryValue"
   FROM "StockBalance"
   WHERE "id" = ${balanceId}
   FOR UPDATE;
   ```
   Locks the warehouse stock balance, preventing concurrent checkouts from depleting inventory below zero.
3. **DocumentSequence Locking**:
   Pessimistic row locking via `ON CONFLICT DO UPDATE` ensures sequential document number allocation with zero gaps and zero collisions.

### 4.2 Isolation Level
All posting transactions execute with `isolationLevel: Prisma.TransactionIsolationLevel.Serializable` with a 10-second acquisition timeout and 30-second execution timeout.

---

## 5. Historical Data Preservation & Migration Safety

- **Historical Record Safety**:
  - Existing invoice `ISB--SI-FY2026-27-000004` (currently with status `APPROVED` and double hyphen) is preserved unmodified in the database.
  - Zero historical vouchers, journal lines, or inventory movements are renamed, rewritten, or deleted.
- **Migration Policy**:
  - All schema additions (`PosTerminal`, `PosShift`) use non-destructive `ADD COLUMN` or `CREATE TABLE` statements with sensible defaults.
  - No existing columns or constraints are dropped.
