# POS SYSTEM AUDIT — AXON MOBILE ERP
**Module:** Point of Sale (POS) Counter Terminal  
**Design Reference:** SAP Business One POS / Professional Retail Counter Terminal  
**Audit Date:** November 2026  
**Auditor:** Senior ERP Solution Architect & QA Automation Engineer  

---

## 1. Executive Summary

The Point of Sale (POS) module in Axon Mobile ERP is designed to serve high-volume mobile retail storefronts handling dual inventory categories:
1. **Serialized Dual-SIM Handsets:** Individually tracked high-value smartphones and feature phones requiring dual IMEI tracking (IMEI1 and IMEI2), physical custody tracking, and specific identification inventory valuation.
2. **Quantity-Based Accessories & Spare Parts:** Fast-moving accessories (chargers, cables, audio, cases) and replacement parts (screens, batteries) tracked by SKU, barcode, unit of measure, and weighted average cost.

The current implementation provides a working prototype counter screen (`src/components/sales/pos-workspace.tsx`) backed by general sales endpoints. However, a deep architectural audit reveals critical risks that must be resolved to meet enterprise retail standards:
- **Lack of Atomic POS Checkout:** Counter sale completion currently requires 4 disjointed HTTP calls from the browser (`create invoice` -> `post invoice` -> `create payment` -> `post payment`). A network drop or browser refresh during checkout leaves an invoice posted without receipt records or AR allocation.
- **Single-Tender UI Limitation:** The current UI only permits a single tender mode (`cash`, `card`, `wallet`, or `credit` with an advance), preventing common retail multi-tender transactions (e.g. Rs. 20,000 Cash + Rs. 50,000 Card + Rs. 30,000 Credit).
- **Underutilized Shift Management:** The Prisma schema contains `PosTerminal` and `PosShift` models, but no API endpoints or UI consoles exist to open shifts, record cash floats, track drawer variances, or perform end-of-day shift closures.
- **Lingering Approval Traces:** An invoice approval API endpoint (`/api/sales/invoices/[id]/approve`) was invoked during credit limit overrides rather than using a direct permission check (`sales.credit_override`).

---

## 2. Core Functional Components Status

| Component | Status | Operational Assessment |
|---|---|---|
| **Dual-SIM IMEI Scanning** | Operational | Exact lookup via `DeviceIdentifier` normalized values. Scans either IMEI1 or IMEI2 to resolve the unit. |
| **Physical Stock Verification** | Operational | Enforces status `IN_STOCK`, verifies dispatch warehouse, prevents already-sold devices from being re-added. |
| **Quantity Accessories** | Operational | Tracks available stock via `StockBalance` aggregate minus active reservations. |
| **Server-Side Pricing** | Operational | Evaluates Customer Price List -> Default Price List -> Variant Retail Price. Enforces minimum floor price. |
| **Tender & Payment Recording** | High Risk | Executed via client-side sequential API calls; must be replaced by a single atomic server transaction. |
| **Mixed Tender (Split Payments)** | Missing in UI | No multi-tender input matrix on the counter sidebar. |
| **Receipt Printing** | Operational | 80mm thermal receipt (`/sales/[id]/receipt`) with Code128 barcode and A4 standard invoice print. |
| **Parked Sales (Hold / Recall)** | Partially Implemented | Saved as draft invoices; F9 shortcut and direct recall workflow need polish. |
| **Cash Drawer & Shifts** | Models Exist / No API | `PosTerminal` and `PosShift` exist in schema but lack APIs and drawer reconciliation UI. |
| **Credit Sales & Due Date** | Operational | Computes AR outstanding balance; validates credit limits; supports advance down payments. |

---

## 3. High-Priority System Risks & Remediations

1. **Transaction Atomicity Risk:**
   - *Risk:* If a cashier completes a sale, the invoice may post to GL, but the subsequent payment API call may fail or timeout.
   - *Remediation:* Create an atomic `POST /api/pos/checkout` endpoint executing invoice creation, inventory issue, GL journal posting, and payment voucher allocation inside a single PostgreSQL `SERIALIZABLE` transaction.
2. **Approval Engine Removal:**
   - *Risk:* Calling `/api/sales/invoices/[id]/approve` during credit limit override contradicts the zero-approval ERP policy.
   - *Remediation:* Replaced with an authorized managerial credit override permission check (`sales.credit_override`), stamping the user credentials directly into the audit log.
3. **Multi-Tender Cashier Capabilities:**
   - *Risk:* Retail customers frequently split payments across Cash, Card, and Digital Wallets.
   - *Remediation:* Build a split-tender allocation grid supporting simultaneous Cash, Card POS, Mobile Wallet (Raast/EasyPaisa/JazzCash), and Customer Credit.

---
© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
