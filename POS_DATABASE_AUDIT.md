# POS DATABASE AUDIT — AXON MOBILE ERP
**Module:** Point of Sale (POS) Database Layer  
**Engine:** PostgreSQL with Prisma ORM 6.x  
**Audit Date:** November 2026  
**Auditor:** Database & Accounting Specialist  

---

## 1. Schema Model Inspection

The Axon Mobile ERP database schema already includes the necessary models for enterprise POS operations. No destructive migrations are needed.

### Core Tables & Relations:

1. **`PhysicalStockUnit` & `DeviceIdentifier` (Dual-SIM Handsets):**
   - `PhysicalStockUnit`: Represents the unique physical mobile device.
     - Key Fields: `id`, `companyId`, `productId`, `variantId`, `currentWarehouseId`, `currentBranchId`, `status` (`IN_STOCK`, `SOLD`, `RESERVED`, `QUARANTINED`, `IN_TRANSIT`), `acquisitionCost` (Decimal 19,4), `soldAt` (Timestamptz).
   - `DeviceIdentifier`: Stores individual hardware identifiers.
     - Key Fields: `id`, `stockUnitId`, `type` (`IMEI`, `SERIAL`, `MAC`), `value`, `normalizedValue`, `slot` (1 or 2), `isPrimary` (Boolean).
     - Unique Constraints: `[companyId, type, normalizedValue]` ensures no two handsets can share the same IMEI in the same tenant.
   - *Verification Result:* Handsets have two rows in `DeviceIdentifier` (slot 1 and slot 2) pointing to the same `stockUnitId`. Scanning either row yields the exact physical unit.

2. **`StockBalance` & `StockMovement` (Quantity Inventory):**
   - `StockBalance`: Aggregated on-hand stock per `[companyId, branchId, warehouseId, productId, variantId, lotId]`.
     - Key Fields: `quantity` (Decimal 19,4), `inventoryValue` (Decimal 19,4).
   - `StockMovement`: Append-only inventory transaction ledger.
     - Key Fields: `movementType` (`SALE_ISSUE`), `quantity` (negative for issues), `unitCost`, `totalCost`, `stockUnitId` (nullable, populated for handsets), `journalEntryId` (foreign key to balanced GL voucher).

3. **`SalesInvoice`, `SalesInvoiceLine` & `SalesInvoiceUnit`:**
   - `SalesInvoice`: Parent transaction record.
     - Key Fields: `invoiceNumber` (Unique per company), `invoiceDate`, `dueDate`, `status` (`DRAFT`, `POSTED`, `CANCELLED`), `subtotal`, `discountTotal`, `taxTotal`, `grandTotal`, `costTotal`, `terminalId` (UUID), `shiftId` (UUID), `idempotencyKey` (Unique).
   - `SalesInvoiceLine`: Line item details with quantity, unit price, discounts, and tax rates.
   - `SalesInvoiceUnit`: Join table linking `SalesInvoiceLine` to `PhysicalStockUnit`.

4. **`Payment`, `PaymentAllocation` & `PaymentMethod`:**
   - `Payment`: Cash receipt or bank voucher.
     - Key Fields: `paymentNumber`, `direction` (`CUSTOMER_RECEIPT`), `amount`, `cashAccountId`, `bankAccountId`, `status` (`POSTED`), `terminalId`, `shiftId`.
   - `PaymentAllocation`: Maps payments to `salesInvoiceId` with allocated `amount`.

5. **`PosTerminal` & `PosShift`:**
   - `PosTerminal`: Registered cash counter terminal.
     - Key Fields: `code`, `name`, `branchId`, `defaultCashAccountId`, `receiptPrinterType` (`THERMAL_80MM`, `THERMAL_58MM`, `A4`), `isActive`.
   - `PosShift`: Cashier work shift and drawer reconciliation.
     - Key Fields: `terminalId`, `cashierId`, `status` (`OPEN`, `CLOSED`), `openedAt`, `closedAt`, `openingFloat`, `closingActualCash`, `closingExpectedCash`, `cashDifference`.

---

## 2. Integrity Constraints & Foreign Keys

- `FK_SalesInvoice_Terminal`: `SalesInvoice.terminalId` -> `PosTerminal.id` (ON DELETE SET NULL).
- `FK_SalesInvoice_Shift`: `SalesInvoice.shiftId` -> `PosShift.id` (ON DELETE SET NULL).
- `FK_Payment_Terminal`: `Payment.terminalId` -> `PosTerminal.id` (ON DELETE SET NULL).
- `FK_Payment_Shift`: `Payment.shiftId` -> `PosShift.id` (ON DELETE SET NULL).
- `FK_SalesInvoiceUnit_StockUnit`: `SalesInvoiceUnit.stockUnitId` -> `PhysicalStockUnit.id` (ON DELETE RESTRICT).
- Unique Constraints:
  - `SalesInvoice(companyId, invoiceNumber)`: Prevents duplicate invoice numbers.
  - `SalesInvoice(companyId, idempotencyKey)`: Prevents double-posting on rapid clicks.
  - `Payment(companyId, idempotencyKey)`: Prevents duplicate payment vouchers.

---

## 3. Data Safety & Migration Evaluation

- **Destructive Changes Required:** NONE.
- **Table Alterations Required:** Existing schema contains all necessary tables, columns, indexes, and constraints.
- **Historical Records Preserved:** All 216 physical stock units, 432 device identifiers, 6 products, 3 warehouses, and posted transactions remain 100% intact.

---
© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
