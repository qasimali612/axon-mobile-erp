# POS System & Architecture Technical Audit Report

**System**: Axon Mobile ERP Retail Point of Sale (POS) Counter Terminal  
**Auditor**: Teamwork Architecture & Audit Group (`worker_m1`)  
**Date**: 2026-11-10T12:22:00Z  
**Repository Working Directory**: `d:\Inventory Managment Software`  
**Audit Scope**: System Topology, Runtime Architecture, Operating Modes, RBAC Security, Hardware Integration Layer, and System Vulnerabilities

---

## 1. Executive Summary & Architectural Overview

Axon Mobile ERP is an enterprise multi-branch, multi-warehouse ERP system tailored specifically for serialized consumer electronics, smart mobile handsets, and accessories retail. The Point of Sale (POS) Counter Terminal module serves as the primary retail touchpoint, providing cashier checkout, barcode/IMEI scanning, cash drawer management, multi-tender split settlements, thermal receipt printing, and real-time operational reporting.

The system is built on modern web and database technologies:
- **Application Framework**: Next.js 15.5.28 (React 19.2.0) utilizing the App Router architecture under `src/app/`.
- **Database & Persistence**: PostgreSQL 16 engine served locally via `@electric-sql/pglite` socket server listening at `127.0.0.1:54329` with persistent database files in `./.pglite/axon-erp`.
- **Object-Relational Mapping (ORM)**: Prisma 6.19.3 with 94 models, 33 enums, and 44 database migrations.
- **Styling & UI Components**: Tailwind CSS `^3.4.18`, Lucide React `^0.548.0` icon set, and Sonner `^2.0.7` toast notifications.
- **Barcode & Label Generation**: `bwip-js` `^4.11.4` rendering vector SVG Code128 barcodes.
- **Quality & Test Automation**: Vitest `4.1.12` (`vitest.config.mts`) and TypeScript 5 (`tsconfig.*.json`).

The architecture is designed to support high-throughput checkout at physical counters while strictly upholding financial double-entry integrity, landed-cost inventory valuation, and tamper-resistant audit logs.

---

## 2. Operating Modes & Approval Workflow Pruning

### 2.1 Single-User vs Multi-User Operating Modes
- **File**: `src/lib/operating-mode.ts` (lines 171–198)
- In the current configuration, `isSingleUserMode` evaluates to `true`.
- The system previously contained maker-checker enforcement functions:
  - `assertMakerChecker` (lines 171–180): Formerly validated that the user creating a document could not be the user approving or posting it.
  - `assertSegregationOfDuties` (lines 186–198): Formerly enforced strict role segregation across transaction creation, verification, and settlement.
- Both functions have been updated to return immediately without throwing errors, enabling direct operational workflows.
- Migration `20261109180000_disable_maker_checker_triggers` replaced the database-level trigger `enforce_document_maker_checker()` with a no-op trigger function returning `NEW`, preventing PostgreSQL-level transaction rollbacks during direct posting.

### 2.2 Residual Approval Artifacts in Codebase
Despite the removal of the database-level maker-checker triggers, several residual approval artifacts remain in the application layer and must be completely eliminated:
1. **POS Workspace UI**:
   - `src/components/sales/pos-workspace.tsx` line 1428 renders a `<button onClick={() => void createInvoice(true, false)}>` titled `"Submit for Approval"`. In a retail counter terminal, retail staff must never submit sales for approval; sales must post immediately or park as drafts.
   - `src/components/sales/pos-workspace.tsx` lines 526–531 sends an HTTP request to `/api/sales/invoices/${targetInvoiceId}/approve` when a customer credit limit is overridden.
2. **Sales Service Business Logic**:
   - `src/lib/operations/sales.ts` lines 384–404 (`submitSalesInvoice`) and lines 407–444 (`approveSalesInvoice`) still enforce `assertApprovalPolicy`.
   - `src/lib/operations/sales.ts` lines 454–465 (`postSalesInvoice`) contains a status bypass hack: if status is `DRAFT` or `SUBMITTED`, it updates status to `APPROVED` before proceeding to post.
3. **Printable Templates**:
   - `src/app/(erp)/sales/[id]/print/page.tsx` line 37 includes an `"Approved by"` signature block.
   - Line 38 footer conditionally prints `"Workflow copy — subject to approval and posting."` when the status is not `POSTED`.
4. **Sales Manager Workflow**:
   - `src/components/sales/sales-manager.tsx` table filters and action menus still present `"Submit"`, `"Approve"`, and chained workflow states.

