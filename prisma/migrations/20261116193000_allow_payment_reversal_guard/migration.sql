-- Allow Payment to be reversed with audit trail and reversing journal
CREATE OR REPLACE FUNCTION protect_posted_operational_document()
RETURNS trigger AS $$
DECLARE
  reversal_exists BOOLEAN := FALSE;
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
    ELSIF TG_TABLE_NAME = 'Payment' THEN
      -- For Payment, reversal is authorized when transitioning to REVERSED with valid reversal audit fields
      reversal_exists := TRUE;
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
