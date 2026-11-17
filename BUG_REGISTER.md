# AXON MOBILE ERP — BUG REGISTER & RESOLUTION LOG

**Project:** AXON MOBILE ERP  
**Business:** Gondal Mobile Center  
**Audit Period:** November 2026  

---

## Logged Bugs & Investigation Registry

| Bug ID | Priority Phase | Module | Issue Description | Root Cause | Status | Resolution / Verification |
| :--- | :---: | :--- | :--- | :--- | :---: | :--- |
| **BUG-001** | P06 | Subledger Statements | Supplier `SUP-3414` (3 Star Mobile) opening balance of Rs. 140,475 was showing as Rs. 0 and negative closing balance on statement. | `getPartyStatement` previously only scanned `ACCOUNTS_PAYABLE` lines on non-OPENING vouchers, ignoring opening balance profile fields. | **Resolved** | Built `syncPartyOpeningBalance` double-entry handler creating balanced `OPENING` voucher (Credit 2000 Trade Payables, Debit 3000 Capital). Updated `subledger.ts`. Statement verified with exact Rs. 90,475 closing balance. |
| **BUG-002** | P07 | Bank Ledger | Bank ledger table lacked a line-by-line running balance and professional printable statement. | Bank transaction rows only showed deposit and withdrawal columns without chronological cumulative balance mapping. | **Resolved** | Added chronological `runningBalance` calculation in `banking-workspace.tsx` and created dedicated professional statement print page `/finance/banking/ledger/print`. Verified down to Rs. 3,816. |
| **BUG-003** | P02 | Product Creation | Model creation forced IMEI tracking for all cellular devices without allowing non-IMEI option for accessories or non-serialized products. | Frontend form locked tracking method whenever category was set to cellular. | **Resolved** | Added flexible tracking method selection (`IMEI`, `SERIAL_NUMBER`, `NONE` / `QUANTITY`) during product and variant creation. |
| **BUG-004** | P07 | Contra Vouchers | Contra vouchers screen previously labeled cash withdrawals as "Counter cash deposit into bank account". | Label was hardcoded to deposit narration regardless of voucher line direction. | **Resolved** | Fixed voucher direction classification based on journal debit/credit lines. Verified Debit 1000 Cash on Hand / Credit 1010 Current Account correctly displays as "Cash Withdrawal". |
| **BUG-005** | P06 | Customer & Supplier Profile | Customer and supplier master detail pages lacked tabbed navigation for fast inspection of invoices/bills, payments, running balance ledger, and aging. | Detail pages only showed a basic static table of recent documents without subledger running balance or aging tabs. | **Resolved** | Built full multi-tab CustomerProfileView and SupplierProfileView components with 6 interactive tabs (Overview, Invoices/Bills, Receipts/Payments, Running Balance Subledger, Aging & Open Items, Statement Preview). |
| **BUG-006** | P07 | Cash & Bank Transfers | Transfers between cash and bank previously lacked balance availability checks, risking unmonitored negative balances. | `POST /api/finance/banking/transfers` did not aggregate prior cash on hand or bank ledger transactions before posting transfer vouchers. | **Resolved** | Added liquidity checks in `transfers/route.ts` preventing transfers exceeding available balances unless authorized by user with override permission. |

---

## Open Defects Under Active Investigation
- None currently blocking. All verified defects above are resolved and committed.

