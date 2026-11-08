import "server-only";

import { AssetStatus, AssetTransactionType, CashFlowActivity, DepreciationMethod, PeriodStatus, Prisma, ScheduleStatus } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { decimal, moneyString, zero } from "@/lib/finance/money";
import { prisma } from "@/lib/prisma";
import { assertMakerChecker } from "@/lib/operating-mode";
import { postSystemJournal, type SystemJournalInput } from "@/lib/finance/system-journal";

export type AssetActor = { companyId: string; userId: string; currencyCode: string };

type JournalLine = { accountId: string; description: string; debit?: string | Prisma.Decimal; credit?: string | Prisma.Decimal };

function dateOnly(value: string, label: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new ApiError(422, "INVALID_DATE", `${label} must be a valid date.`);
  return parsed;
}

function monthEnd(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
}

function monthIndex(value: Date) {
  return value.getUTCFullYear() * 12 + value.getUTCMonth();
}

export function totalCost(asset: { purchaseCost: Prisma.Decimal; additionalCost: Prisma.Decimal }) {
  return asset.purchaseCost.plus(asset.additionalCost);
}

/**
 * Posts a balanced, immediately-posted system journal for a fixed-asset event through the shared
 * system-journal poster, tagging the voucher with the FIXED_ASSET source module.
 */
async function postAssetJournal(tx: Prisma.TransactionClient, input: Omit<SystemJournalInput, "sourceModule" | "documentTypePrefix" | "numberSuffix" | "errorCodes">) {
  return postSystemJournal(tx, {
    ...input,
    sourceModule: "FIXED_ASSET",
    documentTypePrefix: "ASSET",
    numberSuffix: "FA",
    cashFlowActivity: input.cashFlowActivity ?? CashFlowActivity.INVESTING,
    errorCodes: { preparerRequired: "ASSET_PREPARER_REQUIRED", duplicate: "ASSET_JOURNAL_EXISTS", unbalanced: "UNBALANCED_ASSET_JOURNAL" },
  });
}

export type AssetCategoryInput = {
  code: string; name: string; depreciable: boolean; defaultUsefulLifeMonths?: number | null;
  defaultMethod: DepreciationMethod; defaultRate?: string | null;
  assetAccountId: string; accumulatedAccountId: string; expenseAccountId: string; disposalAccountId: string;
  isActive: boolean;
};

async function validateCategoryAccounts(tx: Prisma.TransactionClient, companyId: string, input: AssetCategoryInput) {
  const ids = [input.assetAccountId, input.accumulatedAccountId, input.expenseAccountId, input.disposalAccountId];
  if (new Set(ids).size !== ids.length) throw new ApiError(422, "DUPLICATE_ASSET_ACCOUNT", "Each category account must be a different ledger account.");
  const accounts = await tx.account.findMany({ where: { id: { in: ids }, companyId, isActive: true }, select: { id: true, accountClass: true } });
  if (accounts.length !== ids.length) throw new ApiError(422, "INVALID_ASSET_ACCOUNT", "Every category account must be an active ledger account in this company.");
  const byId = new Map(accounts.map((account) => [account.id, account.accountClass]));
  if (byId.get(input.assetAccountId) !== "ASSET") throw new ApiError(422, "INVALID_ASSET_ACCOUNT", "The asset cost account must be an asset account.");
  if (byId.get(input.accumulatedAccountId) !== "ASSET") throw new ApiError(422, "INVALID_ASSET_ACCOUNT", "The accumulated depreciation account must be an asset contra account.");
  if (byId.get(input.expenseAccountId) !== "EXPENSE" && byId.get(input.expenseAccountId) !== "COGS") throw new ApiError(422, "INVALID_ASSET_ACCOUNT", "The depreciation expense account must be an expense account.");
  if (byId.get(input.disposalAccountId) !== "REVENUE" && byId.get(input.disposalAccountId) !== "EXPENSE") throw new ApiError(422, "INVALID_ASSET_ACCOUNT", "The disposal gain/loss account must be a revenue or expense account.");
}

