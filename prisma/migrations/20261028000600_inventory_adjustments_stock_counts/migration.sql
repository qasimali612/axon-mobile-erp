-- CreateTable
CREATE TABLE "StockAdjustment" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "stockCountId" UUID,
    "reversalOfId" UUID,
    "journalEntryId" UUID,
    "adjustmentNumber" VARCHAR(60) NOT NULL,
    "adjustmentDate" DATE NOT NULL,
    "status" "OperationalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "reasonCode" VARCHAR(40) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "notes" TEXT,
    "increaseValue" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "decreaseValue" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "netValue" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "preparedById" UUID NOT NULL,
    "approvedById" UUID,
    "postedById" UUID,
    "reversedById" UUID,
    "submittedAt" TIMESTAMPTZ(3),
    "approvedAt" TIMESTAMPTZ(3),
    "postedAt" TIMESTAMPTZ(3),
    "reversedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustmentLine" (
    "id" UUID NOT NULL,
    "adjustmentId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "lotId" UUID,
    "lineNumber" SMALLINT NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "trackingMethod" "TrackingMethod" NOT NULL,
    "quantityDelta" DECIMAL(19,4) NOT NULL,
    "unitCost" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StockAdjustmentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustmentUnit" (
    "id" UUID NOT NULL,
    "adjustmentLineId" UUID NOT NULL,
    "stockUnitId" UUID,
    "isNewUnit" BOOLEAN NOT NULL DEFAULT false,
    "acquisitionCost" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "attributes" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StockAdjustmentUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustmentUnitIdentifier" (
    "id" UUID NOT NULL,
    "adjustmentUnitId" UUID NOT NULL,
    "type" "IdentifierType" NOT NULL,
    "value" VARCHAR(120) NOT NULL,
    "normalizedValue" VARCHAR(120) NOT NULL,
    "slot" SMALLINT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAdjustmentUnitIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "countNumber" VARCHAR(60) NOT NULL,
    "countDate" DATE NOT NULL,
    "snapshotAt" TIMESTAMPTZ(3) NOT NULL,
    "scopeMode" VARCHAR(20) NOT NULL DEFAULT 'FULL',
    "status" "OperationalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" VARCHAR(500) NOT NULL,
    "notes" TEXT,
    "preparedById" UUID NOT NULL,
    "submittedById" UUID,
    "postedById" UUID,
    "submittedAt" TIMESTAMPTZ(3),
    "postedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountLine" (
    "id" UUID NOT NULL,
    "stockCountId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "lotId" UUID,
    "lineNumber" SMALLINT NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "trackingMethod" "TrackingMethod" NOT NULL,
    "expectedQuantity" DECIMAL(19,4) NOT NULL,
    "countedQuantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "varianceQuantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "totalVariance" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountUnit" (
    "id" UUID NOT NULL,
    "stockCountLineId" UUID NOT NULL,
    "stockUnitId" UUID NOT NULL,
    "wasExpected" BOOLEAN NOT NULL DEFAULT true,
    "counted" BOOLEAN NOT NULL DEFAULT false,
    "countedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StockCountUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustment_stockCountId_key" ON "StockAdjustment"("stockCountId");

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustment_reversalOfId_key" ON "StockAdjustment"("reversalOfId");

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustment_journalEntryId_key" ON "StockAdjustment"("journalEntryId");

-- CreateIndex
CREATE INDEX "StockAdjustment_companyId_status_adjustmentDate_idx" ON "StockAdjustment"("companyId", "status", "adjustmentDate");

-- CreateIndex
CREATE INDEX "StockAdjustment_companyId_warehouseId_adjustmentDate_idx" ON "StockAdjustment"("companyId", "warehouseId", "adjustmentDate");

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustment_companyId_adjustmentNumber_key" ON "StockAdjustment"("companyId", "adjustmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustment_companyId_idempotencyKey_key" ON "StockAdjustment"("companyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "StockAdjustmentLine_productId_variantId_idx" ON "StockAdjustmentLine"("productId", "variantId");

-- CreateIndex
CREATE INDEX "StockAdjustmentLine_lotId_idx" ON "StockAdjustmentLine"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustmentLine_adjustmentId_lineNumber_key" ON "StockAdjustmentLine"("adjustmentId", "lineNumber");

-- CreateIndex
CREATE INDEX "StockAdjustmentUnit_stockUnitId_idx" ON "StockAdjustmentUnit"("stockUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustmentUnit_adjustmentLineId_stockUnitId_key" ON "StockAdjustmentUnit"("adjustmentLineId", "stockUnitId");

-- CreateIndex
CREATE INDEX "StockAdjustmentUnitIdentifier_type_normalizedValue_idx" ON "StockAdjustmentUnitIdentifier"("type", "normalizedValue");

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustmentUnitIdentifier_adjustmentUnitId_type_slot_key" ON "StockAdjustmentUnitIdentifier"("adjustmentUnitId", "type", "slot");

-- CreateIndex
CREATE INDEX "StockCount_companyId_status_countDate_idx" ON "StockCount"("companyId", "status", "countDate");

-- CreateIndex
CREATE INDEX "StockCount_companyId_warehouseId_countDate_idx" ON "StockCount"("companyId", "warehouseId", "countDate");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_companyId_countNumber_key" ON "StockCount"("companyId", "countNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_companyId_idempotencyKey_key" ON "StockCount"("companyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "StockCountLine_productId_variantId_idx" ON "StockCountLine"("productId", "variantId");

-- CreateIndex
CREATE INDEX "StockCountLine_lotId_idx" ON "StockCountLine"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountLine_stockCountId_lineNumber_key" ON "StockCountLine"("stockCountId", "lineNumber");

-- CreateIndex
CREATE INDEX "StockCountUnit_stockUnitId_idx" ON "StockCountUnit"("stockUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountUnit_stockCountLineId_stockUnitId_key" ON "StockCountUnit"("stockCountLineId", "stockUnitId");

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "StockAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentLine" ADD CONSTRAINT "StockAdjustmentLine_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "StockAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentLine" ADD CONSTRAINT "StockAdjustmentLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentLine" ADD CONSTRAINT "StockAdjustmentLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentLine" ADD CONSTRAINT "StockAdjustmentLine_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentUnit" ADD CONSTRAINT "StockAdjustmentUnit_adjustmentLineId_fkey" FOREIGN KEY ("adjustmentLineId") REFERENCES "StockAdjustmentLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentUnit" ADD CONSTRAINT "StockAdjustmentUnit_stockUnitId_fkey" FOREIGN KEY ("stockUnitId") REFERENCES "PhysicalStockUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentUnitIdentifier" ADD CONSTRAINT "StockAdjustmentUnitIdentifier_adjustmentUnitId_fkey" FOREIGN KEY ("adjustmentUnitId") REFERENCES "StockAdjustmentUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountUnit" ADD CONSTRAINT "StockCountUnit_stockCountLineId_fkey" FOREIGN KEY ("stockCountLineId") REFERENCES "StockCountLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountUnit" ADD CONSTRAINT "StockCountUnit_stockUnitId_fkey" FOREIGN KEY ("stockUnitId") REFERENCES "PhysicalStockUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial posting accounts for inventory gains and losses. Existing account
-- codes are never overwritten; deployments with custom charts may map exactly
-- one active account to each accountType instead.
INSERT INTO "Account" (
  "id", "companyId", "groupId", "code", "name", "accountClass", "subclass", "accountType",
  "normalBalance", "openingBalance", "isControlAccount", "reconciliationRequired",
  "allowManualJournal", "cashFlowActivity", "isActive", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), c."id", g."id", '4030', 'Inventory Adjustment Gain', 'REVENUE',
       'Other operating income', 'INVENTORY_ADJUSTMENT_GAIN', 'CREDIT', 0, false, true,
       false, 'OPERATING', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Company" c
JOIN "AccountGroup" g ON g."companyId" = c."id" AND g."code" = '400'
WHERE NOT EXISTS (SELECT 1 FROM "Account" a WHERE a."companyId" = c."id" AND a."code" = '4030');

INSERT INTO "Account" (
  "id", "companyId", "groupId", "code", "name", "accountClass", "subclass", "accountType",
  "normalBalance", "openingBalance", "isControlAccount", "reconciliationRequired",
  "allowManualJournal", "cashFlowActivity", "isActive", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), c."id", g."id", '6500', 'Inventory Adjustment Loss', 'EXPENSE',
       'Operating expenses', 'INVENTORY_ADJUSTMENT_LOSS', 'DEBIT', 0, false, true,
       false, 'OPERATING', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Company" c
JOIN "AccountGroup" g ON g."companyId" = c."id" AND g."code" = '600'
WHERE NOT EXISTS (SELECT 1 FROM "Account" a WHERE a."companyId" = c."id" AND a."code" = '6500');

ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_supported_status" CHECK (
  "status" IN ('DRAFT','SUBMITTED','POSTED','CANCELLED','REVERSED')
);
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_value_math" CHECK (
  "increaseValue" >= 0 AND "decreaseValue" >= 0 AND "netValue" = "increaseValue" - "decreaseValue"
);
ALTER TABLE "StockAdjustmentLine" ADD CONSTRAINT "StockAdjustmentLine_valid_values" CHECK (
  "lineNumber" > 0 AND "quantityDelta" <> 0 AND "unitCost" >= 0
  AND (("quantityDelta" > 0 AND "totalCost" >= 0) OR ("quantityDelta" < 0 AND "totalCost" <= 0))
  AND abs("totalCost" - round("quantityDelta" * "unitCost", 4)) <= abs("quantityDelta") * 0.00005
);
ALTER TABLE "StockAdjustmentUnit" ADD CONSTRAINT "StockAdjustmentUnit_valid_cost" CHECK ("acquisitionCost" >= 0);
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_supported_status" CHECK (
  "status" IN ('DRAFT','SUBMITTED','POSTED','CANCELLED') AND "scopeMode" IN ('FULL','PARTIAL','CYCLE')
);
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_valid_values" CHECK (
  "lineNumber" > 0 AND "expectedQuantity" >= 0 AND "countedQuantity" >= 0
  AND "varianceQuantity" = "countedQuantity" - "expectedQuantity"
  AND "unitCost" >= 0
  AND (("varianceQuantity" >= 0 AND "totalVariance" >= 0) OR ("varianceQuantity" <= 0 AND "totalVariance" <= 0))
  AND abs("totalVariance" - round("varianceQuantity" * "unitCost", 4)) <= abs("varianceQuantity") * 0.00005
);

