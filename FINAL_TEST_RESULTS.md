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

## 3. Database Entity Verification Summary
- **Companies:** 1 (`Gondal Mobile Center`)
- **Branches:** 2 (`HZR: Hazro Central`, `ISB: Islamabad`)
- **Warehouses:** 2 (`HZR-MAIN: Hazro Main Warehouse`, `ISB-RETAIL: Main Shop`)
- **Products:** 21 (19 IMEI-tracked, 2 Quantity-tracked)
- **Product Categories:** 4 (`Mobile Phone`, `Accessories`, `Spare Parts`, `Other Trading Products`)
- **Brands:** 9 (`Samsung`, `Infinix`, `Tecno`, `OPPO`, `Realme`, `VIVO`, `Itel`, `QMobile`, `Nexel`)
- **Physical Stock Units:** 29 (20 IN_STOCK, 9 SOLD)
- **Device Identifiers (IMEIs):** 41 (24 dual-SIM + 17 single-SIM)
- **Customers:** 3
- **Suppliers:** 2
- **Journal Entries:** 48 (All balanced, 0 exceptions)
- **Bank Accounts:** 1 (0001 · Faysal Bank)
- **Bank Transactions:** 16 posted (Live Balance: Rs. 3,816.00)

---

## 4. Acceptance Status
- **Priority 01:** **PASSED**
- **Priority 02:** **PASSED**
- **Next Priority:** **Priority 03 — Purchase and Goods Receiving**
