-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "idempotencyKey" VARCHAR(120) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_companyId_idempotencyKey_key" ON "PurchaseOrder"("companyId", "idempotencyKey");

