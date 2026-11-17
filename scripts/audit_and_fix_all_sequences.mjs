import { PrismaClient } from "@prisma/client";

const cloudUrl = "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30";
const prisma = new PrismaClient({ datasources: { db: { url: cloudUrl } } });

async function main() {
  console.log("=== AUDITING ALL DOCUMENT SEQUENCES ===");

  const sequences = await prisma.documentSequence.findMany({
    orderBy: [{ documentType: "asc" }, { branchId: "asc" }]
  });

  console.log(`Found ${sequences.length} DocumentSequence records:\n`);

  for (const s of sequences) {
    console.log(`Sequence ID: ${s.id}`);
    console.log(`  Type: ${s.documentType} | Prefix: ${s.prefix} | FY: ${s.fiscalYear} | BranchId: ${s.branchId}`);
    console.log(`  Current nextValue: ${s.nextValue.toString()}`);

    // If documentType is JOURNAL, check max voucherNumber in JournalEntry
    if (s.documentType === "JOURNAL") {
      const journals = await prisma.journalEntry.findMany({
        where: {
          voucherNumber: { startsWith: `${s.prefix}-${s.fiscalYear}-` }
        },
        select: { voucherNumber: true }
      });
      console.log(`  Matching Journals in DB: ${journals.length}`);
      let maxNum = 0;
      for (const j of journals) {
        const parts = j.voucherNumber.split("-");
        const lastPart = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastPart) && lastPart > maxNum) {
          maxNum = lastPart;
        }
      }
      console.log(`  Max existing journal number: ${maxNum}`);
      if (Number(s.nextValue) <= maxNum) {
        const newNextValue = BigInt(maxNum + 1);
        console.log(`  ⚠️ SEQUENCE COLLISION DETECTED! Updating nextValue from ${s.nextValue} to ${newNextValue}...`);
        await prisma.documentSequence.update({
          where: { id: s.id },
          data: { nextValue: newNextValue }
        });
        console.log(`  ✅ Successfully updated sequence to ${newNextValue}!`);
      } else {
        console.log(`  ✅ Sequence is ahead of existing records.`);
      }
    }
  }

  // Also check if any other document types have collisions (e.g. SalesInvoice, PurchaseReceipt, StockAdjustment, Payment, BankTransaction)
  // Let's check SalesInvoice
  const siSequences = sequences.filter(s => s.documentType === "SALES_INVOICE" || s.documentType === "POS_INVOICE");
  for (const s of siSequences) {
    const invoices = await prisma.salesInvoice.findMany({
      where: { invoiceNumber: { startsWith: `${s.prefix}-${s.fiscalYear}-` } },
      select: { invoiceNumber: true }
    });
    let maxNum = 0;
    for (const inv of invoices) {
      const parts = inv.invoiceNumber.split("-");
      const lastPart = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastPart) && lastPart > maxNum) maxNum = lastPart;
    }
    console.log(`SalesInvoice (${s.prefix}): max in DB = ${maxNum}, nextValue = ${s.nextValue}`);
    if (Number(s.nextValue) <= maxNum) {
      const newNext = BigInt(maxNum + 1);
      await prisma.documentSequence.update({
        where: { id: s.id },
        data: { nextValue: newNext }
      });
      console.log(`  ✅ Updated sequence ${s.id} to ${newNext}`);
    }
  }

  // Check Payment
  const paySequences = sequences.filter(s => s.documentType === "PAYMENT" || s.documentType === "RECEIPT");
  for (const s of paySequences) {
    const payments = await prisma.payment.findMany({
      where: { paymentNumber: { startsWith: `${s.prefix}-${s.fiscalYear}-` } },
      select: { paymentNumber: true }
    });
    let maxNum = 0;
    for (const p of payments) {
      const parts = p.paymentNumber.split("-");
      const lastPart = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastPart) && lastPart > maxNum) maxNum = lastPart;
    }
    console.log(`Payment (${s.prefix}): max in DB = ${maxNum}, nextValue = ${s.nextValue}`);
    if (Number(s.nextValue) <= maxNum) {
      const newNext = BigInt(maxNum + 1);
      await prisma.documentSequence.update({
        where: { id: s.id },
        data: { nextValue: newNext }
      });
      console.log(`  ✅ Updated sequence ${s.id} to ${newNext}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