### 2.3 Strict Document Status Lifecycle
Under the target POS specification, document statuses across sales invoices and receipt vouchers must strictly adhere to four states:
- `DRAFT`: Unposted document. Inventory remains available in warehouse (`stockEffect: "NONE_UNTIL_POSTING"`). Zero financial ledger impact.
- `POSTED`: Finalized transaction. Stock deducted immediately; balanced double-entry GL journal posted atomically; customer subledger updated. Immutable; cannot be modified directly.
- `CANCELLED`: Unposted draft discarded by cashier. Zero stock or GL impact.
- `REVERSED`: An authorized counter sales return or credit note has reversed the posted invoice, restoring inventory and posting reversal GL entries.

---

## 3. Role-Based Access Control (RBAC) & Terminal Security

Access to retail counter capabilities is governed by granular permissions defined in `prisma/schema.prisma` and enforced via `requirePagePermission` and `requirePermission` (`src/lib/auth.ts`):

| Permission Key | Protected Route / Operation | Scope & Security Constraint |
|----------------|-----------------------------|----------------------------|
| `SALES_INVOICE_CREATE` | `GET /pos` (`src/app/(erp)/pos/page.tsx`) | Allows access to the retail counter checkout interface. |
| `SALES_INVOICE_POST` | `POST /api/pos/checkout` | Grants authorization to commit atomic sales transactions and deduct physical inventory. |
| `SALES_INVOICE_VIEW` | `GET /sales/[id]/print`, `GET /sales/[id]/receipt` | Grants authorization to view and print A4 and thermal receipts. |
| `SALES_RETURN_CREATE` | Counter Return Modal / `/returns` | Authorizes cashiers to process customer device returns and issue drawer refunds. |
| `POS_SHIFT_MANAGE` | `POST /api/pos/shifts/*` | Authorizes cashiers to open drawers with opening floats and perform closing reconciliation. |
| `REPORT_VIEW_OPERATIONS` | `GET /api/reports/operations` | Authorizes viewing operational POS reports (Z-Report, Daily Sales, Margins). |

All API handlers enforce company-level data isolation via `context.company.id` and branch-level scoping via `context.branch.id`, preventing cross-company data leakage or unauthorized multi-branch access.

---

## 4. Hardware Integration Layer

### 4.1 Barcode & IMEI Scanner Engine
- **Implementation**: `src/components/sales/pos-workspace.tsx` lines 728–860.
- **Hardware Interface**: Operates via USB or Bluetooth HID (Human Interface Device) keyboard wedge emulation. Handheld laser/CCD barcode guns transmit scanned barcodes as rapid ASCII keystrokes terminated with an `Enter` or `Tab` character.
- **Focus Preservation**:
  - The scanner input field `ref={scanRef}` maintains permanent browser focus via `autoFocus` and `requestAnimationFrame(() => scanRef.current?.focus())` (line 328).
  - Whenever the cashier clicks a dropdown, clears a cart, or closes a dialog, focus automatically returns to the scanner bar.
- **Event Handling & Debounce Tuning**:
  - Lines 814–820 handle terminal suffix keys:
    ```tsx
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
      void scan();
    }
    ```
  - Lines 771–803 handle burst typing:
    - Scans matching standard barcode lengths (15-digit IMEI, 14-digit GTIN, 13-digit EAN, 12-digit UPC) trigger instant resolution.
    - Non-standard barcode lengths utilize a 140ms debounce timer to buffer fast barcode gun input bursts before firing resolution.

### 4.2 Web Audio Feedback Engine
- **Implementation**: `src/components/sales/pos-workspace.tsx` lines 180–205.
- Utilizes the browser `AudioContext` API to generate instantaneous acoustic feedback for retail operators without external audio assets:
  - **Success Beep (1760 Hz)**: Generated via a high-pitch sine wave oscillator (`oscillator.type = "sine"`, frequency 1760 Hz, duration 75ms) upon successful barcode match and item cart insertion.
  - **Error Tone (220 Hz)**: Generated via a low-pitch sawtooth oscillator (`oscillator.type = "sawtooth"`, frequency 220 Hz, duration 250ms) when a scanned device is not found, located in another warehouse, already sold, or already present in the cart.

### 4.3 Multi-Format Receipt & Invoice Printing
- **Implementation**: CSS `@media print` rules and dedicated server-rendered printable routes:
  1. **A4 Tax Invoice**: `src/app/(erp)/sales/[id]/print/page.tsx`
     - Formatted for standard desktop laser/inkjet printers.
     - Contains company header, customer billing address, NTN/STRN tax registration numbers, Code128 vector barcode, line-item tax details, and legal footer.
  2. **80mm Thermal POS Receipt**: `src/app/(erp)/sales/[id]/receipt/page.tsx`
     - Formatted for standard 80mm point-of-sale thermal roll printers (`width: 80mm`, monospace font).
     - Displays store name, branch phone, transaction timestamp, cashier ID, item list with dual IMEIs, subtotal, tax breakdown, tendered payment methods, and change returned.
  3. **58mm Compact Thermal Receipt**: (Identified Gap)
     - Compact 32-column layout required for portable Bluetooth and mobile belt-clip printers.

