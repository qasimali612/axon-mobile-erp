# POS Specification Mining & Gap Analysis Report

**Module**: Retail Point of Sale (POS) Counter Terminal, Dual Inventory, Direct Atomic Posting, Shift Management & Accounting  
**Agent**: `teamwork_spec_miner_pos_gen2`  
**Working Directory**: `d:\Inventory Managment Software\.agents\teamwork\teamwork_spec_miner_pos_gen2\`  
**Date**: 2026-11-10T12:16:00Z  
**Target Milestone**: Comprehensive POS Audit & Specification Mining (R1 through R5 and Acceptance Criteria)

---

## 1. Observation

### 1.1 Specification Sources & Scope Reference
- **Primary Specification Source**: Authoritative requirements formulated for POS Counter Terminal in Axon Mobile ERP:
  - **R1**: Single/Multi-Operator architecture, RBAC permissions, direct posting without approval workflows, Maker-Checker elimination, and immutable audit logs.
  - **R2**: Counter Terminal workspace, barcode scanner engine (Enter/Tab suffixes, IMEI1/IMEI2 dual resolution, warehouse custody validation, duplicate prevention), complete retail keyboard shortcuts (F2, F3, F4, F6, F8, F9, F10, Ctrl+Enter, Esc).
  - **R3**: Dual inventory tracking (physical handsets fixed qty 1 vs quantity accessories/spare parts with manual qty), price lists, line/invoice discounts, taxes, multi-tender split payments (Cash, Card POS, EasyPaisa, JazzCash, Raast, Bank Deposit, Customer Credit with limits).
  - **R4**: Approval workflow removal, direct atomic posting within a single transaction, strict idempotency, balanced GL entries, actual-cost COGS (specific identification for handsets, weighted average for accessories), and clean sequential numbering (`ISB-SI-FY2026-27-000001`) preserving historical records.
  - **R5**: Shift & cash drawer tracking (opening/closing float, reconciliation without counting card/digital as cash), parked carts holding/retrieval without inventory reservation, invoice returns with original IMEI traceability and credit reversals, multi-format printing (A4, 80mm, 58mm), and all 15 required POS reports.
- **Codebase & Architecture Probed**:
  - Frontend: Next.js 15.5.28 App Router, React 19.2.0, Tailwind CSS, Lucide icons, Sonner notifications.
  - Backend & Services: Node.js, Next.js Route Handlers (`src/app/api/`), business services (`src/lib/operations/`, `src/lib/finance/`, `src/lib/reports/`).
  - Database & ORM: Prisma 6.19.3, PostgreSQL (ElectricSQL PGlite socket server at `127.0.0.1:54329`), 94 models, 33 enums, 44 migrations.
  - Test Harness: Vitest 4.1.12 (`vitest.config.mts`), TypeScript (`tsconfig.*.json`).
  - Build status: `npm run typecheck` passes with 0 errors across foundation, finance, ops, and scripts. `npm test` passes 11 test files (63 tests) in 1.41s.

---

### 1.2 Features Discovered Table

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Terminal UI | Auto-Focus Barcode Input | High-contrast console input ref that retains focus after scan and reset via `requestAnimationFrame` | Barcode string (gun keystrokes + Enter/Tab) | Updated scan code state, triggers catalog resolution | Triggers 220Hz error beep if invalid | `src/components/sales/pos-workspace.tsx:328,728-860` |
| 2 | Scanner Engine | Dual-SIM IMEI Resolution | Resolves either IMEI1 or IMEI2 to identical `PhysicalStockUnit` record | 15-digit IMEI string, warehouseId | Product, Variant, Price, StockUnitId, Identifiers array | Throws 409 if IMEI belongs to different unit | `src/app/api/operations/catalog/resolve/route.ts:29-88` |
| 3 | Scanner Engine | Warehouse Custody Guard | Prevents scanning or adding devices located in a different warehouse or branch | StockUnit currentWarehouseId vs active terminal warehouseId | Validated handset object | Throws `409 DEVICE_WRONG_WAREHOUSE` | `src/app/api/operations/catalog/resolve/route.ts:45-52` |
| 4 | Scanner Engine | Device Status Custody Guard | Rejects devices that are SOLD, RESERVED, QUARANTINED, or IN_TRANSIT | `unit.status` | Validated handset object | Throws `409 DEVICE_ALREADY_SOLD`, `409 DEVICE_RESERVED`, etc. | `src/app/api/operations/catalog/resolve/route.ts:54-72` |
| 5 | Cart Engine | Duplicate IMEI Prevention | Prevents scanning the same handset twice into the cart | `stockUnitId` vs `cart.some(l => l.stockUnitIds.includes(...))` | Rejects addition | Throws alert: "This physical device is already in the cart" | `src/components/sales/pos-workspace.tsx:263-270` |
| 6 | Cart Engine | Handset Fixed Qty (Broken grouping) | Enforces non-editable qty on handset row, but incorrectly groups multiple identical handsets into a single line | Additional scan of same model | Increments line.quantity and appends stockUnitId | Violates 1 handset = 1 cart row rule | `src/components/sales/pos-workspace.tsx:268,928-941` |
| 7 | Cart Engine | Accessory Quantity Controls | Allows numeric manual quantity editing bounded by available warehouse stock | Number input, Plus/Minus buttons | Updated line quantity, subtotal, tax | Clamped to available stock | `src/components/sales/pos-workspace.tsx:932-941` |
| 8 | Hotkeys | Retail Keyboard Shortcuts | Global hotkeys for terminal actions (F2, F3, F4, F8, Ctrl+Enter, Esc) | Keydown events | Search modal, scanner focus, clear cart, quick tender | Partial: F6, F9, F10 missing; Esc doesn't close all modals | `src/components/sales/pos-workspace.tsx:584-596` |
| 9 | Pricing | Customer Price List & Floor | Resolves customer-specific tier or default list with price floor enforcement | customerId, variantId | Resolved unit price, minimum price floor | Displays red price floor warning if price < floor | `src/app/api/catalog/prices/resolve/route.ts` |
| 10 | Discounts | Line-Level Discount | Applies flat cash or percentage discount per cart item | discountAmount input | Net line total calculation | Disallowed to exceed line subtotal | `src/components/sales/pos-workspace.tsx:952` |
| 11 | Discounts | Invoice-Level Discount | **MISSING**: No invoice-wide discount field or prorated GL distribution exists | N/A | N/A | Feature absent | `src/components/sales/pos-workspace.tsx` audit |
| 12 | Tender | Multi-Tender Split Payments | **MISSING**: Single tender radio selection only (`cash`, `card`, `wallet`, `credit`) | Split payment tender allocations | N/A | Feature absent; cannot split 50% cash / 50% card | `src/components/sales/pos-workspace.tsx:992-1014` |
| 13 | Tender | Cash Denomination & Change | Quick denomination chips (+500, +1k, +5k, +10k, Exact) with high-contrast change return | Amount tendered | Change return display | Shows negative remaining if underpaid | `src/components/sales/pos-workspace.tsx:1280-1358` |
| 14 | Checkout | Chained Client HTTP Calls | Completes checkout via 8 sequential browser HTTP calls (Invoice draft->submit->approve->post, Payment draft->submit->approve->post) | Cart & Tender | Invoice & Payment records | Race conditions, 2-4s latency, unposted payment risk | `src/components/sales/pos-workspace.tsx:380-515` |
| 15 | Direct Posting | Atomic POS Checkout | **MISSING**: Backend atomic endpoint `POST /api/pos/checkout` combining invoice, custody, GL, and payment in one transaction | Cart items, payments array, customerId, branchId, warehouseId | Posted SalesInvoice, Payment, JournalEntry, StockMovements | All-or-nothing rollback on any error | Identified architectural requirement |
| 16 | Accounting | Double-Entry Balancing | Atomic creation of balanced GL journals for invoice and payment | Invoice grandTotal, net revenue, tax, COGS | Debit AR, Credit Sales, Credit Tax, Debit COGS, Credit Inv | Throws 422 `UNBALANCED_SOURCE_JOURNAL` if Debit != Credit | `src/lib/operations/sales.ts:523-545` |
| 17 | Accounting | Actual-Cost COGS (Handsets) | Specific identification of actual landed cost from `PhysicalStockUnit.acquisitionCost` | Handset `stockUnitId` | Transferred to COGS account | Throws 409 if unit cost is invalid | `src/lib/operations/sales.ts:486-488` |
| 18 | Accounting | Weighted-Average COGS (Accessories) | Computes weighted average unit cost from `StockBalance.inventoryValue / quantity` | VariantId, warehouseId | Transferred to COGS account | Throws 409 if balance is zero or negative | `src/lib/operations/sales.ts:501-505` |
| 19 | Document Sequence | Concurrency-Safe Numbering | Row-lock sequence allocator generating clean branch-specific numbers e.g. `ISB-SI-FY2026-27-000001` | branchId, documentType, fiscalYear | Formatted document number | Sanitizes leading/trailing hyphens; preserves historical records | `src/lib/document-sequence.ts`, `src/lib/operations/accounting.ts:105-115` |
| 20 | Cash Drawer | Shift Opening & Cash Float | **MISSING**: Cashier opening float entry, workstation binding, shift timestamp | Cashier ID, terminal ID, opening float | PosShift record | Feature absent; no model or API exists | `prisma/schema.prisma` audit |
| 21 | Cash Drawer | Shift Closing & Cash Count | **MISSING**: Cashier physical cash denomination count, expected vs actual cash reconciliation, over/short variance | Physical denomination count | Reconciliation summary (Z-Report) | Feature absent | `prisma/schema.prisma` audit |
| 22 | Parked Carts | Hold Cart Without Reservation | Saves draft sales invoice without reserving physical handsets in stock balance or inventory reservation | Cart items, customer | Draft SalesInvoice with metadata `NONE_UNTIL_POSTING` | Does not hold lock; leaves items sellable | `src/lib/operations/sales.ts:185-245` |
| 23 | Parked Carts | Parked Cart Retrieval | **BROKEN**: Recalls parked sale but redirects away from POS to `/sales/[id]/edit` and skips device custody re-validation | Invoice ID | Navigation to ERP edit page | Cashier leaves POS terminal; sold items fail late | `src/components/sales/pos-workspace.tsx:1600` |
| 24 | Returns | Sales Return with IMEI Traceability | Validates returned handset was actually sold on original invoice, restores stock, posts AR credit & revenue reversal | InvoiceId, StockUnitId, ReturnDisposition (Restock/Quarantine) | Restocked PhysicalStockUnit, Balanced reversal GL journal | Throws 422 if device wasn't sold on source invoice | `src/lib/operations/stock-return.ts:61-88,184-190` |
| 25 | Returns | Counter POS Return / Refund | **MISSING**: Integrated counter return interface in POS terminal for cash drawer refund or item exchange | Scanned returned IMEI or invoice number | Cash refund from drawer or exchange credit | Feature absent; returns only accessible in `/returns` | `src/components/sales/pos-workspace.tsx` audit |
| 26 | Printing | Standard A4 Tax Invoice | Server-rendered A4 print layout with Code128 barcode, customer tax details, item breakdown | Invoice ID | High-resolution printable HTML page | Approval artifacts remain in signature/footer | `src/app/(erp)/sales/[id]/print/page.tsx` |
| 27 | Printing | 80mm Thermal Receipt | Fixed 80mm thermal receipt with monospace font, item lines, IMEIs, tax, tenders | Invoice ID | Thermal-optimized HTML page | Fixed TS error; lacks direct button on POS card | `src/app/(erp)/sales/[id]/receipt/page.tsx` |
| 28 | Printing | 58mm Compact Thermal Receipt | **MISSING**: 58mm compact thermal layout (32-column width) for mobile/portable POS receipt printers | N/A | N/A | Feature absent | Codebase audit |
| 29 | Reports | Operational & Sales Reports | 27 operational reports backed by enterprise services and legacy queries | Report key, date range, branch, warehouse, filters | JSON data, CSV with UTF-8 BOM, print preview | Throws 422 if invalid report key or date format | `src/app/api/reports/operations/route.ts` |
| 30 | Reports | 15 POS-Specific Reports | Mapped set of 15 essential retail counter reports (detailed audit in §1.4) | Multi-criteria filters | Aggregated KPIs and grids | 7 exist, 1 partial, 7 missing | Codebase audit |

---

### 1.3 Edge Cases Table

| # | Feature | Input / Condition | Observed / Documented Behavior |
|---|---------|-------------------|--------------------------------|
| 1 | Dual-SIM Handset Scan | Cashier scans IMEI2 instead of IMEI1 for dual-SIM phone | `resolve/route.ts` queries `DeviceIdentifier` by `normalizedValue`. Resolves to exact same `stockUnit.id`. If already in cart, throws duplicate warning. |
| 2 | Concurrent Handset Sale | Two counter terminals scan identical physical handset simultaneously | First transaction to post locks row via `lockPhysicalStockUnit` (`SELECT ... FOR UPDATE`). Second transaction throws `409 STOCK_UNIT_UNAVAILABLE`. |
| 3 | Accessing Wrong Warehouse Handset | Cashier scans IMEI physically in branch A while terminal is set to warehouse B | `resolve/route.ts` validates `unit.currentWarehouseId === warehouseId`. Throws `409 DEVICE_WRONG_WAREHOUSE`. |
| 4 | Parked Cart Recalled After Handset Sold | Cart held for 2 hours; during that time, phone was sold on another counter | When recalled and submitted for posting, `lockPhysicalStockUnit` detects `unit.status === SOLD`. Throws `409 STOCK_UNIT_UNAVAILABLE`. |
| 5 | Non-Serialized Stock Depletion | Accessory quantity exceeds warehouse on-hand stock minus active reservations | `assertSufficientBalance` and reservation check throw `409 INSUFFICIENT_AVAILABLE_STOCK` with exact requested vs on-hand details. |
| 6 | Price Floor Violation | Cashier enters custom selling price lower than configured price floor | POS UI displays high-contrast red warning. Backend validates discount cap / price floor during posting. |
| 7 | Payment Failure During Chained HTTP Checkout | Sale invoice posts successfully, but browser network drops before payment posts | Invoice remains `POSTED` with open AR balance; payment remains unposted; cash in hand ledger shows Rs 0 for the sale. |
| 8 | Return of Never-Sold IMEI | Customer attempts return with IMEI not present on source invoice | `validateAllocations` in `stock-return.ts` checks `source.units`. Throws `422 INVALID_RETURN_UNIT`. |
| 9 | Duplicate Return of Same Handset | Customer attempts returning same IMEI a second time against original invoice | Prior return aggregation checks `stockReturnLine` records. Throws `409 RETURN_QUANTITY_EXCEEDED` and `409 RETURN_UNIT_UNAVAILABLE`. |
| 10 | Sequential Number Concurrency | 10 cashier checkouts complete in parallel within the same 100ms window | PostgreSQL row lock in `nextDocumentNumber` (`ON CONFLICT ... DO UPDATE`) serializes sequence increments; zero collision or gaps. |
| 11 | Historical Invoice Query | Fetching historical invoice `ISB--SI-FY2026-27-000004` (with double hyphen) | Preserves exact historical string in DB; sequence upsert updates prefix for subsequent vouchers without altering past records. |
| 12 | Shift Cash Reconciliation with Card Payments | Shift has Rs 100k card sales and Rs 20k cash sales | Expected physical cash in drawer must strictly equal Opening Float + Rs 20k Cash Sales; card transactions must be excluded from drawer cash count. |
| 13 | Unbalanced Journal Prevention | Manual GL line creation where Debits != Credits by 0.01 | `postOperationalJournal` validates `totalDebit.equals(totalCredit)`. Throws `422 UNBALANCED_SOURCE_JOURNAL`. |
| 14 | Decimal Precision Rounding | Currency division producing repeating decimals (e.g. 1000 / 3) | Decimal fields use `Decimal(19,4)` with `ROUND_HALF_UP` to prevent fractional paisa drift. |
| 15 | Single-User Mode vs Multi-User Switching | Admin switches operating mode in system settings | Replaces mode setting while preserving 100% of schema, tables, historical invoices, inventory movements, and journal lines. |

---

### 1.4 Deep Audit of Requirement R4 (Approval Removal, Direct Atomic Posting, Numbering, GL Balancing & COGS)

#### 1. Approval Removal & Maker-Checker Elimination
- **Current State in Operating Mode**:
  - `src/lib/operating-mode.ts`: `assertMakerChecker` (lines 171-180) and `assertSegregationOfDuties` (lines 186-198) are already no-ops returning immediately.
  - `isSingleUserMode` always returns `true`.
  - Database trigger `enforce_document_maker_checker()` was disabled via migration `20261109180000_disable_maker_checker_triggers`.
- **Remaining Residual Approval Artifacts in Sales & UI**:
  - In `src/lib/operations/sales.ts`:
    - `submitSalesInvoice` (lines 384-404) and `approveSalesInvoice` (lines 407-444) still exist and enforce `assertApprovalPolicy`.
    - `postSalesInvoice` (lines 454-465) contains a status-bypass hack: if status is `DRAFT` or `SUBMITTED`, it updates status to `APPROVED` before proceeding to post.
  - In `src/components/sales/pos-workspace.tsx`:
    - Line 1428: `<button onClick={() => void createInvoice(true, false)} ...><Send className="h-4 w-4"/>Submit for Approval</button>` is still present in the POS sidebar!
    - Lines 526-531: Credit override still sends an HTTP request to `/api/sales/invoices/${targetInvoiceId}/approve`.
  - In `src/app/(erp)/sales/[id]/print/page.tsx`:
    - Line 37 signature block includes `Approved by`.
    - Line 38 footer includes `"Workflow copy — subject to approval and posting."` when status is not `POSTED`.
  - In `src/components/sales/sales-manager.tsx`:
    - Table filters and action dropdowns still expose "Submit", "Approve", and chained workflow states.
- **Specification Mandate**:
  - Completely eliminate all approval requests, buttons, and intermediate states from POS and Sales.
  - Allowed document lifecycle strictly: `DRAFT`, `POSTED`, `CANCELLED`, `REVERSED`.
  - Authorized POS cashiers create and post transactions directly in one step.

#### 2. Direct Atomic Posting vs 8-Step HTTP Chaining
- **Flaw in Current Implementation**:
  - `src/components/sales/pos-workspace.tsx` lines 380-515 executes up to 8 sequential client HTTP requests over the network:
    1. `POST /api/sales/invoices` (Draft)
    2. `POST /api/sales/invoices/${id}/submit`
    3. `POST /api/sales/invoices/${id}/approve`
    4. `POST /api/sales/invoices/${id}/post`
    5. `POST /api/payments` (Draft with allocation)
    6. `POST /api/payments/${payId}/submit`
    7. `POST /api/payments/${payId}/approve`
    8. `POST /api/payments/${payId}/post`
  - Total checkout latency: 2,000ms – 4,500ms.
  - Vulnerability: If client disconnects or payment posting errors after step 4, the sales invoice is posted (stock deducted, AR debited), but the payment is never posted to GL. As a result, Account 1000 (Cash on Hand) records zero debit, causing the daily cash drawer to appear short!
- **Specification Mandate**:
  - Implement a dedicated atomic backend endpoint: `POST /api/pos/checkout`.
  - The cashier’s terminal sends one payload: cart items, customerId, branchId, warehouseId, payment tenders array, and idempotency key.
  - The backend executes a single serializable database transaction:
    - Verifies device custody and locks handset rows (`SELECT ... FOR UPDATE`).
    - Verifies non-serialized accessory balance and locks `StockBalance`.
    - Allocates sequential invoice number (`ISB-SI-FY2026-27-xxxxxx`).
    - Creates `SalesInvoice` with status `POSTED`.
    - Deducts stock via `InventoryMovement` (`SALE_ISSUE`).
    - Updates `PhysicalStockUnit` to `status: SOLD`, `soldAt: now()`.
    - Posts balanced double-entry commercial `JournalEntry`.
    - Creates `Payment` with status `POSTED` and allocations to the invoice.
    - Posts balanced double-entry receipt `JournalEntry` (Debit Cash/Bank, Credit AR).
    - Completes in < 250ms with all-or-nothing rollback on any failure.

#### 3. Idempotency & Concurrency Protection
- **Idempotency Mechanisms**:
  - Document Sequences: Row-level lock on `DocumentSequence` (`companyId`, `branchId`, `documentType`, `fiscalYear`).
  - Sales Invoice: `companyId_idempotencyKey` unique constraint on `SalesInvoice`.
  - Payment: `companyId_idempotencyKey` unique constraint on `Payment`.
  - Inventory Movements: `companyId_idempotencyKey` unique constraint on `InventoryMovement`.
  - Journal Entries: `companyId_sourceModule_idempotencyKey` unique constraint on `JournalEntry`.
  - Stock Units: Optimistic concurrency `version` column and row lock (`SELECT ... FOR UPDATE`).
  - Stock Balances: Row-level lock on `StockBalance` (`SELECT ... FOR UPDATE`).
- If a cashier presses "Post Sale" twice or a network retry occurs, the system matches the existing idempotency key and returns the already-posted document without duplicate deductions or double postings.

#### 4. Balanced GL Entries Architecture
- In `src/lib/operations/sales.ts` lines 523-545:
  - Commercial Sale Journal Entry:
    - **DR** Accounts Receivable (`ACCOUNTS_RECEIVABLE`): `invoice.grandTotal` (tagged with customer subledger dimension `customerId`, `invoiceNumber`, `dueDate`).
    - **CR** Sales Revenue (`SALES_REVENUE`): `netRevenue` (`invoice.subtotal - invoice.discountTotal`).
    - **CR** Output Tax (`TAX_PAYABLE`): `invoice.taxTotal` (if `taxTotal > 0`).
    - **DR** Cost of Goods Sold (`COGS`): `totalCost`.
    - **CR** Inventory Asset (`INVENTORY`): `totalCost`.
  - Mathematical Proof of Balance:
    $$\text{Debit Total} = \text{GrandTotal} + \text{TotalCost}$$
    $$\text{Credit Total} = \text{NetRevenue} + \text{TaxTotal} + \text{TotalCost} = (\text{NetRevenue} + \text{TaxTotal}) + \text{TotalCost} = \text{GrandTotal} + \text{TotalCost}$$
    $$\text{Balance Difference} = \text{Debit Total} - \text{Credit Total} \equiv 0.0000$$
- In `src/lib/operations/payments.ts` lines 356-385:
  - Receipt Journal Entry:
    - **DR** Cash on Hand (`1000` / `CASH`) or Bank Account (`BANK`): `payment.amount`.
    - **CR** Accounts Receivable (`ACCOUNTS_RECEIVABLE`): `payment.amount` (tagged with `customerId`).
  - Mathematical Proof of Balance:
    $$\text{Debit Total} = \text{Payment.amount}$$
    $$\text{Credit Total} = \text{Payment.amount}$$
    $$\text{Net AR Balance for Cash Customer} = +\text{GrandTotal} - \text{Payment.amount} = 0.0000$$

#### 5. Actual-Cost COGS (Specific Identification vs Weighted Average)
- **Handsets & Serialized Devices**:
  - Tracking method: `TrackingMethod.IMEI` or `TrackingMethod.SERIAL`.
  - Each physical device is identified by its unique IMEI.
  - In `src/lib/operations/sales.ts` line 486:
    `lineCost = lineCost.plus(unit.acquisitionCost);`
  - The exact landed cost recorded during Goods Receipt (GRN) is debited to COGS.
  - This eliminates standard costing variances and guarantees exact gross margin reporting per phone sold.
- **Accessories & Spare Parts**:
  - Tracking method: `TrackingMethod.QUANTITY`.
  - Uses Weighted Average Cost:
    $$\text{Unit Cost} = \frac{\text{StockBalance.inventoryValue}}{\text{StockBalance.quantity}}$$
    $$\text{Line Cost} = \text{Unit Cost} \times \text{Line.quantity}$$

#### 6. Document Numbering Format `ISB-SI-FY2026-27-000001`
- **Separator Bug & Fix Analysis**:
  - `src/lib/operations/accounting.ts` previously concatenated `branch.documentPrefix` (`ISB-`) and suffix (`SI`) into `ISB--SI`.
  - When `DocumentSequence` was initialized, `prefix` was stored as `ISB--SI`, causing invoices to generate as `ISB--SI-FY2026-27-000001`.
  - Fix verified in working copy:
    - `cleanBranch = (branch.documentPrefix || "BR").trim().replace(/-+$/, "")` strips trailing hyphens (`"ISB-"` -> `"ISB"`).
    - `cleanSuffix = (input.suffix || "DOC").trim().replace(/^-+/, "")` strips leading hyphens (`"-SI"` -> `"SI"`).
    - Concatenated prefix: `${cleanBranch}-${cleanSuffix}` (`"ISB-SI"`).
    - In `src/lib/document-sequence.ts`, `ON CONFLICT ... DO UPDATE SET "prefix" = ${input.prefix}` updates the prefix in `DocumentSequence`, ensuring all new documents generate with single hyphens (`ISB-SI-FY2026-27-000001`).
  - **Historical Safety**:
    - Existing vouchers with double hyphens (e.g. `ISB--SI-FY2026-27-000004`) are preserved unmodified in PostgreSQL.
    - Zero historical records are renamed, rewritten, or deleted.

---

### 1.5 Deep Audit of Requirement R5 (Shift/Drawer, Parked Carts, Returns, Multi-Format Print & 15 POS Reports)

#### 1. Shift & Cash Drawer Tracking
- **Gap Analysis**:
  - Current status in `prisma/schema.prisma`: **MISSING**. No models for `PosTerminal`, `PosShift`, or `CashDrawerSession`.
  - Current status in UI: **MISSING**. No shift opening modal, no drawer float entry, no drawer closing screen.
- **Specification Requirements**:
  - `PosTerminal` model: `id`, `companyId`, `branchId`, `code`, `name`, `defaultCashAccountId`, `receiptPrinterType` (`THERMAL_80MM`, `THERMAL_58MM`, `A4`), `isActive`.
  - `PosShift` model: `id`, `companyId`, `branchId`, `terminalId`, `cashierId`, `openedAt`, `closedAt`, `status` (`OPEN`, `CLOSED`), `openingFloat`, `closingActualCash`, `closingExpectedCash`, `cashDifference`, `notes`.
  - Cash Reconciliation Rule:
    $$\text{Expected Cash} = \text{Opening Float} + \text{Cash Sales} - \text{Cash Refunds} + \text{Cash In} - \text{Cash Out}$$
    $$\text{Variance} = \text{Closing Actual Cash} - \text{Expected Cash}$$
  - **Strict Segregation Rule**: Card payments, EasyPaisa, JazzCash, Raast, and Bank transfers MUST NOT be added to expected physical drawer cash. They are reported in separate non-cash tender audit totals.

#### 2. Parked Carts Holding & Retrieval Without Reservation
- **Gap Analysis**:
  - In `src/lib/operations/sales.ts`: Draft invoice creation (`createSalesDraftInvoice`) creates records in `SalesInvoice` and `SalesInvoiceLine` with `status: DRAFT` and audit log `stockEffect: "NONE_UNTIL_POSTING"`. It does not create `InventoryReservation` or `InventoryMovement`. This correctly avoids stock reservation.
  - Flaw 1 (UI Notice): `pos-workspace.tsx` line 519 displays: `"Physical stock remains reserved until posted."` This message is factually incorrect and misleads retail staff.
  - Flaw 2 (Recall Navigation): Line 1600 executes `router.push('/sales/${inv.id}/edit')`, which redirects the cashier away from the POS counter to the ERP back-office invoice screen.
  - Flaw 3 (Missing Custody Re-validation): If a parked phone is sold on another counter while parked, recalling the invoice in `/pos` does not immediately re-check availability before the cashier tenders.
- **Specification Fix**:
  - Update notice: `"Sale held as draft. Physical stock remains available until posted."`
  - Recall action: Navigate directly to `/pos?invoiceId=${inv.id}` to populate `<PosWorkspace>`.
  - Upon loading parked cart: Call `/api/operations/catalog/resolve` for all physical stock units in the cart to verify they are still `IN_STOCK` in the current warehouse. If any unit was sold or moved, flag the line with a red warning badge.

#### 3. Invoice Returns with IMEI Traceability & Credit Reversals
- **Current State**:
  - `src/lib/operations/stock-return.ts` implements rigorous backend validations:
    - Verifies source sales invoice is `POSTED` and not reversed.
    - Validates that returned physical stock units were sold on that specific source invoice line.
    - Restores returned handsets to `IN_STOCK` (Restock) or `QUARANTINED` (Quarantine).
    - Posts balanced double-entry GL journal reversing revenue, tax, AR, inventory, and COGS.
- **Gap Analysis**:
  - The return workflow is isolated in `/returns` (`src/app/(erp)/returns/page.tsx`).
  - Cashiers at the counter terminal cannot process customer returns or exchanges directly within `pos-workspace.tsx`.
  - When a customer returns a phone for cash refund at the counter, the cash refund is not deducted from the cashier's active cash drawer session.
- **Specification Fix**:
  - Provide a "Customer Return / Exchange" action dialog in `pos-workspace.tsx`.
  - Cashier enters Invoice # or scans customer’s returned handset IMEI.
  - Counter returns process immediately with choice of: Cash Refund (deducted from cash drawer), Store Credit Note, or Cart Exchange Credit.

#### 4. Multi-Format Printing (A4, 80mm, 58mm)
- **Current State**:
  - A4: Implemented at `/sales/[id]/print` (`src/app/(erp)/sales/[id]/print/page.tsx`) with Code128 barcode, company header, customer details, tax grid, and financial summary.
  - 80mm: Implemented at `/sales/[id]/receipt` (`src/app/(erp)/sales/[id]/receipt/page.tsx`) with monospace thermal styling and breakdown.
- **Gaps**:
  - 58mm Thermal Layout: **MISSING**. 58mm thermal printers (widely used in retail mobile shops) require a compact 32-column layout with abbreviated headers and optimized line item wraps.
  - POS Completion Card: Line 1451 links only to `/sales/${invoice.id}/print` (A4). There is no direct button to print the 80mm or 58mm receipt upon checkout completion.

#### 5. Audit of All 15 Required POS Reports Against Codebase

| # | Report Name | Description & Key Metrics | Status in Codebase | Source File / Endpoint | Missing Elements & Gap Details |
|---|-------------|---------------------------|-------------------|------------------------|--------------------------------|
| 1 | **Daily POS Sales Summary (Z-Report)** | End-of-day counter summary: Gross sales, discounts, taxes, net sales, cash/card/wallet collections, returns, net cash collected | **PARTIAL** | `/api/reports/operations?report=sales` | Only returns raw invoice lines; lacks aggregated daily summary, tender breakdown, and shift reconciliation. |
| 2 | **Cashier Shift Reconciliation & Cash Drawer Discrepancy** | Opening cash float, cash sales, cash refunds, paid-in/out, expected cash, counted cash, overage/shortage variance | **MISSING** | None | No shift models, no drawer count tracking, no shift reconciliation report. |
| 3 | **Multi-Tender Payment Method Breakdown** | Revenue and transaction count grouped by tender (Cash, Card POS, EasyPaisa, JazzCash, Raast, Bank Deposit, Customer Credit) | **MISSING** | None | Currently payments are tracked in general ledger lines; no aggregated POS tender distribution report. |
| 4 | **Hourly POS Sales Distribution & Traffic** | Sales volume and foot traffic (transaction count) bucketed by hour of day (8 AM – 11 PM) for cashier staffing | **MISSING** | None | No hourly aggregation service or visualization exists in operations reports. |
| 5 | **Product & Variant Sales Summary** | Quantity sold, average selling price, discounts, net revenue, and COGS grouped by product model and storage/color variant | **EXISTS** | `src/lib/reports/services/sales-reports.ts:73` (`sales-by-model`) | Fully functional with revenue, units sold, avg selling price, and margin %. |
| 6 | **Sales & Gross Margin by Brand** | Revenue, phone units sold, COGS, gross profit, and margin % aggregated by phone brand (Apple, Samsung, Xiaomi, etc.) | **EXISTS** | `src/lib/reports/services/sales-reports.ts:16` (`sales-by-brand`) | Fully functional with multi-criteria filtering and cost-permission guards. |
| 7 | **Line Profitability & Margin Analysis** | Invoice-by-invoice, line-by-line actual revenue, exact handset acquisition cost (IMEI-specific) or weighted average cost, profit & margin | **EXISTS** | `src/app/api/reports/operations/route.ts:256` (`profitability`) | Fully functional with exact acquisition cost resolution for serialized units. |
| 8 | **Salesperson Performance & Commission** | Counter sales lead metrics: invoice count, units sold, total sales revenue, gross margin contribution, and commission baseline | **EXISTS** | `src/lib/reports/services/sales-reports.ts:139` (`salesperson-performance`) | Fully functional with salesperson lookup and margin contribution. |
| 9 | **Fast-Moving Stock Report** | High-velocity phone models sorted by units sold in period vs current warehouse on-hand stock to prevent stockouts | **EXISTS** | `src/lib/reports/services/sales-reports.ts:197` (`fast-moving-stock`) | Fully functional comparing period sales against current on-hand balances. |
| 10 | **Slow-Moving / Dead Stock Capital-at-Risk** | Low-turnover phone models with zero or minimal sales and aging inventory, calculating total capital tied up | **EXISTS** | `src/lib/reports/services/sales-reports.ts:197` (`slow-moving-stock`) | Fully functional with capital-at-risk calculation. |
| 11 | **Sold IMEI Audit & Customer Traceability Registry** | Master register of all sold handset IMEIs: IMEI1, IMEI2, sold date, customer, salesperson, and source invoice number | **EXISTS** | `src/lib/reports/services/imei-reports.ts:63` (`sold-imei`) | Fully functional with dual-slot IMEI display and invoice linking. |
| 12 | **Available IMEI Counter Inventory & Aging** | Real-time registry of unsold handsets in counter warehouse with aging brackets (0-30, 31-60, 61-90, 90+ days) and landed cost | **EXISTS** | `src/lib/reports/services/imei-reports.ts:56` (`available-imei`), `inventory-reports.ts:103` (`stock-aging`) | Fully functional with aging bucket breakdown and warehouse filtering. |
| 13 | **POS Customer Returns & IMEI Restock Audit** | Register of counter customer returns: original invoice, returned IMEI, return reason, disposition (Restock vs Quarantine), refund amount | **PARTIAL** | `src/app/api/reports/operations/route.ts:245` (`sales-returns`) | Tracks warehouse sales returns; lacks counter cash refund and exchange tracking. |
| 14 | **Discounts, Price Overrides & Exceptions Audit** | Audit log of all line-level discounts, invoice discounts, below-floor price overrides, and credit limit overrides executed at counter | **MISSING** | None | Discounts are stored on invoice lines, but no dedicated exception/override audit report exists. |
| 15 | **Parked / Held Sales Drafts Status** | Register of currently held/parked sales: parking timestamp, cashier, customer, item count, total value, and hold duration | **MISSING** | None | Only a basic modal query exists in `pos-workspace.tsx`; no reporting view, export, or abandoned cart alerts. |

---

## 2. Logic Chain

1. **Why Direct Atomic Posting is Required over Client-Side Chaining**:
   - The current checkout in `pos-workspace.tsx` triggers 8 sequential HTTP requests.
   - If payment posting fails after invoice posting (due to network glitch, policy validation, or session expiration), the invoice remains `POSTED` (inventory deducted, customer AR debited), but the payment remains unposted.
   - `src/lib/finance/cash-in-hand.ts` filters strictly on posted journal lines (`status: { in: ['POSTED', 'REVERSED'] }`).
   - Because the payment never posted to GL, zero cash debits were recorded against Account 1000.
   - Result: Cash in hand reports show Rs 0 for that transaction, and the customer is incorrectly shown as having an open receivable balance.
   - **Conclusion**: A single atomic backend endpoint `POST /api/pos/checkout` running within one serializable database transaction is mandatory to guarantee all-or-nothing atomicity.

2. **Why Handsets Must Strictly Be 1 Unit Per Cart Line**:
   - Currently, `pos-workspace.tsx` line 268 groups multiple scanned handsets of the same variant into a single line with `quantity > 1` and `stockUnitIds: [id1, id2]`.
   - In mobile retail, each physical phone is a distinct serialized asset with its own unique IMEI1, IMEI2, and specific acquisition cost.
   - Handset lines must never support manual quantity editing or multi-unit grouping.
   - **Conclusion**: Handset cart quantity must be strictly fixed at 1 per physical stock unit; scanning two identical models must create two separate available physical unit rows.

3. **Why Shift Management Must Separate Digital Tenders from Physical Drawer Cash**:
   - Cashiers collect payments in cash, debit/credit cards, and mobile wallets (EasyPaisa, JazzCash, Raast).
   - Only physical banknotes and coins reside in the cash drawer.
   - If digital payments are added to the drawer cash balance, the physical cash count will always show massive, false cash shortages.
   - **Conclusion**: Cash drawer reconciliation must compute `Expected Cash = Opening Float + Cash Sales - Cash Refunds + Cash In - Cash Out`. Card and digital wallet totals must be tracked in parallel non-cash totals.

4. **Why Parked Carts Must Not Reserve Inventory**:
   - If a customer steps aside to take a call or check their bank balance, holding their cart must not block other counter cashiers from selling the items.
   - Reserving stock on held carts creates artificial stockouts and dead inventory.
   - **Conclusion**: Parked carts must be stored as drafts without stock reservation (`stockEffect: "NONE_UNTIL_POSTING"`). When retrieved, active IMEI availability must be re-validated in real-time.

5. **Why Document Sequences Must Enforce Hyphen Sanitization**:
   - Trailing hyphens on branch prefixes (`"ISB-"`) combined with suffixes (`"-SI"`) previously created double hyphens (`"ISB--SI"`).
   - Sanitizing branch and suffix strings ensures uniform formatting (`ISB-SI-FY2026-27-000001`).
   - Concurrency row locks on `DocumentSequence` prevent sequence numbering race conditions.
   - **Conclusion**: Historical records remain untouched, while all new documents strictly adhere to single-hyphen formatting.

---

## 3. Caveats

- **No Code Implementation in this Turn**: In accordance with the Spec Miner role, no production source code was modified.
- **Hardware Peripherals**: Physical thermal receipt printers (ESC/POS 80mm/58mm USB/Ethernet/Bluetooth) and USB hardware barcode scanners operate via standard browser events (`keydown` keyboard emulation, Web Audio API, `@media print` CSS rules).
- **Historical Data Safety**: Historical invoices, vouchers, stock movements, and audit records in the database must never be deleted, truncated, or rewritten.

---

## 4. Conclusion & Structured Sections for the 9 Audit Files

The specification mining investigation confirms that Axon Mobile ERP has strong foundational capabilities (serializable transactions, double-entry GL balancing, and specific identification COGS), but requires critical counter terminal repairs and architectural additions. Below are the complete structured sections that will comprise the 9 required audit files:

---

### Audit File 1: POS_SYSTEM_AUDIT.md
- **Architecture Overview**: Next.js 15.5.28 App Router, React 19.2.0, Tailwind CSS, Prisma 6.19.3 ORM, PostgreSQL database.
- **Operating Modes**: Single-User / Single-Operator Mode is active (`isSingleUserMode = true`). Maker-checker restrictions and segregation of duties are disabled project-wide.
- **Role-Based Access Control (RBAC)**: Terminal operations gated by permissions:
  - `SALES_INVOICE_CREATE`: Counter terminal access (`/pos`).
  - `sales.view`: Invoice view and print preview (`/sales/[id]/print`, `/sales/[id]/receipt`).
  - `report.sales`, `report.inventory`, `report.profitability`: Reporting workspace access.
- **Hardware Integration Layer**:
  - Barcode Scanners: Keyboard wedge emulation, 140ms debounce timer on input bursts, instant match on standard lengths (15-digit IMEI, 13-digit EAN, 12-digit UPC), auto-refocusing input.
  - Audio Feedback: Web Audio API sine oscillator (1760Hz) for success, sawtooth oscillator (220Hz) for error.
  - Printers: CSS `@media print` layouts for A4 (standard tax invoice) and 80mm (thermal receipt). 58mm compact layout is missing.
- **System Risks Identified**:
  - High latency and unposted payment risk caused by 8-step client-side HTTP chaining.
  - Absence of server-side shift and cash drawer tracking.

---

### Audit File 2: POS_DATABASE_AUDIT.md
- **Existing Models & Schemas**:
  - `PhysicalStockUnit`: Serialized device inventory, status enum (`IN_STOCK`, `RESERVED`, `IN_TRANSIT`, `SOLD`, `RETURNED`, `QUARANTINED`, `SCRAPPED`), acquisitionCost `Decimal(19,4)`, optimistic locking `version`.
  - `DeviceIdentifier`: Slot 1 (IMEI1), Slot 2 (IMEI2), unique constraint `@@unique([companyId, type, normalizedValue])`.
  - `StockBalance`: Non-serialized product balance, quantity `Decimal(19,4)`, inventoryValue `Decimal(19,4)`.
  - `InventoryMovement`: Immutable stock ledger, movement types `SALE_ISSUE`, `SALES_RETURN`, etc., unique idempotency key.
  - `SalesInvoice`, `SalesInvoiceLine`, `SalesInvoiceUnit`: Invoice records, line items, and physical unit associations.
  - `Payment`, `PaymentAllocation`: Multi-method payments and invoice settlement allocations.
  - `JournalEntry`, `JournalEntryLine`: Double-entry financial records with balanced debits and credits.
  - `DocumentSequence`: Concurrency-safe document numbering with row-level locks.
- **Missing Models to Add**:
  - `PosTerminal`: Counter terminal hardware registry.
  - `PosShift`: Cashier shift tracking, opening float, closing physical count, cash discrepancy.
- **Database Concurrency & Locking**:
  - Strict row locking using `SELECT ... FOR UPDATE` on `PhysicalStockUnit`, `StockBalance`, `SalesInvoice`, and `DocumentSequence`.
  - Serializable transaction isolation level (`Prisma.TransactionIsolationLevel.Serializable`).

---

### Audit File 3: POS_API_AUDIT.md
- **Existing APIs**:
  - `GET /api/operations/catalog/resolve`: Resolves barcode/IMEI with custody validation.
  - `GET /api/operations/catalog/search`: Catalog lookup (contains fixed bug `currentWarehouseId`).
  - `GET /api/catalog/prices/resolve`: Customer price tier and floor resolution.
  - `POST /api/sales/invoices`: Sales draft creation.
  - `POST /api/sales/invoices/[id]/post`: Sales invoice posting.
  - `POST /api/payments`: Payment creation.
  - `POST /api/payments/[id]/post`: Payment posting.
  - `GET /api/reports/operations`: Multi-report operations service.
- **Missing & Required New APIs**:
  - `POST /api/pos/checkout`: Single atomic counter sale transaction (< 250ms).
  - `POST /api/pos/shifts/open`: Open cashier shift with float.
  - `POST /api/pos/shifts/close`: Close cashier shift with cash count & reconciliation.
  - `GET /api/pos/shifts/active`: Retrieve current cashier shift status.
  - `GET /api/pos/parked`: List held sales drafts with age.
  - `POST /api/pos/returns`: Process instant counter return/exchange with drawer refund.

---

### Audit File 4: POS_ACCOUNTING_AUDIT.md
- **Chart of Accounts Integration**:
  - Zero hardcoded account IDs. Accounts dynamically resolved via `requirePostingAccount` by account type.
- **Commercial Sale Journal Entry**:
  - **DR** Accounts Receivable (`ACCOUNTS_RECEIVABLE`): `invoice.grandTotal` (subledger tagged).
  - **CR** Sales Revenue (`SALES_REVENUE`): Net revenue (`subtotal - discountTotal`).
  - **CR** Output Tax (`TAX_PAYABLE`): `invoice.taxTotal`.
  - **DR** Cost of Goods Sold (`COGS`): Total cost.
  - **CR** Inventory Asset (`INVENTORY`): Total cost.
- **Receipt Journal Entry**:
  - **DR** Cash on Hand (`1000` / `CASH`) or Bank (`BANK`): `payment.amount`.
  - **CR** Accounts Receivable (`ACCOUNTS_RECEIVABLE`): `payment.amount`.
- **COGS Valuation Methodology**:
  - Serialized handsets: Specific Identification based on `PhysicalStockUnit.acquisitionCost`.
  - Accessories: Weighted Average Cost based on `StockBalance.inventoryValue / quantity`.
- **Subledger Reconciliation**:
  - Customer AR balance strictly matches General Ledger control account `ACCOUNTS_RECEIVABLE` for posted transactions.

---

### Audit File 5: POS_INVENTORY_AUDIT.md
- **Dual Inventory Model**:
  - Handsets: Individually tracked by IMEI, fixed quantity 1, locked row-by-row, warehouse custody enforced.
  - Accessories: Tracked by quantity, manual quantity editing, stock balance validation, negative stock prevented.
- **Device Custody Lifecycle**:
  - `IN_STOCK` -> `SOLD` upon sale posting (`currentBranchId: null`, `currentWarehouseId: null`, `soldAt: now()`).
  - `SOLD` -> `IN_STOCK` (Restock) or `QUARANTINED` upon sales return.
- **Prevention of Negative Stock**:
  - `assertSufficientBalance` throws 409 error if on-hand balance minus active reservations < requested quantity.

---

### Audit File 6: POS_UI_UX_AUDIT.md
- **Terminal Layout**: High-contrast console with autofocus scanner bar, customer selector, salesperson selector, cart table, and tender pane.
- **Keyboard Shortcuts Engine Matrix**:
  - `F2`: Catalog Search Modal (Implemented).
  - `F3`: Auto-focus Barcode / IMEI Scanner (Implemented).
  - `F4`: Customer Dropdown Focus (Implemented).
  - `F6`: Salesperson Selection (**MISSING** - to be implemented).
  - `F8`: Clear Cart (Implemented).
  - `F9`: Park / Hold Sale Draft (**MISSING** - to be implemented).
  - `F10`: Open Tender Mode (**MISSING** - to be implemented).
  - `Ctrl+Enter`: Quick Cash Tender & Checkout (Implemented).
  - `Esc`: Close Any Active Modal / Dialog (Partial - to be completed).
- **Split Tender UI**:
  - Replace single radio selector with multi-tender payment grid allowing simultaneous Cash, Card, Digital Wallet, and Credit with live remaining balance calculation.
- **Printing Parity**:
  - Provide direct one-click print buttons for A4 Tax Invoice, 80mm Receipt, and 58mm Compact Receipt upon sale completion.

---

### Audit File 7: POS_MISSING_FEATURES.md
- **Complete Enumerated Missing Features Matrix**:
  1. Atomic `POST /api/pos/checkout` endpoint.
  2. Multi-tender split payment UI and backend allocation.
  3. Strict 1 handset = 1 cart row enforcement (prevent multi-unit handset grouping).
  4. Global keyboard shortcuts: `F6` (Salesperson), `F9` (Park Draft), `F10` (Tender Dialog), comprehensive `Esc`.
  5. Purge remaining approval workflow artifacts ("Submit for Approval" button, approval chaining in sales manager, print templates).
  6. Shift management database models (`PosTerminal`, `PosShift`).
  7. Cash drawer opening float and closing reconciliation UI.
  8. Parked cart recall retaining POS context (`/pos?invoiceId=...`) and active device re-validation.
  9. Counter return and cash drawer refund interface in POS.
  10. 58mm compact thermal receipt layout.
  11. The 7 missing POS reports (Z-Report, Shift Reconciliation, Multi-Tender Breakdown, Hourly Traffic, Returns Audit, Discounts/Overrides Audit, Parked Carts Status).

---

### Audit File 8: POS_IMPLEMENTATION_PLAN.md
- **Phase 1: Database & Schema Migration**:
  - Add `PosTerminal` and `PosShift` models to `prisma/schema.prisma`.
  - Apply clean Prisma migration without altering historical records.
- **Phase 2: Atomic Checkout & Backend Services**:
  - Implement `POST /api/pos/checkout` in `src/app/api/pos/checkout/route.ts` executing atomic sale and payment.
  - Implement shift management services (`openShift`, `closeShift`, `getActiveShift`).
  - Purge approval checks in sales and payment pipelines.
- **Phase 3: POS Terminal UI & Hotkeys**:
  - Implement split-tender payment interface in `pos-workspace.tsx`.
  - Add missing hotkeys (`F6`, `F9`, `F10`, `Esc`).
  - Enforce 1 handset = 1 cart line item.
  - Remove "Submit for Approval" button and fix parked cart notice.
- **Phase 4: Shifts, Parked Carts & Returns**:
  - Build shift opening and cash drawer reconciliation modals.
  - Update parked cart retrieval to load directly into POS and revalidate IMEIs.
  - Add counter return modal with drawer refund integration.
- **Phase 5: Multi-Format Print & 15 POS Reports**:
  - Create 58mm thermal receipt layout at `src/app/(erp)/sales/[id]/receipt-58mm/page.tsx`.
  - Implement the 7 missing POS reports in `src/app/api/reports/operations/route.ts` and `operations-report-workspace.tsx`.
- **Phase 6: Verification & Automated Integration Tests**:
  - Author automated Vitest suites covering atomic checkout, dual inventory, shift reconciliation, and hotkeys.
  - Verify clean production build with `npm run typecheck` and `npm test`.

---

### Audit File 9: POS_TEST_REPORT.md
- **Test Baseline Status**:
  - 11 Vitest test files pass (63 tests) in 1.41s.
  - TypeScript compilation passes with zero errors across all 4 configs.
- **Test Scenarios to Implement**:
  - Scenario 1: Atomic counter cash sale (Handset + Accessory) with instant GL posting and cash drawer debit.
  - Scenario 2: Multi-tender split payment (50% Cash + 50% Card POS) balanced in GL.
  - Scenario 3: Dual-SIM IMEI resolution (scanning either IMEI1 or IMEI2 resolves to same unit).
  - Scenario 4: Concurrent checkout conflict (two terminals attempting to sell same handset).
  - Scenario 5: Accessing handset in wrong warehouse throws 409 error.
  - Scenario 6: Parked cart hold without reservation; re-validation upon recall.
  - Scenario 7: Counter customer return restoring IMEI to `IN_STOCK` and reversing GL entries.
  - Scenario 8: Cash drawer shift reconciliation calculating exact expected cash and excluding card payments.
  - Scenario 9: Sequential document numbering allocating single-hyphen format `ISB-SI-FY2026-27-xxxxxx`.
  - Scenario 10: Idempotent re-submission returning existing posted invoice.

---

## 5. Verification Method

To independently verify the observations, database constraints, compilation, and test execution documented in this report:

1. **Verify TypeScript Compilation**:
   ```powershell
   npm run typecheck
   ```
   *Expected result*: Clean exit code 0 across `tsconfig.foundation.json`, `tsconfig.finance.json`, `tsconfig.ops.json`, and `tsconfig.scripts.json`.

2. **Verify Vitest Test Runner**:
   ```powershell
   npm test
   ```
   *Expected result*: 11 test files pass (63 tests) with zero failures.

3. **Verify Catalog Search Warehouse Custody Bug Fix**:
   Inspect `src/app/api/operations/catalog/search/route.ts` lines 26-34:
   Verify `currentWarehouseId` is queried on `stockUnit` (not `warehouseId`) and status is `IN_STOCK`.

4. **Verify Single-Hyphen Document Numbering**:
   Inspect `src/lib/operations/accounting.ts` lines 105-115:
   Verify `.replace(/-+$/, "")` on branch prefix and `.replace(/^-+/, "")` on suffix, resulting in format `ISB-SI-FY2026-27-000001`.

5. **Verify 15 Reports Mapping**:
   Inspect `src/app/api/reports/operations/route.ts` and `src/components/reports/operations-report-workspace.tsx` lines 75-110 to confirm the 8 existing operational sales/inventory reports and the 7 missing POS counter reports identified in §1.5.5.
