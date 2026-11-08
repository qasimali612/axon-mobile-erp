-- Banking: bank account lifecycle, bank statement integrity, and reconciliation controls.

-- A posted journal line can be matched to at most one statement line.
CREATE UNIQUE INDEX "BankStatementLine_matchedJournalLineId_key"
  ON "BankStatementLine"("matchedJournalLineId") WHERE "matchedJournalLineId" IS NOT NULL;

ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_match_flag_check"
  CHECK ("isMatched" = ("matchedJournalLineId" IS NOT NULL));

ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_amount_check"
  CHECK (("deposit" >= 0 AND "withdrawal" >= 0) AND (("deposit" > 0 AND "withdrawal" = 0) OR ("withdrawal" > 0 AND "deposit" = 0)));

ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_period_check" CHECK ("periodEnd" >= "periodStart");

CREATE OR REPLACE FUNCTION bank_statement_guard() RETURNS trigger AS $$
DECLARE
  has_reconciliation boolean;
  overlap_count integer;
  account_company uuid;
  statement_company uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT EXISTS (SELECT 1 FROM "BankReconciliation" r WHERE r."statementId" = OLD."id") INTO has_reconciliation;
    IF has_reconciliation THEN
      RAISE EXCEPTION 'Bank statement has a reconciliation and cannot be deleted';
    END IF;
    IF EXISTS (SELECT 1 FROM "BankStatementLine" l WHERE l."statementId" = OLD."id" AND l."matchedJournalLineId" IS NOT NULL) THEN
      RAISE EXCEPTION 'Bank statement has matched lines and cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT b."companyId" INTO account_company FROM "BankAccount" b WHERE b."id" = NEW."bankAccountId";
    statement_company := NEW."companyId";
    IF account_company IS DISTINCT FROM statement_company THEN
      RAISE EXCEPTION 'Bank statement account must belong to the statement company';
    END IF;
  ELSE
    SELECT EXISTS (SELECT 1 FROM "BankReconciliation" r WHERE r."statementId" = NEW."id") INTO has_reconciliation;
    IF has_reconciliation AND (NEW."periodStart" <> OLD."periodStart" OR NEW."periodEnd" <> OLD."periodEnd" OR NEW."bankAccountId" <> OLD."bankAccountId" OR NEW."openingBalance" <> OLD."openingBalance") THEN
      RAISE EXCEPTION 'Reconciled bank statement periods, accounts, and opening balance are immutable';
    END IF;
  END IF;

  SELECT COUNT(*) INTO overlap_count FROM "BankStatement" s
  WHERE s."bankAccountId" = NEW."bankAccountId" AND s."id" <> COALESCE(NEW."id", '00000000-0000-0000-0000-000000000000'::uuid)
    AND s."periodStart" <= NEW."periodEnd" AND s."periodEnd" >= NEW."periodStart";
  IF overlap_count > 0 THEN
    RAISE EXCEPTION 'Bank statements for one account may not overlap';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "BankStatement_guard" BEFORE INSERT OR UPDATE OR DELETE ON "BankStatement"
FOR EACH ROW EXECUTE FUNCTION bank_statement_guard();

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
    FROM "JournalEntryLine" jl JOIN "JournalEntry" je ON je."id" = jl."journalEntryId"
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

CREATE TRIGGER "BankStatementLine_guard" BEFORE INSERT OR UPDATE OR DELETE ON "BankStatementLine"
FOR EACH ROW EXECUTE FUNCTION bank_statement_line_guard();

CREATE OR REPLACE FUNCTION bank_reconciliation_guard() RETURNS trigger AS $$
DECLARE
  unmatched_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Bank reconciliations cannot be deleted';
  END IF;

  IF NEW."companyId" <> OLD."companyId" OR NEW."bankAccountId" <> OLD."bankAccountId" OR NEW."statementId" <> OLD."statementId" THEN
    RAISE EXCEPTION 'Bank reconciliation company, account, and statement are immutable';
  END IF;

  IF OLD."status" = 'COMPLETED' AND NEW."status" <> 'REOPENED' THEN
    RAISE EXCEPTION 'A completed reconciliation can only be reopened';
  END IF;

  IF NEW."status" = 'COMPLETED' THEN
    IF NEW."adjustedBalance" <> NEW."statementBalance" THEN
      RAISE EXCEPTION 'A reconciliation can only be completed when the adjusted book balance equals the statement balance';
    END IF;
    SELECT COUNT(*) INTO unmatched_count FROM "BankStatementLine" l
    WHERE l."statementId" = NEW."statementId" AND l."matchedJournalLineId" IS NULL;
    IF unmatched_count > 0 THEN
      RAISE EXCEPTION 'Every statement line must be matched before the reconciliation is completed';
    END IF;
  END IF;

  IF NEW."status" = 'REOPENED' AND COALESCE(NEW."reopenedReason", '') = '' THEN
    RAISE EXCEPTION 'A reopened reconciliation requires a reason';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "BankReconciliation_guard" BEFORE UPDATE OR DELETE ON "BankReconciliation"
FOR EACH ROW EXECUTE FUNCTION bank_reconciliation_guard();

-- Bank transaction reconciliation status changes must pass through the reconciliation service.
CREATE OR REPLACE FUNCTION bank_transaction_reconciliation_guard() RETURNS trigger AS $$
BEGIN
  IF NEW."reconciliationStatus" <> OLD."reconciliationStatus" AND COALESCE(current_setting('app.bank_reconciliation', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'Bank reconciliation status may only change through the reconciliation service';
  END IF;
  IF NEW."reconciliationStatus" NOT IN ('UNRECONCILED', 'RECONCILED') THEN
    RAISE EXCEPTION 'Unknown bank reconciliation status';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "BankTransaction_reconciliation_guard" BEFORE UPDATE ON "BankTransaction"
FOR EACH ROW EXECUTE FUNCTION bank_transaction_reconciliation_guard();

-- A bank account may only be retired when no open reconciliation or unreconciled ledger activity remains.
CREATE OR REPLACE FUNCTION bank_account_retire_guard() RETURNS trigger AS $$
BEGIN
  IF NEW."isActive" = false AND OLD."isActive" = true THEN
    IF EXISTS (SELECT 1 FROM "BankReconciliation" r WHERE r."bankAccountId" = NEW."id" AND r."status" <> 'COMPLETED') THEN
      RAISE EXCEPTION 'Bank account has an open reconciliation and cannot be deactivated';
    END IF;
    IF EXISTS (SELECT 1 FROM "BankTransaction" t WHERE t."bankAccountId" = NEW."id" AND t."reconciliationStatus" = 'UNRECONCILED') THEN
      RAISE EXCEPTION 'Bank account has unreconciled transactions and cannot be deactivated';
    END IF;
    IF EXISTS (SELECT 1 FROM "PaymentMethod" pm WHERE pm."bankAccountId" = NEW."id" AND pm."isActive" = true) THEN
      RAISE EXCEPTION 'Bank account is used by an active payment method and cannot be deactivated';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "BankAccount_retire_guard" BEFORE UPDATE ON "BankAccount"
FOR EACH ROW EXECUTE FUNCTION bank_account_retire_guard();
