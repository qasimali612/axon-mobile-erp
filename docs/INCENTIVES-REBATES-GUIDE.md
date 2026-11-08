# Incentives and Rebates Guide

Two finance modules that turn **committed operational documents** into **accrued liabilities or
receivables**, and only then into **cash**:

| Module | Eligibility source | Accrual | Settlement |
| --- | --- | --- | --- |
| Incentives (payable) | Posted sales invoices net of posted sales returns, by salesperson/customer/branch | Dr incentive expense / Cr incentive payable | Dr payable / Cr cash or bank |
| Supplier incentives (receivable) | Manually entered claim backed by supplier program evidence | Dr receivable / Cr income | Dr cash or bank / Cr receivable |
| Rebates (supplier, receivable) | Posted purchase receipts for the program's supplier | Dr receivable / Cr income (or cost-reduction income) | Dr cash or bank / Cr receivable |
| Rebates (customer, payable) | Posted sales invoices for the program's customer, net of posted returns | Dr rebate expense / Cr payable | Dr payable / Cr cash or bank |

No module recognises revenue or cost twice: documents create eligibility, journals create the
accrual, and settlement only clears the accrual against cash.

---

## 1. Permissions

| Permission | Grants | Purpose |
| --- | --- | --- |
| `INCENTIVE_VIEW` / `REBATE_VIEW` | All finance readers | Register and workspace |
| `INCENTIVE_PLAN_MANAGE` | Accountant, Owner, Super Admin | Create/edit incentive plans |
| `INCENTIVE_CALCULATE` | Accountant | Run calculations, record adjustments |
| `INCENTIVE_APPROVE` | Finance Controller, Owner | Approve, accrue, reverse |
| `INCENTIVE_PAY` | Owner | Pay an accrued incentive |
| `INCENTIVE_RECEIVABLE_CREATE` | Accountant | Create supplier incentive claims |
| `INCENTIVE_RECEIVABLE_APPROVE` | Finance Controller, Owner | Approve and accrue claims |
| `INCENTIVE_RECEIVE` | Owner | Record supplier incentive receipts |
| `REBATE_MANAGE` | Accountant, Owner | Create programs, run calculations |
| `REBATE_APPROVE` | Finance Controller, Owner | Approve and accrue rebates |
| `REBATE_PAY` / `REBATE_RECEIVE` | Owner | Settle customer rebates / receive supplier rebates |

Every endpoint re-checks permission server-side; the workspace receives boolean flags so it never
offers an action the API would reject.

**Maker–checker.** `IncentiveCalculation.calculatedById`, `ReceivedIncentive.preparedById` and
`RebateCalculation.calculatedById` record the maker. Approval by that same user returns
`409 MAKER_CHECKER_REQUIRED`. Accrual and settlement journals are posted through the shared
system-journal writer, which independently rejects a posting officer equal to the recorded preparer.
Reversal of an accrual is likewise blocked for the officer who approved it.

---

## 2. Incentive plans

| Field | Rule |
| --- | --- |
| `code` | Immutable after creation, unique per company |
| `effectiveFrom` / `effectiveTo` | Calculation period must fall inside |
| `recipientType` | `USER` (salesperson), `CUSTOMER`, `BRANCH` |
| `branchId` | Optional scope; when set, only that branch's sales count and the calculation carries the branch |
| `incentiveType` | `PERCENT_NET_SALES`, `SALES_TARGET`, `BRANCH_TARGET`, `FIXED_PER_UNIT` (other enum members are rejected explicitly) |
| `rate` | Required for percentage types, 0 < rate ≤ 100, up to 6 decimals |
| `fixedAmount` | Required for `FIXED_PER_UNIT` |
| `minimumTarget` | Net-sales threshold for percentage types, quantity threshold for per-unit |
| `maximumIncentive` | Optional cap applied after the rule |
| `returnAdjustmentRule` | `REVERSE` (default, deducts posted sales returns) or `IGNORE` |
| `expenseAccountId` | Must be an active `EXPENSE` account |
| `payableAccountId` | Must be an active `LIABILITY` account |

