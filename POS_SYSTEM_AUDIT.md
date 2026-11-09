# Point of Sale (POS) — System Architecture Audit
**Project:** Axon Mobile ERP  
**Module:** Point of Sale (POS) Counter Terminal  
**Audit Timestamp:** 2026-11-09T22:58:00+05:00  
**Auditor:** Senior ERP Architect & Full-Stack Lead  

---

## 1. Executive Architecture Summary

Axon Mobile ERP includes a dedicated Point of Sale (POS) terminal at route `/pos` (`src/app/(erp)/pos/page.tsx`), powered by the workspace component `src/components/sales/pos-workspace.tsx`.

The module interacts with:
- **Product Catalog & Variant Engine:** Dual tracking methods (`IMEI`/`SERIAL` for mobile handsets, `NONE` for accessories and spare parts).
- **Inventory & Warehouse Ledger:** `PhysicalStockUnit`, `DeviceIdentifier`, `StockBalance`, `InventoryMovement`, `StockReservation`.
- **Sales & Commercial Subsystem:** `SalesInvoice`, `SalesInvoiceLine`, `SalesInvoiceUnit`.
- **Finance & Accounting Engine:** `Payment`, `PaymentAllocation`, `JournalEntry`, `JournalEntryLine`, `Account`.
- **RBAC & Authorization:** Permission scopes for `sales.view`, `sales.create`, `SALES_INVOICE_CREATE`, `SALES_INVOICE_POST`, `PAYMENT_CREATE`, `PAYMENT_POST`.

---

## 2. Component Structure & Lifecycle Audit

### 2.1 Route Entry Point (`src/app/(erp)/pos/page.tsx`)
- **Status:** Functional with permission gating (`SALES_INVOICE_CREATE`).
- **Context Injection:** Injects company currency code, active user ID, and active permissions array into `<PosWorkspace />`.
- **Findings:**
  - Lacks session or terminal identifier injection.
  - Does not enforce POS shift opening or check for active cash drawers.

### 2.2 Terminal Component (`src/components/sales/pos-workspace.tsx`)
- **Size:** 1,570 lines of monolithic React client component code.
- **State Model:**
  - In-memory cart array `cart: CartLine[]` tracking `product`, `variant`, `quantity`, `unitPrice`, `discountAmount`, `stockUnitIds`, `identifiers`, `availableQuantity`.
  - Payment tender state: Cash vs Bank vs Mobile Wallet vs Customer Credit terms.
  - Barcode scanner listener with audio feedback (`playScanBeep`).
- **Defects & Architectural Risks Identified:**
  1. **Non-Atomic Sale Completion:** The sale posting flow executes up to 8 distinct asynchronous HTTP calls from the browser client (`POST /api/sales/invoices` -> `submit` -> `approve` -> `post` -> `POST /api/payments` -> `submit` -> `approve` -> `post`). If any network interruption or validation glitch occurs mid-flight, an invoice is left posted with unpaid balance or orphaned payment vouchers.
  2. **Approval System Leftovers:** In several places, residual `submit` and `approve` calls were chained instead of executing direct atomic posting.
  3. **Lack of Server-Side Cart Valuation Endpoint:** Cart lines recalculate line totals on the client, risking rounding drift with the backend ledger.
  4. **Broken Parked / Held Sales:** "Park Draft" creates a draft sales invoice in the database, but there is no in-terminal modal, drawer, or shortcut (F9) to view or restore parked sales.
  5. **Missing Thermal Receipt Routes:** The print action points to `/sales/${id}/receipt` (80mm), which was never created in Next.js App Router (returning 404).

---

## 3. Inventory Tracking Audit

| Inventory Category | Identification | Tracking Model | POS Handling Status |
|---|---|---|---|
| **Mobile Handsets** | Dual-SIM (IMEI 1 & IMEI 2) or Serial | `PhysicalStockUnit` + `DeviceIdentifier` | Partial. `/api/operations/catalog/resolve` resolves IMEI to a single unit, but `/api/operations/catalog/search` (F2 search dialog) does not search IMEI identifiers. |
| **Accessories & Parts** | SKU / EAN Barcode | Quantity-based via `StockBalance` | Functional. Validates on-hand stock and deducts through stock movements upon invoice posting. |

---

## 4. Key Findings Matrix

1. **Working Functionality:**
   - Single-unit resolution via `/api/operations/catalog/resolve` for valid in-stock handsets.
   - Dual-SIM prevention: Scanning either IMEI 1 or IMEI 2 resolves to the same `PhysicalStockUnit`.
   - Accessory barcode scanning and SKU manual addition.
   - Live cash change calculation when cash tendered > amount.
   - Line discount and payment method selection.

2. **Broken / Critical Blockers:**
   - Multi-step client HTTP posting instead of single atomic transaction.
   - Missing 80mm thermal receipt route (`/sales/[id]/receipt` is 404).
   - Incomplete F2 catalog search for IMEI1/IMEI2.
   - Parked carts have no retrieval mechanism within the terminal.
   - Residual maker-checker and approval references.

3. **Immediate Architecture Roadmap:**
   - Implement `/api/pos/checkout` atomic transaction endpoint.
   - Implement `/api/pos/parked` endpoint and retrieval drawer.
   - Create 80mm/58mm thermal receipt page (`src/app/(erp)/sales/[id]/receipt/page.tsx`).
   - Enhance `/api/operations/catalog/search` to match IMEIs.
