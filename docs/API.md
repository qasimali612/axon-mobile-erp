# API reference

All routes live under `/api`. Responses are JSON except the controlled CSV exports. Every
state-changing route requires a valid HttpOnly session, a same-origin request, a Zod-validated body,
the exact server-side permission, company/branch/warehouse scope, and a valid workflow state; posted
or sensitive actions also write audit rows.

## Error shape

```json
{ "error": { "code": "FORBIDDEN", "message": "You do not have permission to perform this action.", "details": null } }
```

Common statuses: `400` malformed request, `401` no session, `403` denied, `404` scoped record absent,
`409` state/uniqueness/workflow conflict, `422` validation, `429` throttled, `500` unexpected failure.

## Cross-cutting contract

| Rule | Behaviour |
| --- | --- |
| Idempotency | Document-creating posts accept an idempotency key; a replay returns the original document instead of a duplicate |
| Server recalculation | Totals, taxes, discounts and stock values are recomputed on the server; client totals are display-only |
| Scope | `companyId` comes from the session; branch/warehouse scope is enforced per user assignment |
| Posting | Stock, device state, subledger, journal and audit effects commit in one serializable transaction |
| Immutability | Posted documents cannot be edited or deleted; corrections use cancel, reverse, return or credit note |
| Audit | Document transitions, exports and destructive-adjacent actions append to the append-only audit log |

---

## Authentication and context

| Method | Path | Behaviour |
| --- | --- | --- |
| POST | `/api/auth/login` | Throttled credential check (8 failures / 15 min per email+IP); creates hashed-token session |
| POST | `/api/auth/logout` | Revokes the current session and clears the cookie |
| GET | `/api/auth/me` | Identity, company, scopes and effective permissions |
| POST | `/api/auth/change-password` | Verifies the current password, enforces policy, revokes other sessions |
| PATCH | `/api/context` | Validated change of active branch/warehouse |

## Organization, catalog and access

| Method | Path | Notes |
| --- | --- | --- |
| GET/PUT | `/api/company` | Company profile and preferences |
| GET/POST | `/api/branches`, `/api/warehouses` | Master records; `PUT`/`DELETE` under `/:id` archive, never erase history |
| GET/POST/PATCH | `/api/warehouses/:id/locations`, `/:locationId` | Bins inside a warehouse |
| GET/POST | `/api/products` | Catalog with IMEI/serial/batch/barcode tracking policy |
| GET/PUT/DELETE | `/api/products/:id` | `DELETE` archives; inactive products cannot be sold or received |
| POST/PATCH | `/api/products/:id/variants`, `/:variantId` | Variant and barcode maintenance |
| GET/POST/PATCH | `/api/catalog/price-lists`, `/api/catalog/payment-methods`, `/api/catalog/masters` | Price lists, payment methods, lookup masters |
| GET/POST/PATCH | `/api/catalog/supplier-items`, `/:id` | Supplier item code, quoted cost, lead time and minimum order per supplier (duplicates → `409 SUPPLIER_SKU_TAKEN`) |
| GET | `/api/catalog/prices/resolve` | Server-side price resolution for a customer/variant/date |
| GET/POST | `/api/customers`, `/api/suppliers` | Party masters with credit and scope controls |
| GET/POST/PUT | `/api/users`, `/api/roles` | RBAC; role assignment is separately permissioned |

