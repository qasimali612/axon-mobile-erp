# Budgets Module Guide

Versioned fiscal budgeting for AXON Mobile ERP: prepare, submit, approve, revise, close and measure
budgets against posted ledger actuals — with one live approved version per budget code.

---

## 1. Purpose and scope

The budgets module answers two questions for every planning period:

1. **What did we plan?** Versioned budgets by fiscal year, branch, department and cost centre,
   broken into account × accounting-period lines.
2. **How are we doing?** Variance between the approved budget and the **posted** journals that fall
   in the same branch / department / cost-centre scope and the same accounting period.

Budgets are planning records. They are **not** ledger documents: creating, editing, approving,
revising or closing a budget never creates a journal entry and never changes account balances. The
only link to accounting is the read-only variance calculation, which queries posted journal lines.

---

## 2. Data model

| Table | Purpose | Key columns |
| --- | --- | --- |
| `Budget` | Budget version header | `companyId`, `fiscalYearId`, `branchId?`, `departmentId?`, `costCenterId?`, `code`, `name`, `version`, `status`, `totalAmount`, `currencyCode`, `preparedById`, `submittedAt`, `approvedById`, `approvedAt`, `closedAt`, `createdById` |
| `BudgetLine` | Normalized account × period amount | `budgetId`, `accountId`, `periodId`, `amount` `Decimal(19,4)`, `notes` |
| `AccountingPeriod` | Authoritative period window | `fiscalYearId`, `number`, `name`, `startDate`, `endDate`, `status` |

Constraints that carry business meaning:

* `@@unique([companyId, code, version])` — a version number cannot be reused for the same code.
* `@@unique([budgetId, accountId, periodId])` — one amount per account per period per version.
* Index `Budget_companyId_code_version_idx` supports the version register and “latest version” lookups.
* `createdById` records the preparer independently of `preparedById`, so audit trails survive
  administrative reassignment and maker–checker can be evaluated on the actual creator.

Migration: `prisma/migrations/20261028001500_budget_workflow`.

---

## 3. Permissions

| Permission | Granted to | Controls |
| --- | --- | --- |
| `BUDGET_VIEW` | Accountant, Finance Controller, Owner, Super Admin (read-only roles via `financeReadOnly`) | Register, detail, variance |
| `BUDGET_CREATE` | Accountant, Owner, Super Admin | Create draft, edit draft, submit, revise |
| `BUDGET_APPROVE` | Finance Controller, Owner, Super Admin | Approve, close |

Permissions are checked server-side on every endpoint (`requirePermission`) and again on page
render (`requirePagePermission("BUDGET_VIEW")`). The workspace receives boolean flags so the UI
never offers an action the API would reject.

**Maker–checker:** the preparer of a version (`createdById`) can never approve that same version.
Attempting it returns `409 MAKER_CHECKER_REQUIRED`. The workspace shows such versions as
“Awaiting independent approval” instead of exposing an approve button.

---

## 4. Lifecycle

```
                 revise (cloned)                     approve
  ┌──────────┐   ┌──────────────┐   submit   ┌────────────┐   ┌───────────┐
  │  DRAFT   │──▶│ new DRAFT v+1│            │ SUBMITTED  │──▶│ APPROVED  │
  └────┬─────┘   └──────────────┘            └────────────┘   └─────┬─────┘
       │ edit / delete lines                                        │ close
       │                       previous APPROVED of same code ──▶ REVISED
       ▼                                                           ▼
   (still DRAFT)                                              ┌───────────┐
                                                              │  CLOSED   │
                                                              └───────────┘
```

