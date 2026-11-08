# Integrated ERP module checklist

Status legend: **Verified** (schema, backend, UI, server RBAC, audit/guards, posting rules and automated
tests all pass), **Partial** (working, with named gaps), **Not started**, **Out of scope**.

A row becomes Verified only when `npm run acceptance:all` exercises it. Per-module detail and the
remaining optional items live in [`CURRENT-MODULE-GAP-MATRIX.md`](CURRENT-MODULE-GAP-MATRIX.md); the
release evidence lives in [`ACCEPTANCE-MATRIX.md`](ACCEPTANCE-MATRIX.md).

Last verified: 2026-10-30 · chain result `20 passed / 0 failed / 0 skipped` · migrations 40 ·
permissions 154 · API route files 162.

## Cross-cutting controls

- [x] Blue primary visual system, compact responsive enterprise layout
- [x] Production-style login with no displayed or prefilled credential
- [x] Company-scoped sessions and server-side RBAC (`requirePermission`)
- [x] Branch/warehouse role scopes, including warehouse-level row filtering
- [x] Append-only audit log (application writer + database trigger)
- [x] Concurrency-safe document sequence service
- [x] Fixed-point money everywhere (`DECIMAL(19,4)`), server-side recalculation only
- [x] Idempotency keys on document creation and posting
- [x] Immutable posted documents with authorized reversal paths
- [x] Migration order/checksum/guard rehearsal (`npm run db:migration-rehearsal`)
- [x] Backup, restore and parity drill (`npm run db:backup`)
- [x] Smoke and 32-request concurrency burst (`npm run smoke`)
- [ ] Multi-hour production soak test (only smoke-level latency evidence today)
- [ ] Structured external log/metric pipeline (application writes audit rows; no log shipper shipped)

## Core operational modules

| Capability | Status | Evidence |
|---|---|---|
| Product/variant catalog, tracking policy, barcodes | Verified | `test:master-data-acceptance`, `test:enhancements-acceptance` |
| Min/max stock, preferred supplier, supplier item codes, reorder report | Verified | `test:enhancements-acceptance` |
| Price lists, payment methods, categories, brands, units | Verified | `test:master-data-acceptance`, `test:pricing-payment-acceptance` |
| Purchase orders (optional, multi-product) | Verified | `test:procurement-sales-acceptance` |
| Goods receiving (PO-based or direct), inspection, landed cost | Verified | `test:procurement-sales-acceptance` |
| Purchase returns | Verified | `test:procurement-sales-acceptance` |
| Sales invoices and POS (simple, order optional) | Verified | `test:procurement-sales-acceptance` |
| Sales returns | Verified | `test:procurement-sales-acceptance` |
| IMEI registry with dual-SIM identity and custody history | Verified | `test:procurement-sales-acceptance`, `test:inventory-controls-acceptance` |
| Stock transfers, adjustments, snapshot stock counts | Verified | `test:inventory-controls-acceptance` |
| Inventory valuation and profitability reporting | Verified | `test:reporting-acceptance` |
| Payments, allocations, settlement | Verified | `test:pricing-payment-acceptance` |

## Finance

| Capability | Status | Evidence |
|---|---|---|
| Fiscal years, soft/final close, audited reopen | Verified | `test:finance-controls` |
| Chart of accounts, protected control accounts | Verified | `test:finance-controls` |
| Journal draft → submit → approve → post → reverse | Verified | `test:journal-workflow` |
| Trial balance, P&L, balance sheet, cash flow | Verified | `test:reporting-acceptance` |
| Customer/supplier subledgers, aging, residual allocation | Verified | `test:party-subledger-acceptance` |
| Banking, statement import, matching, reconciliation | Verified | `test:banking-acceptance` |
| Fixed assets, depreciation, disposal | Verified | `test:fixed-assets-acceptance` |
| Budgets, variance versus posted journals | Verified | `test:budgets-acceptance` |
| Incentives (payable and receivable) | Verified | `test:incentives-acceptance` |
| Rebates (payable and receivable) | Verified | `test:rebates-acceptance` |
| Approval bands, discount cap, credit-limit override | Verified | `test:enhancements-acceptance` |
| Opening balance batches | Partial | Seeded/scripted path only; no dedicated administration screen |

## Output, delivery and administration

