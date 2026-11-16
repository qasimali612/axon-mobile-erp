# Project: Axon Mobile ERP POS Counter Terminal Module

## Architecture
- **Framework**: Next.js 15.5.28 App Router, React 19.2.0, Tailwind CSS, Prisma 6.19.3 ORM, PostgreSQL database (`@electric-sql/pglite` socket server at `127.0.0.1:54329`).
- **Posting Architecture**: Direct atomic posting via dedicated endpoint `POST /api/pos/checkout`. A single serializable transaction locks stock, creates `SalesInvoice`, deducts inventory, creates `InventoryMovement`, posts balanced commercial `JournalEntry`, records `Payment` vouchers, and posts receipt `JournalEntry`. All intermediate approval statuses and maker-checker queues are eliminated.
- **Dual Inventory Model**:
  - Individually tracked physical handsets: strictly 1 unit per device, IMEI1 and IMEI2 resolve to same physical stock unit, warehouse custody and active availability (`IN_STOCK`) verified, duplicate additions rejected.
  - Quantity accessories and spare parts: manual quantity editing, bounded by available warehouse stock, negative stock strictly prevented.
- **Financial & Accounting Integration**:
  - Specific identification landed-cost COGS for handsets (`PhysicalStockUnit.acquisitionCost`).
  - Weighted average cost for accessories (`StockBalance.inventoryValue / quantity`).
  - Double-entry balanced GL journals: Debit AR, Credit Revenue, Credit Tax, Debit COGS, Credit Inventory Asset; balanced receipt vouchers Debit Cash/Bank/Wallet, Credit AR.
  - Document sequence format `ISB-SI-FY2026-27-000001` with hyphen sanitization preserving historical records.
- **Retail Terminal UI**:
  - High-contrast console with auto-refocusing barcode scanner input, audio feedback (1760Hz/220Hz), Enter/Tab suffix handling.
  - Full retail keyboard shortcuts: F2 Catalog, F3 Scanner, F4 Customer, F6 Salesperson, F8 Clear Cart, F9 Park Draft, F10 Tender, Ctrl+Enter Quick Tender, Esc Close Dialog.
  - Multi-tender split payments (Cash, Card POS, EasyPaisa, JazzCash, Raast, Bank Deposit, Customer Credit with credit limit checks).
- **Operations & Reporting**:
  - Shift and cash drawer tracking: opening float, cash transactions, closing physical denomination count, variance reconciliation strictly excluding digital/card tenders.
  - Parked carts: draft holding without inventory reservation, in-terminal recall, real-time IMEI custody revalidation.
  - Counter returns: IMEI-traceable sales returns with credit note and cash drawer refund.
  - Multi-format printing: A4 Tax Invoice, 80mm Thermal Receipt, 58mm Compact Thermal Receipt.
  - 15 POS reports covering sales, shifts, tenders, hourly traffic, margins, dead stock, and IMEI registries.

---

## Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Dedicated Audit Markdown Reports | Author 9 comprehensive audit reports covering UI, DB, API, Accounting, Inventory, Missing Features, Implementation Plan, Test Report | M1 | Survey §4 / R1 |
| 2 | Auto-Focus Barcode Input & Audio | High-contrast scanner bar retaining focus via rAF, Web Audio 1760Hz/220Hz beeps, Enter/Tab suffix handling | M4 | Survey §1.2 / R2 |
| 3 | Dual-SIM IMEI Resolution | Resolves either IMEI1 or IMEI2 to identical physical unit record; rejects duplicate cart additions | M4 | Survey §1.2 / R2 |
| 4 | Warehouse Custody Validation | Verifies scanned handset exists in terminal's active warehouse; rejects wrong-warehouse handsets | M4 | Survey §1.2 / R2 |
| 5 | Device Status Custody Guard | Rejects handsets that are SOLD, RESERVED, QUARANTINED, or IN_TRANSIT with descriptive errors | M4 | Survey §1.2 / R2 |
| 6 | Catalog Search Bug Fix | Fix property mismatch in catalog search (`currentWarehouseId` vs `warehouseId`) and query `IN_STOCK` | M4 | Survey §1.2 / R2 |
| 7 | Fixed Handset Cart Line (1 unit = 1 row) | Handset cart row strictly locked to quantity 1; disallow grouping multiple handsets into a single row | M4 | Survey §1.2 / R3 |
| 8 | Accessory Quantity Controls | Numeric quantity editing for non-serialized accessories bounded by warehouse available stock | M4 | Survey §1.2 / R3 |
| 9 | F2 Catalog Search Dialog | Server-side product search by name, SKU, barcode, brand, variant, or IMEI; enable selecting serialized phones | M5 | Survey §1.2 / R2 |
| 10 | Retail Keyboard Shortcuts Engine | Global listeners for F2, F3, F4, F6, F8, F9, F10, Ctrl+Enter, Esc without interfering with typing | M5 | Survey §1.2 / R2 |
| 11 | Customer Selection & Credit Check | Searchable customer dropdown with outstanding balance and credit limit validation (zero != unlimited) | M5 | Survey §1.2 / R3 |
| 12 | Salesperson Selection | Terminal salesperson selector bound to F6 shortcut | M5 | Survey §1.2 / R2 |
| 13 | Multi-Tender Split Payment UI | Simultaneous Cash, Card POS, Mobile Wallets (EasyPaisa/JazzCash/Raast), Bank, and Credit with live balance | M5 | Survey §1.2 / R3 |
| 14 | Line & Invoice Discount Handling | Authorized line-level and invoice-wide discounts allocating proportionally across tax and GL accounts | M3 | Survey §1.2 / R3 |
| 15 | Purge Approval Workflows from UI | Remove "Submit for Approval" button and approval status badges from POS counter UI | M5 | Survey §1.2 / R4 |
| 16 | PosTerminal & PosShift Database Models | Add Prisma models for counter terminals and cashier shifts with opening float, closing count, and cash difference | M2 | Survey §1.2 / R5 |
| 17 | Clean Sequential Numbering | Enforce single-hyphen sequence formatting `ISB-SI-FY2026-27-000001` with hyphen sanitization preserving historical records | M2 | Survey §1.2 / R4 |
| 18 | Atomic POS Checkout Endpoint | `POST /api/pos/checkout` combining invoice creation, stock deduction, custody update, GL posting, and payment in one transaction | M3 | Survey §1.2 / R4 |
| 19 | Elimination of Approval Backend Checks | Remove approval queue / maker-checker requirements from sales invoice and payment posting pipelines | M3 | Survey §1.2 / R4 |
| 20 | Concurrency Locks & Idempotency | Row locks on `PhysicalStockUnit`, `StockBalance`, `DocumentSequence`, and idempotency keys preventing double-posting | M3 | Survey §1.2 / R4 |
| 21 | Balanced Commercial Journal Entry | Balanced double-entry GL journal: DR AR, CR Revenue, CR Tax, DR COGS, CR Inventory Asset | M3 | Survey §1.2 / R4 |
| 22 | Balanced Receipt Journal Entry | Balanced double-entry receipt journal: DR Cash/Bank/Wallet, CR AR (reducing open customer balance) | M3 | Survey §1.2 / R4 |
| 23 | Specific Identification COGS | Landed cost from `PhysicalStockUnit.acquisitionCost` debited to COGS for serialized handsets | M3 | Survey §1.2 / R4 |
| 24 | Weighted Average COGS | Weighted average unit cost from `StockBalance` debited to COGS for accessories | M3 | Survey §1.2 / R4 |
| 25 | Shift Opening & Float Management | Cashier shift opening modal recording opening cash float in drawer | M6 | Survey §1.2 / R5 |
| 26 | Shift Closing & Cash Reconciliation | Cashier closing count, expected vs actual cash reconciliation, over/short variance (excluding non-cash tenders) | M6 | Survey §1.2 / R5 |
| 27 | Parked Cart In-Terminal Recall | Recall draft invoice directly into `/pos?invoiceId=...` without navigating to ERP edit page | M6 | Survey §1.2 / R5 |
| 28 | Parked Cart Live IMEI Re-Validation | Revalidate that parked handsets are still `IN_STOCK` in warehouse upon cart recall | M6 | Survey §1.2 / R5 |
| 29 | Counter Return & Cash Refund Dialog | In-terminal return dialog validating original invoice and sold IMEI with cash drawer refund or credit | M6 | Survey §1.2 / R5 |
| 30 | Multi-Format Receipt Printing | A4 Tax Invoice, 80mm Thermal Receipt, and 58mm Compact Thermal Receipt with direct print buttons | M6 | Survey §1.2 / R5 |
| 31 | 15 POS Reports Implementation | Real-time database transaction reports covering all 15 mapped POS reports with date, branch, warehouse filters | M6 | Survey §1.2 / R5 |
| 32 | Comprehensive E2E Test Suite | Opaque-box automated test suite across Tiers 1-4 verifying all features, edge cases, and workflows | M7 / Test Track | Survey §1.2 / AC |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | POS Audit Documents & Architecture Blueprint | Generate 9 dedicated audit markdown files (`POS_SYSTEM_AUDIT.md`, `POS_DATABASE_AUDIT.md`, `POS_API_AUDIT.md`, `POS_ACCOUNTING_AUDIT.md`, `POS_INVENTORY_AUDIT.md`, `POS_UI_UX_AUDIT.md`, `POS_MISSING_FEATURES.md`, `POS_IMPLEMENTATION_PLAN.md`, `POS_TEST_REPORT.md`) at project root | none | IN_PROGRESS |
| M2 | Database Schema, Shift Models & Document Numbering | Add `PosTerminal` & `PosShift` models to Prisma, migrate DB, enforce single-hyphen `ISB-SI-FY2026-27-000001` numbering with historical record safety | M1 | PLANNED |
| M3 | Direct Atomic POS Posting Engine & GL Accounting | Implement `POST /api/pos/checkout` atomic transaction, purge approval checks, double-entry GL balancing, specific identification COGS | M2 | PLANNED |
| M4 | Barcode Scanner Engine & Dual Inventory Custody | Fix catalog search warehouse bug, verify dual-SIM IMEI resolution, enforce 1 handset = 1 cart row, accessory quantity stock checks | M3 | PLANNED |
| M5 | Counter Terminal UI, Hotkeys & Multi-Tender Payments | Redesign counter UI, implement F2-F10 shortcuts, multi-tender split payment grid, customer credit limit validation | M4 | PLANNED |
| M6 | Shift Management, Parked Sales, Returns, Printing & 15 Reports | Cashier shift opening/closing & reconciliation, parked cart recall & re-validation, counter returns, 58mm thermal receipt, 15 POS reports | M5 | PLANNED |
| M7 | Full E2E Test Suite Pass (100%) & Forensic Audit | Pass 100% of E2E tests (Tiers 1-4), Tier 5 adversarial coverage hardening, teamwork_auditor clean verification | M6 | PLANNED |

