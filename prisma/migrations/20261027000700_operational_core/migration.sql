-- CreateEnum
CREATE TYPE "OperationalDocumentStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "StockUnitStatus" AS ENUM ('IN_STOCK', 'RESERVED', 'IN_TRANSIT', 'SOLD', 'RETURNED', 'QUARANTINED', 'SCRAPPED');

-- CreateEnum
CREATE TYPE "IdentifierType" AS ENUM ('IMEI', 'SERIAL', 'MAC', 'OTHER');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('OPENING', 'PURCHASE_RECEIPT', 'PURCHASE_RETURN', 'SALE_ISSUE', 'SALES_RETURN', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'STOCKTAKE_GAIN', 'STOCKTAKE_LOSS', 'RESERVATION', 'RELEASE');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('CUSTOMER_RECEIPT', 'SUPPLIER_PAYMENT', 'CUSTOMER_REFUND', 'SUPPLIER_REFUND');

-- CreateTable
CREATE TABLE "PhysicalStockUnit" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "currentBranchId" UUID,
    "currentWarehouseId" UUID,
    "currentLocationId" UUID,
    "status" "StockUnitStatus" NOT NULL DEFAULT 'IN_STOCK',
    "acquisitionDate" DATE NOT NULL,
    "acquisitionCost" DECIMAL(19,4) NOT NULL,
    "soldAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "attributes" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PhysicalStockUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceIdentifier" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "stockUnitId" UUID NOT NULL,
    "type" "IdentifierType" NOT NULL,
    "value" VARCHAR(120) NOT NULL,
    "normalizedValue" VARCHAR(120) NOT NULL,
    "slot" SMALLINT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLot" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "lotNumber" VARCHAR(80) NOT NULL,
    "manufactureDate" DATE,
    "expiryDate" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBalance" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "lotId" UUID,
    "balanceKey" VARCHAR(180) NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "inventoryValue" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "locationId" UUID,
    "productId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "stockUnitId" UUID,
    "lotId" UUID,
    "journalEntryId" UUID,
    "reversalOfId" UUID,
    "movementGroupId" UUID NOT NULL,
    "idempotencyKey" VARCHAR(180) NOT NULL,
    "movementType" "InventoryMovementType" NOT NULL,
    "postingDate" DATE NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "unitCost" DECIMAL(19,4) NOT NULL,
    "totalCost" DECIMAL(19,4) NOT NULL,
    "sourceDocumentType" VARCHAR(80) NOT NULL,
    "sourceDocumentId" UUID NOT NULL,
    "sourceDocumentNumber" VARCHAR(80) NOT NULL,
    "lineReference" VARCHAR(80),
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "postedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReservation" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "stockUnitId" UUID,
    "quantity" DECIMAL(19,4) NOT NULL,
    "sourceType" VARCHAR(80) NOT NULL,
    "sourceId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),
    "releasedAt" TIMESTAMPTZ(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "orderNumber" VARCHAR(60) NOT NULL,
    "orderDate" DATE NOT NULL,
    "expectedDate" DATE,
    "status" "OperationalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "currencyCode" CHAR(3) NOT NULL,
    "subtotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "preparedById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "lineNumber" SMALLINT NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "orderedQuantity" DECIMAL(19,4) NOT NULL,
    "receivedQuantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(19,4) NOT NULL,
    "discountAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceipt" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "purchaseOrderId" UUID,
    "journalEntryId" UUID,
    "reversalOfId" UUID,
    "receiptNumber" VARCHAR(60) NOT NULL,
    "supplierInvoiceNumber" VARCHAR(80),
    "receiptDate" DATE NOT NULL,
    "invoiceDate" DATE,
    "dueDate" DATE,
    "status" "OperationalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "currencyCode" CHAR(3) NOT NULL,
    "subtotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "notes" TEXT,
    "preparedById" UUID NOT NULL,
    "approvedById" UUID,
    "postedById" UUID,
    "reversedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "postedAt" TIMESTAMPTZ(3),
    "reversedAt" TIMESTAMPTZ(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceiptLine" (
    "id" UUID NOT NULL,
    "receiptId" UUID NOT NULL,
    "orderLineId" UUID,
    "productId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "lotId" UUID,
    "lineNumber" SMALLINT NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "unitCost" DECIMAL(19,4) NOT NULL,
    "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "PurchaseReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceiptUnit" (
    "id" UUID NOT NULL,
    "receiptLineId" UUID NOT NULL,
    "stockUnitId" UUID,
    "identifiers" JSONB NOT NULL,
    "attributes" JSONB,

    CONSTRAINT "PurchaseReceiptUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInvoice" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "salespersonId" UUID,
    "journalEntryId" UUID,
    "reversalOfId" UUID,
    "invoiceNumber" VARCHAR(60) NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE,
    "status" "OperationalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "currencyCode" CHAR(3) NOT NULL,
    "subtotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "costTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "notes" TEXT,
    "preparedById" UUID NOT NULL,
    "approvedById" UUID,
    "postedById" UUID,
    "reversedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "postedAt" TIMESTAMPTZ(3),
    "reversedAt" TIMESTAMPTZ(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SalesInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInvoiceLine" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "lineNumber" SMALLINT NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "unitPrice" DECIMAL(19,4) NOT NULL,
    "discountAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(19,4) NOT NULL,
    "costTotal" DECIMAL(19,4) NOT NULL DEFAULT 0,

    CONSTRAINT "SalesInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInvoiceUnit" (
    "id" UUID NOT NULL,
    "invoiceLineId" UUID NOT NULL,
    "stockUnitId" UUID NOT NULL,

    CONSTRAINT "SalesInvoiceUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "customerId" UUID,
    "supplierId" UUID,
    "bankAccountId" UUID,
    "cashAccountId" UUID,
    "journalEntryId" UUID,
    "reversalOfId" UUID,
    "paymentNumber" VARCHAR(60) NOT NULL,
    "paymentDate" DATE NOT NULL,
    "direction" "PaymentDirection" NOT NULL,
    "status" "OperationalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "currencyCode" CHAR(3) NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "reference" VARCHAR(120),
    "notes" TEXT,
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "preparedById" UUID NOT NULL,
    "approvedById" UUID,
    "postedById" UUID,
    "reversedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "postedAt" TIMESTAMPTZ(3),
    "reversedAt" TIMESTAMPTZ(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "salesInvoiceId" UUID,
    "purchaseReceiptId" UUID,
    "amount" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PhysicalStockUnit_companyId_status_currentWarehouseId_idx" ON "PhysicalStockUnit"("companyId", "status", "currentWarehouseId");

-- CreateIndex
CREATE INDEX "PhysicalStockUnit_companyId_productId_variantId_idx" ON "PhysicalStockUnit"("companyId", "productId", "variantId");

-- CreateIndex
CREATE INDEX "DeviceIdentifier_stockUnitId_idx" ON "DeviceIdentifier"("stockUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceIdentifier_companyId_type_normalizedValue_key" ON "DeviceIdentifier"("companyId", "type", "normalizedValue");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceIdentifier_stockUnitId_type_slot_key" ON "DeviceIdentifier"("stockUnitId", "type", "slot");

-- CreateIndex
CREATE INDEX "InventoryLot_companyId_expiryDate_idx" ON "InventoryLot"("companyId", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLot_companyId_variantId_lotNumber_key" ON "InventoryLot"("companyId", "variantId", "lotNumber");

-- CreateIndex
CREATE INDEX "StockBalance_companyId_warehouseId_productId_variantId_idx" ON "StockBalance"("companyId", "warehouseId", "productId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "StockBalance_companyId_balanceKey_key" ON "StockBalance"("companyId", "balanceKey");

-- CreateIndex
CREATE INDEX "InventoryMovement_companyId_sourceDocumentType_sourceDocume_idx" ON "InventoryMovement"("companyId", "sourceDocumentType", "sourceDocumentId", "movementType");

-- CreateIndex
CREATE INDEX "InventoryMovement_companyId_postingDate_movementType_idx" ON "InventoryMovement"("companyId", "postingDate", "movementType");

-- CreateIndex
CREATE INDEX "InventoryMovement_companyId_warehouseId_productId_variantId_idx" ON "InventoryMovement"("companyId", "warehouseId", "productId", "variantId", "postingDate");

-- CreateIndex
CREATE INDEX "InventoryMovement_stockUnitId_postingDate_idx" ON "InventoryMovement"("stockUnitId", "postingDate");

-- CreateIndex
CREATE INDEX "InventoryMovement_movementGroupId_idx" ON "InventoryMovement"("movementGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_companyId_idempotencyKey_key" ON "InventoryMovement"("companyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryReservation_companyId_warehouseId_variantId_releas_idx" ON "InventoryReservation"("companyId", "warehouseId", "variantId", "releasedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "InventoryReservation_sourceType_sourceId_idx" ON "InventoryReservation"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_companyId_supplierId_status_orderDate_idx" ON "PurchaseOrder"("companyId", "supplierId", "status", "orderDate");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_companyId_orderNumber_key" ON "PurchaseOrder"("companyId", "orderNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_variantId_idx" ON "PurchaseOrderLine"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderLine_orderId_lineNumber_key" ON "PurchaseOrderLine"("orderId", "lineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_journalEntryId_key" ON "PurchaseReceipt"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_reversalOfId_key" ON "PurchaseReceipt"("reversalOfId");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_companyId_supplierId_status_receiptDate_idx" ON "PurchaseReceipt"("companyId", "supplierId", "status", "receiptDate");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_companyId_receiptNumber_key" ON "PurchaseReceipt"("companyId", "receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_companyId_idempotencyKey_key" ON "PurchaseReceipt"("companyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PurchaseReceiptLine_variantId_idx" ON "PurchaseReceiptLine"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceiptLine_receiptId_lineNumber_key" ON "PurchaseReceiptLine"("receiptId", "lineNumber");

-- CreateIndex
CREATE INDEX "PurchaseReceiptUnit_stockUnitId_idx" ON "PurchaseReceiptUnit"("stockUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceiptUnit_receiptLineId_stockUnitId_key" ON "PurchaseReceiptUnit"("receiptLineId", "stockUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_journalEntryId_key" ON "SalesInvoice"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_reversalOfId_key" ON "SalesInvoice"("reversalOfId");

-- CreateIndex
CREATE INDEX "SalesInvoice_companyId_customerId_status_invoiceDate_idx" ON "SalesInvoice"("companyId", "customerId", "status", "invoiceDate");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_companyId_invoiceNumber_key" ON "SalesInvoice"("companyId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_companyId_idempotencyKey_key" ON "SalesInvoice"("companyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "SalesInvoiceLine_variantId_idx" ON "SalesInvoiceLine"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoiceLine_invoiceId_lineNumber_key" ON "SalesInvoiceLine"("invoiceId", "lineNumber");

-- CreateIndex
CREATE INDEX "SalesInvoiceUnit_stockUnitId_idx" ON "SalesInvoiceUnit"("stockUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoiceUnit_invoiceLineId_stockUnitId_key" ON "SalesInvoiceUnit"("invoiceLineId", "stockUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_journalEntryId_key" ON "Payment"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reversalOfId_key" ON "Payment"("reversalOfId");

-- CreateIndex
CREATE INDEX "Payment_companyId_direction_status_paymentDate_idx" ON "Payment"("companyId", "direction", "status", "paymentDate");

-- CreateIndex
CREATE INDEX "Payment_customerId_paymentDate_idx" ON "Payment"("customerId", "paymentDate");

-- CreateIndex
CREATE INDEX "Payment_supplierId_paymentDate_idx" ON "Payment"("supplierId", "paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_companyId_paymentNumber_key" ON "Payment"("companyId", "paymentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_companyId_idempotencyKey_key" ON "Payment"("companyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_salesInvoiceId_idx" ON "PaymentAllocation"("salesInvoiceId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_purchaseReceiptId_idx" ON "PaymentAllocation"("purchaseReceiptId");

-- AddForeignKey
ALTER TABLE "PhysicalStockUnit" ADD CONSTRAINT "PhysicalStockUnit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalStockUnit" ADD CONSTRAINT "PhysicalStockUnit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalStockUnit" ADD CONSTRAINT "PhysicalStockUnit_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalStockUnit" ADD CONSTRAINT "PhysicalStockUnit_currentBranchId_fkey" FOREIGN KEY ("currentBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalStockUnit" ADD CONSTRAINT "PhysicalStockUnit_currentWarehouseId_fkey" FOREIGN KEY ("currentWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalStockUnit" ADD CONSTRAINT "PhysicalStockUnit_currentLocationId_fkey" FOREIGN KEY ("currentLocationId") REFERENCES "WarehouseLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceIdentifier" ADD CONSTRAINT "DeviceIdentifier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceIdentifier" ADD CONSTRAINT "DeviceIdentifier_stockUnitId_fkey" FOREIGN KEY ("stockUnitId") REFERENCES "PhysicalStockUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_stockUnitId_fkey" FOREIGN KEY ("stockUnitId") REFERENCES "PhysicalStockUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "InventoryMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_stockUnitId_fkey" FOREIGN KEY ("stockUnitId") REFERENCES "PhysicalStockUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "PurchaseReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptUnit" ADD CONSTRAINT "PurchaseReceiptUnit_receiptLineId_fkey" FOREIGN KEY ("receiptLineId") REFERENCES "PurchaseReceiptLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptUnit" ADD CONSTRAINT "PurchaseReceiptUnit_stockUnitId_fkey" FOREIGN KEY ("stockUnitId") REFERENCES "PhysicalStockUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "SalesInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceUnit" ADD CONSTRAINT "SalesInvoiceUnit_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "SalesInvoiceLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceUnit" ADD CONSTRAINT "SalesInvoiceUnit_stockUnitId_fkey" FOREIGN KEY ("stockUnitId") REFERENCES "PhysicalStockUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_purchaseReceiptId_fkey" FOREIGN KEY ("purchaseReceiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Operational integrity controls. InventoryMovement is the append-only stock
-- ledger; StockBalance is a concurrency-controlled projection of that ledger.
ALTER TABLE "PhysicalStockUnit"
  ADD CONSTRAINT "PhysicalStockUnit_nonnegative_cost_version" CHECK ("acquisitionCost" >= 0 AND "version" >= 0);
ALTER TABLE "DeviceIdentifier"
  ADD CONSTRAINT "DeviceIdentifier_nonblank" CHECK (length(trim("normalizedValue")) > 0),
  ADD CONSTRAINT "DeviceIdentifier_valid_slot" CHECK ("slot" IS NULL OR "slot" BETWEEN 1 AND 8),
  ADD CONSTRAINT "DeviceIdentifier_imei_shape" CHECK (
    "type" <> 'IMEI' OR ("slot" IS NOT NULL AND "normalizedValue" ~ '^[0-9]{15}$')
  );
CREATE UNIQUE INDEX "DeviceIdentifier_one_primary_per_unit"
  ON "DeviceIdentifier"("stockUnitId") WHERE "isPrimary" = true;
ALTER TABLE "InventoryLot"
  ADD CONSTRAINT "InventoryLot_valid_dates" CHECK (
    "manufactureDate" IS NULL OR "expiryDate" IS NULL OR "expiryDate" >= "manufactureDate"
  );
ALTER TABLE "StockBalance"
  ADD CONSTRAINT "StockBalance_nonnegative" CHECK (
    "quantity" >= 0 AND "inventoryValue" >= 0 AND "version" >= 0
  );
ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_valid_amounts" CHECK (
    "quantity" <> 0 AND "unitCost" >= 0 AND "totalCost" = round("quantity" * "unitCost", 4)
  ),
  ADD CONSTRAINT "InventoryMovement_valid_direction" CHECK (
    ("movementType" IN ('OPENING', 'PURCHASE_RECEIPT', 'SALES_RETURN', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'STOCKTAKE_GAIN', 'RELEASE') AND "quantity" > 0)
    OR
    ("movementType" IN ('PURCHASE_RETURN', 'SALE_ISSUE', 'TRANSFER_OUT', 'ADJUSTMENT_OUT', 'STOCKTAKE_LOSS', 'RESERVATION') AND "quantity" < 0)
  );
ALTER TABLE "InventoryReservation"
  ADD CONSTRAINT "InventoryReservation_positive_quantity" CHECK ("quantity" > 0),
  ADD CONSTRAINT "InventoryReservation_valid_release" CHECK ("releasedAt" IS NULL OR "releasedAt" >= "createdAt");

ALTER TABLE "PurchaseOrder"
  ADD CONSTRAINT "PurchaseOrder_valid_dates" CHECK ("expectedDate" IS NULL OR "expectedDate" >= "orderDate"),
  ADD CONSTRAINT "PurchaseOrder_nonnegative_totals" CHECK (
    "subtotal" >= 0 AND "discountTotal" >= 0 AND "taxTotal" >= 0 AND "grandTotal" >= 0
    AND "grandTotal" = round("subtotal" - "discountTotal" + "taxTotal", 4)
  ),
  ADD CONSTRAINT "PurchaseOrder_maker_checker" CHECK (
    "approvedById" IS NULL OR "approvedById" <> "preparedById"
  );
ALTER TABLE "PurchaseOrderLine"
  ADD CONSTRAINT "PurchaseOrderLine_valid_values" CHECK (
    "orderedQuantity" > 0 AND "receivedQuantity" >= 0 AND "receivedQuantity" <= "orderedQuantity"
    AND "unitCost" >= 0 AND "discountAmount" >= 0 AND "taxAmount" >= 0 AND "lineTotal" >= 0
    AND "lineTotal" = round(("orderedQuantity" * "unitCost") - "discountAmount" + "taxAmount", 4)
  );

ALTER TABLE "PurchaseReceipt"
  ADD CONSTRAINT "PurchaseReceipt_valid_dates" CHECK (
    ("invoiceDate" IS NULL OR "dueDate" IS NULL OR "dueDate" >= "invoiceDate")
  ),
  ADD CONSTRAINT "PurchaseReceipt_nonnegative_totals" CHECK (
    "subtotal" >= 0 AND "taxTotal" >= 0 AND "grandTotal" >= 0
    AND "grandTotal" = round("subtotal" + "taxTotal", 4)
  ),
  ADD CONSTRAINT "PurchaseReceipt_workflow_metadata" CHECK (
    ("approvedById" IS NULL OR "approvedById" <> "preparedById")
    AND ("postedById" IS NULL OR ("postedById" <> "preparedById" AND "postedById" IS DISTINCT FROM "approvedById"))
    AND ("status" NOT IN ('APPROVED', 'POSTED', 'REVERSED') OR ("approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL))
    AND ("status" NOT IN ('POSTED', 'REVERSED') OR ("postedById" IS NOT NULL AND "postedAt" IS NOT NULL AND "journalEntryId" IS NOT NULL))
    AND ("status" <> 'REVERSED' OR ("reversedById" IS NOT NULL AND "reversedAt" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(trim("reversalReason")) > 0))
  );
ALTER TABLE "PurchaseReceiptLine"
  ADD CONSTRAINT "PurchaseReceiptLine_valid_values" CHECK (
    "quantity" > 0 AND "unitCost" >= 0 AND "taxAmount" >= 0 AND "lineTotal" >= 0
    AND "lineTotal" = round(("quantity" * "unitCost") + "taxAmount", 4)
  );
ALTER TABLE "PurchaseReceiptUnit"
  ADD CONSTRAINT "PurchaseReceiptUnit_identifier_array" CHECK (
    jsonb_typeof("identifiers") = 'array' AND jsonb_array_length("identifiers") > 0
  );

ALTER TABLE "SalesInvoice"
  ADD CONSTRAINT "SalesInvoice_valid_dates" CHECK ("dueDate" IS NULL OR "dueDate" >= "invoiceDate"),
  ADD CONSTRAINT "SalesInvoice_nonnegative_totals" CHECK (
    "subtotal" >= 0 AND "discountTotal" >= 0 AND "taxTotal" >= 0
    AND "grandTotal" >= 0 AND "costTotal" >= 0
    AND "grandTotal" = round("subtotal" - "discountTotal" + "taxTotal", 4)
  ),
  ADD CONSTRAINT "SalesInvoice_maker_checker" CHECK (
    "approvedById" IS NULL OR "approvedById" <> "preparedById"
  ),
  ADD CONSTRAINT "SalesInvoice_workflow_metadata" CHECK (
    ("postedById" IS NULL OR ("postedById" <> "preparedById" AND "postedById" IS DISTINCT FROM "approvedById"))
    AND ("status" NOT IN ('APPROVED', 'POSTED', 'REVERSED') OR ("approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL))
    AND ("status" NOT IN ('POSTED', 'REVERSED') OR ("postedById" IS NOT NULL AND "postedAt" IS NOT NULL AND "journalEntryId" IS NOT NULL))
    AND ("status" <> 'REVERSED' OR ("reversedById" IS NOT NULL AND "reversedAt" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(trim("reversalReason")) > 0))
  );
ALTER TABLE "SalesInvoiceLine"
  ADD CONSTRAINT "SalesInvoiceLine_valid_values" CHECK (
    "quantity" > 0 AND "unitPrice" >= 0 AND "discountAmount" >= 0 AND "taxAmount" >= 0
    AND "lineTotal" >= 0 AND "costTotal" >= 0
    AND "lineTotal" = round(("quantity" * "unitPrice") - "discountAmount" + "taxAmount", 4)
  );

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_positive_amount" CHECK ("amount" > 0),
  ADD CONSTRAINT "Payment_exact_party" CHECK (
    ("direction" IN ('CUSTOMER_RECEIPT', 'CUSTOMER_REFUND') AND "customerId" IS NOT NULL AND "supplierId" IS NULL)
    OR
    ("direction" IN ('SUPPLIER_PAYMENT', 'SUPPLIER_REFUND') AND "supplierId" IS NOT NULL AND "customerId" IS NULL)
  ),
  ADD CONSTRAINT "Payment_exact_settlement_account" CHECK (num_nonnulls("bankAccountId", "cashAccountId") = 1),
  ADD CONSTRAINT "Payment_workflow_metadata" CHECK (
    ("approvedById" IS NULL OR "approvedById" <> "preparedById")
    AND ("postedById" IS NULL OR ("postedById" <> "preparedById" AND "postedById" IS DISTINCT FROM "approvedById"))
    AND ("status" NOT IN ('APPROVED', 'POSTED', 'REVERSED') OR ("approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL))
    AND ("status" NOT IN ('POSTED', 'REVERSED') OR ("postedById" IS NOT NULL AND "postedAt" IS NOT NULL AND "journalEntryId" IS NOT NULL))
    AND ("status" <> 'REVERSED' OR ("reversedById" IS NOT NULL AND "reversedAt" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(trim("reversalReason")) > 0))
  );
ALTER TABLE "PaymentAllocation"
  ADD CONSTRAINT "PaymentAllocation_positive_amount" CHECK ("amount" > 0),
  ADD CONSTRAINT "PaymentAllocation_exact_target" CHECK (num_nonnulls("salesInvoiceId", "purchaseReceiptId") = 1);
CREATE UNIQUE INDEX "PaymentAllocation_unique_sales_target"
  ON "PaymentAllocation"("paymentId", "salesInvoiceId") WHERE "salesInvoiceId" IS NOT NULL;
CREATE UNIQUE INDEX "PaymentAllocation_unique_purchase_target"
  ON "PaymentAllocation"("paymentId", "purchaseReceiptId") WHERE "purchaseReceiptId" IS NOT NULL;

-- Cross-tenant and parent/child scope guards.
CREATE OR REPLACE FUNCTION enforce_stock_unit_scope()
RETURNS trigger AS $$
DECLARE
  product_company UUID;
  variant_company UUID;
  variant_product UUID;
  branch_company UUID;
  warehouse_company UUID;
  warehouse_branch UUID;
  location_warehouse UUID;
BEGIN
  SELECT "companyId" INTO product_company FROM "Product" WHERE "id" = NEW."productId";
  SELECT "companyId", "productId" INTO variant_company, variant_product FROM "ProductVariant" WHERE "id" = NEW."variantId";
  IF product_company IS DISTINCT FROM NEW."companyId" OR variant_company IS DISTINCT FROM NEW."companyId"
     OR variant_product IS DISTINCT FROM NEW."productId" THEN
    RAISE EXCEPTION 'Stock unit product and variant must belong to the same tenant and product';
  END IF;
  IF NEW."currentBranchId" IS NOT NULL THEN
    SELECT "companyId" INTO branch_company FROM "Branch" WHERE "id" = NEW."currentBranchId";
    IF branch_company IS DISTINCT FROM NEW."companyId" THEN RAISE EXCEPTION 'Stock unit branch belongs to another tenant'; END IF;
  END IF;
  IF NEW."currentWarehouseId" IS NOT NULL THEN
    SELECT "companyId", "branchId" INTO warehouse_company, warehouse_branch FROM "Warehouse" WHERE "id" = NEW."currentWarehouseId";
    IF warehouse_company IS DISTINCT FROM NEW."companyId" OR (NEW."currentBranchId" IS NOT NULL AND warehouse_branch IS DISTINCT FROM NEW."currentBranchId") THEN
      RAISE EXCEPTION 'Stock unit warehouse scope is invalid';
    END IF;
  END IF;
  IF NEW."currentLocationId" IS NOT NULL THEN
    SELECT "warehouseId" INTO location_warehouse FROM "WarehouseLocation" WHERE "id" = NEW."currentLocationId";
    IF location_warehouse IS DISTINCT FROM NEW."currentWarehouseId" THEN RAISE EXCEPTION 'Stock unit location is outside its warehouse'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PhysicalStockUnit_scope_guard"
BEFORE INSERT OR UPDATE ON "PhysicalStockUnit"
FOR EACH ROW EXECUTE FUNCTION enforce_stock_unit_scope();

CREATE OR REPLACE FUNCTION enforce_device_identifier_scope()
RETURNS trigger AS $$
DECLARE stock_company UUID;
BEGIN
  SELECT "companyId" INTO stock_company FROM "PhysicalStockUnit" WHERE "id" = NEW."stockUnitId";
  IF stock_company IS DISTINCT FROM NEW."companyId" THEN RAISE EXCEPTION 'Device identifier belongs to another tenant'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "DeviceIdentifier_scope_guard"
BEFORE INSERT OR UPDATE ON "DeviceIdentifier"
FOR EACH ROW EXECUTE FUNCTION enforce_device_identifier_scope();

CREATE OR REPLACE FUNCTION enforce_inventory_dimension_scope()
RETURNS trigger AS $$
DECLARE
  branch_company UUID;
  warehouse_company UUID;
  warehouse_branch UUID;
  product_company UUID;
  variant_company UUID;
  variant_product UUID;
  lot_company UUID;
  lot_product UUID;
  lot_variant UUID;
BEGIN
  SELECT "companyId" INTO branch_company FROM "Branch" WHERE "id" = NEW."branchId";
  SELECT "companyId", "branchId" INTO warehouse_company, warehouse_branch FROM "Warehouse" WHERE "id" = NEW."warehouseId";
  SELECT "companyId" INTO product_company FROM "Product" WHERE "id" = NEW."productId";
  SELECT "companyId", "productId" INTO variant_company, variant_product FROM "ProductVariant" WHERE "id" = NEW."variantId";
  IF branch_company IS DISTINCT FROM NEW."companyId" OR warehouse_company IS DISTINCT FROM NEW."companyId"
     OR warehouse_branch IS DISTINCT FROM NEW."branchId" OR product_company IS DISTINCT FROM NEW."companyId"
     OR variant_company IS DISTINCT FROM NEW."companyId" OR variant_product IS DISTINCT FROM NEW."productId" THEN
    RAISE EXCEPTION 'Inventory dimensions cross tenant, branch, warehouse, product, or variant scope';
  END IF;
  IF NEW."lotId" IS NOT NULL THEN
    SELECT "companyId", "productId", "variantId" INTO lot_company, lot_product, lot_variant FROM "InventoryLot" WHERE "id" = NEW."lotId";
    IF lot_company IS DISTINCT FROM NEW."companyId" OR lot_product IS DISTINCT FROM NEW."productId" OR lot_variant IS DISTINCT FROM NEW."variantId" THEN
      RAISE EXCEPTION 'Inventory lot scope is invalid';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StockBalance_scope_guard"
BEFORE INSERT OR UPDATE ON "StockBalance"
FOR EACH ROW EXECUTE FUNCTION enforce_inventory_dimension_scope();

CREATE OR REPLACE FUNCTION enforce_inventory_movement_scope()
RETURNS trigger AS $$
DECLARE
  branch_company UUID;
  warehouse_company UUID;
  warehouse_branch UUID;
  location_warehouse UUID;
  product_company UUID;
  variant_company UUID;
  variant_product UUID;
  stock_company UUID;
  stock_product UUID;
  stock_variant UUID;
  lot_company UUID;
  lot_product UUID;
  lot_variant UUID;
  journal_company UUID;
  journal_branch UUID;
  journal_date DATE;
  journal_status "JournalStatus";
BEGIN
  SELECT "companyId" INTO branch_company FROM "Branch" WHERE "id" = NEW."branchId";
  SELECT "companyId", "branchId" INTO warehouse_company, warehouse_branch FROM "Warehouse" WHERE "id" = NEW."warehouseId";
  SELECT "companyId" INTO product_company FROM "Product" WHERE "id" = NEW."productId";
  SELECT "companyId", "productId" INTO variant_company, variant_product FROM "ProductVariant" WHERE "id" = NEW."variantId";
  IF branch_company IS DISTINCT FROM NEW."companyId" OR warehouse_company IS DISTINCT FROM NEW."companyId"
     OR warehouse_branch IS DISTINCT FROM NEW."branchId" OR product_company IS DISTINCT FROM NEW."companyId"
     OR variant_company IS DISTINCT FROM NEW."companyId" OR variant_product IS DISTINCT FROM NEW."productId" THEN
    RAISE EXCEPTION 'Inventory movement dimensions are outside scope';
  END IF;
  IF NEW."locationId" IS NOT NULL THEN
    SELECT "warehouseId" INTO location_warehouse FROM "WarehouseLocation" WHERE "id" = NEW."locationId";
    IF location_warehouse IS DISTINCT FROM NEW."warehouseId" THEN RAISE EXCEPTION 'Inventory movement location is outside its warehouse'; END IF;
  END IF;
  IF NEW."stockUnitId" IS NOT NULL THEN
    SELECT "companyId", "productId", "variantId" INTO stock_company, stock_product, stock_variant FROM "PhysicalStockUnit" WHERE "id" = NEW."stockUnitId";
    IF stock_company IS DISTINCT FROM NEW."companyId" OR stock_product IS DISTINCT FROM NEW."productId" OR stock_variant IS DISTINCT FROM NEW."variantId" THEN
      RAISE EXCEPTION 'Inventory movement stock unit scope is invalid';
    END IF;
  END IF;
  IF NEW."lotId" IS NOT NULL THEN
    SELECT "companyId", "productId", "variantId" INTO lot_company, lot_product, lot_variant FROM "InventoryLot" WHERE "id" = NEW."lotId";
    IF lot_company IS DISTINCT FROM NEW."companyId" OR lot_product IS DISTINCT FROM NEW."productId" OR lot_variant IS DISTINCT FROM NEW."variantId" THEN
      RAISE EXCEPTION 'Inventory movement lot scope is invalid';
    END IF;
  END IF;
  IF NEW."journalEntryId" IS NOT NULL THEN
    SELECT "companyId", "branchId", "postingDate", "status" INTO journal_company, journal_branch, journal_date, journal_status
      FROM "JournalEntry" WHERE "id" = NEW."journalEntryId";
    IF journal_company IS DISTINCT FROM NEW."companyId" OR journal_branch IS DISTINCT FROM NEW."branchId"
       OR journal_date IS DISTINCT FROM NEW."postingDate" OR journal_status <> 'POSTED' THEN
      RAISE EXCEPTION 'Inventory movement must reference a posted journal in the same tenant, branch, and date';
    END IF;
  ELSIF NEW."movementType" NOT IN ('TRANSFER_OUT', 'TRANSFER_IN', 'RESERVATION', 'RELEASE') THEN
    RAISE EXCEPTION 'Financial inventory movements require a posted journal';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "AccountingPeriod" p
    WHERE p."companyId" = NEW."companyId" AND p."status" = 'OPEN'
      AND NEW."postingDate" BETWEEN p."startDate" AND p."endDate"
  ) THEN RAISE EXCEPTION 'Inventory movement posting date is not in an open period'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "InventoryMovement_scope_guard"
BEFORE INSERT ON "InventoryMovement"
FOR EACH ROW EXECUTE FUNCTION enforce_inventory_movement_scope();

CREATE OR REPLACE FUNCTION protect_inventory_movement()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Inventory movements are append-only; create a linked reversal movement';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "InventoryMovement_append_only"
BEFORE UPDATE OR DELETE ON "InventoryMovement"
FOR EACH ROW EXECUTE FUNCTION protect_inventory_movement();

CREATE OR REPLACE FUNCTION enforce_reservation_scope()
RETURNS trigger AS $$
DECLARE
  branch_company UUID;
  warehouse_company UUID;
  warehouse_branch UUID;
  product_company UUID;
  variant_company UUID;
  variant_product UUID;
  stock_company UUID;
BEGIN
  SELECT "companyId" INTO branch_company FROM "Branch" WHERE "id" = NEW."branchId";
  SELECT "companyId", "branchId" INTO warehouse_company, warehouse_branch FROM "Warehouse" WHERE "id" = NEW."warehouseId";
  SELECT "companyId" INTO product_company FROM "Product" WHERE "id" = NEW."productId";
  SELECT "companyId", "productId" INTO variant_company, variant_product FROM "ProductVariant" WHERE "id" = NEW."variantId";
  IF branch_company IS DISTINCT FROM NEW."companyId" OR warehouse_company IS DISTINCT FROM NEW."companyId"
     OR warehouse_branch IS DISTINCT FROM NEW."branchId" OR product_company IS DISTINCT FROM NEW."companyId"
     OR variant_company IS DISTINCT FROM NEW."companyId" OR variant_product IS DISTINCT FROM NEW."productId" THEN
    RAISE EXCEPTION 'Inventory reservation dimensions are outside scope';
  END IF;
  IF NEW."stockUnitId" IS NOT NULL THEN
    SELECT "companyId" INTO stock_company FROM "PhysicalStockUnit" WHERE "id" = NEW."stockUnitId";
    IF stock_company IS DISTINCT FROM NEW."companyId" THEN RAISE EXCEPTION 'Reserved stock unit belongs to another tenant'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "InventoryReservation_scope_guard"
BEFORE INSERT OR UPDATE ON "InventoryReservation"
FOR EACH ROW EXECUTE FUNCTION enforce_reservation_scope();

-- Document children are editable only while their parent is a draft. The one
-- exception links staged purchase identifiers to new stock units while posting.
CREATE OR REPLACE FUNCTION protect_operational_child()
RETURNS trigger AS $$
DECLARE parent_status "OperationalDocumentStatus";
BEGIN
  IF TG_TABLE_NAME = 'PurchaseOrderLine' THEN
    SELECT "status" INTO parent_status FROM "PurchaseOrder" WHERE "id" = COALESCE(NEW."orderId", OLD."orderId");
  ELSIF TG_TABLE_NAME = 'PurchaseReceiptLine' THEN
    SELECT "status" INTO parent_status FROM "PurchaseReceipt" WHERE "id" = COALESCE(NEW."receiptId", OLD."receiptId");
  ELSIF TG_TABLE_NAME = 'PurchaseReceiptUnit' THEN
    SELECT r."status" INTO parent_status FROM "PurchaseReceipt" r JOIN "PurchaseReceiptLine" l ON l."receiptId" = r."id"
      WHERE l."id" = COALESCE(NEW."receiptLineId", OLD."receiptLineId");
    IF TG_OP = 'UPDATE' AND parent_status = 'APPROVED'
       AND OLD."stockUnitId" IS NULL AND NEW."stockUnitId" IS NOT NULL
       AND NEW."receiptLineId" IS NOT DISTINCT FROM OLD."receiptLineId"
       AND NEW."identifiers" IS NOT DISTINCT FROM OLD."identifiers"
       AND NEW."attributes" IS NOT DISTINCT FROM OLD."attributes" THEN
      RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'SalesInvoiceLine' THEN
    SELECT "status" INTO parent_status FROM "SalesInvoice" WHERE "id" = COALESCE(NEW."invoiceId", OLD."invoiceId");
  ELSIF TG_TABLE_NAME = 'SalesInvoiceUnit' THEN
    SELECT i."status" INTO parent_status FROM "SalesInvoice" i JOIN "SalesInvoiceLine" l ON l."invoiceId" = i."id"
      WHERE l."id" = COALESCE(NEW."invoiceLineId", OLD."invoiceLineId");
  ELSIF TG_TABLE_NAME = 'PaymentAllocation' THEN
    SELECT "status" INTO parent_status FROM "Payment" WHERE "id" = COALESCE(NEW."paymentId", OLD."paymentId");
  END IF;
  IF parent_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Operational document children are immutable after draft';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PurchaseOrderLine_parent_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PurchaseOrderLine" FOR EACH ROW EXECUTE FUNCTION protect_operational_child();
CREATE TRIGGER "PurchaseReceiptLine_parent_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PurchaseReceiptLine" FOR EACH ROW EXECUTE FUNCTION protect_operational_child();
CREATE TRIGGER "PurchaseReceiptUnit_parent_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PurchaseReceiptUnit" FOR EACH ROW EXECUTE FUNCTION protect_operational_child();
CREATE TRIGGER "SalesInvoiceLine_parent_guard" BEFORE INSERT OR UPDATE OR DELETE ON "SalesInvoiceLine" FOR EACH ROW EXECUTE FUNCTION protect_operational_child();
CREATE TRIGGER "SalesInvoiceUnit_parent_guard" BEFORE INSERT OR UPDATE OR DELETE ON "SalesInvoiceUnit" FOR EACH ROW EXECUTE FUNCTION protect_operational_child();
CREATE TRIGGER "PaymentAllocation_parent_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PaymentAllocation" FOR EACH ROW EXECUTE FUNCTION protect_operational_child();

-- Verify totals and linked posted journals before documents enter POSTED.
CREATE OR REPLACE FUNCTION verify_operational_document_posting()
RETURNS trigger AS $$
DECLARE
  line_count INTEGER;
  subtotal_sum NUMERIC(19,4);
  discount_sum NUMERIC(19,4);
  tax_sum NUMERIC(19,4);
  total_sum NUMERIC(19,4);
  allocation_sum NUMERIC(19,4);
  journal_status "JournalStatus";
  journal_company UUID;
  journal_branch UUID;
  journal_source_id VARCHAR(80);
BEGIN
  IF NEW."status" <> 'POSTED' OR OLD."status" = 'POSTED' THEN RETURN NEW; END IF;
  IF OLD."status" <> 'APPROVED' THEN RAISE EXCEPTION 'Only an approved operational document can be posted'; END IF;

  SELECT "status", "companyId", "branchId", "sourceDocumentId"
    INTO journal_status, journal_company, journal_branch, journal_source_id
    FROM "JournalEntry" WHERE "id" = NEW."journalEntryId";
  IF journal_status <> 'POSTED' OR journal_company IS DISTINCT FROM NEW."companyId"
     OR journal_branch IS DISTINCT FROM NEW."branchId" OR journal_source_id IS DISTINCT FROM NEW."id"::text THEN
    RAISE EXCEPTION 'Posted operational document requires its linked posted journal';
  END IF;

  IF TG_TABLE_NAME = 'PurchaseReceipt' THEN
    SELECT COUNT(*), COALESCE(SUM("quantity" * "unitCost"), 0), COALESCE(SUM("taxAmount"), 0), COALESCE(SUM("lineTotal"), 0)
      INTO line_count, subtotal_sum, tax_sum, total_sum FROM "PurchaseReceiptLine" WHERE "receiptId" = NEW."id";
    IF line_count < 1 OR round(subtotal_sum,4) <> NEW."subtotal" OR tax_sum <> NEW."taxTotal" OR total_sum <> NEW."grandTotal" THEN
      RAISE EXCEPTION 'Purchase receipt totals do not match its lines';
    END IF;
  ELSIF TG_TABLE_NAME = 'SalesInvoice' THEN
    SELECT COUNT(*), COALESCE(SUM("quantity" * "unitPrice"), 0), COALESCE(SUM("discountAmount"), 0), COALESCE(SUM("taxAmount"), 0), COALESCE(SUM("lineTotal"), 0)
      INTO line_count, subtotal_sum, discount_sum, tax_sum, total_sum FROM "SalesInvoiceLine" WHERE "invoiceId" = NEW."id";
    IF line_count < 1 OR round(subtotal_sum,4) <> NEW."subtotal" OR discount_sum <> NEW."discountTotal"
       OR tax_sum <> NEW."taxTotal" OR total_sum <> NEW."grandTotal" THEN
      RAISE EXCEPTION 'Sales invoice totals do not match its lines';
    END IF;
  ELSIF TG_TABLE_NAME = 'Payment' THEN
    SELECT COALESCE(SUM("amount"), 0) INTO allocation_sum FROM "PaymentAllocation" WHERE "paymentId" = NEW."id";
    IF allocation_sum > NEW."amount" THEN RAISE EXCEPTION 'Payment allocations exceed the payment amount'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PurchaseReceipt_posting_guard" BEFORE UPDATE ON "PurchaseReceipt" FOR EACH ROW EXECUTE FUNCTION verify_operational_document_posting();
CREATE TRIGGER "SalesInvoice_posting_guard" BEFORE UPDATE ON "SalesInvoice" FOR EACH ROW EXECUTE FUNCTION verify_operational_document_posting();
CREATE TRIGGER "Payment_posting_guard" BEFORE UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION verify_operational_document_posting();

-- Posted operational records cannot be edited or deleted. A posted record may
-- only be marked REVERSED after a separate linked posted reversal exists.
CREATE OR REPLACE FUNCTION protect_posted_operational_document()
RETURNS trigger AS $$
DECLARE reversal_exists BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' AND OLD."status" IN ('POSTED', 'REVERSED') THEN
    RAISE EXCEPTION 'Posted or reversed operational documents cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" = 'REVERSED' THEN
    RAISE EXCEPTION 'Reversed operational documents are immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" = 'POSTED' THEN
    IF TG_TABLE_NAME = 'PurchaseReceipt' THEN
      SELECT EXISTS(SELECT 1 FROM "PurchaseReceipt" WHERE "reversalOfId" = OLD."id" AND "status" = 'POSTED') INTO reversal_exists;
    ELSIF TG_TABLE_NAME = 'SalesInvoice' THEN
      SELECT EXISTS(SELECT 1 FROM "SalesInvoice" WHERE "reversalOfId" = OLD."id" AND "status" = 'POSTED') INTO reversal_exists;
    ELSE
      SELECT EXISTS(SELECT 1 FROM "Payment" WHERE "reversalOfId" = OLD."id" AND "status" = 'POSTED') INTO reversal_exists;
    END IF;
    IF NEW."status" <> 'REVERSED' OR NOT reversal_exists
       OR NEW."reversedById" IS NULL OR NEW."reversedAt" IS NULL OR NEW."reversalReason" IS NULL OR length(trim(NEW."reversalReason")) = 0
       OR NEW."companyId" IS DISTINCT FROM OLD."companyId" OR NEW."branchId" IS DISTINCT FROM OLD."branchId"
       OR NEW."journalEntryId" IS DISTINCT FROM OLD."journalEntryId" THEN
      RAISE EXCEPTION 'Posted operational documents are immutable; use a linked reversal';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PurchaseReceipt_immutability_guard" BEFORE UPDATE OR DELETE ON "PurchaseReceipt" FOR EACH ROW EXECUTE FUNCTION protect_posted_operational_document();
CREATE TRIGGER "SalesInvoice_immutability_guard" BEFORE UPDATE OR DELETE ON "SalesInvoice" FOR EACH ROW EXECUTE FUNCTION protect_posted_operational_document();
CREATE TRIGGER "Payment_immutability_guard" BEFORE UPDATE OR DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION protect_posted_operational_document();


CREATE OR REPLACE FUNCTION user_is_active_company_member(p_user UUID, p_company UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM "CompanyMembership"
    WHERE "userId" = p_user AND "companyId" = p_company AND "status" = 'ACTIVE'
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION enforce_purchase_order_scope()
RETURNS trigger AS $$
DECLARE
  branch_company UUID;
  warehouse_company UUID;
  warehouse_branch UUID;
  supplier_company UUID;
BEGIN
  SELECT "companyId" INTO branch_company FROM "Branch" WHERE "id" = NEW."branchId";
  SELECT "companyId", "branchId" INTO warehouse_company, warehouse_branch FROM "Warehouse" WHERE "id" = NEW."warehouseId";
  SELECT "companyId" INTO supplier_company FROM "Supplier" WHERE "id" = NEW."supplierId";
  IF branch_company IS DISTINCT FROM NEW."companyId" OR warehouse_company IS DISTINCT FROM NEW."companyId"
     OR warehouse_branch IS DISTINCT FROM NEW."branchId" OR supplier_company IS DISTINCT FROM NEW."companyId" THEN
    RAISE EXCEPTION 'Purchase order branch, warehouse, and supplier must share one tenant';
  END IF;
  IF NOT user_is_active_company_member(NEW."preparedById", NEW."companyId")
     OR (NEW."approvedById" IS NOT NULL AND NOT user_is_active_company_member(NEW."approvedById", NEW."companyId")) THEN
    RAISE EXCEPTION 'Purchase order actors require active company membership';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PurchaseOrder_scope_guard" BEFORE INSERT OR UPDATE ON "PurchaseOrder" FOR EACH ROW EXECUTE FUNCTION enforce_purchase_order_scope();

CREATE OR REPLACE FUNCTION enforce_purchase_order_line_scope()
RETURNS trigger AS $$
DECLARE
  parent_company UUID;
  product_company UUID;
  variant_company UUID;
  variant_product UUID;
BEGIN
  SELECT "companyId" INTO parent_company FROM "PurchaseOrder" WHERE "id" = NEW."orderId";
  SELECT "companyId" INTO product_company FROM "Product" WHERE "id" = NEW."productId";
  SELECT "companyId", "productId" INTO variant_company, variant_product FROM "ProductVariant" WHERE "id" = NEW."variantId";
  IF product_company IS DISTINCT FROM parent_company OR variant_company IS DISTINCT FROM parent_company
     OR variant_product IS DISTINCT FROM NEW."productId" THEN
    RAISE EXCEPTION 'Purchase order line product and variant are outside order scope';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PurchaseOrderLine_scope_guard" BEFORE INSERT OR UPDATE ON "PurchaseOrderLine" FOR EACH ROW EXECUTE FUNCTION enforce_purchase_order_line_scope();

CREATE OR REPLACE FUNCTION enforce_purchase_receipt_scope()
RETURNS trigger AS $$
DECLARE
  branch_company UUID;
  warehouse_company UUID;
  warehouse_branch UUID;
  supplier_company UUID;
  order_row "PurchaseOrder"%ROWTYPE;
  journal_company UUID;
  journal_branch UUID;
  journal_date DATE;
  reversal_company UUID;
  reversal_supplier UUID;
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
    SELECT "companyId", "branchId", "postingDate" INTO journal_company, journal_branch, journal_date
      FROM "JournalEntry" WHERE "id" = NEW."journalEntryId";
    IF journal_company IS DISTINCT FROM NEW."companyId" OR journal_branch IS DISTINCT FROM NEW."branchId"
       OR journal_date IS DISTINCT FROM NEW."receiptDate" THEN
      RAISE EXCEPTION 'Purchase receipt journal scope or date is invalid';
    END IF;
  END IF;
  IF NEW."reversalOfId" IS NOT NULL THEN
    SELECT "companyId", "supplierId" INTO reversal_company, reversal_supplier FROM "PurchaseReceipt" WHERE "id" = NEW."reversalOfId";
    IF reversal_company IS DISTINCT FROM NEW."companyId" OR reversal_supplier IS DISTINCT FROM NEW."supplierId" THEN
      RAISE EXCEPTION 'Purchase receipt reversal scope is invalid';
    END IF;
  END IF;
  IF NOT user_is_active_company_member(NEW."preparedById", NEW."companyId")
     OR (NEW."approvedById" IS NOT NULL AND NOT user_is_active_company_member(NEW."approvedById", NEW."companyId"))
     OR (NEW."postedById" IS NOT NULL AND NOT user_is_active_company_member(NEW."postedById", NEW."companyId"))
     OR (NEW."reversedById" IS NOT NULL AND NOT user_is_active_company_member(NEW."reversedById", NEW."companyId")) THEN
    RAISE EXCEPTION 'Purchase receipt actors require active company membership';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PurchaseReceipt_scope_guard" BEFORE INSERT OR UPDATE ON "PurchaseReceipt" FOR EACH ROW EXECUTE FUNCTION enforce_purchase_receipt_scope();

CREATE OR REPLACE FUNCTION enforce_purchase_receipt_line_scope()
RETURNS trigger AS $$
DECLARE
  receipt_row "PurchaseReceipt"%ROWTYPE;
  product_company UUID;
  variant_company UUID;
  variant_product UUID;
  order_line_order UUID;
  lot_company UUID;
  lot_product UUID;
  lot_variant UUID;
BEGIN
  SELECT * INTO receipt_row FROM "PurchaseReceipt" WHERE "id" = NEW."receiptId";
  SELECT "companyId" INTO product_company FROM "Product" WHERE "id" = NEW."productId";
  SELECT "companyId", "productId" INTO variant_company, variant_product FROM "ProductVariant" WHERE "id" = NEW."variantId";
  IF product_company IS DISTINCT FROM receipt_row."companyId" OR variant_company IS DISTINCT FROM receipt_row."companyId"
     OR variant_product IS DISTINCT FROM NEW."productId" THEN
    RAISE EXCEPTION 'Purchase receipt line product and variant are outside receipt scope';
  END IF;
  IF NEW."orderLineId" IS NOT NULL THEN
    SELECT "orderId" INTO order_line_order FROM "PurchaseOrderLine" WHERE "id" = NEW."orderLineId";
    IF receipt_row."purchaseOrderId" IS NULL OR order_line_order IS DISTINCT FROM receipt_row."purchaseOrderId" THEN
      RAISE EXCEPTION 'Purchase receipt line does not belong to the receipt purchase order';
    END IF;
  END IF;
  IF NEW."lotId" IS NOT NULL THEN
    SELECT "companyId", "productId", "variantId" INTO lot_company, lot_product, lot_variant FROM "InventoryLot" WHERE "id" = NEW."lotId";
    IF lot_company IS DISTINCT FROM receipt_row."companyId" OR lot_product IS DISTINCT FROM NEW."productId" OR lot_variant IS DISTINCT FROM NEW."variantId" THEN
      RAISE EXCEPTION 'Purchase receipt lot is outside line scope';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PurchaseReceiptLine_scope_guard" BEFORE INSERT OR UPDATE ON "PurchaseReceiptLine" FOR EACH ROW EXECUTE FUNCTION enforce_purchase_receipt_line_scope();

CREATE OR REPLACE FUNCTION enforce_purchase_receipt_unit_scope()
RETURNS trigger AS $$
DECLARE
  line_product UUID;
  line_variant UUID;
  receipt_company UUID;
  stock_company UUID;
  stock_product UUID;
  stock_variant UUID;
BEGIN
  SELECT l."productId", l."variantId", r."companyId" INTO line_product, line_variant, receipt_company
    FROM "PurchaseReceiptLine" l JOIN "PurchaseReceipt" r ON r."id" = l."receiptId"
    WHERE l."id" = NEW."receiptLineId";
  IF NEW."stockUnitId" IS NOT NULL THEN
    SELECT "companyId", "productId", "variantId" INTO stock_company, stock_product, stock_variant FROM "PhysicalStockUnit" WHERE "id" = NEW."stockUnitId";
    IF stock_company IS DISTINCT FROM receipt_company OR stock_product IS DISTINCT FROM line_product OR stock_variant IS DISTINCT FROM line_variant THEN
      RAISE EXCEPTION 'Received stock unit is outside receipt line scope';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PurchaseReceiptUnit_scope_guard" BEFORE INSERT OR UPDATE ON "PurchaseReceiptUnit" FOR EACH ROW EXECUTE FUNCTION enforce_purchase_receipt_unit_scope();

CREATE OR REPLACE FUNCTION enforce_sales_invoice_scope()
RETURNS trigger AS $$
DECLARE
  branch_company UUID;
  warehouse_company UUID;
  warehouse_branch UUID;
  customer_company UUID;
  journal_company UUID;
  journal_branch UUID;
  journal_date DATE;
  reversal_company UUID;
  reversal_customer UUID;
BEGIN
  SELECT "companyId" INTO branch_company FROM "Branch" WHERE "id" = NEW."branchId";
  SELECT "companyId", "branchId" INTO warehouse_company, warehouse_branch FROM "Warehouse" WHERE "id" = NEW."warehouseId";
  SELECT "companyId" INTO customer_company FROM "Customer" WHERE "id" = NEW."customerId";
  IF branch_company IS DISTINCT FROM NEW."companyId" OR warehouse_company IS DISTINCT FROM NEW."companyId"
     OR warehouse_branch IS DISTINCT FROM NEW."branchId" OR customer_company IS DISTINCT FROM NEW."companyId" THEN
    RAISE EXCEPTION 'Sales invoice dimensions must share one tenant and branch';
  END IF;
  IF NEW."journalEntryId" IS NOT NULL THEN
    SELECT "companyId", "branchId", "postingDate" INTO journal_company, journal_branch, journal_date
      FROM "JournalEntry" WHERE "id" = NEW."journalEntryId";
    IF journal_company IS DISTINCT FROM NEW."companyId" OR journal_branch IS DISTINCT FROM NEW."branchId"
       OR journal_date IS DISTINCT FROM NEW."invoiceDate" THEN
      RAISE EXCEPTION 'Sales invoice journal scope or date is invalid';
    END IF;
  END IF;
  IF NEW."reversalOfId" IS NOT NULL THEN
    SELECT "companyId", "customerId" INTO reversal_company, reversal_customer FROM "SalesInvoice" WHERE "id" = NEW."reversalOfId";
    IF reversal_company IS DISTINCT FROM NEW."companyId" OR reversal_customer IS DISTINCT FROM NEW."customerId" THEN
      RAISE EXCEPTION 'Sales invoice reversal scope is invalid';
    END IF;
  END IF;
  IF NOT user_is_active_company_member(NEW."preparedById", NEW."companyId")
     OR (NEW."salespersonId" IS NOT NULL AND NOT user_is_active_company_member(NEW."salespersonId", NEW."companyId"))
     OR (NEW."approvedById" IS NOT NULL AND NOT user_is_active_company_member(NEW."approvedById", NEW."companyId"))
     OR (NEW."postedById" IS NOT NULL AND NOT user_is_active_company_member(NEW."postedById", NEW."companyId"))
     OR (NEW."reversedById" IS NOT NULL AND NOT user_is_active_company_member(NEW."reversedById", NEW."companyId")) THEN
    RAISE EXCEPTION 'Sales invoice actors require active company membership';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "SalesInvoice_scope_guard" BEFORE INSERT OR UPDATE ON "SalesInvoice" FOR EACH ROW EXECUTE FUNCTION enforce_sales_invoice_scope();

CREATE OR REPLACE FUNCTION enforce_sales_invoice_line_scope()
RETURNS trigger AS $$
DECLARE
  invoice_company UUID;
  product_company UUID;
  variant_company UUID;
  variant_product UUID;
BEGIN
  SELECT "companyId" INTO invoice_company FROM "SalesInvoice" WHERE "id" = NEW."invoiceId";
  SELECT "companyId" INTO product_company FROM "Product" WHERE "id" = NEW."productId";
  SELECT "companyId", "productId" INTO variant_company, variant_product FROM "ProductVariant" WHERE "id" = NEW."variantId";
  IF product_company IS DISTINCT FROM invoice_company OR variant_company IS DISTINCT FROM invoice_company
     OR variant_product IS DISTINCT FROM NEW."productId" THEN
    RAISE EXCEPTION 'Sales invoice line product and variant are outside invoice scope';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "SalesInvoiceLine_scope_guard" BEFORE INSERT OR UPDATE ON "SalesInvoiceLine" FOR EACH ROW EXECUTE FUNCTION enforce_sales_invoice_line_scope();

CREATE OR REPLACE FUNCTION enforce_sales_invoice_unit_scope()
RETURNS trigger AS $$
DECLARE
  line_product UUID;
  line_variant UUID;
  invoice_company UUID;
  invoice_warehouse UUID;
  stock_company UUID;
  stock_product UUID;
  stock_variant UUID;
  stock_warehouse UUID;
BEGIN
  SELECT l."productId", l."variantId", i."companyId", i."warehouseId"
    INTO line_product, line_variant, invoice_company, invoice_warehouse
    FROM "SalesInvoiceLine" l JOIN "SalesInvoice" i ON i."id" = l."invoiceId"
    WHERE l."id" = NEW."invoiceLineId";
  SELECT "companyId", "productId", "variantId", "currentWarehouseId"
    INTO stock_company, stock_product, stock_variant, stock_warehouse
    FROM "PhysicalStockUnit" WHERE "id" = NEW."stockUnitId";
  IF stock_company IS DISTINCT FROM invoice_company OR stock_product IS DISTINCT FROM line_product
     OR stock_variant IS DISTINCT FROM line_variant OR stock_warehouse IS DISTINCT FROM invoice_warehouse THEN
    RAISE EXCEPTION 'Sold stock unit is outside invoice line scope';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "SalesInvoiceUnit_scope_guard" BEFORE INSERT OR UPDATE ON "SalesInvoiceUnit" FOR EACH ROW EXECUTE FUNCTION enforce_sales_invoice_unit_scope();

CREATE OR REPLACE FUNCTION enforce_payment_scope()
RETURNS trigger AS $$
DECLARE
  branch_company UUID;
  party_company UUID;
  bank_company UUID;
  bank_branch UUID;
  cash_company UUID;
  cash_branch UUID;
  journal_company UUID;
  journal_branch UUID;
  journal_date DATE;
  reversal_company UUID;
BEGIN
  SELECT "companyId" INTO branch_company FROM "Branch" WHERE "id" = NEW."branchId";
  IF branch_company IS DISTINCT FROM NEW."companyId" THEN RAISE EXCEPTION 'Payment branch belongs to another tenant'; END IF;
  IF NEW."customerId" IS NOT NULL THEN
    SELECT "companyId" INTO party_company FROM "Customer" WHERE "id" = NEW."customerId";
  ELSE
    SELECT "companyId" INTO party_company FROM "Supplier" WHERE "id" = NEW."supplierId";
  END IF;
  IF party_company IS DISTINCT FROM NEW."companyId" THEN RAISE EXCEPTION 'Payment party belongs to another tenant'; END IF;
  IF NEW."bankAccountId" IS NOT NULL THEN
    SELECT "companyId", "branchId" INTO bank_company, bank_branch FROM "BankAccount" WHERE "id" = NEW."bankAccountId";
    IF bank_company IS DISTINCT FROM NEW."companyId" OR bank_branch IS DISTINCT FROM NEW."branchId" THEN RAISE EXCEPTION 'Payment bank account scope is invalid'; END IF;
  END IF;
  IF NEW."cashAccountId" IS NOT NULL THEN
    SELECT "companyId", "branchId" INTO cash_company, cash_branch FROM "Account" WHERE "id" = NEW."cashAccountId";
    IF cash_company IS DISTINCT FROM NEW."companyId" OR (cash_branch IS NOT NULL AND cash_branch IS DISTINCT FROM NEW."branchId") THEN RAISE EXCEPTION 'Payment cash account scope is invalid'; END IF;
  END IF;
  IF NEW."journalEntryId" IS NOT NULL THEN
    SELECT "companyId", "branchId", "postingDate" INTO journal_company, journal_branch, journal_date
      FROM "JournalEntry" WHERE "id" = NEW."journalEntryId";
    IF journal_company IS DISTINCT FROM NEW."companyId" OR journal_branch IS DISTINCT FROM NEW."branchId"
       OR journal_date IS DISTINCT FROM NEW."paymentDate" THEN RAISE EXCEPTION 'Payment journal scope or date is invalid'; END IF;
  END IF;
  IF NEW."reversalOfId" IS NOT NULL THEN
    SELECT "companyId" INTO reversal_company FROM "Payment" WHERE "id" = NEW."reversalOfId";
    IF reversal_company IS DISTINCT FROM NEW."companyId" THEN RAISE EXCEPTION 'Payment reversal belongs to another tenant'; END IF;
  END IF;
  IF NOT user_is_active_company_member(NEW."preparedById", NEW."companyId")
     OR (NEW."approvedById" IS NOT NULL AND NOT user_is_active_company_member(NEW."approvedById", NEW."companyId"))
     OR (NEW."postedById" IS NOT NULL AND NOT user_is_active_company_member(NEW."postedById", NEW."companyId"))
     OR (NEW."reversedById" IS NOT NULL AND NOT user_is_active_company_member(NEW."reversedById", NEW."companyId")) THEN
    RAISE EXCEPTION 'Payment actors require active company membership';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Payment_scope_guard" BEFORE INSERT OR UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION enforce_payment_scope();

CREATE OR REPLACE FUNCTION enforce_payment_allocation_scope()
RETURNS trigger AS $$
DECLARE
  payment_row "Payment"%ROWTYPE;
  target_company UUID;
  target_party UUID;
BEGIN
  SELECT * INTO payment_row FROM "Payment" WHERE "id" = NEW."paymentId";
  IF NEW."salesInvoiceId" IS NOT NULL THEN
    SELECT "companyId", "customerId" INTO target_company, target_party FROM "SalesInvoice" WHERE "id" = NEW."salesInvoiceId";
    IF payment_row."direction" NOT IN ('CUSTOMER_RECEIPT', 'CUSTOMER_REFUND')
       OR target_company IS DISTINCT FROM payment_row."companyId" OR target_party IS DISTINCT FROM payment_row."customerId" THEN
      RAISE EXCEPTION 'Payment allocation sales invoice is outside payment scope';
    END IF;
  ELSE
    SELECT "companyId", "supplierId" INTO target_company, target_party FROM "PurchaseReceipt" WHERE "id" = NEW."purchaseReceiptId";
    IF payment_row."direction" NOT IN ('SUPPLIER_PAYMENT', 'SUPPLIER_REFUND')
       OR target_company IS DISTINCT FROM payment_row."companyId" OR target_party IS DISTINCT FROM payment_row."supplierId" THEN
      RAISE EXCEPTION 'Payment allocation purchase receipt is outside payment scope';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PaymentAllocation_scope_guard" BEFORE INSERT OR UPDATE ON "PaymentAllocation" FOR EACH ROW EXECUTE FUNCTION enforce_payment_allocation_scope();

-- Server code performs permission checks; the database independently restricts
-- state transitions so direct SQL cannot skip approval or posting stages.
CREATE OR REPLACE FUNCTION enforce_operational_status_transition()
RETURNS trigger AS $$
BEGIN
  IF NEW."status" = OLD."status" THEN RETURN NEW; END IF;
  IF OLD."status" = 'DRAFT' AND NEW."status" IN ('SUBMITTED', 'CANCELLED') THEN RETURN NEW; END IF;
  IF OLD."status" = 'SUBMITTED' AND NEW."status" IN ('DRAFT', 'APPROVED', 'CANCELLED') THEN RETURN NEW; END IF;
  IF OLD."status" = 'APPROVED' AND NEW."status" IN ('POSTED', 'CANCELLED') THEN RETURN NEW; END IF;
  IF OLD."status" = 'POSTED' AND NEW."status" = 'REVERSED' THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Invalid operational document status transition from % to %', OLD."status", NEW."status";
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PurchaseOrder_status_guard" BEFORE UPDATE ON "PurchaseOrder" FOR EACH ROW EXECUTE FUNCTION enforce_operational_status_transition();
CREATE TRIGGER "PurchaseReceipt_status_guard" BEFORE UPDATE ON "PurchaseReceipt" FOR EACH ROW EXECUTE FUNCTION enforce_operational_status_transition();
CREATE TRIGGER "SalesInvoice_status_guard" BEFORE UPDATE ON "SalesInvoice" FOR EACH ROW EXECUTE FUNCTION enforce_operational_status_transition();
CREATE TRIGGER "Payment_status_guard" BEFORE UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION enforce_operational_status_transition();


CREATE OR REPLACE FUNCTION enforce_inventory_lot_scope()
RETURNS trigger AS $$
DECLARE product_company UUID; variant_company UUID; variant_product UUID;
BEGIN
  SELECT "companyId" INTO product_company FROM "Product" WHERE "id" = NEW."productId";
  SELECT "companyId", "productId" INTO variant_company, variant_product FROM "ProductVariant" WHERE "id" = NEW."variantId";
  IF product_company IS DISTINCT FROM NEW."companyId" OR variant_company IS DISTINCT FROM NEW."companyId"
     OR variant_product IS DISTINCT FROM NEW."productId" THEN
    RAISE EXCEPTION 'Inventory lot product and variant are outside tenant scope';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "InventoryLot_scope_guard" BEFORE INSERT OR UPDATE ON "InventoryLot" FOR EACH ROW EXECUTE FUNCTION enforce_inventory_lot_scope();

-- Only the transaction-safe inventory service may mutate stock state. It sets
-- app.inventory_posting=on locally inside the same serializable transaction.
CREATE OR REPLACE FUNCTION require_inventory_posting_context()
RETURNS trigger AS $$
BEGIN
  IF current_setting('app.inventory_posting', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Stock state may only change through the inventory posting service';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PhysicalStockUnit_writer_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PhysicalStockUnit" FOR EACH ROW EXECUTE FUNCTION require_inventory_posting_context();
CREATE TRIGGER "DeviceIdentifier_writer_guard" BEFORE INSERT OR UPDATE OR DELETE ON "DeviceIdentifier" FOR EACH ROW EXECUTE FUNCTION require_inventory_posting_context();
CREATE TRIGGER "StockBalance_writer_guard" BEFORE INSERT OR UPDATE OR DELETE ON "StockBalance" FOR EACH ROW EXECUTE FUNCTION require_inventory_posting_context();
CREATE TRIGGER "InventoryMovement_writer_guard" BEFORE INSERT ON "InventoryMovement" FOR EACH ROW EXECUTE FUNCTION require_inventory_posting_context();

CREATE UNIQUE INDEX "StockBalance_dimensions_key"
  ON "StockBalance"(
    "companyId", "branchId", "warehouseId", "productId", "variantId",
    COALESCE("lotId", '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE OR REPLACE FUNCTION protect_identified_stock_master_data()
RETURNS trigger AS $$
DECLARE unit_id UUID;
BEGIN
  unit_id := CASE WHEN TG_TABLE_NAME = 'DeviceIdentifier' THEN COALESCE(NEW."stockUnitId", OLD."stockUnitId") ELSE COALESCE(NEW."id", OLD."id") END;
  IF EXISTS (SELECT 1 FROM "InventoryMovement" WHERE "stockUnitId" = unit_id) THEN
    IF TG_TABLE_NAME = 'DeviceIdentifier' THEN
      RAISE EXCEPTION 'Posted device identifiers are immutable';
    END IF;
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A stock unit with posted movements cannot be deleted'; END IF;
    IF NEW."companyId" IS DISTINCT FROM OLD."companyId" OR NEW."productId" IS DISTINCT FROM OLD."productId"
       OR NEW."variantId" IS DISTINCT FROM OLD."variantId" OR NEW."acquisitionDate" IS DISTINCT FROM OLD."acquisitionDate"
       OR NEW."acquisitionCost" IS DISTINCT FROM OLD."acquisitionCost" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
      RAISE EXCEPTION 'Posted stock-unit identity and acquisition data are immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "DeviceIdentifier_immutability_guard" BEFORE UPDATE OR DELETE ON "DeviceIdentifier" FOR EACH ROW EXECUTE FUNCTION protect_identified_stock_master_data();
CREATE TRIGGER "PhysicalStockUnit_immutability_guard" BEFORE UPDATE OR DELETE ON "PhysicalStockUnit" FOR EACH ROW EXECUTE FUNCTION protect_identified_stock_master_data();

-- At transaction commit, the materialized balance must exactly equal the
-- append-only movement ledger (reservation rows are tracked separately).
CREATE OR REPLACE FUNCTION verify_stock_balance_projection()
RETURNS trigger AS $$
DECLARE
  v_company UUID;
  v_branch UUID;
  v_warehouse UUID;
  v_product UUID;
  v_variant UUID;
  v_lot UUID;
  expected_quantity NUMERIC(19,4);
  expected_value NUMERIC(19,4);
  actual_quantity NUMERIC(19,4);
  actual_value NUMERIC(19,4);
BEGIN
  v_company := COALESCE(NEW."companyId", OLD."companyId");
  v_branch := COALESCE(NEW."branchId", OLD."branchId");
  v_warehouse := COALESCE(NEW."warehouseId", OLD."warehouseId");
  v_product := COALESCE(NEW."productId", OLD."productId");
  v_variant := COALESCE(NEW."variantId", OLD."variantId");
  v_lot := COALESCE(NEW."lotId", OLD."lotId");

  SELECT COALESCE(SUM("quantity"),0), COALESCE(SUM("totalCost"),0)
    INTO expected_quantity, expected_value
    FROM "InventoryMovement"
    WHERE "companyId" = v_company AND "branchId" = v_branch AND "warehouseId" = v_warehouse
      AND "productId" = v_product AND "variantId" = v_variant
      AND "lotId" IS NOT DISTINCT FROM v_lot
      AND "movementType" NOT IN ('RESERVATION', 'RELEASE');
  SELECT "quantity", "inventoryValue" INTO actual_quantity, actual_value
    FROM "StockBalance"
    WHERE "companyId" = v_company AND "branchId" = v_branch AND "warehouseId" = v_warehouse
      AND "productId" = v_product AND "variantId" = v_variant
      AND "lotId" IS NOT DISTINCT FROM v_lot;

  IF expected_quantity = 0 AND expected_value = 0 AND actual_quantity IS NULL THEN RETURN NULL; END IF;
  IF actual_quantity IS NULL OR actual_quantity <> expected_quantity OR actual_value <> expected_value THEN
    RAISE EXCEPTION 'StockBalance projection does not match the InventoryMovement ledger';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "InventoryMovement_balance_projection"
AFTER INSERT ON "InventoryMovement" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION verify_stock_balance_projection();
CREATE CONSTRAINT TRIGGER "StockBalance_ledger_projection"
AFTER INSERT OR UPDATE OR DELETE ON "StockBalance" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION verify_stock_balance_projection();

CREATE OR REPLACE FUNCTION verify_inventory_document_effects()
RETURNS trigger AS $$
DECLARE invalid_effect BOOLEAN;
BEGIN
  IF NEW."status" <> 'POSTED' OR OLD."status" = 'POSTED' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'PurchaseReceipt' THEN
    IF NEW."reversalOfId" IS NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM "PurchaseReceiptLine" l
        WHERE l."receiptId" = NEW."id" AND (
          COALESCE((SELECT SUM(m."quantity") FROM "InventoryMovement" m
                    WHERE m."sourceDocumentType" = 'PurchaseReceipt' AND m."sourceDocumentId" = NEW."id"
                      AND m."lineReference" = l."id"::text AND m."movementType" = 'PURCHASE_RECEIPT'),0) <> l."quantity"
          OR COALESCE((SELECT SUM(m."totalCost") FROM "InventoryMovement" m
                       WHERE m."sourceDocumentType" = 'PurchaseReceipt' AND m."sourceDocumentId" = NEW."id"
                         AND m."lineReference" = l."id"::text AND m."movementType" = 'PURCHASE_RECEIPT'),0) <> round(l."quantity" * l."unitCost",4)
        )
      ) INTO invalid_effect;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM "PurchaseReceiptLine" l
        WHERE l."receiptId" = NEW."id" AND (
          COALESCE((SELECT SUM(m."quantity") FROM "InventoryMovement" m
                    WHERE m."sourceDocumentType" = 'PurchaseReceipt' AND m."sourceDocumentId" = NEW."id"
                      AND m."lineReference" = l."id"::text AND m."movementType" = 'PURCHASE_RETURN'),0) <> -l."quantity"
          OR COALESCE((SELECT SUM(m."totalCost") FROM "InventoryMovement" m
                       WHERE m."sourceDocumentType" = 'PurchaseReceipt' AND m."sourceDocumentId" = NEW."id"
                         AND m."lineReference" = l."id"::text AND m."movementType" = 'PURCHASE_RETURN'),0) <> -round(l."quantity" * l."unitCost",4)
        )
      ) INTO invalid_effect;
    END IF;
    IF invalid_effect THEN RAISE EXCEPTION 'Purchase receipt inventory movements do not match its lines'; END IF;
    IF EXISTS (
      SELECT 1 FROM "PurchaseReceiptLine" l JOIN "Product" p ON p."id" = l."productId"
      WHERE l."receiptId" = NEW."id" AND p."trackingMethod" = 'SERIALIZED'
        AND (l."quantity" <> trunc(l."quantity")
          OR (SELECT COUNT(*) FROM "PurchaseReceiptUnit" u WHERE u."receiptLineId" = l."id" AND u."stockUnitId" IS NOT NULL) <> l."quantity")
    ) THEN RAISE EXCEPTION 'Serialized purchase quantities require one linked physical stock unit per item'; END IF;
  ELSE
    IF NEW."reversalOfId" IS NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM "SalesInvoiceLine" l
        WHERE l."invoiceId" = NEW."id" AND (
          COALESCE((SELECT SUM(m."quantity") FROM "InventoryMovement" m
                    WHERE m."sourceDocumentType" = 'SalesInvoice' AND m."sourceDocumentId" = NEW."id"
                      AND m."lineReference" = l."id"::text AND m."movementType" = 'SALE_ISSUE'),0) <> -l."quantity"
          OR COALESCE((SELECT SUM(m."totalCost") FROM "InventoryMovement" m
                       WHERE m."sourceDocumentType" = 'SalesInvoice' AND m."sourceDocumentId" = NEW."id"
                         AND m."lineReference" = l."id"::text AND m."movementType" = 'SALE_ISSUE'),0) <> -l."costTotal"
        )
      ) INTO invalid_effect;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM "SalesInvoiceLine" l
        WHERE l."invoiceId" = NEW."id" AND (
          COALESCE((SELECT SUM(m."quantity") FROM "InventoryMovement" m
                    WHERE m."sourceDocumentType" = 'SalesInvoice' AND m."sourceDocumentId" = NEW."id"
                      AND m."lineReference" = l."id"::text AND m."movementType" = 'SALES_RETURN'),0) <> l."quantity"
          OR COALESCE((SELECT SUM(m."totalCost") FROM "InventoryMovement" m
                       WHERE m."sourceDocumentType" = 'SalesInvoice' AND m."sourceDocumentId" = NEW."id"
                         AND m."lineReference" = l."id"::text AND m."movementType" = 'SALES_RETURN'),0) <> l."costTotal"
        )
      ) INTO invalid_effect;
    END IF;
    IF invalid_effect THEN RAISE EXCEPTION 'Sales invoice inventory movements do not match its lines'; END IF;
    IF EXISTS (
      SELECT 1 FROM "SalesInvoiceLine" l JOIN "Product" p ON p."id" = l."productId"
      WHERE l."invoiceId" = NEW."id" AND p."trackingMethod" = 'SERIALIZED'
        AND (l."quantity" <> trunc(l."quantity")
          OR (SELECT COUNT(*) FROM "SalesInvoiceUnit" u WHERE u."invoiceLineId" = l."id") <> l."quantity")
    ) THEN RAISE EXCEPTION 'Serialized sales quantities require one physical stock unit per item'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PurchaseReceipt_inventory_effect_guard" BEFORE UPDATE ON "PurchaseReceipt" FOR EACH ROW EXECUTE FUNCTION verify_inventory_document_effects();
CREATE TRIGGER "SalesInvoice_inventory_effect_guard" BEFORE UPDATE ON "SalesInvoice" FOR EACH ROW EXECUTE FUNCTION verify_inventory_document_effects();