CREATE OR REPLACE FUNCTION enforce_stock_adjustment_scope()
RETURNS trigger AS $$
DECLARE branch_company UUID; warehouse_company UUID; warehouse_branch UUID; warehouse_active BOOLEAN;
DECLARE source_company UUID; source_branch UUID; source_warehouse UUID; source_reversal UUID;
DECLARE count_company UUID; count_branch UUID; count_warehouse UUID;
BEGIN
  SELECT "companyId" INTO branch_company FROM "Branch" WHERE "id" = NEW."branchId";
  SELECT "companyId", "branchId", "isActive" INTO warehouse_company, warehouse_branch, warehouse_active
    FROM "Warehouse" WHERE "id" = NEW."warehouseId";
  IF branch_company IS DISTINCT FROM NEW."companyId" OR warehouse_company IS DISTINCT FROM NEW."companyId"
     OR warehouse_branch IS DISTINCT FROM NEW."branchId" THEN
    RAISE EXCEPTION 'Stock adjustment branch and warehouse are outside scope';
  END IF;
  IF TG_OP = 'INSERT' AND NOT warehouse_active THEN RAISE EXCEPTION 'Stock adjustment requires an active warehouse'; END IF;
  IF NEW."reversalOfId" IS NOT NULL THEN
    SELECT "companyId", "branchId", "warehouseId", "reversalOfId"
      INTO source_company, source_branch, source_warehouse, source_reversal
      FROM "StockAdjustment" WHERE "id" = NEW."reversalOfId";
    IF source_company IS DISTINCT FROM NEW."companyId" OR source_branch IS DISTINCT FROM NEW."branchId"
       OR source_warehouse IS DISTINCT FROM NEW."warehouseId" OR source_reversal IS NOT NULL THEN
      RAISE EXCEPTION 'Stock adjustment reversal is outside source scope or reverses a reversal';
    END IF;
  END IF;
  IF NEW."stockCountId" IS NOT NULL THEN
    SELECT "companyId", "branchId", "warehouseId" INTO count_company, count_branch, count_warehouse
      FROM "StockCount" WHERE "id" = NEW."stockCountId";
    IF count_company IS DISTINCT FROM NEW."companyId" OR count_branch IS DISTINCT FROM NEW."branchId"
       OR count_warehouse IS DISTINCT FROM NEW."warehouseId" THEN
      RAISE EXCEPTION 'Generated adjustment is outside stock count scope';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StockAdjustment_scope_guard" BEFORE INSERT OR UPDATE ON "StockAdjustment"
