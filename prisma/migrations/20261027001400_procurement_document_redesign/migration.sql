-- Enterprise procurement document model: editable multi-line drafts, partial
-- receipts, inspection state, landed costs, tax policy snapshots, and direct
-- receipt controls. Existing posted records are preserved and backfilled.

ALTER TYPE "OperationalDocumentStatus" ADD VALUE IF NOT EXISTS 'INSPECTION' AFTER 'SUBMITTED';
ALTER TYPE "OperationalDocumentStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_RECEIVED' AFTER 'APPROVED';
ALTER TYPE "OperationalDocumentStatus" ADD VALUE IF NOT EXISTS 'FULLY_RECEIVED' AFTER 'PARTIALLY_RECEIVED';
ALTER TYPE "OperationalDocumentStatus" ADD VALUE IF NOT EXISTS 'CLOSED' AFTER 'POSTED';
ALTER TYPE "OperationalDocumentStatus" ADD VALUE IF NOT EXISTS 'REJECTED' AFTER 'CLOSED';

CREATE TYPE "PurchaseReceiptType" AS ENUM ('PO_BASED', 'DIRECT');
CREATE TYPE "QualityInspectionResult" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'QUARANTINED');

CREATE TABLE "TaxRule" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "code" VARCHAR(40) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "rate" DECIMAL(9,4) NOT NULL,
  "appliesToPurchases" BOOLEAN NOT NULL DEFAULT true,
  "appliesToSales" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TaxRule_valid_rate" CHECK ("rate" >= 0 AND "rate" <= 100)
);
CREATE UNIQUE INDEX "TaxRule_companyId_code_key" ON "TaxRule"("companyId", "code");
CREATE INDEX "TaxRule_companyId_isActive_idx" ON "TaxRule"("companyId", "isActive");
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Product" ADD COLUMN "taxRuleId" UUID;
CREATE INDEX "Product_taxRuleId_idx" ON "Product"("taxRuleId");
ALTER TABLE "Product" ADD CONSTRAINT "Product_taxRuleId_fkey" FOREIGN KEY ("taxRuleId") REFERENCES "TaxRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrder"
  ADD COLUMN "supplierReference" VARCHAR(100),
  ADD COLUMN "paymentTermsDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "exchangeRate" DECIMAL(19,8) NOT NULL DEFAULT 1,
  ADD COLUMN "documentDiscount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN "freightTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN "otherCharges" DECIMAL(19,4) NOT NULL DEFAULT 0;

ALTER TABLE "PurchaseOrderLine"
  ADD COLUMN "taxRuleId" UUID,
  ADD COLUMN "taxRate" DECIMAL(9,4) NOT NULL DEFAULT 0;
CREATE INDEX "PurchaseOrderLine_taxRuleId_idx" ON "PurchaseOrderLine"("taxRuleId");
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_taxRuleId_fkey" FOREIGN KEY ("taxRuleId") REFERENCES "TaxRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurchaseReceipt"
  ADD COLUMN "receiptType" "PurchaseReceiptType" NOT NULL DEFAULT 'PO_BASED',
  ADD COLUMN "supplierDeliveryNote" VARCHAR(100),
  ADD COLUMN "directReceiptReason" VARCHAR(300),
  ADD COLUMN "discountTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN "documentDiscount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN "freightTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN "otherCharges" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN "receivedById" UUID;
-- Backfills are migration-owned maintenance, not business edits. Temporarily
-- suspend only the relevant immutability trigger and restore it immediately.
ALTER TABLE "PurchaseReceipt" DISABLE TRIGGER "PurchaseReceipt_immutability_guard";
UPDATE "PurchaseReceipt" SET "receivedById" = "preparedById" WHERE "receivedById" IS NULL;
ALTER TABLE "PurchaseReceipt" ENABLE TRIGGER "PurchaseReceipt_immutability_guard";
ALTER TABLE "PurchaseReceipt" ALTER COLUMN "receivedById" SET NOT NULL;
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PurchaseReceipt_purchaseOrderId_status_idx" ON "PurchaseReceipt"("purchaseOrderId", "status");

