# GENERAL LEDGER RECONCILIATION REPORT
**ERP:** Axon Mobile ERP  
**Company:** AXON · Gondal Mobile Center  
**Period:** November 2026 · FY2026-27  
**Status:** RECONCILED & BALANCED  

---

## 1. Single Source of Truth Audit

In Axon Mobile ERP, the **General Ledger (`JournalEntry` and `JournalEntryLine`)** is the sole authoritative record for all financial figures. Operational subledgers (Sales, Purchases, Inventory, Payments) post append-only journal entries directly to the ledger upon posting.

### Posted Vouchers Summary in November 2026

| GL Voucher Number | Posting Date | Source Module | Source Document Ref | Debit (PKR) | Credit (PKR) | Balance Check |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: |
| `ISB--SAV-FY2026-27-000001` | 09-Nov-2026 | Inventory | `ISB--SA-FY2026-27-000001` | 756,410.00 | 756,410.00 | Balanced |
| `ISB--SAV-FY2026-27-000002` | 02-Nov-2026 | Inventory | `ISB--SA-FY2026-27-000002` | 266,780.00 | 266,780.00 | Balanced |
| `ISB--SAV-FY2026-27-000003` | 02-Nov-2026 | Inventory | `ISB--SA-FY2026-27-000003` | 2,550.00 | 2,550.00 | Balanced |
| `ISB--SV-FY2026-27-000008` | 04-Nov-2026 | Sales | `ISB--SI-FY2026-27-000004` | 57,879.00 | 57,879.00 | Balanced |
| `ISB--RC-FY2026-27-000005` | 06-Nov-2026 | Payment | `ISB--RC-FY2026-27-000005` | 6,200.00 | 6,200.00 | Balanced |

---

## 2. Detailed Journal Line Analysis

### Sales Invoice Journal `ISB--SV-FY2026-27-000008` (Ref: `ISB--SI-FY2026-27-000004`)
* **1100 Trade Receivables:** Debit PKR 30,999.00 (Customer Palmpay limited)
* **4000 Mobile & Accessory Sales:** Credit PKR 30,999.00
* **5000 Cost of Goods Sold:** Debit PKR 26,880.00
* **1200 Merchandise Inventory:** Credit PKR 26,880.00
* **Voucher Total:** Dr PKR 57,879.00 | Cr PKR 57,879.00 (Balanced)

### Inventory Stock Initialization Vouchers (`ISB--SAV-000001..3`)
* **1200 Merchandise Inventory:** Debit PKR 1,025,740.00
* **Equity / Adjustment Reserve:** Credit PKR 1,025,740.00
* **Voucher Total:** Dr PKR 1,025,740.00 | Cr PKR 1,025,740.00 (Balanced)

---

## 3. General Ledger Trial Balance Equality
* **Total Ledger Debits:** PKR 1,090,319.00
* **Total Ledger Credits:** PKR 1,090,319.00
* **Variance:** **PKR 0.00 (Exact-Zero Variance)**

---

© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
