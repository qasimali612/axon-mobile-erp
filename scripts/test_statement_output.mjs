import { PrismaClient } from "@prisma/client";

const cloudUrl =
  "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30";
const prisma = new PrismaClient({ datasources: { db: { url: cloudUrl } } });

async function main() {
  console.log("================================================================================");
  console.log("VERIFYING SUBLEDGER STATEMENT TRANSACTION ENRICHMENT WITH ITEMS & REMARKS");
  console.log("================================================================================\n");

  const company = await prisma.company.findFirst({ where: { code: "AXON" } });
  const customers = await prisma.customer.findMany({ where: { companyId: company.id } });

  for (const c of customers) {
    console.log(`\n=================== CUSTOMER: ${c.code} · ${c.name} ===================`);
    
    // Fetch AR journal lines for this customer
    const lines = await prisma.journalEntryLine.findMany({
      where: {
        customerId: c.id,
        account: { accountType: "ACCOUNTS_RECEIVABLE" },
        entry: { companyId: company.id, status: "POSTED" },
      },
      include: {
        entry: true,
      },
      orderBy: { entry: { postingDate: "asc" } },
    });

    console.log(`Found ${lines.length} AR transaction lines.`);

    for (const l of lines) {
      console.log(`\n- Date: ${l.entry.postingDate.toISOString().slice(0, 10)} | Voucher: ${l.entry.voucherNumber}`);
      console.log(`  Module: ${l.entry.sourceModule} | DocType: ${l.entry.sourceDocumentType} | DocId: ${l.entry.sourceDocumentId}`);

      if (l.entry.sourceDocumentType === "SalesInvoice" && l.entry.sourceDocumentId) {
        const inv = await prisma.salesInvoice.findUnique({
          where: { id: l.entry.sourceDocumentId },
          include: {
            lines: {
              include: {
                product: { select: { name: true } },
                variant: { select: { name: true } },
                units: { include: { stockUnit: { include: { identifiers: true } } } },
              },
            },
          },
        });
        if (inv) {
          console.log(`  [INVOICE ${inv.invoiceNumber} ITEMS]`);
          for (const item of inv.lines) {
            const imeis = item.units.flatMap((u) => (u.stockUnit?.identifiers || []).map((i) => i.value));
            const imeiStr = imeis.length ? ` [IMEI: ${imeis.join(", ")}]` : "";
            console.log(`    • ${item.product.name} (${item.variant?.name}) x ${item.quantity.toString()} @ Rs. ${Number(item.unitPrice).toLocaleString()}${imeiStr}`);
          }
          if (inv.notes) console.log(`    Remarks: ${inv.notes}`);
        }
      } else if (l.entry.sourceDocumentType === "Payment" && l.entry.sourceDocumentId) {
        const pmt = await prisma.payment.findUnique({
          where: { id: l.entry.sourceDocumentId },
          include: {
            paymentMethod: true,
            bankAccount: true,
            cashAccount: true,
            allocations: { include: { salesInvoice: true } },
          },
        });
        if (pmt) {
          const method = pmt.paymentMethod?.name || pmt.bankAccount?.bankName || pmt.cashAccount?.name || "Cash";
          const allocs = pmt.allocations.map((a) => `${a.salesInvoice?.invoiceNumber} (Rs. ${Number(a.amount).toLocaleString()})`).join(", ");
          console.log(`  [PAYMENT ${pmt.paymentNumber}] Method: ${method} | Settled: ${allocs} | Ref: ${pmt.reference || "—"} | Remarks: ${pmt.notes || "—"}`);
        }
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
