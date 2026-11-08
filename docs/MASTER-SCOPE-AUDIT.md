# Mobile Phone Inventory ERP — Master Scope Audit

**Audit date:** 2026-10-29 · **delivery status appended 2026-10-30**  
**Basis:** Direct review of the current Prisma schema, 39 forward migrations through `20261028001600_incentive_rebate_controls`, authenticated APIs, server-side operation/finance services, ERP routes, UI components, permissions, and verification scripts. See `docs/CURRENT-MODULE-GAP-MATRIX.md` for the latest module-by-module checkpoint.  
**Scope rule:** This document describes the existing application and implementation gaps. It does not characterize the current vertical slice as the completed production ERP.

## Status legend

- **Implemented** — persistent, database-backed behavior exists end-to-end.
- **Partial** — a working foundation exists, but one or more requested controls/screens are incomplete.
- **Missing** — no complete end-to-end implementation exists yet.
- **Excluded** — deliberately outside this project by instruction.

## 1. Existing architecture to preserve

| Area | Actual implementation | Status |
|---|---|---|
| Application | Next.js App Router, TypeScript, React, Tailwind-based in-project design system | Implemented |
| Database | PostgreSQL-compatible Prisma schema; local preview uses persistent PGlite socket | Implemented |
| Migrations | 39 forward migrations deployed through `20261028001600_incentive_rebate_controls` | Implemented |
| Finance transaction modules | Bank reconciliation, fixed assets, budgets, incentives (payable and supplier) and rebates (payable and receivable) with accrual/posting/settlement workflows | Implemented core |
| Authentication | Server sessions, secure cookies, password hashing, forced password rotation, preview-only fingerprint fallback gated by environment | Implemented |
| Authorization | Permission grants through scoped roles with branch/warehouse assignments | Implemented; list/report warehouse scoping needs systematic hardening |
| Audit | Append-only `AuditLog` events for operational state changes | Implemented |
| Money | Prisma Decimal plus server calculation helpers | Implemented |
| Posting | Serializable transactions, row locks, idempotency keys, state validation | Implemented in core purchase/receipt/sale/return/payment posting paths |
| Accounting | Operational journals with balanced lines and source-document links | Implemented for current posting paths |
| Inventory | Movement ledger, balances, physical units, identifiers, lots, reservations | Implemented foundation |

No replacement architecture or duplicate purchasing, sales, inventory, or accounting entities should be introduced.

## 2. Data-model audit

### Implemented normalized entities

- Company, branch, warehouse, warehouse location, user, role, permission, scoped role assignment, session.
- Product, product variant, barcode, category, brand, unit of measure, tax rule, price history.
- Purchase order and lines.
- Purchase receipt/GRN and lines, unit scans, inspection records, document attachments.
- Physical stock unit and multiple identifiers per unit.
- Inventory lot, stock balance, inventory movement, and reservation.
- Stock transfer header, normalized lines, and selected physical-unit links.
- Sales invoice, lines, and physical-unit links.
- Sales/purchase stock return, lines, and physical-unit links.
- Payment and invoice/receipt allocations.
- Chart of accounts, journal entry/lines, banking, fiscal periods, budgets, assets, incentives, and rebates.
- Audit and operational sequence/idempotency support.

### Correct existing invariants

- A dual-SIM device is one `PhysicalStockUnit` with multiple unique `DeviceIdentifier` rows; quantity remains one.
- IMEI and serial uniqueness is company-scoped.
- Quantity products do not require physical-unit identifiers.
- Posted source records retain immutable state and source references.
- Stock movements are the posting authority; balances carry optimistic versions.
- PO ordered and received quantities are separate.
- Payment allocations link posted payments to sales invoices or purchase receipts.

### Schema/control gaps