---

## Interface Contracts

### Counter Terminal Checkout Contract
- **Endpoint**: `POST /api/pos/checkout`
- **Request Body**:
  ```json
  {
    "idempotencyKey": "string (UUID)",
    "terminalId": "string (UUID)?",
    "shiftId": "string (UUID)?",
    "branchId": "string (UUID)",
    "warehouseId": "string (UUID)",
    "customerId": "string (UUID)",
    "salespersonId": "string (UUID)?",
    "invoiceDiscount": 0,
    "lines": [
      {
        "productId": "string (UUID)",
        "variantId": "string (UUID)",
        "trackingMethod": "IMEI | QUANTITY",
        "quantity": 1,
        "unitPrice": 120000,
        "discountAmount": 0,
        "taxRate": 0,
        "stockUnitId": "string (UUID)?"
      }
    ],
    "payments": [
      {
        "paymentMethod": "CASH | CARD | WALLET | BANK | CREDIT",
        "amount": 100000,
        "reference": "string?",
        "accountId": "string (UUID)?"
      }
    ]
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "invoice": {
      "id": "string",
      "invoiceNumber": "ISB-SI-FY2026-27-000001",
      "status": "POSTED",
      "grandTotal": 100000,
      "amountPaid": 100000,
      "amountDue": 0
    },
    "payments": [{ "id": "string", "paymentNumber": "ISB-RC-FY2026-27-000001", "status": "POSTED" }],
    "journalEntryId": "string"
  }
  ```

