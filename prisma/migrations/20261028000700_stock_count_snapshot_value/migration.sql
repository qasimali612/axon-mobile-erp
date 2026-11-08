-- Preserve the exact inventory-value snapshot used for stale-count detection.
ALTER TABLE "StockCountLine"
  ADD COLUMN "expectedValue" DECIMAL(19,4) NOT NULL DEFAULT 0;

ALTER TABLE "StockCountLine" DROP CONSTRAINT "StockCountLine_valid_values";
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_valid_values" CHECK (
  "lineNumber" > 0 AND "expectedQuantity" >= 0 AND "expectedValue" >= 0 AND "countedQuantity" >= 0
  AND "varianceQuantity" = "countedQuantity" - "expectedQuantity"
  AND "unitCost" >= 0
  AND (("varianceQuantity" >= 0 AND "totalVariance" >= 0) OR ("varianceQuantity" <= 0 AND "totalVariance" <= 0))
  AND abs("totalVariance" - round("varianceQuantity" * "unitCost", 4)) <= abs("varianceQuantity") * 0.00005
);
