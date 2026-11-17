import { PrismaClient } from "@prisma/client";

const cloudUrl = "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30";
const prisma = new PrismaClient({ datasources: { db: { url: cloudUrl } } });

async function main() {
  const f = await prisma.bankAccount.findFirst({ where: { code: '0001' } });
  const lines = await prisma.journalEntryLine.findMany({
    where: { accountId: f.glAccountId },
    include: { entry: true }
  });
  console.log("Total lines on GL 1010:", lines.length);
  let drSum = 0;
  let crSum = 0;
  for (const l of lines) {
    const dr = Number(l.debit);
    const cr = Number(l.credit);
    if (l.entry.status === "POSTED") {
      drSum += dr;
      crSum += cr;
    }
    console.log(`${l.entry.voucherNumber.padEnd(28)} status: ${l.entry.status.padEnd(8)} Dr: ${String(dr).padStart(8)} Cr: ${String(cr).padStart(8)} module: ${l.entry.sourceModule}`);
  }
  console.log("-------------------------------------------------------------------------------");
  console.log(`POSTED Total Dr: Rs. ${drSum.toLocaleString()} | Total Cr: Rs. ${crSum.toLocaleString()} | Net: Rs. ${(drSum - crSum).toLocaleString()}`);
  await prisma.$disconnect();
}
main();
