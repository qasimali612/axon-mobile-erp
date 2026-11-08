import "server-only";

import {
  CashFlowActivity,
  JournalStatus,
  JournalType,
  PeriodStatus,
  Prisma,
} from "@prisma/client";
import { ApiError } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/document-sequence";
import { decimal, moneyString, zero } from "@/lib/finance/money";
import { isSingleUserMode } from "@/lib/operating-mode";

export type OperationalActor = {
  companyId: string;
  userId: string;
  currencyCode: string;
  /** Effective permission codes of the acting user; when present, commercial policies are enforced. */
  permissions?: string[];
  /** Written justification supplied with a deliberate policy override. */
  overrideReason?: string;
};

export type SourceJournalLine = {
  accountId: string;
  description: string;
  debit?: Prisma.Decimal | string;
  credit?: Prisma.Decimal | string;
  customerId?: string | null;
  supplierId?: string | null;
  bankAccountId?: string | null;
  salespersonId?: string | null;
  invoiceNumber?: string | null;
  dueDate?: Date | null;
};

export async function requireOpenPeriod(
  tx: Prisma.TransactionClient,
  companyId: string,
  postingDate: Date,
) {
  const period = await tx.accountingPeriod.findFirst({
    where: {
      companyId,
      status: PeriodStatus.OPEN,
      startDate: { lte: postingDate },
      endDate: { gte: postingDate },
    },
    include: { fiscalYear: { select: { code: true } } },
  });
  if (!period) {
    throw new ApiError(409, "PERIOD_NOT_OPEN", "No open accounting period contains the posting date.");
  }
  return period;
}

export async function requirePostingAccount(
  tx: Prisma.TransactionClient,
  input: { companyId: string; branchId: string; accountType: string },
) {
  const candidates = await tx.account.findMany({
    where: {
      companyId: input.companyId,
      accountType: input.accountType,
      isActive: true,
      OR: [{ branchId: input.branchId }, { branchId: null }],
    },
    select: { id: true, code: true, name: true, branchId: true },
    orderBy: { code: "asc" },
  });
  const branchSpecific = candidates.filter((candidate) => candidate.branchId === input.branchId);
  const eligible = branchSpecific.length ? branchSpecific : candidates.filter((candidate) => candidate.branchId === null);
  if (eligible.length !== 1) {
    throw new ApiError(
      409,
      "POSTING_ACCOUNT_CONFIGURATION",
      eligible.length
        ? `More than one ${input.accountType} posting account is configured for this branch.`
        : `No active ${input.accountType} posting account is configured for this branch.`,
    );
  }
  return eligible[0];
}

export async function allocateOperationalNumber(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    branchId: string;
    postingDate: Date;
    documentType: string;
    suffix: string;
  },
) {
  const [period, branch] = await Promise.all([
    requireOpenPeriod(tx, input.companyId, input.postingDate),
    tx.branch.findFirst({
      where: { id: input.branchId, companyId: input.companyId, isActive: true },
      select: { documentPrefix: true },
    }),
  ]);
  if (!branch) throw new ApiError(404, "BRANCH_NOT_FOUND", "The selected branch is not available.");
  const number = await nextDocumentNumber(tx, {
    companyId: input.companyId,
    branchId: input.branchId,
    documentType: input.documentType,
    fiscalYear: period.fiscalYear.code,
    prefix: `${branch.documentPrefix}-${input.suffix}`,
  });
  return { number, period };
}

