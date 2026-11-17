import { PrismaClient } from "@prisma/client";

const cloudUrl = "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30";
const prisma = new PrismaClient({ datasources: { db: { url: cloudUrl } } });

async function main() {
  console.log("=== VERIFYING OPENING STOCK ADJUSTMENTS MIGRATION ===\n");

  const targetAdjustmentNumbers = [
    "ISB--SA-FY2026-27-000001",
    "ISB-SA-FY2026-27-000006",
    "ISB-SA-FY2026-27-000005",
    "ISB-SA-FY2026-27-000004",
    "ISB--SA-FY2026-27-000003",
    "ISB--SA-FY2026-27-000002",
    "ISB-SA-FY2026-27-000007"
  ];

  const adjustments = await prisma.stockAdjustment.findMany({
    where: { adjustmentNumber: { in: targetAdjustmentNumbers } },
    include: {
      lines: true,
      journalEntry: {
        include: {
          period: true,
          lines: {
            include: { account: true }
          }
        }
      }
    },
    orderBy: { adjustmentNumber: "asc" }
  });

  console.log(`Auditing ${adjustments.length} Adjustments:\n`);
  let totalDebitAll = 0;
  let totalCreditAll = 0;

  for (const a of adjustments) {
    const j = a.journalEntry;
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`Adjustment: ${a.adjustmentNumber}`);
    console.log(`  Date: ${a.adjustmentDate.toISOString().slice(0, 10)} | Status: ${a.status} | ReasonCode: ${a.reasonCode} | Reason: "${a.reason}"`);
    console.log(`  Net Value: Rs ${Number(a.netValue).toLocaleString()}`);
    
    if (j) {
      console.log(`  Linked Voucher: ${j.voucherNumber} (Type: ${j.voucherType})`);
      console.log(`  Voucher Date: ${j.voucherDate.toISOString().slice(0, 10)} | Posting Date: ${j.postingDate.toISOString().slice(0, 10)} | Period: ${j.period?.name}`);
      console.log(`  Lines:`);
      for (const l of j.lines) {
        console.log(`    - Account ${l.account.code} (${l.account.name}): Dr Rs ${l.debit} | Cr Rs ${l.credit} | "${l.description}"`);
        totalDebitAll += Number(l.debit);
        totalCreditAll += Number(l.credit);
      }
    } else {
      console.error(`  ERROR: No linked journal found!`);
    }

    // Check movements count and dates
    const movements = await prisma.inventoryMovement.findMany({
      where: {
        OR: [
          { sourceDocumentId: a.id },
          { sourceDocumentNumber: a.adjustmentNumber }
        ]
      },
      select: { id: true, postingDate: true, quantity: true, totalCost: true }
    });
    const movementDates = [...new Set(movements.map(m => m.postingDate.toISOString().slice(0, 10)))];
    console.log(`  Inventory Movements: ${movements.length} records | Posting Date(s): ${movementDates.join(", ")}`);
  }

  console.log(`\n================================================================================`);
  console.log(`TOTALS AUDIT:`);
  console.log(`Total Debits across opening journals:  Rs ${totalDebitAll.toLocaleString()}`);
  console.log(`Total Credits across opening journals: Rs ${totalCreditAll.toLocaleString()}`);
  console.log(`Discrepancy (Debit - Credit):          Rs ${(totalDebitAll - totalCreditAll).toFixed(2)}`);

  // Check Account 4030
  const acc4030 = await prisma.account.findFirst({
    where: { code: "4030" },
    include: {
      journalLines: {
        where: {
          entry: {
            status: "POSTED"
          }
        }
      }
    }
  });
  const acc4030Lines = acc4030?.journalLines || [];
  const acc4030TotalCredit = acc4030Lines.reduce((sum, l) => sum + Number(l.credit), 0);
  console.log(`\nAccount 4030 (Inventory Adjustment Gain):`);
  console.log(`  Active Posted Lines: ${acc4030Lines.length}`);
  console.log(`  Total Gain Balance: Rs ${acc4030TotalCredit.toLocaleString()}`);

  // Check Account 1200
  const acc1200 = await prisma.account.findFirst({ where: { code: "1200" } });
  console.log(`\nAccount 1200 (Merchandise Inventory):`);
  console.log(`  Opening Balance: Rs ${Number(acc1200?.openingBalance || 0).toLocaleString()}`);
  console.log(`  Opening Date: ${acc1200?.openingBalanceDate?.toISOString().slice(0, 10)}`);

  // Check Account 3100
  const acc3100 = await prisma.account.findFirst({
    where: { code: "3100" },
    include: {
      journalLines: {
        where: {
          entry: {
            status: "POSTED"
          }
        }
      }
    }
  });
  const acc3100Credits = acc3100?.journalLines.reduce((sum, l) => sum + Number(l.credit), 0) || 0;
  console.log(`\nAccount 3100 (Retained Earnings / Equity):`);
  console.log(`  Opening Equity Credited: Rs ${acc3100Credits.toLocaleString()}`);

  console.log("\n=== VERIFICATION COMPLETE ===");
}

main().catch(console.error).finally(() => prisma.$disconnect());
