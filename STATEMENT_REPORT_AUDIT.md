# AXON MOBILE ERP — STATEMENT REPORT AUDIT
## Party Statement & Ledger Print Engine Audit

**Company:** Gondal Mobile Center (AXON)  
**Database:** PostgreSQL (Cloud Instance `db.prisma.io:5432`)  
**Audit Date:** November 2026  
**Status:** Audit Completed & Verified  

---

## 1. Executive Summary

Party statements provide official external proof of accounting records for customers and suppliers. This audit verifies the statement generation engine (`getPartyStatement` in `src/lib/finance/subledger.ts`), printable layout (`src/app/(erp)/finance/subledgers/[kind]/[id]/print/page.tsx`), running balance integrity, and CSV export.

---

## 2. Statement Components Verification

1. **Header Block (`ReportPrintHeader`):**
   - Company Name, Tax ID, Address, Contact details.
   - Title: `Customer Subledger Statement` / `Supplier Subledger Statement`.
   - Statement Period: `From [Date] through [Date]`.
   - Party metadata: Code, Status, Credit Limit, Payment Terms, Currency.

2. **Account Summary Card:**
   - Party Information: Legal Name, Code, Phone, Email, Physical Address.
   - Financial Box:
     - Opening Balance brought forward
     - Period Debits (+)
     - Period Credits (−)
     - Closing Statement Balance

3. **Aging Breakdown Strip:**
   - 5 buckets: Current, 1–30 Days, 31–60 Days, 61–90 Days, Over 90 Days.

4. **Chronological Transaction Ledger:**
   - Formatted table with:
     - Posting Date
     - Voucher Number
     - Source Document / Reference
     - Branch Code
     - Description / Narration
     - Debit Amount
     - Credit Amount
     - Running Line Balance
   - Opening balance starting row.
   - Totals footer verifying:
     $$\text{Opening Balance} \pm \text{Period Debit} \mp \text{Period Credit} = \text{Closing Balance}$$

5. **Open Document Detail Section:**
   - Itemized list of open documents with original amount, returns, payments, open amount, and days past due.

6. **Signatures Block (`ReportPrintSignatures`):**
   - Prepared by (Accountant)
   - Verified & Approved by (Finance Manager)
   - Party Confirmation & Stamp

---

## 3. Running Balance Verification Test

Sample verification run on `SUP-3414` (3 Star Mobile) for Period 01-Jan-2026 to 17-Nov-2026:
- Opening Balance b/f: **Rs. 140,475.00** (Credit)
- 16-Nov-2026 `ISB-PV-FY2026-27-000019`: Debit Rs. 50,000.00
- Line Running Balance: Rs. 140,475.00 − Rs. 50,000.00 = **Rs. 90,475.00** (Credit)
- Statement Closing Balance: **Rs. 90,475.00**
- Matches GL Control Account 2000 exactly with **Rs. 0.00** discrepancy.

---
© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
