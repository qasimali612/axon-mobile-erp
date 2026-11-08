-- Budget versions need an explicit preparer so the approver can be verified as an
-- independent officer, mirroring the maker-checker rule enforced on every journal.
ALTER TABLE "Budget"
  ADD COLUMN IF NOT EXISTS "createdById" UUID,
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMPTZ(3);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Budget_createdById_fkey') THEN
    ALTER TABLE "Budget"
      ADD CONSTRAINT "Budget_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Budget_companyId_code_version_idx" ON "Budget"("companyId", "code", "version");
