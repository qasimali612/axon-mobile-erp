# Acceptance matrix

This is the release gate for the Axon mobile-phone inventory ERP. Every row is a database-backed
suite that exercises real APIs, real postings and real audit rows — there are no mocked totals and no
decorative screens. A release is shippable only when **every row passes against the same database**.

* **Chain runner:** `npm run acceptance:all` (or `npm run acceptance:fast`)
* **Single suite:** `npm run test:<suite>` (see the command column)
* **Prerequisites:** database on `127.0.0.1:54329` (`bash scripts/db-start.sh`) and the application on
  port 3000 (`npm run start`), with demo fixtures seeded (`DEMO_SEED=true`). A local `.env` (copied from
  `.env.example`) supplies `DATABASE_URL`; every npm script loads it through `scripts/run-with-env.sh`.
* **Ordering:** the chain is ordered. Suites are additive — later suites rely on documents created by
  earlier ones (for example, reporting reads posted receipts from `procurement-sales`).

```bash
cp .env.example .env && edit .env        # DATABASE_URL + SEED_ADMIN_PASSWORD
bash scripts/db-start.sh                 # terminal 1
npm run db:prepare                       # migrate + seed
npm run start                            # terminal 2
npm run acceptance:all                   # terminal 3
```

`DEMO_PASSWORD` (or `FINANCE_TEST_PASSWORD` / `OPERATIONS_TEST_PASSWORD`) is only needed by the three
suites that sign in over HTTP with a real password; without it they report `SKIP` instead of failing.

---

## 1 · Release gates

| # | Gate | Command | Proves | Last evidence |
| --- | --- | --- | --- | --- |
| 1 | Types | `npm run typecheck` | Foundation, finance, operations and scripts compile under four strict configs | 0 errors |
| 2 | Lint | `npm run lint` | No `any`-style escapes, no unreachable links, server/client boundaries respected | 0 problems |
| 3 | Unit tests | `npm test` | Money math, IMEI rules, guards, serializers | 50 passing |
| 4 | Production build | `npx next build` | The deployable artefact builds | exit 0 |
| 5 | Migration rehearsal | `npm run db:migration-rehearsal` | 40 migrations applied in order, no checksum drift, all 107 guard triggers present, ledger balanced | passed |
| 6 | Smoke & concurrency | `npm run smoke` | Health, anonymous redirect, 15 authenticated pages, 6 APIs, 32-request burst | passed |
| 7 | Backup / restore | `npm run db:backup` | Checkpoint → archive → scratch restore on :54331 → parity of migrations, guards, row counts and ledger totals | passed |
| 8 | Acceptance chain | `npm run acceptance:all` | All 20 suites below | 20 passed / 0 failed / 0 skipped |

`npm run db:backup` refuses to run while something listens on port 3000, because a backup taken while
a write is in flight is only crash-consistent.

---

## 2 · Suite matrix

| # | Suite | Command | Covers | Notable assertions |
| --- | --- | --- | --- | --- |
| 1 | DB controls | `test:db-controls` | Append-only audit, movement immutability, scope triggers, sequence integrity | Direct SQL attempts to mutate posted history are rejected |
| 2 | Finance controls | `test:finance-controls` | Chart of accounts, journal balance, period locks, posting guards | Unbalanced or closed-period postings are refused |
| 3 | Login & session | `test:login-session-acceptance` | Authentication, lockout, session cookies, branch/warehouse scoping, permission denial | Anonymous access redirects; wrong password and locked accounts return 401/429 |
| 4 | Master data | `test:master-data-acceptance` | Products, variants, barcodes, warehouses, bins, price lists, payment methods | Cross-company references rejected; inactive records cannot be selected |
| 5 | Procurement & sales | `test:procurement-sales-acceptance` | Multi-product PO → partial GRN → direct receipt → POS sale → customer return → vendor return → print and reports | Dual-SIM IMEI rules, duplicate IMEI rejected, exactly-once posting, COGS and payable reversal |
| 6 | Inventory controls | `test:inventory-controls-acceptance` | Transfers, adjustments with actual cost, snapshot stock counts, reservations, valuation | Posting-only stock; ledger reconciles to `StockBalance` |
| 7 | Party subledger | `test:party-subledger-acceptance` | Customer/supplier statements, aging buckets, residual allocation, CSV and scope | Subledger totals equal control-account balances |
| 8 | Pricing & payments | `test:pricing-payment-acceptance` | Price lists, discounts, receipts, allocations, overpayment rejection | Server recalculates totals; client totals are display-only |
| 9 | Banking | `test:banking-acceptance` | Bank ledger, statement import, matching, reconciliation guard | Reconciled lines cannot be re-matched; bank balances tie to GL |
| 10 | Fixed assets | `test:fixed-assets-acceptance` | Acquisition, depreciation schedules, generation, disposal, 11 groups | Posted cost and accumulated depreciation reconcile to the subledger; generator cannot post own schedule |
| 11 | Budgets | `test:budgets-acceptance` | Draft → submit → approve → revise → close, variance vs posted journals, 9 groups | Only one live version; closed versions immutable |
| 12 | Incentives | `test:incentives-acceptance` | Accrual, approval, settlement, adjustment, reversal, 10 groups | Accruals post balanced journals exactly once; independent approval |
| 13 | Rebates | `test:rebates-acceptance` | Payable and receivable rebates, accrual, receipts/payments, 8 groups | Over-settlement rejected; open items reconcile to zero |
| 14 | Journal workflow | `test:journal-workflow` | Maker–checker–poster separation, reversal linkage | Approver lacks posting authority; reversal nets to zero |
| 15 | Operational workflow | `test:operational-workflow` | End-to-end order → receipt → invoice → payment with independent officers | Unit ends `SOLD`; warehouse balance equals the movement ledger |
| 16 | Operational controls | `test:operational-controls` | Segregation of duties on posted operations | Preparer, approver and poster are distinct; journals balanced |
| 17 | Operational reconciliation | `test:operational-reconciliation` | Stock, IMEI, GL and document-state reconciliation | No drift between ledger, balances and posted documents |
| 18 | Operational reversals | `test:operational-reversals` | Authorized cancellation/reversal of posted receipt, invoice, return | Original stays immutable; reversal exactly once; no double return |
| 19 | Reporting, export & print | `test:reporting-acceptance` | Server-generated CSV exports, statement reconciliation, register exports, four print layouts, `/reports` hub | Exports BOM-prefixed, permission-gated (`FINANCIAL_REPORTS_EXPORT`), audited; statements reconcile to posted revenue; print pages 200 for owner, 307 for buyer |
| 20 | Enhancements & delivery | `test:enhancements-acceptance` | Supplier item codes, product depth fields, reorder report, approval bands, discount cap, credit override, server PDF, 80 mm receipt, device labels, saved views, report schedules | Duplicate supplier code → 409; posting officer blocked by a band and the refusal audited; discount above the cap refused with `422`; PDF is a real `%PDF-` file and audited; a schedule run replays the audited CSV (BOM intact) and records rows; saved views stay private per user |

