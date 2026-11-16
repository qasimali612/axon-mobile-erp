# TRIAL BALANCE VALIDATION REPORT
**ERP:** Axon Mobile ERP  
**Company:** AXON · Gondal Mobile Center  
**As of:** 30-Nov-2026 (Fiscal Period: November 2026 · FY2026-27)  
**Ledger Currency:** PKR  

---

## 1. Multi-Column Trial Balance Reconciliation

The Trial Balance aggregates all posted debit and credit lines from the protected General Ledger.

```
+--------+------------------------------------+------------------+------------------+------------------+------------------+
| Code   | Account Name                       | Opening Dr / Cr  | Period Debit     | Period Credit    | Closing Debit    | Closing Credit   |
+--------+------------------------------------+------------------+------------------+------------------+------------------+
| 1000   | Cash on Hand (Asset)               | Rs 0.00          | Rs 6,200.00      | Rs 0.00          | Rs 6,200.00      | —                |
| 1100   | Trade Receivables (Asset)          | Rs 0.00          | Rs 30,999.00     | Rs 6,200.00      | Rs 24,799.00     | —                |
| 1200   | Merchandise Inventory (Asset)      | Rs 0.00          | Rs 1,025,740.00  | Rs 26,880.00     | Rs 998,860.00    | —                |
| 2000   | Trade Payables (Liability)         | Rs 0.00          | Rs 0.00          | Rs 0.00          | —                | Rs 0.00          |
| 3200   | Opening Stock Equity Reserve (Eq)  | Rs 0.00          | Rs 0.00          | Rs 1,025,740.00  | —                | Rs 1,025,740.00  |
| 4000   | Mobile & Accessory Sales (Revenue) | Rs 0.00          | Rs 0.00          | Rs 30,999.00     | —                | Rs 30,999.00     |
| 5000   | Cost of Goods Sold (COGS)          | Rs 0.00          | Rs 26,880.00     | Rs 0.00          | Rs 26,880.00     | —                |
| 6000   | Operating Expenses (Expense)       | Rs 0.00          | Rs 0.00          | Rs 0.00          | Rs 0.00          | —                |
+--------+------------------------------------+------------------+------------------+------------------+------------------+
| TOTALS | BALANCED GENERAL LEDGER            | Rs 0.00          | Rs 1,089,819.00  | Rs 1,089,819.00  | Rs 1,056,739.00  | Rs 1,056,739.00  |
+--------+------------------------------------+------------------+------------------+------------------+------------------+
```

---

## 2. Investigation into Opening Columns

### Why did Opening Columns display Zero for November 2026?
* **Cause:** The company was inaugurated into the ERP during November 2026. Therefore, all opening stock transactions were posted with operational voucher dates in November 2026 (02-Nov-2026 and 09-Nov-2026).
* **Finding:** Because the date filter selected "November 2026", transactions dated within November appear under **Period Activity** rather than pre-November Opening Balance.
* **Accounting Treatment:** This is historically accurate and preserves full auditability of the cutover date. In subsequent periods (e.g. December 2026 / Q1 2027), the November closing balances automatically flow into the **Opening Balance** columns of the Trial Balance.

---

## 3. Mathematical Integrity
$$\sum \text{Closing Debits} - \sum \text{Closing Credits} = \text{Rs } 1,056,739.00 - 1,056,739.00 = \mathbf{0.00}$$
The Trial Balance balances with zero discrepancy.

---

© 2026 Copyright Reserved · Qasim Ali · 0315-5049489

