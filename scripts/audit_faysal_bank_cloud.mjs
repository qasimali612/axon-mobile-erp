import { PrismaClient } from "@prisma/client";

const cloudUrl = "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30";
const prisma = new PrismaClient({
  datasources: { db: { url: cloudUrl } }
});

async function main() {
  const company = await prisma.company.findFirst({
    where: { code: "AXON" },
    include: { branches: true }
  });

  const bankAccount = await prisma.bankAccount.findFirst({
    where: { companyId: company.id, code: "0001" },
    include: { glAccount: true, branch: true }
  });

  console.log("=== 1. ALL BANK TRANSACTIONS ON FAYSAL BANK 0001 ===");
  const bankTxs = await prisma.bankTransaction.findMany({
    where: { bankAccountId: bankAccount.id },
    include: {
      journalEntry: {
        include: {
          lines: {
            include: {
              account: { select: { code: true, name: true } },
              customer: { select: { code: true, name: true } },
              supplier: { select: { code: true, name: true } }
            }
          }
        }
      }
    },
    orderBy: [
      { transactionDate: "asc" },
      { createdAt: "asc" }
    ]
  });

  let sumDep = 0;
  let sumWdr = 0;
  let running = 0;
  for (let i = 0; i < bankTxs.length; i++) {
    const tx = bankTxs[i];
    const dep = Number(tx.deposit);
    const wdr = Number(tx.withdrawal);
    sumDep += dep;
    sumWdr += wdr;
    running += (dep - wdr);
    console.log(`\nBT #${i + 1} [ID: ${tx.id}]`);
    console.log(`  Date: ${tx.transactionDate.toISOString().slice(0, 10)} | Type: ${tx.transactionType} | Reconciled: ${tx.isReconciled}`);
    console.log(`  Deposit: ${dep} | Withdrawal: ${wdr} | Running: ${running} | StoredRunningBal: ${tx.runningBalance}`);
    console.log(`  Reference: "${tx.reference}" | Description: "${tx.description}"`);
    if (tx.journalEntry) {
      const je = tx.journalEntry;
      console.log(`  Voucher: ${je.voucherNumber} | Status: ${je.status} | VoucherType: ${je.voucherType} | SourceMod: ${je.sourceModule} | SourceDoc: ${je.sourceDocumentNumber || "NONE"}`);
      console.log(`  Narration: "${je.narration}"`);
      je.lines.forEach((l, idx) => {
        console.log(`    Line ${idx + 1}: [Acc: ${l.account.code} - ${l.account.name}] Dr: ${l.baseDebit} | Cr: ${l.baseCredit} | Party: ${l.customer?.name || l.supplier?.name || "NONE"} | "${l.description}"`);
      });
    } else {
      console.log(`  Voucher: NONE`);
    }
  }
  console.log(`\nTOTAL DEPOSITS: ${sumDep} | TOTAL WITHDRAWALS: ${sumWdr} | NET BANK BALANCE: ${sumDep - sumWdr}`);

  console.log("\n=== 2. INVESTIGATE VOUCHERS: ISB-RC-15, 16, 17, 18 AND ISB-RCR-03, 04 ===");
  const targetNumbers = [
    "ISB-RC-FY2026-27-000015",
    "ISB-RC-FY2026-27-000016",
    "ISB-RC-FY2026-27-000017",
    "ISB-RC-FY2026-27-000018",
    "ISB-RCR-FY2026-27-000003",
    "ISB-RCR-FY2026-27-000004"
  ];

  for (const num of targetNumbers) {
    console.log(`\n-------------------------------------------------------------`);
    console.log(`🔍 INVESTIGATING: ${num}`);
    console.log(`-------------------------------------------------------------`);
    
    // Look up Payment
    const payment = await prisma.payment.findFirst({
      where: { paymentNumber: num },
      include: {
        customer: true,
        bankAccount: true,
        journalEntry: {
          include: {
            lines: {
              include: {
                account: { select: { code: true, name: true } },
                customer: { select: { code: true, name: true } }
              }
            }
          }
        },
        allocations: {
          include: { salesInvoice: true }
        }
      }
    });

    if (payment) {
      console.log(`PAYMENT RECORD:`);
      console.log(`  ID: ${payment.id}`);
      console.log(`  Number: ${payment.paymentNumber}`);
      console.log(`  Payment Date: ${payment.paymentDate.toISOString().slice(0, 10)}`);
      console.log(`  Created At: ${payment.createdAt.toISOString()}`);
      console.log(`  Amount: ${payment.amount}`);
      console.log(`  Status: ${payment.status}`);
      console.log(`  Customer: ${payment.customer?.name} (${payment.customer?.code})`);
      console.log(`  Bank Account: ${payment.bankAccount?.bankName} (${payment.bankAccount?.code})`);
      console.log(`  Reference Number: "${payment.referenceNumber}"`);
      console.log(`  Notes: "${payment.notes}"`);
      console.log(`  ReversalOfId: ${payment.reversalOfId}`);
      console.log(`  ReversedAt: ${payment.reversedAt?.toISOString()}`);
      console.log(`  Allocations Count: ${payment.allocations.length}`);
      payment.allocations.forEach((al, idx) => {
        console.log(`    Alloc #${idx + 1}: Sales Invoice: ${al.salesInvoice?.invoiceNumber} (Total: ${al.salesInvoice?.grandTotal}, BalanceDue: ${al.salesInvoice?.balanceDue}), Allocated Amount: ${al.amount}`);
      });
      if (payment.journalEntry) {
        console.log(`  Linked Journal Voucher: ${payment.journalEntry.voucherNumber} (Status: ${payment.journalEntry.status}, Date: ${payment.journalEntry.postingDate.toISOString().slice(0, 10)})`);
        console.log(`    Narration: "${payment.journalEntry.narration}"`);
        payment.journalEntry.lines.forEach((jl, idx) => {
          console.log(`    JL #${idx + 1}: [${jl.account.code} - ${jl.account.name}] Dr: ${jl.baseDebit} | Cr: ${jl.baseCredit} | Party: ${jl.customer?.name || "NONE"}`);
        });
      }
    } else {
      console.log(`No Payment record found with number: ${num}`);
    }

    // Look up JournalEntry directly
    const je = await prisma.journalEntry.findFirst({
      where: { voucherNumber: num },
      include: {
        lines: {
          include: {
            account: { select: { code: true, name: true } },
            customer: { select: { code: true, name: true } },
            bankAccount: { select: { code: true, bankName: true } }
          }
        }
      }
    });

    if (je) {
      console.log(`JOURNAL ENTRY RECORD:`);
      console.log(`  ID: ${je.id}`);
      console.log(`  Voucher Number: ${je.voucherNumber}`);
      console.log(`  Posting Date: ${je.postingDate.toISOString().slice(0, 10)}`);
      console.log(`  Created At: ${je.createdAt.toISOString()}`);
      console.log(`  Voucher Type: ${je.voucherType} | Status: ${je.status}`);
      console.log(`  Source: Module=${je.sourceModule}, DocType=${je.sourceDocumentType}, DocId=${je.sourceDocumentId}, DocNum=${je.sourceDocumentNumber}`);
      console.log(`  ReversalOfId: ${je.reversalOfId}`);
      console.log(`  Narration: "${je.narration}"`);
      console.log(`  Ref Document: "${je.referenceDocument}"`);
      je.lines.forEach((jl, idx) => {
        console.log(`    JL #${idx + 1}: [${jl.account.code} - ${jl.account.name}] Dr: ${jl.baseDebit} | Cr: ${jl.baseCredit} | Party: ${jl.customer?.name || "NONE"} | Bank: ${jl.bankAccount?.bankName || "NONE"}`);
      });
    } else {
      console.log(`No JournalEntry record found with voucherNumber: ${num}`);
    }

    // Look up Audits
    const audits = await prisma.auditLog.findMany({
      where: {
        companyId: company.id,
        entityReference: num
      },
      orderBy: { createdAt: "asc" }
    });
    console.log(`Audit Logs (${audits.length}):`);
    audits.forEach(a => {
      console.log(`  [${a.createdAt.toISOString()}] Action: ${a.action} | Prev: ${JSON.stringify(a.previousValues)} | New: ${JSON.stringify(a.newValues)} | Meta: ${JSON.stringify(a.metadata)}`);
    });
  }

  console.log("\n=== 3. INVESTIGATE CASH TRANSFERS & CONTRA VOUCHERS ===");
  const targetContra = [
    "ISB-JV-FY2026-27-000002",
    "ISB-JV-FY2026-27-000004",
    "ISB-JV-FY2026-27-000005",
    "ISB-JV-FY2026-27-000006"
  ];
  for (const num of targetContra) {
    console.log(`\n-------------------------------------------------------------`);
    console.log(`🔍 CONTRA VOUCHER: ${num}`);
    console.log(`-------------------------------------------------------------`);
    const je = await prisma.journalEntry.findFirst({
      where: { voucherNumber: num },
      include: {
        lines: {
          include: {
            account: { select: { code: true, name: true } },
            bankAccount: { select: { code: true, bankName: true } }
          }
        }
      }
    });
    if (je) {
      console.log(`  ID: ${je.id}`);
      console.log(`  Voucher Number: ${je.voucherNumber}`);
      console.log(`  Posting Date: ${je.postingDate.toISOString().slice(0, 10)}`);
      console.log(`  Created At: ${je.createdAt.toISOString()}`);
      console.log(`  Voucher Type: ${je.voucherType} | Status: ${je.status}`);
      console.log(`  Source: Module=${je.sourceModule}, DocType=${je.sourceDocumentType}, DocId=${je.sourceDocumentId}, DocNum=${je.sourceDocumentNumber}`);
      console.log(`  Narration: "${je.narration}"`);
      console.log(`  Ref Document: "${je.referenceDocument}"`);
      je.lines.forEach((jl, idx) => {
        console.log(`    Line #${idx + 1}: [Acc: ${jl.account.code} - ${jl.account.name}] Dr: ${jl.baseDebit} | Cr: ${jl.baseCredit} | Bank: ${jl.bankAccount?.bankName || "NONE"} | "${jl.description}"`);
      });
    }
  }

  console.log("\n=== 4. GL ACCOUNT 1000 (CASH ON HAND) SUMMARY ===");
  const gl1000 = await prisma.account.findFirst({
    where: { companyId: company.id, code: "1000" }
  });
  const lines1000 = await prisma.journalEntryLine.findMany({
    where: { accountId: gl1000.id, entry: { status: "POSTED" } },
    include: { entry: { select: { voucherNumber: true, voucherType: true, postingDate: true, narration: true } } },
    orderBy: { entry: { postingDate: "asc" } }
  });
  let sumDr1000 = 0;
  let sumCr1000 = 0;
  lines1000.forEach(l => {
    sumDr1000 += Number(l.baseDebit);
    sumCr1000 += Number(l.baseCredit);
  });
  console.log(`Account 1000 Lines: ${lines1000.length} | Total Dr: ${sumDr1000} | Total Cr: ${sumCr1000} | Net Cash: ${sumDr1000 - sumCr1000}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
