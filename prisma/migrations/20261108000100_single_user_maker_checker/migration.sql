-- Relax static table check constraints for maker-checker so Single-User Mode can operate
-- Maker-checker is dynamically enforced by triggers that check SystemSetting ('SINGLE_USER' vs 'MULTI_USER')

ALTER TABLE "JournalEntry" DROP CONSTRAINT IF EXISTS "JournalEntry_maker_checker";
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT IF EXISTS "PurchaseOrder_maker_checker";
ALTER TABLE "PurchaseReceipt" DROP CONSTRAINT IF EXISTS "PurchaseReceipt_workflow_metadata";
ALTER TABLE "SalesInvoice" DROP CONSTRAINT IF EXISTS "SalesInvoice_maker_checker";
ALTER TABLE "SalesInvoice" DROP CONSTRAINT IF EXISTS "SalesInvoice_workflow_metadata";

-- Preserve status and audit metadata integrity on receipts and invoices
ALTER TABLE "PurchaseReceipt"
  ADD CONSTRAINT "PurchaseReceipt_workflow_metadata" CHECK (
    ("status" NOT IN ('APPROVED', 'POSTED', 'REVERSED') OR ("approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL))
    AND ("status" NOT IN ('POSTED', 'REVERSED') OR ("postedById" IS NOT NULL AND "postedAt" IS NOT NULL AND "journalEntryId" IS NOT NULL))
    AND ("status" <> 'REVERSED' OR ("reversedById" IS NOT NULL AND "reversedAt" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(trim("reversalReason")) > 0))
  );

ALTER TABLE "SalesInvoice"
  ADD CONSTRAINT "SalesInvoice_workflow_metadata" CHECK (
    ("status" NOT IN ('APPROVED', 'POSTED', 'REVERSED') OR ("approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL))
    AND ("status" NOT IN ('POSTED', 'REVERSED') OR ("postedById" IS NOT NULL AND "postedAt" IS NOT NULL AND "journalEntryId" IS NOT NULL))
    AND ("status" <> 'REVERSED' OR ("reversedById" IS NOT NULL AND "reversedAt" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(trim("reversalReason")) > 0))
  );

-- Dynamic trigger: In Multi-User Mode, enforces strict segregation of duties.
-- In Single-User Mode, permits the sole proprietor/operator to prepare, approve, and post.
CREATE OR REPLACE FUNCTION enforce_document_maker_checker()
RETURNS trigger AS $$
DECLARE
  op_mode text;
BEGIN
  -- Look up system operating mode for the company
  SELECT "value"->>'mode' INTO op_mode
  FROM "SystemSetting"
  WHERE "companyId" = NEW."companyId" AND "key" = 'system.operating_mode';

  -- In Single-User Mode, sole operator is permitted to prepare, approve, and post
  IF op_mode = 'SINGLE_USER' THEN
    RETURN NEW;
  END IF;

  -- In Multi-User Mode (or default), enforce strict segregation of duties
  IF NEW."approvedById" IS NOT NULL AND NEW."approvedById" = NEW."preparedById" THEN
    RAISE EXCEPTION 'Preparer cannot approve their own document in Multi-User Mode' USING ERRCODE = '23514';
  END IF;
  IF NEW."postedById" IS NOT NULL AND NEW."postedById" = NEW."preparedById" THEN
    RAISE EXCEPTION 'Preparer cannot post their own document in Multi-User Mode' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "JournalEntry_maker_checker_guard" ON "JournalEntry";
CREATE TRIGGER "JournalEntry_maker_checker_guard"
BEFORE INSERT OR UPDATE OF "approvedById", "postedById" ON "JournalEntry"
FOR EACH ROW EXECUTE FUNCTION enforce_document_maker_checker();

DROP TRIGGER IF EXISTS "PurchaseOrder_maker_checker_guard" ON "PurchaseOrder";
CREATE TRIGGER "PurchaseOrder_maker_checker_guard"
BEFORE INSERT OR UPDATE OF "approvedById" ON "PurchaseOrder"
FOR EACH ROW EXECUTE FUNCTION enforce_document_maker_checker();

DROP TRIGGER IF EXISTS "PurchaseReceipt_maker_checker_guard" ON "PurchaseReceipt";
CREATE TRIGGER "PurchaseReceipt_maker_checker_guard"
BEFORE INSERT OR UPDATE OF "approvedById", "postedById" ON "PurchaseReceipt"
FOR EACH ROW EXECUTE FUNCTION enforce_document_maker_checker();

DROP TRIGGER IF EXISTS "SalesInvoice_maker_checker_guard" ON "SalesInvoice";
CREATE TRIGGER "SalesInvoice_maker_checker_guard"
BEFORE INSERT OR UPDATE OF "approvedById", "postedById" ON "SalesInvoice"
FOR EACH ROW EXECUTE FUNCTION enforce_document_maker_checker();