FOR EACH ROW EXECUTE FUNCTION enforce_stock_adjustment_scope();

CREATE OR REPLACE FUNCTION enforce_stock_adjustment_line_scope()
RETURNS trigger AS $$
DECLARE parent_company UUID; parent_status "OperationalDocumentStatus";
DECLARE product_company UUID; product_tracking "TrackingMethod"; variant_company UUID; variant_product UUID;
DECLARE lot_company UUID; lot_product UUID; lot_variant UUID;
BEGIN
  SELECT "companyId", "status" INTO parent_company, parent_status FROM "StockAdjustment" WHERE "id" = NEW."adjustmentId";
  SELECT "companyId", "trackingMethod" INTO product_company, product_tracking FROM "Product" WHERE "id" = NEW."productId";
  SELECT "companyId", "productId" INTO variant_company, variant_product FROM "ProductVariant" WHERE "id" = NEW."variantId";
  IF product_company IS DISTINCT FROM parent_company OR variant_company IS DISTINCT FROM parent_company
     OR variant_product IS DISTINCT FROM NEW."productId" OR product_tracking IS DISTINCT FROM NEW."trackingMethod" THEN
    RAISE EXCEPTION 'Stock adjustment line is outside product or tracking scope';
  END IF;
  IF NEW."lotId" IS NOT NULL THEN
    SELECT "companyId", "productId", "variantId" INTO lot_company, lot_product, lot_variant FROM "InventoryLot" WHERE "id" = NEW."lotId";
    IF lot_company IS DISTINCT FROM parent_company OR lot_product IS DISTINCT FROM NEW."productId" OR lot_variant IS DISTINCT FROM NEW."variantId" THEN
      RAISE EXCEPTION 'Stock adjustment lot is outside line scope';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND parent_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Adjustment lines require a draft parent'; END IF;
  IF TG_OP = 'UPDATE' AND parent_status IS DISTINCT FROM 'DRAFT' THEN
    IF parent_status IS DISTINCT FROM 'SUBMITTED'
       OR NEW."adjustmentId" IS DISTINCT FROM OLD."adjustmentId"
       OR NEW."productId" IS DISTINCT FROM OLD."productId"
       OR NEW."variantId" IS DISTINCT FROM OLD."variantId"
       OR NEW."lotId" IS DISTINCT FROM OLD."lotId"
       OR NEW."lineNumber" IS DISTINCT FROM OLD."lineNumber"
       OR NEW."description" IS DISTINCT FROM OLD."description"
       OR NEW."trackingMethod" IS DISTINCT FROM OLD."trackingMethod"
       OR NEW."quantityDelta" IS DISTINCT FROM OLD."quantityDelta"
       OR NEW."notes" IS DISTINCT FROM OLD."notes" THEN
      RAISE EXCEPTION 'Only posting cost may be refreshed on a submitted adjustment line';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StockAdjustmentLine_scope_guard" BEFORE INSERT OR UPDATE ON "StockAdjustmentLine"