ALTER TABLE "PurchaseReceiptLine"
  ADD COLUMN "taxRuleId" UUID,
  ADD COLUMN "acceptedQuantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN "rejectedQuantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN "discountAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN "taxRate" DECIMAL(9,4) NOT NULL DEFAULT 0,
  ADD COLUMN "allocatedDocumentDiscount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN "allocatedFreight" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN "allocatedOtherCharges" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN "landedUnitCost" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN "inspectionStatus" "QualityInspectionResult" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "inspectionNotes" VARCHAR(500);
ALTER TABLE "PurchaseReceiptLine" DISABLE TRIGGER "PurchaseReceiptLine_parent_guard";
UPDATE "PurchaseReceiptLine"
SET "acceptedQuantity" = "quantity",
    "landedUnitCost" = "unitCost",
    "inspectionStatus" = 'ACCEPTED';
ALTER TABLE "PurchaseReceiptLine" ENABLE TRIGGER "PurchaseReceiptLine_parent_guard";
CREATE INDEX "PurchaseReceiptLine_taxRuleId_idx" ON "PurchaseReceiptLine"("taxRuleId");
CREATE INDEX "PurchaseReceiptLine_orderLineId_idx" ON "PurchaseReceiptLine"("orderLineId");
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_taxRuleId_fkey" FOREIGN KEY ("taxRuleId") REFERENCES "TaxRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurchaseReceiptUnit"
  ADD COLUMN "condition" VARCHAR(80),
  ADD COLUMN "inspectionStatus" "QualityInspectionResult" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PurchaseReceiptUnit" DISABLE TRIGGER "PurchaseReceiptUnit_parent_guard";
UPDATE "PurchaseReceiptUnit" SET "inspectionStatus" = 'ACCEPTED';
ALTER TABLE "PurchaseReceiptUnit" ENABLE TRIGGER "PurchaseReceiptUnit_parent_guard";

CREATE TABLE "QualityInspection" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "receiptId" UUID NOT NULL,
  "receiptLineId" UUID NOT NULL,
  "receiptUnitId" UUID,
  "inspectedById" UUID NOT NULL,
  "result" "QualityInspectionResult" NOT NULL,
  "condition" VARCHAR(80),
  "notes" VARCHAR(500),
  "inspectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityInspection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "QualityInspection_companyId_receiptId_idx" ON "QualityInspection"("companyId", "receiptId");
CREATE INDEX "QualityInspection_receiptLineId_receiptUnitId_idx" ON "QualityInspection"("receiptLineId", "receiptUnitId");
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_receiptLineId_fkey" FOREIGN KEY ("receiptLineId") REFERENCES "PurchaseReceiptLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_receiptUnitId_fkey" FOREIGN KEY ("receiptUnitId") REFERENCES "PurchaseReceiptUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_inspectedById_fkey" FOREIGN KEY ("inspectedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Replace legacy amount checks with document-charge and inspection-aware checks.
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_nonnegative_totals";
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_nonnegative_totals" CHECK (
  "subtotal" >= 0 AND "discountTotal" >= 0 AND "documentDiscount" >= 0
  AND "taxTotal" >= 0 AND "freightTotal" >= 0 AND "otherCharges" >= 0
  AND "grandTotal" >= 0 AND "paymentTermsDays" BETWEEN 0 AND 3650 AND "exchangeRate" > 0
  AND "grandTotal" = round("subtotal" - "discountTotal" - "documentDiscount" + "taxTotal" + "freightTotal" + "otherCharges", 4)
);
ALTER TABLE "PurchaseOrderLine" DROP CONSTRAINT "PurchaseOrderLine_valid_values";
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_valid_values" CHECK (
  "orderedQuantity" > 0 AND "receivedQuantity" >= 0 AND "unitCost" >= 0
  AND "discountAmount" >= 0 AND "taxRate" BETWEEN 0 AND 100 AND "taxAmount" >= 0 AND "lineTotal" >= 0
  AND "discountAmount" <= round("orderedQuantity" * "unitCost", 4)
  AND "lineTotal" = round(("orderedQuantity" * "unitCost") - "discountAmount" + "taxAmount", 4)
);

