# Point of Sale (POS) — Accounting & General Ledger Audit
**Project:** Axon Mobile ERP  
**Module:** Financial Accounting & GL Integration  
**Audit Timestamp:** 2026-11-09T22:59:15+05:00  

---

## 1. Accounting Workflow for POS Sales

Every completed point of sale transaction impacts two primary financial areas:
1. **Commercial & Inventory Ledger:** Revenue recognition, output tax liability, cost of goods sold (COGS), and inventory asset relief.
2. **Settlement & Receivable Ledger:** Cash/Bank/Wallet settlement against customer accounts receivable.

---

## 2. GL Posting Logic Specification

### Scenario A: Full Immediate Cash / Bank / Wallet Sale
When an invoice is paid in full at the counter (e.g., Grand Total = Rs 60,000, Cash Paid = Rs 60,000):

1. **Commercial Sale Entry (`SalesInvoice`):**
   - **DR** Accounts Receivable (Control Account): `Rs 60,000.00`
   - **CR** Sales Revenue: `Rs 60,000.00` (less tax)
   - **CR** Output Tax Payable: Applicable tax amount (if configured)
   - **DR** Cost of Goods Sold: `Rs 52,000.00` (Acquisition Cost of Handset / Average Cost of Parts)
   - **CR** Inventory Asset: `Rs 52,000.00`

2. **Counter Receipt Entry (`Payment` allocated to Invoice):**
   - **DR** Cash on Hand / Bank / Mobile Wallet Account: `Rs 60,000.00`
   - **CR** Accounts Receivable (Control Account): `Rs 60,000.00`

**Net Customer Balance:** Rs 0 (settled).  
**Net Cash in Hand:** +Rs 60,000.  
**Both journals balance perfectly.**

---

### Scenario B: Credit Sale with Advance Down Payment
When a credit customer buys a handset with an advance (e.g. Grand Total = Rs 60,000, Advance Paid = Rs 14,750, Remaining Due = Rs 45,250):

1. **Commercial Sale Entry:**
   - **DR** Accounts Receivable: `Rs 60,000.00`
   - **CR** Sales Revenue: `Rs 60,000.00`
   - **DR** COGS / **CR** Inventory: Product Cost

2. **Advance Receipt Entry:**
   - **DR** Cash on Hand / Bank Account: `Rs 14,750.00`
   - **CR** Accounts Receivable: `Rs 14,750.00` (Ref: Settlement for Invoice)

**Net Customer Balance:** `Rs 45,250.00` (Remaining Receivable displayed on invoice & ledger).  
**Net Cash in Hand:** `+Rs 14,750.00` (immediately visible in Cash in Hand report).

---

## 3. Discrepancy Analysis (Why Cash in Hand Was Not Showing)

In the user's prior incident:
> `POS [CREDIT] · Advance Paid: Rs 14,750 via CASH (1000 · Cash on Hand) · Remaining Due: Rs 45,249. Counter checkout. PLEASE CHECK NOT SHOWIN IN CASH IN HAND`

### Root Cause Identified:
- `pos-workspace.tsx` created the `SalesInvoice` and posted it.
- Then it called `/api/payments` to create the advance payment voucher.
- The payment voucher was created with status `SUBMITTED`, but the subsequent approval or post call was blocked or failed due to Maker-Checker / status transition triggers!
- As a result, the receipt voucher stayed in `SUBMITTED` state (unposted) and **never posted its journal entry** to account `1000 · Cash on Hand`!
- The Cash in Hand report only queries posted journal entries, so the Rs 14,750 never appeared!

### Permanent Fix:
With the single atomic `/api/pos/checkout` endpoint:
- The payment voucher and its journal entry are created and posted in the exact same database transaction as the sales invoice.
- If the payment fails to post to GL, the entire checkout rolls back.
- If the checkout succeeds, cash in hand is 100% guaranteed to reflect the cash received immediately.