| Requirement | Finding | Status / action |
|---|---|---|
| Purchase requisition | No requisition header/line/workflow | Missing; add only if retained in approved phase scope |
| RFQ / quotation comparison | No RFQ or quote entities | Missing |
| Supplier commercial invoice separate from GRN | Current `PurchaseReceipt` carries invoice number/date/due date and creates payable | Partial; decide whether separate AP invoice/3-way-match is required before schema work |
| 3-way match | PO-to-GRN linkage exists; no separate supplier-invoice match record/tolerance workflow | Partial |
| Inventory transfer | Multi-line quantity/lot/IMEI/serial transfer documents, stock-neutral drafts, atomic ledger posting, custody movement, exact reversal, permissions, audit, UI and reconciliation are implemented | Implemented core; optional in-transit, print, and dedicated reporting remain |
| Stock adjustment/count | Controlled normalized adjustments, two-person posting, quantity/IMEI/serial custody, GL, exact reversal, snapshot counts, stale checks, scanner entry, generated variance adjustments, UI, audit and reconciliation | Implemented core |
| Sales order / quotation | Sales invoice/POS exists; no separate quote/order workflow | Missing |
| Credit note / sales reversal | Linked exact-once posted invoice reversal is implemented; dedicated credit-note numbering/layout remains separate from source-linked sales returns | Partial |
| GRN reversal | Linked exact-once posted receipt reversal, PO projection rollback, stock/journal inversion, UI and audit are implemented | Implemented |
| Configurable approval thresholds | Maker/checker/poster is enforced; no persisted amount/discount threshold policy engine | Partial |
| Credit-limit policy | Customer credit limit exists; sales posting does not yet expose a full configurable override/approval workflow | Partial |
| Saved filters | No persisted user filter/view entity | Missing |
| Notification rules | Notification foundation exists; no complete overdue/reorder/approval policy engine | Partial |
| Offline sync | No offline synchronization architecture found | Not applicable unless explicitly required later; online posting remains authoritative |

## 3. Procurement audit

### Purchase orders

**Implemented**

- Multi-line draft creation and draft update.
- Active supplier/product/variant validation.
- Server-side tax and total recalculation using decimals.
- Idempotent creation and unique operational numbering.
- Draft → submitted → approved workflow with maker/checker control.
- Rejection, cancellation, and close actions with audited reasons.
- Partial/full receipt fulfillment state.
- Print route and document attachments.
- Branch and warehouse fields on every document.

**Gaps**

- Duplicate/copy action is not implemented.
- No dedicated read-only PO detail page; edit and print routes carry most details.
- Register originally exposed only basic search/status and page-limited cards. Server totals, rich filters, dates, sorting, and pagination are being added in the current phase.
- No persisted purchase type, department, project, or requisition linkage.
- Approval history is in audit records but not presented as an integrated timeline on the PO screen.
- No PO PDF file generation/download; browser print is available.
- No configurable amount-based approval threshold.
- Supplier price history is not surfaced directly in line selection.

### Goods receiving / GRN

**Implemented**

- PO-based and authorized direct receipts.
- Multiple receipts against one PO.
- Over-receipt rejected unless explicit permission/reason allows it.
- Draft update before posting.
- IMEI/serial scan entry and spreadsheet import.
- Multi-identifier physical units.
- Quantity products without IMEI requirements.
- Inspection-required workflow, accepted/rejected quantities, per-unit inspection status.
- Landed-cost allocation for document discount, freight, and other charges.
- Approval and atomic stock/GL posting.
- Duplicate identifier and duplicate-post protection.
- Posted journal and inventory source traceability.
- Print and barcode/label foundation.

**Gaps**

- A dedicated goods-receipt register route was absent; it is being added as `/goods-receipts` while reusing the existing receipt manager.
- Barcode camera scanning is not implemented.
- Bin/location assignment is modeled but not fully presented in the receiving editor.
- Lot/batch expiry UI coverage is incomplete for all tracking methods.
- Received-versus-ordered difference view needs a richer line presentation.
- Posted receipt reversal is complete end-to-end with linked negative documents, inventory/journal inversion, PO rollback, segregation, period checks, and audit.
- Receipt register needs payment status/open payable and additional server-side filters in the UI.
- Thermal and A4 receipt-specific layouts need formal acceptance testing.

