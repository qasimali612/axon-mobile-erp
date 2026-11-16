-- Allow direct posting from DRAFT or SUBMITTED without requiring prior approval
CREATE OR REPLACE FUNCTION verify_operational_document_posting()
RETURNS trigger AS $$
DECLARE line_count INTEGER; subtotal_sum NUMERIC(19,4); discount_sum NUMERIC(19,4); tax_sum NUMERIC(19,4); total_sum NUMERIC(19,4); allocation_sum NUMERIC(19,4);
  journal_status "JournalStatus"; journal_company UUID; journal_branch UUID; journal_source_id VARCHAR(80);
BEGIN
  IF NEW."status" <> 'POSTED' OR OLD."status" = 'POSTED' THEN RETURN NEW; END IF;
  IF OLD."status" NOT IN ('DRAFT', 'SUBMITTED', 'APPROVED') THEN
    RAISE EXCEPTION 'Only draft, submitted, or approved operational documents can be posted';
  END IF;
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

-- Replace enforce_operational_status_transition with comprehensive direct posting support
CREATE OR REPLACE FUNCTION enforce_operational_status_transition()
RETURNS trigger AS $$
BEGIN
  IF NEW."status" = OLD."status" THEN RETURN NEW; END IF;

  -- Posted documents can only transition to REVERSED
  IF OLD."status" = 'POSTED' THEN
    IF NEW."status" = 'REVERSED' THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Invalid operational document status transition from % to %', OLD."status", NEW."status";
  END IF;

  -- Reversed documents are permanently immutable
  IF OLD."status" = 'REVERSED' THEN
    RAISE EXCEPTION 'Reversed operational documents cannot transition to %', NEW."status";
  END IF;

  -- Operational documents (SalesInvoice, Payment, PurchaseReceipt, etc.)
  IF TG_TABLE_NAME = 'PurchaseOrder' THEN
    IF OLD."status" IN ('DRAFT', 'SUBMITTED', 'APPROVED') AND NEW."status" IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED', 'CANCELLED') THEN RETURN NEW; END IF;
    IF OLD."status" = 'PARTIALLY_RECEIVED' AND NEW."status" IN ('APPROVED', 'FULLY_RECEIVED', 'CLOSED') THEN RETURN NEW; END IF;
    IF OLD."status" = 'FULLY_RECEIVED' AND NEW."status" IN ('APPROVED', 'PARTIALLY_RECEIVED', 'CLOSED') THEN RETURN NEW; END IF;
    IF OLD."status" = 'REJECTED' AND NEW."status" = 'DRAFT' THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME = 'PurchaseReceipt' THEN
    IF OLD."status" IN ('DRAFT', 'SUBMITTED', 'INSPECTION', 'APPROVED') AND NEW."status" IN ('DRAFT', 'SUBMITTED', 'INSPECTION', 'APPROVED', 'POSTED', 'CANCELLED') THEN RETURN NEW; END IF;
    IF OLD."status" = 'REJECTED' AND NEW."status" = 'DRAFT' THEN RETURN NEW; END IF;
  ELSE
    -- Payment, SalesInvoice, etc.: Allow direct transitions between DRAFT, SUBMITTED, APPROVED, POSTED, and CANCELLED
    IF OLD."status" IN ('DRAFT', 'SUBMITTED', 'APPROVED') AND NEW."status" IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'CANCELLED') THEN RETURN NEW; END IF;
    IF OLD."status" = 'REJECTED' AND NEW."status" = 'DRAFT' THEN RETURN NEW; END IF;
    IF OLD."status" = 'CANCELLED' AND NEW."status" = 'DRAFT' THEN RETURN NEW; END IF;
  END IF;

  RAISE EXCEPTION 'Invalid operational document status transition from % to %', OLD."status", NEW."status";
END;
$$ LANGUAGE plpgsql;

-- Allow editing/deleting PaymentAllocation while Payment is in DRAFT or SUBMITTED
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
    IF TG_OP = 'UPDATE' AND parent_status IN ('APPROVED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED')
       AND current_setting('app.operational_reversal', true) = 'on'
       AND NEW."id" IS NOT DISTINCT FROM OLD."id" AND NEW."orderId" IS NOT DISTINCT FROM OLD."orderId"
       AND NEW."productId" IS NOT DISTINCT FROM OLD."productId" AND NEW."variantId" IS NOT DISTINCT FROM OLD."variantId"
       AND NEW."taxRuleId" IS NOT DISTINCT FROM OLD."taxRuleId" AND NEW."lineNumber" IS NOT DISTINCT FROM OLD."lineNumber"
       AND NEW."description" IS NOT DISTINCT FROM OLD."description" AND NEW."orderedQuantity" IS NOT DISTINCT FROM OLD."orderedQuantity"
       AND NEW."unitCost" IS NOT DISTINCT FROM OLD."unitCost" AND NEW."discountAmount" IS NOT DISTINCT FROM OLD."discountAmount"
       AND NEW."taxRate" IS NOT DISTINCT FROM OLD."taxRate" AND NEW."taxAmount" IS NOT DISTINCT FROM OLD."taxAmount"
       AND NEW."lineTotal" IS NOT DISTINCT FROM OLD."lineTotal"
       AND NEW."receivedQuantity" <= OLD."receivedQuantity" AND NEW."receivedQuantity" >= 0 THEN RETURN NEW;
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
    IF parent_status IN ('DRAFT', 'SUBMITTED') THEN
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END IF;
  END IF;

  IF parent_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Operational document children are immutable after draft'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
