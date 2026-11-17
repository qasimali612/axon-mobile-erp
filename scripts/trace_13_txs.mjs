import { PrismaClient } from "@prisma/client";

const cloudUrl = "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30";
const prisma = new PrismaClient({
  datasources: { db: { url: cloudUrl } }
});

async function main() {
  const bankAccount = await prisma.bankAccount.findFirst({
    where: { code: "0001" }
  });
  const txs = await prisma.bankTransaction.findMany({
    where: { bankAccountId: bankAccount.id },
    include: { journalEntry: true },
    orderBy: { createdAt: "asc" }
  });

  console.log(`Found ${txs.length} total bank transactions:`);
  let depSum = 0;
  let wdrSum = 0;
  txs.forEach((t, i) => {
    depSum += Number(t.deposit);
    wdrSum += Number(t.withdrawal);
    console.log(`${i+1}. ID: ${t.id} | Created: ${t.createdAt.toISOString()} | Date: ${t.transactionDate.toISOString().slice(0,10)} | Type: ${t.transactionType} | Dep: ${t.deposit} | Wdr: ${t.withdrawal} | CumDep: ${depSum} | CumWdr: ${wdrSum} | Net: ${depSum - wdrSum} | Voucher: ${t.journalEntry?.voucherNumber} | Desc: ${t.description}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
