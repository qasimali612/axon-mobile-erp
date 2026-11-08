# Phase 1 Implementation Report — Authoritative Registers, Dashboards, and Draft Lifecycle

**Date:** 2026-10-28  
**Delivery status:** Phase 1 completed and production-smoke-tested. The full master ERP scope remains in progress; this is not the final completion report.

## Screens delivered or upgraded

- **Procurement dashboard — `/purchases/dashboard`**
  - Date, branch, warehouse, supplier, buyer, product, model, color, and status filters.
  - Database-backed purchase value, approved PO, posted monthly purchase, pending delivery, and overdue metrics.
  - Recent PO fulfillment, workflow distribution, expected deliveries, and supplier concentration.
- **Sales dashboard — `/sales/dashboard`**
  - Date, branch, warehouse, customer, salesperson, product, model, and color filters.
  - Posted sales, actual-cost gross profit, open payments, partial payments, overdue invoices, and returns.
  - Sales summaries by branch, product, model, and customer.
- **Purchase/GRN register**
  - Accurate server aggregate cards instead of loaded-page counts.
  - Debounced search, date/status filtering, page-size selection, and visible pagination.
  - Dedicated reusable goods-receipt route at `/goods-receipts`.
- **Sales invoice register**
  - Server pagination, dates, document/payment status, barcode/SKU/IMEI search, filtered sales, paid, and outstanding amounts.
  - Draft edit, audited draft cancellation, print, workflow, and record-payment actions.
- **Sales draft editor — `/sales/[id]/edit`**
  - Reopens persistent lines and physical-unit identifiers.
  - Supports rescanning, line edits, dates, due date, notes, server recalculation, save, and save/submit.
  - Draft edit/cancel has no inventory or accounting effect.
- **Payments**
  - Fixed the server-render crash on `/finance/payments`.
  - Invoice links can prefill customer, branch, source invoice, amount, allocation, reference, and open the payment form.
- **Navigation**
  - Added compact Inventory, Procurement, and Sales groups without creating duplicate business modules.
  - Added dashboard, PO, GRN, return, party, payment, and report links.

## APIs and services

- Extended `GET /api/purchases/orders` with server filters, search, sort, pagination, fulfillment quantities, status totals, and monetary aggregates.
- Extended `GET /api/purchases/receipts` with server filters, inspection/type filters, search, sort, pagination, accepted/rejected quantities, posted payment allocations, and monetary aggregates.
- Extended `GET /api/sales/invoices` with server filters, product/barcode/IMEI search, sort, pagination, payment state, paid/outstanding amounts, status totals, quantity, COGS, and monetary aggregates.
- Added `GET/PATCH /api/sales/invoices/[id]` with lines, identifiers, payments, returns, stock movements, attachments, and audit history.
- Added `POST /api/sales/invoices/[id]/cancel` for preparer-owned drafts with a mandatory audited reason.
- Added `updateSalesInvoiceDraft` and `cancelSalesInvoiceDraft` operation services.
- Sales draft create/update now validates company currency, branch-eligible customer, dispatch warehouse, active company salesperson, product/variant/tax policy, minimum price, duplicate units, tracking method, and physical-unit warehouse/status/product identity.
- Added exact document-scope handling through `permittedDocumentScopes`.
- Migrated procurement, receipt, sales, inventory, return, return-source, operational-lookup, and operational-report reads from branch-only reduction to branch/warehouse OR-of-scopes.

## Stock and accounting behavior

- No posting model was replaced.
- Dashboard/register queries are read-only.
- Sales draft create/edit/cancel remains stock-neutral and journal-neutral.
- Existing receipt, sales, return, and payment posting remains transactionally integrated with movement and journal authority.
- Sales payment status is derived only from posted customer receipt/refund allocations.
- Invoice outstanding amounts are server-derived; client totals remain display-only.

## Database migrations

- **No migration was required for Phase 1.** Existing normalized tables and indexes support these changes.
- The deployed migration level remains 23 migrations through `20261027002300_physical_unit_custody_consistency`.

## Permission and isolation behavior

- All new routes require existing authenticated permissions.
- Dashboard and register data remains company-scoped.
- Exact company-wide, branch-wide, and warehouse-only role assignments are preserved in list/report filters.
- Sales draft edit/cancel requires `SALES_INVOICE_CREATE`, exact document scope, DRAFT state, and the original preparer.
- Payment creation remains protected by `PAYMENT_CREATE`; source prefill does not weaken approval/posting validation.

## Verification completed

- Custom project TypeScript suites: passed.
- Targeted ESLint for all changed files: passed.
- Optimized Next.js production build: passed, 70 static generations and all dynamic routes traced.
- Authenticated production smoke tests returned HTTP 200 for:
  - procurement dashboard;
  - sales dashboard;
  - PO, GRN, and sales list APIs with enriched contracts;
  - dedicated GRN register;
  - finance payments page and API;
  - operational lookups;
  - stock balances, units, and movements;
  - sales/purchase return lists and source searches;
  - all nine current operational report types.
- Sales draft create → detail → PATCH edit → edit-page render was verified against a temporary quantity-product draft.
- The temporary draft was cancelled through the audited API, leaving no stock or journal effect.
- `/finance/payments`, which had previously returned HTTP 500, now returns HTTP 200.

## Known limitations / next phase

- Posted sales invoice reversal and posted GRN reversal remain incomplete.
- Dedicated customer/supplier statements and AR/AP aging remain incomplete.
- A full device lifecycle page, transfers, adjustments/counts, bin enforcement, and expanded batch/expiry work remain incomplete.
- Separate supplier invoice / 3-way-match / GRNI behavior requires an explicit scope decision.
- Downloadable PDF, thermal print acceptance, camera scanning, saved filters, and amount-in-words remain incomplete.
- The full 45-scenario master acceptance matrix is not yet complete; existing operational acceptance and reconciliation suites must be expanded rather than treated as final coverage.

For the complete audit and phased backlog, see `docs/MASTER-SCOPE-AUDIT.md`.
