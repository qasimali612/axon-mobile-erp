import "server-only";

import { JournalStatus, PeriodStatus, Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { assertMakerChecker, assertSegregationOfDuties } from "@/lib/operating-mode";
import { prisma } from "@/lib/prisma";

async function closeChecklist(tx: Prisma.TransactionClient, companyId: string, period: { id: string; startDate: Date; endDate: Date }) {
  const [pendingJournals, unpostedDepreciation, unreconciledStatements, pendingRebates, pendingIncentives, pendingOpeningBatches, ledgerTotals] = await Promise.all([
    tx.journalEntry.count({ where: { companyId, periodId: period.id, status: { in: [JournalStatus.DRAFT, JournalStatus.SUBMITTED, JournalStatus.APPROVED] } } }),
    tx.assetDepreciationSchedule.count({ where: { periodDate: { gte: period.startDate, lte: period.endDate }, status: "PLANNED", asset: { companyId } } }),
    tx.bankStatement.count({ where: { companyId, periodEnd: { lte: period.endDate }, OR: [{ reconciliation: null }, { reconciliation: { status: { not: "COMPLETED" } } }] } }),
    tx.rebateCalculation.count({ where: { companyId, periodEnd: { lte: period.endDate }, status: "APPROVED", accrualJournalId: null } }),
    tx.incentiveCalculation.count({ where: { companyId, periodEnd: { lte: period.endDate }, status: "APPROVED", accrualJournalId: null } }),
    tx.openingBalanceBatch.count({ where: { companyId, balanceDate: { lte: period.endDate }, status: { in: ["DRAFT", "VALIDATED", "APPROVED"] } } }),
    tx.journalEntryLine.aggregate({
      where: { entry: { companyId, postingDate: { lte: period.endDate }, status: { in: [JournalStatus.POSTED, JournalStatus.REVERSED] } } },
      _sum: { baseDebit: true, baseCredit: true },
    }),
  ]);
  const debit = ledgerTotals._sum.baseDebit || new Prisma.Decimal(0);
  const credit = ledgerTotals._sum.baseCredit || new Prisma.Decimal(0);
  const ledgerDifference = debit.minus(credit);
  const blockers = {
    pendingJournals,
    unpostedDepreciation,
    unreconciledStatements,
    pendingRebates,
    pendingIncentives,
    pendingOpeningBatches,
    ledgerDifference: ledgerDifference.toFixed(4),
  };
  return {
    blockers,
    clear:
      pendingJournals === 0 &&
      unpostedDepreciation === 0 &&
      unreconciledStatements === 0 &&
      pendingRebates === 0 &&
      pendingIncentives === 0 &&
      pendingOpeningBatches === 0 &&
      ledgerDifference.isZero(),
    checkedAt: new Date().toISOString(),
  };
}

async function lockPeriod(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "AccountingPeriod" WHERE "id" = ${id}::uuid FOR UPDATE`);
}

export async function requestPeriodClose(actor: { companyId: string; userId: string }, periodId: string) {
  return prisma.$transaction(async (tx) => {
    await lockPeriod(tx, periodId);
    const period = await tx.accountingPeriod.findFirst({ where: { id: periodId, companyId: actor.companyId } });
    if (!period) throw new ApiError(404, "PERIOD_NOT_FOUND", "Accounting period was not found.");
    if (period.status !== PeriodStatus.OPEN) throw new ApiError(409, "PERIOD_NOT_OPEN", "Only an open period can enter close review.");
    const checklist = await closeChecklist(tx, actor.companyId, period);
    if (!checklist.clear) throw new ApiError(409, "PERIOD_CLOSE_BLOCKED", "Resolve all close-checklist blockers before requesting close.", checklist.blockers);
    const record = await tx.financialPeriodClose.upsert({
      where: { periodId },
      create: {
        companyId: actor.companyId,
        periodId,
        status: PeriodStatus.SOFT_CLOSED,
        checklist,
        requestedById: actor.userId,
      },
      update: {
        status: PeriodStatus.SOFT_CLOSED,
        checklist,
        unresolvedItems: Prisma.JsonNull,
        requestedById: actor.userId,
        approvedById: null,
        closedAt: null,
        reopenedAt: null,
        reopenReason: null,
      },
    });
    await tx.accountingPeriod.update({ where: { id: periodId }, data: { status: PeriodStatus.SOFT_CLOSED, closedAt: null, closedById: null } });
    await appendAudit({
      companyId: actor.companyId,
      actorId: actor.userId,
      action: "PERIOD_CLOSE_REQUESTED",
      module: "finance",
      entityType: "AccountingPeriod",
      entityId: period.id,
      entityReference: period.name,
      previousValues: { status: PeriodStatus.OPEN },
      newValues: { status: PeriodStatus.SOFT_CLOSED },
      metadata: checklist,
    }, tx);
    return record;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function approvePeriodClose(actor: { companyId: string; userId: string }, periodId: string) {
  return prisma.$transaction(async (tx) => {
    await lockPeriod(tx, periodId);
    const period = await tx.accountingPeriod.findFirst({ where: { id: periodId, companyId: actor.companyId } });
    const close = await tx.financialPeriodClose.findUnique({ where: { periodId } });
    if (!period || !close) throw new ApiError(404, "CLOSE_REQUEST_NOT_FOUND", "Period close request was not found.");
    if (period.status !== PeriodStatus.SOFT_CLOSED || close.status !== PeriodStatus.SOFT_CLOSED) {
      throw new ApiError(409, "INVALID_PERIOD_STATE", "Only a soft-closed period can be approved for final close.");
    }
    await assertMakerChecker(tx, actor.companyId, close.requestedById, actor.userId, "approve the period close");
    const checklist = await closeChecklist(tx, actor.companyId, period);
    if (!checklist.clear) {
      await tx.financialPeriodClose.update({ where: { id: close.id }, data: { checklist, unresolvedItems: checklist.blockers } });
      throw new ApiError(409, "PERIOD_CLOSE_BLOCKED", "The close checklist changed and now contains blockers.", checklist.blockers);
    }
    const now = new Date();
    const record = await tx.financialPeriodClose.update({
      where: { id: close.id },
      data: { status: PeriodStatus.CLOSED, checklist, unresolvedItems: Prisma.JsonNull, approvedById: actor.userId, closedAt: now },
    });
    await tx.accountingPeriod.update({ where: { id: periodId }, data: { status: PeriodStatus.CLOSED, closedAt: now, closedById: actor.userId } });
    await appendAudit({
      companyId: actor.companyId,
      actorId: actor.userId,
      action: "PERIOD_CLOSED",
      module: "finance",
      entityType: "AccountingPeriod",
      entityId: period.id,
      entityReference: period.name,
      previousValues: { status: PeriodStatus.SOFT_CLOSED },
      newValues: { status: PeriodStatus.CLOSED, closedAt: now.toISOString() },
      metadata: checklist,
    }, tx);
    return record;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function reopenPeriod(actor: { companyId: string; userId: string }, periodId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    await lockPeriod(tx, periodId);
    const period = await tx.accountingPeriod.findFirst({ where: { id: periodId, companyId: actor.companyId } });
    const close = await tx.financialPeriodClose.findUnique({ where: { periodId } });
    if (!period || !close) throw new ApiError(404, "CLOSED_PERIOD_NOT_FOUND", "Closed period record was not found.");
    if (period.status !== PeriodStatus.CLOSED) throw new ApiError(409, "PERIOD_NOT_CLOSED", "Only a closed period can be reopened.");
    await assertSegregationOfDuties(tx, actor.companyId, actor.userId, period.closedById, null, "reopen this closed period");
    const now = new Date();
    const record = await tx.financialPeriodClose.update({ where: { id: close.id }, data: { status: PeriodStatus.OPEN, reopenedAt: now, reopenReason: reason } });
    await tx.accountingPeriod.update({ where: { id: periodId }, data: { status: PeriodStatus.OPEN, closedAt: null, closedById: null } });
    await appendAudit({
      companyId: actor.companyId,
      actorId: actor.userId,
      action: "PERIOD_REOPENED",
      module: "finance",
      entityType: "AccountingPeriod",
      entityId: period.id,
      entityReference: period.name,
      reason,
      previousValues: { status: PeriodStatus.CLOSED },
      newValues: { status: PeriodStatus.OPEN, reopenedAt: now.toISOString() },
    }, tx);
    return record;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
