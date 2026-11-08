-- AlterTable
ALTER TABLE "JournalEntryLine" ADD COLUMN     "salespersonId" UUID;

-- CreateIndex
CREATE INDEX "JournalEntryLine_salespersonId_idx" ON "JournalEntryLine"("salespersonId");

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

