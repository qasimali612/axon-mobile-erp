# Customer and Supplier Statements & Aging

**Released:** 2026-10-28

Open **Finance → Party statements & aging**. Access requires `CUSTOMER_LEDGER_VIEW` and/or `SUPPLIER_LEDGER_VIEW`; branch scope is enforced server-side.

## Register

- Switch between customer receivables and supplier payables.
- Select an as-of date and optionally search by code, name, or phone.
- Aging buckets show current, 1–30, 31–60, 61–90, and over-90-day source-document balances.
- **Ledger balance** is authoritative and comes from posted/reversed AR or AP control-account journal lines.
- **Residual** reconciles the control-account balance to open source documents. It transparently carries opening balances, on-account/unallocated settlements, and other valid party control-account activity instead of forcing those amounts into an invoice aging bucket.

## Statement

Open a party to select a date range and view:

- opening control-account balance;
- dated voucher activity with debit, credit, and running balance;
- branch and source-document drill-down;
- closing balance;
- open invoices/receipts, source-linked returns, posted allocations, due dates, and days past due;
- CSV export and browser print.

Customer balance is presented as debit minus credit (positive = receivable). Supplier balance is presented as credit minus debit (positive = payable). Negative balances represent party credits/debits rather than being hidden.

Historical statements include original journals marked `REVERSED` plus their posted reversal journals, preserving exact accounting chronology. Effective document reversals are excluded from open-item aging as of the reversal posting date.

## Verification

Run `npm run test:party-subledger-acceptance`. It validates access denial, both ledger directions, summary totals, running balances, open-item plus residual reconciliation, CSV export, and authenticated page rendering.
