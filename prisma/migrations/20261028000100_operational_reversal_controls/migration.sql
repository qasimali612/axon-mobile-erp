-- Authorized operational reversals are represented by separate, linked,
-- negative documents. Posted source documents and stock movements remain
-- immutable; the reversal appends equal-and-opposite journal and stock rows.

ALTER TABLE "PurchaseReceipt" DROP CONSTRAINT "PurchaseReceipt_nonnegative_totals";
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_signed_totals" CHECK (
  (
    (
      "reversalOfId" IS NULL
      AND "subtotal" >= 0 AND "discountTotal" >= 0 AND "documentDiscount" >= 0
      AND "taxTotal" >= 0 AND "freightTotal" >= 0 AND "otherCharges" >= 0 AND "grandTotal" >= 0
    )
    OR
    (
      "reversalOfId" IS NOT NULL
      AND "subtotal" <= 0 AND "discountTotal" <= 0 AND "documentDiscount" <= 0
      AND "taxTotal" <= 0 AND "freightTotal" <= 0 AND "otherCharges" <= 0 AND "grandTotal" <= 0
    )
  )
  AND "grandTotal" = round("subtotal" - "discountTotal" - "documentDiscount" + "taxTotal" + "freightTotal" + "otherCharges", 4)
);

ALTER TABLE "PurchaseReceiptLine" DROP CONSTRAINT "PurchaseReceiptLine_valid_values";
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_signed_values" CHECK (
  (
    (
      "quantity" > 0 AND "acceptedQuantity" >= 0 AND "rejectedQuantity" >= 0
      AND "acceptedQuantity" + "rejectedQuantity" = "quantity"
      AND "discountAmount" >= 0 AND "taxAmount" >= 0
      AND "allocatedDocumentDiscount" >= 0 AND "allocatedFreight" >= 0 AND "allocatedOtherCharges" >= 0
      AND "lineTotal" >= 0
      AND "discountAmount" <= round("acceptedQuantity" * "unitCost", 4)
    )
    OR
    (
      "quantity" < 0 AND "acceptedQuantity" < 0 AND "rejectedQuantity" = 0
      AND "acceptedQuantity" = "quantity"
      AND "discountAmount" <= 0 AND "taxAmount" <= 0
      AND "allocatedDocumentDiscount" <= 0 AND "allocatedFreight" <= 0 AND "allocatedOtherCharges" <= 0
      AND "lineTotal" <= 0
      AND "discountAmount" >= round("acceptedQuantity" * "unitCost", 4)
    )
  )
  AND "unitCost" >= 0 AND "taxRate" BETWEEN 0 AND 100 AND "landedUnitCost" >= 0
  AND "lineTotal" = round(("acceptedQuantity" * "unitCost") - "discountAmount" + "taxAmount", 4)
);

ALTER TABLE "SalesInvoice" DROP CONSTRAINT "SalesInvoice_nonnegative_totals";
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_signed_totals" CHECK (
  (
    (
      "reversalOfId" IS NULL
      AND "subtotal" >= 0 AND "discountTotal" >= 0 AND "taxTotal" >= 0
      AND "grandTotal" >= 0 AND "costTotal" >= 0
    )
    OR
    (
      "reversalOfId" IS NOT NULL
      AND "subtotal" <= 0 AND "discountTotal" <= 0 AND "taxTotal" <= 0
      AND "grandTotal" <= 0 AND "costTotal" <= 0
    )
  )
  AND "grandTotal" = round("subtotal" - "discountTotal" + "taxTotal", 4)
);

ALTER TABLE "SalesInvoiceLine" DROP CONSTRAINT "SalesInvoiceLine_valid_values";
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_signed_values" CHECK (
  (
    (
      "quantity" > 0 AND "discountAmount" >= 0 AND "taxAmount" >= 0
      AND "lineTotal" >= 0 AND "costTotal" >= 0
      AND "discountAmount" <= round("quantity" * "unitPrice", 4)
    )
    OR
    (
      "quantity" < 0 AND "discountAmount" <= 0 AND "taxAmount" <= 0
      AND "lineTotal" <= 0 AND "costTotal" <= 0
      AND "discountAmount" >= round("quantity" * "unitPrice", 4)
    )
  )
  AND "unitPrice" >= 0 AND "taxRate" BETWEEN 0 AND 100
  AND "lineTotal" = round(("quantity" * "unitPrice") - "discountAmount" + "taxAmount", 4)
);

