-- Split the polymorphic stock immutability trigger into table-specific
-- functions. This also avoids referencing fields that do not exist on the
-- other trigger record type.
DROP TRIGGER IF EXISTS "DeviceIdentifier_immutability_guard" ON "DeviceIdentifier";
DROP TRIGGER IF EXISTS "PhysicalStockUnit_immutability_guard" ON "PhysicalStockUnit";
DROP FUNCTION IF EXISTS protect_identified_stock_master_data();

CREATE FUNCTION protect_device_identifier()
RETURNS trigger AS $$
DECLARE unit_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN unit_id := OLD."stockUnitId"; ELSE unit_id := NEW."stockUnitId"; END IF;
  IF EXISTS (SELECT 1 FROM "InventoryMovement" WHERE "stockUnitId" = unit_id) THEN
    RAISE EXCEPTION 'Posted device identifiers are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION protect_physical_stock_unit()
RETURNS trigger AS $$
DECLARE unit_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN unit_id := OLD."id"; ELSE unit_id := NEW."id"; END IF;
  IF EXISTS (SELECT 1 FROM "InventoryMovement" WHERE "stockUnitId" = unit_id) THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A stock unit with posted movements cannot be deleted'; END IF;
    IF NEW."companyId" IS DISTINCT FROM OLD."companyId"
       OR NEW."productId" IS DISTINCT FROM OLD."productId"
       OR NEW."variantId" IS DISTINCT FROM OLD."variantId"
       OR NEW."acquisitionDate" IS DISTINCT FROM OLD."acquisitionDate"
       OR NEW."acquisitionCost" IS DISTINCT FROM OLD."acquisitionCost"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
      RAISE EXCEPTION 'Posted stock-unit identity and acquisition data are immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DeviceIdentifier_immutability_guard"
BEFORE UPDATE OR DELETE ON "DeviceIdentifier"
FOR EACH ROW EXECUTE FUNCTION protect_device_identifier();
CREATE TRIGGER "PhysicalStockUnit_immutability_guard"
BEFORE UPDATE OR DELETE ON "PhysicalStockUnit"
FOR EACH ROW EXECUTE FUNCTION protect_physical_stock_unit();
