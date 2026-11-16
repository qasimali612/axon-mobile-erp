# POS ACCOUNTING AUDIT — AXON MOBILE ERP
**Module:** Point of Sale (POS) Accounting Integration  
**Framework:** Double-Entry General Ledger (Chart of Accounts)  
**Audit Date:** November 2026  
**Auditor:** Chartered Management Accountant & ERP Finance Specialist  

---

## 1. Accounting Principles & Transaction Journal Verification

Axon Mobile ERP adheres to strict perpetual double-entry accounting. The POS module interfaces with the General Ledger across five primary account types:
- **`ACCOUNTS_RECEIVABLE`:** Customer asset ledger account.
- **`SALES_REVENUE`:** Operating revenue account.
- **`TAX_PAYABLE`:** Output sales tax liability account.
- **`COGS`:** Cost of goods sold expense account.
- **`INVENTORY`:** Inventory asset account.
- **`CASH` / `BANK`:** Cash drawer and bank asset accounts for tenders.

---

## 2. Posting Scenarios & Journal Entries

### Scenario A: Immediate Full Cash Sale
*Customer buys handset for Rs. 200,000 cash (Cost: Rs. 160,000, Tax: Rs. 0).*

1. **Sales & Inventory Journal Voucher (`SV`):**
   - **Dr** Accounts Receivable: Rs. 200,000
   - **Cr** Sales Revenue: Rs. 200,000
   - **Dr** Cost of Goods Sold: Rs. 160,000
   - **Cr** Inventory Asset: Rs. 160,000
   *(Entry Balances: Total Dr Rs. 360,000 = Total Cr Rs. 360,000)*

2. **Customer Receipt Voucher (`RC`):**
   - **Dr** Cash Drawer Account (1000): Rs. 200,000
   - **Cr** Accounts Receivable: Rs. 200,000
   *(Entry Balances: Total Dr Rs. 200,000 = Total Cr Rs. 200,000)*
   *Net AR Balance for this transaction = Rs. 0.*

### Scenario B: Multi-Tender Sale (Cash + Card POS + Credit Balance)
*Customer buys goods for Rs. 100,000. Pays Rs. 30,000 Cash, Rs. 40,000 Card, Rs. 30,000 remains on Credit.*

1. **Sales & Inventory Journal Voucher (`SV`):**
   - **Dr** Accounts Receivable: Rs. 100,000
   - **Cr** Sales Revenue: Rs. 100,000
   - **Dr** Cost of Goods Sold: Rs. 75,000
   - **Cr** Inventory Asset: Rs. 75,000

2. **Customer Receipt Vouchers (`RC`):**
   - **Receipt 1 (Cash Drawer):**
     - **Dr** Cash Drawer (1000): Rs. 30,000
     - **Cr** Accounts Receivable: Rs. 30,000
   - **Receipt 2 (Card POS Bank Account):**
     - **Dr** Bank Account (Bank Master Asset GL): Rs. 40,000
     - **Cr** Accounts Receivable: Rs. 40,000
   *Net AR Remaining Balance = Rs. 100,000 - Rs. 70,000 = Rs. 30,000 (Due on terms).*

### Scenario C: Term Credit Sale with Advance Down Payment
*Customer buys phone for Rs. 150,000 on Net 30 terms. Pays Rs. 50,000 advance cash at counter.*
- Total Invoice: Rs. 150,000
- Allocated Cash Receipt: Rs. 50,000
- Remaining Customer Receivable: Rs. 100,000 due on specified `dueDate`.

---

## 3. Inventory Valuation Audit (Landed Cost vs WAC)

1. **Serialized Dual-SIM Handsets (Specific Identification):**
   - Each `PhysicalStockUnit` stores its exact `acquisitionCost`.
   - When a handset is sold, COGS is debited by `stockUnit.acquisitionCost`.
   - Inventory Asset is credited by `stockUnit.acquisitionCost`.
   - Guarantees 100% precision in Gross Profit calculation per device sold.

2. **Quantity-Based Accessories & Spares (Weighted Average Cost):**
   - `StockBalance` stores on-hand `quantity` and total `inventoryValue`.
   - Unit cost is determined by `inventoryValue / quantity`.
   - COGS is debited by `unitCost * quantity`.
   - Inventory Asset is credited by `unitCost * quantity`.

---

## 4. Key Accounting Controls & Safeguards

- **Zero Unbalanced Journals:** The database trigger `verify_journal_balance` enforces `debitSum === creditSum` to 4 decimal places.
- **Period Locks:** Transactions cannot post into closed accounting periods.
- **No Hardcoded Accounts:** Accounts are dynamically resolved from company posting rules via `requirePostingAccount`.
- **Bank Reconciliation Evidence:** Payments recorded to bank accounts create un-reconciled `BankTransaction` records ready for statement line matching.

---
© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
