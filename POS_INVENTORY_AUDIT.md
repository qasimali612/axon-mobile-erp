# POS Inventory Ledger, Dual Inventory & Custody Technical Audit Report

**System**: Axon Mobile ERP Retail Point of Sale (POS) Counter Terminal  
**Auditor**: Teamwork Architecture & Audit Group (`worker_m1`)  
**Date**: 2026-11-10T12:26:00Z  
**Repository Working Directory**: `d:\Inventory Managment Software`  
**Audit Scope**: Dual Inventory Architecture, Serialized Handset Custody, Non-Serialized Balance Controls, Negative Stock Prevention, and State Transitions

---

## 1. Dual Inventory Tracking Model Architecture

Mobile phone retail presents unique inventory challenges. High-value smartphones must be tracked with granular physical custody and IMEI traceability, while bulk accessories (cables, adapters, cases, tempered glass) require rapid, quantity-based inventory tracking. Axon Mobile ERP handles this through a strict Dual Inventory Model:

```
                          ┌─────────────────────────────────────┐
                          │         Retail Inventory Catalog    │
                          └──────────────────┬──────────────────┘
                                             │
                   ┌─────────────────────────┴─────────────────────────┐
                   ▼                                                   ▼
     ┌───────────────────────────┐                       ┌───────────────────────────┐
     │  Serialized Mobile Devices│                       │  Non-Serialized Products  │
     │   (Smartphones, Tablets)  │                       │   (Accessories, Parts)    │
     ├───────────────────────────┤                       ├───────────────────────────┤
     │ • TrackingMethod: IMEI    │                       │ • TrackingMethod: QUANTITY│
     │ • 1 Handset = 1 Cart Line │                       │ • Manual Quantity Editing │
     │ • Dual-Slot IMEI1 / IMEI2 │                       │ • Bounded by StockBalance │
     │ • Model: PhysicalStockUnit│                       │ • Model: StockBalance     │
     │ • Custody: IN_STOCK       │                       │ • Moving Average Cost     │
     │ • Landed Cost COGS        │                       │ • Prevention of Negative  │
     └───────────────────────────┘                       └───────────────────────────┘
```

---

## 2. Serialized Mobile Handsets: Custody & Concurrency Architecture

### 2.1 The "1 Handset = 1 Cart Line" Principle
- **Mandate**: In mobile retail, every physical smartphone is an individual asset with its own unique battery serial number, physical condition, dual IMEIs, and distinct landed cost.
- **Identified Defect in UI**:
  In `src/components/sales/pos-workspace.tsx` line 268:
  ```tsx
  // Broken multi-unit grouping:
  return prev.map((l) =>
    l.variantId === item.variantId
      ? { ...l, quantity: l.quantity + 1, stockUnitIds: [...l.stockUnitIds, stockUnitId] }
      : l
  );
  ```
  Grouping multiple phones into a single line violates retail terminal usability. A cashier cannot view which IMEI corresponds to which row, cannot apply individual trade-in discounts, and cannot remove an individual handset if a customer changes their mind.
- **Architectural Fix**: Every scanned handset must create a distinct cart line item with `quantity = 1` permanently locked.

### 2.2 Dual-SIM IMEI Scanner Resolution
- **Model**: `DeviceIdentifier` (`prisma/schema.prisma` lines 2236–2253).
- **Resolver**: `src/app/api/operations/catalog/resolve/route.ts` lines 29–44.
- Dual-SIM smartphones possess two IMEIs (IMEI1 in Slot 1 and IMEI2 in Slot 2). Both records exist in `DeviceIdentifier` referencing the exact same `stockUnitId`.
- When a cashier scans either IMEI1 or IMEI2, the resolver finds the identifier and loads the identical `PhysicalStockUnit`.
- **Duplicate Protection**:
  `pos-workspace.tsx` line 263 verifies:
  ```tsx
  if (cart.some((line) => line.stockUnitIds.includes(stockUnitId))) {
    throw new Error("This physical device is already in the cart. Either IMEI resolves to the same unit.");
  }
  ```
  If the cashier accidentally scans IMEI1 on the retail box and later scans IMEI2 on the phone screen, the second scan is immediately rejected with an audible 220Hz error tone.

### 2.3 Physical Custody & Warehouse Guards
- **Warehouse Custody Guard**:
  A cashier logged into the "Islamabad Blue Area Branch" (Warehouse `ISB-WH-01`) cannot sell a handset stored at the "Rawalpindi Branch" (Warehouse `RWP-WH-01`).
  `src/app/api/operations/catalog/resolve/route.ts` lines 46–52 checks:
  ```ts
  if (warehouseId && unit.currentWarehouseId !== warehouseId) {
    throw new ApiError(409, "DEVICE_WRONG_WAREHOUSE", `Physical device is located in warehouse '${unit.currentWarehouse?.name}', not the selected warehouse.`);
  }
  ```
