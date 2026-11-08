# Commercial policy controls

Three controls that let an owner tighten commercial behaviour without adding document chains:
amount-banded approval requirements, a sales discount cap, and an explicit credit-limit exception.

All three are **off by default**. With no rows configured, every workflow behaves exactly as it did
before, so enabling a control is a deliberate act with an audit record.

## 1. Approval bands

Screen: **Catalog → Commercial controls** (`/settings/controls`). API:
`GET|POST|PUT /api/settings/policies`, `PATCH /api/settings/policies/:id`. Permission: `policy.manage`.

A band names a document type, an amount range and one extra permission:

| Field | Meaning |
| --- | --- |
| Document type | `PURCHASE_ORDER`, `PURCHASE_RECEIPT`, `SALES_INVOICE`, `PAYMENT`, `JOURNAL`, `INVENTORY_ADJUSTMENT` |
| From / To | Inclusive amount band; blank upper bound means "no limit" |
| Required permission | A permission key from the catalog that the acting user must also hold |
| Active | Bands can be paused instead of deleted |

**Enforcement.** When a document's total falls in one or more active bands, the acting user must hold
**every** matching permission. Overlapping bands therefore stack instead of weakening each other.
Bands are evaluated inside the same transaction as the state change, on:

* purchase order approval,
* sales invoice submission (discount cap) and approval (credit limit + band),
* payment posting,
* journal posting.

A refusal returns `403 APPROVAL_POLICY_REQUIRED` with the band names and the missing permissions, and
writes `APPROVAL_POLICY_BLOCKED` to the audit log so a frustrated approver can see exactly why.

Bands never replace maker/checker/poster separation. They add a requirement; they do not remove one.

## 2. Sales discount cap

Stored in company settings under `sales.discount.policy`:

```json
{ "maxPercent": 5, "overridePermission": "sales.discount.override" }
```

Checked when an invoice is **submitted** (the point where the discount becomes a commitment):

* discount percentage = `discountTotal ÷ subtotal × 100`, rounded to four places;
* at or below the cap — normal flow;
* above the cap — refused with `422 DISCOUNT_CAP_EXCEEDED` unless the submitter holds the override
  permission **and** supplies a reason of at least ten characters;
* a successful override writes `DISCOUNT_CAP_OVERRIDDEN` with the percentage, the cap and the reason.

`maxPercent = 100` disables the cap.

## 3. Credit-limit exception

The existing credit-limit check at invoice approval is unchanged in principle: if the customer's
outstanding receivable plus this invoice exceeds the configured limit, the approval is refused. What
is new is the sanctioned way out:

* the approver must hold `customer.credit.override`;
* a reason of at least ten characters must be supplied with the approval request;
* the approval writes `CREDIT_LIMIT_OVERRIDDEN` with the outstanding balance, invoice total, limit and
  reason.

Without both the grant and the reason the response is `409 CREDIT_LIMIT_EXCEEDED` carrying the three
figures and the name of the required permission.

## 4. Grants

| Permission | Typical holder | Effect |
| --- | --- | --- |
| `policy.manage` | Owner, Administrator | Create, edit, pause bands; set the discount cap |
| `sales.discount.override` | Owner, sales manager | Submit above the discount cap with a reason |
| `customer.credit.override` | Owner, finance controller | Approve above the credit limit with a reason |

None of these are granted to `ACCOUNTANT`, `CASHIER` or `GL_POSTING_OFFICER` in the role template. The
enhancements acceptance asserts that an accountant receives `403` on the policy API and that a posting
officer is blocked by a band requiring `FINANCIAL_REPORTS_EXPORT`.

## 5. Audit events

| Action | Written when |
| --- | --- |
| `APPROVAL_POLICY_CREATED` / `APPROVAL_POLICY_UPDATED` | A band is created, edited or paused |
| `APPROVAL_POLICY_BLOCKED` | A state change was refused by a band |
| `DISCOUNT_POLICY_UPDATED` | The cap or its override permission changes |
| `DISCOUNT_CAP_OVERRIDDEN` | A discounted invoice is submitted above the cap |
| `CREDIT_LIMIT_OVERRIDDEN` | An invoice is approved above the credit limit |

## 6. What this deliberately does not do

* No approval *chain*: bands do not add extra document states. A PO still needs one approval; a band
  just requires the approver to hold one more grant when the amount is large.
* No silent threshold changes: every policy edit is audited with before/after values.
* No bypass by retrying: the check runs inside the posting transaction, so a race cannot skip it.
