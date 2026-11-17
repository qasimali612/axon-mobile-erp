import { PrismaClient, Prisma } from "@prisma/client";

const cloudUrl = "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30";
const prisma = new PrismaClient({ datasources: { db: { url: cloudUrl } } });

async function main() {
  const company = await prisma.company.findFirst({ where: { code: 'AXON' } });
  const supplier = await prisma.supplier.findFirst({ where: { code: 'SUP-3414' } });

  const from = new Date("2026-01-01T00:00:00.000Z");
  const to = new Date("2026-11-17T00:00:00.000Z");

  const aggregates = await prisma.$queryRaw(Prisma.sql`
    SELECT
      COALESCE(SUM(l."baseDebit") FILTER (WHERE e."postingDate"<${from} OR (e."postingDate"<=${to} AND e."voucherType"='OPENING')),0)::numeric(19,4) AS "openingDebit",
      COALESCE(SUM(l."baseCredit") FILTER (WHERE e."postingDate"<${from} OR (e."postingDate"<=${to} AND e."voucherType"='OPENING')),0)::numeric(19,4) AS "openingCredit",
      COALESCE(SUM(l."baseDebit") FILTER (WHERE e."postingDate">=${from} AND e."postingDate"<=${to} AND e."voucherType"<>'OPENING'),0)::numeric(19,4) AS "periodDebit",
      COALESCE(SUM(l."baseCredit") FILTER (WHERE e."postingDate">=${from} AND e."postingDate"<=${to} AND e."voucherType"<>'OPENING'),0)::numeric(19,4) AS "periodCredit"
    FROM "JournalEntryLine" l JOIN "JournalEntry" e ON e."id"=l."entryId" JOIN "Account" a ON a."id"=l."accountId"
    WHERE e."companyId"=${company.id}::uuid AND e."status" IN ('POSTED','REVERSED') AND e."postingDate"<=${to}
      AND a."accountType"='ACCOUNTS_PAYABLE' AND l."supplierId"=${supplier.id}::uuid`);

  const rawLines = await prisma.$queryRaw(Prisma.sql`
    SELECT l."id", e."postingDate", e."voucherNumber", e."voucherType"::text AS "voucherType", l."description", e."narration",
      e."referenceDocument" AS reference, e."sourceModule",
      l."baseDebit" AS debit, l."baseCredit" AS credit
    FROM "JournalEntryLine" l JOIN "JournalEntry" e ON e."id"=l."entryId" JOIN "Account" a ON a."id"=l."accountId"
    WHERE e."companyId"=${company.id}::uuid AND e."status" IN ('POSTED','REVERSED') AND e."postingDate">=${from} AND e."postingDate"<=${to}
      AND e."voucherType"<>'OPENING'
      AND a."accountType"='ACCOUNTS_PAYABLE' AND l."supplierId"=${supplier.id}::uuid
    ORDER BY e."postingDate", e."voucherNumber", l."lineNumber"`);

  const agg = aggregates[0];
  const openingCredit = Number(agg.openingCredit);
  const openingDebit = Number(agg.openingDebit);
  const openingBalance = openingCredit - openingDebit;
  const periodDebit = Number(agg.periodDebit);
  const periodCredit = Number(agg.periodCredit);
  const closingBalance = openingBalance + periodCredit - periodDebit;

  console.log("==========================================================================");
  console.log(`SUPPLIER STATEMENT: ${supplier.code} · ${supplier.name}`);
  console.log(`Period: 01-Jan-2026 → 17-Nov-2026`);
  console.log("--------------------------------------------------------------------------");
  console.log(`Opening Balance:     Rs. ${openingBalance.toLocaleString()}`);
  console.log(`Period Debit (Paid): Rs. ${periodDebit.toLocaleString()}`);
  console.log(`Period Credit:       Rs. ${periodCredit.toLocaleString()}`);
  console.log(`Closing Balance:     Rs. ${closingBalance.toLocaleString()}`);
  console.log("--------------------------------------------------------------------------");
  console.log("TRANSACTION ROWS:");
  console.log(`01-Jan-2026 | Opening balance                                          | Balance: Rs. ${openingBalance.toLocaleString()}`);
  let run = openingBalance;
  for (const r of rawLines) {
    const dr = Number(r.debit);
    const cr = Number(r.credit);
    run += (cr - dr);
    console.log(`${r.postingDate.toISOString().slice(0,10)} | ${r.voucherNumber} | ${r.description} | Dr: ${dr} | Cr: ${cr} | Balance: Rs. ${run.toLocaleString()}`);
  }
  console.log("==========================================================================");

  await prisma.$disconnect();
}
main();
