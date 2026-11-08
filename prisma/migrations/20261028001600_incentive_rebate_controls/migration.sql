-- Incentive and rebate workflow controls: record who calculated an amount so a distinct
-- officer can approve it, and record who prepared a supplier incentive claim.

ALTER TABLE "IncentiveCalculation" ADD COLUMN "calculatedById" UUID;
ALTER TABLE "ReceivedIncentive" ADD COLUMN "preparedById" UUID;
ALTER TABLE "ReceivedIncentive" ADD COLUMN "approvedById" UUID;
ALTER TABLE "ReceivedIncentive" ADD COLUMN "approvedAt" TIMESTAMPTZ(3);
ALTER TABLE "RebateCalculation" ADD COLUMN "calculatedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IncentiveCalculation_calculatedById_fkey') THEN
    ALTER TABLE "IncentiveCalculation" ADD CONSTRAINT "IncentiveCalculation_calculatedById_fkey"
      FOREIGN KEY ("calculatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReceivedIncentive_preparedById_fkey') THEN
    ALTER TABLE "ReceivedIncentive" ADD CONSTRAINT "ReceivedIncentive_preparedById_fkey"
      FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReceivedIncentive_approvedById_fkey') THEN
    ALTER TABLE "ReceivedIncentive" ADD CONSTRAINT "ReceivedIncentive_approvedById_fkey"
      FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RebateCalculation_calculatedById_fkey') THEN
    ALTER TABLE "RebateCalculation" ADD CONSTRAINT "RebateCalculation_calculatedById_fkey"
      FOREIGN KEY ("calculatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IncentiveCalculation_companyId_calculatedById_idx" ON "IncentiveCalculation"("companyId", "calculatedById");
