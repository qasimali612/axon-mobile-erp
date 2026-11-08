-- Database-backed, multi-line warehouse and branch stock transfers.
-- Transfers reuse the authoritative InventoryMovement, StockBalance, and
-- PhysicalStockUnit records. Drafts have no stock effect and posted history is
-- immutable; corrections are linked reversal transfers.

CREATE TABLE "StockTransfer" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "sourceBranchId" UUID NOT NULL,
  "sourceWarehouseId" UUID NOT NULL,
  "destinationBranchId" UUID NOT NULL,
  "destinationWarehouseId" UUID NOT NULL,
  "reversalOfId" UUID,
  "transferNumber" VARCHAR(60) NOT NULL,
  "transferDate" DATE NOT NULL,
  "status" "OperationalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
  "reference" VARCHAR(100),
  "reason" VARCHAR(200) NOT NULL,
  "remarks" TEXT,
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
  CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockTransfer_distinct_warehouses" CHECK ("sourceWarehouseId" <> "destinationWarehouseId"),
  CONSTRAINT "StockTransfer_supported_status" CHECK ("status" IN ('DRAFT','SUBMITTED','APPROVED','POSTED','CANCELLED','REVERSED'))
);

CREATE TABLE "StockTransferLine" (
  "id" UUID NOT NULL,
  "transferId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "variantId" UUID NOT NULL,
  "lotId" UUID,
  "lineNumber" SMALLINT NOT NULL,
  "description" VARCHAR(240) NOT NULL,
  "trackingMethod" "TrackingMethod" NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "unitCost" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "totalCost" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "StockTransferLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockTransferLine_positive_values" CHECK ("lineNumber" > 0 AND "quantity" > 0 AND "unitCost" >= 0 AND "totalCost" >= 0),
  CONSTRAINT "StockTransferLine_cost_math" CHECK (abs("totalCost" - round("quantity" * "unitCost", 4)) <= "quantity" * 0.00005)
);