ALTER TABLE "PurchaseReceipt" DROP CONSTRAINT "PurchaseReceipt_nonnegative_totals";
ALTER TABLE "PurchaseReceipt" DROP CONSTRAINT "PurchaseReceipt_workflow_metadata";
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_nonnegative_totals" CHECK (
  "subtotal" >= 0 AND "discountTotal" >= 0 AND "documentDiscount" >= 0
  AND "taxTotal" >= 0 AND "freightTotal" >= 0 AND "otherCharges" >= 0 AND "grandTotal" >= 0
  AND "grandTotal" = round("subtotal" - "discountTotal" - "documentDiscount" + "taxTotal" + "freightTotal" + "otherCharges", 4)
), ADD CONSTRAINT "PurchaseReceipt_type_reference" CHECK (
  ("receiptType" = 'PO_BASED' AND "purchaseOrderId" IS NOT NULL AND "directReceiptReason" IS NULL)
  OR ("receiptType" = 'DIRECT' AND "purchaseOrderId" IS NULL AND "directReceiptReason" IS NOT NULL AND length(trim("directReceiptReason")) > 0)
), ADD CONSTRAINT "PurchaseReceipt_workflow_metadata" CHECK (
  ("approvedById" IS NULL OR "approvedById" <> "preparedById")
  AND ("postedById" IS NULL OR ("postedById" <> "preparedById" AND "postedById" IS DISTINCT FROM "approvedById"))
  AND ("status" NOT IN ('APPROVED', 'POSTED', 'REVERSED') OR ("approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL))
  AND ("status" NOT IN ('POSTED', 'REVERSED') OR ("postedById" IS NOT NULL AND "postedAt" IS NOT NULL AND "journalEntryId" IS NOT NULL))
  AND ("status" <> 'REVERSED' OR ("reversedById" IS NOT NULL AND "reversedAt" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(trim("reversalReason")) > 0))
);
ALTER TABLE "PurchaseReceiptLine" DROP CONSTRAINT "PurchaseReceiptLine_valid_values";
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_valid_values" CHECK (
  "quantity" > 0 AND "acceptedQuantity" >= 0 AND "rejectedQuantity" >= 0
  AND "acceptedQuantity" + "rejectedQuantity" = "quantity" AND "unitCost" >= 0
  AND "discountAmount" >= 0 AND "taxRate" BETWEEN 0 AND 100 AND "taxAmount" >= 0
  AND "allocatedDocumentDiscount" >= 0 AND "allocatedFreight" >= 0 AND "allocatedOtherCharges" >= 0
  AND "landedUnitCost" >= 0 AND "lineTotal" >= 0
  AND "discountAmount" <= round("acceptedQuantity" * "unitCost", 4)
  AND "lineTotal" = round(("acceptedQuantity" * "unitCost") - "discountAmount" + "taxAmount", 4)
);

-- Scope and actor checks now include the receiver and inspection records.
CREATE OR REPLACE FUNCTION enforce_purchase_receipt_scope()
RETURNS trigger AS $$
DECLARE
  branch_company UUID; warehouse_company UUID; warehouse_branch UUID; supplier_company UUID;
  order_row "PurchaseOrder"%ROWTYPE; journal_company UUID; journal_branch UUID; journal_date DATE;
  reversal_company UUID; reversal_supplier UUID;
BEGIN
  SELECT "companyId" INTO branch_company FROM "Branch" WHERE "id" = NEW."branchId";
  SELECT "companyId", "branchId" INTO warehouse_company, warehouse_branch FROM "Warehouse" WHERE "id" = NEW."warehouseId";
  SELECT "companyId" INTO supplier_company FROM "Supplier" WHERE "id" = NEW."supplierId";
  IF branch_company IS DISTINCT FROM NEW."companyId" OR warehouse_company IS DISTINCT FROM NEW."companyId"
     OR warehouse_branch IS DISTINCT FROM NEW."branchId" OR supplier_company IS DISTINCT FROM NEW."companyId" THEN
    RAISE EXCEPTION 'Purchase receipt dimensions must share one tenant and branch';
  END IF;
  IF NEW."purchaseOrderId" IS NOT NULL THEN
    SELECT * INTO order_row FROM "PurchaseOrder" WHERE "id" = NEW."purchaseOrderId";
    IF order_row."companyId" IS DISTINCT FROM NEW."companyId" OR order_row."branchId" IS DISTINCT FROM NEW."branchId"
       OR order_row."warehouseId" IS DISTINCT FROM NEW."warehouseId" OR order_row."supplierId" IS DISTINCT FROM NEW."supplierId" THEN
      RAISE EXCEPTION 'Purchase receipt does not match its purchase order scope';
    END IF;
  END IF;
  IF NEW."journalEntryId" IS NOT NULL THEN
    SELECT "companyId", "branchId", "postingDate" INTO journal_company, journal_branch, journal_date FROM "JournalEntry" WHERE "id" = NEW."journalEntryId";
    IF journal_company IS DISTINCT FROM NEW."companyId" OR journal_branch IS DISTINCT FROM NEW."branchId" OR journal_date IS DISTINCT FROM NEW."receiptDate" THEN
      RAISE EXCEPTION 'Purchase receipt journal scope or date is invalid';
    END IF;
  END IF;
  IF NEW."reversalOfId" IS NOT NULL THEN
    SELECT "companyId", "supplierId" INTO reversal_company, reversal_supplier FROM "PurchaseReceipt" WHERE "id" = NEW."reversalOfId";
    IF reversal_company IS DISTINCT FROM NEW."companyId" OR reversal_supplier IS DISTINCT FROM NEW."supplierId" THEN RAISE EXCEPTION 'Purchase receipt reversal scope is invalid'; END IF;
  END IF;
  IF NOT user_is_active_company_member(NEW."preparedById", NEW."companyId")
     OR NOT user_is_active_company_member(NEW."receivedById", NEW."companyId")
     OR (NEW."approvedById" IS NOT NULL AND NOT user_is_active_company_member(NEW."approvedById", NEW."companyId"))
     OR (NEW."postedById" IS NOT NULL AND NOT user_is_active_company_member(NEW."postedById", NEW."companyId"))
     OR (NEW."reversedById" IS NOT NULL AND NOT user_is_active_company_member(NEW."reversedById", NEW."companyId")) THEN
    RAISE EXCEPTION 'Purchase receipt actors require active company membership';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_quality_inspection_scope()
RETURNS trigger AS $$
DECLARE receipt_company UUID; line_receipt UUID; unit_line UUID;
BEGIN
  SELECT "companyId" INTO receipt_company FROM "PurchaseReceipt" WHERE "id" = NEW."receiptId";
  SELECT "receiptId" INTO line_receipt FROM "PurchaseReceiptLine" WHERE "id" = NEW."receiptLineId";
  IF NEW."receiptUnitId" IS NOT NULL THEN SELECT "receiptLineId" INTO unit_line FROM "PurchaseReceiptUnit" WHERE "id" = NEW."receiptUnitId"; END IF;
  IF receipt_company IS DISTINCT FROM NEW."companyId" OR line_receipt IS DISTINCT FROM NEW."receiptId"
     OR (NEW."receiptUnitId" IS NOT NULL AND unit_line IS DISTINCT FROM NEW."receiptLineId")
     OR NOT user_is_active_company_member(NEW."inspectedById", NEW."companyId") THEN
    RAISE EXCEPTION 'Quality inspection scope or inspector is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "QualityInspection_scope_guard" BEFORE INSERT OR UPDATE ON "QualityInspection" FOR EACH ROW EXECUTE FUNCTION enforce_quality_inspection_scope();

-- Children remain immutable outside draft, except explicit inspection and
-- inventory-posting contexts. The exception field lists prevent hidden edits.
CREATE OR REPLACE FUNCTION protect_operational_child()
RETURNS trigger AS $$
DECLARE parent_status "OperationalDocumentStatus";
BEGIN
  IF TG_TABLE_NAME = 'PurchaseOrderLine' THEN
    SELECT "status" INTO parent_status FROM "PurchaseOrder" WHERE "id" = COALESCE(NEW."orderId", OLD."orderId");
    IF TG_OP = 'UPDATE' AND parent_status IN ('APPROVED', 'PARTIALLY_RECEIVED')
       AND current_setting('app.inventory_posting', true) = 'on'
       AND NEW."id" IS NOT DISTINCT FROM OLD."id" AND NEW."orderId" IS NOT DISTINCT FROM OLD."orderId"
       AND NEW."productId" IS NOT DISTINCT FROM OLD."productId" AND NEW."variantId" IS NOT DISTINCT FROM OLD."variantId"
       AND NEW."taxRuleId" IS NOT DISTINCT FROM OLD."taxRuleId" AND NEW."lineNumber" IS NOT DISTINCT FROM OLD."lineNumber"
       AND NEW."description" IS NOT DISTINCT FROM OLD."description" AND NEW."orderedQuantity" IS NOT DISTINCT FROM OLD."orderedQuantity"
       AND NEW."unitCost" IS NOT DISTINCT FROM OLD."unitCost" AND NEW."discountAmount" IS NOT DISTINCT FROM OLD."discountAmount"
       AND NEW."taxRate" IS NOT DISTINCT FROM OLD."taxRate" AND NEW."taxAmount" IS NOT DISTINCT FROM OLD."taxAmount"
       AND NEW."lineTotal" IS NOT DISTINCT FROM OLD."lineTotal" AND NEW."receivedQuantity" >= OLD."receivedQuantity" THEN RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'PurchaseReceiptLine' THEN
    SELECT "status" INTO parent_status FROM "PurchaseReceipt" WHERE "id" = COALESCE(NEW."receiptId", OLD."receiptId");
    IF TG_OP = 'UPDATE' AND parent_status IN ('SUBMITTED', 'INSPECTION')
       AND current_setting('app.quality_inspection', true) = 'on'
       AND NEW."id" IS NOT DISTINCT FROM OLD."id" AND NEW."receiptId" IS NOT DISTINCT FROM OLD."receiptId"
       AND NEW."orderLineId" IS NOT DISTINCT FROM OLD."orderLineId" AND NEW."productId" IS NOT DISTINCT FROM OLD."productId"
       AND NEW."variantId" IS NOT DISTINCT FROM OLD."variantId" AND NEW."lineNumber" IS NOT DISTINCT FROM OLD."lineNumber"
       AND NEW."quantity" IS NOT DISTINCT FROM OLD."quantity" AND NEW."unitCost" IS NOT DISTINCT FROM OLD."unitCost" THEN RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'PurchaseReceiptUnit' THEN
    SELECT r."status" INTO parent_status FROM "PurchaseReceipt" r JOIN "PurchaseReceiptLine" l ON l."receiptId" = r."id" WHERE l."id" = COALESCE(NEW."receiptLineId", OLD."receiptLineId");
    IF TG_OP = 'UPDATE' AND parent_status = 'APPROVED' AND current_setting('app.inventory_posting', true) = 'on'
       AND OLD."stockUnitId" IS NULL AND NEW."stockUnitId" IS NOT NULL
       AND NEW."receiptLineId" IS NOT DISTINCT FROM OLD."receiptLineId" AND NEW."identifiers" IS NOT DISTINCT FROM OLD."identifiers"
       AND NEW."attributes" IS NOT DISTINCT FROM OLD."attributes" AND NEW."condition" IS NOT DISTINCT FROM OLD."condition"
       AND NEW."inspectionStatus" IS NOT DISTINCT FROM OLD."inspectionStatus" AND NEW."createdAt" IS NOT DISTINCT FROM OLD."createdAt" THEN RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND parent_status IN ('SUBMITTED', 'INSPECTION') AND current_setting('app.quality_inspection', true) = 'on'
       AND NEW."id" IS NOT DISTINCT FROM OLD."id" AND NEW."receiptLineId" IS NOT DISTINCT FROM OLD."receiptLineId"
       AND NEW."stockUnitId" IS NOT DISTINCT FROM OLD."stockUnitId" AND NEW."identifiers" IS NOT DISTINCT FROM OLD."identifiers"
       AND NEW."attributes" IS NOT DISTINCT FROM OLD."attributes" AND NEW."createdAt" IS NOT DISTINCT FROM OLD."createdAt" THEN RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'SalesInvoiceLine' THEN
    SELECT "status" INTO parent_status FROM "SalesInvoice" WHERE "id" = COALESCE(NEW."invoiceId", OLD."invoiceId");
  ELSIF TG_TABLE_NAME = 'SalesInvoiceUnit' THEN
    SELECT i."status" INTO parent_status FROM "SalesInvoice" i JOIN "SalesInvoiceLine" l ON l."invoiceId" = i."id" WHERE l."id" = COALESCE(NEW."invoiceLineId", OLD."invoiceLineId");
  ELSIF TG_TABLE_NAME = 'PaymentAllocation' THEN
    SELECT "status" INTO parent_status FROM "Payment" WHERE "id" = COALESCE(NEW."paymentId", OLD."paymentId");
  END IF;
  IF parent_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Operational document children are immutable after draft'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Purchase orders have a richer lifecycle; other operational documents keep
-- their strict submit/approve/post/reverse sequence.
CREATE OR REPLACE FUNCTION enforce_operational_status_transition()
RETURNS trigger AS $$
BEGIN
  IF NEW."status" = OLD."status" THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'PurchaseOrder' THEN
    IF OLD."status" = 'DRAFT' AND NEW."status" IN ('SUBMITTED', 'CANCELLED') THEN RETURN NEW; END IF;
    IF OLD."status" = 'SUBMITTED' AND NEW."status" IN ('DRAFT', 'APPROVED', 'REJECTED', 'CANCELLED') THEN RETURN NEW; END IF;
    IF OLD."status" = 'REJECTED' AND NEW."status" = 'DRAFT' THEN RETURN NEW; END IF;
    IF OLD."status" = 'APPROVED' AND NEW."status" IN ('PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED', 'CANCELLED') THEN RETURN NEW; END IF;
    IF OLD."status" = 'PARTIALLY_RECEIVED' AND NEW."status" IN ('FULLY_RECEIVED', 'CLOSED') THEN RETURN NEW; END IF;
    IF OLD."status" = 'FULLY_RECEIVED' AND NEW."status" = 'CLOSED' THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME = 'PurchaseReceipt' THEN
    IF OLD."status" = 'DRAFT' AND NEW."status" IN ('SUBMITTED', 'INSPECTION', 'CANCELLED') THEN RETURN NEW; END IF;
    IF OLD."status" = 'SUBMITTED' AND NEW."status" IN ('DRAFT', 'INSPECTION', 'APPROVED', 'REJECTED', 'CANCELLED') THEN RETURN NEW; END IF;
    IF OLD."status" = 'INSPECTION' AND NEW."status" IN ('DRAFT', 'APPROVED', 'REJECTED', 'CANCELLED') THEN RETURN NEW; END IF;
    IF OLD."status" = 'REJECTED' AND NEW."status" = 'DRAFT' THEN RETURN NEW; END IF;
    IF OLD."status" = 'APPROVED' AND NEW."status" IN ('POSTED', 'CANCELLED') THEN RETURN NEW; END IF;
    IF OLD."status" = 'POSTED' AND NEW."status" = 'REVERSED' THEN RETURN NEW; END IF;
  ELSE
    IF OLD."status" = 'DRAFT' AND NEW."status" IN ('SUBMITTED', 'CANCELLED') THEN RETURN NEW; END IF;
    IF OLD."status" = 'SUBMITTED' AND NEW."status" IN ('DRAFT', 'APPROVED', 'REJECTED', 'CANCELLED') THEN RETURN NEW; END IF;
    IF OLD."status" = 'REJECTED' AND NEW."status" = 'DRAFT' THEN RETURN NEW; END IF;
    IF OLD."status" = 'APPROVED' AND NEW."status" IN ('POSTED', 'CANCELLED') THEN RETURN NEW; END IF;
    IF OLD."status" = 'POSTED' AND NEW."status" = 'REVERSED' THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'Invalid operational document status transition from % to %', OLD."status", NEW."status";
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION protect_purchase_order_non_draft()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' AND (
    NEW."companyId" IS DISTINCT FROM OLD."companyId" OR NEW."branchId" IS DISTINCT FROM OLD."branchId"
    OR NEW."supplierId" IS DISTINCT FROM OLD."supplierId" OR NEW."warehouseId" IS DISTINCT FROM OLD."warehouseId"
    OR NEW."orderNumber" IS DISTINCT FROM OLD."orderNumber" OR NEW."orderDate" IS DISTINCT FROM OLD."orderDate"
    OR NEW."expectedDate" IS DISTINCT FROM OLD."expectedDate" OR NEW."supplierReference" IS DISTINCT FROM OLD."supplierReference"
    OR NEW."paymentTermsDays" IS DISTINCT FROM OLD."paymentTermsDays" OR NEW."currencyCode" IS DISTINCT FROM OLD."currencyCode"
    OR NEW."exchangeRate" IS DISTINCT FROM OLD."exchangeRate" OR NEW."subtotal" IS DISTINCT FROM OLD."subtotal"
    OR NEW."discountTotal" IS DISTINCT FROM OLD."discountTotal" OR NEW."documentDiscount" IS DISTINCT FROM OLD."documentDiscount"
    OR NEW."taxTotal" IS DISTINCT FROM OLD."taxTotal" OR NEW."freightTotal" IS DISTINCT FROM OLD."freightTotal"
    OR NEW."otherCharges" IS DISTINCT FROM OLD."otherCharges" OR NEW."grandTotal" IS DISTINCT FROM OLD."grandTotal"
    OR NEW."notes" IS DISTINCT FROM OLD."notes" OR NEW."preparedById" IS DISTINCT FROM OLD."preparedById"
  ) THEN RAISE EXCEPTION 'Submitted purchase order commercial fields are immutable'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PurchaseOrder_commercial_immutability_guard" BEFORE UPDATE ON "PurchaseOrder" FOR EACH ROW EXECUTE FUNCTION protect_purchase_order_non_draft();

