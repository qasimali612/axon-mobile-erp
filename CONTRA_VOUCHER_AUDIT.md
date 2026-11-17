# CONTRA VOUCHERS & TRANSFERS AUDIT
**Company:** Gondal Mobile Center  
**Branch:** ISB – Islamabad  
**Audit Target:** Contra Vouchers (`ISB-JV-02, 04, 05, 06`)  

---

## 1. INVESTIGATION OF VOUCHERS

### 1. Cash Deposit: `ISB-JV-FY2026-27-000002` (Rs. 24,799.00)
- **Posting Date:** 2026-11-14
- **Source Module:** `CASH_DEPOSIT`
- **Narration:** "Counter cash deposit into bank account"
- **Double-Entry Journal Lines:**
  - **Debit:** `1010 – Current Account` (Faysal Bank) = **Rs. 24,799.00**
  - **Credit:** `1000 – Cash on Hand` = **Rs. 24,799.00**
- **Audit Verification:**
  - Cash on Hand decreased by Rs. 24,799.00.
  - Faysal Bank increased by Rs. 24,799.00.
  - No revenue or expense accounts touched.
  - Direction verified: **Cash → Bank (Deposit)**.

---

### 2. Cash Withdrawals: `ISB-JV-04`, `ISB-JV-05`, `ISB-JV-06`
In historical UI views, these vouchers were labeled with the default string *"Counter cash deposit into bank account"*. The audit investigated the posted journal lines to determine the true accounting direction.

#### Voucher 1: `ISB-JV-FY2026-27-000004` (Rs. 110,000.00)
- **Source Module:** `CASH_WITHDRAWAL`
- **Debit:** `1000 – Cash on Hand` = **Rs. 110,000.00** (+Cash)
- **Credit:** `1010 – Current Account` = **Rs. 110,000.00** (-Bank)

#### Voucher 2: `ISB-JV-FY2026-27-000005` (Rs. 65,000.00)
- **Source Module:** `CASH_WITHDRAWAL`
- **Debit:** `1000 – Cash on Hand` = **Rs. 65,000.00** (+Cash)
- **Credit:** `1010 – Current Account` = **Rs. 65,000.00** (-Bank)

#### Voucher 3: `ISB-JV-FY2026-27-000006` (Rs. 51,000.00)
- **Source Module:** `CASH_WITHDRAWAL`
- **Debit:** `1000 – Cash on Hand` = **Rs. 51,000.00** (+Cash)
- **Credit:** `1010 – Current Account` = **Rs. 51,000.00** (-Bank)

### Total Withdrawn:
$$\text{Total Withdrawn into Cash Drawer} = 110,000 + 65,000 + 51,000 = \mathbf{\text{Rs. 226,000.00}}$$

---

## 2. ROOT CAUSE & UI/UX RESOLUTION

1. **Root Cause:** When the vouchers were initially drafted, the UI modal used a static preset narration `"Counter cash deposit into bank account"` for all contra types. The table in `banking-workspace.tsx` rendered `{t.narration}` as the main label, leading to the display of "Counter cash deposit" on cash withdrawal vouchers.
2. **Resolution Applied in `banking-workspace.tsx`:**
   - Added transaction direction badges: `Cash Withdrawal (Bank → Cash)` in blue and `Cash Deposit (Cash → Bank)` in green.
   - Displayed explicit accounting entries: `Dr 1000 (Cash on Hand) · Cr 1010 (Current Account)`.
   - Updated `TransferModal` to dynamically update default narrations when switching between Deposit, Withdrawal, and Transfer tabs.

---
© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
