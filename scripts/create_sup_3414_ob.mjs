import { PrismaClient, JournalType, JournalStatus } from "@prisma/client";

const cloudUrl = "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30";
const prisma = new PrismaClient({ datasources: { db: { url: cloudUrl } } });

async function main() {
  const company = await prisma.company.findFirst({ where: { code: 'AXON' } });
  const branch = await prisma.branch.findFirst({ where: { companyId: company.id, code: 'ISB' } });
  const supplier = await prisma.supplier.findFirst({ where: { code: 'SUP-3414' } });
  const apAccount = await prisma.account.findFirst({ where: { companyId: company.id, code: '2000' } });
  const equityAccount = await prisma.account.findFirst({ where: { companyId: company.id, code: '3000' } });
  const period = await prisma.accountingPeriod.findFirst({
    where: { companyId: company.id, status: 'OPEN', name: { contains: 'Nov 2026' } },
    include: { fiscalYear: true }
  });
  const membership = await prisma.companyMembership.findFirst({
    where: { companyId: company.id },
    include: { user: true }
  });

  const userId = membership.userId;
  const openingAmount = Number(supplier.openingBalance); // 140475
  console.log(`Creating Opening Balance Journal for ${supplier.name} (${supplier.code}): Rs. ${openingAmount}`);

  // Check if voucher already exists
  const existing = await prisma.journalEntry.findFirst({
    where: {
      companyId: company.id,
      sourceModule: 'SUPPLIER_OPENING_BALANCE',
      sourceDocumentId: supplier.id,
    }
  });

  if (existing) {
    console.log("Opening voucher already exists:", existing.voucherNumber, existing.status);
    return;
  }

  // Generate next voucher number for branch ISB
  const lastEntry = await prisma.journalEntry.findFirst({
    where: { companyId: company.id, voucherNumber: { startsWith: `${branch.code}-JV-${period.fiscalYear.code}` } },
    orderBy: { voucherNumber: 'desc' }
  });
  
  let nextSeq = 1;
  if (lastEntry) {
    const match = lastEntry.voucherNumber.match(/-(\d+)$/);
    if (match) nextSeq = parseInt(match[1], 10) + 1;
  }
  const voucherNumber = `${branch.code}-JV-${period.fiscalYear.code}-${String(nextSeq).padStart(6, '0')}`;
  console.log("Allocated Voucher Number:", voucherNumber);

  // Posting Date: 2026-11-01 (start of November, before transaction date 2026-11-16)
  const postingDate = new Date("2026-11-01T00:00:00.000Z");

  const entry = await prisma.journalEntry.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      periodId: period.id,
      voucherNumber,
      voucherType: JournalType.OPENING,
      postingDate,
      voucherDate: postingDate,
      narration: `Opening balance payable for supplier ${supplier.name} (${supplier.code})`,
      sourceModule: 'SUPPLIER_OPENING_BALANCE',
      sourceDocumentType: 'Supplier',
      sourceDocumentId: supplier.id,
      sourceDocumentNumber: supplier.code,
      status: JournalStatus.DRAFT,
      totalDebit: openingAmount,
      totalCredit: openingAmount,
      preparedById: userId,
      lines: {
        create: [
          {
            lineNumber: 1,
            accountId: apAccount.id,
            branchId: branch.id,
            supplierId: supplier.id,
            description: `Opening payable balance for ${supplier.name} (${supplier.code})`,
            debit: 0,
            credit: openingAmount,
            baseDebit: 0,
            baseCredit: openingAmount,
            currencyCode: 'PKR',
          },
          {
            lineNumber: 2,
            accountId: equityAccount.id,
            branchId: branch.id,
            description: `Opening balance equity offset for ${supplier.name}`,
            debit: openingAmount,
            credit: 0,
            baseDebit: openingAmount,
            baseCredit: 0,
            currencyCode: 'PKR',
          }
        ]
      }
    },
    include: { lines: true }
  });

  console.log("Created Draft Opening Balance JV:", entry.voucherNumber, "with", entry.lines.length, "lines");

  const posted = await prisma.journalEntry.update({
    where: { id: entry.id },
    data: {
      status: JournalStatus.POSTED,
      approvedById: userId,
      approvedAt: new Date(),
      postedById: userId,
      postedAt: new Date(),
    }
  });

  console.log("Successfully posted Opening Balance JV:", posted.voucherNumber, "status:", posted.status);
  await prisma.$disconnect();
}
main();
