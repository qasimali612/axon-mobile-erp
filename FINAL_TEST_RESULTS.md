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

## 5. Priority 05 Acceptance Verification (Sales Management & POS)

| Test Case | Description | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| **TC-P05-01** | Direct Sales & POS Posting | Posts invoice, transitions unit to SOLD, deducts stock | 11 sales invoices posted (Total Revenue: Rs. 456,494) | **Passed** |
| **TC-P05-02** | Double-Entry Sales Journal | Debit AR & COGS, Credit Revenue & Inventory | All 11 sales vouchers verified strictly balanced (Diff: 0.00) | **Passed** |
| **TC-P05-03** | Actual COGS & Gross Profit Calculation | Deducts exact acquisition cost per physical handset | Total COGS: Rs. 412,080, Gross Profit: Rs. 44,414 (9.73% margin) | **Passed** |
| **TC-P05-04** | Dual-SIM Handset Sales Deduction | Handset sold marks both IMEI1 & IMEI2 as sold | Infinix Hot 70 (IMEI1 & IMEI2) verified under unit status SOLD | **Passed** |
| **TC-P05-05** | Walk-in Cash Counter Sales | Fast POS sale without requiring named customer credit | Walk-in sales posted with cash tender and immediate receipt | **Passed** |
| **TC-P05-06** | Thermal 80mm & A4 Invoice Printing | Thermal receipt & A4 commercial invoice templates | Verified `/sales/[id]/receipt` and `/sales/[id]/print` | **Passed** |

---

## 6. Priority 06 Acceptance Verification (Customer & Supplier Management)

| Test Case | Description | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| **TC-P06-01** | Customer Registry Verification | Active customers with codes, types, and limits | 3 registered customers (`CUST-1018`, `CUST-8213`, `WALK-IN`) verified | **Passed** |
| **TC-P06-02** | Customer Credit Limit Management | Credit limits and available credit calculated | CUST-1018 limit Rs. 1,000,000, Available: Rs. 1,000,000 verified | **Passed** |
| **TC-P06-03** | Sales & Receipt Settlements | Invoices settled with PaymentAllocation records | 11 sales invoices (Rs. 456,494) 100% settled; 0 open invoices | **Passed** |
| **TC-P06-04** | GL Account 1100 (Trade Receivables) Reconciliation | Total customer subledgers equal GL Control 1100 | GL Debit Rs. 598,892 = Credit Rs. 598,892; Net Balance Rs. 0.00 (Diff: Rs. 0.00) | **Passed** |
| **TC-P06-05** | Supplier Registry Verification | Active suppliers with terms and opening balances | 2 registered suppliers (`SUP-3414`, `SUP-8910`) verified | **Passed** |
| **TC-P06-06** | Supplier Bill & Payment Settlement | GRN settled with PaymentAllocation records | ISB-GRN-000001 (Rs. 278,900) 100% settled; 0 open bills | **Passed** |
| **TC-P06-07** | Supplier Opening Balance & Advance | Opening balance rolls forward; advance offset | SUP-3414 OB Rs. 140,475 − Payment Rs. 50,000 = Rs. 90,475.00 payable | **Passed** |
| **TC-P06-08** | GL Account 2000 (Trade Payables) Reconciliation | Total supplier subledgers equal GL Control 2000 | GL Debit Rs. 328,900, Credit Rs. 419,375; Net Payable Rs. 90,475.00 (Diff: Rs. 0.00) | **Passed** |
| **TC-P06-09** | Chronological Running Balance Subledger | Line-by-line running balance accurately tracked | Verified in `scripts/test_priority_06.mjs` (27/27 tests passed) | **Passed** |
| **TC-P06-10** | Printable Account Statements | A4 official statement with aging and signatures | `PartyStatementPrintPage` verified with running balance & aging ribbon | **Passed** |

---

## 7. Priority 07 Acceptance Verification (Cash, Bank & Expense Management)

