-- A four-decimal unit cost multiplied by a multi-unit quantity can differ from
-- the exact allocated line value by up to half of one unit-cost quantum per
-- unit. Preserve the exact landed total while retaining the rounded unit cost.
-- The application only enables this tolerance for an explicit controlled
-- landed-cost allocation; all other movements remain checked more strictly in
-- applyStockMovement.
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_valid_amounts";
ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_valid_amounts" CHECK (
    "quantity" <> 0 AND "unitCost" >= 0
    AND abs("totalCost" - round("quantity" * "unitCost", 4))
        <= abs("quantity") * 0.00005 + 0.0001
  );
