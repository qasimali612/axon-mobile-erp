import "server-only";

import { CashFlowActivity, JournalStatus, JournalType, Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { decimal, moneyString, zero } from "@/lib/finance/money";
import { assertMakerChecker } from "@/lib/operating-mode";
import { allocateOperationalNumber } from "@/lib/operations/accounting";

export type SystemJournalActor = { companyId: string; userId: string; currencyCode: string };

export type SystemJournalLine = { accountId: string; description: string; debit?: string | Prisma.Decimal; credit?: string | Prisma.Decimal };

export type SystemJournalInput = {
  actor: SystemJournalActor;
  /** User who prepared the source document; must differ from the poster for maker-checker. */
  preparedById: string;
  branchId: string;
  postingDate: Date;
  sourceModule: string;
  sourceDocumentType: string;
  sourceDocumentId: string;
  sourceDocumentNumber: string;
  narration: string;
  reference: string;
  documentTypePrefix: string;
  numberSuffix: string;
  cashFlowActivity?: CashFlowActivity;
  lines: SystemJournalLine[];
  errorCodes?: { preparerRequired?: string; duplicate?: string; unbalanced?: string };
};

/**
 * Posts a balanced, immediately-posted SYSTEM journal for a finance module event.
 * These events are single-authority actions gated by their own permission, so the voucher is
 * written directly while the source document remains the audit anchor. Maker-checker is enforced
 * by requiring the source preparer to differ from the posting officer, and every event carries a
 * deterministic idempotency key so a retry can never double-post.
 */
export async function postSystemJournal(tx: Prisma.TransactionClient, input: SystemJournalInput) {
  const codes = {
    preparerRequired: input.errorCodes?.preparerRequired ?? "POSTING_PREPARER_REQUIRED",
    duplicate: input.errorCodes?.duplicate ?? "DUPLICATE_SYSTEM_JOURNAL",
    unbalanced: input.errorCodes?.unbalanced ?? "UNBALANCED_SYSTEM_JOURNAL",
  };
  if (!input.preparedById) {
    throw new ApiError(409, codes.preparerRequired, "This record has no recorded preparer, so its journal cannot be posted.");
  }
  await assertMakerChecker(tx, input.actor.companyId, input.preparedById, input.actor.userId, "approve and post its journal");

  const idempotencyKey = `${input.sourceDocumentType}:${input.sourceDocumentId}:${input.postingDate.toISOString().slice(0, 10)}`;
  const existing = await tx.journalEntry.findUnique({
    where: { companyId_sourceModule_idempotencyKey: { companyId: input.actor.companyId, sourceModule: input.sourceModule, idempotencyKey } },
    select: { id: true },
  });
  if (existing) throw new ApiError(409, codes.duplicate, "This event is already posted to the ledger.");

  let debitTotal = zero();
  let creditTotal = zero();
  const prepared = input.lines.map((line, index) => {
    const debit = decimal(line.debit ?? "0");
    const credit = decimal(line.credit ?? "0");
    if (!((debit.gt(0) && credit.isZero()) || (credit.gt(0) && debit.isZero()))) {
      throw new ApiError(422, "INVALID_JOURNAL_LINE", `Journal line ${index + 1} must be one-sided and positive.`);
    }
    debitTotal = debitTotal.plus(debit);
    creditTotal = creditTotal.plus(credit);
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
    };
  });
  if (debitTotal.lte(0) || !debitTotal.equals(creditTotal)) {
    throw new ApiError(422, codes.unbalanced, "Journal debits and credits must be equal and positive.", { debit: moneyString(debitTotal), credit: moneyString(creditTotal) });
  }
  const accountIds = [...new Set(prepared.map((line) => line.accountId))];
  const accounts = await tx.account.findMany({ where: { id: { in: accountIds }, companyId: input.actor.companyId, isActive: true }, select: { id: true } });
  if (accounts.length !== accountIds.length) {
    throw new ApiError(422, "INVALID_POSTING_ACCOUNT", "One or more posting accounts are inactive or outside this company.");
  }

  const { number, period } = await allocateOperationalNumber(tx, {
    companyId: input.actor.companyId,
    branchId: input.branchId,
    postingDate: input.postingDate,
    documentType: input.documentTypePrefix,
    suffix: input.numberSuffix,
  });

  // Journal lines are immutable once approved, so the voucher is created as a draft with its
  // lines and then moved to POSTED with the independent posting officer recorded.
  const draft = await tx.journalEntry.create({
    data: {
      companyId: input.actor.companyId,
      branchId: input.branchId,
      periodId: period.id,
      voucherNumber: number,
      voucherDate: input.postingDate,
      postingDate: input.postingDate,
      voucherType: JournalType.SYSTEM,
      status: JournalStatus.DRAFT,
      narration: input.narration,
      referenceDocument: input.reference,
      sourceModule: input.sourceModule,
      sourceDocumentType: input.sourceDocumentType,
      sourceDocumentId: input.sourceDocumentId,
      sourceDocumentNumber: input.sourceDocumentNumber,
      cashFlowActivity: input.cashFlowActivity ?? CashFlowActivity.OPERATING,
      idempotencyKey,
      totalDebit: debitTotal,
      totalCredit: creditTotal,
      preparedById: input.preparedById,
      lines: { create: prepared },
    },
    include: { lines: true },
  });

  return tx.journalEntry.update({
    where: { id: draft.id },
    data: { status: JournalStatus.POSTED, approvedById: input.actor.userId, postedById: input.actor.userId, approvedAt: new Date(), postedAt: new Date() },
    include: { lines: true },
  });
}
