# AXON MOBILE ERP — PARTY SUBLEDGER AUDIT
## General Ledger Control Accounts vs Subledger Master Audit

**Company:** Gondal Mobile Center (AXON)  
**Database:** PostgreSQL (Cloud Instance `db.prisma.io:5432`)  
**GL Accounts Inspected:**  
- Account `1100`: Trade Receivables (Control Account for Customers)  
- Account `2000`: Trade Payables (Control Account for Suppliers)  
**Audit Date:** November 2026  
**Status:** 100% Exact Reconciliation Confirmed (Rs. 0.00 Variance)  

---

## 1. Trade Receivables (GL Account 1100) Reconciliation

### Control Account GL Movement
- **GL Account ID:** `1100` (Trade Receivables)
- **Account Type:** `ACCOUNTS_RECEIVABLE`
- **Total Posted Debits:** Rs. 598,892.00
- **Total Posted Credits:** Rs. 598,892.00
- **Net GL Control Balance:** **Rs. 0.00**

### Customer Subledger Balances
| Customer Code | Customer Name | Debit (Invoices & Adjustments) | Credit (Receipts & Reversals) | Net Subledger Balance |
| :--- | :--- | :---: | :---: | :---: |
| `CUST-1018` | Alif Finance Private Limited | Rs. 338,994.00 | Rs. 338,994.00 | **Rs. 0.00** |
| `CUST-8213` | Palmpay limited | Rs. 103,398.00 | Rs. 103,398.00 | **Rs. 0.00** |
| `WALK-IN` | Walk-in Counter Customer | Rs. 156,500.00 | Rs. 156,500.00 | **Rs. 0.00** |
| **Total Customer Subledgers** | | **Rs. 598,892.00** | **Rs. 598,892.00** | **Rs. 0.00** |

**Reconciliation Variance:**
$$\Delta = \text{GL 1100 Net Balance} - \text{Total Customer Subledgers} = \text{Rs. 0.00} - \text{Rs. 0.00} = \mathbf{Rs.\ 0.00}$$

---

## 2. Trade Payables (GL Account 2000) Reconciliation

### Control Account GL Movement
- **GL Account ID:** `2000` (Trade Payables)
- **Account Type:** `ACCOUNTS_PAYABLE`
- **Total Posted Debits:** Rs. 328,900.00
- **Total Posted Credits:** Rs. 419,375.00
- **Net GL Control Balance:** **Rs. 90,475.00** (Credit / Payable)

### Supplier Subledger Balances
| Supplier Code | Supplier Name | Credit (Bills & Opening Balances) | Debit (Payments & Adjustments) | Net Subledger Balance |
| :--- | :--- | :---: | :---: | :---: |
| `SUP-3414` | 3 Star Mobile | Rs. 140,475.00 | Rs. 50,000.00 | **Rs. 90,475.00** (Payable) |
| `SUP-8910` | 5G Mobile City- ISB | Rs. 278,900.00 | Rs. 278,900.00 | **Rs. 0.00** |
| **Total Supplier Subledgers** | | **Rs. 419,375.00** | **Rs. 328,900.00** | **Rs. 90,475.00** |

**Reconciliation Variance:**
$$\Delta = \text{GL 2000 Net Balance} - \text{Total Supplier Subledgers} = \text{Rs. 90,475.00} - \text{Rs. 90,475.00} = \mathbf{Rs.\ 0.00}$$

---

## 3. Subledger Integrity Rules & Guards

1. **Foreign Key Integrity:**
   - Every `JournalEntryLine` targeting `ACCOUNTS_RECEIVABLE` must have a valid `customerId`.
   - Every `JournalEntryLine` targeting `ACCOUNTS_PAYABLE` must have a valid `supplierId`.
   - Database audits verify 0 unlinked or orphaned lines.

2. **Opening Balance Synchronization:**
   - Supplier opening balance of Rs. 140,475.00 for `SUP-3414` was posted via authoritative opening journal voucher into GL Account 2000 with offset to Equity (Account 3000).
   - Subsequent payment `ISB-PV-FY2026-27-000019` / `ISB-PV-FY2026-27-000020` of Rs. 50,000 debited GL Account 2000, leaving exactly Rs. 90,475.00 in trade payables.

3. **Running Balance Accuracy:**
   - All statement generation utilizes strict chronological sorting by `postingDate`, `voucherNumber`, and `lineNumber` to calculate cumulative line-by-line running balances.

---
© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
