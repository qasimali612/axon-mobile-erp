# Permission and segregation matrix

`V` view, `C` create/prepare, `A` approve, `P` post/settle, `R` reverse/reopen, `X` export, `M` configuration. A dash means no grant in the development role template. Production grants require business-owner review.

| Authority | Owner | Administrator | Accountant | Finance Controller | GL Posting Officer | Treasury Officer | Auditor | Cashier |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Finance dashboard | V | — | V | V | V | V | V | — |
| Chart of accounts view | V | — | V | V | V | V | V | — |
| Chart of accounts create/edit | M | — | M | — | — | — | — | — |
| Journal create/submit | C | — | C | — | — | — | — | — |
| Journal approve | A | — | — | A | — | — | — | — |
| Journal post | P | — | — | — | P | — | — | — |
| Journal reverse | R | — | — | — | R | — | — | — |
| Payment create | C | — | C | — | — | — | — | C |
| Payment approve | A | — | — | A | — | — | — | — |
| Payment post/settle | P | — | — | — | — | P | — | — |
| Payment reverse | R | — | — | A | — | R | — | — |
| Bank account configuration | M | — | M | — | — | — | — | — |
| Bank reconciliation prepare | C | — | C | — | — | C | — | — |
| Bank reconciliation complete/reopen | A/R | — | — | A/R | — | — | — | — |
| Fixed asset create | C | — | C | — | — | — | — | — |
| Depreciation post | P | — | — | — | P | — | — | — |
| Asset disposal approve | A | — | — | A | — | — | — | — |
| Incentive plan/calculate | M/C | — | M/C | — | — | — | — | — |
| Incentive approve/accrue | A | — | — | A | — | — | — | — |
| Incentive pay/receive | P | — | — | — | — | P | — | — |
| Rebate plan/calculate | M/C | — | M/C | — | — | — | — | — |
| Rebate approve/accrue | A | — | — | A | — | — | — | — |
| Rebate pay/receive | P | — | — | — | — | P | — | — |
| Budget create/revise | C | — | C | — | — | — | V | — |
| Budget approve | A | — | — | A | — | — | V | — |
| Period close request | C | — | C | — | — | — | V | — |
| Period close approve | A | — | — | A | — | — | V | — |
| Period reopen | R | — | — | — | — | — | V | — |
| Opening balance import | C | — | C | — | — | — | V | — |
| Opening balance approve | A | — | — | A | — | — | V | — |
| Opening balance post | P | — | — | — | P | — | V | — |
| Financial statement view | V | — | V | V | V | V | V | — |
| Financial export | X | — | — | X | — | — | X | — |
| Financial register export (budgets, assets, incentives, rebates) | X | — | — | X | — | — | X | — |
| Operational report export (CSV) | X | — | X | X | — | — | X | — |
| Report hub and print layouts | V | — | V | V | V | V | V | V |
| Audit view | V | V | V | V | V | V | V | — |

## Commercial control and delivery grants

These grants were added with the approval-band, discount-cap, credit-override, output and schedule
features. They are deliberately narrow — no accounting or posting role holds them.

| Permission | Roles that hold it | What it unlocks | Guard rails |
| --- | --- | --- | --- |
| `policy.manage` | `OWNER`, `ADMINISTRATOR` | Create/edit/pause approval bands; set the sales discount cap | Every change is audited with before/after values; refused for accountants |
| `sales.discount.override` | `OWNER`, `ADMINISTRATOR`, `BRANCH_MANAGER`, `SALES_MANAGER` | Submit an invoice whose discount exceeds the configured cap | Requires a written reason (≥10 characters) and writes `DISCOUNT_CAP_OVERRIDDEN` |
| `customer.credit.override` | `OWNER`, `ADMINISTRATOR`, `BRANCH_MANAGER`, `SALES_MANAGER` | Approve an invoice that breaches the customer's credit limit | Reason required; writes `CREDIT_LIMIT_OVERRIDDEN` with outstanding, invoice total and limit |
| `report.export` | `OWNER`, `ADMINISTRATOR` | Report schedules (create, run, pause, delete) and their deliveries | Runs re-enter the audited CSV endpoint with the caller's own scope |
| `inventory.device.view` | Every operational role | IMEI registry and the device label sheet | Labels carry the same identifiers posted by receiving |

Amount-banded approvals are additive: when two active bands cover one amount, the acting user must hold
**both** required permissions. A band never removes an existing maker–checker–poster check, and it never
lets an approver substitute for a poster.

## Enforcement rules

1. UI visibility is convenience only; every API validates the exact permission and company/branch scope.
2. Company-wide configuration rejects grants that exist only through a branch-scoped assignment.
3. A journal preparer cannot approve it; its poster must differ from both preparer and approver.
4. A period close requester cannot approve that close; the closing user cannot reopen it.
5. Export checks its own authority and writes an append-only audit event.
6. Posted records never become editable because a user has configuration permission.
7. Owner access does not bypass maker-checker-poster identity checks.
8. Production role assignment must avoid combining conflicting roles for one user.

## Reporting and export grants

Exports are generated on the server and audited, so the grant — not the screen — decides what leaves
the system:

* `FINANCIAL_REPORTS_EXPORT` is required for trial balance, financial statements and every finance
  register export (`/api/finance/exports/{budgets|incentives|rebates|assets}`). The role must also hold
  the module view permission; holding the export grant alone is not enough.
* Operational reports use `report.purchase`, `report.sales`, `report.inventory` and
  `report.profitability`. Cost and margin columns are additionally gated by `catalog.cost.view`.
* Print layouts follow the module view permission and require an authenticated session; an anonymous
  request is redirected to the login screen.
* Every export writes an audit event (`OPERATIONAL_REPORT_EXPORTED`, `FINANCIAL_STATEMENTS_EXPORTED`,
  `FINANCE_REGISTER_EXPORTED`), so auditors can see who extracted what and when.