export async function postOperationalJournal(
  tx: Prisma.TransactionClient,
  input: {
    actor: OperationalActor;
    branchId: string;
    postingDate: Date;
    preparedById: string;
    approvedById: string;
    documentType: string;
    voucherSuffix: string;
    sourceModule: string;
    sourceDocumentType: string;
    sourceDocumentId: string;
    sourceDocumentNumber: string;
    idempotencyKey: string;
    narration: string;
    referenceDocument?: string | null;
    voucherType?: JournalType;
    reversalOfJournalId?: string | null;
    allowApproverPosting?: boolean;
    lines: SourceJournalLine[];
  },
) {
  const singleUser = await isSingleUserMode(tx, input.actor.companyId);
  if (!singleUser) {
    if (
      input.preparedById === input.approvedById ||
      input.preparedById === input.actor.userId ||
      (!input.allowApproverPosting && input.approvedById === input.actor.userId)
    ) {
      throw new ApiError(
        409,
        "SEGREGATION_OF_DUTIES",
        input.allowApproverPosting
          ? "The preparer must differ from the approving/posting officer."
          : "The preparer, approver, and posting officer must be three different users.",
      );
    }
  }
  const existing = await tx.journalEntry.findUnique({
    where: {
      companyId_sourceModule_idempotencyKey: {
        companyId: input.actor.companyId,
        sourceModule: input.sourceModule,
        idempotencyKey: input.idempotencyKey,
      },
    },
    include: { lines: true },
  });
  if (existing) {
    if (existing.status !== JournalStatus.POSTED || existing.sourceDocumentId !== input.sourceDocumentId) {
      throw new ApiError(409, "JOURNAL_IDEMPOTENCY_CONFLICT", "The journal idempotency key belongs to another posting attempt.");
    }
    return existing;
  }

  if (input.lines.length < 2) throw new ApiError(422, "JOURNAL_TOO_SHORT", "A source journal requires at least two lines.");
  let totalDebit = zero();
  let totalCredit = zero();
  const preparedLines = input.lines.map((line, index) => {
    const debit = decimal(line.debit || "0");
    const credit = decimal(line.credit || "0");
    if (!((debit.gt(0) && credit.isZero()) || (credit.gt(0) && debit.isZero()))) {
      throw new ApiError(422, "INVALID_JOURNAL_LINE", `Source journal line ${index + 1} must be one-sided and positive.`);
    }
    totalDebit = totalDebit.plus(debit);
    totalCredit = totalCredit.plus(credit);
    return {
      accountId: line.accountId,
      branchId: input.branchId,
      lineNumber: index + 1,
      description: line.description,
      debit,
      credit,
      currencyCode: input.actor.currencyCode,
      exchangeRate: new Prisma.Decimal(1),
      baseDebit: debit,
      baseCredit: credit,
      customerId: line.customerId || null,
      supplierId: line.supplierId || null,
      bankAccountId: line.bankAccountId || null,
      salespersonId: line.salespersonId || null,
      invoiceNumber: line.invoiceNumber || null,
      dueDate: line.dueDate || null,
    };
  });
  if (totalDebit.lte(0) || !totalDebit.equals(totalCredit)) {
    throw new ApiError(422, "UNBALANCED_SOURCE_JOURNAL", "Source journal debits and credits must be equal and positive.", {
      debit: moneyString(totalDebit),
      credit: moneyString(totalCredit),
    });
  }

  const accountIds = [...new Set(preparedLines.map((line) => line.accountId))];
  const validAccounts = await tx.account.count({
    where: {
      id: { in: accountIds },
      companyId: input.actor.companyId,
      isActive: true,
      OR: [{ branchId: input.branchId }, { branchId: null }],
    },
  });
  if (validAccounts !== accountIds.length) {
    throw new ApiError(422, "INVALID_POSTING_ACCOUNT", "One or more source posting accounts are unavailable in this branch.");
  }

  const { number: voucherNumber, period } = await allocateOperationalNumber(tx, {
    companyId: input.actor.companyId,
    branchId: input.branchId,
    postingDate: input.postingDate,
    documentType: input.documentType,
    suffix: input.voucherSuffix,
  });
  const journal = await tx.journalEntry.create({
    data: {
      companyId: input.actor.companyId,
      branchId: input.branchId,
      periodId: period.id,
      voucherNumber,
      voucherDate: input.postingDate,
      postingDate: input.postingDate,
      voucherType: input.voucherType || JournalType.SYSTEM,
      status: JournalStatus.DRAFT,
      narration: input.narration,
      referenceDocument: input.referenceDocument || input.sourceDocumentNumber,
      sourceModule: input.sourceModule,
      sourceDocumentType: input.sourceDocumentType,
      sourceDocumentId: input.sourceDocumentId,
      sourceDocumentNumber: input.sourceDocumentNumber,
      cashFlowActivity: CashFlowActivity.OPERATING,
      idempotencyKey: input.idempotencyKey,
      reversalOfId: input.reversalOfJournalId || null,
      totalDebit,
      totalCredit,
      preparedById: input.preparedById,
      lines: { create: preparedLines },
    },
    include: { lines: true },
  });
  const approvedAt = new Date();
  await tx.journalEntry.update({
    where: { id: journal.id },
    data: {
      status: JournalStatus.APPROVED,
      approvedById: input.approvedById,
      approvedAt,
    },
  });
  const posted = await tx.journalEntry.update({
    where: { id: journal.id },
    data: {
      status: JournalStatus.POSTED,
      postedById: input.actor.userId,
      postedAt: approvedAt,
    },
    include: { lines: true },
  });
  for (const line of posted.lines) {
    if (!line.bankAccountId) continue;
    await tx.bankTransaction.create({
      data: {
        companyId: input.actor.companyId,
        bankAccountId: line.bankAccountId,
        journalEntryId: posted.id,
        journalLineId: line.id,
        transactionType: input.voucherType || JournalType.SYSTEM,
        transactionDate: input.postingDate,
        bankReference: input.referenceDocument || input.sourceDocumentNumber,
        description: line.description,
        deposit: line.baseDebit,
        withdrawal: line.baseCredit,
      },
    });
  }
  if (input.reversalOfJournalId) {
    const reversed = await tx.journalEntry.updateMany({
      where: { id: input.reversalOfJournalId, companyId: input.actor.companyId, branchId: input.branchId, status: JournalStatus.POSTED },
      data: { status: JournalStatus.REVERSED, reversedById: input.actor.userId, reversedAt: approvedAt },
    });
    if (reversed.count !== 1) throw new ApiError(409, "ORIGINAL_JOURNAL_NOT_POSTED", "The source journal is not available for reversal.");
  }
  await appendAudit(
    {
      companyId: input.actor.companyId,
      actorId: input.actor.userId,
      branchId: input.branchId,
      action: "SOURCE_JOURNAL_POSTED",
      module: "finance",
      entityType: "JournalEntry",
      entityId: posted.id,
      entityReference: posted.voucherNumber,
      newValues: { status: JournalStatus.POSTED },
      metadata: {
        sourceModule: input.sourceModule,
        sourceDocumentType: input.sourceDocumentType,
        sourceDocumentId: input.sourceDocumentId,
        total: moneyString(totalDebit),
      },
    },
    tx,
  );
  return posted;
}