FOR EACH ROW EXECUTE FUNCTION enforce_stock_adjustment_line_scope();

CREATE OR REPLACE FUNCTION enforce_stock_adjustment_unit_scope()
RETURNS trigger AS $$
DECLARE parent_company UUID; parent_status "OperationalDocumentStatus"; line_product UUID; line_variant UUID;
DECLARE unit_company UUID; unit_product UUID; unit_variant UUID;
BEGIN
  SELECT a."companyId", a."status", l."productId", l."variantId"
    INTO parent_company, parent_status, line_product, line_variant
    FROM "StockAdjustmentLine" l JOIN "StockAdjustment" a ON a."id" = l."adjustmentId"
    WHERE l."id" = NEW."adjustmentLineId";
  IF TG_OP = 'INSERT' AND parent_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Adjustment units require a draft parent'; END IF;
  IF TG_OP = 'UPDATE' AND parent_status IS DISTINCT FROM 'DRAFT' THEN
    IF parent_status IS DISTINCT FROM 'SUBMITTED'
       OR NEW."adjustmentLineId" IS DISTINCT FROM OLD."adjustmentLineId"
       OR NEW."isNewUnit" IS DISTINCT FROM OLD."isNewUnit"
       OR NEW."acquisitionCost" IS DISTINCT FROM OLD."acquisitionCost"
       OR NEW."attributes" IS DISTINCT FROM OLD."attributes"
       OR OLD."stockUnitId" IS NOT NULL OR NEW."stockUnitId" IS NULL THEN
      RAISE EXCEPTION 'Only a newly posted adjustment unit may receive its physical stock link';
    END IF;
  END IF;
  IF NEW."stockUnitId" IS NOT NULL THEN
    SELECT "companyId", "productId", "variantId" INTO unit_company, unit_product, unit_variant
      FROM "PhysicalStockUnit" WHERE "id" = NEW."stockUnitId";
    IF unit_company IS DISTINCT FROM parent_company OR unit_product IS DISTINCT FROM line_product OR unit_variant IS DISTINCT FROM line_variant THEN
      RAISE EXCEPTION 'Adjustment physical unit is outside line scope';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StockAdjustmentUnit_scope_guard" BEFORE INSERT OR UPDATE ON "StockAdjustmentUnit"
FOR EACH ROW EXECUTE FUNCTION enforce_stock_adjustment_unit_scope();

CREATE OR REPLACE FUNCTION enforce_stock_adjustment_identifier_scope()
RETURNS trigger AS $$
DECLARE parent_status "OperationalDocumentStatus"; new_unit BOOLEAN;
BEGIN
  SELECT a."status", u."isNewUnit" INTO parent_status, new_unit
    FROM "StockAdjustmentUnit" u JOIN "StockAdjustmentLine" l ON l."id" = u."adjustmentLineId"
    JOIN "StockAdjustment" a ON a."id" = l."adjustmentId" WHERE u."id" = NEW."adjustmentUnitId";
  IF parent_status IS DISTINCT FROM 'DRAFT' OR NOT new_unit THEN
    RAISE EXCEPTION 'Draft identifiers are allowed only for a new physical unit on a draft adjustment';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StockAdjustmentIdentifier_scope_guard" BEFORE INSERT OR UPDATE ON "StockAdjustmentUnitIdentifier"
FOR EACH ROW EXECUTE FUNCTION enforce_stock_adjustment_identifier_scope();

CREATE OR REPLACE FUNCTION protect_adjustment_child_delete()
RETURNS trigger AS $$
DECLARE parent_status "OperationalDocumentStatus";
BEGIN
  IF TG_TABLE_NAME = 'StockAdjustmentLine' THEN
    SELECT "status" INTO parent_status FROM "StockAdjustment" WHERE "id" = OLD."adjustmentId";
  ELSIF TG_TABLE_NAME = 'StockAdjustmentUnit' THEN
    SELECT a."status" INTO parent_status FROM "StockAdjustmentLine" l JOIN "StockAdjustment" a ON a."id" = l."adjustmentId" WHERE l."id" = OLD."adjustmentLineId";
  ELSE
    SELECT a."status" INTO parent_status FROM "StockAdjustmentUnit" u JOIN "StockAdjustmentLine" l ON l."id" = u."adjustmentLineId"
      JOIN "StockAdjustment" a ON a."id" = l."adjustmentId" WHERE u."id" = OLD."adjustmentUnitId";
  END IF;
  IF parent_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Only draft adjustment children may be deleted'; END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StockAdjustmentLine_delete_guard" BEFORE DELETE ON "StockAdjustmentLine" FOR EACH ROW EXECUTE FUNCTION protect_adjustment_child_delete();
