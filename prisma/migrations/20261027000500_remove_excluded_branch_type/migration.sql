-- Preserve branch records while removing the excluded branch-type dependency.
-- Any legacy row is reclassified as a distribution center; its identity,
-- documents, users, warehouses, and audit history remain untouched.
INSERT INTO "AuditLog" (
  "id", "companyId", "branchId", "action", "module", "entityType",
  "entityId", "entityReference", "previousValues", "newValues", "metadata", "createdAt"
)
SELECT
  gen_random_uuid(), b."companyId", b."id", 'LEGACY_BRANCH_TYPE_RECLASSIFIED',
  'organization', 'Branch', b."id"::text, b."code",
  jsonb_build_object('type', b."type"::text),
  jsonb_build_object('type', 'DISTRIBUTION_CENTER'),
  jsonb_build_object('migration', '20261027000500_remove_excluded_branch_type'),
  CURRENT_TIMESTAMP
FROM "Branch" b
WHERE b."type"::text = 'SERVICE_CENTER';

ALTER TABLE "Branch" ALTER COLUMN "type" DROP DEFAULT;
CREATE TYPE "BranchType_new" AS ENUM ('HEAD_OFFICE', 'RETAIL_STORE', 'WHOLESALE', 'DISTRIBUTION_CENTER');
ALTER TABLE "Branch"
  ALTER COLUMN "type" TYPE "BranchType_new"
  USING (
    CASE
      WHEN "type"::text = 'SERVICE_CENTER' THEN 'DISTRIBUTION_CENTER'
      ELSE "type"::text
    END
  )::"BranchType_new";
DROP TYPE "BranchType";
ALTER TYPE "BranchType_new" RENAME TO "BranchType";
ALTER TABLE "Branch" ALTER COLUMN "type" SET DEFAULT 'RETAIL_STORE'::"BranchType";