export async function reverseOperationalJournal(
  tx: Prisma.TransactionClient,
  input: {
    actor: OperationalActor;
    branchId: string;
    originalJournalId: string;
    postingDate: Date;
    sourceModule: string;
    sourceDocumentType: string;
    sourceDocumentId: string;
    sourceDocumentNumber: string;
    idempotencyKey: string;
    documentType: string;
    voucherSuffix: string;
    narration: string;
    referenceDocument?: string | null;
    allowApproverPosting?: boolean;
  },
) {
  const original = await tx.journalEntry.findFirst({
    where: {
      id: input.originalJournalId,
      companyId: input.actor.companyId,
      branchId: input.branchId,
      status: JournalStatus.POSTED,
    },
    include: { lines: { orderBy: { lineNumber: "asc" } } },
  });
  if (!original) {
    const existing = await tx.journalEntry.findFirst({
      where: {
        companyId: input.actor.companyId,
        branchId: input.branchId,
        reversalOfId: input.originalJournalId,
        sourceDocumentId: input.sourceDocumentId,
        status: JournalStatus.POSTED,
      },
      include: { lines: true },
    });
    if (existing) return existing;
    throw new ApiError(409, "ORIGINAL_JOURNAL_NOT_POSTED", "The source journal is not available for reversal.");
  }
  if (!original.preparedById || !original.approvedById) {
    throw new ApiError(409, "JOURNAL_APPROVAL_HISTORY_REQUIRED", "The source journal lacks complete preparation and approval history.");
  }

  const reversal = await postOperationalJournal(tx, {
    actor: input.actor,
    branchId: input.branchId,
    preparedById: original.preparedById,
    approvedById: original.approvedById,
    postingDate: input.postingDate,
    sourceModule: input.sourceModule,
    sourceDocumentType: input.sourceDocumentType,
    sourceDocumentId: input.sourceDocumentId,
    sourceDocumentNumber: input.sourceDocumentNumber,
    idempotencyKey: input.idempotencyKey,
    documentType: input.documentType,
    voucherSuffix: input.voucherSuffix,
    narration: input.narration,
    referenceDocument: input.referenceDocument,
    voucherType: JournalType.REVERSAL,
    reversalOfJournalId: original.id,
    allowApproverPosting: input.allowApproverPosting,
    lines: original.lines.map((line) => ({
      accountId: line.accountId,
      description: `Reversal: ${line.description}`,
      debit: line.baseCredit,
      credit: line.baseDebit,
      customerId: line.customerId,
      supplierId: line.supplierId,
      bankAccountId: line.bankAccountId,
      salespersonId: line.salespersonId,
      invoiceNumber: line.invoiceNumber,
      dueDate: line.dueDate,
    })),
  });
  await appendAudit(
    {
      companyId: input.actor.companyId,
      actorId: input.actor.userId,
      branchId: input.branchId,
      action: "OPERATIONAL_JOURNAL_REVERSED",
      module: "finance",
      entityType: "JournalEntry",
      entityId: original.id,
      entityReference: original.voucherNumber,
      previousValues: { status: JournalStatus.POSTED },
      newValues: { status: JournalStatus.REVERSED },
      metadata: {
        reversalJournalId: reversal.id,
        reversalVoucherNumber: reversal.voucherNumber,
        sourceDocumentType: input.sourceDocumentType,
        sourceDocumentId: input.sourceDocumentId,
      },
    },
    tx,
  );
  return reversal;
}
