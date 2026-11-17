import "server-only";

import { JournalStatus, JournalType, PeriodStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function syncPartyOpeningBalance(params: {
  kind: "supplier" | "customer";
  partyId: string;
  companyId: string;
  userId: string;
  branchId?: string | null;
}) {
  const { kind, partyId, companyId, userId } = params;

  const party = kind === "supplier"
    ? await prisma.supplier.findUnique({ where: { id: partyId } })
    : await prisma.customer.findUnique({ where: { id: partyId } });

  if (!party || !party.openingBalance) return null;
  const openingAmount = Number(party.openingBalance);
  if (!(openingAmount > 0)) return null;

  // Find or pick branch
  let branchId = params.branchId || party.branchId;
  if (!branchId) {
    const defaultBranch = await prisma.branch.findFirst({
      where: { companyId, isActive: true },
      orderBy: { code: "asc" },
    });
    branchId = defaultBranch?.id || null;
  }
  if (!branchId) return null;

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) return null;

  // Accounts
  const controlAccount = await prisma.account.findFirst({
    where: {
      companyId,
      accountType: kind === "supplier" ? "ACCOUNTS_PAYABLE" : "ACCOUNTS_RECEIVABLE",
      isActive: true,
    },
    orderBy: { code: "asc" },
  });

  const equityAccount = await prisma.account.findFirst({
    where: {
      companyId,
      accountClass: "EQUITY",
      isActive: true,
    },
    orderBy: { code: "asc" },
  });

  if (!controlAccount || !equityAccount) return null;

  // Open Accounting Period
  const period = await prisma.accountingPeriod.findFirst({
    where: { companyId, status: PeriodStatus.OPEN },
    include: { fiscalYear: true },
    orderBy: { startDate: "asc" },
  });
  if (!period) return null;

  // Check if opening journal already exists
  const existingJv = await prisma.journalEntry.findFirst({
    where: {
      companyId,
      sourceModule: kind === "supplier" ? "SUPPLIER_OPENING_BALANCE" : "CUSTOMER_OPENING_BALANCE",
      sourceDocumentId: party.id,
      status: { in: [JournalStatus.POSTED, JournalStatus.DRAFT] },
    },
    include: { lines: true },
  });

  if (existingJv) {
    // If already posted with exact amount, keep it
    if (existingJv.status === JournalStatus.POSTED && Number(existingJv.totalDebit) === openingAmount) {
      return existingJv;
    }
  }

  // Generate voucher number
  const lastEntry = await prisma.journalEntry.findFirst({
    where: { companyId, voucherNumber: { startsWith: `${branch.code}-JV-${period.fiscalYear.code}` } },
    orderBy: { voucherNumber: "desc" },
  });

  let nextSeq = 1;
  if (lastEntry) {
    const match = lastEntry.voucherNumber.match(/-(\d+)$/);
    if (match) nextSeq = parseInt(match[1], 10) + 1;
  }
  const voucherNumber = `${branch.code}-JV-${period.fiscalYear.code}-${String(nextSeq).padStart(6, "0")}`;
  const postingDate = period.startDate;

  const linesData = kind === "supplier"
    ? [
        {
          lineNumber: 1,
          accountId: controlAccount.id,
          branchId,
          supplierId: party.id,
          description: `Opening payable balance for ${party.name} (${party.code})`,
          debit: 0,
          credit: openingAmount,
          baseDebit: 0,
          baseCredit: openingAmount,
          currencyCode: "PKR",
        },
        {
          lineNumber: 2,
          accountId: equityAccount.id,
          branchId,
          description: `Opening balance equity offset for ${party.name}`,
          debit: openingAmount,
          credit: 0,
          baseDebit: openingAmount,
          baseCredit: 0,
          currencyCode: "PKR",
        },
      ]
    : [
        {
          lineNumber: 1,
          accountId: controlAccount.id,
          branchId,
          customerId: party.id,
          description: `Opening receivable balance for ${party.name} (${party.code})`,
          debit: openingAmount,
          credit: 0,
          baseDebit: openingAmount,
          baseCredit: 0,
          currencyCode: "PKR",
        },
        {
          lineNumber: 2,
          accountId: equityAccount.id,
          branchId,
          description: `Opening balance equity offset for ${party.name}`,
          debit: 0,
          credit: openingAmount,
          baseDebit: 0,
          baseCredit: openingAmount,
          currencyCode: "PKR",
        },
      ];

  // Database trigger requires DRAFT first then POSTED
  const draft = await prisma.journalEntry.create({
    data: {
      companyId,
      branchId,
      periodId: period.id,
      voucherNumber,
      voucherType: JournalType.OPENING,
      postingDate,
      voucherDate: postingDate,
      narration: `Opening balance ${kind === "supplier" ? "payable" : "receivable"} for ${party.name} (${party.code})`,
      sourceModule: kind === "supplier" ? "SUPPLIER_OPENING_BALANCE" : "CUSTOMER_OPENING_BALANCE",
      sourceDocumentType: kind === "supplier" ? "Supplier" : "Customer",
      sourceDocumentId: party.id,
      sourceDocumentNumber: party.code,
      status: JournalStatus.DRAFT,
      totalDebit: openingAmount,
      totalCredit: openingAmount,
      preparedById: userId,
      lines: { create: linesData },
    },
  });

  const posted = await prisma.journalEntry.update({
    where: { id: draft.id },
    data: {
      status: JournalStatus.POSTED,
      approvedById: userId,
      approvedAt: new Date(),
      postedById: userId,
      postedAt: new Date(),
    },
    include: { lines: true },
  });

  return posted;
}