### Database Relational Model & Foreign Key Specifications
- **Payment Identifier Naming**: Uses `Payment.paymentNumber` strictly (matching `prisma/schema.prisma:3083`) rather than `voucherNumber` (which belongs solely to `JournalEntry`).
- **Required Opposite Relations on Existing Core Models**:
  - `Company`: `posTerminals PosTerminal[]`, `posShifts PosShift[]`
  - `Branch`: `posTerminals PosTerminal[]`, `posShifts PosShift[]`
  - `Account`: `terminalCashAccounts PosTerminal[] @relation("TerminalDefaultCashAccount")`
  - `User`: `cashierShifts PosShift[] @relation("CashierShifts")`
- **Required POS Foreign Key Relations on Transactions**:
  - `SalesInvoice`:
    - `terminalId String? @db.Uuid`, `terminal PosTerminal? @relation(fields: [terminalId], references: [id], onDelete: SetNull)`
    - `shiftId String? @db.Uuid`, `shift PosShift? @relation(fields: [shiftId], references: [id], onDelete: SetNull)`
  - `Payment`:
    - `terminalId String? @db.Uuid`, `terminal PosTerminal? @relation(fields: [terminalId], references: [id], onDelete: SetNull)`
    - `shiftId String? @db.Uuid`, `shift PosShift? @relation(fields: [shiftId], references: [id], onDelete: SetNull)`

### Shift Management Contract
- **Endpoints**:
  - `POST /api/pos/shifts/open`: `{ terminalId, openingFloat, notes }` -> `{ shiftId, openedAt, status: "OPEN" }`
  - `POST /api/pos/shifts/close`: `{ shiftId, countedCash, notes }` -> `{ shiftId, expectedCash, countedCash, variance, status: "CLOSED" }`
  - `GET /api/pos/shifts/active?terminalId=...`: Returns current open shift details and cumulative cash totals.

---

## Code Layout
- `prisma/schema.prisma` — Database schema (PhysicalStockUnit, PosTerminal, PosShift, SalesInvoice, JournalEntry)
- `src/app/api/pos/checkout/route.ts` — Atomic counter checkout endpoint
- `src/app/api/pos/shifts/route.ts` — Shift opening, closing, and reconciliation endpoints
- `src/components/sales/pos-workspace.tsx` — Counter Terminal UI, hotkeys, scanner engine, cart, tender
- `src/app/api/operations/catalog/search/route.ts` — Catalog search with warehouse custody
- `src/app/api/operations/catalog/resolve/route.ts` — Dual-SIM IMEI scanner resolver
- `src/app/(erp)/sales/[id]/print/page.tsx` — A4 Tax Invoice printable layout
- `src/app/(erp)/sales/[id]/receipt/page.tsx` — 80mm Thermal Receipt layout
- `src/app/(erp)/sales/[id]/receipt-58mm/page.tsx` — 58mm Compact Thermal Receipt layout
- `src/app/api/reports/operations/route.ts` — Operational and 15 POS reports query handler
- `src/components/reports/operations-report-workspace.tsx` — POS and operations reporting dashboard UI
