-- Catalog depth, commercial policy controls and reporting delivery:
--   * product maximum stock level and preferred supplier
--   * supplier-specific item codes, quoted cost, lead time and minimum order quantity
--   * amount-banded approval policies
--   * per-user saved list views
--   * recurring report schedule definitions
-- Forward-only and idempotent so it can be replayed against a partially migrated database.

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "maxStockLevel" DECIMAL(19,4) NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "preferredSupplierId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Product_preferredSupplierId_fkey') THEN
    ALTER TABLE "Product" ADD CONSTRAINT "Product_preferredSupplierId_fkey"
      FOREIGN KEY ("preferredSupplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Product_companyId_preferredSupplierId_idx" ON "Product"("companyId", "preferredSupplierId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PolicyDocumentType') THEN
    CREATE TYPE "PolicyDocumentType" AS ENUM ('PURCHASE_ORDER', 'PURCHASE_RECEIPT', 'SALES_INVOICE', 'PAYMENT', 'JOURNAL', 'INVENTORY_ADJUSTMENT');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SupplierItem" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "supplierId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "variantId" UUID,
  "supplierSku" VARCHAR(80) NOT NULL,
  "description" VARCHAR(180),
  "lastCost" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "leadTimeDays" SMALLINT NOT NULL DEFAULT 0,
  "minOrderQty" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SupplierItem_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierItem_companyId_fkey') THEN
    ALTER TABLE "SupplierItem" ADD CONSTRAINT "SupplierItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierItem_supplierId_fkey') THEN
    ALTER TABLE "SupplierItem" ADD CONSTRAINT "SupplierItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierItem_productId_fkey') THEN
    ALTER TABLE "SupplierItem" ADD CONSTRAINT "SupplierItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierItem_variantId_fkey') THEN
    ALTER TABLE "SupplierItem" ADD CONSTRAINT "SupplierItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "SupplierItem_companyId_supplierId_supplierSku_key" ON "SupplierItem"("companyId", "supplierId", "supplierSku");
CREATE INDEX IF NOT EXISTS "SupplierItem_companyId_productId_idx" ON "SupplierItem"("companyId", "productId");
CREATE INDEX IF NOT EXISTS "SupplierItem_supplierId_isActive_idx" ON "SupplierItem"("supplierId", "isActive");
CREATE INDEX IF NOT EXISTS "SupplierItem_variantId_idx" ON "SupplierItem"("variantId");

CREATE TABLE IF NOT EXISTS "ApprovalPolicy" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "documentType" "PolicyDocumentType" NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "minAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "maxAmount" DECIMAL(19,4),
  "requiredPermission" VARCHAR(80) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ApprovalPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApprovalPolicy_amount_range_check" CHECK ("maxAmount" IS NULL OR "maxAmount" >= "minAmount"),
  CONSTRAINT "ApprovalPolicy_min_amount_check" CHECK ("minAmount" >= 0)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApprovalPolicy_companyId_fkey') THEN
    ALTER TABLE "ApprovalPolicy" ADD CONSTRAINT "ApprovalPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ApprovalPolicy_companyId_documentType_name_key" ON "ApprovalPolicy"("companyId", "documentType", "name");
CREATE INDEX IF NOT EXISTS "ApprovalPolicy_companyId_documentType_isActive_idx" ON "ApprovalPolicy"("companyId", "documentType", "isActive");

CREATE TABLE IF NOT EXISTS "SavedView" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "module" VARCHAR(60) NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "query" JSONB NOT NULL,
  "isShared" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SavedView_companyId_fkey') THEN
    ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SavedView_userId_fkey') THEN
    ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "SavedView_userId_module_name_key" ON "SavedView"("userId", "module", "name");
CREATE INDEX IF NOT EXISTS "SavedView_companyId_module_idx" ON "SavedView"("companyId", "module");

CREATE TABLE IF NOT EXISTS "ReportSchedule" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "reportKey" VARCHAR(60) NOT NULL,
  "filters" JSONB NOT NULL,
  "cadence" VARCHAR(20) NOT NULL,
  "recipients" VARCHAR(400) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastRunAt" TIMESTAMPTZ(3),
  "lastRunStatus" VARCHAR(20),
  "lastRunRows" INTEGER,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReportSchedule_cadence_check" CHECK ("cadence" IN ('DAILY', 'WEEKLY', 'MONTHLY'))
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReportSchedule_companyId_fkey') THEN
    ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReportSchedule_createdById_fkey') THEN
    ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ReportSchedule_companyId_name_key" ON "ReportSchedule"("companyId", "name");
CREATE INDEX IF NOT EXISTS "ReportSchedule_companyId_isActive_cadence_idx" ON "ReportSchedule"("companyId", "isActive", "cadence");
