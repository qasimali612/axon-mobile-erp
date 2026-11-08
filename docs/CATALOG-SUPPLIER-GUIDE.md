# Catalog depth and supplier item codes

Covers the fields added in the delivery phase so buying decisions can be made inside the ERP without a
spreadsheet on the side.

## 1. Product depth fields

| Field | Where | What it does |
| --- | --- | --- |
| Description | Product catalog → product form | Free text used on documents and reports; never affects pricing |
| Reorder level | Product form | Quantity at or below which the variant counts as low stock |
| Maximum stock level | Product form | Target cover used to size a reorder suggestion; `0` means "not set" |
| Preferred supplier | Product form | Default vendor for suggestions and for matching a supplier item code |

`maxStockLevel = 0` falls back to `2 × reorderLevel` when a suggested order quantity is calculated, so
a product with only a reorder level still produces a usable suggestion.

## 2. Supplier item codes

Suppliers rarely use your SKU. Each supplier can be given its own item code, last quoted cost, lead
time and minimum order quantity for an existing product or variant.

* One code per supplier — duplicate codes for the same supplier are rejected (`409`).
* Inactive suppliers cannot receive new codes.
* A variant code must belong to the selected product.
* Editing a code keeps history: the change is written to the audit log with previous and new values.

Screen: **Catalog → Supplier item codes** (`/catalog/supplier-items`). API:
`GET|POST /api/catalog/supplier-items`, `PATCH /api/catalog/supplier-items/:id`.
Reads use `catalog.product.view`; writes use `catalog.product.edit` — no new permission surface.

## 3. Reorder suggestions

**Reports & exports → Operations → Reorder suggestions** (`report=reorder`) lists every active variant
whose on-hand quantity is at or below its reorder level, with:

* on hand, reorder level, maximum level and the resulting shortfall;
* suggested order quantity (target minus on hand, never negative);
* preferred supplier, that supplier's item code, last quoted cost, lead time and minimum order
  quantity;
* last cost only when the caller holds a cost permission — otherwise the column is omitted from both
  the screen and the CSV.

The report is sorted by shortfall, so the first rows are the most urgent purchases. Export to CSV uses
the same audited endpoint as every other operational report (`OPERATIONAL_REPORT_EXPORTED`).

## 4. Operating notes

* Supplier item codes are commercial reference data. They never move stock, create payables or post to
  the ledger — only a posted goods receipt does that.
* The reorder report reads `StockBalance`, which is rebuilt from the movement ledger, so a suggestion
  can never be based on a stale hand-entered figure.
* Suggested quantities are a buying hint, not an approval. Raising the purchase order still follows the
  normal submit → approve → receive flow, and purchase orders remain optional.