## 4. Sales audit

### Sales invoice / POS

**Implemented**

- Mixed product invoice draft creation.
- Product/SKU/barcode and IMEI resolution.
- Either IMEI on a dual-SIM device resolves to the same physical unit.
- Duplicate-unit, unavailable-unit, insufficient-stock, below-minimum-price, inactive-item, and invalid-tax checks.
- Server-authoritative subtotal/discount/tax/grand-total calculation.
- Draft → submitted → approved → posted workflow.
- Draft/submit/approve do not issue stock.
- Posting re-locks and revalidates stock and physical units.
- Atomic stock issue, custody state, actual-cost COGS, receivable/revenue/tax journal, and audit.
- Browser print invoice.
- Posted payment allocations can be derived from payment records.

**Gaps**

- Drafts can now be reopened and edited through a dedicated scoped API/page; a unified read-only posted-document timeline page is still incomplete.
- The detail API now exposes history, payments, returns, stock movements, identifiers, and attachments, but this is not yet presented as a complete tabbed detail screen.
- No duplicate/copy invoice action.
- Pre-posting cancellation and linked posted-invoice reversal are implemented with audit, inverse inventory/COGS/journals, segregation, period checks, and unsafe-return/consumed-stock blockers; source-linked returns remain a separate business process.
- No explicit configurable discount-override approval policy.
- Credit-limit hold/override workflow is incomplete.
- The register now has database-wide totals, payment status, outstanding amount, barcode/SKU/IMEI search, dates, and visible server pagination; additional selector filters remain to be exposed in the register UI.
- No amount-in-words output.
- No downloadable PDF or tested thermal invoice layout.
- Camera barcode scanning is not implemented.

### Returns

**Implemented**

- Sales and purchase return types.
- Source document/line validation.
- Quantity and physical-unit return validation.
- Over-return prevention.
- Disposition and condition capture.
- Approval and atomic inventory/accounting posting.
- Returned serialized custody restoration for accepted stock.

**Gaps**

- Dedicated sales-return and purchase-return register routes are query-filtered views of one workspace rather than separate modules, by design.
- Credit-note/debit-note numbering and dedicated print documents are not complete.
- Return authorization policy and reason-code master are not configurable.

## 5. Payments and finance audit

**Implemented**

- Customer receipts/refunds and supplier payments/refunds.
- Cash or bank settlement account.
- Invoice/receipt allocation.
- Allocation cannot exceed open posted document amount.
- Maker/checker/poster workflow.
- Atomic balanced payment journal.
- Payment register and finance dashboards/reports foundation.
- Fiscal periods and close checks in accounting services.

**Gaps**

- Direct “record payment” from a sales invoice now prefills the payment/allocation form; equivalent receipt-side navigation and open-amount presentation need completion.
- Unallocated credit/on-account presentation is incomplete.
- Customer statement and supplier statement screens are not complete dedicated workflows.
- Aging and payment status must be exposed consistently in sales/procurement registers and dashboards.
- The previously observed `/finance/payments` HTTP 500 was traced to an undefined target-list filter, fixed, rebuilt, and authenticated-smoke-tested at HTTP 200.
- Refund/reversal UI coverage is narrower than the underlying model.
- Receipt accounting currently recognizes payable at GRN; a separate AP invoice/GRNI model would be required if 3-way matching is mandated.

**Fixed assets (implemented core, 2026-10-29)**