-- Posting guard recalculates all receipt values independently of client totals.
CREATE OR REPLACE FUNCTION verify_operational_document_posting()
RETURNS trigger AS $$
DECLARE line_count INTEGER; subtotal_sum NUMERIC(19,4); discount_sum NUMERIC(19,4); tax_sum NUMERIC(19,4); total_sum NUMERIC(19,4); allocation_sum NUMERIC(19,4);
  journal_status "JournalStatus"; journal_company UUID; journal_branch UUID; journal_source_id VARCHAR(80);
BEGIN
  IF NEW."status" <> 'POSTED' OR OLD."status" = 'POSTED' THEN RETURN NEW; END IF;
  IF OLD."status" <> 'APPROVED' THEN RAISE EXCEPTION 'Only an approved operational document can be posted'; END IF;
  SELECT "status", "companyId", "branchId", "sourceDocumentId" INTO journal_status, journal_company, journal_branch, journal_source_id FROM "JournalEntry" WHERE "id" = NEW."journalEntryId";
  IF journal_status <> 'POSTED' OR journal_company IS DISTINCT FROM NEW."companyId" OR journal_branch IS DISTINCT FROM NEW."branchId" OR journal_source_id IS DISTINCT FROM NEW."id"::text THEN
    RAISE EXCEPTION 'Posted operational document requires its linked posted journal';
  END IF;
  IF TG_TABLE_NAME = 'PurchaseReceipt' THEN
    SELECT COUNT(*), COALESCE(SUM("acceptedQuantity" * "unitCost"),0), COALESCE(SUM("discountAmount"),0), COALESCE(SUM("taxAmount"),0), COALESCE(SUM("lineTotal"),0)
      INTO line_count, subtotal_sum, discount_sum, tax_sum, total_sum FROM "PurchaseReceiptLine" WHERE "receiptId" = NEW."id";
    IF line_count < 1 OR round(subtotal_sum,4) <> NEW."subtotal" OR discount_sum <> NEW."discountTotal" OR tax_sum <> NEW."taxTotal"
       OR round(total_sum - NEW."documentDiscount" + NEW."freightTotal" + NEW."otherCharges",4) <> NEW."grandTotal" THEN
      RAISE EXCEPTION 'Purchase receipt totals do not match accepted line quantities and charges';
    END IF;
  ELSIF TG_TABLE_NAME = 'SalesInvoice' THEN
    SELECT COUNT(*), COALESCE(SUM("quantity" * "unitPrice"),0), COALESCE(SUM("discountAmount"),0), COALESCE(SUM("taxAmount"),0), COALESCE(SUM("lineTotal"),0)
      INTO line_count, subtotal_sum, discount_sum, tax_sum, total_sum FROM "SalesInvoiceLine" WHERE "invoiceId" = NEW."id";
    IF line_count < 1 OR round(subtotal_sum,4) <> NEW."subtotal" OR discount_sum <> NEW."discountTotal" OR tax_sum <> NEW."taxTotal" OR total_sum <> NEW."grandTotal" THEN
      RAISE EXCEPTION 'Sales invoice totals do not match its lines';
    END IF;
  ELSIF TG_TABLE_NAME = 'Payment' THEN
    SELECT COALESCE(SUM("amount"),0) INTO allocation_sum FROM "PaymentAllocation" WHERE "paymentId" = NEW."id";
    IF allocation_sum > NEW."amount" THEN RAISE EXCEPTION 'Payment allocations exceed the payment amount'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
