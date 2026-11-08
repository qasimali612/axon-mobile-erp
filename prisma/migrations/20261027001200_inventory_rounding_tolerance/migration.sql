-- Permit at most one ten-thousandth of rounding allocation so a final weighted-
-- average issue can clear the exact remaining inventory value without leaving
-- value on a zero-quantity balance.
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_valid_amounts";
ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_valid_amounts" CHECK (
    "quantity" <> 0 AND "unitCost" >= 0
    AND abs("totalCost" - round("quantity" * "unitCost", 4)) <= 0.0001
  );
ALTER TABLE "StockBalance" DROP CONSTRAINT "StockBalance_nonnegative";
ALTER TABLE "StockBalance"
  ADD CONSTRAINT "StockBalance_nonnegative" CHECK (
    "quantity" >= 0 AND "inventoryValue" >= 0 AND "version" >= 0
    AND ("quantity" <> 0 OR "inventoryValue" = 0)
  );