-- A line's sign is authorized only by the parent document's reversal link.
CREATE OR REPLACE FUNCTION enforce_purchase_receipt_line_scope()
RETURNS trigger AS $$
DECLARE
  receipt_row "PurchaseReceipt"%ROWTYPE;
  product_company UUID; variant_company UUID; variant_product UUID;
  order_line_order UUID; lot_company UUID; lot_product UUID; lot_variant UUID; tax_company UUID;
BEGIN
  SELECT * INTO receipt_row FROM "PurchaseReceipt" WHERE "id" = NEW."receiptId";
  SELECT "companyId" INTO product_company FROM "Product" WHERE "id" = NEW."productId";
  SELECT "companyId", "productId" INTO variant_company, variant_product FROM "ProductVariant" WHERE "id" = NEW."variantId";
  IF NEW."taxRuleId" IS NOT NULL THEN SELECT "companyId" INTO tax_company FROM "TaxRule" WHERE "id" = NEW."taxRuleId"; END IF;
  IF product_company IS DISTINCT FROM receipt_row."companyId" OR variant_company IS DISTINCT FROM receipt_row."companyId"
     OR variant_product IS DISTINCT FROM NEW."productId" OR (NEW."taxRuleId" IS NOT NULL AND tax_company IS DISTINCT FROM receipt_row."companyId") THEN
    RAISE EXCEPTION 'Purchase receipt line product, variant, or tax rule is outside receipt scope';
  END IF;
  IF (receipt_row."reversalOfId" IS NULL AND NEW."quantity" <= 0)
     OR (receipt_row."reversalOfId" IS NOT NULL AND NEW."quantity" >= 0) THEN
    RAISE EXCEPTION 'Purchase receipt line sign does not match its parent document';
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

CREATE OR REPLACE FUNCTION enforce_sales_invoice_line_scope()
RETURNS trigger AS $$
DECLARE parent_company UUID; parent_reversal UUID; product_company UUID; variant_company UUID; variant_product UUID; tax_company UUID;
BEGIN
  SELECT "companyId", "reversalOfId" INTO parent_company, parent_reversal FROM "SalesInvoice" WHERE "id" = NEW."invoiceId";
  SELECT "companyId" INTO product_company FROM "Product" WHERE "id" = NEW."productId";
  SELECT "companyId", "productId" INTO variant_company, variant_product FROM "ProductVariant" WHERE "id" = NEW."variantId";
  IF NEW."taxRuleId" IS NOT NULL THEN SELECT "companyId" INTO tax_company FROM "TaxRule" WHERE "id" = NEW."taxRuleId"; END IF;
  IF product_company IS DISTINCT FROM parent_company OR variant_company IS DISTINCT FROM parent_company
     OR variant_product IS DISTINCT FROM NEW."productId" OR (NEW."taxRuleId" IS NOT NULL AND tax_company IS DISTINCT FROM parent_company) THEN
    RAISE EXCEPTION 'Sales line product, variant, or tax rule is outside invoice scope';
  END IF;
  IF (parent_reversal IS NULL AND NEW."quantity" <= 0)
     OR (parent_reversal IS NOT NULL AND NEW."quantity" >= 0) THEN
    RAISE EXCEPTION 'Sales invoice line sign does not match its parent document';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- One source journal or inventory movement can only be reversed once.
CREATE UNIQUE INDEX "JournalEntry_one_reversal_per_source"
  ON "JournalEntry"("reversalOfId") WHERE "reversalOfId" IS NOT NULL;
CREATE UNIQUE INDEX "InventoryMovement_one_reversal_per_source"
  ON "InventoryMovement"("reversalOfId") WHERE "reversalOfId" IS NOT NULL;

-- Reversing a receipt can legitimately reduce purchase-order fulfillment.
CREATE OR REPLACE FUNCTION enforce_operational_status_transition()
RETURNS trigger AS $$
BEGIN
  IF NEW."status" = OLD."status" THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'PurchaseOrder' THEN
    IF OLD."status" = 'DRAFT' AND NEW."status" IN ('SUBMITTED', 'CANCELLED') THEN RETURN NEW; END IF;
    IF OLD."status" = 'SUBMITTED' AND NEW."status" IN ('DRAFT', 'APPROVED', 'REJECTED', 'CANCELLED') THEN RETURN NEW; END IF;
    IF OLD."status" = 'REJECTED' AND NEW."status" = 'DRAFT' THEN RETURN NEW; END IF;
    IF OLD."status" = 'APPROVED' AND NEW."status" IN ('PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED', 'CANCELLED') THEN RETURN NEW; END IF;
    IF OLD."status" = 'PARTIALLY_RECEIVED' AND NEW."status" IN ('APPROVED', 'FULLY_RECEIVED', 'CLOSED') THEN RETURN NEW; END IF;
    IF OLD."status" = 'FULLY_RECEIVED' AND NEW."status" IN ('APPROVED', 'PARTIALLY_RECEIVED', 'CLOSED') THEN RETURN NEW; END IF;
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