Calculation math:

* `PERCENT_NET_SALES` — `rate% × net sales` when `net sales ≥ minimumTarget`, otherwise 0 with
  `ineligibilityReason = BELOW_MINIMUM_TARGET`.
* `SALES_TARGET` / `BRANCH_TARGET` — `rate% × (net sales − minimumTarget)` when above target.
* `FIXED_PER_UNIT` — `fixedAmount × net quantity` when quantity ≥ `minimumTarget`.
* `maximumIncentive` caps the result (`capped: true` is stored in `calculationDetails`).

"Net sales" = `Σ(subtotal − discountTotal)` of posted invoices minus the same measure of posted
`SALES_RETURN` documents that reference those invoices. Tax is excluded. Invoices whose net is
zero or negative contribute nothing.

---

## 3. Calculation, approval, accrual, payment

| Step | Endpoint | Effect |
| --- | --- | --- |
| Calculate | `POST /api/finance/incentives/plans/{id}/calculate` | Creates one `CALCULATED` row per (recipient, branch) for the period; re-running the same period returns `created: 0, skipped: n` |
| Adjust | `POST /api/finance/incentives/calculations/{id}/adjust` | Records a signed adjustment and reason while `CALCULATED` |
| Approve | `POST …/{id}/approve` | `APPROVED`, `approvedAmount = calculated + adjustment`, approver recorded, maker rejected |
| Accrue | `POST …/{id}/accrue` | Posts Dr expense / Cr payable, creates `IncentivePayable` with the journal voucher number, status `ACCRUED` |
| Pay | `POST /api/finance/incentives/payables/{id}/pay` | Resolves the payment method to a cash or bank ledger account, posts Dr payable / Cr cash-or-bank, updates paid/outstanding and status `PARTIALLY_PAID`/`PAID` |
| Reverse | `POST …/{id}/reverse` | Only while `ACCRUED` with no payments; posts the mirror journal and marks the payable `REVERSED` |

Guards: overpayment (`422 PAYMENT_EXCEEDS_OUTSTANDING`), double accrual (`409`), accruing a
non-approved row (`409`), inactive payment method (`409`), missing reference for a method that
requires one (`422`), settlement account binding enforced.

## 4. Supplier incentives (income)

`POST /api/finance/incentives/received` creates a `DRAFT` claim (payer, program, period, target and
achieved quantity, eligible amount, income and receivable accounts — must be `REVENUE` and `ASSET`).

* `POST …/received/{id}/approve` posts Dr receivable / Cr income and sets `ACCRUED` with the
  approved amount and outstanding balance. The preparer cannot approve.
* `POST …/received/{id}/receive` posts Dr cash-or-bank / Cr receivable, updating
  `receivedAmount`/`outstandingAmount` and status `PARTIALLY_RECEIVED`/`RECEIVED`.

## 5. Rebate programs

| Field | Rule |
| --- | --- |
| `direction` | `RECEIVABLE` (supplier grants) or `PAYABLE` (customer earns) |
| Party | A supplier is mandatory for `RECEIVABLE`, a customer for `PAYABLE`; the other side must be empty |
| `calculationMethod` | `PERCENT_OF_VALUE`, `PER_UNIT`, `FIXED_AMOUNT` |
| `primaryAccountId` | `REVENUE` for receivable programs, `EXPENSE` for payable programs |
| `settlementAccountId` | `ASSET` (rebate receivable) or `LIABILITY` (rebate payable); must differ from primary |
| `accountingTreatment` | `INCOME` for receivable, `COST_REDUCTION` for payable |

Eligibility: posted purchase receipts for the supplier (`subtotal − discountTotal − documentDiscount`)
or posted sales invoices for the customer (net of posted returns), inside the period and the program's
effective dates. One calculation per program and period (duplicate returns `409
DUPLICATE_REBATE_CALCULATION`); no qualifying documents returns `422 NO_ELIGIBLE_DOCUMENTS`.

