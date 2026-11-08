-- CreateEnum
CREATE TYPE "StockReturnType" AS ENUM ('SALES_RETURN', 'PURCHASE_RETURN');

-- CreateEnum
CREATE TYPE "StockReturnDisposition" AS ENUM ('RESTOCK', 'QUARANTINE', 'RETURN_TO_VENDOR', 'SCRAP');

-- CreateTable
CREATE TABLE "StockReturn" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "customerId" UUID,
    "supplierId" UUID,
    "salesInvoiceId" UUID,
    "purchaseReceiptId" UUID,
    "journalEntryId" UUID,
    "returnNumber" VARCHAR(60) NOT NULL,
    "returnType" "StockReturnType" NOT NULL,
    "returnDate" DATE NOT NULL,
    "status" "OperationalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "currencyCode" CHAR(3) NOT NULL,
    "subtotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "costTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "reason" VARCHAR(500) NOT NULL,
    "notes" TEXT,
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "preparedById" UUID NOT NULL,
    "approvedById" UUID,
    "postedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "postedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StockReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReturnLine" (
    "id" UUID NOT NULL,
    "returnId" UUID NOT NULL,
    "sourceSalesLineId" UUID,
    "sourceReceiptLineId" UUID,
    "productId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "lineNumber" SMALLINT NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "unitAmount" DECIMAL(19,4) NOT NULL,
    "discountAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(19,4) NOT NULL,
    "costTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "disposition" "StockReturnDisposition" NOT NULL,
    "condition" VARCHAR(80),
    "notes" VARCHAR(500),

    CONSTRAINT "StockReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReturnUnit" (
    "id" UUID NOT NULL,
    "returnLineId" UUID NOT NULL,
    "stockUnitId" UUID NOT NULL,

    CONSTRAINT "StockReturnUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockReturn_journalEntryId_key" ON "StockReturn"("journalEntryId");

-- CreateIndex
CREATE INDEX "StockReturn_companyId_returnType_status_returnDate_idx" ON "StockReturn"("companyId", "returnType", "status", "returnDate");

-- CreateIndex
CREATE INDEX "StockReturn_salesInvoiceId_idx" ON "StockReturn"("salesInvoiceId");

-- CreateIndex
CREATE INDEX "StockReturn_purchaseReceiptId_idx" ON "StockReturn"("purchaseReceiptId");

-- CreateIndex
CREATE UNIQUE INDEX "StockReturn_companyId_returnNumber_key" ON "StockReturn"("companyId", "returnNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StockReturn_companyId_idempotencyKey_key" ON "StockReturn"("companyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "StockReturnLine_productId_variantId_idx" ON "StockReturnLine"("productId", "variantId");

-- CreateIndex
CREATE INDEX "StockReturnLine_sourceSalesLineId_idx" ON "StockReturnLine"("sourceSalesLineId");

-- CreateIndex
CREATE INDEX "StockReturnLine_sourceReceiptLineId_idx" ON "StockReturnLine"("sourceReceiptLineId");

-- CreateIndex
CREATE UNIQUE INDEX "StockReturnLine_returnId_lineNumber_key" ON "StockReturnLine"("returnId", "lineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StockReturnLine_returnId_sourceSalesLineId_key" ON "StockReturnLine"("returnId", "sourceSalesLineId");

-- CreateIndex
CREATE UNIQUE INDEX "StockReturnLine_returnId_sourceReceiptLineId_key" ON "StockReturnLine"("returnId", "sourceReceiptLineId");

-- CreateIndex
CREATE INDEX "StockReturnUnit_stockUnitId_idx" ON "StockReturnUnit"("stockUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "StockReturnUnit_returnLineId_stockUnitId_key" ON "StockReturnUnit"("returnLineId", "stockUnitId");

-- AddForeignKey
ALTER TABLE "StockReturn" ADD CONSTRAINT "StockReturn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReturn" ADD CONSTRAINT "StockReturn_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReturn" ADD CONSTRAINT "StockReturn_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReturn" ADD CONSTRAINT "StockReturn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReturn" ADD CONSTRAINT "StockReturn_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReturn" ADD CONSTRAINT "StockReturn_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReturn" ADD CONSTRAINT "StockReturn_purchaseReceiptId_fkey" FOREIGN KEY ("purchaseReceiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReturn" ADD CONSTRAINT "StockReturn_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReturn" ADD CONSTRAINT "StockReturn_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReturn" ADD CONSTRAINT "StockReturn_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReturn" ADD CONSTRAINT "StockReturn_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReturnLine" ADD CONSTRAINT "StockReturnLine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "StockReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReturnLine" ADD CONSTRAINT "StockReturnLine_sourceSalesLineId_fkey" FOREIGN KEY ("sourceSalesLineId") REFERENCES "SalesInvoiceLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReturnLine" ADD CONSTRAINT "StockReturnLine_sourceReceiptLineId_fkey" FOREIGN KEY ("sourceReceiptLineId") REFERENCES "PurchaseReceiptLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReturnLine" ADD CONSTRAINT "StockReturnLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReturnLine" ADD CONSTRAINT "StockReturnLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReturnUnit" ADD CONSTRAINT "StockReturnUnit_returnLineId_fkey" FOREIGN KEY ("returnLineId") REFERENCES "StockReturnLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReturnUnit" ADD CONSTRAINT "StockReturnUnit_stockUnitId_fkey" FOREIGN KEY ("stockUnitId") REFERENCES "PhysicalStockUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Cross-field and monetary invariants.
ALTER TABLE "StockReturn" ADD CONSTRAINT "StockReturn_source_check" CHECK (
  ("returnType" = 'SALES_RETURN' AND "salesInvoiceId" IS NOT NULL AND "customerId" IS NOT NULL AND "purchaseReceiptId" IS NULL AND "supplierId" IS NULL)
  OR
  ("returnType" = 'PURCHASE_RETURN' AND "purchaseReceiptId" IS NOT NULL AND "supplierId" IS NOT NULL AND "salesInvoiceId" IS NULL AND "customerId" IS NULL)
);
ALTER TABLE "StockReturn" ADD CONSTRAINT "StockReturn_totals_check" CHECK (
  "subtotal" >= 0 AND "discountTotal" >= 0 AND "taxTotal" >= 0 AND "grandTotal" >= 0 AND "costTotal" >= 0
);
ALTER TABLE "StockReturnLine" ADD CONSTRAINT "StockReturnLine_source_check" CHECK (
  ("sourceSalesLineId" IS NOT NULL) <> ("sourceReceiptLineId" IS NOT NULL)
);
ALTER TABLE "StockReturnLine" ADD CONSTRAINT "StockReturnLine_amounts_check" CHECK (
  "quantity" > 0 AND "unitAmount" >= 0 AND "discountAmount" >= 0 AND "taxRate" >= 0 AND "taxRate" <= 100
  AND "taxAmount" >= 0 AND "lineTotal" >= 0 AND "costTotal" >= 0
);

-- Return children are editable only while their parent is a draft.
CREATE OR REPLACE FUNCTION protect_stock_return_child()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id uuid; parent_status "OperationalDocumentStatus";
BEGIN
  IF TG_TABLE_NAME = 'StockReturnLine' THEN
    parent_id := COALESCE(NEW."returnId", OLD."returnId");
  ELSE
    SELECT "returnId" INTO parent_id FROM "StockReturnLine" WHERE "id" = COALESCE(NEW."returnLineId", OLD."returnLineId");
  END IF;
  SELECT "status" INTO parent_status FROM "StockReturn" WHERE "id" = parent_id FOR UPDATE;
  IF parent_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Return document children are immutable after draft';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER "StockReturnLine_parent_guard" BEFORE INSERT OR UPDATE OR DELETE ON "StockReturnLine" FOR EACH ROW EXECUTE FUNCTION protect_stock_return_child();
CREATE TRIGGER "StockReturnUnit_parent_guard" BEFORE INSERT OR UPDATE OR DELETE ON "StockReturnUnit" FOR EACH ROW EXECUTE FUNCTION protect_stock_return_child();

CREATE OR REPLACE FUNCTION guard_stock_return_header()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'Non-draft returns cannot be deleted';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  IF OLD."status" = 'POSTED' THEN
    RAISE EXCEPTION 'Posted returns are immutable; use an authorized reversal';
  END IF;
  IF OLD."status" <> NEW."status" AND NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('SUBMITTED','CANCELLED')) OR
    (OLD."status" = 'SUBMITTED' AND NEW."status" IN ('APPROVED','REJECTED','CANCELLED')) OR
    (OLD."status" = 'APPROVED' AND NEW."status" IN ('POSTED','CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'Invalid stock return status transition from % to %', OLD."status", NEW."status";
  END IF;
  IF OLD."status" <> 'DRAFT' AND (
    OLD."companyId", OLD."branchId", OLD."warehouseId", OLD."customerId", OLD."supplierId", OLD."salesInvoiceId", OLD."purchaseReceiptId",
    OLD."returnNumber", OLD."returnType", OLD."returnDate", OLD."currencyCode", OLD."subtotal", OLD."discountTotal", OLD."taxTotal", OLD."grandTotal", OLD."costTotal", OLD."reason", OLD."idempotencyKey", OLD."preparedById"
  ) IS DISTINCT FROM (
    NEW."companyId", NEW."branchId", NEW."warehouseId", NEW."customerId", NEW."supplierId", NEW."salesInvoiceId", NEW."purchaseReceiptId",
    NEW."returnNumber", NEW."returnType", NEW."returnDate", NEW."currencyCode", NEW."subtotal", NEW."discountTotal", NEW."taxTotal", NEW."grandTotal", NEW."costTotal", NEW."reason", NEW."idempotencyKey", NEW."preparedById"
  ) THEN
    RAISE EXCEPTION 'Submitted return commercial fields are immutable';
  END IF;
  IF OLD."status" <> 'POSTED' AND NEW."status" = 'POSTED' THEN
    IF OLD."status" <> 'APPROVED' OR NEW."journalEntryId" IS NULL OR NEW."postedById" IS NULL OR NEW."postedAt" IS NULL THEN
      RAISE EXCEPTION 'Only an approved return with posting custody and journal may be posted';
    END IF;
    IF NEW."approvedById" IS NULL OR NEW."preparedById" = NEW."approvedById" OR NEW."preparedById" = NEW."postedById" OR NEW."approvedById" = NEW."postedById" THEN
      RAISE EXCEPTION 'Return posting requires distinct preparer, approver, and poster';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "JournalEntry" WHERE "id" = NEW."journalEntryId" AND "status" = 'POSTED' AND "sourceDocumentId" = NEW."id") THEN
      RAISE EXCEPTION 'Posted return requires its linked posted journal';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "StockReturn_header_guard" BEFORE UPDATE OR DELETE ON "StockReturn" FOR EACH ROW EXECUTE FUNCTION guard_stock_return_header();