---

## 5. System Flaws, Failure Modes & Vulnerabilities Identified

### 5.1 The 8-Step Client-Side HTTP Chaining Vulnerability
- **Location**: `src/components/sales/pos-workspace.tsx` lines 380–515.
- **Flaw Description**:
  Currently, completing a counter sale executes up to 8 sequential HTTP requests from the cashier's browser:
  1. `POST /api/sales/invoices` (Draft invoice)
  2. `POST /api/sales/invoices/${id}/submit`
  3. `POST /api/sales/invoices/${id}/approve`
  4. `POST /api/sales/invoices/${id}/post` (Deducts stock & posts commercial GL journal)
  5. `POST /api/payments` (Draft payment with invoice allocation)
  6. `POST /api/payments/${payId}/submit`
  7. `POST /api/payments/${payId}/approve`
  8. `POST /api/payments/${payId}/post` (Posts receipt GL journal to Cash on Hand)
- **Impact & Failure Modes**:
  - **High Latency**: Network round-trip latency compounds to 2,000ms – 4,500ms, creating unacceptable delays at retail checkout lines.
  - **Partial Posting State Corruption**: If the cashier's browser network drops, closes, or fails at Step 5 or 8:
    - The sales invoice remains `POSTED` (inventory is deducted from the warehouse, customer AR is debited).
    - The payment voucher remains `SUBMITTED` or missing.
    - Because `src/lib/finance/cash-in-hand.ts` filters strictly on posted journal lines (`status: { in: ['POSTED', 'REVERSED'] }`), the unposted payment produces **zero debit to Account 1000 (Cash on Hand)**.
    - Result: The cash drawer report shows a severe cash shortage, and the customer subledger incorrectly reflects an open outstanding balance!
- **Mandated Fix**: Replace client-side chaining with a dedicated, atomic endpoint `POST /api/pos/checkout` executing in a single database transaction under 250ms.

### 5.2 Handset Cart Grouping Anomaly
- **Location**: `src/components/sales/pos-workspace.tsx` line 268.
- **Flaw Description**: When a second handset of the same variant is scanned, the cart appends the new `stockUnitId` to the existing line and increments `line.quantity`.
- **Impact**: Violates the fundamental retail rule: **1 Handset = 1 Cart Line**. Each mobile phone possesses a distinct serial number, dual IMEIs, and specific acquisition cost. Grouping prevents cashiers from inspecting or removing individual handsets from the cart.

### 5.3 Absence of Shift & Cash Drawer Tracking
- **Location**: `prisma/schema.prisma` and UI layer.
- **Flaw Description**: No models or UI exist for `PosTerminal`, `PosShift`, or cash drawer sessions.
- **Impact**: Cashiers cannot record opening cash floats, verify mid-day cash-in/out, or perform end-of-day cash reconciliation. Variances between physical cash and system sales cannot be tracked.

### 5.4 Parked Cart Workflow Disruption
- **Location**: `src/components/sales/pos-workspace.tsx` lines 519, 1600.
- **Flaw Description**:
  - Recalling a held cart executes `router.push('/sales/${inv.id}/edit')`, redirecting the cashier away from the POS counter terminal to the back-office ERP invoice editor.
  - The UI displays an erroneous notice: `"Physical stock remains reserved until posted."` Drafts do not reserve stock.
  - When a parked cart is recalled, the system does not re-verify whether the physical handsets are still `IN_STOCK` in the warehouse or were sold on another counter.

---

## 6. System Integrity, Concurrency & Idempotency Safeguards

To prevent double-selling of high-value mobile phones and duplicate financial postings, the system architecture implements layered concurrency controls:
1. **Pessimistic Row-Level Locks**: Handset stock units (`PhysicalStockUnit`), non-serialized balances (`StockBalance`), and document sequence counters (`DocumentSequence`) are locked using PostgreSQL `SELECT ... FOR UPDATE` inside `prisma.$transaction`.
2. **Transaction Isolation**: Posting transactions execute under `Prisma.TransactionIsolationLevel.Serializable` to guarantee strict serializability.
3. **Database Unique Constraints**:
   - `PhysicalStockUnit`: Unique device identifiers on `[companyId, type, normalizedValue]`.
   - `SalesInvoice`: Unique constraint on `[companyId, idempotencyKey]`.
   - `Payment`: Unique constraint on `[companyId, idempotencyKey]`.
   - `JournalEntry`: Unique constraint on `[companyId, sourceModule, idempotencyKey]`.
4. **Idempotency Matching**: If a network retry re-sends a checkout payload with an existing idempotency key, the endpoint detects the existing record and returns the previously posted invoice without repeating inventory or GL deductions.
