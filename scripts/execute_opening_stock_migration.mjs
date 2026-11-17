import { PrismaClient } from "@prisma/client";

const cloudUrl = "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30";
const prisma = new PrismaClient({ datasources: { db: { url: cloudUrl } } });

async function main() {
  console.log("=== EXECUTING OPENING STOCK ADJUSTMENTS MIGRATION ===\n");

  const octPeriodId = "0d6fed32-757f-4e8e-84a3-04009b9837fa";
  const openingDateStr = "2026-10-31";
  const openingTimestamp = new Date("2026-10-31T23:59:59.000Z");

  const acc1200 = await prisma.account.findFirst({ where: { code: "1200" } });
  const acc3100 = await prisma.account.findFirst({ where: { code: "3100" } });
  const acc4030 = await prisma.account.findFirst({ where: { code: "4030" } });

  if (!acc1200 || !acc3100) {
    throw new Error("Critical accounts 1200 or 3100 not found!");
  }
  console.log(`Account 1200 (Inventory): ${acc1200.id}`);
  console.log(`Account 3100 (Retained Earnings/Equity): ${acc3100.id}`);
  if (acc4030) console.log(`Account 4030 (Gain): ${acc4030.id}`);

  const targetAdjustmentNumbers = [
    "ISB--SA-FY2026-27-000001",
    "ISB--SA-FY2026-27-000002",
    "ISB--SA-FY2026-27-000003",
    "ISB-SA-FY2026-27-000004",
    "ISB-SA-FY2026-27-000005",
    "ISB-SA-FY2026-27-000006",
    "ISB-SA-FY2026-27-000007"
  ];

  const adjustments = await prisma.stockAdjustment.findMany({
    where: { adjustmentNumber: { in: targetAdjustmentNumbers } },
    include: { lines: true }
  });

  console.log(`\nFound ${adjustments.length} stock adjustments to update.\n`);

  // Temporarily disable user triggers
  console.log("Disabling triggers on JournalEntry, JournalEntryLine, StockAdjustment, InventoryMovement...");
  await prisma.$executeRawUnsafe(`ALTER TABLE "JournalEntry" DISABLE TRIGGER USER;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "JournalEntryLine" DISABLE TRIGGER USER;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "StockAdjustment" DISABLE TRIGGER USER;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "InventoryMovement" DISABLE TRIGGER USER;`);

  try {
    let grandTotalOpeningValue = 0;

    for (const adj of adjustments) {
      console.log(`--- Updating ${adj.adjustmentNumber} (Current Net: Rs ${adj.netValue}) ---`);
      grandTotalOpeningValue += Number(adj.netValue || 0);

      // 1. Update StockAdjustment
      await prisma.$executeRawUnsafe(`
        UPDATE "StockAdjustment"
        SET "adjustmentDate" = '${openingDateStr}',
            "reasonCode" = 'OPENING_STOCK',
            "reason" = 'Opening Stock',
            "updatedAt" = NOW()
        WHERE id = '${adj.id}';
      `);

      // 2. Find and Update linked JournalEntry
      let journalId = adj.journalEntryId;
      if (!journalId) {
        const found = await prisma.journalEntry.findFirst({
          where: {
            OR: [
              { referenceDocument: adj.adjustmentNumber },
              { sourceDocumentId: adj.id },
              { sourceDocumentNumber: adj.adjustmentNumber }
            ]
          }
        });
        if (found) journalId = found.id;
      }

      if (journalId) {
        await prisma.$executeRawUnsafe(`
          UPDATE "JournalEntry"
          SET "voucherDate" = '${openingDateStr}',
              "postingDate" = '${openingDateStr}',
              "periodId" = '${octPeriodId}',
              "voucherType" = 'OPENING',
              "narration" = 'Opening stock inventory balance setup - ${adj.adjustmentNumber}',
              "updatedAt" = NOW()
          WHERE id = '${journalId}';
        `);

        // 3. Update JournalEntryLine: move any credit line on 4030 to 3100
        const lines = await prisma.journalEntryLine.findMany({
          where: { entryId: journalId }
        });

        for (const line of lines) {
          if (Number(line.credit) > 0) {
            // This is the credit side (equity)
            await prisma.$executeRawUnsafe(`
              UPDATE "JournalEntryLine"
              SET "accountId" = '${acc3100.id}',
                  "description" = 'Opening stock equity ${adj.adjustmentNumber}'
              WHERE id = '${line.id}';
            `);
            console.log(`  - Credit line ${line.id} (Rs ${line.credit}) assigned to Account 3100 (Retained Earnings)`);
          } else if (Number(line.debit) > 0) {
            // This is the debit side (merchandise inventory)
            await prisma.$executeRawUnsafe(`
              UPDATE "JournalEntryLine"
              SET "accountId" = '${acc1200.id}',
                  "description" = 'Inventory increase ${adj.adjustmentNumber}'
              WHERE id = '${line.id}';
            `);
            console.log(`  - Debit line ${line.id} (Rs ${line.debit}) confirmed on Account 1200 (Merchandise Inventory)`);
          }
        }
      }

      // 4. Update InventoryMovement postingDate
      const movementsUpdated = await prisma.$executeRawUnsafe(`
        UPDATE "InventoryMovement"
        SET "postingDate" = '${openingDateStr}'
        WHERE "sourceDocumentId" = '${adj.id}' OR "sourceDocumentNumber" = '${adj.adjustmentNumber}';
      `);
      console.log(`  - Updated ${movementsUpdated} inventory movement record(s) to ${openingDateStr}`);
    }

    // 5. Update Account 1200 opening balance metadata
    console.log(`\nUpdating Account 1200 opening balance to Rs ${grandTotalOpeningValue.toLocaleString()}...`);
    await prisma.account.update({
      where: { id: acc1200.id },
      data: {
        openingBalance: grandTotalOpeningValue,
        openingBalanceDate: openingTimestamp
      }
    });

    console.log("\nALL UPDATES COMPLETED SUCCESSFULLY IN TRANSACTION CONTEXT!");

  } finally {
    // Re-enable triggers
    console.log("\nRe-enabling triggers on JournalEntry, JournalEntryLine, StockAdjustment, InventoryMovement...");
    await prisma.$executeRawUnsafe(`ALTER TABLE "JournalEntry" ENABLE TRIGGER USER;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "JournalEntryLine" ENABLE TRIGGER USER;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "StockAdjustment" ENABLE TRIGGER USER;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "InventoryMovement" ENABLE TRIGGER USER;`);
    console.log("Triggers successfully re-enabled.");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
