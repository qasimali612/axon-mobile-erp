# AXON MOBILE ERP — PRIORITY 06 AUDIT REPORT
## Customer & Supplier Management System Pre-Implementation Audit

**Project:** AXON MOBILE ERP  
**Company:** Gondal Mobile Center (AXON)  
**Database:** PostgreSQL (Cloud Instance `db.prisma.io:5432`)  
**Currency:** PKR (Rs.)  
**Branches:** HZR — Hazro Central, ISB — Islamabad  
**Audit Date:** November 2026  
**Status:** Audit Completed & Verified  

---

## 1. Executive Summary

This audit assesses the customer and supplier management architecture, party subledgers, open-item payment allocations, aging calculations, credit limit controls, and General Ledger control account reconciliations.

### Summary of Audit Findings
1. **Control Account 1100 (Trade Receivables):**
   - Total GL Debit: **Rs. 598,892.00**
   - Total GL Credit: **Rs. 598,892.00**
   - Net AR Balance: **Rs. 0.00**
   - Total Customer Open Items: **Rs. 0.00**
   - **Reconciliation Variance: Rs. 0.00 (100.00% Exact Match)**

2. **Control Account 2000 (Trade Payables):**
   - Total GL Debit: **Rs. 328,900.00**
   - Total GL Credit: **Rs. 419,375.00**
   - Net AP Balance: **Rs. 90,475.00** (Payable)
   - Total Supplier Open Items & Unallocated Advances:
     - `SUP-3414` (3 Star Mobile): Rs. 140,475 opening payable − Rs. 50,000 unallocated payment = **Rs. 90,475.00**
     - `SUP-8910` (5G Mobile City- ISB): Rs. 278,900 bill − Rs. 278,900 payment = **Rs. 0.00**
   - Total Supplier AP Subledger: **Rs. 90,475.00**
   - **Reconciliation Variance: Rs. 0.00 (100.00% Exact Match)**

---

## 2. Customer Subledger Inventory

| Customer Code | Customer Name | Type | Credit Limit | Posted Invoices | Invoiced Total | Receipts Total | Allocated Total | Open Balance | Net AR Balance |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `CUST-1018` | Alif Finance Private Limited | CORPORATE | Rs. 1,000,000 | 4 | Rs. 208,996 | Rs. 208,996 | Rs. 208,996 | Rs. 0.00 | **Rs. 0.00** |
| `CUST-8213` | Palmpay limited | CORPORATE | Rs. 1,000,000 | 2 | Rs. 90,998 | Rs. 90,998 | Rs. 90,998 | Rs. 0.00 | **Rs. 0.00** |
| `WALK-IN` | Walk-in Counter Customer | RETAIL | Rs. 0 | 5 | Rs. 156,500 | Rs. 156,500 | Rs. 156,500 | Rs. 0.00 | **Rs. 0.00** |
| **Total** | | | | **11** | **Rs. 456,494** | **Rs. 456,494** | **Rs. 456,494** | **Rs. 0.00** | **Rs. 0.00** |

---

## 3. Supplier Subledger Inventory

| Supplier Code | Supplier Name | Contact Person | Opening Bal | Posted Bills | Billed Total | Payments Total | Allocated Total | Net AP Balance |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `SUP-3414` | 3 Star Mobile | Rep / Key Acct | Rs. 140,475 | 0 | Rs. 0 | Rs. 50,000 | Rs. 0 | **Rs. 90,475.00** |
| `SUP-8910` | 5G Mobile City- ISB | Counter | Rs. 0 | 1 | Rs. 278,900 | Rs. 278,900 | Rs. 278,900 | **Rs. 0.00** |
| **Total** | | | **Rs. 140,475** | **1** | **Rs. 278,900** | **Rs. 328,900** | **Rs. 278,900** | **Rs. 90,475.00** |

---

## 4. Architectural Analysis & Required Upgrades

1. **Party Dashboard UI:**
   - Previous customer and supplier detail views lacked tabbed navigation for fast switching between Overview, Invoices/Bills, Receipts/Payments, Ledgers, Aging, and Statements.
   - Upgrade: Implement complete tabbed dashboards for both Customer and Supplier master detail pages.

2. **Subledger Running Balance:**
   - Subledgers must show chronological line-by-line running balances for every transaction from opening balance through to current date.
   - Handled via `getPartyStatement` engine in `src/lib/finance/subledger.ts` and rendered in printable statements and detail ledgers.

3. **Credit Limit Control:**
   - Real-time available credit exposure calculation:
     $$\text{Available Credit} = \text{Credit Limit} - \text{Current Outstanding AR}$$
   - POS checkout already warns cashier with live exposure banner when credit customer exceeds limit, allowing cash sales while auditing credit overrides.

4. **Aging Buckets:**
   - Standard 5-tier aging buckets: Current / Not Due, 1–30 Days, 31–60 Days, 61–90 Days, and Over 90 Days.
   - Real-time computation from posted invoice due dates.

---
© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
