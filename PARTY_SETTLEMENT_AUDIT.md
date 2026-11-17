# AXON MOBILE ERP — PARTY SETTLEMENT AUDIT
## Open-Item Allocation, Advances & Settlement Engine Master Audit

**Company:** Gondal Mobile Center (AXON)  
**Database:** PostgreSQL (Cloud Instance `db.prisma.io:5432`)  
**Audit Date:** November 2026  
**Status:** Audit Completed & Verified  

---

## 1. Executive Summary

The Open-Item Settlement Engine manages invoice-wise payment allocations for customer sales invoices and supplier purchase receipts. This audit verifies allocation integrity, over-allocation prevention, and advance tracking.

### Core Metrics:
- Total Posted Sales Invoices: **11**
- Total Settled Invoices: **11**
- Open Customer Invoices: **0** (Rs. 0.00 outstanding)
- Total Posted Purchase Bills: **1**
- Total Settled Purchase Bills: **1**
- Open Supplier Bills: **0** (Rs. 0.00 outstanding)
- Unallocated Supplier Advance (against opening balance): **Rs. 50,000.00** (`SUP-3414`)

---

## 2. Customer Sales Invoice Settlement Breakdown

### Customer: `CUST-1018` · Alif Finance Private Limited
| Invoice Number | Invoice Date | Grand Total | Settled / Paid | Open Balance | Settlement Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `ISB--SI-FY2026-27-000005` | 04-Nov-2026 | Rs. 39,999.00 | Rs. 39,999.00 | Rs. 0.00 | **Fully Paid** |
| `ISB--SI-FY2026-27-000003` | 03-Nov-2026 | Rs. 55,999.00 | Rs. 55,999.00 | Rs. 0.00 | **Fully Paid** |
| `ISB-SI-FY2026-27-000010` | 11-Nov-2026 | Rs. 64,999.00 | Rs. 64,999.00 | Rs. 0.00 | **Fully Paid** |
| `ISB-SI-FY2026-27-000011` | 12-Nov-2026 | Rs. 47,999.00 | Rs. 47,999.00 | Rs. 0.00 | **Fully Paid** |
| **Subtotal** | | **Rs. 208,996.00** | **Rs. 208,996.00** | **Rs. 0.00** | **100% Settled** |

### Customer: `CUST-8213` · Palmpay limited
| Invoice Number | Invoice Date | Grand Total | Settled / Paid | Open Balance | Settlement Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `ISB--SI-FY2026-27-000008` | 06-Nov-2026 | Rs. 59,999.00 | Rs. 59,999.00 | Rs. 0.00 | **Fully Paid** |
| `ISB--SI-FY2026-27-000004` | 04-Nov-2026 | Rs. 30,999.00 | Rs. 30,999.00 | Rs. 0.00 | **Fully Paid** |
| **Subtotal** | | **Rs. 90,998.00** | **Rs. 90,998.00** | **Rs. 0.00** | **100% Settled** |

### Customer: `WALK-IN` · Walk-in Counter Customer
| Invoice Number | Invoice Date | Grand Total | Settled / Paid | Open Balance | Settlement Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `ISB--SI-FY2026-27-000006` | 05-Nov-2026 | Rs. 36,500.00 | Rs. 36,500.00 | Rs. 0.00 | **Fully Paid** |
| `ISB--SI-FY2026-27-000001` | 02-Nov-2026 | Rs. 3,300.00 | Rs. 3,300.00 | Rs. 0.00 | **Fully Paid** |
| `ISB--SI-FY2026-27-000002` | 02-Nov-2026 | Rs. 71,500.00 | Rs. 71,500.00 | Rs. 0.00 | **Fully Paid** |
| `ISB--SI-FY2026-27-000007` | 06-Nov-2026 | Rs. 43,000.00 | Rs. 43,000.00 | Rs. 0.00 | **Fully Paid** |
| `ISB-SI-FY2026-27-000009` | 06-Nov-2026 | Rs. 2,200.00 | Rs. 2,200.00 | Rs. 0.00 | **Fully Paid** |
| **Subtotal** | | **Rs. 156,500.00** | **Rs. 156,500.00** | **Rs. 0.00** | **100% Settled** |

---

## 3. Supplier Purchase Bill Settlement Breakdown

### Supplier: `SUP-8910` · 5G Mobile City- ISB
| Receipt / Bill Number | Bill Date | Grand Total | Settled / Paid | Open Balance | Settlement Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `ISB-GRN-FY2026-27-000001` | 12-Nov-2026 | Rs. 278,900.00 | Rs. 278,900.00 | Rs. 0.00 | **Fully Paid** |
| **Subtotal** | | **Rs. 278,900.00** | **Rs. 278,900.00** | **Rs. 0.00** | **100% Settled** |

### Supplier: `SUP-3414` · 3 Star Mobile
- **Opening Balance:** Rs. 140,475.00 (Credit / Payable)
- **Bills Incurred:** Rs. 0.00
- **Payments Made:** Rs. 50,000.00 (`ISB-PV-FY2026-27-000019`)
- **Allocated to Bills:** Rs. 0.00 (No open bills existed)
- **On-Account Advance against Opening Balance:** Rs. 50,000.00
- **Net Remaining Payable:** **Rs. 90,475.00**

---

## 4. Open-Item Settlement Engine Rules

1. **Strict Non-Over-Allocation:**
   $$\sum \text{Allocation Amounts} \le \text{Payment Amount}$$
   An attempt to allocate more than the voucher amount triggers an instant `422 OVER_ALLOCATION` error.

2. **Invoice Balance Cap:**
   $$\text{Prior Settled} + \text{New Allocation} \le \text{Document Grand Total}$$
   Overpayment on an individual document is prevented at the transaction validation barrier.

3. **Advance Retention:**
   $$\text{Unallocated Advance} = \text{Payment Amount} - \sum \text{Allocated Amounts}$$
   Unallocated amounts remain on the party's account as residual credit (for customers) or debit (for suppliers), automatically available for future invoice matching or statement reconciliation.

4. **Reversal Restoration:**
   Reversing a receipt or payment atomically deletes or reverses the `PaymentAllocation` records, immediately restoring the open balance of linked invoices.

---
© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
