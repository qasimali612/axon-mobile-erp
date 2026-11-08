# Architecture

## Runtime

- Next.js App Router, React, TypeScript, Tailwind CSS
- PostgreSQL with Prisma schema/client and versioned SQL migrations
- PGlite PostgreSQL-compatible server only for the local preview/development environment
- Database sessions in HttpOnly cookies with isolated embedded-preview continuity mode
- Zod request validation and server-side permission checks

## Boundaries

```text
Browser UI
   │ HTTPS + session + same-origin mutation
Next.js page/API boundary
   │ authentication, exact permission, tenant/scope, validation
Domain transaction services
   │ idempotency, state machine, fixed-point calculations, audit
Prisma transaction boundary
   │ source + subledger + journal + bank + inventory effects
PostgreSQL
   │ FK / unique / check / trigger / immutable-history controls
```

## Tenant and scope model

- `Company` is the tenant root.
- Operational roots carry `companyId`.
- Branch and warehouse assignments constrain server reads and writes.
- Finance headers, periods, accounts, parties, banks, and dimensions must belong to one company.
- Journal-line database guards reject cross-company and cross-branch references.
- Company-wide configuration requires a company-wide role grant; a branch-only grant is insufficient.

## Financial architecture

### Source of truth

`JournalEntry` + `JournalEntryLine` is the accounting authority. Reports include original posted vouchers and their linked posted reversals, preserving the complete ledger effect. Draft/submitted/approved/rejected vouchers are excluded.

### Journal state machine

```text
DRAFT ──submit──> SUBMITTED ──independent approval──> APPROVED
                                                     │
                                              third-user post
                                                     ▼
                                                   POSTED
                                                     │
                                          linked opposite voucher
                                                     ▼
                                                  REVERSED
```

- Lines can change only while the parent is `DRAFT`.
- Posting requires at least two lines, exact base-currency balance, an open period, and complete approval/post metadata.
- Posted and reversed lines cannot be updated or deleted.
- A reversal is a separately numbered voucher; the original stays queryable.

### Fiscal control

- Fiscal years contain dated accounting periods.
- Posting date must fall inside the linked period.
- Soft close blocks posting while an independent close approver reviews the checklist.
- Closed periods block posting at application and database layers.
- Reopen requires a separate permission, reason, different actor, and audit event.

### Decimal policy

- Monetary database columns use `Decimal(19,4)`.
- Exchange rates use `Decimal(19,8)`.
- Domain calculations use Prisma Decimal.
- Browser journal totals use scaled integer arithmetic.
- Display formatting does not convert source money through binary floating point.

### Statements

- Trial balance: opening, period movement, and closing by account.
- Profit and loss: revenue less cost of goods sold and operating expense for one posting-date period.
- Balance sheet: cumulative asset, liability, equity, and unclosed cumulative earnings balances; exact difference is shown.
- Cash flow: posted bank movements by journal cash-flow classification; unclassified movement is disclosed.

## Inventory architecture target

The immutable inventory movement ledger will be the quantity/valuation authority. A physical device will be represented once and may own multiple globally unique device-identifier rows. Source document, stock movement, device state, and journal effect must commit atomically. This layer is not yet implemented and no live stock valuation is claimed.

## Integrated subledgers

- Customer and supplier dimensions live on journal lines and will drive statement/aging reports.
- A bank transaction is generated from a posted bank-dimension journal line.
- Assets link categories and individual records to cost, accumulated depreciation, expense, and disposal accounts.
- Incentive and rebate calculation records link separately to accrual and settlement journals.
- Budget actuals come only from posted journal lines.

## Security and audit

- Passwords are bcrypt hashes; production bootstrap requires environment-provided secrets.
- Session rows can be revoked and expire server-side.
- Mutation routes validate same-origin requests.
- Role grants are exact action keys, not broad UI labels.
- Audit rows are append-only by database trigger.
- Report export is separately authorized and audited.
- Sensitive bank account display uses last-four masking; full account data is designed for encrypted storage.

## Permanently excluded scope

After-sales case-management/workshop operations are outside this product. They have no active schema dependency, page, API, role grant, report, notification, development fixture, dashboard metric, or roadmap module.