- Category masters hold one cost account, one accumulated-depreciation account, one depreciation expense account, and one disposal gain/loss account; the mapping locks once any asset uses the category, while policy defaults and the active flag stay editable.
- Draft assets validate positive cost, residual below cost, and a depreciation policy (straight line needs a useful life, declining balance needs an annual rate). Drafts never post.
- Capitalization posts `Dr asset cost / Cr settlement` immediately through a system `ASSET` voucher and starts depreciation at the capitalization month end.
- Monthly schedule generation is idempotent per asset and month, uses cumulative rounding for straight line and rate-on-NBV for declining balance, and caps the charge at the remaining depreciable base.
- Depreciation posting writes one balanced journal per asset (`Dr depreciation expense / Cr accumulated depreciation`), rolls accumulated depreciation and net book value forward, and moves an asset to `FULLY_DEPRECIATED` at the residual floor.
- Disposal reverses cost and accumulated depreciation, records proceeds, posts gain or loss to the category disposal account, refuses to run while planned depreciation exists, and cannot be repeated.
- All four actions require an independent officer: the draft preparer (or schedule generator) can never approve and post their own fixed-asset journal, enforcing the same segregation of duties the database enforces on every voucher.
- Open limits: asset transfers between branches/custodians, revaluation/impairment, partial disposal, label printing, and a dedicated movement report.

## 6. Inventory and traceability audit

**Implemented**

- Quantity balances and valuation.
- Serialized physical units with multiple identifiers.
- Inventory movement ledger with source document and line references.
- Actual unit cost for serialized sale COGS.
- Reservation model and expiry.
- IMEI lookup and label generation.
- Reconciliation script comparing movement authority, balances, units, identifiers, documents, transfers, returns, and journals.
- Multi-product stock transfers with source/destination warehouse scope, quantity and per-device selection, posting-only effects, exact-once paired movements, custody updates, immutable history, and linked reversal.
- Transfer register/editor/detail UI, scanner-friendly IMEI/serial selection, availability endpoint, global search and authenticated acceptance coverage.

**Gaps**

- A dedicated scoped IMEI registry now shows identifiers, receipt/supplier, warehouse custody, reservation, sale/customer, returns, and append-only movement history in one lifecycle drawer.
- Transfer print/export and dedicated operational reporting remain open; an optional in-transit two-stage workflow should be added only if the business requires it.
- Adjustment and cycle-count core is complete; blind recounts, formal count sheets, dedicated variance analytics, and configurable reason masters remain.
- Reorder alerts and purchase suggestions are not complete.
- Bin-level movement and location enforcement need broader UI/API coverage.
- Batch/expiry reporting requires expansion.

## 7. Reports and dashboards audit

**Delivered operational reports** (server-rendered workspace + audited CSV export)

- Purchase orders, goods receipts, purchase returns.
- Sales, sales returns.
- Inventory stock, device/IMEI registry, inventory movements.
- Profitability (cost and margin columns gated by cost permission).

**Delivered finance reports**

- Trial balance, profit and loss, balance sheet, cash flow (statements CSV export).
- Budget variance, fixed-asset register, incentive register, rebate register (CSV + print).
- Customer and supplier statements with aging and residual allocation.
- `/reports` hub listing statements, the nine operational reports and the four registers.

**Gaps**

- Dedicated procurement and sales dashboard routes were absent; current phase adds database-backed `/purchases/dashboard` and `/sales/dashboard`.
- Customer/supplier control-account statements and AR/AP aging now have dedicated scoped APIs/screens and CSV export. Stock valuation, inventory aging, IMEI movement, tax, discount, and return reports still need dedicated or expanded report types.
- Branch/warehouse row scope, server pagination, date validation and export parity are now implemented across the operational reports and the register exports (`permittedDocumentScopes`, capped row limits, `YYYY-MM-DD` validation, audited CSV).
- Dashboard cards must link to matching filtered registers and never derive totals from only the loaded page.
- No saved views or scheduled reports.

## 8. Permissions and isolation audit

**Implemented**

- Server-side authentication on operational APIs.
- Per-action permissions for create, approve, post, cancel, inspect, override, return, payment, label, and reports.
- Scoped roles can carry branch and warehouse IDs.
- Detail/action APIs generally recheck branch and warehouse scope.

**Critical gap found**

