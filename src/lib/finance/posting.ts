import "server-only";

import {
  CashFlowActivity,
  JournalStatus,
  JournalType,
  PeriodStatus,
  Prisma,
  type JournalEntry,
} from "@prisma/client";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { decimal, moneyString, zero } from "@/lib/finance/money";
import { assertApprovalPolicy } from "@/lib/policies";
import { assertMakerChecker, assertSegregationOfDuties } from "@/lib/operating-mode";

export type JournalLineDraft = {
  accountId: string;
  description: string;
  debit: string;
  credit: string;
  currencyCode?: string;
  exchangeRate?: string;
  costCenterId?: string | null;
  departmentId?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  bankAccountId?: string | null;
  salespersonId?: string | null;
  invoiceNumber?: string | null;
  dueDate?: string | null;
};

export type JournalDraftInput = {
  branchId: string;
  postingDate: string;
  voucherDate?: string;
  voucherType?: JournalType;
  cashFlowActivity?: CashFlowActivity;
  narration: string;
  referenceDocument?: string | null;
  sourceModule?: string;
  sourceDocumentType?: string | null;
  sourceDocumentId?: string | null;
  sourceDocumentNumber?: string | null;
  idempotencyKey?: string | null;
  costCenterId?: string | null;
  departmentId?: string | null;
  lines: JournalLineDraft[];
};

type ActorContext = {
  companyId: string;
  userId: string;
  currencyCode: string;
  permissions?: string[];
  overrideReason?: string;
};

type LockedJournal = NonNullable<Awaited<ReturnType<typeof getJournalForWorkflow>>>;

function dateOnly(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(422, "INVALID_DATE", `${label} must use YYYY-MM-DD format.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ApiError(422, "INVALID_DATE", `${label} is not a valid calendar date.`);
  }
  return parsed;
}

async function issueVoucherNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
  branchId: string,
  fiscalYear: string,
  documentType = "JOURNAL",
) {
  const branch = await tx.branch.findFirst({
    where: { id: branchId, companyId, isActive: true },
    select: { documentPrefix: true },
  });
  if (!branch) throw new ApiError(404, "BRANCH_NOT_FOUND", "The selected branch is not available.");

  await tx.documentSequence.upsert({
    where: { companyId_branchId_documentType_fiscalYear: { companyId, branchId, documentType, fiscalYear } },
    create: {
      companyId,
      branchId,
      documentType,
      fiscalYear,
      prefix: `${branch.documentPrefix}-${documentType === "JOURNAL_REVERSAL" ? "RV" : "JV"}`,
      nextValue: 1n,
      padding: 6,
    },
    update: {},
  });

  const issued = await tx.$queryRaw<Array<{ issuedValue: bigint; prefix: string; padding: number }>>(Prisma.sql`
    UPDATE "DocumentSequence"
       SET "nextValue" = "nextValue" + 1,
           "version" = "version" + 1,
           "updatedAt" = CURRENT_TIMESTAMP
     WHERE "companyId" = ${companyId}::uuid
       AND "branchId" = ${branchId}::uuid
       AND "documentType" = ${documentType}
       AND "fiscalYear" = ${fiscalYear}
    RETURNING ("nextValue" - 1) AS "issuedValue", "prefix", "padding"
  `);
  const row = issued[0];
  if (!row) throw new ApiError(409, "SEQUENCE_CONFLICT", "A voucher number could not be reserved.");
  return `${row.prefix}-${fiscalYear}-${row.issuedValue.toString().padStart(row.padding, "0")}`;
}

async function getJournalForWorkflow(tx: Prisma.TransactionClient, id: string, companyId: string) {
  return tx.journalEntry.findFirst({
    where: { id, companyId },
    include: {
      lines: {
        include: {
          account: { select: { code: true, name: true, accountType: true } },
        },
        orderBy: { lineNumber: "asc" },
      },
      period: true,
      branch: { select: { code: true, name: true } },
    },
  });
}

async function lockJournal(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "JournalEntry" WHERE "id" = ${id}::uuid FOR UPDATE`);
}