Accrual posts per direction:

* `RECEIVABLE` — Dr settlement (receivable) / Cr primary (income); creates `RebateReceivable`.
* `PAYABLE` — Dr primary (expense) / Cr settlement (payable); creates `RebatePayable`.

Settlement is a single `POST /api/finance/rebates/calculations/{id}/settle` endpoint that requires
`REBATE_RECEIVE` for receivable programs and `REBATE_PAY` for payable programs; it posts the mirror
journal, writes `RebateReceipt`/`RebatePayment`, and moves the calculation to
`PARTIALLY_SETTLED`/`SETTLED`.

---

## 6. Workspaces

* `/finance/incentives` — KPI strip (accrued, paid, outstanding payable, supplier incentive due),
  tabs for payable incentives, plans and supplier claims; plan editor, calculation dialog,
  adjustment dialog, payment dialog, claim dialogs. Actions respect permission *and* maker state
  (“Awaiting independent approval” instead of an approve button).
* `/finance/rebates` — KPI strip (receivable outstanding, payable outstanding, accrued, settled),
  program and calculation tabs, program editor, calculation dialog and settlement dialog.

Both handle loading, empty and error states and surface the exact server error message.

---

## 7. Journal conventions

| Event | `sourceModule` | `sourceDocumentType` | Number suffix | Cash-flow |
| --- | --- | --- | --- | --- |
| Incentive accrual | `INCENTIVE` | `INCENTIVE_ACCRUAL` | `INC` | Operating |
| Incentive payment | `INCENTIVE` | `INCENTIVE_PAYMENT` | `INCP` | Operating |
| Incentive accrual reversal | `INCENTIVE` | `INCENTIVE_ACCRUAL_REVERSAL` | `INCR` | Operating |
| Supplier incentive accrual | `INCENTIVE` | `RECEIVED_INCENTIVE_ACCRUAL` | `RIC` | Operating |
| Supplier incentive receipt | `INCENTIVE` | `RECEIVED_INCENTIVE_PAYMENT` | `RIR` | Operating |
| Rebate accrual | `REBATE` | `REBATE_RECEIVABLE_ACCRUAL` / `REBATE_PAYABLE_ACCRUAL` | `RBR` / `RBP` | Operating |
| Rebate settlement | `REBATE` | `REBATE_RECEIPT` / `REBATE_PAYMENT` | `RBRC` / `RBPM` | Operating |

Every voucher is balanced, one-sided per line, posted inside the caller's serializable transaction,
and keyed by `${sourceDocumentType}:${sourceDocumentId}:${postingDate}` so a retry cannot double-post.

---

## 8. Acceptance evidence

| Suite | Command | Groups | Latest evidence |
| --- | --- | --- | --- |
| Incentives | `npm run test:incentives-acceptance` | 10 | `MVTR234I`, `MVTR26RZ` |
| Rebates | `npm run test:rebates-acceptance` | 8 | `MVTRRJK8`, `MVTRRNT9` |

Both suites recompute expected eligibility **independently** from the database (posted invoices,
returns, purchase receipts) and compare it with the API result, then exercise approval, accrual,
partial/full settlement, over-settlement rejection, permission denials, audit events and the
authenticated page render. Run-suffixed plan/program codes keep every run isolated.

Regression suites re-run after this phase: fixed assets (11 groups), budgets (9 groups), banking
(completed reconciliation), and `npx vitest run` (50 tests) — all green.

---

## 9. Known limits

* Incentive types `MODEL_WISE`, `BRAND_WISE`, `QUANTITY_SLAB`, `DEALER` and `CAMPAIGN` remain in the
  enum but are rejected by validation; they need product/brand/slab rule engines.
* Rebates support single-rate rules; tiered or retroactive slabs are not implemented.
* Supplier incentive claims are entered, not auto-derived from supplier debit notes.
* No settlement scheduling or aging bucket report yet for open incentive/rebate items; the payable
  and receivable registers expose outstanding balances for that purpose.