CREATE TRIGGER "StockAdjustmentUnit_delete_guard" BEFORE DELETE ON "StockAdjustmentUnit" FOR EACH ROW EXECUTE FUNCTION protect_adjustment_child_delete();
CREATE TRIGGER "StockAdjustmentIdentifier_delete_guard" BEFORE DELETE ON "StockAdjustmentUnitIdentifier" FOR EACH ROW EXECUTE FUNCTION protect_adjustment_child_delete();

CREATE OR REPLACE FUNCTION enforce_stock_adjustment_transition()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' AND (
    NEW."companyId" IS DISTINCT FROM OLD."companyId" OR NEW."branchId" IS DISTINCT FROM OLD."branchId"
    OR NEW."warehouseId" IS DISTINCT FROM OLD."warehouseId" OR NEW."stockCountId" IS DISTINCT FROM OLD."stockCountId"
    OR NEW."reversalOfId" IS DISTINCT FROM OLD."reversalOfId" OR NEW."adjustmentNumber" IS DISTINCT FROM OLD."adjustmentNumber"
    OR NEW."adjustmentDate" IS DISTINCT FROM OLD."adjustmentDate" OR NEW."reasonCode" IS DISTINCT FROM OLD."reasonCode"
    OR NEW."reason" IS DISTINCT FROM OLD."reason" OR NEW."notes" IS DISTINCT FROM OLD."notes"
    OR NEW."preparedById" IS DISTINCT FROM OLD."preparedById" OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
  ) THEN RAISE EXCEPTION 'Submitted and posted stock adjustment data is immutable'; END IF;
  IF NEW."status" = OLD."status" THEN RETURN NEW; END IF;
  IF OLD."status" = 'DRAFT' AND NEW."status" IN ('SUBMITTED','POSTED','CANCELLED') THEN RETURN NEW; END IF;
  IF OLD."status" = 'SUBMITTED' AND NEW."status" IN ('DRAFT','POSTED','CANCELLED') THEN RETURN NEW; END IF;
  IF OLD."status" = 'POSTED' AND NEW."status" = 'REVERSED' THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Invalid stock adjustment status transition from % to %', OLD."status", NEW."status";
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StockAdjustment_transition_guard" BEFORE UPDATE ON "StockAdjustment"
FOR EACH ROW EXECUTE FUNCTION enforce_stock_adjustment_transition();