CREATE TABLE "StockTransferUnit" (
  "id" UUID NOT NULL,
  "transferLineId" UUID NOT NULL,
  "stockUnitId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockTransferUnit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockTransfer_company_number_key" ON "StockTransfer"("companyId", "transferNumber");
CREATE UNIQUE INDEX "StockTransfer_company_idempotency_key" ON "StockTransfer"("companyId", "idempotencyKey");
CREATE UNIQUE INDEX "StockTransfer_reversalOfId_key" ON "StockTransfer"("reversalOfId");
CREATE INDEX "StockTransfer_company_status_date_idx" ON "StockTransfer"("companyId", "status", "transferDate");
CREATE INDEX "StockTransfer_source_date_idx" ON "StockTransfer"("companyId", "sourceWarehouseId", "transferDate");
CREATE INDEX "StockTransfer_destination_date_idx" ON "StockTransfer"("companyId", "destinationWarehouseId", "transferDate");
CREATE UNIQUE INDEX "StockTransferLine_transfer_line_key" ON "StockTransferLine"("transferId", "lineNumber");
CREATE INDEX "StockTransferLine_product_variant_idx" ON "StockTransferLine"("productId", "variantId");
CREATE INDEX "StockTransferLine_lot_idx" ON "StockTransferLine"("lotId");
CREATE UNIQUE INDEX "StockTransferUnit_line_unit_key" ON "StockTransferUnit"("transferLineId", "stockUnitId");
CREATE INDEX "StockTransferUnit_stockUnit_idx" ON "StockTransferUnit"("stockUnitId");

ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_sourceBranch_fkey" FOREIGN KEY ("sourceBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_sourceWarehouse_fkey" FOREIGN KEY ("sourceWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_destinationBranch_fkey" FOREIGN KEY ("destinationBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_destinationWarehouse_fkey" FOREIGN KEY ("destinationWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_reversalOf_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "StockTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_preparedBy_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_approvedBy_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_postedBy_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_reversedBy_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_transfer_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_product_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_variant_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_lot_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferUnit" ADD CONSTRAINT "StockTransferUnit_line_fkey" FOREIGN KEY ("transferLineId") REFERENCES "StockTransferLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferUnit" ADD CONSTRAINT "StockTransferUnit_stockUnit_fkey" FOREIGN KEY ("stockUnitId") REFERENCES "PhysicalStockUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enforce tenant, branch, warehouse, direction, reversal, and actor scope.
CREATE OR REPLACE FUNCTION enforce_stock_transfer_scope()
RETURNS trigger AS $$
DECLARE
  source_branch_company UUID;
  destination_branch_company UUID;
  source_warehouse_company UUID;
  source_warehouse_branch UUID;
  destination_warehouse_company UUID;
  destination_warehouse_branch UUID;
  source_active BOOLEAN;
  destination_active BOOLEAN;
  source_dispatch BOOLEAN;
  destination_receive BOOLEAN;
  reversal_company UUID;
  reversal_source_warehouse UUID;
  reversal_destination_warehouse UUID;
  reversal_link UUID;
BEGIN
  SELECT "companyId" INTO source_branch_company FROM "Branch" WHERE "id" = NEW."sourceBranchId";
  SELECT "companyId" INTO destination_branch_company FROM "Branch" WHERE "id" = NEW."destinationBranchId";
  SELECT "companyId", "branchId", "isActive", "allowDispatch"
    INTO source_warehouse_company, source_warehouse_branch, source_active, source_dispatch
    FROM "Warehouse" WHERE "id" = NEW."sourceWarehouseId";
  SELECT "companyId", "branchId", "isActive", "allowReceiving"
    INTO destination_warehouse_company, destination_warehouse_branch, destination_active, destination_receive
    FROM "Warehouse" WHERE "id" = NEW."destinationWarehouseId";
  IF source_branch_company IS DISTINCT FROM NEW."companyId"
     OR destination_branch_company IS DISTINCT FROM NEW."companyId"
     OR source_warehouse_company IS DISTINCT FROM NEW."companyId"
     OR destination_warehouse_company IS DISTINCT FROM NEW."companyId"
     OR source_warehouse_branch IS DISTINCT FROM NEW."sourceBranchId"
     OR destination_warehouse_branch IS DISTINCT FROM NEW."destinationBranchId"
     OR NEW."sourceWarehouseId" = NEW."destinationWarehouseId" THEN
    RAISE EXCEPTION 'Stock transfer branches and warehouses are outside transfer scope';
  END IF;
  IF TG_OP = 'INSERT' AND (NOT source_active OR NOT destination_active OR NOT source_dispatch OR NOT destination_receive) THEN
    RAISE EXCEPTION 'Stock transfer requires an active dispatch source and active receiving destination';
  END IF;
  IF NEW."reversalOfId" IS NOT NULL THEN
    SELECT "companyId", "sourceWarehouseId", "destinationWarehouseId", "reversalOfId"
      INTO reversal_company, reversal_source_warehouse, reversal_destination_warehouse, reversal_link
      FROM "StockTransfer" WHERE "id" = NEW."reversalOfId";
    IF reversal_company IS DISTINCT FROM NEW."companyId"
       OR reversal_link IS NOT NULL
       OR reversal_source_warehouse IS DISTINCT FROM NEW."destinationWarehouseId"
       OR reversal_destination_warehouse IS DISTINCT FROM NEW."sourceWarehouseId" THEN
      RAISE EXCEPTION 'Stock transfer reversal is outside scope or does not reverse direction';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockTransfer_scope_guard"
BEFORE INSERT OR UPDATE ON "StockTransfer"
FOR EACH ROW EXECUTE FUNCTION enforce_stock_transfer_scope();

CREATE OR REPLACE FUNCTION enforce_stock_transfer_line_scope()
RETURNS trigger AS $$
DECLARE
  transfer_company UUID;
  transfer_status "OperationalDocumentStatus";
  product_company UUID;
  product_tracking "TrackingMethod";
  variant_company UUID;
  variant_product UUID;
  lot_company UUID;
  lot_product UUID;
  lot_variant UUID;
BEGIN
  SELECT "companyId", "status" INTO transfer_company, transfer_status FROM "StockTransfer" WHERE "id" = NEW."transferId";
  SELECT "companyId", "trackingMethod" INTO product_company, product_tracking FROM "Product" WHERE "id" = NEW."productId";
  SELECT "companyId", "productId" INTO variant_company, variant_product FROM "ProductVariant" WHERE "id" = NEW."variantId";
  IF transfer_status IS DISTINCT FROM 'DRAFT'
     OR product_company IS DISTINCT FROM transfer_company
     OR variant_company IS DISTINCT FROM transfer_company
     OR variant_product IS DISTINCT FROM NEW."productId"
     OR product_tracking IS DISTINCT FROM NEW."trackingMethod" THEN
    RAISE EXCEPTION 'Stock transfer line is outside scope, mismatches tracking, or parent is not draft';
  END IF;
  IF NEW."lotId" IS NOT NULL THEN
    SELECT "companyId", "productId", "variantId" INTO lot_company, lot_product, lot_variant FROM "InventoryLot" WHERE "id" = NEW."lotId";
    IF lot_company IS DISTINCT FROM transfer_company OR lot_product IS DISTINCT FROM NEW."productId" OR lot_variant IS DISTINCT FROM NEW."variantId" THEN
      RAISE EXCEPTION 'Stock transfer lot is outside line scope';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockTransferLine_scope_guard"
BEFORE INSERT OR UPDATE ON "StockTransferLine"
FOR EACH ROW EXECUTE FUNCTION enforce_stock_transfer_line_scope();

CREATE OR REPLACE FUNCTION protect_stock_transfer_line_delete()
RETURNS trigger AS $$
DECLARE parent_status "OperationalDocumentStatus";
BEGIN
  SELECT "status" INTO parent_status FROM "StockTransfer" WHERE "id" = OLD."transferId";
  IF parent_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Only draft stock transfer lines may be deleted'; END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockTransferLine_delete_guard"
BEFORE DELETE ON "StockTransferLine"
FOR EACH ROW EXECUTE FUNCTION protect_stock_transfer_line_delete();

CREATE OR REPLACE FUNCTION enforce_stock_transfer_unit_scope()
RETURNS trigger AS $$
DECLARE
  parent_status "OperationalDocumentStatus";
  parent_company UUID;
  line_product UUID;
  line_variant UUID;
  unit_company UUID;
  unit_product UUID;
  unit_variant UUID;
BEGIN
  SELECT t."status", t."companyId", l."productId", l."variantId"
    INTO parent_status, parent_company, line_product, line_variant
    FROM "StockTransferLine" l JOIN "StockTransfer" t ON t."id" = l."transferId"
    WHERE l."id" = NEW."transferLineId";
  SELECT "companyId", "productId", "variantId" INTO unit_company, unit_product, unit_variant
    FROM "PhysicalStockUnit" WHERE "id" = NEW."stockUnitId";
  IF parent_status IS DISTINCT FROM 'DRAFT'
     OR unit_company IS DISTINCT FROM parent_company
     OR unit_product IS DISTINCT FROM line_product
     OR unit_variant IS DISTINCT FROM line_variant THEN
    RAISE EXCEPTION 'Stock transfer unit is outside line scope or parent is not draft';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockTransferUnit_scope_guard"
BEFORE INSERT OR UPDATE ON "StockTransferUnit"
FOR EACH ROW EXECUTE FUNCTION enforce_stock_transfer_unit_scope();

CREATE OR REPLACE FUNCTION protect_stock_transfer_unit_delete()
RETURNS trigger AS $$
DECLARE parent_status "OperationalDocumentStatus";
BEGIN
  SELECT t."status" INTO parent_status
    FROM "StockTransferLine" l JOIN "StockTransfer" t ON t."id" = l."transferId"
    WHERE l."id" = OLD."transferLineId";
  IF parent_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Only draft stock transfer units may be deleted'; END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockTransferUnit_delete_guard"
BEFORE DELETE ON "StockTransferUnit"
FOR EACH ROW EXECUTE FUNCTION protect_stock_transfer_unit_delete();

-- Header data becomes immutable after leaving draft. Only lifecycle actor/time
-- columns may change during the explicitly permitted transition.
CREATE OR REPLACE FUNCTION enforce_stock_transfer_transition()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' AND (
    NEW."companyId" IS DISTINCT FROM OLD."companyId"
    OR NEW."sourceBranchId" IS DISTINCT FROM OLD."sourceBranchId"
    OR NEW."sourceWarehouseId" IS DISTINCT FROM OLD."sourceWarehouseId"
    OR NEW."destinationBranchId" IS DISTINCT FROM OLD."destinationBranchId"
    OR NEW."destinationWarehouseId" IS DISTINCT FROM OLD."destinationWarehouseId"
    OR NEW."reversalOfId" IS DISTINCT FROM OLD."reversalOfId"
    OR NEW."transferNumber" IS DISTINCT FROM OLD."transferNumber"
    OR NEW."transferDate" IS DISTINCT FROM OLD."transferDate"
    OR NEW."reference" IS DISTINCT FROM OLD."reference"
    OR NEW."reason" IS DISTINCT FROM OLD."reason"
    OR NEW."remarks" IS DISTINCT FROM OLD."remarks"
    OR NEW."preparedById" IS DISTINCT FROM OLD."preparedById"
    OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
  ) THEN RAISE EXCEPTION 'Submitted and posted stock transfer data is immutable'; END IF;
  IF NEW."status" = OLD."status" THEN RETURN NEW; END IF;
  IF OLD."status" = 'DRAFT' AND NEW."status" IN ('SUBMITTED','POSTED','CANCELLED') THEN RETURN NEW; END IF;
  IF OLD."status" = 'SUBMITTED' AND NEW."status" IN ('DRAFT','APPROVED','POSTED','CANCELLED') THEN RETURN NEW; END IF;
  IF OLD."status" = 'APPROVED' AND NEW."status" IN ('POSTED','CANCELLED') THEN RETURN NEW; END IF;
  IF OLD."status" = 'POSTED' AND NEW."status" = 'REVERSED' THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Invalid stock transfer status transition from % to %', OLD."status", NEW."status";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockTransfer_transition_guard"