| Transition | Endpoint | Preconditions | Failure codes |
| --- | --- | --- | --- |
| Create draft | `POST /api/finance/budgets` | Valid header + ≥1 valid line | `422` validation, `409 DUPLICATE_BUDGET_VERSION` |
| Edit draft | `PATCH /api/finance/budgets/{id}` | Status `DRAFT`; header + full line replacement | `409 INVALID_BUDGET_STATE` |
| Submit | `POST …/{id}/submit` | `DRAFT`, ≥1 line, total > 0 | `422 BUDGET_LINES_REQUIRED`, `422 BUDGET_TOTAL_REQUIRED` |
| Approve | `POST …/{id}/approve` | `SUBMITTED`, approver ≠ preparer | `409 MAKER_CHECKER_REQUIRED`, `409 INVALID_BUDGET_STATE` |
| Revise | `POST …/{id}/revise` | Source version `APPROVED`/`REVISED`/`CLOSED`, no open (`DRAFT`/`SUBMITTED`) version of the same code | `409 OPEN_BUDGET_VERSION` |
| Close | `POST …/{id}/close` | `APPROVED` or `REVISED` | `409 INVALID_BUDGET_STATE` |
| Variance | `GET …/{id}/variance` | Any status | `404 BUDGET_NOT_FOUND` |

### Approval supersession

Approving a version atomically marks every other `APPROVED` version of the same `code` as
`REVISED`, so exactly one version remains live per budget code. The superseded version keeps its
lines, approver and audit trail for historical variance review.

### Revision cloning

`revise` copies the header (fiscal year, branch, department, cost centre, currency, name) and every
line into `version + 1` with status `DRAFT`, `submittedAt`/`approvedById`/`closedAt` cleared.
Only one open version per code may exist at a time.

---

## 5. Validation rules (server-side, authoritative)

Header:

* `code` — 1–40 chars, `[A-Za-z0-9._-]`, uppercased; unique per company + version.
* `name` — 2–160 chars.
* `fiscalYearId` must belong to the company; `branchId`, `departmentId`, `costCenterId` are optional
  scoping dimensions and must belong to the company when provided.
* `currencyCode` must equal the company currency.

Lines:

* At least one line; account must be an **active** account of the same company.
* Period must belong to the selected fiscal year (a foreign-year period is rejected with `422`).
* `amount` — non-negative, up to 4 decimals, `Decimal(19,4)`; client-side totals are display-only
  and the server recomputes `totalAmount`.
* Duplicate `(accountId, periodId)` pairs inside one version are rejected.

All writes run in `Serializable` transactions with `SELECT … FOR UPDATE` on the header row, so
concurrent edits cannot interleave line replacement or double-approve a version.

---

## 6. Variance semantics

For every line of a version:

```
budget   = line.amount
actual   = Σ posted journal lines for line.accountId
           in the version's period, branch, department and cost centre
variance = budget − actual
```

* Only `JournalStatus.POSTED` lines count — drafts, submitted and reversed vouchers are excluded.
* Revenue, liability and equity accounts are credited-positive in the ledger, so their posted
  actual is sign-normalised (`debit − credit` for assets/expenses, `credit − debit` otherwise)
  before the subtraction. A positive variance therefore always means “under budget on cost,
  above budget on income”, regardless of account class.
* Scope filters are applied only when the header defines them; a company-wide budget compares
  against all branches.
* Totals are returned for budget, actual and variance, together with per-line rows
  (`accountId`, `accountCode`, `accountName`, `periodId`, `periodName`, `budget`, `actual`, `variance`).

---

## 7. API surface

