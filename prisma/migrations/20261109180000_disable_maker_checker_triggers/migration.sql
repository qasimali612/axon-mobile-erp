-- Completely drop maker-checker triggers across all core tables
DROP TRIGGER IF EXISTS "JournalEntry_maker_checker_guard" ON "JournalEntry";
DROP TRIGGER IF EXISTS "PurchaseOrder_maker_checker_guard" ON "PurchaseOrder";
DROP TRIGGER IF EXISTS "PurchaseReceipt_maker_checker_guard" ON "PurchaseReceipt";
DROP TRIGGER IF EXISTS "SalesInvoice_maker_checker_guard" ON "SalesInvoice";

-- Replace enforce_document_maker_checker function with safe no-op
CREATE OR REPLACE FUNCTION enforce_document_maker_checker()
RETURNS trigger AS $$
BEGIN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Replace enforce_operational_status_transition with flexible direct posting / draft editing logic
CREATE OR REPLACE FUNCTION enforce_operational_status_transition()
RETURNS trigger AS $$
BEGIN
  IF NEW."status" = OLD."status" THEN RETURN NEW; END IF;
  IF OLD."status" = 'POSTED' THEN
    IF NEW."status" = 'REVERSED' THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Invalid operational document status transition from % to %', OLD."status", NEW."status";
  END IF;
  IF OLD."status" = 'REVERSED' THEN
    RAISE EXCEPTION 'Reversed operational documents cannot transition to %', NEW."status";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure all system.operating_mode settings are set to SINGLE_USER
UPDATE "SystemSetting"
SET "value" = '{"mode":"SINGLE_USER","description":"Single-operator mode"}'::jsonb
WHERE "key" = 'system.operating_mode';