export async function createAssetCategory(actor: AssetActor, input: AssetCategoryInput) {
  return prisma.$transaction(async (tx) => {
    await validateCategoryAccounts(tx, actor.companyId, input);
    const category = await tx.assetCategory.create({
      data: {
        companyId: actor.companyId,
        code: input.code,
        name: input.name,
        depreciable: input.depreciable,
        defaultUsefulLifeMonths: input.defaultUsefulLifeMonths ?? null,
        defaultMethod: input.defaultMethod,
        defaultRate: input.defaultRate ? new Prisma.Decimal(input.defaultRate) : null,
        assetAccountId: input.assetAccountId,
        accumulatedAccountId: input.accumulatedAccountId,
        expenseAccountId: input.expenseAccountId,
        disposalAccountId: input.disposalAccountId,
        isActive: input.isActive,
      },
    });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, action: "ASSET_CATEGORY_CREATED", module: "finance", entityType: "AssetCategory", entityId: category.id, entityReference: category.code, newValues: { code: category.code, name: category.name, depreciable: category.depreciable, defaultMethod: category.defaultMethod } }, tx);
    return category;
  });
}

export async function updateAssetCategory(actor: AssetActor, id: string, input: AssetCategoryInput) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.assetCategory.findFirst({ where: { id, companyId: actor.companyId } });
    if (!current) throw new ApiError(404, "ASSET_CATEGORY_NOT_FOUND", "Asset category was not found.");
    await validateCategoryAccounts(tx, actor.companyId, input);
    const used = await tx.fixedAsset.count({ where: { categoryId: id } });
    const accountChanged = current.assetAccountId !== input.assetAccountId || current.accumulatedAccountId !== input.accumulatedAccountId || current.expenseAccountId !== input.expenseAccountId || current.disposalAccountId !== input.disposalAccountId;
    if (used && accountChanged) throw new ApiError(409, "ASSET_CATEGORY_ACCOUNTS_LOCKED", "Category ledger mapping cannot change once assets use the category.");
    const updated = await tx.assetCategory.update({
      where: { id },
      data: {
        code: input.code, name: input.name, depreciable: input.depreciable,
        defaultUsefulLifeMonths: input.defaultUsefulLifeMonths ?? null,
        defaultMethod: input.defaultMethod,
        defaultRate: input.defaultRate ? new Prisma.Decimal(input.defaultRate) : null,
        assetAccountId: input.assetAccountId, accumulatedAccountId: input.accumulatedAccountId,
        expenseAccountId: input.expenseAccountId, disposalAccountId: input.disposalAccountId,
        isActive: input.isActive,
      },
    });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, action: "ASSET_CATEGORY_UPDATED", module: "finance", entityType: "AssetCategory", entityId: updated.id, entityReference: updated.code, newValues: { name: updated.name, isActive: updated.isActive, defaultMethod: updated.defaultMethod }, previousValues: { name: current.name, isActive: current.isActive, defaultMethod: current.defaultMethod } }, tx);
    return updated;
  });
}

export type FixedAssetInput = {
  categoryId: string; branchId: string; code: string; name: string; description?: string | null; serialNumber?: string | null;
  supplierId?: string | null; custodianId?: string | null; assetLocation?: string | null;
  purchaseDate: string; capitalizationDate: string; depreciationStartDate?: string | null;
  purchaseCost: string; additionalCost: string; residualValue: string;
  usefulLifeMonths?: number | null; depreciationMethod: DepreciationMethod; depreciationRate?: string | null;
};

