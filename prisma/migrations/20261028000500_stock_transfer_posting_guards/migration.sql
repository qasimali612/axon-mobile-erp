-- Permit the posting transaction to refresh draft-estimated transfer cost from
-- locked authoritative stock while keeping submitted line identity and quantity
-- immutable. Add exact linked-reversal checks at the database boundary.

CREATE OR REPLACE FUNCTION enforce_stock_transfer_line_scope()
RETURNS trigger AS $$
DECLARE
  transfer_company UUID;
  transfer_status "OperationalDocumentStatus";
  product_company UUID;
  product_tracking "TrackingMethod";
  variant_company UUID;
  variant_product UUID;
  lot_company UUID;
  lot_product UUID;
  lot_variant UUID;
BEGIN
  SELECT "companyId", "status" INTO transfer_company, transfer_status FROM "StockTransfer" WHERE "id" = NEW."transferId";
  SELECT "companyId", "trackingMethod" INTO product_company, product_tracking FROM "Product" WHERE "id" = NEW."productId";
  SELECT "companyId", "productId" INTO variant_company, variant_product FROM "ProductVariant" WHERE "id" = NEW."variantId";
  IF product_company IS DISTINCT FROM transfer_company
     OR variant_company IS DISTINCT FROM transfer_company
     OR variant_product IS DISTINCT FROM NEW."productId"
     OR product_tracking IS DISTINCT FROM NEW."trackingMethod" THEN
    RAISE EXCEPTION 'Stock transfer line is outside scope or mismatches tracking';
  END IF;
  IF NEW."lotId" IS NOT NULL THEN
    SELECT "companyId", "productId", "variantId" INTO lot_company, lot_product, lot_variant FROM "InventoryLot" WHERE "id" = NEW."lotId";
    IF lot_company IS DISTINCT FROM transfer_company OR lot_product IS DISTINCT FROM NEW."productId" OR lot_variant IS DISTINCT FROM NEW."variantId" THEN
      RAISE EXCEPTION 'Stock transfer lot is outside line scope';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND transfer_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Stock transfer lines may only be added to a draft';
  END IF;
  IF TG_OP = 'UPDATE' AND transfer_status IS DISTINCT FROM 'DRAFT' THEN
    IF transfer_status NOT IN ('SUBMITTED','APPROVED')
       OR NEW."transferId" IS DISTINCT FROM OLD."transferId"
       OR NEW."productId" IS DISTINCT FROM OLD."productId"
       OR NEW."variantId" IS DISTINCT FROM OLD."variantId"
       OR NEW."lotId" IS DISTINCT FROM OLD."lotId"
       OR NEW."lineNumber" IS DISTINCT FROM OLD."lineNumber"
       OR NEW."description" IS DISTINCT FROM OLD."description"
       OR NEW."trackingMethod" IS DISTINCT FROM OLD."trackingMethod"
       OR NEW."quantity" IS DISTINCT FROM OLD."quantity" THEN
      RAISE EXCEPTION 'Only posting cost may be refreshed on a submitted stock transfer line';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION verify_stock_transfer_reversal()
