# AXON MOBILE ERP — POS INVENTORY AUDIT & TRACKING VALIDATION
## Dual-SIM IMEI Handsets vs Quantity-Based Accessories & Spares

**Date:** November 2026  
**Auditor:** Senior ERP Solutions Architect & Inventory Specialist  
**Module:** Point of Sale (POS) & Physical Stock Lifecycle  
**Target Architecture:** SAP Business One Continuous Inventory Valuation  

---

## 1. Inventory Method Audit

Axon Mobile ERP handles two fundamentally distinct inventory lifecycles seamlessly within the unified POS checkout terminal:

### A. Individually Tracked Handsets (Serialized / IMEI)
- **Tracking Method:** `IMEI` or `SERIAL` (`Product.trackingMethod`).
- **Physical Stock Unit:** Represented by `StockUnit` with linked `DeviceIdentifier` records:
  - `IMEI1`: Primary cellular transceiver identifier (15-digit TAC+SNR+CD).
  - `IMEI2`: Secondary cellular transceiver identifier for Dual-SIM handsets.
  - `SERIAL`: Factory hardware serial number.
- **Physical Status Progression:**
  `AVAILABLE` → (Sale posted) → `SOLD` (linked to `SalesInvoiceLineStockUnit` and `StockMove`).
- **Costing:** Exact unit cost tracking via `StockUnit.costPrice` determined at Goods Receipt (Purchase GRN / Inward). Upon invoice posting, Cost of Goods Sold (COGS) is debited with the exact historical landed cost of each scanned physical handset.
- **Custody Enforcement:** A device cannot be sold twice. If an IMEI is scanned that resolves to an already sold or reserved unit, the POS immediately throws a terminal violation error.

### B. Bulk Accessories & Spare Parts (Quantity-Based)
- **Tracking Method:** `NONE` or `BATCH` (`Product.trackingMethod`).
- **Inventory Balance:** Maintained in `StockBalance` aggregated per `warehouseId` and `variantId`.
- **Barcodes:** Universal Product Codes (UPC / EAN / Custom SKU) linked via `ProductBarcode` and `VariantBarcode`.
- **Availability Enforcement:**
  $$\text{Available Qty} = \text{StockBalance.quantity} - \sum \text{InventoryReservation.quantity}$$
  The POS verifies available stock on every item addition and prevents line quantity from exceeding current physical availability.
- **Costing:** Moving Weighted Average Cost (WAC) calculated dynamically at posting time from `StockBalance.inventoryValue / StockBalance.quantity`.

---

## 2. Stock Deduction & Journal Entry Verification

When the counter sale is completed via `⚡ Complete Sale & Post (Print)`:
1. **Physical Unit Lock:** In `src/lib/operations/sales.ts`, all serialized units in the invoice are locked via `SELECT FOR UPDATE` in PostgreSQL to eliminate concurrency hazards.
2. **Device Identifier Verification:** Handsets are checked against the selected dispatch warehouse. If custody is missing or status $\neq$ `AVAILABLE`, the transaction rolls back cleanly.
3. **Status Mutation:**
   - Handset `StockUnit.status` is set to `SOLD`.
   - `StockBalance.quantity` is decremented.
   - `StockBalance.inventoryValue` is decremented by the exact landed cost.
4. **General Ledger Journals:**
   - **DR COGS Account** (5000 series): Cost of handsets + accessories.
   - **CR Inventory Asset Account** (1200 series): Relief of inventory at landed cost.
   - **DR Accounts Receivable / Settlement**: Gross invoice total.
   - **CR Sales Revenue Account** (4000 series): Net sales revenue.
   - **CR Sales Tax Payable** (2200 series): Output sales tax.

---

## 3. Inventory Integrity Audit Findings

| Audit Check | Status | Verification Detail |
|---|---|---|
| **IMEI Uniqueness Across Warehouses** | **PASSED** | Enforced by DB unique index on `(company_id, identifier_type, value)`. |
| **Dual-SIM Dual-Resolution** | **PASSED** | Scanning either IMEI1 or IMEI2 resolves to the same physical unit; prevents accidental duplicate cart addition. |
| **Negative Stock Prevention** | **PASSED** | Hard constraint in `StockBalance` table rejects balances $< 0$. |
| **Batch Expiration for Accessories** | **PASSED** | Supported where product tracking is configured for batches. |
| **Automatic Reservation Release** | **PASSED** | Background cleanup and invoice cancellation release unposted reservations instantly. |
