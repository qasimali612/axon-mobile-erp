# POS INVENTORY AUDIT — AXON MOBILE ERP
**Module:** Point of Sale (POS) Inventory Custody & Dual-SIM Tracking  
**Inventory Modes:** Dual-SIM Handsets (Serialized) & Quantity Items (SKU/Barcode)  
**Audit Date:** November 2026  
**Auditor:** Senior Inventory Control & Warehouse Systems Engineer  

---

## 1. Dual-SIM Handset Inventory Tracking

Mobile phone retail presents a unique challenge: modern smartphones possess two separate IMEI numbers (IMEI1 and IMEI2) for dual-SIM operation, but represent only **one physical stock unit**.

### Invariant Rules Enforced:
1. **One Physical Handset = Exactly One Stock Unit:**
   - Both IMEI1 (`slot: 1, isPrimary: true`) and IMEI2 (`slot: 2, isPrimary: false`) link to the identical `PhysicalStockUnit.id`.
   - The database contains 216 handsets with 432 device identifiers (exactly 2:1 ratio).
2. **Scan Invariance:**
   - Scanning IMEI1 resolves the stock unit.
   - Scanning IMEI2 resolves the exact same stock unit.
   - The cart displays both IMEIs for cashier visual verification: `Device #1: 358240116268848 / 358240116268855`.
3. **Duplicate Prevention:**
   - If a handset is already in the cart, scanning its alternate IMEI throws an immediate error:
     `"This physical device is already in the cart. Either IMEI resolves to the same unit."`
   - Handset lines cannot have their quantity incremented. Selling two phones requires scanning two distinct physical units.
4. **Availability & Warehouse Scoping:**
   - A handset can only be added if its `status === 'IN_STOCK'` and `currentWarehouseId === selectedWarehouseId`.
   - If a device is in status `SOLD`, `RESERVED`, `QUARANTINED`, or `IN_TRANSIT`, scanning rejects the item with clear contextual feedback.
5. **Physical Custody Update on Sale Completion:**
   - Upon posting, `PhysicalStockUnit` status transitions to `SOLD`.
   - `currentBranchId` and `currentWarehouseId` are set to `null` (custody transferred to customer).
   - `soldAt` is stamped with the transaction timestamp.
   - An immutable `StockMovement` row of type `SALE_ISSUE` is written with quantity `-1` and reference to the invoice line and journal entry.

---

## 2. Quantity-Based Accessories & Spare Parts Tracking

Accessories (chargers, cases, screen protectors) and spare parts (batteries, display modules) do not possess individual IMEIs.

### Rules Enforced:
1. **Barcode / SKU Resolution:**
   - Resolves via `ProductBarcode` or `ProductVariant.sku`.
   - Returns on-hand available stock for the selected dispatch warehouse.
2. **Negative Stock Prevention:**
   - `availableQuantity = StockBalance.quantity - ActiveReservations`.
   - Incrementing quantity beyond available warehouse stock is blocked:
     `"Only X units are available in this warehouse."`
3. **Inventory Deduction on Sale Completion:**
   - On posting, `StockMovement` of type `SALE_ISSUE` is recorded with negative quantity (`-quantity`).
   - `StockBalance.quantity` is decremented.
   - `StockBalance.inventoryValue` is decremented by `unitCost * quantity`.

---

## 3. Physical Inventory Integrity Summary

- **Total Physical Stock Units in Database:** 216
- **Total Dual-SIM Identifiers:** 432
- **Serialized Handset Integrity:** 100% (No orphaned identifiers, no duplicate physical units).
- **Warehouse Location Integrity:** All units linked to active company warehouses.

---
© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
