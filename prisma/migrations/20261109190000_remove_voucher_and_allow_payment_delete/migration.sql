-- Remove requested voucher ISB--RC-FY2026-27-000006 cleanly
DO $$
DECLARE
  v_pay_id uuid;
  v_je_id uuid;
BEGIN
  SELECT id, "journalEntryId" INTO v_pay_id, v_je_id FROM "Payment" WHERE "paymentNumber" = 'ISB--RC-FY2026-27-000006';
  IF v_pay_id IS NOT NULL THEN
    DELETE FROM "PaymentAllocation" WHERE "paymentId" = v_pay_id;
    DELETE FROM "Payment" WHERE id = v_pay_id;
    IF v_je_id IS NOT NULL THEN
      DELETE FROM "JournalEntryLine" WHERE "journalEntryId" = v_je_id;
      DELETE FROM "JournalEntry" WHERE id = v_je_id;
    END IF;
  END IF;
END $$;

