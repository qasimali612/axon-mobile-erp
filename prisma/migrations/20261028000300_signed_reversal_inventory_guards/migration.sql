-- Reversal documents carry signed negative lines while their append-only stock
-- effects use the natural direction (purchase return negative, sales return
-- positive). Reconcile both quantity and exact inventory value for either sign.
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
                      AND m."lineReference" = l."id"::text AND m."movementType" = 'PURCHASE_RECEIPT'),0) <> l."acceptedQuantity"
          OR COALESCE((SELECT SUM(m."totalCost") FROM "InventoryMovement" m
                       WHERE m."sourceDocumentType" = 'PurchaseReceipt' AND m."sourceDocumentId" = NEW."id"
                         AND m."lineReference" = l."id"::text AND m."movementType" = 'PURCHASE_RECEIPT'),0) <>
             round(l."acceptedQuantity" * l."unitCost" - l."discountAmount" - l."allocatedDocumentDiscount" + l."allocatedFreight" + l."allocatedOtherCharges",4)
        )
      ) INTO invalid_effect;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM "PurchaseReceiptLine" l
        WHERE l."receiptId" = NEW."id" AND (
          COALESCE((SELECT SUM(m."quantity") FROM "InventoryMovement" m
                    WHERE m."sourceDocumentType" = 'PurchaseReceipt' AND m."sourceDocumentId" = NEW."id"
                      AND m."lineReference" = l."id"::text AND m."movementType" = 'PURCHASE_RETURN'),0) <> l."acceptedQuantity"
          OR COALESCE((SELECT SUM(m."totalCost") FROM "InventoryMovement" m
                       WHERE m."sourceDocumentType" = 'PurchaseReceipt' AND m."sourceDocumentId" = NEW."id"
                         AND m."lineReference" = l."id"::text AND m."movementType" = 'PURCHASE_RETURN'),0) <>
             round(l."acceptedQuantity" * l."unitCost" - l."discountAmount" - l."allocatedDocumentDiscount" + l."allocatedFreight" + l."allocatedOtherCharges",4)
        )
      ) INTO invalid_effect;
    END IF;
    IF invalid_effect THEN RAISE EXCEPTION 'Purchase receipt inventory movements do not match its accepted lines and landed costs'; END IF;
    IF EXISTS (
      SELECT 1 FROM "PurchaseReceiptLine" l JOIN "Product" p ON p."id" = l."productId"
      WHERE l."receiptId" = NEW."id" AND p."trackingMethod" IN ('IMEI','SERIAL')
        AND (abs(l."acceptedQuantity") <> trunc(abs(l."acceptedQuantity"))
          OR (SELECT COUNT(*) FROM "PurchaseReceiptUnit" u WHERE u."receiptLineId" = l."id" AND u."stockUnitId" IS NOT NULL) <> abs(l."acceptedQuantity"))
    ) THEN RAISE EXCEPTION 'Serialized purchase quantities require one linked physical stock unit per accepted item'; END IF;
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
                      AND m."lineReference" = l."id"::text AND m."movementType" = 'SALES_RETURN'),0) <> -l."quantity"
          OR COALESCE((SELECT SUM(m."totalCost") FROM "InventoryMovement" m
                       WHERE m."sourceDocumentType" = 'SalesInvoice' AND m."sourceDocumentId" = NEW."id"
                         AND m."lineReference" = l."id"::text AND m."movementType" = 'SALES_RETURN'),0) <> -l."costTotal"
        )
      ) INTO invalid_effect;
    END IF;
    IF invalid_effect THEN RAISE EXCEPTION 'Sales invoice inventory movements do not match its lines'; END IF;
    IF EXISTS (
      SELECT 1 FROM "SalesInvoiceLine" l JOIN "Product" p ON p."id" = l."productId"
      WHERE l."invoiceId" = NEW."id" AND p."trackingMethod" IN ('IMEI','SERIAL')
        AND (abs(l."quantity") <> trunc(abs(l."quantity"))
          OR (SELECT COUNT(*) FROM "SalesInvoiceUnit" u WHERE u."invoiceLineId" = l."id") <> abs(l."quantity"))
    ) THEN RAISE EXCEPTION 'Serialized sales quantities require one physical stock unit per item'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
