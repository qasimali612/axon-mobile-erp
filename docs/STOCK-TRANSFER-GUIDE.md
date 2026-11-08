# Stock Transfer Operations Guide

**Implemented:** 2026-10-28  
**Route:** `/inventory/transfers`

## Purpose

Stock transfers move existing inventory between company warehouses without creating a purchase, sale, expense, revenue, or duplicate stock ledger. The authoritative effects remain `InventoryMovement`, `StockBalance`, and `PhysicalStockUnit`.

## Supported stock

- Quantity-tracked products.
- Batch/lot-tracked products, with the source lot retained at the destination.
- IMEI-tracked physical units, including dual-SIM phones. Either IMEI identifies the same single stock unit.
- Serial-tracked physical units.
- Multiple products and tracking methods on one transfer.
- Same-branch and cross-branch warehouse transfers.

## Operator workflow

1. Open **Inventory → Stock transfers**.
2. Choose an active dispatch-enabled source warehouse.
3. Choose a different active receiving-enabled destination warehouse.
4. Enter the transfer date and business reason.
5. For IMEI/serial stock, scan or enter an identifier. The application resolves and selects the physical unit.
6. For quantity/batch stock, select an available balance and enter the quantity.
7. Save the document. It remains a stock-neutral draft.
8. Either post directly with dispatch/receive authority, or use the optional submit/approve path before posting.
9. Review the paired OUT/IN movement audit in the transfer detail.

## Posting controls

The server re-locks and revalidates all stock during one serializable database transaction:

- company, branch, warehouse and permission scope;
- source dispatch and destination receiving flags;
- product/variant active state and tracking method;
- source quantity and active reservations;
- physical-unit status, product identity, source custody and active reservations;
- open posting period;
- exact-once movement idempotency;
- movement quantity and inventory value;
- destination custody for physical units.

A quantity line creates one `TRANSFER_OUT` and one `TRANSFER_IN` movement. Each serialized unit creates its own paired OUT/IN movements. Transfers have no GL journal because they move inventory value without changing total company assets.

## Permissions

- `inventory.transfer.view` — view transfers in either participating warehouse scope.
- `inventory.transfer.create` — create/edit/submit a draft; required in both participating scopes.
- `inventory.transfer.approve` — approve, cancel submitted documents, and authorize reversal; required in both scopes.
- `inventory.transfer.dispatch` — required at the posting source.
- `inventory.transfer.receive` — required at the posting destination.

Posting a reversal applies dispatch permission to the original destination and receive permission to the original source.

## Corrections

- An unposted transfer may be cancelled. A preparer can cancel their own draft; later states require approval authority.
- Posted transfer data and movement rows cannot be edited or deleted.
- Use **Reverse** on a posted transfer. The system creates and posts a separate linked transfer in the opposite direction.
- Reversal requires the stock to remain available at the current warehouse.
- Every reversal movement links to and exactly negates one original movement. The original is marked `REVERSED`; both documents remain in audit history.

## Intentional limitations

The implemented workflow is a direct, atomic warehouse-to-warehouse transfer. It does not yet provide a two-stage in-transit dispatch/receipt process. Add that only if operational transit custody is required. Dedicated transfer print/PDF and report/export formats also remain follow-up items.

## Verification

Run against a migrated test database and production server:

```bash
DATABASE_URL='postgresql://...' \
OPERATIONS_TEST_BASE_URL='http://127.0.0.1:3000' \
./node_modules/.bin/tsx scripts/verify-stock-transfer-acceptance.ts

DATABASE_URL='postgresql://...' \
./node_modules/.bin/tsx scripts/verify-operational-reconciliation.ts
```

The acceptance test covers authorization denial, invalid warehouse direction, insufficient stock, mixed quantity/IMEI draft neutrality, create/post/reversal idempotency, exact movement counts, custody, posted immutability, value restoration, and reversal linkage.
