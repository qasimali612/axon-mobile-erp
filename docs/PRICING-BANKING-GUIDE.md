# Price Lists, Payment Methods, and Bank Reconciliation Guide

**Status:** implemented and acceptance-covered (migrations `20261028000900`–`20261028001300`).
**Scope rule:** these masters and controls extend the existing catalog, finance, sales, and payment modules. No duplicate pricing, settlement, or banking entity was introduced.

## 1. Price lists

| Concern | Behaviour |
|---|---|
| Masters | `PriceList` (code, name, level, currency, effective window, single company default) with normalized `PriceListItem` rows per variant, each carrying a list price and optional line minimum. |
| Single default | Partial unique index on `PriceList(companyId)` where `isDefault = true`; the service clears the previous default inside the same transaction. |
| Customer assignment | `Customer.priceListId` picks the customer's list. Resolution order is: explicit list on the document, then the customer's list, then the company default, then the variant retail price. |
| Pricing authority | `GET /api/catalog/prices/resolve` returns the resolved price, minimum, source (`PRICE_LIST` / `VARIANT`), and the list used. POS and invoice entry only *display* this; the server recalculates every total. |
| Invoice floor | `createSalesInvoiceDraft` / `updateSalesInvoiceDraft` recompute the effective unit price per line and reject anything below the list minimum (falling back to the variant minimum). The chosen list is stored on `SalesInvoice.priceListId`. |
| Lifecycle | A list assigned to active customers, or used by a draft/submitted/approved invoice, cannot be deactivated. Deletion is allowed only while unused. `effectiveTo < effectiveFrom` is rejected at both validation and database level. |
| Audit | `PRICE_LIST_CREATED`, `PRICE_LIST_UPDATED` with before/after values and line counts. |
| UI | `/catalog/price-lists` — list register plus a variant price editor; POS shows a list selector, per-line minimum, and the source of each price. |

## 2. Payment methods

| Concern | Behaviour |
|---|---|
| Masters | `PaymentMethod` (code, name, type, reference policy, display order, active flag) bound to exactly one settlement target: a cash `Account` for `CASH`, otherwise an existing `BankAccount`. The database check constraint rejects any other combination. |
| Payment-time resolution | `POST /api/payments` accepts `paymentMethodId`; the settlement account is derived server-side, an explicitly supplied account must match, an inactive method is rejected, and `requiresReference` forces a reference number. |
| Lifecycle | Deactivation is blocked while draft/submitted/approved payments use the method; deletion is blocked once any payment references it. |
| Audit | `PAYMENT_METHOD_CREATED`, `PAYMENT_METHOD_UPDATED`. |
| UI | `/catalog/payment-methods`. |

## 3. Banking and reconciliation

Posting is unchanged: a posted journal line that references a bank account creates the authoritative `BankTransaction`. Statements never create journals.

### Bank accounts
- Created and edited at `/api/finance/bank-accounts`; the chosen ledger account must be an active **asset** account, and one ledger account can back only one bank account.
- Changing the ledger account or currency is blocked once transactions exist.
- Deactivation is blocked while an open reconciliation exists, while unreconciled transactions remain, or while an active payment method settles through the account (database trigger).

### Statements
- `POST /api/finance/bank-statements` stores the header and normalized lines. Rejected at validation: closing balance ≠ opening + lines, lines outside the period, negative amounts, a line that is both deposit and withdrawal, reversed periods.
- Rejected in the service/database: overlapping statement periods for the same account; deletion once a reconciliation exists or a line is matched; changing period/account/opening balance after reconciliation.
- Each statement line carries at most one matched journal line (`BankStatementLine_matchedJournalLineId_key`), and the matched journal line must be **posted**, belong to the same company, and reference the same bank account.

### Matching
- `POST /api/finance/bank-statements/:id/auto-match` matches only unambiguous lines: same direction, equal amount, and either an exact reference match or a single candidate (same-date preference). Ambiguous lines are left for manual matching.
- `POST /api/finance/bank-statements/:id/match` matches or clears a single line. Matching flips the bank transaction to `RECONCILED`; clearing returns it to `UNRECONCILED`.
- Bank transaction reconciliation status can only change inside the reconciliation service (`app.bank_reconciliation` session flag), so no other code path can silently mark items reconciled.

### Reconciliation
- `POST /api/finance/bank-statements/:id/reconciliation` computes, from posted journals only:
  - book balance through the statement end date,
  - outstanding deposits and outstanding payments (unreconciled items through the same date),
  - adjusted balance = book + outstanding deposits − outstanding payments.
- Completion requires `BANK_RECONCILIATION_APPROVE`, **zero unmatched statement lines**, and adjusted balance equal to the statement closing balance. The database trigger enforces the same rules independently.
- `POST /api/finance/bank-reconciliations/:id/reopen` requires the approver role and a reason; completed reconciliations can only move to `REOPENED`, and nothing can be deleted.

### UI
`/finance/banking` provides three tabs: bank accounts, statements (import, open detail, auto-match, manual match/unmatch, prepare, complete, reopen), and the reconciliation-status ledger.

## 4. Verification

```bash
npm run test:banking-acceptance          # treasury permissions, statements, matching, reconciliation, guards, audit, UI
npm run test:pricing-payment-acceptance  # price lists, price resolution, invoice floor, payment methods, payments
npm test                                 # unit suites incl. pricing and banking validation
```

The banking acceptance deliberately keeps its posted journals, statement, and completed reconciliation as immutable audit evidence; it creates a fresh ledger account and bank account on every run.

## 5. Known limits

- Statement import is manual entry / paste; CSV and OFX file parsing are not implemented.
- Bank transfers between accounts, multi-currency revaluation, and reconciliation analytics are not implemented.
- Price lists support a single price per variant (no quantity breaks) and have no bulk import or scheduled rollover yet.