| Test Case | Description | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| **TC-P07-01** | Cash Account (GL 1000) Master Verification | Active with class ASSET, type CASH, normal balance DEBIT | GL 1000 Cash on Hand active in chart of accounts | **Passed** |
| **TC-P07-02** | Bank Account 0001 (Faysal Bank) Master Verification | Linked to GL 1010 Current Account, active with branch mapping | Bank 0001 mapped to GL 1010, Branch ISB verified | **Passed** |
| **TC-P07-03** | Cash on Hand Balance Exact Reconciliation | Net balance equals posted debits minus credits | Debit Rs. 440,649 − Credit Rs. 393,239 = Rs. 47,410.00 | **Passed** |
| **TC-P07-04** | Bank Account Balance Zero-Variance Reconciliation | GL 1010 net balance reconciles 100% with BankTransaction ledger | GL 1010 Rs. 3,816 = BankTxn Rs. 3,816 (Variance: Rs. 0.00) | **Passed** |
| **TC-P07-05** | Combined Liquid Working Capital | Sum of Cash and Bank matches live liquid asset total | Rs. 47,410 + Rs. 3,816 = Rs. 51,226.00 exact | **Passed** |
| **TC-P07-06** | 11 Default Expense Category Accounts | Default operating expense GL accounts seeded and active | 6010, 6020, 6030, 6040, 6050, 6060, 6070, 6080, 6090, 6095, 6099 active | **Passed** |
| **TC-P07-07** | Double-Entry Expense Voucher Invariant | Sum of debits strictly equals sum of credits on all expense vouchers | Verified across all expense vouchers; zero unbalanced lines | **Passed** |
| **TC-P07-08** | Cash Expense Disbursal GL Impact | Debits Expense GL and credits GL 1000 Cash on Hand | Verified on `ISB-JV-FY2026-27-000003` (Cr 1000 Rs. 8,000) | **Passed** |
| **TC-P07-09** | Bank Expense Disbursal & Bank Transaction | Debits Expense GL, credits GL 1010 Bank, creates BankTransaction withdrawal | Verified on `ISB-JV-FY2026-27-000008` (Cr 1010 Rs. 1,000) | **Passed** |
| **TC-P07-10** | Cash-to-Bank Transfer (Deposit / Contra) | Debits GL 1010 Bank, credits GL 1000 Cash | Verified on `ISB-JV-FY2026-27-000002` (Rs. 24,799 balanced) | **Passed** |
| **TC-P07-11** | Bank-to-Cash Transfer (Withdrawal / Contra) | Debits GL 1000 Cash, credits GL 1010 Bank | Verified on `ISB-JV-FY2026-27-000004`, 000005, 000006 | **Passed** |
| **TC-P07-12** | Transfer Contra Invariant | Zero revenue or expense account distortion on any transfer | Verified 0 transfer lines hit REVENUE or EXPENSE | **Passed** |
| **TC-P07-13** | Bank Transaction Authoritative Linkage | 100% of BankTransaction rows have 1:1 JournalLineId mapping | All bank transactions mapped 1:1; 0 unlinked | **Passed** |
| **TC-P07-14** | Negative Balance Protection Guard | Rejects transfers exceeding available balance unless authorized | Active guard checks cash on hand and bank funds | **Passed** |
| **TC-P07-15** | Cashbook Opening Balance Continuity | Calculates opening balance strictly from activity prior to query window | Verified in Cashbook calculation engine | **Passed** |
| **TC-P07-16** | Cashbook Running Balance Continuity | Line-by-line running balance matches Opening + Inflows − Outflows | Verified across all posted cash movements | **Passed** |
| **TC-P07-17** | Bankbook Running Balance Continuity | Line-by-line running balance matches Opening + Deposits − Withdrawals | Verified across all 16 bank transactions | **Passed** |
| **TC-P07-18** | Printable Vouchers & Statements | Official printable vouchers with QR/Barcode & signatures | Expense voucher, Cashbook print, Bankbook print verified | **Passed** |
| **TC-P07-19** | Direct Atomic Posting Support | Optional `postNow` flag allows one-click expense posting | Verified atomic draft-to-posted transition without SAP complexity | **Passed** |
| **TC-P07-20** | General Ledger Trial Balance Equilibrium | Total GL debits equal total GL credits with zero variance | Diff = Rs. 0.00 across entire double-entry ledger | **Passed** |

---

## 8. Overall Priority Acceptance Status
- **Priority 01 (Foundation):** **PASSED**
- **Priority 02 (Product & Catalog):** **PASSED**
- **Priority 03 (Purchases & Receiving):** **PASSED**
- **Priority 04 (Inventory & IMEI Management):** **PASSED**
- **Priority 05 (Sales Management & POS):** **PASSED**
- **Priority 06 (Customer & Supplier Management):** **PASSED**
- **Priority 07 (Cash, Bank & Expense Management):** **PASSED** (24/24 Tests Passed)
- **Next Priority:** **Priority 08 — Returns, Exchanges, Pricing & Promotions**
