# POS MISSING FEATURES — AXON MOBILE ERP
**Module:** Point of Sale (POS) Feature Gap Analysis  
**Audit Date:** November 2026  
**Auditor:** Senior ERP Systems Engineer  

---

## 1. Feature Gap Summary

Based on the audit against SAP Business One POS standards and retail counter requirements, the following features are missing or incomplete:

| Feature | Severity | Description | Target Resolution |
|---|---|---|---|
| **Atomic Multi-Tender Checkout API** | **CRITICAL** | Counter checkout is currently a 4-step client script that can break halfway through. | Create dedicated `POST /api/pos/checkout` executing atomic invoice creation, posting, stock deduction, and payment voucher allocation. |
| **Split-Tender Payment UI** | **HIGH** | Cashier cannot divide an invoice across multiple payment accounts (e.g. Cash + Card). | Implement multi-tender payment panel allowing cash, bank card, digital wallet, and credit split in a single sale. |
| **POS Shift & Cash Drawer APIs** | **HIGH** | `PosTerminal` and `PosShift` models exist in Prisma schema, but lack API endpoints to open, inspect, and close shifts. | Implement `/api/pos/shifts` and `/api/pos/shifts/[id]/close` endpoints and shift status header bar. |
| **Zero-Approval Credit Override** | **HIGH** | Credit limit override currently calls `/api/sales/invoices/[id]/approve`. | Replace with direct authorization via permission (`sales.credit_override`), logging justification directly to the audit trail. |
| **Parked Sale Hotkey & Direct Recall** | **MEDIUM** | F9 hotkey missing; recalling parked sales currently redirects to `/sales/[id]/edit` rather than loading directly into POS cart. | Bind F9 to park; allow immediate recall into active POS workspace without page reloads. |
| **Keyboard Ergonomics (F6, F10)** | **MEDIUM** | F6 (Salesperson focus) and F10 (Tender focus) are missing from keyboard listeners. | Add F6 and F10 hotkeys and accessibility focus rings. |

---

## 2. Detailed Technical Scope for Missing Implementations

### A. Dedicated POS Checkout Service (`src/lib/operations/pos.ts`):
- Accepts cart lines, tender breakdown, customer ID, branch, warehouse, terminal, and shift IDs.
- Wraps entire execution in `prisma.$transaction({ isolationLevel: 'Serializable' })`.
- Handles both full cash/bank sales and credit sales with advance payments.
- Records `Payment` records with `PaymentAllocation` pointing to the generated `SalesInvoice`.
- Updates `PosShift` cash sales metrics.

### B. POS Shift & Drawer Management (`src/app/api/pos/shifts`):
- Check for active open shift for the logged-in user at the terminal.
- Open shift with opening cash float.
- Reconcile shift: calculate expected cash drawer = `openingFloat + postedCashSales - cashRefunds`.
- Record closing cash count, variance, and notes.

---
© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