async function validateAssetInput(tx: Prisma.TransactionClient, companyId: string, input: FixedAssetInput) {
  const [category, branch, supplier, custodian] = await Promise.all([
    tx.assetCategory.findFirst({ where: { id: input.categoryId, companyId } }),
    tx.branch.findFirst({ where: { id: input.branchId, companyId, isActive: true }, select: { id: true } }),
    input.supplierId ? tx.supplier.findFirst({ where: { id: input.supplierId, companyId, status: "ACTIVE" }, select: { id: true } }) : Promise.resolve(null),
    input.custodianId ? tx.companyMembership.findFirst({ where: { companyId, userId: input.custodianId, status: "ACTIVE" }, select: { userId: true } }) : Promise.resolve(null),
  ]);
  if (!category) throw new ApiError(404, "ASSET_CATEGORY_NOT_FOUND", "The selected asset category was not found.");
  if (!category.isActive) throw new ApiError(409, "ASSET_CATEGORY_INACTIVE", "The selected asset category is inactive.");
  if (!branch) throw new ApiError(404, "BRANCH_NOT_FOUND", "The selected branch is not available.");
  if (input.supplierId && !supplier) throw new ApiError(422, "INVALID_SUPPLIER", "The selected supplier is not active in this company.");
  if (input.custodianId && !custodian) throw new ApiError(422, "INVALID_CUSTODIAN", "The selected custodian is not an active company user.");

  const purchaseCost = decimal(input.purchaseCost);
  const additionalCost = decimal(input.additionalCost);
  const residual = decimal(input.residualValue);
  const cost = purchaseCost.plus(additionalCost);
  if (purchaseCost.lte(0)) throw new ApiError(422, "INVALID_ASSET_COST", "Purchase cost must be greater than zero.");
  if (additionalCost.lt(0)) throw new ApiError(422, "INVALID_ASSET_COST", "Additional cost cannot be negative.");
  if (residual.lt(0) || residual.gte(cost)) throw new ApiError(422, "INVALID_RESIDUAL_VALUE", "Residual value must be zero or greater and below total cost.");
  if (category.depreciable) {
    if (input.depreciationMethod === DepreciationMethod.NONE) throw new ApiError(422, "INVALID_DEPRECIATION_METHOD", "A depreciable category requires a depreciation method.");
    if (input.depreciationMethod === DepreciationMethod.STRAIGHT_LINE && !input.usefulLifeMonths) throw new ApiError(422, "USEFUL_LIFE_REQUIRED", "Straight-line depreciation requires a useful life in months.");
    if (input.depreciationMethod === DepreciationMethod.DECLINING_BALANCE && !input.depreciationRate) throw new ApiError(422, "DEPRECIATION_RATE_REQUIRED", "Declining-balance depreciation requires an annual rate.");
    if (input.usefulLifeMonths && (input.usefulLifeMonths < 1 || input.usefulLifeMonths > 1_200)) throw new ApiError(422, "INVALID_USEFUL_LIFE", "Useful life must be between 1 and 1200 months.");
    if (input.depreciationRate && (Number(input.depreciationRate) <= 0 || Number(input.depreciationRate) > 100)) throw new ApiError(422, "INVALID_DEPRECIATION_RATE", "Depreciation rate must be greater than zero and at most 100 percent.");
  }
  return { category, purchaseCost, additionalCost, residual };
}

function assetScalars(actor: AssetActor, input: FixedAssetInput, category: { assetAccountId: string; accumulatedAccountId: string; expenseAccountId: string; disposalAccountId: string }, amounts: { purchaseCost: Prisma.Decimal; additionalCost: Prisma.Decimal; residual: Prisma.Decimal }) {
  void actor;
  return {
    categoryId: input.categoryId,
    branchId: input.branchId,
    supplierId: input.supplierId || null,
    custodianId: input.custodianId || null,
    assetAccountId: category.assetAccountId,
    accumulatedAccountId: category.accumulatedAccountId,
    expenseAccountId: category.expenseAccountId,
    disposalAccountId: category.disposalAccountId,
    code: input.code,
    name: input.name,
    description: input.description || null,
    serialNumber: input.serialNumber || null,
    assetLocation: input.assetLocation || null,
    purchaseDate: dateOnly(input.purchaseDate, "Purchase date"),
    capitalizationDate: dateOnly(input.capitalizationDate, "Capitalization date"),
    depreciationStartDate: input.depreciationStartDate ? dateOnly(input.depreciationStartDate, "Depreciation start date") : null,
    purchaseCost: amounts.purchaseCost,
    additionalCost: amounts.additionalCost,
    residualValue: amounts.residual,
    usefulLifeMonths: input.usefulLifeMonths ?? null,
    depreciationMethod: input.depreciationMethod,
    depreciationRate: input.depreciationRate ? new Prisma.Decimal(input.depreciationRate) : null,
  };
}

