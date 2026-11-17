import { PrismaClient, Prisma } from "@prisma/client";
const Decimal = Prisma.Decimal;

const cloudUrl = "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30";
const prisma = new PrismaClient({ datasources: { db: { url: cloudUrl } } });

async function main() {
  const company = await prisma.company.findFirst();
  const from = new Date("2026-11-01T00:00:00.000Z");
  const to = new Date("2026-11-30T23:59:59.999Z");

  const cashAccounts = await prisma.account.findMany({
    where: {
      companyId: company.id,
      isActive: true,
      OR: [
        { accountType: "CASH" },
        { code: "1000" },
        { name: { contains: "Cash", mode: "insensitive" } },
      ],
    },
    select: { id: true, code: true, name: true }
  });
  const targetAccountIds = cashAccounts.map(a => a.id);

  // Opening balance aggregate before from
  const openingAgg = await prisma.journalEntryLine.aggregate({
    where: {
      accountId: { in: targetAccountIds },
      entry: {
        companyId: company.id,
        status: { in: ["POSTED", "REVERSED"] },
        postingDate: { lt: from },
      },
    },
    _sum: { baseDebit: true, baseCredit: true },
  });

  const openingDebit = new Decimal(openingAgg._sum.baseDebit?.toString() || "0");
  const openingCredit = new Decimal(openingAgg._sum.baseCredit?.toString() || "0");
  const openingBalance = openingDebit.minus(openingCredit);

  console.log("=== Cash in Hand Report Period: 2026-11-01 to 2026-11-30 ===");
  console.log("Opening Debit (before Nov 1):", openingDebit.toString());
  console.log("Opening Credit (before Nov 1):", openingCredit.toString());
  console.log("Opening Balance:", openingBalance.toString(), "PKR");

  // In-period lines
  const lines = await prisma.journalEntryLine.findMany({
    where: {
      accountId: { in: targetAccountIds },
      entry: {
        companyId: company.id,
        status: { in: ["POSTED", "REVERSED"] },
        postingDate: { gte: from, lte: to },
      },
    },
    include: {
      entry: {
        select: {
          voucherNumber: true,
          voucherType: true,
          postingDate: true,
          narration: true
        }
      }
    },
    orderBy: [
      { entry: { postingDate: "asc" } },
      { id: "asc" }
    ]
  });

  console.log(`\nIn-period lines count: ${lines.length}`);
  let running = openingBalance;
  let totalIn = new Decimal(0);
  let totalOut = new Decimal(0);

  for (const l of lines) {
    const dr = new Decimal(l.baseDebit?.toString() || "0");
    const cr = new Decimal(l.baseCredit?.toString() || "0");
    totalIn = totalIn.plus(dr);
    totalOut = totalOut.plus(cr);
    running = running.plus(dr).minus(cr);

    console.log(`- ${l.entry.postingDate.toISOString().slice(0, 10)} | ${l.entry.voucherNumber.padEnd(25)} | Dr: ${String(dr).padStart(8)} | Cr: ${String(cr).padStart(8)} | Run: ${running.toString().padStart(8)} | ${l.entry.narration}`);
  }

  console.log("---------------------------------------------------------------------------------");
  console.log("Summary:");
  console.log("Opening Balance :", openingBalance.toString());
  console.log("Total Inflows   :", totalIn.toString());
  console.log("Total Outflows  :", totalOut.toString());
  console.log("Net Movement    :", totalIn.minus(totalOut).toString());
  console.log("Closing Balance :", running.toString());
}

main().catch(console.error).finally(() => prisma.$disconnect());
