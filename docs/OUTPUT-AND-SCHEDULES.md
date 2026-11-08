# Output, labels and scheduled exports

How documents leave the system: server-side PDF, 80 mm thermal receipts, device label sheets, saved
views and recurring export schedules.

## 1. Server-side PDF

`GET /api/documents/{invoice|grn|purchase-order}/:id/pdf`

* Loads the same record the print page uses, so amounts and IMEIs cannot diverge.
* Renders A4 with the company header, party block, line table (including IMEI identifiers), totals and
  a signature/footer line naming the preparer, approver and poster.
* Returns `application/pdf`, inline, `Cache-Control: no-store`.
* Requires `sales.view` (invoice) or `purchase.view` (GRN, PO), plus branch scope.
* Writes `DOCUMENT_PDF_GENERATED` with the byte count.

The renderer is a small dependency-free PDF writer (`src/lib/pdf/simple-pdf.ts`) that uses the built-in
Helvetica fonts. No headless browser is involved, so the deployment has no Chromium dependency, and
Latin-1 text is transliterated rather than dropped. Reachable from the invoice print page
(**Server PDF**).

## 2. 80 mm thermal receipt

`/sales/:id/receipt` renders the sale as an 80 mm roll: company block, receipt number and time,
cashier, customer, compact line table with IMEI lines, tax summary, total and return policy. Print with
the receipt printer preset, margins **none**, scaling **actual size**.

Only posted invoices print the "posted sale" footer; a draft or unapproved invoice prints
`UNPOSTED — not a valid sale yet`.

## 3. Device label sheet

`/inventory/labels?units=id1,id2,…` (max 120) or `/inventory/labels?warehouseId=…&limit=24`.

* Each label carries product and variant, a Code128 barcode of the primary IMEI (or the unit id when
  no identifier exists), every IMEI on the label text, the warehouse and a short unit reference.
* Barcodes are generated with `bwip-js` server-side, so the printed barcode always matches the device
  registry posted by receiving or returns.
* Sized for 50 × 25 mm label stock, three across on A4; the `label-sheet` grid keeps labels from
  splitting across pages.

## 4. Saved views

`GET|POST /api/reports/saved-views`, `DELETE /api/reports/saved-views/:id` (module `operations`).

* A view stores the report key plus the filter set as JSON.
* Views are private to the user unless marked shared; duplicate names per user and screen are
  rejected.
* The operations workspace shows a **Saved views** bar: apply, save the current filters, delete.
* Filters are replayed through the normal query string, so the server re-validates every value —
  a saved view can never widen a user's scope.

## 5. Report schedules

`GET|POST /api/reports/schedules`, `PATCH|DELETE /api/reports/schedules/:id`,
`POST /api/reports/schedules/:id/run`. Permission: `report.export`. Screen:
**Reports & exports → Report schedules** (`/reports/schedules`).

A schedule stores a name, a report key, a filter map, a cadence (`DAILY`, `WEEKLY`, `MONTHLY`),
recipients and an active flag. **Run now** executes the same audited CSV endpoint a person would use,
records `lastRunAt`, `lastRunStatus` and `lastRunRows`, writes `REPORT_SCHEDULE_RUN`, and streams the
file back for inspection.

Because the application keeps no in-process timer, delivery is driven by the host scheduler:

```bash
# cron / Task Scheduler, hourly
cd /opt/axon-erp && npm run reports:run-schedules
```

The runner decides what is due (a schedule that already ran inside its cadence is skipped), creates a
short-lived session for the schedule's owner, calls the audited CSV endpoint, writes
`exports/<name>-<date>.csv`, and deletes the session. Nothing is queued in memory, so a restart cannot
double-run or lose a schedule.

Recipients are stored on the definition but **not emailed** by the application: point the host's mail
relay or an SMB share at the `exports` folder. This is deliberate — the ERP does not pretend to own
an SMTP configuration it cannot verify.

## 6. Verification

`npm run test:enhancements-acceptance` asserts: a real PDF (`%PDF-` header, > 1 KB, audited), the
thermal receipt and label sheet rendering for the owner, saved-view privacy between two users,
upload-free schedule creation, a schedule run producing a BOM-prefixed CSV with recorded row counts,
and the pause-then-refuse behaviour of an inactive schedule.