Several list/report APIs reduced scoped roles to allowed branch IDs. A warehouse-scoped role could therefore receive rows from other warehouses in the same branch in list responses. Phase 1 introduced `permittedDocumentScopes`, preserving company-wide, branch-wide, and exact warehouse grants as an OR-of-scopes, and migrated the core procurement, receipt, sales, inventory, return, source-lookup, operational-lookup, dashboard, and operational-report reads. Remaining finance/party/export endpoints must be reviewed where their models support warehouse scope, and dedicated warehouse-scope fixtures still need regression coverage.

## 9. UI/UX and navigation audit

**Implemented**

- Responsive ERP shell, breadcrumbs, command search, location switcher, notifications, quick actions.
- Professional blue visual system.
- Loading/empty/error states on core screens.
- Confirmation before irreversible receipt/sale posting.
- Keyboard-friendly form controls and scanner-compatible text inputs.
- Professional login and forced-password-change flow without displayed credentials.

**Gaps**

- Navigation was too flat for the requested procurement and sales submodules; current phase reorganizes links while reusing existing routes.
- Several registers lacked visible pagination controls and accurate filtered totals.
- Responsive table alternatives need testing on narrow phones.
- Advanced searchable selectors are inconsistent.
- Posted document detail pages need integrated stock, journal, payment, return, attachment, and audit tabs.
- Print/PDF/thermal acceptance coverage is incomplete.

## 10. Acceptance-test coverage

### Existing automated coverage

- Authenticated procurement/sales acceptance harness: previously passed run `mvr1qeeb`.
- Whole-ledger operational reconciliation: passed for balances, units, identifiers, receipts, sales, returns, and balanced journals.
- Vitest: 4 files / 10 tests passed before the current phase.
- Production build: passed before the current phase.
- Dependency audit: zero known vulnerabilities before the current phase.

### Coverage still required for the master specification

1. All 45 named acceptance scenarios must be mapped one-to-one to test IDs.
2. Add concurrency races for duplicate IMEI receive, simultaneous sale, simultaneous return, and duplicate post.
3. Add warehouse-scope leakage tests for list, detail, report, export, and lookup APIs.
4. Add payment-state tests: unpaid, partial, paid, refund, overpayment rejection, overdue.
5. Add draft edit/cancel/reversal immutability tests.
6. Add closed-period posting/reversal tests.
7. Add product tracking-method matrix: IMEI, serial, batch, barcode/SKU quantity, and untracked quantity.
8. Add dashboard/register aggregate reconciliation tests.
9. Add print route and barcode-label smoke tests.
10. Add responsive and keyboard/scanner UI checks.

## 11. Phased implementation plan

### Phase 1 — Access safety and authoritative registers (completed 2026-10-28)

- Exact branch/warehouse list scoping.
- Dedicated procurement and sales dashboards.
- Dedicated receipt navigation.
- Server-side filters, sorting, pagination, aggregate totals, fulfillment, and payment state.
- Navigation reorganization without duplicate modules.
- Regression test finance payments and existing posting services.

### Phase 2 — Document lifecycle completeness (core completed 2026-10-28)

- Sales draft detail/edit service and page.
- Purchase/sales/receipt read-only detail timelines.
- Authorized cancellation/reversal for posted receipts and invoices.
- Prefilled sales payment creation and allocation.
- Integrated attachments, audit, stock movement, journal, returns, and payment detail.
- Duplicate/copy actions and receipt-side payment prefill remain follow-up usability items.

### Phase 3 — Ledgers, aging, and traceability (in progress)

- Dedicated end-to-end IMEI/device registry and lifecycle delivered in the current phase.
- Permission-aware global business-record search delivered in the current phase.
- Customer/supplier control-account statements, running balances, source drill-down, AR/AP aging, residual reconciliation, and CSV export delivered in the current phase.
- Scheduled/PDF statement distribution and collection workflow remain.
- Stock valuation, inventory aging, tax, discount, return, and identifier movement reports.
- Export parity and print/PDF improvements.

### Phase 4 — Inventory control completion (in progress)

