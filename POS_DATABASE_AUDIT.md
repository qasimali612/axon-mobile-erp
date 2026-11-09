# Point of Sale (POS) — Database Schema & Data Integrity Audit
**Project:** Axon Mobile ERP  
**Module:** Database & ORM Layer (PostgreSQL & Prisma)  
**Audit Timestamp:** 2026-11-09T22:58:30+05:00  

---

## 1. Schema & Model Overview

Axon Mobile ERP implements a strict relational accounting and inventory schema in `prisma/schema.prisma`.

### 1.1 Core Entities Used by POS
1. **`Product` & `ProductVariant`:**
   - Handset models, brands, colors, RAM/storage configurations.
   - Tracking method enum: `NONE`, `SERIAL`, `IMEI`, `LOT`.
2. **`PhysicalStockUnit` (Table: `"PhysicalStockUnit"`):**
   - Represents the individual physical handset box.
   - Status: `IN_STOCK`, `RESERVED`, `SOLD`, `RETURNED`, `QUARANTINED`, `IN_TRANSIT`, `WRITTEN_OFF`.
   - Links to `currentBranchId`, `currentWarehouseId`, `currentLocationId`.
   - Tracks `acquisitionCost` and `soldAt`.
3. **`DeviceIdentifier` (Table: `"DeviceIdentifier"`):**
   - Individual identifier records linked to `stockUnitId`.
   - Types: `IMEI1`, `IMEI2`, `SERIAL`, `MAC`.
   - Fields: `value`, `normalizedValue`, `slot`, `isPrimary`.
   - Constraints: `@@unique([companyId, type, normalizedValue])`, `@@unique([stockUnitId, type, slot])`.
4. **`SalesInvoice` & `SalesInvoiceLine` & `SalesInvoiceUnit`:**
   - Head-line-unit hierarchy ensuring each physical unit sold is immutably recorded in `SalesInvoiceUnit(invoiceLineId, stockUnitId)`.
5. **`Payment` & `PaymentAllocation`:**
   - Records cash/bank/wallet payments allocated to sales invoices (`paymentAllocation.salesInvoiceId`).
6. **`StockBalance` & `InventoryMovement`:**
   - Maintains real-time warehouse inventory quantities and valuation.

---

## 2. Inconsistencies & Integrity Checks

### 2.1 Dual-SIM Physical Unit Mapping
- **Rule:** One physical handset box has 2 IMEIs (IMEI 1 and IMEI 2) but exists as exactly **one** record in `PhysicalStockUnit`.
- **Database Verification:**
  - `PhysicalStockUnit` has `1:N` relationship with `DeviceIdentifier`.
  - When IMEI 1 or IMEI 2 is queried, it resolves to `stockUnit.id`.
  - In `SalesInvoiceUnit`, `@@unique([invoiceLineId, stockUnitId])` prevents adding the same handset twice to a single line.
  - Furthermore, `stockUnit.status` transitioning to `SOLD` prevents the same physical handset from being resold on any subsequent invoice.

### 2.2 Trigger & Constraint Observations
- **Maker-Checker Triggers:** Previously blocked single-user operations. The trigger `enforce_document_maker_checker()` has now been set to no-op, and maker-checker triggers dropped.
- **Operational Status Transition Trigger:** `enforce_operational_status_transition()` now allows unposted documents (`DRAFT`, `SUBMITTED`, `APPROVED`) to post directly to `POSTED`.
- **Missing POS Session / Shift Models:**
  - The schema currently lacks `POSTerminal` and `POSShift` tables.
  - Cashier shift reconciliation is currently performed via financial cash account subledgers and daily reports rather than a dedicated shift table. To avoid schema disruption while maintaining audit integrity, shifts can be modeled cleanly or backed by existing financial registers.

---

## 3. Database Recommendations for POS

1. **Idempotency Indexing:**
   - Ensure POS checkout requests generate and pass an `idempotencyKey` formatted as `POS:<branchId>:<uuid>`.
2. **Transaction Locking:**
   - Always lock `PhysicalStockUnit` with `SELECT ... FOR UPDATE` before updating status to `SOLD` to prevent race conditions during high-volume counter operations.
3. **Foreign Key Integrity:**
   - Preserve `SalesInvoiceUnit -> PhysicalStockUnit` cascade protections so posted sales retain permanent serial traceability.
