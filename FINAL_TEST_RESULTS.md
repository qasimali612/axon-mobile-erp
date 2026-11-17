# AXON MOBILE ERP — FINAL TEST RESULTS & ACCEPTANCE EVIDENCE

**Project:** AXON MOBILE ERP  
**Business:** Gondal Mobile Center  
**Audit Period:** November 2026  
**Test Harness:** Automated CLI test scripts & Prisma queries against PostgreSQL  

---

## 1. Priority 01 Acceptance Verification (Technical Foundation)

| Test Case | Description | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| **TC-P01-01** | Database Connectivity & Health | Connection to PostgreSQL succeeds | Cloud DB connected; 1 company, 2 branches, 2 warehouses verified | **Passed** |
| **TC-P01-02** | TypeScript Typecheck Across Partitions | 0 compiler errors across foundation, finance, ops, scripts | `tsc -p tsconfig.*` completed with 0 errors | **Passed** |
| **TC-P01-03** | Double-Entry GL Balance Invariant | Total debits equal total credits on all vouchers | 48 vouchers, 118 lines queried; 0 unbalanced vouchers (difference = 0.00) | **Passed** |
| **TC-P01-04** | One Handset = One Stock Unit Invariant | Dual-SIM phones have 2 IMEIs under 1 unit, not 2 units | 12 dual-SIM handsets registered with 2 slots under 1 unit; total units = 29 | **Passed** |
| **TC-P01-05** | Authentication & Session Management | SHA-256 session hash verified | 10 active user sessions verified in DB; `owner@axonmobile.local` operational | **Passed** |
| **TC-P01-06** | Bank Ledger Running Balance Accuracy | Chronological running balance matches exact live balance | Line 16 running balance Rs. 3,816 matches live Faysal Bank master balance | **Passed** |
| **TC-P01-07** | Subledger Statement Opening Balance | Party opening balance rolls forward into statement | SUP-3414 statement verified with Rs. 140,475 OB and Rs. 90,475 closing | **Passed** |

---

## 2. Priority 02 Acceptance Verification (Product & Master Data)

| Test Case | Description | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| **TC-P02-01** | 4 Standard Categories Available | Mobile Phones, Accessories, Spare Parts, Other Trading Products exist | All 4 categories active in DB (`MOB-001`, `ACS-001`, `SPR-001`, `TRD-001`) | **Passed** |
| **TC-P02-02** | Product Tracking Methods | Supports both IMEI and Without-IMEI (Quantity) tracking | 19 IMEI products and 2 Quantity products verified in production DB | **Passed** |
| **TC-P02-03** | Duplicate SKU Rejection | Unique SKU constraint enforced at DB level | Duplicate SKU `BRA001-HOT60PRO-626` rejected with P2002 constraint error | **Passed** |
| **TC-P02-04** | Product Policy Mutation Guard | Product type/tracking cannot change once document history exists | Blocked by API with `PRODUCT_POLICY_HAS_HISTORY` (409) | **Passed** |
| **TC-P02-05** | Product Search & Filter | Multi-field search (Name, Model, SKU, Variant) | Search `Samsung` returned matching products | **Passed** |

---

## 3. Priority 03 Acceptance Verification (Purchase & Goods Receiving)

| Test Case | Description | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| **TC-P03-01** | Direct & PO Goods Receiving Post | Creates physical units and increments inventory | ISB-GRN-FY2026-27-000001 posted with 7 physical units in `IN_STOCK` | **Passed** |
| **TC-P03-02** | Double-Entry Purchase Journal | Debit Merchandise Inventory, Credit Trade Payables | ISB-PV-FY2026-27-000001 posted (Debit Rs. 278,900 / Credit Rs. 278,900) | **Passed** |
| **TC-P03-03** | Stock Movement Attribution | Each received handset creates `PURCHASE_RECEIPT` movement | 7 movements verified linking receipt to physical units & GL voucher | **Passed** |
| **TC-P03-04** | Unique IMEI Duplicate Guard | Receiving duplicate IMEI is blocked across company | Attempting to re-receive IMEI `351929938624488` is rejected by DB index | **Passed** |
| **TC-P03-05** | Official Printable GRN | Print layout with QR code, supplier, landed cost, signatures | `src/app/(erp)/goods-receipts/[id]/print/page.tsx` verified | **Passed** |

---

## 4. Priority 04 Acceptance Verification (Inventory & IMEI Management)

| Test Case | Description | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| **TC-P04-01** | Stock Valuation vs GL 1200 Reconciliation | Warehouse valuation matches GL Merchandise Inventory | StockBalance Rs. 896,260 matches GL 1200 Rs. 896,260 (Diff: Rs. 0.00) | **Passed** |
| **TC-P04-02** | Zero Negative Stock Invariant | Accidental negative inventory prohibited | 22 stock balance records scanned across warehouses; 0 negative stock | **Passed** |
| **TC-P04-03** | Handset Dual-SIM Invariant | 1 handset = 1 unit; dual-SIM holds 2 slots | 12 dual-SIM handsets hold 2 IMEIs each under 1 stock unit; total 29 units | **Passed** |
| **TC-P04-04** | IMEI Uniqueness Invariant | 0 duplicate IMEIs registered in company | Querying duplicate normalized IMEIs returned 0 duplicates | **Passed** |
| **TC-P04-05** | Handset Status Tracking | Status correctly categorizes physical units | 20 IN_STOCK, 9 SOLD verified in physical stock unit register | **Passed** |

---

## 5. Acceptance Status
- **Priority 01 (Foundation):** **PASSED**
- **Priority 02 (Product & Catalog):** **PASSED**
- **Priority 03 (Purchases & Receiving):** **PASSED**
- **Priority 04 (Inventory & IMEI Management):** **PASSED**
- **Next Priority:** **Priority 05 — Sales Management & Professional POS**
