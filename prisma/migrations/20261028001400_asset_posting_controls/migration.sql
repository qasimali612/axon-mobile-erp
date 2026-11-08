-- Fixed-asset postings follow the same segregation of duties as every other
-- source journal in this ERP: the user who prepared the underlying record
-- (asset draft, depreciation schedule) cannot also approve and post its journal.
ALTER TABLE "FixedAsset"
  ADD COLUMN IF NOT EXISTS "preparedById" UUID;
ALTER TABLE "AssetDepreciationSchedule"
  ADD COLUMN IF NOT EXISTS "generatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FixedAsset_preparedById_fkey'
  ) THEN
    ALTER TABLE "FixedAsset"
      ADD CONSTRAINT "FixedAsset_preparedById_fkey"
      FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AssetDepreciationSchedule_generatedById_fkey'
  ) THEN
    ALTER TABLE "AssetDepreciationSchedule"
      ADD CONSTRAINT "AssetDepreciationSchedule_generatedById_fkey"
      FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AssetDepreciationSchedule_assetId_status_idx"
  ON "AssetDepreciationSchedule"("assetId", "status");
