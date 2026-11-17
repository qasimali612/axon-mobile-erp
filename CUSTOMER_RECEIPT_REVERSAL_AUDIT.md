# CUSTOMER RECEIPT REVERSAL & CORRECTION AUDIT
**Company:** Gondal Mobile Center  
**Branch:** ISB – Islamabad  
**Audit Target:** Rs. 64,999 Receipt Chain (`ISB-RC-15, 16, 17, 18` & `ISB-RCR-03, 04`)  
**Sales Invoice Target:** `ISB-SI-FY2026-27-000010` (Rs. 64,999.00)  

---

## 1. CHRONOLOGICAL TRANSACTION LIFECYCLE

| Step | Type | Voucher / Payment # | Date | Status | Debit | Credit | Allocation Target |
|---|---|---|---|---|---|---|---|
| 1 | Receipt | Payment: `ISB-RC-000016`<br>Journal: `ISB-RC-000015` | 2026-11-16 | REVERSED | Dr 1010 (64,999) | Cr 1100 (64,999) | None (Unallocated receipt) |
| 2 | Reversal | Journal: `ISB-RCR-000003` | 2026-11-16 | POSTED | Dr 1100 (64,999) | Cr 1010 (64,999) | Reverses Step 1 |
| 3 | Receipt | Payment: `ISB-RC-000017`<br>Journal: `ISB-RC-000016` | 2026-11-16 | REVERSED | Dr 1010 (64,999) | Cr 1100 (64,999) | `ISB-SI-000010` (Date 2026-11-16) |
| 4 | Reversal | Journal: `ISB-RCR-000004` | 2026-11-16 | POSTED | Dr 1100 (64,999) | Cr 1010 (64,999) | Reverses Step 3 |
| 5 | Receipt | Payment: `ISB-RC-000018`<br>Journal: `ISB-RC-000017` | 2026-11-12 | POSTED | Dr 1010 (64,999) | Cr 1100 (64,999) | `ISB-SI-000010` (Backdated to invoice date) |

---

## 2. THE 8 SPECIFIC AUDIT ANSWERS

### Question 1: Which receipt was originally correct?
**Answer:** The underlying business receipt for Rs. 64,999 was intended to settle Sales Invoice `ISB-SI-FY2026-27-000010`. Payment record `ISB-RC-FY2026-27-000018` (Journal `ISB-RC-FY2026-27-000017`, dated `2026-11-12`) is the final and only active valid receipt.

### Question 2: Which receipt was incorrectly allocated or referenced?
**Answer:**
1. Initial payment `ISB-RC-FY2026-27-000016` (Journal `ISB-RC-000015`) was created without an invoice allocation (unallocated).
2. The first replacement `ISB-RC-FY2026-27-000017` (Journal `ISB-RC-000016`) correctly selected invoice `ISB-SI-000010`, but had its posting date set to `2026-11-16` instead of the invoice transaction date `2026-11-12`.

### Question 3: Whether the original receipt was reversed correctly?
**Answer:** Yes. Reversal Journal `ISB-RCR-FY2026-27-000003` was posted as Dr `1100` (Trade Receivables) Rs. 64,999 and Cr `1010` (Current Account) Rs. 64,999, completely neutralizing the unallocated receipt.

### Question 4: Whether a correction was posted?
**Answer:** Yes. After two rounds of reversal and re-drafting, the final valid correction was posted as Payment `ISB-RC-FY2026-27-000018` (Journal `ISB-RC-FY2026-27-000017`) dated `2026-11-12` with Rs. 64,999 allocated to invoice `ISB-SI-FY2026-27-000010`.

### Question 5: Whether any amount was duplicated?
**Answer:** No. In the General Ledger, the two reversed receipts (+64,999, +64,999) and the two reversals (-64,999, -64,999) net out to exactly zero. Only the final receipt (+64,999) remains active. In the subledger, `ISB-SI-FY2026-27-000010` has exactly one valid payment allocation under active payment status `POSTED`.

### Question 6: Whether the customer receivable was reduced correctly?
**Answer:** Yes. Trade Receivables (Account 1100) has an exact net reduction of Rs. 64,999.00 for this invoice.

### Question 7: Whether the bank account was debited or credited correctly?
**Answer:** Yes. Faysal Bank (GL 1010) was debited 3 times (+Rs. 194,997) and credited 2 times (-Rs. 129,998), yielding an exact net debit of +Rs. 64,999.00.

### Question 8: What the final valid posted balance should be?
**Answer:**
- Total Bank Net Impact for this receipt: **+Rs. 64,999.00**
- Sales Invoice SI-10 Balance: **Rs. 0.00 (Fully Paid)**
- Total Faysal Bank Live Balance across all 16 transactions: **Rs. 3,816.00**

---
© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
