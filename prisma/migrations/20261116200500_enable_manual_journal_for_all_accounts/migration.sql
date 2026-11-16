-- Allow manual journal entry postings for all active accounts in chart of accounts
UPDATE "Account" SET "allowManualJournal" = true WHERE "isActive" = true;
