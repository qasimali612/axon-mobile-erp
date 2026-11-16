# POS User Interface (UI), Ergonomics & Hotkeys Technical Audit Report

**System**: Axon Mobile ERP Retail Point of Sale (POS) Counter Terminal  
**Auditor**: Teamwork Architecture & Audit Group (`worker_m1`)  
**Date**: 2026-11-10T12:27:00Z  
**Repository Working Directory**: `d:\Inventory Managment Software`  
**Audit Scope**: Terminal Console Ergonomics, Keyboard Shortcuts Engine, Split-Tender Interface, Approval UI Pruning, Thermal Printing Formats, and Shift Operations

---

## 1. Terminal Console Layout & Cashier Ergonomics

The POS workspace (`src/components/sales/pos-workspace.tsx`) is designed for high-density, touch-and-keyboard retail counter checkout:
- **Left Panel (Cart & Item Entry)**:
  - **High-Contrast Scanner Console** (lines 728–860): A prominent top-level input with permanent autofocus, dark theme styling, and clear visual cues for barcode gun scanning.
  - **Item Grid & Cart Lines** (lines 880–980):
    - Handset rows: Display phone icon, model name, storage/color variant, and dual-slot IMEI badges (`Device #1: IMEI1 / IMEI2`). Quantity editing is disabled.
    - Accessory rows: Expose `Minus`/`Plus` buttons and numeric input bounded by current warehouse on-hand stock.
  - **Customer & Salesperson Toolbar** (lines 680–710): Direct dropdowns for customer account selection, credit balance display, and commission salesperson tagging.
- **Right Panel (Tender & Financial Settlement)**:
  - Live calculations for Subtotal, Discounts, Sales Tax, and Grand Total.
  - Fast cash denomination chips (`+500`, `+1,000`, `+5,000`, `+10,000`, `Exact`).
  - High-contrast, large-font Change Return display to minimize cashier mental math errors.

---

## 2. Retail Keyboard Shortcuts Engine: Current State vs Specification

Retail counter environments operate at maximum speed when cashiers can complete transactions entirely from the keyboard without touching a mouse.

### 2.1 Complete Hotkeys Matrix & Audit Status

| Key Combination | Functionality Required | Status in Codebase | Source Code Line / Implementation Detail | Required Action |
|:---------------:|:-----------------------|:------------------:|:-----------------------------------------|:----------------|
| **F2** | Open Catalog Search Modal | **Implemented** | `pos-workspace.tsx:585` (`setSearchOpen(true)`) | Retain; autofocus search input. |
| **F3** | Focus Barcode / IMEI Scanner | **Implemented** | `pos-workspace.tsx:586` (`scanRef.current?.focus()`) | Retain. |
| **F4** | Focus Customer Selector | **Implemented** | `pos-workspace.tsx:587` (`customerRef.current?.focus()`) | Retain. |
| **F6** | Focus Salesperson Selector | **MISSING** | Not bound in keyboard listener | Add `salespersonRef.current?.focus()`. |
| **F8** | Clear Current Cart | **Implemented** | `pos-workspace.tsx:588` (`setCart([])` with confirmation) | Retain. |
| **F9** | Park / Hold Sale as Draft | **MISSING** | Not bound in keyboard listener | Add shortcut to trigger `createInvoice(false, false)`. |
| **F10** | Open Tender / Split Payment Mode | **MISSING** | Not bound in keyboard listener | Add shortcut to toggle tender focus or modal. |
| **Ctrl + Enter**| Instant Cash Tender & Post | **Implemented** | `pos-workspace.tsx:592` (`createInvoice(true, true)`) | Update to call atomic `/api/pos/checkout`. |
| **Escape** | Dismiss Active Modal / Dialog | **Partial** | `pos-workspace.tsx:593` (Only closes search modal) | Update to dismiss all active modals. |

### 2.2 Typing Collision Safeguards
To prevent function keys from interfering with text entry, all event listeners check `event.key` globally while allowing standard input keystrokes inside text fields. Only the designated function keys (`F1`–`F12`, `Escape`) prevent default browser behaviors.

---

## 3. Multi-Tender Split Payment UI Architecture

### 3.1 Current Architecture & Deficiencies
In `src/components/sales/pos-workspace.tsx` lines 992–1014:
- The payment interface relies on a single state variable:
  ```tsx
  const [saleType, setSaleType] = useState<"cash" | "card" | "wallet" | "credit">("cash");
  ```
- This radio button design **prohibits split payments**. In modern consumer electronics retail, customers routinely split high-value purchases (e.g. paying Rs 50,000 in cash and Rs 70,000 on a Visa debit card, or combining EasyPaisa with cash).

### 3.2 Target Multi-Tender Grid Specification
The tender panel must be transformed into a dynamic multi-tender settlement table:
- **Tender Methods Supported**:
  1. `CASH`: Cash on Hand (Account 1000) with denomination assists and change calculation.
  2. `CARD`: POS Credit/Debit Card terminal with authorization reference input.
  3. `WALLET`: Mobile Wallets (EasyPaisa, JazzCash, Raast) with transaction ID reference.
  4. `BANK`: Direct bank deposit / online transfer with IBAN / reference.
  5. `CREDIT`: On-account credit with customer credit limit verification.