| Method | Route | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/finance/budgets` | `BUDGET_VIEW` | Register + lookups (fiscal years, accounts, periods, branches, departments, cost centres) |
| `POST` | `/api/finance/budgets` | `BUDGET_CREATE` | Create draft version |
| `GET` | `/api/finance/budgets/{id}` | `BUDGET_VIEW` | Header, lines, version history, variance summary |
| `PATCH` | `/api/finance/budgets/{id}` | `BUDGET_CREATE` | Replace header + lines of a draft |
| `POST` | `/api/finance/budgets/{id}/submit` | `BUDGET_CREATE` | Submit for approval |
| `POST` | `/api/finance/budgets/{id}/approve` | `BUDGET_APPROVE` | Approve (independent officer) and supersede the prior approval |
| `POST` | `/api/finance/budgets/{id}/close` | `BUDGET_APPROVE` | Close an approved or superseded version |
| `POST` | `/api/finance/budgets/{id}/revise` | `BUDGET_CREATE` | Clone into the next draft version |
| `GET` | `/api/finance/budgets/{id}/variance` | `BUDGET_VIEW` | Budget vs posted actual by account and period |

All mutating routes call `assertSameOrigin`, validate with zod, resolve permissions per company and
append an audit event (`BUDGET_DRAFT_CREATED`, `BUDGET_DRAFT_UPDATED`, `BUDGET_SUBMITTED`,
`BUDGET_APPROVED`, `BUDGET_CLOSED`, `BUDGET_REVISED`) with old/new values and the reason where
applicable.

---

## 8. Workspace

`/finance/budgets` renders the `BudgetWorkspace` client component:

* KPI cards — versions shown, budgeted value, approved versions, versions awaiting approval.
* Filters — status and budget code (version register grouped by code).
* Version table — code/name, version, fiscal year, scope, total, status badge, preparer/approver,
  row actions (edit, submit, approve, revise, close, variance) gated by permission **and** by
  maker–checker state.
* Draft editor modal — header fields plus a line grid with account, period, amount and notes;
  inline remove/add; client total is display-only.
* Variance modal — per-line budget/actual/variance with totals and scope caption.

Loading, empty and error states are handled; every action reports success or the exact server
message through a toast.

---

## 9. Accounting integration

| Question | Answer |
| --- | --- |
| Does a budget post journals? | No. Budgets are planning-only. |
| Where do actuals come from? | Posted `JournalEntryLine` rows, filtered by period and scope. |
| Can a closed period be changed through budgets? | No — budgets never write to the ledger. |
| Is variance available for draft budgets? | Yes, for comparison; only approved versions are marked live. |

---

## 10. Acceptance evidence

`scripts/verify-budgets-acceptance.ts` (`npm run test:budgets-acceptance`) runs nine groups against
the live application and database:

1. Permission gating (buyer/controller without `BUDGET_CREATE`, self-approval rejection).
2. Line validation — foreign fiscal-year period, duplicate account+period, negative amount.
3. Draft editing and total recomputation.
4. Submit lock — editing a submitted version returns `409`.
5. Independent approval — preparer cannot approve, controller approves with approver metadata.
6. Variance — compares approved budget with a posted journal in the same period; unrelated
   accounts and totals are checked.
7. Revision supersession — approving v2 marks v1 `REVISED`.
8. Close/immutability — closing v2 blocks edits and a new draft can be seeded by revision.
9. Audit evidence and authenticated page render.

Observed runs in this phase printed nine green groups each, e.g.
`✓ audit evidence and authenticated budget workspace rendered (MVTP2BWC)` and
`✓ … (MVTP2FVG)` with evidence line `v1=REVISED, v2=CLOSED, v3=DRAFT`.

Each run uses a run-suffixed budget code (`BUD-<run>`) and dedicated expense accounts, so repeated
runs never collide with earlier evidence.

---

## 11. Operator runbook

| Task | Steps |
| --- | --- |
| Build next year's budget | Budgets → *New budget version* → choose fiscal year and scope → add account/period lines → save draft → review → submit. |
| Approve | Approver opens the submitted version → *Approve*. The previous live version becomes `REVISED`. |
| Change an approved budget | *Revise* → adjust lines → submit → approve. Version number increments; history is preserved. |
| Freeze a period | *Close* the approved version; it becomes read-only. |
| Monthly review | *Variance* on the live version; positive variance = under budget for cost, over budget for income. |
| Audit | Finance → Audit history filtered by entity `Budget`, or `GET /api/finance/budgets/{id}` history block. |

---

## 12. Known limits / next steps

* No spreadsheet import/export yet (CSV import is planned with the reporting-parity phase).
* No per-line comments or approval thresholds; a version is approved as a whole.
* Variance is period-based; YTD cumulative variance is derived in reporting, not stored.
* Budgets are single-currency, matching the company currency.