| Capability | Status | Evidence |
|---|---|---|
| Server-side CSV exports (operational, statements, registers) | Verified | `test:reporting-acceptance` |
| Server-side PDF (invoice, GRN, purchase order) | Verified | `test:enhancements-acceptance` |
| 80 mm thermal receipt | Verified | `test:enhancements-acceptance` |
| Code128 device label sheets | Verified | `test:enhancements-acceptance` |
| Saved report views | Verified | `test:enhancements-acceptance` |
| Recurring report schedules and runner | Verified | `test:enhancements-acceptance` |
| Users, roles, permissions, approval policies | Verified | `test:login-session-acceptance`, `test:enhancements-acceptance` |
| Audit register and export | Verified | `test:reporting-acceptance` |
| Global search, XLSX import, notifications, health | Verified | `npm run smoke`, `test:procurement-sales-acceptance` |
| Per-station printer/scanner sign-off sheet | Partial | Documented in `LAN-PRINTER-SCANNER.md`; sign-off is an operator task |

## The twenty acceptance workflows

Each item is checked against a real database and real postings; suite names are the evidence.

1. [x] Cash sale posts revenue, tax, COGS, stock movement, cash, and audit atomically — `procurement-sales`.
2. [x] Credit sale posts customer receivable and due-date aging — `procurement-sales`, `party-subledger`.
3. [x] Customer receipt allocates invoices and clears receivable without duplicate revenue — `pricing-payment`.
4. [x] Sales return reverses eligible revenue/COGS/tax and restores the same physical unit — `procurement-sales`.
5. [x] Purchase receipt creates inventory movement and the configured receipt accrual/payable — `procurement-sales`.
6. [—] Separate supplier invoice clearing a receipt accrual — **not applicable by design**: the received GRN
   is the payable-recognising document, so no second recognition exists to clear. Adding an AP invoice
   would be a new module, not a fix; see `MASTER-SCOPE-AUDIT.md` §13.
7. [x] Supplier payment clears payable without duplicate expense or inventory — `pricing-payment`.
8. [x] Supplier return reverses stock and payable/source accrual correctly — `procurement-sales`.
9. [x] Dual-identifier device remains one stock unit through receipt, transfer, sale, and return — `procurement-sales`.
10. [x] Stock transfer preserves company ownership and complete custody history — `inventory-controls`
    (transfers post dispatch and receipt atomically; there is no separate in-transit document state).
11. [x] Stocktake variance requires independent approval and posts stock plus GL atomically — `inventory-controls`.
12. [x] Manual journal passes maker–checker–poster and rejects imbalance/control-account misuse — `journal-workflow`.
13. [x] Posted journal correction creates a linked opposite voucher and preserves the original — `journal-workflow`.
14. [x] Closed period rejects source and manual posting; independent reopen is audited — `finance-controls`.
15. [x] Bank statement matching reconciles book and statement adjusted balances exactly — `banking`.
16. [x] Asset acquisition, monthly depreciation and disposal reconcile cost, accumulated depreciation,
    NBV and gain/loss — `fixed-assets`.
17. [x] Incentive payable accrues once, adjusts for returns, and settlement clears the liability only — `incentives`.
18. [x] Supplier incentive receivable accrues once and the receipt clears the asset only — `incentives`.
19. [x] Supplier/customer rebate accrual and settlement reconcile without second recognition — `rebates`.
20. [x] Trial balance, P&L, balance sheet, cash flow, subledgers, bank, inventory valuation and dashboards
    reconcile for one fiscal period — `reporting`, `operational-reconciliation`.

## Release deliverables

- [x] Source modules with connected UI
- [x] API reference ([`API.md`](API.md))
- [x] Unit suite (50 tests) plus 20 database-backed acceptance suites
- [x] Secure production admin initialisation ([`DEPLOYMENT.md`](DEPLOYMENT.md), `npm run admin:init`)
- [x] Deployment and environment guide ([`DEPLOYMENT.md`](DEPLOYMENT.md))
- [x] Backup, restore and disaster-recovery guide ([`BACKUP_RESTORE.md`](BACKUP_RESTORE.md))
- [x] Role design and segregation guide ([`PERMISSION_MATRIX.md`](PERMISSION_MATRIX.md))
- [x] LAN, printer, barcode and scanner guide ([`LAN-PRINTER-SCANNER.md`](LAN-PRINTER-SCANNER.md))
- [x] Troubleshooting runbook (in [`DEPLOYMENT.md`](DEPLOYMENT.md) and [`OPERATIONS_GUIDE.md`](OPERATIONS_GUIDE.md))
- [x] Acceptance evidence pack ([`ACCEPTANCE-MATRIX.md`](ACCEPTANCE-MATRIX.md))
- [x] Output, label and schedule guide ([`OUTPUT-AND-SCHEDULES.md`](OUTPUT-AND-SCHEDULES.md))
- [x] Commercial control guide ([`POLICY-CONTROLS.md`](POLICY-CONTROLS.md))
- [ ] Soak/load test with real branch traffic (production cut-over task)
