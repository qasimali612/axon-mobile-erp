-- Permit only the inventory posting transaction to link staged receipt units
-- and increment received quantities after approval; all commercial fields stay
-- immutable outside DRAFT.
CREATE OR REPLACE FUNCTION protect_operational_child()
RETURNS trigger AS $$
DECLARE parent_status "OperationalDocumentStatus";
BEGIN
  IF TG_TABLE_NAME = 'PurchaseOrderLine' THEN
    SELECT "status" INTO parent_status FROM "PurchaseOrder" WHERE "id" = COALESCE(NEW."orderId", OLD."orderId");
    IF TG_OP = 'UPDATE' AND parent_status IN ('APPROVED', 'POSTED')
       AND current_setting('app.inventory_posting', true) = 'on'
       AND NEW."id" IS NOT DISTINCT FROM OLD."id"
       AND NEW."orderId" IS NOT DISTINCT FROM OLD."orderId"
       AND NEW."productId" IS NOT DISTINCT FROM OLD."productId"
       AND NEW."variantId" IS NOT DISTINCT FROM OLD."variantId"
       AND NEW."lineNumber" IS NOT DISTINCT FROM OLD."lineNumber"
       AND NEW."description" IS NOT DISTINCT FROM OLD."description"
       AND NEW."orderedQuantity" IS NOT DISTINCT FROM OLD."orderedQuantity"
       AND NEW."unitCost" IS NOT DISTINCT FROM OLD."unitCost"
       AND NEW."discountAmount" IS NOT DISTINCT FROM OLD."discountAmount"
       AND NEW."taxAmount" IS NOT DISTINCT FROM OLD."taxAmount"
       AND NEW."lineTotal" IS NOT DISTINCT FROM OLD."lineTotal"
       AND NEW."receivedQuantity" >= OLD."receivedQuantity" THEN
      RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'PurchaseReceiptLine' THEN
    SELECT "status" INTO parent_status FROM "PurchaseReceipt" WHERE "id" = COALESCE(NEW."receiptId", OLD."receiptId");
  ELSIF TG_TABLE_NAME = 'PurchaseReceiptUnit' THEN
    SELECT r."status" INTO parent_status FROM "PurchaseReceipt" r JOIN "PurchaseReceiptLine" l ON l."receiptId" = r."id"
      WHERE l."id" = COALESCE(NEW."receiptLineId", OLD."receiptLineId");
    IF TG_OP = 'UPDATE' AND parent_status = 'APPROVED'
       AND current_setting('app.inventory_posting', true) = 'on'
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