CREATE OR REPLACE FUNCTION verify_stock_adjustment_effects()
RETURNS trigger AS $$
DECLARE mismatch_exists BOOLEAN; journal_status "JournalStatus"; journal_company UUID; journal_branch UUID;
DECLARE journal_date DATE; journal_source VARCHAR; calculated_increase NUMERIC(19,4); calculated_decrease NUMERIC(19,4);
BEGIN
  IF NEW."status" <> 'POSTED' OR OLD."status" = 'POSTED' THEN RETURN NEW; END IF;
  SELECT "status", "companyId", "branchId", "postingDate", "sourceDocumentId"
    INTO journal_status, journal_company, journal_branch, journal_date, journal_source
    FROM "JournalEntry" WHERE "id" = NEW."journalEntryId";
  IF journal_status IS DISTINCT FROM 'POSTED' OR journal_company IS DISTINCT FROM NEW."companyId"
     OR journal_branch IS DISTINCT FROM NEW."branchId" OR journal_date IS DISTINCT FROM NEW."adjustmentDate"
     OR journal_source IS DISTINCT FROM NEW."id"::text THEN
    RAISE EXCEPTION 'Posted stock adjustment requires its posted journal in the same scope and date';
  END IF;
  SELECT COALESCE(SUM(CASE WHEN "totalCost" > 0 THEN "totalCost" ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN "totalCost" < 0 THEN -"totalCost" ELSE 0 END),0)
    INTO calculated_increase, calculated_decrease FROM "StockAdjustmentLine" WHERE "adjustmentId" = NEW."id";
  IF calculated_increase <> NEW."increaseValue" OR calculated_decrease <> NEW."decreaseValue"
     OR NEW."netValue" <> calculated_increase - calculated_decrease THEN
    RAISE EXCEPTION 'Stock adjustment header values do not match its lines';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM "StockAdjustmentLine" l WHERE l."adjustmentId" = NEW."id" AND (
      (l."quantityDelta" > 0 AND (
        COALESCE((SELECT SUM(m."quantity") FROM "InventoryMovement" m WHERE m."sourceDocumentType"='StockAdjustment'
          AND m."sourceDocumentId"=NEW."id" AND m."lineReference"=l."id"::text AND m."movementType"='ADJUSTMENT_IN'),0) <> l."quantityDelta"
        OR COALESCE((SELECT SUM(m."totalCost") FROM "InventoryMovement" m WHERE m."sourceDocumentType"='StockAdjustment'
          AND m."sourceDocumentId"=NEW."id" AND m."lineReference"=l."id"::text AND m."movementType"='ADJUSTMENT_IN'),0) <> l."totalCost"
      )) OR (l."quantityDelta" < 0 AND (
        COALESCE((SELECT SUM(m."quantity") FROM "InventoryMovement" m WHERE m."sourceDocumentType"='StockAdjustment'
          AND m."sourceDocumentId"=NEW."id" AND m."lineReference"=l."id"::text AND m."movementType"='ADJUSTMENT_OUT'),0) <> l."quantityDelta"
        OR COALESCE((SELECT SUM(m."totalCost") FROM "InventoryMovement" m WHERE m."sourceDocumentType"='StockAdjustment'
          AND m."sourceDocumentId"=NEW."id" AND m."lineReference"=l."id"::text AND m."movementType"='ADJUSTMENT_OUT'),0) <> l."totalCost"
      )) OR (l."trackingMethod" IN ('IMEI','SERIAL') AND (
        abs(l."quantityDelta") <> trunc(abs(l."quantityDelta"))
        OR (SELECT COUNT(*) FROM "StockAdjustmentUnit" u WHERE u."adjustmentLineId"=l."id" AND u."stockUnitId" IS NOT NULL) <> abs(l."quantityDelta")
      )) OR (l."trackingMethod" NOT IN ('IMEI','SERIAL') AND EXISTS (
        SELECT 1 FROM "StockAdjustmentUnit" u WHERE u."adjustmentLineId"=l."id"
      ))
    )
  ) OR EXISTS (
    SELECT 1 FROM "InventoryMovement" m WHERE m."sourceDocumentType"='StockAdjustment' AND m."sourceDocumentId"=NEW."id"
      AND (m."movementType" NOT IN ('ADJUSTMENT_IN','ADJUSTMENT_OUT') OR NOT EXISTS (
        SELECT 1 FROM "StockAdjustmentLine" l WHERE l."adjustmentId"=NEW."id" AND l."id"::text=m."lineReference"
      ))
  ) INTO mismatch_exists;
  IF mismatch_exists OR NOT EXISTS (SELECT 1 FROM "StockAdjustmentLine" WHERE "adjustmentId"=NEW."id") THEN
    RAISE EXCEPTION 'Stock adjustment movements do not exactly match its lines, units, and value';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StockAdjustment_effect_guard" BEFORE UPDATE ON "StockAdjustment"
FOR EACH ROW EXECUTE FUNCTION verify_stock_adjustment_effects();

CREATE OR REPLACE FUNCTION verify_stock_adjustment_reversal()
RETURNS trigger AS $$
DECLARE source_status "OperationalDocumentStatus"; source_journal UUID; reversal_journal_source UUID; mismatch_exists BOOLEAN;
BEGIN
  IF NEW."status" <> 'POSTED' OR OLD."status" = 'POSTED' OR NEW."reversalOfId" IS NULL THEN RETURN NEW; END IF;
  SELECT "status", "journalEntryId" INTO source_status, source_journal FROM "StockAdjustment" WHERE "id"=NEW."reversalOfId";
  SELECT "reversalOfId" INTO reversal_journal_source FROM "JournalEntry" WHERE "id"=NEW."journalEntryId";
  IF source_status IS DISTINCT FROM 'POSTED' OR reversal_journal_source IS DISTINCT FROM source_journal THEN
    RAISE EXCEPTION 'Adjustment reversal requires an active posted source and linked reversal journal';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM "StockAdjustmentLine" original
    FULL JOIN "StockAdjustmentLine" reversal ON reversal."adjustmentId"=NEW."id" AND reversal."lineNumber"=original."lineNumber"
    WHERE original."adjustmentId"=NEW."reversalOfId" AND (
      reversal."id" IS NULL OR reversal."productId" IS DISTINCT FROM original."productId"
      OR reversal."variantId" IS DISTINCT FROM original."variantId" OR reversal."lotId" IS DISTINCT FROM original."lotId"
      OR reversal."trackingMethod" IS DISTINCT FROM original."trackingMethod"
      OR reversal."quantityDelta" IS DISTINCT FROM -original."quantityDelta"
      OR reversal."totalCost" IS DISTINCT FROM -original."totalCost"
    )
  ) OR EXISTS (
    SELECT 1 FROM "StockAdjustmentLine" reversal WHERE reversal."adjustmentId"=NEW."id" AND NOT EXISTS (
      SELECT 1 FROM "StockAdjustmentLine" original WHERE original."adjustmentId"=NEW."reversalOfId" AND original."lineNumber"=reversal."lineNumber"
    )
  ) OR EXISTS (
    SELECT 1 FROM "InventoryMovement" rm LEFT JOIN "InventoryMovement" om ON om."id"=rm."reversalOfId"
    WHERE rm."sourceDocumentType"='StockAdjustment' AND rm."sourceDocumentId"=NEW."id" AND (
      om."id" IS NULL OR om."sourceDocumentType" IS DISTINCT FROM 'StockAdjustment' OR om."sourceDocumentId" IS DISTINCT FROM NEW."reversalOfId"
      OR rm."productId" IS DISTINCT FROM om."productId" OR rm."variantId" IS DISTINCT FROM om."variantId"
      OR rm."lotId" IS DISTINCT FROM om."lotId" OR rm."stockUnitId" IS DISTINCT FROM om."stockUnitId"
      OR rm."quantity" IS DISTINCT FROM -om."quantity" OR rm."totalCost" IS DISTINCT FROM -om."totalCost"
    )
  ) OR EXISTS (
    SELECT 1 FROM "InventoryMovement" om WHERE om."sourceDocumentType"='StockAdjustment' AND om."sourceDocumentId"=NEW."reversalOfId"
      AND NOT EXISTS (SELECT 1 FROM "InventoryMovement" rm WHERE rm."sourceDocumentType"='StockAdjustment'
        AND rm."sourceDocumentId"=NEW."id" AND rm."reversalOfId"=om."id")
  ) INTO mismatch_exists;
  IF mismatch_exists THEN RAISE EXCEPTION 'Stock adjustment reversal does not exactly negate source lines and movements'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StockAdjustment_reversal_guard" BEFORE UPDATE ON "StockAdjustment"
