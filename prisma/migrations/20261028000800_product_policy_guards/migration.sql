-- Product inventory policy is immutable once any operational history exists.
-- This database guard closes API/concurrency bypasses without preventing descriptive edits.
CREATE OR REPLACE FUNCTION "guard_product_inventory_policy_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    OLD."productType" IS DISTINCT FROM NEW."productType"
    OR OLD."trackingMethod" IS DISTINCT FROM NEW."trackingMethod"
    OR OLD."costingMethod" IS DISTINCT FROM NEW."costingMethod"
    OR OLD."unitId" IS DISTINCT FROM NEW."unitId"
  ) AND (
    EXISTS (SELECT 1 FROM "PhysicalStockUnit" WHERE "productId" = OLD.id)
    OR EXISTS (SELECT 1 FROM "InventoryLot" WHERE "productId" = OLD.id)
    OR EXISTS (SELECT 1 FROM "StockBalance" WHERE "productId" = OLD.id)
    OR EXISTS (SELECT 1 FROM "InventoryMovement" WHERE "productId" = OLD.id)
    OR EXISTS (SELECT 1 FROM "InventoryReservation" WHERE "productId" = OLD.id)
    OR EXISTS (SELECT 1 FROM "PurchaseOrderLine" WHERE "productId" = OLD.id)
    OR EXISTS (SELECT 1 FROM "PurchaseReceiptLine" WHERE "productId" = OLD.id)
    OR EXISTS (SELECT 1 FROM "SalesInvoiceLine" WHERE "productId" = OLD.id)
    OR EXISTS (SELECT 1 FROM "StockReturnLine" WHERE "productId" = OLD.id)
    OR EXISTS (SELECT 1 FROM "StockTransferLine" WHERE "productId" = OLD.id)
    OR EXISTS (SELECT 1 FROM "StockAdjustmentLine" WHERE "productId" = OLD.id)
    OR EXISTS (SELECT 1 FROM "StockCountLine" WHERE "productId" = OLD.id)
  ) THEN
    RAISE EXCEPTION 'product inventory policy cannot change after operational history exists'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status::text = 'ARCHIVED' AND (
    EXISTS (SELECT 1 FROM "StockBalance" WHERE "productId" = OLD.id AND "quantity" <> 0)
    OR EXISTS (
      SELECT 1 FROM "PhysicalStockUnit"
      WHERE "productId" = OLD.id AND status::text IN ('IN_STOCK', 'RESERVED', 'IN_TRANSIT', 'QUARANTINED')
    )
    OR EXISTS (
      SELECT 1 FROM "InventoryReservation"
      WHERE "productId" = OLD.id AND "releasedAt" IS NULL AND ("expiresAt" IS NULL OR "expiresAt" > now())
    )
  ) THEN
    RAISE EXCEPTION 'product with active stock or reservations cannot be archived'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Product_inventory_policy_guard" ON "Product";
CREATE TRIGGER "Product_inventory_policy_guard"
BEFORE UPDATE ON "Product"
FOR EACH ROW EXECUTE FUNCTION "guard_product_inventory_policy_update"();

-- Variants remain available while stock/reservations reference them, and an active
-- product always retains at least one active variant.
CREATE OR REPLACE FUNCTION "guard_product_variant_deactivation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."isActive" AND NOT NEW."isActive" THEN
    IF (
      EXISTS (SELECT 1 FROM "StockBalance" WHERE "variantId" = OLD.id AND "quantity" <> 0)
      OR EXISTS (
        SELECT 1 FROM "PhysicalStockUnit"
        WHERE "variantId" = OLD.id AND status::text IN ('IN_STOCK', 'RESERVED', 'IN_TRANSIT', 'QUARANTINED')
      )
      OR EXISTS (
        SELECT 1 FROM "InventoryReservation"
        WHERE "variantId" = OLD.id AND "releasedAt" IS NULL AND ("expiresAt" IS NULL OR "expiresAt" > now())
      )
    ) THEN
      RAISE EXCEPTION 'variant with active stock or reservations cannot be deactivated'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (SELECT 1 FROM "Product" WHERE id = OLD."productId" AND status::text = 'ACTIVE')
      AND NOT EXISTS (
        SELECT 1 FROM "ProductVariant"
        WHERE "productId" = OLD."productId" AND id <> OLD.id AND "isActive"
      )
    THEN
      RAISE EXCEPTION 'active product must retain at least one active variant'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "ProductVariant_deactivation_guard" ON "ProductVariant";
CREATE TRIGGER "ProductVariant_deactivation_guard"
BEFORE UPDATE OF "isActive" ON "ProductVariant"
FOR EACH ROW EXECUTE FUNCTION "guard_product_variant_deactivation"();