## Inventory

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/inventory/stock` | Balances by warehouse/variant with valuation |
| GET | `/api/inventory/imei`, `/api/inventory/imei/:id` | Device registry; both IMEIs of a dual-SIM unit resolve to one physical unit |
| GET/POST | `/api/inventory/transfers` | Multi-line stock transfer, quantity or IMEI-tracked |
| POST | `/api/inventory/transfers/:id/{submit,approve,post,cancel,reverse}` | Workflow; posting moves stock atomically |
| GET | `/api/inventory/transfers/availability` | Sellable/transferable quantity for scheduling |
| GET/POST | `/api/inventory/adjustments` | Adjustments with actual-cost GL effect |
| POST | `/api/inventory/adjustments/:id/{submit,post,cancel,reverse}` | Posting/reversal; exact reversal of cost |
| GET | `/api/inventory/adjustments/availability` | Quantity available for adjustment |
| GET/POST/PATCH | `/api/inventory/counts`, `/:id` | Snapshot physical counts; lines captured against a frozen snapshot |
| POST | `/api/inventory/counts/:id/{submit,post,cancel}` | Posting generates and posts the balancing adjustments |

## Procurement

| Method | Path | Notes |
| --- | --- | --- |
| GET/POST | `/api/purchases/orders` | Purchase orders are optional; multi-product lines |
| POST | `/api/purchases/orders/:id/{submit,approve,reject,cancel,close}` | Approval chain; closing prevents further receipts |
| GET/POST | `/api/purchases/receipts` | Good receiving via PO **or** direct receipt |
| POST | `/api/purchases/receipts/:id/{submit,inspect,approve,post,cancel,reverse}` | Posting creates stock, device identifiers, payable and GL in one transaction |
| POST/GET | `/api/purchases/attachments`, `/:id` | Supplier documents attached to a receipt |
| GET/POST | `/api/returns` (vendor) | Source-linked supplier returns |

## Sales, POS and returns

| Method | Path | Notes |
| --- | --- | --- |
| GET/POST | `/api/sales/invoices` | Simple direct invoice **or** PO/SO-linked; barcode and IMEI scanning |
| POST | `/api/sales/invoices/:id/{submit,approve,post,cancel,reverse}` | Drafts reserve nothing sellable; posting issues stock, COGS, revenue and tax |
| GET | `/api/returns/sources` | Eligible source documents for a return |
| GET/POST | `/api/returns` | Customer returns linked to an invoice |
| POST | `/api/returns/:id/{submit,approve,post}` | Restores stock exactly once and credits the customer |

## Payments and banking

| Method | Path | Notes |
| --- | --- | --- |
| GET/POST | `/api/payments` | Customer receipts and supplier payments with allocations |
| POST | `/api/payments/:id/{submit,approve,post}` | Accrual then independent settlement; over-allocation rejected |
| GET/POST/PATCH | `/api/finance/bank-accounts`, `/:id` | Bank master linked to a GL account |
| GET/POST | `/api/finance/bank-statements`, `/:id` | Statement import and line capture |
| POST | `/api/finance/bank-statements/:id/{auto-match,match,reconciliation}` | Matching and reconciliation guards |
| GET | `/api/finance/bank-transactions` | Bank ledger with filtering |
| POST | `/api/finance/bank-reconciliations/:id/{complete,reopen}` | Completion requires zero unexplained difference |

## Finance — ledger

| Method | Path | Notes |
| --- | --- | --- |
| GET/POST/PATCH | `/api/finance/accounts` | Hierarchical chart of accounts; protected control accounts cannot be deleted |
| GET/POST | `/api/finance/journals` | Balanced manual journals with idempotency key |
| POST | `/api/finance/journals/:id/{submit,approve,post,reverse}` | Maker–checker–poster; reversal creates a linked opposite voucher |
| POST | `/api/finance/periods/:id/{request-close,close,reopen}` | Period close checklist, soft close, final close, audited reopen |
| GET | `/api/finance/subledgers`, `/:kind/:id` | Party subledger statements, aging and residual allocation |

## Finance — subledgers and planning

| Method | Path | Notes |
| --- | --- | --- |
| GET/POST/PATCH | `/api/finance/assets`, `/:id` | Fixed-asset register (11 groups) |
| POST | `/api/finance/assets/:id/{capitalize,dispose}` | Capitalization and disposal with gain/loss posting |
| GET/POST | `/api/finance/assets/depreciation`, `/generate`, `/post` | Schedule generation and posting; a generator cannot post their own run |
| GET/POST | `/api/finance/budgets` | Budget versions by fiscal year, department and cost centre |
| POST | `/api/finance/budgets/:id/{submit,approve,revise,close}` | One live version; revisions supersede; closed versions immutable |
| GET | `/api/finance/budgets/:id/variance` | Variance against posted journals |
| GET | `/api/finance/incentives` | Incentive plans, calculations and payables |
| POST | `/api/finance/incentives/plans`, `/:id`, `/:id/{action}` | Plan lifecycle and approval |
| POST | `/api/finance/incentives/calculations/:id/{action}` | Accrual, approval and reversal |
| POST | `/api/finance/incentives/payables/:id/{action}` | Partial settlement with overpayment rejection |
| POST | `/api/finance/incentives/received`, `/:id/{action}` | Supplier incentive income and settlement |
| GET/POST/PATCH | `/api/finance/rebates`, `/programs`, `/programs/:id` | Payable and receivable rebate programmes |
| POST | `/api/finance/rebates/programs/:id/calculate` | Rebate calculation run |
| POST | `/api/finance/rebates/calculations/:id/{action}` | Accrual, settlement and reversal |

## Reports, exports and print

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/api/reports/operations` | `report.purchase/sales/inventory/profitability` | Nine reports; `format=csv` streams an audited export (`OPERATIONAL_REPORT_EXPORTED`) |
| GET | `/api/reports/operations?cost=…` | cost permission | Cost and margin columns are omitted without the cost grant |
| GET | `/api/reports/saved-views?module=…` | session | Own and shared saved views for a workspace; `POST` creates, `DELETE /:id` removes (audited) |
| GET/POST/PATCH/DELETE | `/api/reports/schedules`, `/:id` | `report.export` | Recurring export definitions: report key, filters, cadence, recipients, active flag |
| POST | `/api/reports/schedules/:id/run` | `report.export` | Runs the audited CSV endpoint now, records `lastRunAt/lastRunStatus/lastRunRows`, streams the file (inactive → `409`) |
| GET | `/api/documents/{invoice\|grn\|purchase-order}/:id/pdf` | `sales.view` / `purchase.view` | Server-rendered A4 PDF; unknown document type → `404 UNKNOWN_DOCUMENT`; audited `DOCUMENT_PDF_GENERATED` |
| GET | `/api/finance/reports/trial-balance` | `FINANCIAL_REPORTS_EXPORT` | Scoped CSV export with audit |
| GET | `/api/finance/reports/statements` | `FINANCIAL_REPORTS_EXPORT` | Profit and loss, balance sheet and cash flow sections (`FINANCIAL_STATEMENTS_EXPORTED`) |
| GET | `/api/finance/exports/{budgets\|incentives\|rebates\|assets}` | module view + `FINANCIAL_REPORTS_EXPORT` | Register CSV (`FINANCE_REGISTER_EXPORTED`); unknown register → 404 |
| GET | `/finance/budgets/:id/print`, `/finance/assets/print`, `/finance/incentives/print`, `/finance/rebates/print` | module view | Print layouts; unauthenticated requests redirect to login |