FOR EACH ROW EXECUTE FUNCTION verify_stock_adjustment_reversal();

CREATE OR REPLACE FUNCTION protect_stock_adjustment_delete()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Stock adjustments preserve audit history and cannot be deleted'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "StockAdjustment_delete_guard" BEFORE DELETE ON "StockAdjustment" FOR EACH ROW EXECUTE FUNCTION protect_stock_adjustment_delete();

CREATE OR REPLACE FUNCTION enforce_stock_count_scope()
RETURNS trigger AS $$
DECLARE branch_company UUID; warehouse_company UUID; warehouse_branch UUID; warehouse_active BOOLEAN;
BEGIN
  SELECT "companyId" INTO branch_company FROM "Branch" WHERE "id"=NEW."branchId";
  SELECT "companyId", "branchId", "isActive" INTO warehouse_company, warehouse_branch, warehouse_active FROM "Warehouse" WHERE "id"=NEW."warehouseId";
  IF branch_company IS DISTINCT FROM NEW."companyId" OR warehouse_company IS DISTINCT FROM NEW."companyId" OR warehouse_branch IS DISTINCT FROM NEW."branchId" THEN
    RAISE EXCEPTION 'Stock count branch and warehouse are outside scope';
  END IF;
  IF TG_OP='INSERT' AND NOT warehouse_active THEN RAISE EXCEPTION 'Stock count requires an active warehouse'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StockCount_scope_guard" BEFORE INSERT OR UPDATE ON "StockCount" FOR EACH ROW EXECUTE FUNCTION enforce_stock_count_scope();

CREATE OR REPLACE FUNCTION enforce_stock_count_line_scope()
RETURNS trigger AS $$
DECLARE parent_company UUID; parent_status "OperationalDocumentStatus";
DECLARE product_company UUID; product_tracking "TrackingMethod"; variant_company UUID; variant_product UUID;
DECLARE lot_company UUID; lot_product UUID; lot_variant UUID;
BEGIN
  SELECT "companyId", "status" INTO parent_company, parent_status FROM "StockCount" WHERE "id"=NEW."stockCountId";
  SELECT "companyId", "trackingMethod" INTO product_company, product_tracking FROM "Product" WHERE "id"=NEW."productId";
  SELECT "companyId", "productId" INTO variant_company, variant_product FROM "ProductVariant" WHERE "id"=NEW."variantId";
  IF parent_status IS DISTINCT FROM 'DRAFT' OR product_company IS DISTINCT FROM parent_company OR variant_company IS DISTINCT FROM parent_company
     OR variant_product IS DISTINCT FROM NEW."productId" OR product_tracking IS DISTINCT FROM NEW."trackingMethod" THEN
    RAISE EXCEPTION 'Stock count line is outside scope or parent is not draft';
  END IF;
  IF NEW."lotId" IS NOT NULL THEN
    SELECT "companyId", "productId", "variantId" INTO lot_company, lot_product, lot_variant FROM "InventoryLot" WHERE "id"=NEW."lotId";
    IF lot_company IS DISTINCT FROM parent_company OR lot_product IS DISTINCT FROM NEW."productId" OR lot_variant IS DISTINCT FROM NEW."variantId" THEN
      RAISE EXCEPTION 'Stock count lot is outside line scope';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StockCountLine_scope_guard" BEFORE INSERT OR UPDATE ON "StockCountLine" FOR EACH ROW EXECUTE FUNCTION enforce_stock_count_line_scope();

