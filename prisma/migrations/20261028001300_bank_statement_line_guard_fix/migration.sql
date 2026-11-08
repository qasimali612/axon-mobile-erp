-- Fix: JournalEntryLine links to its entry through "entryId".

CREATE OR REPLACE FUNCTION bank_statement_line_guard() RETURNS trigger AS $$
DECLARE
  parent_status "BankReconciliationStatus";
  parent_account uuid;
  parent_company uuid;
  line_account uuid;
  line_company uuid;
  journal_status "JournalStatus";
BEGIN
  SELECT r."status" INTO parent_status FROM "BankReconciliation" r WHERE r."statementId" = COALESCE(NEW."statementId", OLD."statementId");
  IF parent_status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Statement lines cannot change after the reconciliation is completed';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NEW."matchedJournalLineId" IS NOT NULL THEN
    SELECT s."bankAccountId", s."companyId" INTO parent_account, parent_company
    FROM "BankStatement" s WHERE s."id" = NEW."statementId";
    SELECT jl."bankAccountId", je."companyId", je."status" INTO line_account, line_company, journal_status
    FROM "JournalEntryLine" jl JOIN "JournalEntry" je ON je."id" = jl."entryId"
    WHERE jl."id" = NEW."matchedJournalLineId";
    IF line_company IS DISTINCT FROM parent_company THEN
      RAISE EXCEPTION 'Matched journal line must belong to the statement company';
    END IF;
    IF line_account IS DISTINCT FROM parent_account THEN
      RAISE EXCEPTION 'Matched journal line must reference the statement bank account';
    END IF;
    IF journal_status <> 'POSTED' THEN
      RAISE EXCEPTION 'Only posted journal lines may be matched to a bank statement';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