-- At posting, the linked reversal must exactly negate its source document and
-- its journal must reverse the source journal.
CREATE OR REPLACE FUNCTION verify_linked_operational_reversal()
RETURNS trigger AS $$
DECLARE
  source_status "OperationalDocumentStatus";
  source_company UUID; source_branch UUID; source_warehouse UUID; source_party UUID;
  source_related UUID; source_currency CHAR(3); source_journal UUID; source_reversal UUID;
  source_subtotal NUMERIC(19,4); source_discount NUMERIC(19,4); source_document_discount NUMERIC(19,4);
  source_tax NUMERIC(19,4); source_freight NUMERIC(19,4); source_other NUMERIC(19,4); source_total NUMERIC(19,4); source_cost NUMERIC(19,4);
  journal_reversal UUID;
  mismatch_exists BOOLEAN;
BEGIN
  IF NEW."status" <> 'POSTED' OR OLD."status" = 'POSTED' OR NEW."reversalOfId" IS NULL THEN RETURN NEW; END IF;
  SELECT "reversalOfId" INTO source_reversal FROM
    (SELECT "reversalOfId" FROM "PurchaseReceipt" WHERE TG_TABLE_NAME = 'PurchaseReceipt' AND "id" = NEW."reversalOfId"
     UNION ALL
     SELECT "reversalOfId" FROM "SalesInvoice" WHERE TG_TABLE_NAME = 'SalesInvoice' AND "id" = NEW."reversalOfId") source_link;
  IF source_reversal IS NOT NULL THEN RAISE EXCEPTION 'A reversal document cannot reverse another reversal document'; END IF;

  SELECT "reversalOfId" INTO journal_reversal FROM "JournalEntry" WHERE "id" = NEW."journalEntryId";

  IF TG_TABLE_NAME = 'PurchaseReceipt' THEN
    SELECT "status", "companyId", "branchId", "warehouseId", "supplierId", "purchaseOrderId", "currencyCode", "journalEntryId",
           "subtotal", "discountTotal", "documentDiscount", "taxTotal", "freightTotal", "otherCharges", "grandTotal"
      INTO source_status, source_company, source_branch, source_warehouse, source_party, source_related, source_currency, source_journal,
           source_subtotal, source_discount, source_document_discount, source_tax, source_freight, source_other, source_total
      FROM "PurchaseReceipt" WHERE "id" = NEW."reversalOfId";
    IF source_status <> 'POSTED' OR source_company IS DISTINCT FROM NEW."companyId" OR source_branch IS DISTINCT FROM NEW."branchId"
       OR source_warehouse IS DISTINCT FROM NEW."warehouseId" OR source_party IS DISTINCT FROM NEW."supplierId"
       OR source_related IS DISTINCT FROM NEW."purchaseOrderId" OR source_currency IS DISTINCT FROM NEW."currencyCode"
       OR journal_reversal IS DISTINCT FROM source_journal
       OR NEW."subtotal" <> -source_subtotal OR NEW."discountTotal" <> -source_discount
       OR NEW."documentDiscount" <> -source_document_discount OR NEW."taxTotal" <> -source_tax
       OR NEW."freightTotal" <> -source_freight OR NEW."otherCharges" <> -source_other OR NEW."grandTotal" <> -source_total THEN
      RAISE EXCEPTION 'Purchase receipt reversal does not exactly negate its posted source';
    END IF;
    SELECT EXISTS (
      SELECT 1
      FROM "PurchaseReceiptLine" original
      FULL JOIN "PurchaseReceiptLine" reversal
        ON reversal."receiptId" = NEW."id" AND reversal."lineNumber" = original."lineNumber"
      WHERE original."receiptId" = NEW."reversalOfId" AND original."acceptedQuantity" > 0
        AND (reversal."id" IS NULL OR reversal."productId" IS DISTINCT FROM original."productId"
          OR reversal."variantId" IS DISTINCT FROM original."variantId" OR reversal."orderLineId" IS DISTINCT FROM original."orderLineId"
          OR reversal."lotId" IS DISTINCT FROM original."lotId" OR reversal."quantity" <> -original."acceptedQuantity"
          OR reversal."acceptedQuantity" <> -original."acceptedQuantity" OR reversal."rejectedQuantity" <> 0
          OR reversal."unitCost" <> original."unitCost" OR reversal."discountAmount" <> -original."discountAmount"
          OR reversal."taxRate" <> original."taxRate" OR reversal."taxAmount" <> -original."taxAmount"
          OR reversal."allocatedDocumentDiscount" <> -original."allocatedDocumentDiscount"
          OR reversal."allocatedFreight" <> -original."allocatedFreight" OR reversal."allocatedOtherCharges" <> -original."allocatedOtherCharges"
          OR reversal."landedUnitCost" <> original."landedUnitCost" OR reversal."lineTotal" <> -original."lineTotal")
    ) OR EXISTS (
      SELECT 1 FROM "PurchaseReceiptLine" reversal
      WHERE reversal."receiptId" = NEW."id" AND NOT EXISTS (
        SELECT 1 FROM "PurchaseReceiptLine" original
        WHERE original."receiptId" = NEW."reversalOfId" AND original."lineNumber" = reversal."lineNumber" AND original."acceptedQuantity" > 0
      )
    ) INTO mismatch_exists;
  ELSE
    SELECT "status", "companyId", "branchId", "warehouseId", "customerId", "salespersonId", "currencyCode", "journalEntryId",
           "subtotal", "discountTotal", "taxTotal", "grandTotal", "costTotal"
      INTO source_status, source_company, source_branch, source_warehouse, source_party, source_related, source_currency, source_journal,
           source_subtotal, source_discount, source_tax, source_total, source_cost
      FROM "SalesInvoice" WHERE "id" = NEW."reversalOfId";
    IF source_status <> 'POSTED' OR source_company IS DISTINCT FROM NEW."companyId" OR source_branch IS DISTINCT FROM NEW."branchId"
       OR source_warehouse IS DISTINCT FROM NEW."warehouseId" OR source_party IS DISTINCT FROM NEW."customerId"
       OR source_related IS DISTINCT FROM NEW."salespersonId" OR source_currency IS DISTINCT FROM NEW."currencyCode"
       OR journal_reversal IS DISTINCT FROM source_journal
       OR NEW."subtotal" <> -source_subtotal OR NEW."discountTotal" <> -source_discount
       OR NEW."taxTotal" <> -source_tax OR NEW."grandTotal" <> -source_total OR NEW."costTotal" <> -source_cost THEN
      RAISE EXCEPTION 'Sales invoice reversal does not exactly negate its posted source';
    END IF;
    SELECT EXISTS (
      SELECT 1
      FROM "SalesInvoiceLine" original
      FULL JOIN "SalesInvoiceLine" reversal
        ON reversal."invoiceId" = NEW."id" AND reversal."lineNumber" = original."lineNumber"
      WHERE original."invoiceId" = NEW."reversalOfId"
        AND (reversal."id" IS NULL OR reversal."productId" IS DISTINCT FROM original."productId"
          OR reversal."variantId" IS DISTINCT FROM original."variantId" OR reversal."quantity" <> -original."quantity"
          OR reversal."unitPrice" <> original."unitPrice" OR reversal."discountAmount" <> -original."discountAmount"
          OR reversal."taxRate" <> original."taxRate" OR reversal."taxAmount" <> -original."taxAmount"
          OR reversal."lineTotal" <> -original."lineTotal" OR reversal."costTotal" <> -original."costTotal")
    ) OR EXISTS (
      SELECT 1 FROM "SalesInvoiceLine" reversal
      WHERE reversal."invoiceId" = NEW."id" AND NOT EXISTS (
        SELECT 1 FROM "SalesInvoiceLine" original
        WHERE original."invoiceId" = NEW."reversalOfId" AND original."lineNumber" = reversal."lineNumber"
      )
    ) INTO mismatch_exists;
  END IF;
  IF mismatch_exists THEN RAISE EXCEPTION 'Operational reversal lines do not exactly negate their source lines'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PurchaseReceipt_reversal_integrity_guard"
BEFORE UPDATE ON "PurchaseReceipt" FOR EACH ROW EXECUTE FUNCTION verify_linked_operational_reversal();
CREATE TRIGGER "SalesInvoice_reversal_integrity_guard"
BEFORE UPDATE ON "SalesInvoice" FOR EACH ROW EXECUTE FUNCTION verify_linked_operational_reversal();