CREATE OR REPLACE FUNCTION enforce_stock_count_unit_scope()
RETURNS trigger AS $$
DECLARE parent_status "OperationalDocumentStatus"; parent_company UUID; line_product UUID; line_variant UUID;
DECLARE unit_company UUID; unit_product UUID; unit_variant UUID;
BEGIN
  SELECT c."status", c."companyId", l."productId", l."variantId" INTO parent_status, parent_company, line_product, line_variant
    FROM "StockCountLine" l JOIN "StockCount" c ON c."id"=l."stockCountId" WHERE l."id"=NEW."stockCountLineId";
  SELECT "companyId", "productId", "variantId" INTO unit_company, unit_product, unit_variant FROM "PhysicalStockUnit" WHERE "id"=NEW."stockUnitId";
  IF parent_status IS DISTINCT FROM 'DRAFT' OR unit_company IS DISTINCT FROM parent_company OR unit_product IS DISTINCT FROM line_product OR unit_variant IS DISTINCT FROM line_variant THEN
    RAISE EXCEPTION 'Stock count unit is outside scope or parent is not draft';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StockCountUnit_scope_guard" BEFORE INSERT OR UPDATE ON "StockCountUnit" FOR EACH ROW EXECUTE FUNCTION enforce_stock_count_unit_scope();

CREATE OR REPLACE FUNCTION protect_stock_count_child_delete()
RETURNS trigger AS $$
DECLARE parent_status "OperationalDocumentStatus";
BEGIN
  IF TG_TABLE_NAME='StockCountLine' THEN SELECT "status" INTO parent_status FROM "StockCount" WHERE "id"=OLD."stockCountId";
  ELSE SELECT c."status" INTO parent_status FROM "StockCountLine" l JOIN "StockCount" c ON c."id"=l."stockCountId" WHERE l."id"=OLD."stockCountLineId"; END IF;
  IF parent_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Only draft stock count children may be deleted'; END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StockCountLine_delete_guard" BEFORE DELETE ON "StockCountLine" FOR EACH ROW EXECUTE FUNCTION protect_stock_count_child_delete();
CREATE TRIGGER "StockCountUnit_delete_guard" BEFORE DELETE ON "StockCountUnit" FOR EACH ROW EXECUTE FUNCTION protect_stock_count_child_delete();

CREATE OR REPLACE FUNCTION enforce_stock_count_transition()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' AND (
    NEW."companyId" IS DISTINCT FROM OLD."companyId" OR NEW."branchId" IS DISTINCT FROM OLD."branchId"
    OR NEW."warehouseId" IS DISTINCT FROM OLD."warehouseId" OR NEW."countNumber" IS DISTINCT FROM OLD."countNumber"
    OR NEW."countDate" IS DISTINCT FROM OLD."countDate" OR NEW."snapshotAt" IS DISTINCT FROM OLD."snapshotAt"
    OR NEW."scopeMode" IS DISTINCT FROM OLD."scopeMode" OR NEW."reason" IS DISTINCT FROM OLD."reason"
    OR NEW."notes" IS DISTINCT FROM OLD."notes" OR NEW."preparedById" IS DISTINCT FROM OLD."preparedById"
    OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
  ) THEN RAISE EXCEPTION 'Submitted and posted stock count data is immutable'; END IF;
  IF NEW."status"=OLD."status" THEN RETURN NEW; END IF;
  IF OLD."status"='DRAFT' AND NEW."status" IN ('SUBMITTED','CANCELLED') THEN RETURN NEW; END IF;
  IF OLD."status"='SUBMITTED' AND NEW."status" IN ('DRAFT','POSTED','CANCELLED') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Invalid stock count status transition from % to %', OLD."status", NEW."status";
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StockCount_transition_guard" BEFORE UPDATE ON "StockCount" FOR EACH ROW EXECUTE FUNCTION enforce_stock_count_transition();

CREATE OR REPLACE FUNCTION verify_stock_count_posting()
RETURNS trigger AS $$
DECLARE has_variance BOOLEAN; linked_status "OperationalDocumentStatus";
BEGIN
  IF NEW."status" <> 'POSTED' OR OLD."status"='POSTED' THEN RETURN NEW; END IF;
  SELECT EXISTS (SELECT 1 FROM "StockCountLine" WHERE "stockCountId"=NEW."id" AND "varianceQuantity"<>0) INTO has_variance;
  IF has_variance THEN
    SELECT "status" INTO linked_status FROM "StockAdjustment" WHERE "stockCountId"=NEW."id";
    IF linked_status IS DISTINCT FROM 'POSTED' THEN RAISE EXCEPTION 'A stock count with variance requires its posted generated adjustment'; END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM "StockAdjustment" WHERE "stockCountId"=NEW."id") THEN RAISE EXCEPTION 'A zero-variance stock count cannot have an adjustment'; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "StockCountLine" WHERE "stockCountId"=NEW."id") THEN RAISE EXCEPTION 'A stock count requires at least one line'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StockCount_posting_guard" BEFORE UPDATE ON "StockCount" FOR EACH ROW EXECUTE FUNCTION verify_stock_count_posting();

CREATE OR REPLACE FUNCTION protect_stock_count_delete()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Stock counts preserve audit history and cannot be deleted'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "StockCount_delete_guard" BEFORE DELETE ON "StockCount" FOR EACH ROW EXECUTE FUNCTION protect_stock_count_delete();