function assertBalanced(journal: LockedJournal) {
  if (journal.lines.length < 2) {
    throw new ApiError(422, "JOURNAL_TOO_SHORT", "A journal requires at least two lines.");
  }
  const debit = journal.lines.reduce((total, line) => total.plus(line.baseDebit), zero());
  const credit = journal.lines.reduce((total, line) => total.plus(line.baseCredit), zero());
  if (debit.lte(0) || !debit.equals(credit)) {
    throw new ApiError(422, "UNBALANCED_JOURNAL", "Journal debits and credits must be equal and greater than zero.", {
      debit: moneyString(debit),
      credit: moneyString(credit),
    });
  }
  return { debit, credit };
}

async function addAudit(
  tx: Prisma.TransactionClient,
  actor: ActorContext,
  journal: Pick<JournalEntry, "id" | "voucherNumber" | "branchId">,
  action: string,
  previousStatus: JournalStatus | null,
  nextStatus: JournalStatus,
  metadata?: Prisma.InputJsonValue,
) {
  await tx.auditLog.create({
    data: {
      companyId: actor.companyId,
      actorId: actor.userId,
      branchId: journal.branchId,
      action,
      module: "finance",
      entityType: "JournalEntry",
      entityId: journal.id,
      entityReference: journal.voucherNumber,
      previousValues: previousStatus ? { status: previousStatus } : undefined,
      newValues: { status: nextStatus },
      metadata,
    },
  });
}

