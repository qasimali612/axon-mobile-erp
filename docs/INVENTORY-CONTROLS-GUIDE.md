# Inventory Controls Guide

**Released:** 2026-10-28  
**Applies to:** stock adjustments and physical stock counts

## Stock adjustments

Use **Inventory → Stock adjustments** for authorized stock gains and losses that are not represented by purchasing, sales, returns, or transfers.

1. Select an authorized branch warehouse and adjustment date.
2. Enter a reason code and a clear business reason.
3. Add one or more product/variant lines. A document may contain both gains and losses.
4. For quantity stock, enter the signed business effect and unit cost. Negative lines are re-costed from the authoritative stock balance during posting.
5. For an IMEI/serial loss, scan/select the exact physical unit already in the warehouse.
6. For a new IMEI/serial gain, enter one physical device per row. Two comma-separated IMEIs on one row remain one dual-SIM stock unit.
7. Save the draft and submit it. Draft and submitted adjustments do not change stock or accounting.
8. A different officer with `inventory.stock.approve_adjustment` posts the adjustment.

Posting atomically writes the existing `InventoryMovement` authority, balance projection, physical-unit custody/status, a balanced inventory gain/loss journal, and audit history. Repeating the post is idempotent.

Posted adjustments are immutable. An authorized correction creates and posts an exact linked opposite adjustment and journal. A physical-count-generated adjustment cannot be reversed independently; record a later controlled correction instead so the posted count remains internally consistent.

## Physical stock counts

Use **Inventory → Physical stock counts** for a full warehouse count or a selected cycle count.

1. Choose the warehouse, date, scope, and reason.
2. Starting the count captures expected quantity, value, and serialized-unit custody at one instant. It does not reserve or change stock.
3. Enter physical quantities for quantity-tracked lines.
4. Scan expected IMEI/serial units. Missing expected units remain uncounted. Unexpected/found serialized stock must be investigated and entered through a controlled adjustment rather than silently registered during a count.
5. Save results and submit the count.
6. A different officer with `inventory.stocktake.post` posts it.

Before posting, the server locks and rechecks every snapshotted balance/value and serialized-unit set. If stock changed after the snapshot, posting is rejected; cancel and start a fresh count. A valid variance is converted into one generated `StockAdjustment` and posted through the same inventory/accounting path. A zero-variance count creates no adjustment.

## Controls

- Authentication, company, branch, warehouse, permission, date, open-period, document-state, and active-master checks are server enforced.
- Quantity losses are reservation-aware and cannot consume actively reserved stock.
- IMEI/serial values are normalized, validated, unique, and linked to one physical unit.
- Posted movement and journal effects are database-verified against normalized lines.
- Posted children and history cannot be edited or deleted.
- Count snapshots, scanned-unit flags, generated adjustments, movement links, journal links, actors, and audit events are retained.

## Verification

- `npm run test:inventory-controls-acceptance`
- `npm run test:operational-reconciliation`
- `npm test`

The acceptance suite covers permission denial, mixed quantity/dual-IMEI effects, cancellation, maker-checker posting, exactly-once posting, immutable history, exact reversal, quantity and serialized count variance, generated-adjustment enforcement, stale snapshots, authenticated UI rendering, global search, and final whole-ledger reconciliation.
