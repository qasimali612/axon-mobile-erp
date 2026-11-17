import { PrismaClient } from "@prisma/client";

const cloudUrl = "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30";
const prisma = new PrismaClient({
  datasources: { db: { url: cloudUrl } }
});

async function main() {
  console.log("=== CUSTOMER INVOICES & ALLOCATIONS ===");
  const invoices = await prisma.salesInvoice.findMany({
    where: {
      invoiceNumber: { in: ["ISB-SI-FY2026-27-000010", "ISB-SI-FY2026-27-000011"] }
    },
    include: {
      customer: true,
      allocations: {
        include: {
          payment: true
        }
      }
    }
  });

  for (const inv of invoices) {
    console.log(`\nInvoice: ${inv.invoiceNumber} | Date: ${inv.invoiceDate.toISOString().slice(0,10)} | GrandTotal: ${inv.grandTotal} | Status: ${inv.status} | Customer: ${inv.customer.name} (${inv.customer.code})`);
    console.log(`  Allocations Count: ${inv.allocations.length}`);
    let totalAlloc = 0;
    inv.allocations.forEach((al, i) => {
      totalAlloc += Number(al.amount);
      console.log(`    #${i+1} Payment: ${al.payment.paymentNumber} | PaymentStatus: ${al.payment.status} | PaymentAmt: ${al.payment.amount} | AllocAmt: ${al.amount}`);
    });
    console.log(`  Net Allocated: ${totalAlloc} | Calculated Due: ${Number(inv.grandTotal) - totalAlloc}`);
  }

  console.log("\n=== ALL PAYMENTS RELATED TO 64999 & 47999 ===");
  const payments = await prisma.payment.findMany({
    where: {
      amount: { in: [64999, 47999] }
    },
    include: {
      customer: true,
      journalEntry: {
        include: { lines: { include: { account: true } } }
      },
      allocations: {
        include: { salesInvoice: true }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  for (const p of payments) {
    console.log(`\nPayment: ${p.paymentNumber} [ID: ${p.id}]`);
    console.log(`  Amount: ${p.amount} | Status: ${p.status} | Date: ${p.paymentDate.toISOString().slice(0,10)} | Created: ${p.createdAt.toISOString()}`);
    console.log(`  Customer: ${p.customer?.name} (${p.customer?.code})`);
    console.log(`  Reference: "${p.referenceNumber}" | Notes: "${p.notes}"`);
    console.log(`  ReversalOfId: ${p.reversalOfId} | ReversedAt: ${p.reversedAt?.toISOString()}`);
    console.log(`  Linked Journal: ${p.journalEntry?.voucherNumber} (Status: ${p.journalEntry?.status})`);
    p.allocations.forEach(a => {
      console.log(`    Allocation: Invoice ${a.salesInvoice?.invoiceNumber} -> Amount ${a.amount}`);
    });
  }

  console.log("\n=== REVERSAL JOURNALS ===");
  const revJournals = await prisma.journalEntry.findMany({
    where: {
      voucherNumber: { in: ["ISB-RCR-FY2026-27-000003", "ISB-RCR-FY2026-27-000004"] }
    },
    include: {
      lines: { include: { account: true, customer: true, bankAccount: true } }
    }
  });

  for (const rj of revJournals) {
    console.log(`\nReversal Journal: ${rj.voucherNumber} [ID: ${rj.id}]`);
    console.log(`  Posting Date: ${rj.postingDate.toISOString().slice(0,10)} | Created: ${rj.createdAt.toISOString()}`);
    console.log(`  Status: ${rj.status} | VoucherType: ${rj.voucherType}`);
    console.log(`  SourceModule: ${rj.sourceModule} | SourceDocType: ${rj.sourceDocumentType} | SourceDocId: ${rj.sourceDocumentId} | SourceDocNum: ${rj.sourceDocumentNumber}`);
    console.log(`  ReversalOfId: ${rj.reversalOfId}`);
    console.log(`  Narration: "${rj.narration}"`);
    rj.lines.forEach((l, i) => {
      console.log(`    Line ${i+1}: Acc ${l.account.code} (${l.account.name}) | Dr: ${l.baseDebit} | Cr: ${l.baseCredit} | Party: ${l.customer?.name || "NONE"} | Bank: ${l.bankAccount?.bankName || "NONE"}`);
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