- Core transfers delivered: normalized documents, quantity and serialized stock, posting, reversal, scope, UI, audit and reconciliation.
- Optional transfer print/report and in-transit workflow remain.
- Adjustment and cycle-count optional enhancements: blind recounts, print/export, reason masters, attachments, and variance analytics.
- Bin/location enforcement.
- Batch/expiry workflows.
- Reorder alerts and purchase suggestions.

### Phase 5 — Policy and advanced procurement

- Persisted approval and override policies.
- Credit-limit workflow.
- Optional requisition/RFQ/quotation comparison.
- Decide and, if approved, implement separate supplier invoice and 3-way match/GRNI flow.

### Phase 6 — Final hardening and delivery

- Execute all 45 acceptance tests plus concurrency/security/reconciliation suites.
- Sequential typecheck, lint, tests, build, migration deploy test, and production smoke.
- Environment example and secure initialization review.
- Backup/restore, roles, deployment, LAN, printer, scanner, and troubleshooting documentation.

## 12. Explicit exclusions

The following remain permanently excluded and must not be added to schema, migrations, routes, UI, reports, or seed data:

- Warranty
- WarrantyClaim
- RepairJob
- RepairJobPart
- ServiceCenter
- CollectionPoint

## 13. Delivery status (2026-10-30)

The audit above is preserved as the point-in-time picture; this section records what has since
closed.

**Closed**

| Audit item | Resolution |
| --- | --- |
| Report catalog and export parity (§7) | Nine operational reports, financial statements and four finance registers, all with server-generated, permission-gated, audited CSV; verified by `npm run test:reporting-acceptance` |
| Print parity (§7, §9) | Budget-version (with variance), fixed-asset, incentive and rebate register layouts added to PO/GRN/invoice/return documents |
| Acceptance coverage (§10) | 20-suite chain (`npm run acceptance:all`) covering tracking methods, IMEI duplication, concurrent posting, payment states, closed-period posting, reversal immutability, warehouse scope, register/ledger reconciliation, print routes, policy bands, discount/credit overrides, PDF, labels, saved views and schedules; smoke plus 32-request concurrency burst |
| Catalog depth (§7) | Description, min/max stock, preferred supplier and per-supplier item codes with quoted cost, lead time and minimum order; reorder suggestions read the movement-derived balance (`docs/CATALOG-SUPPLIER-GUIDE.md`) |
| Commercial policy engine (§8) | Amount-banded approval requirements, sales discount cap and credit-limit override with mandatory reasons; every refusal is audited even when its transaction rolls back (`docs/POLICY-CONTROLS.md`) |
| Output and delivery (§7, §9) | Server-side A4 PDF for invoice/GRN/PO, 80 mm thermal receipt, Code128 device label sheets, saved views and recurring report schedules (`docs/OUTPUT-AND-SCHEDULES.md`) |
| Migration safety | `npm run db:migration-rehearsal` verifies order, checksum drift, 107 guard triggers and a balanced ledger |
| Backup/restore | `npm run db:backup` checkpoints, archives, restores into a scratch cluster and compares migrations, guards, 13 row counts and ledger totals |
| Documentation | Deployment runbook, backup/restore runbook, LAN/printer/scanner guide, acceptance matrix and API reference |

**Still open (stated as optional, not defects)**

- Product imagery (catalog photos) and a bulk price/opening-balance importer; tiered quantity breaks and
  scheduled price-list rollover.
- Separate AP invoice with 3-way match / GRNI — only if the business asks for invoice matching on top
  of the direct-GRN payable; today POs, receipts and payables stay deliberately simple.
- Sales order/quotation documents; invoices remain simple and never require an order.
- Requisition/RFQ modules, if they are ever added to approved scope.
- Two-hour production soak test with real branch traffic; the release evidence is smoke-level latency
  under a 32-request burst.
- Email delivery of scheduled reports: schedules produce files into `exports/` and the host mail relay
  or share distributes them, because the ERP does not own an unverifiable SMTP configuration.

Everything in the exclusion list (§12) remains absent from schema, migrations, routes, UI and seed data.