RETURNS trigger AS $$
DECLARE source_status "OperationalDocumentStatus";
DECLARE mismatch_exists BOOLEAN;
BEGIN
  IF NEW."status" <> 'POSTED' OR OLD."status" = 'POSTED' OR NEW."reversalOfId" IS NULL THEN RETURN NEW; END IF;
  SELECT "status" INTO source_status FROM "StockTransfer" WHERE "id" = NEW."reversalOfId";
  IF source_status IS DISTINCT FROM 'POSTED' THEN
    RAISE EXCEPTION 'A stock transfer reversal requires an active posted source transfer';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM "StockTransferLine" original
    FULL JOIN "StockTransferLine" reversal
      ON reversal."transferId" = NEW."id" AND reversal."lineNumber" = original."lineNumber"
    WHERE original."transferId" = NEW."reversalOfId" AND (
      reversal."id" IS NULL
      OR reversal."productId" IS DISTINCT FROM original."productId"
      OR reversal."variantId" IS DISTINCT FROM original."variantId"
      OR reversal."lotId" IS DISTINCT FROM original."lotId"
      OR reversal."trackingMethod" IS DISTINCT FROM original."trackingMethod"
      OR reversal."quantity" IS DISTINCT FROM original."quantity"
      OR reversal."totalCost" IS DISTINCT FROM original."totalCost"
    )
  ) OR EXISTS (
    SELECT 1 FROM "StockTransferLine" reversal
    WHERE reversal."transferId" = NEW."id" AND NOT EXISTS (
      SELECT 1 FROM "StockTransferLine" original
      WHERE original."transferId" = NEW."reversalOfId" AND original."lineNumber" = reversal."lineNumber"
    )
  ) OR EXISTS (
    SELECT 1 FROM "StockTransferUnit" original_unit
    JOIN "StockTransferLine" original_line ON original_line."id" = original_unit."transferLineId"
    WHERE original_line."transferId" = NEW."reversalOfId" AND NOT EXISTS (
      SELECT 1 FROM "StockTransferLine" reversal_line
      JOIN "StockTransferUnit" reversal_unit ON reversal_unit."transferLineId" = reversal_line."id"
      WHERE reversal_line."transferId" = NEW."id"
        AND reversal_line."lineNumber" = original_line."lineNumber"
        AND reversal_unit."stockUnitId" = original_unit."stockUnitId"
    )
  ) OR EXISTS (
    SELECT 1 FROM "StockTransferUnit" reversal_unit
    JOIN "StockTransferLine" reversal_line ON reversal_line."id" = reversal_unit."transferLineId"
    WHERE reversal_line."transferId" = NEW."id" AND NOT EXISTS (
      SELECT 1 FROM "StockTransferLine" original_line
      JOIN "StockTransferUnit" original_unit ON original_unit."transferLineId" = original_line."id"
      WHERE original_line."transferId" = NEW."reversalOfId"
        AND original_line."lineNumber" = reversal_line."lineNumber"
        AND original_unit."stockUnitId" = reversal_unit."stockUnitId"
    )
  ) OR EXISTS (
    SELECT 1 FROM "InventoryMovement" reversal_movement
    LEFT JOIN "InventoryMovement" original_movement ON original_movement."id" = reversal_movement."reversalOfId"
    WHERE reversal_movement."sourceDocumentType" = 'StockTransfer'
      AND reversal_movement."sourceDocumentId" = NEW."id"
      AND (
        original_movement."id" IS NULL
        OR original_movement."sourceDocumentType" IS DISTINCT FROM 'StockTransfer'
        OR original_movement."sourceDocumentId" IS DISTINCT FROM NEW."reversalOfId"
        OR reversal_movement."productId" IS DISTINCT FROM original_movement."productId"
        OR reversal_movement."variantId" IS DISTINCT FROM original_movement."variantId"
        OR reversal_movement."lotId" IS DISTINCT FROM original_movement."lotId"
        OR reversal_movement."stockUnitId" IS DISTINCT FROM original_movement."stockUnitId"
        OR reversal_movement."quantity" IS DISTINCT FROM -original_movement."quantity"
        OR reversal_movement."totalCost" IS DISTINCT FROM -original_movement."totalCost"
      )
  ) OR EXISTS (
    SELECT 1 FROM "InventoryMovement" original_movement
    WHERE original_movement."sourceDocumentType" = 'StockTransfer'
      AND original_movement."sourceDocumentId" = NEW."reversalOfId"
      AND NOT EXISTS (
        SELECT 1 FROM "InventoryMovement" reversal_movement
        WHERE reversal_movement."sourceDocumentType" = 'StockTransfer'
          AND reversal_movement."sourceDocumentId" = NEW."id"
          AND reversal_movement."reversalOfId" = original_movement."id"
      )
  ) INTO mismatch_exists;

  IF mismatch_exists THEN
    RAISE EXCEPTION 'Stock transfer reversal does not exactly negate its source lines, units, and movements';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockTransfer_reversal_guard"
BEFORE UPDATE ON "StockTransfer"
FOR EACH ROW EXECUTE FUNCTION verify_stock_transfer_reversal();
