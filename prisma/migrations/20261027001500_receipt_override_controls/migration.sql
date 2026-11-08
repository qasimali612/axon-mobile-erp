-- Persist approval-relevant receipt controls so an over-receipt or inspection
-- decision cannot disappear between draft preparation and atomic posting.
ALTER TABLE "PurchaseReceipt"
  ADD COLUMN "allowOverReceipt" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "overReceiptReason" VARCHAR(300),
  ADD COLUMN "requiresInspection" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PurchaseReceipt" DROP CONSTRAINT "PurchaseReceipt_type_reference";
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_type_reference" CHECK (
  (("receiptType" = 'PO_BASED' AND "purchaseOrderId" IS NOT NULL AND "directReceiptReason" IS NULL)
   OR ("receiptType" = 'DIRECT' AND "purchaseOrderId" IS NULL AND "directReceiptReason" IS NOT NULL AND length(trim("directReceiptReason")) > 0))
  AND ((NOT "allowOverReceipt" AND "overReceiptReason" IS NULL)
       OR ("allowOverReceipt" AND "overReceiptReason" IS NOT NULL AND length(trim("overReceiptReason")) >= 10))
);

CREATE OR REPLACE FUNCTION protect_purchase_receipt_non_draft()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' THEN
    IF NEW."companyId" IS DISTINCT FROM OLD."companyId" OR NEW."branchId" IS DISTINCT FROM OLD."branchId"
       OR NEW."warehouseId" IS DISTINCT FROM OLD."warehouseId" OR NEW."supplierId" IS DISTINCT FROM OLD."supplierId"
       OR NEW."purchaseOrderId" IS DISTINCT FROM OLD."purchaseOrderId" OR NEW."receiptNumber" IS DISTINCT FROM OLD."receiptNumber"
       OR NEW."receiptType" IS DISTINCT FROM OLD."receiptType" OR NEW."supplierInvoiceNumber" IS DISTINCT FROM OLD."supplierInvoiceNumber"
       OR NEW."supplierDeliveryNote" IS DISTINCT FROM OLD."supplierDeliveryNote" OR NEW."directReceiptReason" IS DISTINCT FROM OLD."directReceiptReason"
       OR NEW."allowOverReceipt" IS DISTINCT FROM OLD."allowOverReceipt" OR NEW."overReceiptReason" IS DISTINCT FROM OLD."overReceiptReason"
       OR NEW."requiresInspection" IS DISTINCT FROM OLD."requiresInspection" OR NEW."receiptDate" IS DISTINCT FROM OLD."receiptDate"
       OR NEW."invoiceDate" IS DISTINCT FROM OLD."invoiceDate" OR NEW."dueDate" IS DISTINCT FROM OLD."dueDate"
       OR NEW."currencyCode" IS DISTINCT FROM OLD."currencyCode" OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
       OR NEW."notes" IS DISTINCT FROM OLD."notes" OR NEW."preparedById" IS DISTINCT FROM OLD."preparedById"
       OR NEW."receivedById" IS DISTINCT FROM OLD."receivedById" THEN
      RAISE EXCEPTION 'Submitted purchase receipt commercial fields are immutable';
    END IF;
    IF current_setting('app.quality_inspection', true) IS DISTINCT FROM 'on'
       AND (NEW."subtotal" IS DISTINCT FROM OLD."subtotal" OR NEW."discountTotal" IS DISTINCT FROM OLD."discountTotal"
         OR NEW."documentDiscount" IS DISTINCT FROM OLD."documentDiscount" OR NEW."taxTotal" IS DISTINCT FROM OLD."taxTotal"
         OR NEW."freightTotal" IS DISTINCT FROM OLD."freightTotal" OR NEW."otherCharges" IS DISTINCT FROM OLD."otherCharges"
         OR NEW."grandTotal" IS DISTINCT FROM OLD."grandTotal") THEN
      RAISE EXCEPTION 'Submitted purchase receipt totals may change only through inspection';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PurchaseReceipt_commercial_immutability_guard" BEFORE UPDATE ON "PurchaseReceipt" FOR EACH ROW EXECUTE FUNCTION protect_purchase_receipt_non_draft();