- **Device Lifecycle Statuses (`StockUnitStatus`)**:
  - `IN_STOCK`: Available in warehouse custody. Eligible for sale.
  - `RESERVED`: Allocated to an unfulfilled sales order. Cannot be sold at counter.
  - `IN_TRANSIT`: Dispatched on an inter-branch transfer.
  - `SOLD`: Previously sold. The resolver throws `409 DEVICE_ALREADY_SOLD` and displays the original invoice number and customer name.
  - `QUARANTINED`: Defective or damaged unit undergoing inspection.
  - `SCRAPPED`: Written off inventory.
- Note: There is **no enum value named `AVAILABLE`** in Prisma. The active status is strictly `IN_STOCK`.

---

## 3. Catalog Search Bug Analysis & Remediation

### 3.1 Defect Location
`src/app/api/operations/catalog/search/route.ts` lines 26–34:
```ts
stockUnit: {
  companyId: context.company.id,
  ...(warehouseId ? { warehouseId } : {}),        // BUG: Property does not exist in Prisma schema
  ...(mode === "sale" ? { status: "IN_STOCK" } : {}),
}
```

### 3.2 Root Cause & Fix
- In `prisma/schema.prisma` lines 2205–2208, the foreign key to `Warehouse` on `PhysicalStockUnit` is named `currentWarehouseId`.
- Passing `{ warehouseId }` directly causes Prisma Client to throw a validation failure at runtime.
- **Remediation**:
  ```ts
  stockUnit: {
    companyId: context.company.id,
    ...(warehouseId ? { currentWarehouseId: warehouseId } : {}),
    ...(mode === "sale" ? { status: StockUnitStatus.IN_STOCK } : {}),
  }
  ```

---

## 4. Non-Serialized Inventory & Negative Stock Prevention

### 4.1 StockBalance & Bounded Quantity Controls
- Bulk accessories are tracked in `StockBalance` per company, warehouse, product, and variant.
- In `pos-workspace.tsx` lines 932–941, non-serialized lines expose `Minus`, `Plus`, and manual number inputs:
  - Minimum allowed quantity: `1`.
  - Maximum allowed quantity: clamped to `line.availableQuantity` (`StockBalance.quantity - activeReservations`).

### 4.2 Backend Negative Stock Guard
In `src/lib/operations/sales.ts` lines 490–505:
1. Locks `StockBalance` row: `SELECT "id", "quantity" FROM "StockBalance" WHERE ... FOR UPDATE`.
2. Validates available balance:
   ```ts
   assertSufficientBalance(balance, line.quantity);
   ```
   If on-hand balance is insufficient, throws `409 INSUFFICIENT_AVAILABLE_STOCK` with detailed breakdown (requested vs on-hand vs reserved).
3. Negative inventory balances are strictly prohibited at all times.

---

## 5. Perpetual Inventory Ledger & Movement Lifecycle

All physical stock changes generate immutable ledger entries in `InventoryMovement` (`prisma/schema.prisma` lines 2304–2350).

### 5.1 Complete Device Custody Lifecycle

```
[Goods Receipt (GRN)]
       │
       ▼  Creates Movement: PURCHASE_RECEIPT (+1 qty, unitCost = Landed Cost)
  [IN_STOCK] (currentWarehouseId = Terminal WH, soldAt = null)
       │
       ├─────────────────────────────────┐
       │ (POS Checkout)                  │ (Inter-Branch Transfer)
       ▼                                 ▼
   Creates Movement: SALE_ISSUE      Creates Movement: TRANSFER_OUT
   (-1 qty, totalCost = -Cost)       (-1 qty)
  [SOLD]                            [IN_TRANSIT]
   (currentWarehouseId = null,           │
    soldAt = DateTime.now())             ▼ Creates Movement: TRANSFER_IN
       │                            [IN_STOCK] (New WH)
       ▼ (Customer Return)
   Creates Movement: SALES_RETURN (+1 qty, unitCost = Original Landed Cost)
   Restored to [IN_STOCK] or [QUARANTINED]
```

---

## 6. Parked Carts Inventory Semantics & Custody Re-Validation

### 6.1 Draft Holding Without Stock Reservation
- In retail counters, customers frequently ask to hold their purchase while retrieving forgotten cash or inspecting another phone.
- `src/lib/operations/sales.ts` lines 185–245 (`createSalesDraftInvoice`) creates draft records in `SalesInvoice` and `SalesInvoiceLine` with `status: DRAFT` and audit metadata `stockEffect: "NONE_UNTIL_POSTING"`.
- It creates **zero records in `InventoryReservation`** and **zero movements in `InventoryMovement`**.
- This policy ensures held carts do not artificially lock inventory or prevent other cashiers from selling the stock.

### 6.2 Parked Cart Recall Custody Re-Validation
- **Vulnerability**: If a phone is held in a parked cart for 2 hours, another cashier might sell that handset in the interim.
- **Specification Mandate**: When a parked sale is recalled into the POS terminal (`/pos?invoiceId=...`), the frontend must immediately execute custody verification for all serialized handsets in the cart.
- Any handset no longer having `status === IN_STOCK` in the active warehouse must be highlighted with a red warning badge, preventing checkout until replaced or removed.
