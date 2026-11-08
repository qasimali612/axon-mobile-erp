-- currentBranch/currentWarehouse/currentLocation describe present physical
-- custody, not acquisition history. Sold, vendor-returned, and scrapped units
-- are no longer held by a company warehouse.
SELECT set_config('app.inventory_posting', 'on', true);

UPDATE "PhysicalStockUnit"
SET "currentBranchId" = NULL, "currentWarehouseId" = NULL, "currentLocationId" = NULL
WHERE "status" IN ('SOLD','RETURNED','SCRAPPED');

UPDATE "PhysicalStockUnit" SET "soldAt" = NULL
WHERE "status" <> 'SOLD' AND "soldAt" IS NOT NULL;

ALTER TABLE "PhysicalStockUnit"
  ADD CONSTRAINT "PhysicalStockUnit_custody_status_check" CHECK (
    ("status" NOT IN ('SOLD','RETURNED','SCRAPPED') OR
      ("currentBranchId" IS NULL AND "currentWarehouseId" IS NULL AND "currentLocationId" IS NULL))
    AND
    ("status" NOT IN ('IN_STOCK','RESERVED','QUARANTINED') OR
      ("currentBranchId" IS NOT NULL AND "currentWarehouseId" IS NOT NULL))
  );