- **Real-Time Settlement Balancing**:
  - Live display of:
    $$\text{Total Invoice Amount} = \text{Grand Total}$$
    $$\text{Total Tendered} = \sum \text{Tender Amounts}$$
    $$\text{Remaining Balance} = \text{Total Invoice Amount} - \text{Total Tendered}$$
    $$\text{Change Due} = \max(\text{Cash Tendered} - \text{Total Invoice Amount}, 0)$$
  - "Post Sale" action button remains disabled until $\text{Remaining Balance} \le 0.00$.

---

## 4. Pruning Residual Approval UI Artifacts

To fulfill Requirement R1 and eliminate maker-checker friction at retail counters:
1. **Remove "Submit for Approval" Button**:
   - `pos-workspace.tsx` line 1428:
     ```tsx
     // DELETE THIS ENTIRE BUTTON:
     <button onClick={() => void createInvoice(true, false)} ...>
       <Send className="h-4 w-4" />
       Submit for Approval
     </button>
     ```
2. **Remove Approval References from Badges & Modals**:
   - Status badges showing "Pending Approval" or "Awaiting Checker" are removed from POS screens.
   - Credit limit override modal (lines 526–531) must remove the call to `/api/sales/invoices/${id}/approve`. Authorized cashiers or shift supervisors can authorize customer credit directly within the checkout transaction.

---

## 5. Print Preview Architecture & 58mm Thermal Print Layout

Axon Mobile ERP supports three distinct receipt and invoice formats:

### 5.1 A4 Tax Invoice (`src/app/(erp)/sales/[id]/print/page.tsx`)
- Server-rendered printable HTML page formatted for standard laser printers.
- Includes Code128 vector barcode (`bwip-js`), NTN/STRN tax numbers, customer billing address, and itemized tax breakdowns.
- *Cleanup required*: Remove `"Approved by"` signature line and `"Workflow copy — subject to approval"` footer notes.

### 5.2 80mm POS Thermal Receipt (`src/app/(erp)/sales/[id]/receipt/page.tsx`)
- High-efficiency monospace layout formatted for 80mm thermal receipt printers.
- Displays store banner, cashier, invoice number, items with dual-SIM IMEIs, split payment tenders, and customer return policies.
- *Typecheck Fix verified*: Line 130 uses `invoice.branch.addressLine1` (fixing former `branch.address` compile error).

### 5.3 58mm Compact Thermal Receipt (`src/app/(erp)/sales/[id]/receipt-58mm/page.tsx` - Missing Layout)
- Dedicated 32-column layout designed specifically for compact mobile Bluetooth and belt-clip printers.
- Features:
  - Narrow column widths (`max-w-[58mm]`, `text-[9px]`, leading-tight).
  - Abbreviated item descriptions with IMEI wrapped onto secondary lines.
  - Compact summary block highlighting Grand Total, Amount Paid, and Change.

### 5.4 POS Sale Completion Card Direct Printing Actions
Upon completing checkout, `pos-workspace.tsx` line 1451 currently links only to the A4 print page. The completion card must provide direct one-click action buttons:
- `Print 80mm Receipt` (opens `/sales/${invoice.id}/receipt` in print window).
- `Print 58mm Receipt` (opens `/sales/${invoice.id}/receipt-58mm` in print window).
- `Print A4 Tax Invoice` (opens `/sales/${invoice.id}/print` in print window).
- `New Sale` (resets terminal and autofocuses scanner).

---

## 6. Cashier Shift Management & Cash Reconciliation Screens

To support cashier accountability under Requirement R5:
1. **Shift Opening Modal**:
   - Prompts cashier upon logging into the terminal.
   - Requires inputting Opening Cash Float (e.g. Rs 10,000 for change making).
   - Records cashier ID, terminal code, and opening timestamp.
2. **Shift Closing & Cash Drawer Discrepancy Dialog (Z-Report)**:
   - Cashier enters physical denomination counts:
     - Count of 5000, 1000, 500, 100, 50, 20, 10 rupee notes.
     - Total counted physical cash.
   - The system displays the automated reconciliation:
     $$\text{Opening Float} + \text{Cash Sales} - \text{Cash Refunds} = \text{Expected Cash in Drawer}$$
     $$\text{Counted Cash} - \text{Expected Cash} = \text{Cash Difference (Overage / Shortage)}$$
   - Displays separate audit cards for non-cash tenders (Card POS, EasyPaisa, JazzCash, Raast, Bank Transfers) which do not affect physical cash in drawer.

---

## 7. Parked Carts UI & Counter Return Modal

### 7.1 Parked Cart Retrieval Workflow Fix
- Current code (`pos-workspace.tsx` line 1600) navigates to `router.push('/sales/${inv.id}/edit')`, which tears down the POS terminal interface and opens the ERP back-office invoice form.
- **Fix**: Recalling a parked cart loads the draft invoice directly into `/pos?invoiceId=${inv.id}`, preserving the cashier's active terminal session.
- **Notice Fix**: Line 519 notice changed to: `"Sale held as draft. Physical stock remains available until posted."`

### 7.2 Counter Return & Exchange Modal
- An in-terminal dialog allowing cashiers to scan a returned handset or enter an invoice number.
- Cashier selects item to return and chooses:
  - `Cash Refund`: Automatically deducted from active shift cash drawer.
  - `Store Credit Note`: Issues customer credit voucher.
  - `Exchange Credit`: Applies credit directly as a line discount on the current cart.
