-- A sales draft, scan, submission, or approval must not change physical or
-- available stock. Release legacy draft reservations; posting now locks and
-- validates stock atomically in the sale transaction.
SELECT set_config('app.inventory_posting', 'on', false);

UPDATE "PhysicalStockUnit" u
SET "status" = 'IN_STOCK', "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
WHERE u."status" = 'RESERVED'
  AND EXISTS (
    SELECT 1 FROM "InventoryReservation" r
    JOIN "SalesInvoice" i ON i."id" = r."sourceId"
    WHERE r."sourceType" = 'SalesInvoice' AND r."stockUnitId" = u."id" AND r."releasedAt" IS NULL
      AND i."status" <> 'POSTED'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "InventoryMovement" m WHERE m."stockUnitId" = u."id" AND m."movementType" = 'SALE_ISSUE'
  );

UPDATE "InventoryReservation"
SET "releasedAt" = CURRENT_TIMESTAMP
WHERE "sourceType" = 'SalesInvoice' AND "releasedAt" IS NULL;

SELECT set_config('app.inventory_posting', 'off', false);