---

## 3 · Export and print parity

| Surface | Route | Permission | Audit action |
| --- | --- | --- | --- |
| Operational reports (9) | `GET /api/reports/operations?report=…&format=csv` | `report.*` (+ cost columns only with cost permission) | `OPERATIONAL_REPORT_EXPORTED` |
| Financial statements | `GET /api/finance/reports/statements?period=&branch=` | `FINANCIAL_REPORTS_EXPORT` | `FINANCIAL_STATEMENTS_EXPORTED` |
| Budget register | `GET /api/finance/exports/budgets` | view + `FINANCIAL_REPORTS_EXPORT` | `FINANCE_REGISTER_EXPORTED` |
| Incentive register | `GET /api/finance/exports/incentives` | view + `FINANCIAL_REPORTS_EXPORT` | `FINANCE_REGISTER_EXPORTED` |
| Rebate register | `GET /api/finance/exports/rebates` | view + `FINANCIAL_REPORTS_EXPORT` | `FINANCE_REGISTER_EXPORTED` |
| Fixed-asset register | `GET /api/finance/exports/assets` | view + `FINANCIAL_REPORTS_EXPORT` | `FINANCE_REGISTER_EXPORTED` |
| Invoice / GRN / PO PDF | `GET /api/documents/{invoice\|grn\|purchase-order}/:id/pdf` | `sales.view` / `purchase.view` | `DOCUMENT_PDF_GENERATED` |
| 80 mm thermal receipt | `/sales/[id]/receipt` | `sales.view` | — |
| Device label sheet | `/inventory/labels?units=…` | `inventory.device.view` | — |
| Saved views | `GET/POST /api/reports/saved-views`, `DELETE /:id` | session (own + shared) | `SAVED_VIEW_CREATED` / `SAVED_VIEW_DELETED` |
| Report schedules | `GET/POST /api/reports/schedules`, `PATCH/DELETE /:id`, `POST /:id/run` | `report.export` | `REPORT_SCHEDULE_CREATED` / `UPDATED` / `DELETED` / `RUN` |
| Budget version print | `/finance/budgets/[id]/print` | view | — |
| Asset / incentive / rebate print | `/finance/assets/print`, `/finance/incentives/print`, `/finance/rebates/print` | view | — |

Every export is generated on the server, so restricted cost columns and period scoping cannot be
bypassed by the browser. CSV files carry a UTF-8 BOM for spreadsheet tools and quote every field
(RFC 4180), with a formula-injection guard on values beginning `=`, `+`, `-` or `@`.

---

## 4 · What the matrix deliberately does not claim

* No offline mode: the app requires the LAN server; re-entries after an outage are revalidated.
* No warranty, repair-job, service-centre or collection-point modules — permanently out of scope.
* No headless-browser PDF pipeline: documents are emitted by a small in-process PDF writer, so the
  deployment carries no Chromium dependency. The browser print pipeline remains available for the
  wider layouts (PO, GRN, returns, finance registers) and for pre-print tweaks.
* Performance evidence is a smoke-level latency ceiling, not a full load test; a production cutover
  should add a two-hour soak with real branch traffic.

---

## 5 · Fresh-environment rehearsal

The full release was rehearsed from an empty cluster as part of this delivery:

```text
prisma migrate deploy   → 40 migrations applied
prisma db seed          → 154 permissions + demo fixtures (1 company, 14 users, 2 branches, 3 warehouses)
npm run db:migration-rehearsal → 40 applied / 0 drift / 107 triggers / ledger balanced
npm run acceptance:all  → 20 passed, 0 failed, 0 skipped
npm run db:backup       → 13 MB archive, restored on :54331, every count identical, debit = credit
```

This proves the documented deployment path (empty database → migrate → seed → verify) works without
any manual SQL.