CSV responses carry a UTF-8 BOM, quote every field, guard against formula injection and are generated
server-side so restricted columns cannot be recovered in the browser.

## Operations support

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/operations/catalog/search`, `/resolve`, `/lookups` | Scanner/barcode resolution; unknown codes return a validation error and never create products |
| POST | `/api/operations/import-spreadsheet` | Real XLSX parsing for bulk catalog/identifier import |
| GET | `/api/search` | Global search (`Ctrl/Cmd + K`) |
| GET | `/api/dashboard` | Live aggregates from posted data only |
| GET | `/api/audit` | Filtered audit register; `format=csv` requires `audit.export` |
| GET/PATCH | `/api/notifications` | Current recipient only |
| GET | `/api/system/health` | Liveness and database reachability; `details=true` requires `system.health.view` |

## Commercial control settings

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/settings/policies` | Approval bands plus the active discount policy; `?catalog=true` also returns the sensitive permission catalog |
| POST | `/api/settings/policies` | Create an amount-banded approval requirement (`policy.manage`, duplicate name → `409`) |
| PATCH | `/api/settings/policies/:id` | Edit or pause a band |
| PUT | `/api/settings/policies` | Set the sales discount cap (`maxPercent`, `overridePermission`) |

Refusals return `403 APPROVAL_POLICY_REQUIRED`, `422 DISCOUNT_CAP_EXCEEDED` or `409 CREDIT_LIMIT_EXCEEDED`
and always append an audit row — including when the refusal rolled the surrounding transaction back.

## Print and label pages

| Path | Permission | Notes |
| --- | --- | --- |
| `/sales/:id/receipt` | `sales.view` | 80 mm thermal receipt with IMEI lines and an unposted warning |
| `/inventory/labels?units=…` or `?warehouseId=…` | `inventory.device.view` | Code128 device labels (≤120 per sheet) |
| `/reports/schedules` | `report.export` | Schedule workspace: create, run, pause, delete |
| `/settings/controls` | `policy.manage` | Approval bands and discount cap |
| `/catalog/supplier-items` | `catalog.product.view` | Supplier item-code register |

## Posting response contract

Document posting routes return the document number, ids of the created movements, device identifiers,
journal entries and subledger rows, plus the resulting version — all from the single transaction that
committed them. A client may retry with the same idempotency key and will receive the original result.
