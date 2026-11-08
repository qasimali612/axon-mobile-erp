-- Migration 014 expanded procurement inspection protections but inadvertently
-- replaced the earlier, narrowly scoped sales cost-posting exception. Restore
-- that exception while retaining every procurement field-level protection.
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
    IF TG_OP = 'UPDATE' AND parent_status = 'APPROVED' AND current_setting('app.inventory_posting', true) = 'on'
       AND NEW."id" IS NOT DISTINCT FROM OLD."id" AND NEW."invoiceId" IS NOT DISTINCT FROM OLD."invoiceId"
       AND NEW."productId" IS NOT DISTINCT FROM OLD."productId" AND NEW."variantId" IS NOT DISTINCT FROM OLD."variantId"
       AND NEW."taxRuleId" IS NOT DISTINCT FROM OLD."taxRuleId" AND NEW."lineNumber" IS NOT DISTINCT FROM OLD."lineNumber"
       AND NEW."description" IS NOT DISTINCT FROM OLD."description" AND NEW."quantity" IS NOT DISTINCT FROM OLD."quantity"
       AND NEW."unitPrice" IS NOT DISTINCT FROM OLD."unitPrice" AND NEW."discountAmount" IS NOT DISTINCT FROM OLD."discountAmount"
       AND NEW."taxRate" IS NOT DISTINCT FROM OLD."taxRate" AND NEW."taxAmount" IS NOT DISTINCT FROM OLD."taxAmount"
       AND NEW."lineTotal" IS NOT DISTINCT FROM OLD."lineTotal" THEN RETURN NEW;
    END IF;
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
