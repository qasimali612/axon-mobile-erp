# AXON MOBILE ERP — AGING REPORT AUDIT
## Accounts Receivable & Accounts Payable Aging Master Audit

**Company:** Gondal Mobile Center (AXON)  
**Database:** PostgreSQL (Cloud Instance `db.prisma.io:5432`)  
**Audit Date:** November 2026  
**Status:** Audit Completed & Verified  

---

## 1. Aging Methodology & Calculation Standards

Aging calculations are performed strictly as of the selected calculation date ($T_{\text{AsOf}}$) using the document due date ($T_{\text{Due}}$):

$$\text{Days Past Due} = \left\lfloor \frac{T_{\text{AsOf}} - T_{\text{Due}}}{86,400,000 \text{ ms}} \right\rfloor$$

### Standard 5-Tier Aging Buckets:
1. **Current / Not Due:** $\text{Days Past Due} \le 0$
2. **1–30 Days Overdue:** $1 \le \text{Days Past Due} \le 30$
3. **31–60 Days Overdue:** $31 \le \text{Days Past Due} \le 60$
4. **61–90 Days Overdue:** $61 \le \text{Days Past Due} \le 90$
5. **Over 90 Days Overdue:** $\text{Days Past Due} > 90$

---

## 2. Customer Receivables Aging Summary (As of 17-Nov-2026)

| Customer Code | Customer Name | Current | 1–30 Days | 31–60 Days | 61–90 Days | 90+ Days | Residual / Advance | Total Ledger Balance |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `CUST-1018` | Alif Finance Private Limited | Rs. 0.00 | Rs. 0.00 | Rs. 0.00 | Rs. 0.00 | Rs. 0.00 | Rs. 0.00 | **Rs. 0.00** |
| `CUST-8213` | Palmpay limited | Rs. 0.00 | Rs. 0.00 | Rs. 0.00 | Rs. 0.00 | Rs. 0.00 | Rs. 0.00 | **Rs. 0.00** |
| `WALK-IN` | Walk-in Counter Customer | Rs. 0.00 | Rs. 0.00 | Rs. 0.00 | Rs. 0.00 | Rs. 0.00 | Rs. 0.00 | **Rs. 0.00** |
| **Total AR Aging** | | **Rs. 0.00** | **Rs. 0.00** | **Rs. 0.00** | **Rs. 0.00** | **Rs. 0.00** | **Rs. 0.00** | **Rs. 0.00** |

*Verification:* Total AR Aging matches GL Account 1100 exactly (Rs. 0.00).

---

## 3. Supplier Payables Aging Summary (As of 17-Nov-2026)

| Supplier Code | Supplier Name | Current | 1–30 Days | 31–60 Days | 61–90 Days | 90+ Days | Residual / Advance | Total Ledger Balance |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `SUP-3414` | 3 Star Mobile | Rs. 0.00 | Rs. 0.00 | Rs. 0.00 | Rs. 0.00 | Rs. 0.00 | Rs. 90,475.00 | **Rs. 90,475.00** |
| `SUP-8910` | 5G Mobile City- ISB | Rs. 0.00 | Rs. 0.00 | Rs. 0.00 | Rs. 0.00 | Rs. 0.00 | Rs. 0.00 | **Rs. 0.00** |
| **Total AP Aging** | | **Rs. 0.00** | **Rs. 0.00** | **Rs. 0.00** | **Rs. 0.00** | **Rs. 0.00** | **Rs. 90,475.00** | **Rs. 90,475.00** |

*Verification:* Total AP Aging matches GL Account 2000 exactly (Rs. 90,475.00).

---

## 4. Residual Reconciliation
- The `residual` column captures opening balances and unallocated payments that exist on account prior to document creation.
- For `SUP-3414`, the opening balance of Rs. 140,475 minus Rs. 50,000 on-account payment correctly reconciles to a net residual of Rs. 90,475.00, ensuring 100% balance reconciliation between document open items and GL ledger totals.

---
© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
