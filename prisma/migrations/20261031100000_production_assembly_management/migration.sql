-- CreateTable
CREATE TABLE "Bom" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "outputQuantity" DECIMAL(19,4) NOT NULL DEFAULT 1,
    "scrapPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Bom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomItem" (
    "id" UUID NOT NULL,
    "bomId" UUID NOT NULL,
    "componentProductId" UUID NOT NULL,
    "componentVariantId" UUID NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "scrapTolerance" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" VARCHAR(255),

    CONSTRAINT "BomItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrder" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "bomId" UUID NOT NULL,
    "orderNumber" VARCHAR(40) NOT NULL,
    "sourceWarehouseId" UUID NOT NULL,
    "targetWarehouseId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "plannedQuantity" DECIMAL(19,4) NOT NULL,
    "completedQuantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "scrappedQuantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "plannedStartDate" DATE NOT NULL,
    "plannedEndDate" DATE NOT NULL,
    "actualStartDate" TIMESTAMPTZ(3),
    "actualEndDate" TIMESTAMPTZ(3),
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "postedById" UUID,
    "journalEntryId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionMaterialIssue" (
    "id" UUID NOT NULL,
    "productionOrderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "unitCost" DECIMAL(19,4) NOT NULL,
    "totalCost" DECIMAL(19,4) NOT NULL,
    "movementId" UUID,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionMaterialIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrderUnit" (
    "id" UUID NOT NULL,
    "productionOrderId" UUID NOT NULL,
    "physicalStockUnitId" UUID NOT NULL,
    "imei1" VARCHAR(20) NOT NULL,
    "imei2" VARCHAR(20),
    "serialNumber" VARCHAR(60),
    "qcResult" VARCHAR(20) NOT NULL DEFAULT 'PASS',
    "qcNotes" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionOrderUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bom_companyId_productId_variantId_idx" ON "Bom"("companyId", "productId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Bom_companyId_code_key" ON "Bom"("companyId", "code");

-- CreateIndex
CREATE INDEX "BomItem_bomId_idx" ON "BomItem"("bomId");

-- CreateIndex
CREATE INDEX "ProductionOrder_companyId_branchId_status_idx" ON "ProductionOrder"("companyId", "branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrder_companyId_orderNumber_key" ON "ProductionOrder"("companyId", "orderNumber");

-- CreateIndex
CREATE INDEX "ProductionMaterialIssue_productionOrderId_idx" ON "ProductionMaterialIssue"("productionOrderId");

-- CreateIndex
CREATE INDEX "ProductionOrderUnit_productionOrderId_idx" ON "ProductionOrderUnit"("productionOrderId");

-- AddForeignKey
ALTER TABLE "Bom" ADD CONSTRAINT "Bom_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bom" ADD CONSTRAINT "Bom_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bom" ADD CONSTRAINT "Bom_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomItem" ADD CONSTRAINT "BomItem_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "Bom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomItem" ADD CONSTRAINT "BomItem_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomItem" ADD CONSTRAINT "BomItem_componentVariantId_fkey" FOREIGN KEY ("componentVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "Bom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_sourceWarehouseId_fkey" FOREIGN KEY ("sourceWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_targetWarehouseId_fkey" FOREIGN KEY ("targetWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionMaterialIssue" ADD CONSTRAINT "ProductionMaterialIssue_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionMaterialIssue" ADD CONSTRAINT "ProductionMaterialIssue_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionMaterialIssue" ADD CONSTRAINT "ProductionMaterialIssue_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionMaterialIssue" ADD CONSTRAINT "ProductionMaterialIssue_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderUnit" ADD CONSTRAINT "ProductionOrderUnit_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderUnit" ADD CONSTRAINT "ProductionOrderUnit_physicalStockUnitId_fkey" FOREIGN KEY ("physicalStockUnitId") REFERENCES "PhysicalStockUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