export async function createJournalDraft(actor: ActorContext, input: JournalDraftInput) {
  const postingDate = dateOnly(input.postingDate, "Posting date");
  const voucherDate = dateOnly(input.voucherDate || input.postingDate, "Voucher date");
  if (input.lines.length < 2) throw new ApiError(422, "JOURNAL_TOO_SHORT", "A journal requires at least two lines.");

  return prisma.$transaction(
    async (tx) => {
      if (input.idempotencyKey) {
        const existing = await tx.journalEntry.findUnique({
          where: {
            companyId_sourceModule_idempotencyKey: {
              companyId: actor.companyId,
              sourceModule: input.sourceModule || "MANUAL",
              idempotencyKey: input.idempotencyKey,
            },
          },
          include: { lines: { orderBy: { lineNumber: "asc" } } },
        });
        if (existing) return existing;
      }

      const period = await tx.accountingPeriod.findFirst({
        where: {
          companyId: actor.companyId,
          startDate: { lte: postingDate },
          endDate: { gte: postingDate },
          status: PeriodStatus.OPEN,
        },
        include: { fiscalYear: { select: { code: true } } },
      });
      if (!period) throw new ApiError(409, "PERIOD_NOT_OPEN", "No open accounting period contains the posting date.");

      const branch = await tx.branch.findFirst({
        where: { id: input.branchId, companyId: actor.companyId, isActive: true },
        select: { id: true },
      });
      if (!branch) throw new ApiError(404, "BRANCH_NOT_FOUND", "The selected branch is not available.");

      const uniqueAccountIds = [...new Set(input.lines.map((line) => line.accountId))];
      const accounts = await tx.account.findMany({
        where: { id: { in: uniqueAccountIds }, companyId: actor.companyId, isActive: true },
        select: { id: true, allowManualJournal: true, branchId: true, code: true },
      });
      if (accounts.length !== uniqueAccountIds.length) {
        throw new ApiError(422, "INVALID_ACCOUNT", "One or more journal accounts are unavailable.");
      }
      const accountMap = new Map(accounts.map((account) => [account.id, account]));
      const sourceModule = input.sourceModule || "MANUAL";
      if (sourceModule === "MANUAL") {
        const protectedAccount = accounts.find((account) => !account.allowManualJournal);
        if (protectedAccount) {
          throw new ApiError(422, "CONTROL_ACCOUNT", `Account ${protectedAccount.code} accepts postings only from its source module.`);
        }
      }

      let totalDebit = zero();
      let totalCredit = zero();
      const lines = input.lines.map((line, index) => {
        const debit = decimal(line.debit || "0");
        const credit = decimal(line.credit || "0");
        if (!((debit.gt(0) && credit.isZero()) || (credit.gt(0) && debit.isZero()))) {
          throw new ApiError(422, "INVALID_JOURNAL_LINE", `Line ${index + 1} must contain one positive debit or credit.`);
        }
        const exchangeRate = new Prisma.Decimal(line.exchangeRate || "1").toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP);
        if (exchangeRate.lte(0)) throw new ApiError(422, "INVALID_EXCHANGE_RATE", `Line ${index + 1} has an invalid exchange rate.`);
        const baseDebit = debit.times(exchangeRate).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
        const baseCredit = credit.times(exchangeRate).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
        totalDebit = totalDebit.plus(baseDebit);
        totalCredit = totalCredit.plus(baseCredit);
        const account = accountMap.get(line.accountId)!;
        if (account.branchId && account.branchId !== input.branchId) {
          throw new ApiError(422, "ACCOUNT_SCOPE_MISMATCH", `Account ${account.code} is assigned to another branch.`);
        }
        return {
          accountId: line.accountId,
          branchId: input.branchId,
          costCenterId: line.costCenterId || input.costCenterId || null,
          departmentId: line.departmentId || input.departmentId || null,
          customerId: line.customerId || null,
          supplierId: line.supplierId || null,
          bankAccountId: line.bankAccountId || null,
          salespersonId: line.salespersonId || null,
          lineNumber: index + 1,
          description: line.description.trim(),
          debit,
          credit,
          currencyCode: line.currencyCode || actor.currencyCode,
          exchangeRate,
          baseDebit,
          baseCredit,
          invoiceNumber: line.invoiceNumber || null,
          dueDate: line.dueDate ? dateOnly(line.dueDate, `Line ${index + 1} due date`) : null,
        };
      });
      if (totalDebit.lte(0) || !totalDebit.equals(totalCredit)) {
        throw new ApiError(422, "UNBALANCED_JOURNAL", "Journal debits and credits must be equal and greater than zero.", {
          debit: moneyString(totalDebit),
          credit: moneyString(totalCredit),
        });
      }

      const voucherNumber = await issueVoucherNumber(tx, actor.companyId, input.branchId, period.fiscalYear.code);
      const journal = await tx.journalEntry.create({
        data: {
          companyId: actor.companyId,
          branchId: input.branchId,
          periodId: period.id,
          costCenterId: input.costCenterId || null,
          departmentId: input.departmentId || null,
          voucherNumber,
          voucherDate,
          postingDate,
          voucherType: input.voucherType || JournalType.GENERAL,
          cashFlowActivity: input.cashFlowActivity || CashFlowActivity.NONE,
          status: JournalStatus.DRAFT,
          narration: input.narration.trim(),
          referenceDocument: input.referenceDocument || null,
          sourceModule,
          sourceDocumentType: input.sourceDocumentType || null,
          sourceDocumentId: input.sourceDocumentId || null,
          sourceDocumentNumber: input.sourceDocumentNumber || null,
          idempotencyKey: input.idempotencyKey || null,
          totalDebit,
          totalCredit,
          preparedById: actor.userId,
          lines: { create: lines },
        },
        include: { lines: { orderBy: { lineNumber: "asc" } } },
      });
      await addAudit(tx, actor, journal, "JOURNAL_DRAFT_CREATED", null, JournalStatus.DRAFT, {
        totalDebit: moneyString(totalDebit),
        totalCredit: moneyString(totalCredit),
        lineCount: lines.length,
      });
      return journal;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function submitJournal(actor: ActorContext, id: string) {
  return prisma.$transaction(async (tx) => {
    await lockJournal(tx, id);
    const journal = await getJournalForWorkflow(tx, id, actor.companyId);
    if (!journal) throw new ApiError(404, "JOURNAL_NOT_FOUND", "Journal voucher was not found.");
    if (journal.preparedById !== actor.userId) {
      throw new ApiError(403, "NOT_JOURNAL_PREPARER", "Only the preparer may submit this journal draft.");
    }
    if (journal.status !== JournalStatus.DRAFT) {
      throw new ApiError(409, "INVALID_JOURNAL_STATE", "Only a draft journal can be submitted.");
    }
    const totals = assertBalanced(journal);
    const updated = await tx.journalEntry.update({
      where: { id },
      data: { status: JournalStatus.SUBMITTED, totalDebit: totals.debit, totalCredit: totals.credit },
    });
    await addAudit(tx, actor, updated, "JOURNAL_SUBMITTED", JournalStatus.DRAFT, JournalStatus.SUBMITTED);
    return updated;
  });
}

export async function approveJournal(actor: ActorContext, id: string) {
  return prisma.$transaction(async (tx) => {
    await lockJournal(tx, id);
    const journal = await getJournalForWorkflow(tx, id, actor.companyId);
    if (!journal) throw new ApiError(404, "JOURNAL_NOT_FOUND", "Journal voucher was not found.");
    if (journal.status !== JournalStatus.SUBMITTED) {
      throw new ApiError(409, "INVALID_JOURNAL_STATE", "Only a submitted journal can be approved.");
    }
    await assertMakerChecker(tx, actor.companyId, journal.preparedById, actor.userId, "approve the same journal");
    const totals = assertBalanced(journal);
    const updated = await tx.journalEntry.update({
      where: { id },
      data: {
        status: JournalStatus.APPROVED,
        totalDebit: totals.debit,
        totalCredit: totals.credit,
        approvedById: actor.userId,
        approvedAt: new Date(),
      },
    });
    await addAudit(tx, actor, updated, "JOURNAL_APPROVED", JournalStatus.SUBMITTED, JournalStatus.APPROVED);
    return updated;
  });
}

export async function postJournal(actor: ActorContext, id: string) {
  return prisma.$transaction(
    async (tx) => {
      await lockJournal(tx, id);
      const journal = await getJournalForWorkflow(tx, id, actor.companyId);
      if (!journal) throw new ApiError(404, "JOURNAL_NOT_FOUND", "Journal voucher was not found.");
      if (journal.status === JournalStatus.POSTED) return journal;
      if (journal.status === JournalStatus.DRAFT) {
        await tx.journalEntry.update({
          where: { id },
          data: {
            status: JournalStatus.APPROVED,
            approvedById: journal.approvedById || actor.userId,
            approvedAt: journal.approvedAt || new Date(),
          },
        });
        journal.status = JournalStatus.APPROVED;
        journal.approvedById = journal.approvedById || actor.userId;
      }
      await assertSegregationOfDuties(tx, actor.companyId, actor.userId, journal.preparedById, journal.approvedById, "post this journal");
      await assertApprovalPolicy(tx, { actor, documentType: "JOURNAL", amount: journal.totalDebit, entityType: "JournalEntry", entityId: id, reference: journal.voucherNumber });
      if (journal.period.status !== PeriodStatus.OPEN) {
        throw new ApiError(409, "PERIOD_NOT_OPEN", "The journal period is no longer open.");
      }
      const totals = assertBalanced(journal);
      const postedAt = new Date();
      const posted = await tx.journalEntry.update({
        where: { id },
        data: {
          status: JournalStatus.POSTED,
          totalDebit: totals.debit,
          totalCredit: totals.credit,
          postedById: actor.userId,
          postedAt,
        },
      });

      for (const line of journal.lines) {
        if (!line.bankAccountId) continue;
        await tx.bankTransaction.upsert({
          where: { journalLineId: line.id },
          create: {
            companyId: actor.companyId,
            bankAccountId: line.bankAccountId,
            journalEntryId: journal.id,
            journalLineId: line.id,
            transactionType: journal.voucherType,
            transactionDate: journal.postingDate,
            bankReference: journal.referenceDocument,
            description: line.description,
            deposit: line.baseDebit,
            withdrawal: line.baseCredit,
          },
          update: {},
        });
      }
      await addAudit(tx, actor, posted, "JOURNAL_POSTED", JournalStatus.APPROVED, JournalStatus.POSTED, {
        postingDate: journal.postingDate.toISOString().slice(0, 10),
        total: moneyString(totals.debit),
      });
      return posted;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function reverseJournal(
  actor: ActorContext,
  id: string,
  input: { postingDate: string; reason: string; idempotencyKey: string },
) {
  const reversalDate = dateOnly(input.postingDate, "Reversal posting date");
  return prisma.$transaction(
    async (tx) => {
      await lockJournal(tx, id);
      const original = await getJournalForWorkflow(tx, id, actor.companyId);
      if (!original) throw new ApiError(404, "JOURNAL_NOT_FOUND", "Journal voucher was not found.");
      if (original.status !== JournalStatus.POSTED) {
        throw new ApiError(409, "INVALID_JOURNAL_STATE", "Only a posted journal can be reversed.");
      }
      await assertSegregationOfDuties(tx, actor.companyId, actor.userId, original.preparedById, original.approvedById, "reverse this journal");
      const existing = await tx.journalEntry.findUnique({
        where: {
          companyId_sourceModule_idempotencyKey: {
            companyId: actor.companyId,
            sourceModule: "JOURNAL_REVERSAL",
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) return existing;

      const period = await tx.accountingPeriod.findFirst({
        where: {
          companyId: actor.companyId,
          startDate: { lte: reversalDate },
          endDate: { gte: reversalDate },
          status: PeriodStatus.OPEN,
        },
        include: { fiscalYear: { select: { code: true } } },
      });
      if (!period) throw new ApiError(409, "PERIOD_NOT_OPEN", "No open accounting period contains the reversal date.");
      const voucherNumber = await issueVoucherNumber(tx, actor.companyId, original.branchId, period.fiscalYear.code, "JOURNAL_REVERSAL");
      const now = new Date();
      const reversal = await tx.journalEntry.create({
        data: {
          companyId: actor.companyId,
          branchId: original.branchId,
          periodId: period.id,
          costCenterId: original.costCenterId,
          departmentId: original.departmentId,
          voucherNumber,
          voucherDate: reversalDate,
          postingDate: reversalDate,
          voucherType: JournalType.REVERSAL,
          cashFlowActivity: original.cashFlowActivity,
          status: JournalStatus.DRAFT,
          narration: `Reversal of ${original.voucherNumber}: ${input.reason.trim()}`,
          referenceDocument: original.voucherNumber,
          sourceModule: "JOURNAL_REVERSAL",
          sourceDocumentType: "JournalEntry",
          sourceDocumentId: original.id,
          sourceDocumentNumber: original.voucherNumber,
          idempotencyKey: input.idempotencyKey,
          totalDebit: original.totalCredit,
          totalCredit: original.totalDebit,
          preparedById: original.preparedById,
          reversalOfId: original.id,
          lines: {
            create: original.lines.map((line) => ({
              accountId: line.accountId,
              branchId: line.branchId,
              costCenterId: line.costCenterId,
              departmentId: line.departmentId,
              customerId: line.customerId,
              supplierId: line.supplierId,
              bankAccountId: line.bankAccountId,
              salespersonId: line.salespersonId,
              lineNumber: line.lineNumber,
              description: `Reversal: ${line.description}`,
              debit: line.credit,
              credit: line.debit,
              currencyCode: line.currencyCode,
              exchangeRate: line.exchangeRate,
              baseDebit: line.baseCredit,
              baseCredit: line.baseDebit,
              invoiceNumber: line.invoiceNumber,
              dueDate: line.dueDate,
            })),
          },
        },
        include: { lines: true },
      });
      await tx.journalEntry.update({
        where: { id: reversal.id },
        data: {
          status: JournalStatus.APPROVED,
          approvedById: original.approvedById,
          approvedAt: now,
        },
      });
      const postedReversal = await tx.journalEntry.update({
        where: { id: reversal.id },
        data: { status: JournalStatus.POSTED, postedById: actor.userId, postedAt: now },
      });
      for (const line of reversal.lines) {
        if (!line.bankAccountId) continue;
        await tx.bankTransaction.create({
          data: {
            companyId: actor.companyId,
            bankAccountId: line.bankAccountId,
            journalEntryId: reversal.id,
            journalLineId: line.id,
            transactionType: JournalType.REVERSAL,
            transactionDate: reversalDate,
            bankReference: original.voucherNumber,
            description: line.description,
            deposit: line.baseDebit,
            withdrawal: line.baseCredit,
          },
        });
      }
      await tx.journalEntry.update({
        where: { id: original.id },
        data: { status: JournalStatus.REVERSED, reversedById: actor.userId, reversedAt: now },
      });
      await addAudit(tx, actor, postedReversal, "JOURNAL_REVERSAL_POSTED", JournalStatus.DRAFT, JournalStatus.POSTED, {
        originalJournalId: original.id,
        originalVoucherNumber: original.voucherNumber,
        reason: input.reason,
      });
      return postedReversal;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