export async function createFixedAssetDraft(actor: AssetActor, input: FixedAssetInput) {
  return prisma.$transaction(async (tx) => {
    const { category, purchaseCost, additionalCost, residual } = await validateAssetInput(tx, actor.companyId, input);
    const asset = await tx.fixedAsset.create({
      data: {
        companyId: actor.companyId,
        ...assetScalars(actor, input, category, { purchaseCost, additionalCost, residual }),
        preparedById: actor.userId,
        netBookValue: purchaseCost.plus(additionalCost),
        status: AssetStatus.DRAFT,
      },
    });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: input.branchId, action: "FIXED_ASSET_DRAFT_CREATED", module: "finance", entityType: "FixedAsset", entityId: asset.id, entityReference: asset.code, newValues: { code: asset.code, name: asset.name, cost: moneyString(asset.netBookValue), category: category.code } }, tx);
    return asset;
  });
}

export async function updateFixedAssetDraft(actor: AssetActor, id: string, input: FixedAssetInput) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.fixedAsset.findFirst({ where: { id, companyId: actor.companyId } });
    if (!current) throw new ApiError(404, "FIXED_ASSET_NOT_FOUND", "Fixed asset was not found.");
    if (current.status !== AssetStatus.DRAFT) throw new ApiError(409, "INVALID_ASSET_STATE", "Only a draft fixed asset can be edited.");
    const { category, purchaseCost, additionalCost, residual } = await validateAssetInput(tx, actor.companyId, input);
    const updated = await tx.fixedAsset.update({
      where: { id },
      data: { ...assetScalars(actor, input, category, { purchaseCost, additionalCost, residual }), netBookValue: purchaseCost.plus(additionalCost) },
    });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: updated.branchId, action: "FIXED_ASSET_DRAFT_UPDATED", module: "finance", entityType: "FixedAsset", entityId: updated.id, entityReference: updated.code, newValues: { code: updated.code, name: updated.name, cost: moneyString(updated.netBookValue) }, previousValues: { code: current.code, name: current.name, cost: moneyString(current.netBookValue) } }, tx);
    return updated;
  });
}

