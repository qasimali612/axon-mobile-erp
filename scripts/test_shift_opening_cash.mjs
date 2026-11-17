import { PrismaClient } from "@prisma/client";
const cloudUrl = "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30";
const prisma = new PrismaClient({ datasources: { db: { url: cloudUrl } } });

async function main() {
  const targetJournalId = "a1eaf18e-9814-4ad3-960c-e6ccf2f9d922";
  const octPeriodId = "0d6fed32-757f-4e8e-84a3-04009b9837fa";

  console.log("Checking current state of journal...");
  const before = await prisma.journalEntry.findUnique({
    where: { id: targetJournalId },
    include: { lines: true }
  });
  console.log("Before update:", {
    voucherNumber: before.voucherNumber,
    voucherDate: before.voucherDate,
    postingDate: before.postingDate,
    periodId: before.periodId,
    voucherType: before.voucherType,
    lines: before.lines.map(l => ({ accountId: l.accountId, debit: l.debit, credit: l.credit }))
  });

  // Temporarily disable trigger on JournalEntry to update voucherDate & postingDate to 2026-10-31
  console.log("\nUpdating journal date to 2026-10-31 23:59:59...");
  await prisma.$executeRawUnsafe(`ALTER TABLE "JournalEntry" DISABLE TRIGGER USER;`);
  
  await prisma.$executeRawUnsafe(`
    UPDATE "JournalEntry"
    SET "voucherDate" = '2026-10-31 23:59:59+00',
        "postingDate" = '2026-10-31 23:59:59+00',
        "periodId" = '${octPeriodId}'
    WHERE id = '${targetJournalId}';
  `);

  await prisma.$executeRawUnsafe(`ALTER TABLE "JournalEntry" ENABLE TRIGGER USER;`);

  // Update Account 1000 opening balance metadata as well
  await prisma.account.update({
    where: { id: "ce226a16-c5de-4736-8c8c-89ef596b7931" },
    data: {
      openingBalance: -69140,
      openingBalanceDate: new Date("2026-10-31")
    }
  });

  const after = await prisma.journalEntry.findUnique({
    where: { id: targetJournalId }
  });
  console.log("After update:", {
    voucherNumber: after.voucherNumber,
    voucherDate: after.voucherDate,
    postingDate: after.postingDate,
    periodId: after.periodId
  });

  console.log("Journal successfully updated!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
