-- Completely eliminate maker-checker and approval requirements from table check constraints
-- Allow single-user direct posting and eliminate approvedById / separate poster constraints

ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_workflow_metadata";
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_workflow_metadata" CHECK (
    ("status" NOT IN ('POSTED', 'REVERSED') OR ("postedById" IS NOT NULL AND "postedAt" IS NOT NULL AND "journalEntryId" IS NOT NULL))
    AND ("status" <> 'REVERSED' OR ("reversedById" IS NOT NULL AND "reversedAt" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(trim("reversalReason")) > 0))
  );

ALTER TABLE "SalesInvoice" DROP CONSTRAINT IF EXISTS "SalesInvoice_workflow_metadata";
ALTER TABLE "SalesInvoice"
  ADD CONSTRAINT "SalesInvoice_workflow_metadata" CHECK (
    ("status" NOT IN ('POSTED', 'REVERSED') OR ("postedById" IS NOT NULL AND "postedAt" IS NOT NULL AND "journalEntryId" IS NOT NULL))
    AND ("status" <> 'REVERSED' OR ("reversedById" IS NOT NULL AND "reversedAt" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(trim("reversalReason")) > 0))
  );

ALTER TABLE "PurchaseReceipt" DROP CONSTRAINT IF EXISTS "PurchaseReceipt_workflow_metadata";
ALTER TABLE "PurchaseReceipt"
  ADD CONSTRAINT "PurchaseReceipt_workflow_metadata" CHECK (
    ("status" NOT IN ('POSTED', 'REVERSED') OR ("postedById" IS NOT NULL AND "postedAt" IS NOT NULL AND "journalEntryId" IS NOT NULL))
    AND ("status" <> 'REVERSED' OR ("reversedById" IS NOT NULL AND "reversedAt" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(trim("reversalReason")) > 0))
  );