/** Capitalizes a draft asset: posts Dr asset cost / Cr settlement account and activates the asset. */
export async function capitalizeFixedAsset(actor: AssetActor, id: string, input: { settlementAccountId: string; postingDate?: string }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "FixedAsset" WHERE "id" = ${id}::uuid AND "companyId" = ${actor.companyId}::uuid FOR UPDATE`);
    const asset = await tx.fixedAsset.findFirst({ where: { id, companyId: actor.companyId }, include: { category: true } });
    if (!asset) throw new ApiError(404, "FIXED_ASSET_NOT_FOUND", "Fixed asset was not found.");
    if (asset.status !== AssetStatus.DRAFT) throw new ApiError(409, "INVALID_ASSET_STATE", "Only a draft fixed asset can be capitalized.");
    const cost = totalCost(asset);
    if (!asset.category.depreciable && cost.lte(0)) throw new ApiError(422, "INVALID_ASSET_COST", "The asset cost must be positive.");
    const settlement = await tx.account.findFirst({ where: { id: input.settlementAccountId, companyId: actor.companyId, isActive: true } });
    if (!settlement) throw new ApiError(422, "INVALID_SETTLEMENT_ACCOUNT", "Select an active settlement account for the acquisition.");
    if (settlement.id === asset.assetAccountId) throw new ApiError(422, "INVALID_SETTLEMENT_ACCOUNT", "Settlement cannot use the asset cost account itself.");
    const postingDate = input.postingDate ? dateOnly(input.postingDate, "Capitalization posting date") : asset.capitalizationDate;
    const preparedById = asset.preparedById ?? (await tx.auditLog.findFirst({ where: { companyId: actor.companyId, entityType: "FixedAsset", entityId: asset.id, action: "FIXED_ASSET_DRAFT_CREATED" }, orderBy: { createdAt: "asc" }, select: { actorId: true } }))?.actorId ?? "";
    await assertMakerChecker(tx, actor.companyId, preparedById, actor.userId, "capitalize this asset draft");
    if (!preparedById) throw new ApiError(409, "ASSET_PREPARER_REQUIRED", "This asset draft has no recorded preparer and cannot be capitalized.");

    const journal = await postAssetJournal(tx, {
      actor,
      preparedById,
      branchId: asset.branchId,
      postingDate,
      sourceDocumentType: "FIXED_ASSET_CAPITALIZATION",
      sourceDocumentId: asset.id,
      sourceDocumentNumber: asset.code,
      narration: `Capitalization of fixed asset ${asset.code} · ${asset.name}`,
      reference: asset.code,
      lines: [
        { accountId: asset.assetAccountId, description: `Asset cost ${asset.code}`, debit: cost.toFixed(4) },
        { accountId: settlement.id, description: `Acquisition settlement ${asset.code}`, credit: cost.toFixed(4) },
      ],
    });

    const updated = await tx.fixedAsset.update({
      where: { id },
      data: { status: asset.category.depreciable ? AssetStatus.ACTIVE : AssetStatus.ACTIVE, netBookValue: cost, depreciationStartDate: asset.depreciationStartDate ?? monthEnd(postingDate) },
    });
    await tx.assetTransaction.create({
      data: { assetId: asset.id, journalEntryId: journal.id, type: AssetTransactionType.ACQUISITION, transactionDate: postingDate, amount: cost, description: `Asset capitalized through ${journal.voucherNumber}`, createdById: actor.userId },
    });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: asset.branchId, action: "FIXED_ASSET_CAPITALIZED", module: "finance", entityType: "FixedAsset", entityId: asset.id, entityReference: asset.code, newValues: { cost: moneyString(cost), journal: journal.voucherNumber, settlementAccount: settlement.code } }, tx);
    return { asset: updated, journal };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

/** Generates planned monthly depreciation rows for active assets in the given month. */
export async function generateDepreciation(actor: AssetActor, input: { periodDate: string; categoryId?: string | null }) {
  const periodDate = monthEnd(dateOnly(input.periodDate, "Depreciation period"));
  const period = await prisma.accountingPeriod.findFirst({ where: { companyId: actor.companyId, startDate: { lte: periodDate }, endDate: { gte: periodDate }, status: PeriodStatus.OPEN } });
  if (!period) throw new ApiError(409, "PERIOD_NOT_OPEN", "No open accounting period contains the depreciation date.");

  return prisma.$transaction(async (tx) => {
    const [assets, existingRows] = await Promise.all([
      tx.fixedAsset.findMany({
        where: { companyId: actor.companyId, status: { in: [AssetStatus.ACTIVE, AssetStatus.FULLY_DEPRECIATED] }, category: { depreciable: true }, ...(input.categoryId ? { categoryId: input.categoryId } : {}) },
        include: { schedules: { where: { status: ScheduleStatus.POSTED }, select: { periodDate: true } } },
      }),
      tx.assetDepreciationSchedule.findMany({ where: { periodDate, asset: { companyId: actor.companyId } }, select: { assetId: true } }),
    ]);
    const alreadyPlanned = new Set(existingRows.map((row) => row.assetId));
    const pending: Prisma.AssetDepreciationScheduleCreateManyInput[] = [];
    let skipped = 0;
    for (const asset of assets) {
      if (asset.status === AssetStatus.FULLY_DEPRECIATED) { skipped += 1; continue; }
      if (alreadyPlanned.has(asset.id)) { skipped += 1; continue; }
      const start = asset.depreciationStartDate ?? asset.capitalizationDate;
      if (monthIndex(start) > monthIndex(periodDate)) { skipped += 1; continue; }
      const cost = totalCost(asset);
      const depreciableBase = cost.minus(asset.residualValue);
      const remaining = asset.netBookValue.minus(asset.residualValue);
      if (remaining.lte(0)) { skipped += 1; continue; }
      let amount: Prisma.Decimal;
      if (asset.depreciationMethod === DepreciationMethod.DECLINING_BALANCE) {
        const annualRate = asset.depreciationRate ? asset.depreciationRate.div(100) : zero();
        amount = asset.netBookValue.times(annualRate).div(12).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
      } else if (asset.usefulLifeMonths && asset.usefulLifeMonths > 0) {
        const postedMonths = asset.schedules.length;
        const life = new Prisma.Decimal(asset.usefulLifeMonths);
        const plannedToDate = depreciableBase.div(life).times(postedMonths).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
        const target = depreciableBase.div(life).times(postedMonths + 1).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
        const due = target.minus(plannedToDate).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
        amount = due.gt(remaining) ? remaining : due;
      } else {
        skipped += 1; continue;
      }
      if (amount.lte(0)) { skipped += 1; continue; }
      if (amount.gt(remaining)) amount = remaining;
      pending.push({
        assetId: asset.id,
        generatedById: actor.userId,
        periodDate,
        openingNetBookValue: asset.netBookValue,
        depreciationAmount: amount,
        closingNetBookValue: asset.netBookValue.minus(amount),
        status: ScheduleStatus.PLANNED,
      });
    }
    if (pending.length) await tx.assetDepreciationSchedule.createMany({ data: pending });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, action: "ASSET_DEPRECIATION_GENERATED", module: "finance", entityType: "AccountingPeriod", entityId: period.id, entityReference: periodDate.toISOString().slice(0, 7), newValues: { periodDate: periodDate.toISOString().slice(0, 10), schedules: pending.length, skipped } }, tx);
    return { periodDate: periodDate.toISOString().slice(0, 10), created: pending.length, skipped };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
}

/** Posts planned depreciation schedules: Dr expense / Cr accumulated depreciation, per asset. */
export async function postDepreciation(actor: AssetActor, input: { periodDate: string; scheduleIds?: string[] }) {
  const periodDate = monthEnd(dateOnly(input.periodDate, "Depreciation period"));
  return prisma.$transaction(async (tx) => {
    const schedules = await tx.assetDepreciationSchedule.findMany({
      where: { periodDate, status: ScheduleStatus.PLANNED, ...(input.scheduleIds?.length ? { id: { in: input.scheduleIds } } : {}), asset: { companyId: actor.companyId } },
      include: { asset: { include: { category: { select: { code: true } } } } },
      orderBy: { assetId: "asc" },
    });
    if (!schedules.length) throw new ApiError(409, "NO_PLANNED_DEPRECIATION", "There is no planned depreciation to post for this period.");
    const selfPrepared = schedules.find((schedule) => schedule.generatedById === actor.userId);
    if (selfPrepared && selfPrepared.generatedById) {
      await assertMakerChecker(tx, actor.companyId, selfPrepared.generatedById, actor.userId, "post depreciation");
    }
    const unprepared = schedules.find((schedule) => !schedule.generatedById);
    if (unprepared) throw new ApiError(409, "ASSET_PREPARER_REQUIRED", "A scheduled depreciation row has no recorded generator and cannot be posted.");
    let posted = 0;
    const vouchers: string[] = [];
    for (const schedule of schedules) {
      const asset = schedule.asset;
      const journal = await postAssetJournal(tx, {
        actor,
        preparedById: schedule.generatedById!,
        branchId: asset.branchId,
        postingDate: periodDate,
        sourceDocumentType: "ASSET_DEPRECIATION",
        sourceDocumentId: schedule.id,
        sourceDocumentNumber: asset.code,
        narration: `Depreciation ${periodDate.toISOString().slice(0, 7)} · ${asset.code} ${asset.name}`,
        reference: asset.code,
        lines: [
          { accountId: asset.expenseAccountId, description: `Depreciation expense ${asset.code}`, debit: schedule.depreciationAmount.toFixed(4) },
          { accountId: asset.accumulatedAccountId, description: `Accumulated depreciation ${asset.code}`, credit: schedule.depreciationAmount.toFixed(4) },
        ],
      });
      await tx.assetDepreciationSchedule.update({ where: { id: schedule.id }, data: { status: ScheduleStatus.POSTED, journalEntryId: journal.id, postedAt: new Date() } });
      const accumulated = asset.accumulatedDepreciation.plus(schedule.depreciationAmount);
      const netBookValue = asset.netBookValue.minus(schedule.depreciationAmount);
      const fullyDepreciated = netBookValue.lte(asset.residualValue) || netBookValue.lte(0);
      await tx.fixedAsset.update({
        where: { id: asset.id },
        data: { accumulatedDepreciation: accumulated, netBookValue, status: fullyDepreciated ? AssetStatus.FULLY_DEPRECIATED : asset.status },
      });
      await tx.assetTransaction.create({
        data: { assetId: asset.id, journalEntryId: journal.id, type: AssetTransactionType.DEPRECIATION, transactionDate: periodDate, amount: schedule.depreciationAmount, description: `Depreciation ${periodDate.toISOString().slice(0, 7)} through ${journal.voucherNumber}`, createdById: actor.userId },
      });
      posted += 1;
      vouchers.push(journal.voucherNumber);
    }
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, action: "ASSET_DEPRECIATION_POSTED", module: "finance", entityType: "AssetDepreciationSchedule", entityId: periodDate.toISOString().slice(0, 10), entityReference: periodDate.toISOString().slice(0, 7), newValues: { periodDate: periodDate.toISOString().slice(0, 10), assets: posted, firstVoucher: vouchers[0] ?? null } }, tx);
    return { posted, periodDate: periodDate.toISOString().slice(0, 10), vouchers };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
}

/** Disposes a capitalized asset: reverses cost and accumulated depreciation and records gain or loss. */
export async function disposeFixedAsset(actor: AssetActor, id: string, input: { disposalDate: string; method: string; proceeds: string; proceedsAccountId?: string | null; reason: string }) {
  const disposalDate = dateOnly(input.disposalDate, "Disposal date");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "FixedAsset" WHERE "id" = ${id}::uuid AND "companyId" = ${actor.companyId}::uuid FOR UPDATE`);
    const asset = await tx.fixedAsset.findFirst({ where: { id, companyId: actor.companyId }, include: { disposal: true, schedules: { where: { status: ScheduleStatus.PLANNED } } } });
    if (!asset) throw new ApiError(404, "FIXED_ASSET_NOT_FOUND", "Fixed asset was not found.");
    const disposable: AssetStatus[] = [AssetStatus.ACTIVE, AssetStatus.FULLY_DEPRECIATED, AssetStatus.IMPAIRED, AssetStatus.HELD_FOR_SALE];
    if (!disposable.includes(asset.status)) throw new ApiError(409, "INVALID_ASSET_STATE", "Only an active, impaired, or fully depreciated asset can be disposed.");
    if (asset.disposal) throw new ApiError(409, "ASSET_ALREADY_DISPOSED", "This asset already has a disposal record.");
    if (asset.schedules.length) throw new ApiError(409, "PLANNED_DEPRECIATION_OPEN", "Post or remove planned depreciation before disposing this asset.");
    const proceeds = decimal(input.proceeds || "0");
    if (proceeds.lt(0)) throw new ApiError(422, "INVALID_PROCEEDS", "Disposal proceeds cannot be negative.");
    if (proceeds.gt(0) && !input.proceedsAccountId) throw new ApiError(422, "PROCEEDS_ACCOUNT_REQUIRED", "Select the account that received the disposal proceeds.");
    const proceedsAccount = proceeds.gt(0)
      ? await tx.account.findFirst({ where: { id: input.proceedsAccountId!, companyId: actor.companyId, isActive: true } })
      : null;
    if (proceeds.gt(0) && !proceedsAccount) throw new ApiError(422, "INVALID_PROCEEDS_ACCOUNT", "The proceeds account must be an active ledger account in this company.");

    const cost = totalCost(asset);
    const accumulated = asset.accumulatedDepreciation;
    const netBookValue = asset.netBookValue;
    const gainOrLoss = proceeds.minus(netBookValue);

    const lines: JournalLine[] = [
      { accountId: asset.accumulatedAccountId, description: `Accumulated depreciation reversed ${asset.code}`, debit: accumulated.toFixed(4) },
      { accountId: asset.assetAccountId, description: `Asset cost retired ${asset.code}`, credit: cost.toFixed(4) },
    ];
    if (proceedsAccount) lines.push({ accountId: proceedsAccount.id, description: `Disposal proceeds ${asset.code}`, debit: proceeds.toFixed(4) });
    if (gainOrLoss.gt(0)) lines.push({ accountId: asset.disposalAccountId, description: `Gain on disposal ${asset.code}`, credit: gainOrLoss.toFixed(4) });
    if (gainOrLoss.lt(0)) lines.push({ accountId: asset.disposalAccountId, description: `Loss on disposal ${asset.code}`, debit: gainOrLoss.abs().toFixed(4) });

    const preparedById = asset.preparedById ?? "";
    if (!preparedById) throw new ApiError(409, "ASSET_PREPARER_REQUIRED", "This fixed asset has no recorded preparer and cannot be disposed.");
    const journal = await postAssetJournal(tx, {
      actor,
      preparedById,
      branchId: asset.branchId,
      postingDate: disposalDate,
      sourceDocumentType: "FIXED_ASSET_DISPOSAL",
      sourceDocumentId: asset.id,
      sourceDocumentNumber: asset.code,
      narration: `Disposal of fixed asset ${asset.code} · ${asset.name}`,
      reference: asset.code,
      lines,
    });

    await tx.assetDisposal.create({
      data: {
        assetId: asset.id, journalEntryId: journal.id, disposalDate, disposalMethod: input.method, proceeds,
        costAtDisposal: cost, accumulatedAtDisposal: accumulated, netBookValueAtDisposal: netBookValue,
        gainOrLoss, reason: input.reason, approvedById: actor.userId,
      },
    });
    const updated = await tx.fixedAsset.update({ where: { id }, data: { status: AssetStatus.DISPOSED, netBookValue: zero() } });
    await tx.assetTransaction.create({
      data: { assetId: asset.id, journalEntryId: journal.id, type: AssetTransactionType.DISPOSAL, transactionDate: disposalDate, amount: proceeds, description: `Disposed via ${input.method} through ${journal.voucherNumber}`, createdById: actor.userId },
    });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: asset.branchId, action: "FIXED_ASSET_DISPOSED", module: "finance", entityType: "FixedAsset", entityId: asset.id, entityReference: asset.code, reason: input.reason, newValues: { method: input.method, proceeds: moneyString(proceeds), netBookValue: moneyString(netBookValue), gainOrLoss: moneyString(gainOrLoss), journal: journal.voucherNumber } }, tx);
    return { asset: updated, journal, gainOrLoss };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}