BEFORE UPDATE ON "StockTransfer"
FOR EACH ROW EXECUTE FUNCTION enforce_stock_transfer_transition();

CREATE OR REPLACE FUNCTION protect_stock_transfer_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Stock transfers preserve audit history and cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockTransfer_delete_guard"
BEFORE DELETE ON "StockTransfer"
FOR EACH ROW EXECUTE FUNCTION protect_stock_transfer_delete();

-- Exact stock effects are verified before a transfer may become posted.
CREATE OR REPLACE FUNCTION verify_stock_transfer_effects()
RETURNS trigger AS $$
DECLARE mismatch_exists BOOLEAN;
BEGIN
  IF NEW."status" <> 'POSTED' OR OLD."status" = 'POSTED' THEN RETURN NEW; END IF;
  SELECT EXISTS (
    SELECT 1 FROM "StockTransferLine" l
    WHERE l."transferId" = NEW."id" AND (
      COALESCE((SELECT SUM(m."quantity") FROM "InventoryMovement" m
        WHERE m."sourceDocumentType" = 'StockTransfer' AND m."sourceDocumentId" = NEW."id"
          AND m."lineReference" = l."id"::text AND m."movementType" = 'TRANSFER_OUT'
          AND m."branchId" = NEW."sourceBranchId" AND m."warehouseId" = NEW."sourceWarehouseId"), 0) <> -l."quantity"
      OR COALESCE((SELECT SUM(m."quantity") FROM "InventoryMovement" m
        WHERE m."sourceDocumentType" = 'StockTransfer' AND m."sourceDocumentId" = NEW."id"
          AND m."lineReference" = l."id"::text AND m."movementType" = 'TRANSFER_IN'
          AND m."branchId" = NEW."destinationBranchId" AND m."warehouseId" = NEW."destinationWarehouseId"), 0) <> l."quantity"
      OR COALESCE((SELECT SUM(m."totalCost") FROM "InventoryMovement" m
        WHERE m."sourceDocumentType" = 'StockTransfer' AND m."sourceDocumentId" = NEW."id"
          AND m."lineReference" = l."id"::text AND m."movementType" = 'TRANSFER_OUT'), 0) <> -l."totalCost"
      OR COALESCE((SELECT SUM(m."totalCost") FROM "InventoryMovement" m
        WHERE m."sourceDocumentType" = 'StockTransfer' AND m."sourceDocumentId" = NEW."id"
          AND m."lineReference" = l."id"::text AND m."movementType" = 'TRANSFER_IN'), 0) <> l."totalCost"
      OR (l."trackingMethod" IN ('IMEI','SERIAL') AND (
        l."quantity" <> trunc(l."quantity")
        OR (SELECT COUNT(*) FROM "StockTransferUnit" u WHERE u."transferLineId" = l."id") <> l."quantity"
        OR (SELECT COUNT(*) FROM "InventoryMovement" m WHERE m."sourceDocumentType" = 'StockTransfer'
             AND m."sourceDocumentId" = NEW."id" AND m."lineReference" = l."id"::text
             AND m."movementType" = 'TRANSFER_OUT' AND m."stockUnitId" IS NOT NULL) <> l."quantity"
        OR (SELECT COUNT(*) FROM "InventoryMovement" m WHERE m."sourceDocumentType" = 'StockTransfer'
             AND m."sourceDocumentId" = NEW."id" AND m."lineReference" = l."id"::text
             AND m."movementType" = 'TRANSFER_IN' AND m."stockUnitId" IS NOT NULL) <> l."quantity"
      ))
      OR (l."trackingMethod" NOT IN ('IMEI','SERIAL') AND EXISTS (
        SELECT 1 FROM "StockTransferUnit" u WHERE u."transferLineId" = l."id"
      ))
    )
  ) OR EXISTS (
    SELECT 1 FROM "InventoryMovement" m
    WHERE m."sourceDocumentType" = 'StockTransfer' AND m."sourceDocumentId" = NEW."id"
      AND (m."movementType" NOT IN ('TRANSFER_OUT','TRANSFER_IN') OR NOT EXISTS (
        SELECT 1 FROM "StockTransferLine" l WHERE l."transferId" = NEW."id" AND l."id"::text = m."lineReference"
      ))
  ) INTO mismatch_exists;
  IF mismatch_exists THEN RAISE EXCEPTION 'Stock transfer inventory movements do not exactly match its lines, costs, and units'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "StockTransferLine" l WHERE l."transferId" = NEW."id") THEN
    RAISE EXCEPTION 'A stock transfer requires at least one line';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockTransfer_effect_guard"
BEFORE UPDATE ON "StockTransfer"
FOR EACH ROW EXECUTE FUNCTION verify_stock_transfer_effects();
