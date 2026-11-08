# Accounting posting matrix

All amounts use database fixed-point decimals. “Post” means one atomic database transaction containing the source status change, inventory effect where applicable, subledger dimensions, balanced journal, bank row where applicable, idempotency record, and audit event.

| Business event | Debit | Credit | Required dimensions | Posting point | Reversal / return treatment |
|---|---|---|---|---|---|
| Cash sale | Cash or bank | Sales revenue; tax payable | Branch, salesperson, customer when identified | Sales invoice posting | Reverse revenue/tax and restore stock through linked return |
| Credit sale | Trade receivables | Sales revenue; tax payable | Customer, branch, salesperson, invoice, due date | Sales invoice posting | Credit note / return journal; never edit invoice |
| Sale inventory issue | Cost of goods sold | Inventory | Product, variant, warehouse, movement, source invoice | Same transaction as sale | Reverse COGS and inventory through return movement |
| Customer receipt | Cash or bank | Trade receivables | Customer, invoice allocation, bank | Approved receipt posting | Reverse receipt and allocation with linked voucher |
| Customer refund | Customer refund / receivable | Cash or bank | Customer, return, bank | Approved refund posting | Linked reversal only |
| Goods receipt before supplier invoice | Inventory or receipt accrual | Goods-received clearing | Supplier, receipt, product, warehouse | Goods receipt posting | Supplier-return movement and reversing journal |
| Supplier invoice for received goods | Goods-received clearing; recoverable tax | Trade payables | Supplier, invoice, due date, receipt | Supplier invoice posting | Supplier debit note / linked reversal |
| Direct expense invoice | Expense or asset; recoverable tax | Trade payables | Supplier, cost center, department, invoice, due date | Supplier invoice posting | Linked debit note / reversal |
| Supplier payment | Trade payables | Cash or bank | Supplier, invoice allocation, bank | Approved payment posting | Reverse payment/allocation; no second expense |
| Inventory adjustment gain | Inventory | Inventory adjustment gain | Product, warehouse, approved count | Approved adjustment posting | Opposite adjustment with reason |
| Inventory adjustment loss | Inventory adjustment loss | Inventory | Product, warehouse, approved count | Approved adjustment posting | Opposite adjustment with reason |
| Inter-warehouse transfer | No P&L; movement-only unless in-transit accounting is configured | No P&L | From/to warehouse, product, physical unit | Dispatch/receipt per configured transit policy | Reverse movement sequence, not quantity overwrite |
| Fixed-asset acquisition paid immediately | Fixed asset cost | Cash or bank | Asset, category, branch, supplier, bank | Asset capitalization | Disposal or authorized reversal |
| Fixed-asset acquisition on credit | Fixed asset cost | Trade payables | Asset, category, branch, supplier, invoice | Asset capitalization | Supplier debit note / asset reversal |
| Periodic depreciation | Depreciation expense | Accumulated depreciation | Asset, category, branch, department, period | Approved schedule posting | Linked schedule reversal in open period |
| Asset impairment | Impairment loss | Accumulated impairment / asset | Asset, approval, valuation evidence | Approved impairment posting | Authorized reversal where accounting policy permits |
| Asset disposal for cash | Cash; accumulated depreciation | Asset cost; gain on disposal (or debit loss) | Asset, disposal approval, bank | Disposal posting | Separate authorized correction; original remains |
| Incentive payable accrual | Incentive expense | Accrued incentive payable | Plan, recipient, period, calculation | Calculation approval | Reverse accrual for return/eligibility correction |
| Incentive payment | Accrued incentive payable | Cash or bank | Payable, recipient, bank | Approved settlement | Reverse settlement only; do not book expense again |
| Supplier incentive receivable accrual | Incentive receivable | Incentive income or configured contra-cost | Plan, supplier, period, calculation | Receivable approval | Reverse accrual on disallowance |
| Supplier incentive receipt | Cash or bank | Incentive receivable | Receivable, supplier, bank | Approved settlement | Reverse receipt only; do not book income again |
| Supplier rebate receivable accrual | Rebate receivable | Inventory/COGS reduction or rebate income per policy | Program, supplier, eligible purchases/products, period | Calculation approval | Reverse accrual on return/disallowance |
| Supplier rebate receipt | Cash or bank | Rebate receivable | Receivable, supplier, bank | Approved settlement | Reverse receipt only |
| Customer/dealer rebate accrual | Rebate expense or revenue contra | Rebate payable | Program, customer/dealer, eligible net sales, period | Calculation approval | Return adjustment reverses eligible accrual |
| Customer/dealer rebate payment | Rebate payable | Cash or bank | Payable, party, bank | Approved settlement | Reverse settlement only |
| Bank fee from statement | Bank fee expense | Bank | Bank, statement line, cost center | Approved reconciliation adjustment | Linked reversal |
| Bank interest income | Bank | Interest income | Bank, statement line | Approved reconciliation adjustment | Linked reversal |
| Opening balances | Asset/expense debit balances | Liability/equity/revenue credit balances | Account and required subledger detail | Approved opening batch | Authorized full or line-specific reversing journal |
| Expense accrual | Expense | Accrued liability | Cost center, department, period | Accrual approval | Auto/manual reversal in designated open period |
| Prepayment | Prepaid asset | Cash, bank, or payable | Supplier, schedule, cost center | Invoice/payment posting | Amortize by schedule; reverse correction only |
| Prepayment amortization | Expense | Prepaid asset | Schedule, cost center, period | Schedule posting | Linked reversal |
| Year-end income close | Revenue accounts; retained earnings for loss | Expense/COGS accounts; retained earnings for profit | Fiscal year, closing approval | Year-end close | Reopen plus authorized reversing close journal |

## Posting controls

1. Source account mappings are configuration, not request-supplied free text.
2. Manual journals cannot post directly to protected control accounts.
3. A preparer cannot approve; a poster differs from both preparer and approver.
4. A settlement cannot exceed the accrued outstanding amount.
5. Returns reduce eligible incentive/rebate bases according to effective-dated plan rules.
6. Original posted lines remain queryable after reversal; reports include both original and opposite voucher.
7. Bank transaction rows are generated from bank-dimension journal lines, never entered as disconnected balances.
8. The balance sheet exposes its exact difference. A suspense plug is prohibited unless a real, approved suspense transaction exists.
