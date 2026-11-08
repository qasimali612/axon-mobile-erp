-- JournalEntry.sourceDocumentId is a generic varchar reference while return IDs
-- are UUIDs. Cast the UUID explicitly in the posting guard and include notes in
-- the submitted-document immutability set.
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
    OLD."returnNumber", OLD."returnType", OLD."returnDate", OLD."currencyCode", OLD."subtotal", OLD."discountTotal", OLD."taxTotal", OLD."grandTotal", OLD."costTotal", OLD."reason", OLD."notes", OLD."idempotencyKey", OLD."preparedById"
  ) IS DISTINCT FROM (
    NEW."companyId", NEW."branchId", NEW."warehouseId", NEW."customerId", NEW."supplierId", NEW."salesInvoiceId", NEW."purchaseReceiptId",
    NEW."returnNumber", NEW."returnType", NEW."returnDate", NEW."currencyCode", NEW."subtotal", NEW."discountTotal", NEW."taxTotal", NEW."grandTotal", NEW."costTotal", NEW."reason", NEW."notes", NEW."idempotencyKey", NEW."preparedById"
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
    IF NOT EXISTS (SELECT 1 FROM "JournalEntry" WHERE "id" = NEW."journalEntryId" AND "status" = 'POSTED' AND "sourceDocumentId" = NEW."id"::text) THEN
      RAISE EXCEPTION 'Posted return requires its linked posted journal';
    END IF;
  END IF;
  RETURN NEW;
END $$;
