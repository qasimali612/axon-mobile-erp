import "server-only";

import { BankReconciliationStatus, JournalStatus, Prisma } from "@prisma/client";
import type { z } from "zod";
import { ApiError } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { decimal, moneyString, zero } from "@/lib/finance/money";
import { prisma } from "@/lib/prisma";
import type { bankAccountSchema, bankStatementSchema, statementMatchSchema } from "@/lib/finance/banking-validation";

export type BankAccountInput = z.infer<typeof bankAccountSchema>;
export type BankStatementInput = z.infer<typeof bankStatementSchema>;
export type StatementMatchInput = z.infer<typeof statementMatchSchema>;

type Actor = { companyId: string; userId: string; activeBranchId: string | null };
const EPSILON = decimal("0.005");

function dateOnly(value: string, label: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new ApiError(422, "INVALID_DATE", `${label} must be a valid date.`);
  return parsed;
}

async function lockStatement(tx: Prisma.TransactionClient, id: string, companyId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "BankStatement" WHERE "id" = ${id}::uuid AND "companyId" = ${companyId}::uuid FOR UPDATE`);
  return tx.bankStatement.findFirst({
    where: { id, companyId },
    include: { bankAccount: { select: { id: true, code: true, branchId: true, isActive: true, currencyCode: true } }, lines: { orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }] }, reconciliation: true },
  });
}

export async function createBankAccount(actor: Actor, input: BankAccountInput) {
  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findFirst({ where: { id: input.branchId, companyId: actor.companyId, isActive: true } });
    if (!branch) throw new ApiError(404, "BRANCH_NOT_FOUND", "The selected active branch was not found.");
    const glAccount = await tx.account.findFirst({ where: { id: input.glAccountId, companyId: actor.companyId, isActive: true } });
    if (!glAccount) throw new ApiError(422, "INVALID_GL_ACCOUNT", "Select an active asset account in this company.");
    if (glAccount.accountClass !== "ASSET") throw new ApiError(422, "INVALID_GL_ACCOUNT", "A bank account must post to an asset general ledger account.");
    const linked = await tx.bankAccount.findFirst({ where: { companyId: actor.companyId, glAccountId: glAccount.id } });
    if (linked) throw new ApiError(409, "GL_ACCOUNT_IN_USE", "This general ledger account is already linked to another bank account.");
    const account = await tx.bankAccount.create({
      data: {
        companyId: actor.companyId,
        branchId: input.branchId,
        glAccountId: glAccount.id,
        code: input.code,
        bankName: input.bankName,
        accountTitle: input.accountTitle,
        iban: input.iban || null,
        accountNumberLast4: input.accountNumberLast4 || null,
        bankBranchName: input.bankBranchName || null,
        currencyCode: input.currencyCode,
        isActive: input.isActive,
      },
    });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: input.branchId, action: "BANK_ACCOUNT_CREATED", module: "finance", entityType: "BankAccount", entityId: account.id, entityReference: account.code, newValues: { code: account.code, bankName: account.bankName, currencyCode: account.currencyCode, glAccount: glAccount.code } }, tx);
    return account;
  });
}

export async function updateBankAccount(actor: Actor, id: string, input: BankAccountInput) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.bankAccount.findFirst({ where: { id, companyId: actor.companyId } });
    if (!current) throw new ApiError(404, "BANK_ACCOUNT_NOT_FOUND", "Bank account was not found.");
    const glAccount = await tx.account.findFirst({ where: { id: input.glAccountId, companyId: actor.companyId, isActive: true } });
    if (!glAccount) throw new ApiError(422, "INVALID_GL_ACCOUNT", "Select an active asset account in this company.");
    if (glAccount.accountClass !== "ASSET") throw new ApiError(422, "INVALID_GL_ACCOUNT", "A bank account must post to an asset general ledger account.");
    if (glAccount.id !== current.glAccountId) {
      const [linked, posted] = await Promise.all([
        tx.bankAccount.findFirst({ where: { companyId: actor.companyId, glAccountId: glAccount.id, id: { not: id } } }),
        tx.bankTransaction.count({ where: { bankAccountId: id } }),
      ]);
      if (linked) throw new ApiError(409, "GL_ACCOUNT_IN_USE", "This general ledger account is already linked to another bank account.");
      if (posted) throw new ApiError(409, "BANK_ACCOUNT_GL_LOCKED", "The general ledger account cannot change once transactions post to this bank account.");
    }
    if (current.currencyCode !== input.currencyCode) {
      const posted = await tx.bankTransaction.count({ where: { bankAccountId: id } });
      if (posted) throw new ApiError(409, "BANK_ACCOUNT_CURRENCY_LOCKED", "The currency cannot change once transactions post to this bank account.");
    }
    const updated = await tx.bankAccount.update({
      where: { id },
      data: {
        branchId: input.branchId,
        glAccountId: glAccount.id,
        code: input.code,
        bankName: input.bankName,
        accountTitle: input.accountTitle,
        iban: input.iban || null,
        accountNumberLast4: input.accountNumberLast4 || null,
        bankBranchName: input.bankBranchName || null,
        currencyCode: input.currencyCode,
        isActive: input.isActive,
      },
    });
    await appendAudit({
      companyId: actor.companyId,
      actorId: actor.userId,
      branchId: input.branchId,
      action: "BANK_ACCOUNT_UPDATED",
      module: "finance",
      entityType: "BankAccount",
      entityId: updated.id,
      entityReference: updated.code,
      newValues: { code: updated.code, bankName: updated.bankName, isActive: updated.isActive },
      previousValues: { code: current.code, bankName: current.bankName, isActive: current.isActive },
    }, tx);
    return updated;
  });
}

export async function createBankStatement(actor: Actor, input: BankStatementInput) {
  const periodStart = dateOnly(input.periodStart, "Statement period start");
  const periodEnd = dateOnly(input.periodEnd, "Statement period end");
  return prisma.$transaction(async (tx) => {
    const account = await tx.bankAccount.findFirst({ where: { id: input.bankAccountId, companyId: actor.companyId } });
    if (!account) throw new ApiError(404, "BANK_ACCOUNT_NOT_FOUND", "The selected bank account was not found.");
    if (!account.isActive) throw new ApiError(409, "BANK_ACCOUNT_INACTIVE", "Statements cannot be imported for an inactive bank account.");
    const overlap = await tx.bankStatement.findFirst({ where: { bankAccountId: account.id, periodStart: { lte: periodEnd }, periodEnd: { gte: periodStart } } });
    if (overlap) throw new ApiError(409, "STATEMENT_PERIOD_OVERLAP", "A statement already exists for an overlapping period on this bank account.");
    const statement = await tx.bankStatement.create({
      data: {
        companyId: actor.companyId,
        bankAccountId: account.id,
        statementNumber: input.statementNumber || null,
        periodStart,
        periodEnd,
        openingBalance: decimal(input.openingBalance),
        closingBalance: decimal(input.closingBalance),
        importedFileName: input.importedFileName || null,
        lines: {
          create: input.lines.map((line) => ({
            transactionDate: dateOnly(line.transactionDate, "Statement line date"),
            valueDate: line.valueDate ? dateOnly(line.valueDate, "Value date") : null,
            reference: line.reference || null,
            description: line.description,
            deposit: decimal(line.deposit),
            withdrawal: decimal(line.withdrawal),
          })),
        },
      },
      include: { lines: true },
    });
    await appendAudit({
      companyId: actor.companyId,
      actorId: actor.userId,
      branchId: account.branchId,
      action: "BANK_STATEMENT_CREATED",
      module: "finance",
      entityType: "BankStatement",
      entityId: statement.id,
      entityReference: statement.statementNumber || `${input.periodStart}..${input.periodEnd}`,
      newValues: { bankAccount: account.code, periodStart: input.periodStart, periodEnd: input.periodEnd, closingBalance: moneyString(statement.closingBalance), lines: input.lines.length },
    }, tx);
    return statement;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** Posted ledger balance for a bank account up to and including a date. */
async function ledgerBalance(tx: Prisma.TransactionClient, companyId: string, bankAccountId: string, through: Date) {
  const totals = await tx.bankTransaction.aggregate({
    where: { companyId, bankAccountId, transactionDate: { lte: through }, journalEntry: { status: { in: [JournalStatus.POSTED, JournalStatus.REVERSED] } } },
    _sum: { deposit: true, withdrawal: true },
  });
  return (totals._sum.deposit ?? zero()).minus(totals._sum.withdrawal ?? zero());
}

async function outstandingTotals(tx: Prisma.TransactionClient, companyId: string, bankAccountId: string, through: Date) {
  const totals = await tx.bankTransaction.aggregate({
    where: { companyId, bankAccountId, transactionDate: { lte: through }, reconciliationStatus: "UNRECONCILED", journalEntry: { status: { in: [JournalStatus.POSTED, JournalStatus.REVERSED] } } },
    _sum: { deposit: true, withdrawal: true },
  });
  return { deposits: totals._sum.deposit ?? zero(), payments: totals._sum.withdrawal ?? zero() };
}

export async function matchStatementLine(actor: Actor, statementId: string, input: StatementMatchInput) {
  return prisma.$transaction(async (tx) => {
    const statement = await lockStatement(tx, statementId, actor.companyId);
    if (!statement) throw new ApiError(404, "BANK_STATEMENT_NOT_FOUND", "Bank statement was not found.");
    if (statement.reconciliation?.status === BankReconciliationStatus.COMPLETED) throw new ApiError(409, "RECONCILIATION_COMPLETED", "A completed reconciliation cannot be changed; reopen it first.");
    const line = statement.lines.find((item) => item.id === input.lineId);
    if (!line) throw new ApiError(404, "STATEMENT_LINE_NOT_FOUND", "Statement line was not found on this statement.");

    if (!input.bankTransactionId) {
      if (!line.matchedJournalLineId) throw new ApiError(409, "LINE_NOT_MATCHED", "This statement line is not matched.");
      const previousJournalLineId = line.matchedJournalLineId;
      const previous = await tx.bankTransaction.findFirst({ where: { journalLineId: previousJournalLineId } });
      await tx.bankStatementLine.update({ where: { id: line.id }, data: { matchedJournalLineId: null, isMatched: false } });
      if (previous) {
        await tx.$executeRaw`SELECT set_config('app.bank_reconciliation', 'on', true)`;
        await tx.bankTransaction.update({ where: { id: previous.id }, data: { reconciliationStatus: "UNRECONCILED", reconciledAt: null } });
      }
      await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: statement.bankAccount.branchId, action: "BANK_STATEMENT_LINE_UNMATCHED", module: "finance", entityType: "BankStatementLine", entityId: line.id, entityReference: statement.statementNumber, previousValues: { journalLineId: previousJournalLineId } }, tx);
      return { lineId: line.id, matched: false };
    }

    const transaction = await tx.bankTransaction.findFirst({ where: { id: input.bankTransactionId, companyId: actor.companyId, bankAccountId: statement.bankAccountId } });
    if (!transaction) throw new ApiError(404, "BANK_TRANSACTION_NOT_FOUND", "The selected bank transaction was not found on this account.");
    if (transaction.reconciliationStatus === "RECONCILED") throw new ApiError(409, "BANK_TRANSACTION_RECONCILED", "This bank transaction is already reconciled.");
    if (transaction.transactionDate < statement.periodStart || transaction.transactionDate > statement.periodEnd) throw new ApiError(422, "TRANSACTION_OUTSIDE_PERIOD", "The bank transaction date falls outside the statement period.");
    const lineNet = Number(line.deposit) - Number(line.withdrawal);
    const transactionNet = Number(transaction.deposit) - Number(transaction.withdrawal);
    if (Math.abs(lineNet - transactionNet) > 0.005) throw new ApiError(422, "AMOUNT_MISMATCH", "The statement line and bank transaction amounts must match.");
    if ((line.deposit.gt(0) && !transaction.deposit.gt(0)) || (line.withdrawal.gt(0) && !transaction.withdrawal.gt(0))) throw new ApiError(422, "DIRECTION_MISMATCH", "The statement line direction does not match the bank transaction.");

    await tx.bankStatementLine.update({ where: { id: line.id }, data: { matchedJournalLineId: transaction.journalLineId, isMatched: true } });
    await tx.$executeRaw`SELECT set_config('app.bank_reconciliation', 'on', true)`;
    await tx.bankTransaction.update({ where: { id: transaction.id }, data: { reconciliationStatus: "RECONCILED", reconciledAt: new Date() } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: statement.bankAccount.branchId, action: "BANK_STATEMENT_LINE_MATCHED", module: "finance", entityType: "BankStatementLine", entityId: line.id, entityReference: statement.statementNumber, newValues: { bankTransactionId: transaction.id, amount: moneyString(lineNet >= 0 ? line.deposit : line.withdrawal) } }, tx);
    return { lineId: line.id, matched: true, bankTransactionId: transaction.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** Matches unambiguous statement lines to posted, unreconciled bank transactions in the statement period. */
export async function autoMatchStatement(actor: Actor, statementId: string) {
  return prisma.$transaction(async (tx) => {
    const statement = await lockStatement(tx, statementId, actor.companyId);
    if (!statement) throw new ApiError(404, "BANK_STATEMENT_NOT_FOUND", "Bank statement was not found.");
    if (statement.reconciliation?.status === BankReconciliationStatus.COMPLETED) throw new ApiError(409, "RECONCILIATION_COMPLETED", "A completed reconciliation cannot be changed; reopen it first.");
    const candidates = await tx.bankTransaction.findMany({
      where: { companyId: actor.companyId, bankAccountId: statement.bankAccountId, reconciliationStatus: "UNRECONCILED", transactionDate: { gte: statement.periodStart, lte: statement.periodEnd }, journalEntry: { status: { in: [JournalStatus.POSTED, JournalStatus.REVERSED] } } },
      select: { id: true, journalLineId: true, transactionDate: true, bankReference: true, deposit: true, withdrawal: true },
    });
    const used = new Set<string>();
    let matched = 0;
    const skipped: string[] = [];
    for (const line of statement.lines) {
      if (line.matchedJournalLineId) continue;
      const lineAmount = Number(line.deposit.gt(0) ? line.deposit : line.withdrawal);
      const pool = candidates.filter((candidate) => {
        if (used.has(candidate.id)) return false;
        const directionOk = line.deposit.gt(0) ? candidate.deposit.gt(0) : candidate.withdrawal.gt(0);
        if (!directionOk) return false;
        const amount = Number(candidate.deposit.gt(0) ? candidate.deposit : candidate.withdrawal);
        return Math.abs(amount - lineAmount) <= 0.005;
      });
      if (!pool.length) { skipped.push(line.id); continue; }
      const sameDate = pool.filter((candidate) => candidate.transactionDate.getTime() === line.transactionDate.getTime());
      const referenceMatch = pool.filter((candidate) => line.reference && candidate.bankReference && candidate.bankReference.toLowerCase() === line.reference.toLowerCase());
      const pick = referenceMatch.length === 1 ? referenceMatch[0] : sameDate.length === 1 ? sameDate[0] : pool.length === 1 ? pool[0] : null;
      if (!pick) { skipped.push(line.id); continue; }
      await tx.bankStatementLine.update({ where: { id: line.id }, data: { matchedJournalLineId: pick.journalLineId, isMatched: true } });
      await tx.$executeRaw`SELECT set_config('app.bank_reconciliation', 'on', true)`;
      await tx.bankTransaction.update({ where: { id: pick.id }, data: { reconciliationStatus: "RECONCILED", reconciledAt: new Date() } });
      used.add(pick.id);
      matched += 1;
    }
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: statement.bankAccount.branchId, action: "BANK_STATEMENT_AUTO_MATCHED", module: "finance", entityType: "BankStatement", entityId: statement.id, entityReference: statement.statementNumber, metadata: { matched, unmatched: statement.lines.length - matched } }, tx);
    return { matched, remaining: statement.lines.length - matched, skippedLineIds: skipped };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function prepareReconciliation(actor: Actor, statementId: string) {
  return prisma.$transaction(async (tx) => {
    const statement = await lockStatement(tx, statementId, actor.companyId);
    if (!statement) throw new ApiError(404, "BANK_STATEMENT_NOT_FOUND", "Bank statement was not found.");
    if (statement.reconciliation?.status === BankReconciliationStatus.COMPLETED) throw new ApiError(409, "RECONCILIATION_COMPLETED", "This reconciliation is already completed.");
    const bookBalance = await ledgerBalance(tx, actor.companyId, statement.bankAccountId, statement.periodEnd);
    const outstanding = await outstandingTotals(tx, actor.companyId, statement.bankAccountId, statement.periodEnd);
    const adjustedBalance = bookBalance.plus(outstanding.deposits).minus(outstanding.payments);
    const data = {
      companyId: actor.companyId,
      bankAccountId: statement.bankAccountId,
      statementId: statement.id,
      status: BankReconciliationStatus.IN_PROGRESS,
      bookBalance,
      statementBalance: statement.closingBalance,
      outstandingDeposits: outstanding.deposits,
      outstandingPayments: outstanding.payments,
      adjustedBalance,
      preparedById: actor.userId,
    };
    const reconciliation = await tx.bankReconciliation.upsert({
      where: { statementId: statement.id },
      create: data,
      update: { status: BankReconciliationStatus.IN_PROGRESS, bookBalance, statementBalance: statement.closingBalance, outstandingDeposits: outstanding.deposits, outstandingPayments: outstanding.payments, adjustedBalance, preparedById: actor.userId },
    });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: statement.bankAccount.branchId, action: "BANK_RECONCILIATION_PREPARED", module: "finance", entityType: "BankReconciliation", entityId: reconciliation.id, entityReference: statement.statementNumber, newValues: { bookBalance: moneyString(bookBalance), statementBalance: moneyString(statement.closingBalance), adjustedBalance: moneyString(adjustedBalance), difference: moneyString(adjustedBalance.minus(statement.closingBalance)) } }, tx);
    const unmatchedLines = statement.lines.filter((line) => !line.matchedJournalLineId).length;
    return { ...reconciliation, unmatchedLines, difference: adjustedBalance.minus(statement.closingBalance) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function completeReconciliation(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "BankReconciliation" WHERE "id" = ${id}::uuid AND "companyId" = ${actor.companyId}::uuid FOR UPDATE`);
    const reconciliation = await tx.bankReconciliation.findFirst({ where: { id, companyId: actor.companyId }, include: { statement: { include: { lines: true, bankAccount: { select: { branchId: true, code: true } } } } } });
    if (!reconciliation) throw new ApiError(404, "RECONCILIATION_NOT_FOUND", "Bank reconciliation was not found.");
    if (reconciliation.status === BankReconciliationStatus.COMPLETED) throw new ApiError(409, "RECONCILIATION_COMPLETED", "This reconciliation is already completed.");
    const unmatched = reconciliation.statement.lines.filter((line) => !line.matchedJournalLineId);
    if (unmatched.length) throw new ApiError(409, "UNMATCHED_STATEMENT_LINES", `${unmatched.length} statement line(s) must be matched before completion.`);
    const difference = reconciliation.adjustedBalance.minus(reconciliation.statementBalance);
    if (difference.abs().gt(EPSILON)) throw new ApiError(409, "RECONCILIATION_OUT_OF_BALANCE", `Adjusted book balance differs from the statement balance by ${moneyString(difference)}.`);
    const completed = await tx.bankReconciliation.update({
      where: { id },
      data: { status: BankReconciliationStatus.COMPLETED, completedById: actor.userId, completedAt: new Date() },
    });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: reconciliation.statement.bankAccount.branchId, action: "BANK_RECONCILIATION_COMPLETED", module: "finance", entityType: "BankReconciliation", entityId: completed.id, entityReference: reconciliation.statement.statementNumber, newValues: { statementBalance: moneyString(completed.statementBalance), adjustedBalance: moneyString(completed.adjustedBalance), lines: reconciliation.statement.lines.length } }, tx);
    return completed;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function reopenReconciliation(actor: Actor, id: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const reconciliation = await tx.bankReconciliation.findFirst({ where: { id, companyId: actor.companyId }, include: { statement: { include: { bankAccount: { select: { branchId: true } } } } } });
    if (!reconciliation) throw new ApiError(404, "RECONCILIATION_NOT_FOUND", "Bank reconciliation was not found.");
    if (reconciliation.status !== BankReconciliationStatus.COMPLETED) throw new ApiError(409, "INVALID_RECONCILIATION_STATE", "Only a completed reconciliation can be reopened.");
    if (reason.trim().length < 10) throw new ApiError(422, "REOPEN_REASON_REQUIRED", "Give at least ten characters of reason.");
    const reopened = await tx.bankReconciliation.update({ where: { id }, data: { status: BankReconciliationStatus.REOPENED, reopenedReason: reason.trim(), completedAt: null, completedById: null } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: reconciliation.statement.bankAccount.branchId, action: "BANK_RECONCILIATION_REOPENED", module: "finance", entityType: "BankReconciliation", entityId: reopened.id, entityReference: reconciliation.statement.statementNumber, reason: reason.trim(), previousValues: { status: reconciliation.status } }, tx);
    return reopened;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
