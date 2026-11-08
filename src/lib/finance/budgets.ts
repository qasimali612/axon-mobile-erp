import "server-only";

import { BudgetStatus, JournalStatus, Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { decimal, moneyString, zero } from "@/lib/finance/money";
import { prisma } from "@/lib/prisma";
import { assertMakerChecker } from "@/lib/operating-mode";
import type { z } from "zod";
import type { budgetSchema } from "@/lib/finance/budget-validation";

export type BudgetActor = { companyId: string; userId: string };
export type BudgetInput = z.infer<typeof budgetSchema>;

type ValidatedLine = { accountId: string; periodId: string; amount: Prisma.Decimal; notes: string | null };

async function validateBudget(tx: Prisma.TransactionClient, companyId: string, input: BudgetInput) {
  const fiscalYear = await tx.fiscalYear.findFirst({ where: { id: input.fiscalYearId, companyId }, select: { id: true, code: true } });
  if (!fiscalYear) throw new ApiError(404, "FISCAL_YEAR_NOT_FOUND", "The selected fiscal year was not found in this company.");
  const [branch, department, costCenter] = await Promise.all([
    input.branchId ? tx.branch.findFirst({ where: { id: input.branchId, companyId, isActive: true }, select: { id: true } }) : Promise.resolve(null),
    input.departmentId ? tx.department.findFirst({ where: { id: input.departmentId, companyId, isActive: true }, select: { id: true } }) : Promise.resolve(null),
    input.costCenterId ? tx.costCenter.findFirst({ where: { id: input.costCenterId, companyId, isActive: true }, select: { id: true } }) : Promise.resolve(null),
  ]);
  if (input.branchId && !branch) throw new ApiError(422, "INVALID_BUDGET_BRANCH", "The selected branch is not active in this company.");
  if (input.departmentId && !department) throw new ApiError(422, "INVALID_BUDGET_DEPARTMENT", "The selected department is not active in this company.");
  if (input.costCenterId && !costCenter) throw new ApiError(422, "INVALID_BUDGET_COST_CENTER", "The selected cost centre is not active in this company.");

  const accountIds = [...new Set(input.lines.map((line) => line.accountId))];
  const periodIds = [...new Set(input.lines.map((line) => line.periodId))];
  const [accounts, periods] = await Promise.all([
    accountIds.length ? tx.account.findMany({ where: { id: { in: accountIds }, companyId, isActive: true }, select: { id: true, code: true } }) : Promise.resolve([]),
    periodIds.length ? tx.accountingPeriod.findMany({ where: { id: { in: periodIds }, companyId, fiscalYearId: input.fiscalYearId }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  if (accounts.length !== accountIds.length) throw new ApiError(422, "INVALID_BUDGET_ACCOUNT", "Every budget line must use an active ledger account in this company.");
  if (periods.length !== periodIds.length) throw new ApiError(422, "INVALID_BUDGET_PERIOD", "Every budget line period must belong to the selected fiscal year.");

  const lines: ValidatedLine[] = input.lines.map((line) => ({
    accountId: line.accountId,
    periodId: line.periodId,
    amount: decimal(line.amount),
    notes: line.notes?.trim() ? line.notes.trim() : null,
  }));
  const total = lines.reduce((sum, line) => sum.plus(line.amount), zero());
  return { fiscalYear, lines, total };
}

function lineData(lines: ValidatedLine[]) {
  return lines.map((line) => ({ accountId: line.accountId, periodId: line.periodId, amount: line.amount, notes: line.notes }));
}

export async function createBudgetDraft(actor: BudgetActor, input: BudgetInput) {
  return prisma.$transaction(async (tx) => {
    const { fiscalYear, lines, total } = await validateBudget(tx, actor.companyId, input);
    const latest = await tx.budget.findFirst({ where: { companyId: actor.companyId, code: input.code }, orderBy: { version: "desc" }, select: { version: true } });
    const version = (latest?.version ?? 0) + 1;
    const budget = await tx.budget.create({
      data: {
        companyId: actor.companyId,
        fiscalYearId: fiscalYear.id,
        branchId: input.branchId || null,
        departmentId: input.departmentId || null,
        costCenterId: input.costCenterId || null,
        code: input.code,
        name: input.name,
        version,
        status: BudgetStatus.DRAFT,
        createdById: actor.userId,
        lines: { createMany: { data: lineData(lines) } },
      },
      include: { lines: true },
    });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: budget.branchId ?? undefined, action: "BUDGET_DRAFT_CREATED", module: "finance", entityType: "Budget", entityId: budget.id, entityReference: `${budget.code} v${budget.version}`, newValues: { code: budget.code, version: budget.version, lines: lines.length, total: moneyString(total), fiscalYear: fiscalYear.code } }, tx);
    return budget;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

export async function updateBudgetDraft(actor: BudgetActor, id: string, input: BudgetInput) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.budget.findFirst({ where: { id, companyId: actor.companyId }, include: { lines: true } });
    if (!current) throw new ApiError(404, "BUDGET_NOT_FOUND", "Budget was not found.");
    if (current.status !== BudgetStatus.DRAFT) throw new ApiError(409, "INVALID_BUDGET_STATE", "Only a draft budget version can be edited.");
    if (input.code !== current.code) throw new ApiError(409, "BUDGET_CODE_IMMUTABLE", "The budget code of an existing version cannot change; create a new version instead.");
    const { fiscalYear, lines, total } = await validateBudget(tx, actor.companyId, input);
    await tx.budgetLine.deleteMany({ where: { budgetId: id } });
    const updated = await tx.budget.update({
      where: { id },
      data: {
        fiscalYearId: fiscalYear.id,
        name: input.name,
        branchId: input.branchId || null,
        departmentId: input.departmentId || null,
        costCenterId: input.costCenterId || null,
        lines: { createMany: { data: lineData(lines) } },
      },
      include: { lines: true },
    });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: updated.branchId ?? undefined, action: "BUDGET_DRAFT_UPDATED", module: "finance", entityType: "Budget", entityId: updated.id, entityReference: `${updated.code} v${updated.version}`, newValues: { lines: lines.length, total: moneyString(total) }, previousValues: { lines: current.lines.length, total: moneyString(current.lines.reduce((sum, line) => sum.plus(line.amount), zero())) } }, tx);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

export async function submitBudget(actor: BudgetActor, id: string) {
  return prisma.$transaction(async (tx) => {
    const budget = await tx.budget.findFirst({ where: { id, companyId: actor.companyId }, include: { lines: true } });
    if (!budget) throw new ApiError(404, "BUDGET_NOT_FOUND", "Budget was not found.");
    if (budget.status !== BudgetStatus.DRAFT) throw new ApiError(409, "INVALID_BUDGET_STATE", "Only a draft budget version can be submitted.");
    if (!budget.lines.length) throw new ApiError(422, "BUDGET_LINES_REQUIRED", "Add at least one budget line before submitting.");
    const total = budget.lines.reduce((sum, line) => sum.plus(line.amount), zero());
    if (total.lte(0)) throw new ApiError(422, "BUDGET_TOTAL_REQUIRED", "A submitted budget must carry a positive total.");
    const updated = await tx.budget.update({ where: { id }, data: { status: BudgetStatus.SUBMITTED, submittedAt: new Date() } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: updated.branchId ?? undefined, action: "BUDGET_SUBMITTED", module: "finance", entityType: "Budget", entityId: updated.id, entityReference: `${updated.code} v${updated.version}`, newValues: { status: updated.status, total: moneyString(total) } }, tx);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function approveBudget(actor: BudgetActor, id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Budget" WHERE "id" = ${id}::uuid AND "companyId" = ${actor.companyId}::uuid FOR UPDATE`);
    const budget = await tx.budget.findFirst({ where: { id, companyId: actor.companyId }, include: { lines: true, createdBy: { select: { fullName: true } } } });
    if (!budget) throw new ApiError(404, "BUDGET_NOT_FOUND", "Budget was not found.");
    if (budget.status !== BudgetStatus.SUBMITTED) throw new ApiError(409, "INVALID_BUDGET_STATE", "Only a submitted budget version can be approved.");
    await assertMakerChecker(tx, actor.companyId, budget.createdById, actor.userId, "approve this budget");
    const total = budget.lines.reduce((sum, line) => sum.plus(line.amount), zero());
    // Only one approved version may be live per budget code; older approvals become REVISED.
    const superseded = await tx.budget.updateMany({ where: { companyId: actor.companyId, code: budget.code, status: BudgetStatus.APPROVED, id: { not: budget.id } }, data: { status: BudgetStatus.REVISED } });
    const updated = await tx.budget.update({ where: { id }, data: { status: BudgetStatus.APPROVED, approvedById: actor.userId, approvedAt: new Date() } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: updated.branchId ?? undefined, action: "BUDGET_APPROVED", module: "finance", entityType: "Budget", entityId: updated.id, entityReference: `${updated.code} v${updated.version}`, newValues: { status: updated.status, total: moneyString(total), supersededVersions: superseded.count } }, tx);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function closeBudget(actor: BudgetActor, id: string) {
  return prisma.$transaction(async (tx) => {
    const budget = await tx.budget.findFirst({ where: { id, companyId: actor.companyId } });
    if (!budget) throw new ApiError(404, "BUDGET_NOT_FOUND", "Budget was not found.");
    const closable: BudgetStatus[] = [BudgetStatus.APPROVED, BudgetStatus.REVISED];
    if (!closable.includes(budget.status)) throw new ApiError(409, "INVALID_BUDGET_STATE", "Only an approved or superseded version can be closed.");
    const updated = await tx.budget.update({ where: { id }, data: { status: BudgetStatus.CLOSED, closedAt: new Date() } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: updated.branchId ?? undefined, action: "BUDGET_CLOSED", module: "finance", entityType: "Budget", entityId: updated.id, entityReference: `${updated.code} v${updated.version}`, newValues: { status: updated.status } }, tx);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** Creates the next draft version by copying an existing version's header and lines. */
export async function reviseBudget(actor: BudgetActor, id: string) {
  return prisma.$transaction(async (tx) => {
    const source = await tx.budget.findFirst({ where: { id, companyId: actor.companyId }, include: { lines: true } });
    if (!source) throw new ApiError(404, "BUDGET_NOT_FOUND", "Budget was not found.");
    if (source.status === BudgetStatus.DRAFT) throw new ApiError(409, "INVALID_BUDGET_STATE", "Edit the existing draft instead of creating a new version.");
    const latest = await tx.budget.findFirst({ where: { companyId: actor.companyId, code: source.code }, orderBy: { version: "desc" }, select: { version: true, status: true } });
    const pending: BudgetStatus[] = [BudgetStatus.DRAFT, BudgetStatus.SUBMITTED];
    if (latest && pending.includes(latest.status)) throw new ApiError(409, "OPEN_BUDGET_VERSION", `Version ${latest.version} is still ${latest.status.toLowerCase()}; resolve it before creating another version.`);
    const version = (latest?.version ?? source.version) + 1;
    const budget = await tx.budget.create({
      data: {
        companyId: actor.companyId,
        fiscalYearId: source.fiscalYearId,
        branchId: source.branchId,
        departmentId: source.departmentId,
        costCenterId: source.costCenterId,
        code: source.code,
        name: source.name,
        version,
        status: BudgetStatus.DRAFT,
        createdById: actor.userId,
        lines: { createMany: { data: source.lines.map((line) => ({ accountId: line.accountId, periodId: line.periodId, amount: line.amount, notes: line.notes })) } },
      },
      include: { lines: true },
    });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: budget.branchId ?? undefined, action: "BUDGET_VERSION_CREATED", module: "finance", entityType: "Budget", entityId: budget.id, entityReference: `${budget.code} v${budget.version}`, newValues: { fromVersion: source.version, version, lines: source.lines.length } }, tx);
    return budget;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

export type BudgetVarianceRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountClass: string;
  periodId: string;
  periodName: string;
  budget: string;
  actual: string;
  variance: string;
};

/** Budget versus posted actuals, honouring the version's branch, department and cost-centre dimension. */
export async function budgetVariance(actor: BudgetActor, id: string) {
  const budget = await prisma.budget.findFirst({
    where: { id, companyId: actor.companyId },
    include: { lines: { include: { account: { select: { code: true, name: true, accountClass: true } }, period: { select: { name: true, number: true } } } } },
  });
  if (!budget) throw new ApiError(404, "BUDGET_NOT_FOUND", "Budget was not found.");

  const accountIds = [...new Set(budget.lines.map((line) => line.accountId))];
  const periodIds = [...new Set(budget.lines.map((line) => line.periodId))];
  const actuals = accountIds.length && periodIds.length
    ? await prisma.journalEntryLine.groupBy({
      by: ["accountId", "entryId"],
      where: {
        accountId: { in: accountIds },
        entry: {
          companyId: actor.companyId,
          periodId: { in: periodIds },
          status: { in: [JournalStatus.POSTED, JournalStatus.REVERSED] },
          ...(budget.branchId ? { branchId: budget.branchId } : {}),
          ...(budget.departmentId ? { departmentId: budget.departmentId } : {}),
          ...(budget.costCenterId ? { costCenterId: budget.costCenterId } : {}),
        },
      },
      _sum: { baseDebit: true, baseCredit: true },
    })
    : [];
  const entryPeriods = actuals.length
    ? await prisma.journalEntry.findMany({ where: { id: { in: [...new Set(actuals.map((row) => row.entryId))] } }, select: { id: true, periodId: true } })
    : [];
  const periodByEntry = new Map(entryPeriods.map((entry) => [entry.id, entry.periodId]));
  const actualMap = new Map<string, Prisma.Decimal>();
  for (const row of actuals) {
    const periodId = periodByEntry.get(row.entryId);
    if (!periodId) continue;
    const key = `${row.accountId}:${periodId}`;
    const net = (row._sum.baseDebit ?? zero()).minus(row._sum.baseCredit ?? zero());
    actualMap.set(key, (actualMap.get(key) ?? zero()).plus(net));
  }

  const rows: BudgetVarianceRow[] = budget.lines
    .map((line) => {
      const raw = actualMap.get(`${line.accountId}:${line.periodId}`) ?? zero();
      const actual = ["LIABILITY", "EQUITY", "REVENUE"].includes(line.account.accountClass) ? raw.negated() : raw;
      return {
        accountId: line.accountId,
        accountCode: line.account.code,
        accountName: line.account.name,
        accountClass: line.account.accountClass,
        periodId: line.periodId,
        periodName: line.period.name,
        budget: line.amount.toFixed(4),
        actual: actual.toFixed(4),
        variance: line.amount.minus(actual).toFixed(4),
      };
    })
    .sort((a, b) => (a.periodName === b.periodName ? a.accountCode.localeCompare(b.accountCode) : a.periodName.localeCompare(b.periodName)));

  const totals = rows.reduce((sum, row) => ({
    budget: sum.budget.plus(decimal(row.budget)),
    actual: sum.actual.plus(decimal(row.actual)),
    variance: sum.variance.plus(decimal(row.variance)),
  }), { budget: zero(), actual: zero(), variance: zero() });

  return {
    budget: { id: budget.id, code: budget.code, name: budget.name, version: budget.version, status: budget.status, branchId: budget.branchId, departmentId: budget.departmentId, costCenterId: budget.costCenterId },
    rows,
    totals: { budget: totals.budget.toFixed(4), actual: totals.actual.toFixed(4), variance: totals.variance.toFixed(4) },
  };
}
