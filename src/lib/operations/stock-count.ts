import "server-only";

import {
  OperationalDocumentStatus,
  Prisma,
  ProductStatus,
  StockUnitStatus,
  TrackingMethod,
} from "@prisma/client";
import type { z } from "zod";
import { ApiError } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { assertMakerChecker } from "@/lib/operating-mode";
import { moneyString, zero } from "@/lib/finance/money";
import { allocateOperationalNumber, requireOpenPeriod, type OperationalActor } from "@/lib/operations/accounting";
import {
  postStockAdjustmentRecord,
  stockAdjustmentInclude,
} from "@/lib/operations/stock-adjustment";
import {
  parseOperationDate,
  stockCountCreateSchema,
  stockCountRecordSchema,
} from "@/lib/operations/validation";
import { prisma } from "@/lib/prisma";

export type StockCountCreateInput = z.infer<typeof stockCountCreateSchema>;
export type StockCountRecordInput = z.infer<typeof stockCountRecordSchema>;
type CountActor = OperationalActor;

const round = (value: Prisma.Decimal) => value.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
const isSerialized = (tracking: TrackingMethod) => tracking === TrackingMethod.IMEI || tracking === TrackingMethod.SERIAL;
const cancellableCountStatuses: OperationalDocumentStatus[] = [
  OperationalDocumentStatus.DRAFT,
  OperationalDocumentStatus.SUBMITTED,
];

export const stockCountInclude = Prisma.validator<Prisma.StockCountInclude>()({
  branch: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, code: true, name: true, isActive: true } },
  preparedBy: { select: { id: true, fullName: true } },
  submittedBy: { select: { id: true, fullName: true } },
  postedBy: { select: { id: true, fullName: true } },
  adjustment: { select: { id: true, adjustmentNumber: true, status: true, journalEntryId: true, netValue: true } },
  lines: {
    orderBy: { lineNumber: "asc" },
    include: {
      product: { select: { id: true, sku: true, name: true, status: true, trackingMethod: true } },
      variant: { select: { id: true, sku: true, name: true, isActive: true, purchasePrice: true } },
      lot: { select: { id: true, lotNumber: true, expiryDate: true } },
      units: {
        orderBy: { createdAt: "asc" },
        include: { stockUnit: { include: { identifiers: { orderBy: [{ isPrimary: "desc" }, { type: "asc" }, { slot: "asc" }] } } } },
      },
    },
  },
});

export type StockCountRecord = Prisma.StockCountGetPayload<{ include: typeof stockCountInclude }>;

async function lockStockCount(tx: Prisma.TransactionClient, id: string, companyId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StockCount" WHERE "id"=${id}::uuid AND "companyId"=${companyId}::uuid FOR UPDATE`);
  return tx.stockCount.findFirst({ where: { id, companyId }, include: stockCountInclude });
}

async function validateWarehouse(tx: Prisma.TransactionClient, actor: CountActor, input: { branchId: string; warehouseId: string }) {
  const warehouse = await tx.warehouse.findFirst({
    where: { id: input.warehouseId, companyId: actor.companyId, branchId: input.branchId, isActive: true },
    select: { id: true, branchId: true },
  });
  if (!warehouse) throw new ApiError(404, "WAREHOUSE_NOT_FOUND", "The active stock-count warehouse was not found in the selected branch.");
  return warehouse;
}

type SnapshotLine = {
  productId: string;
  variantId: string;
  lotId: string | null;
  description: string;
  trackingMethod: TrackingMethod;
  expectedQuantity: Prisma.Decimal;
  expectedValue: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  stockUnits: Array<{ id: string }>;
};

async function buildSnapshot(
  tx: Prisma.TransactionClient,
  actor: CountActor,
  input: StockCountCreateInput,
): Promise<SnapshotLine[]> {
  const selectedVariantIds = [...new Set(input.variantIds)];
  const balances = await tx.stockBalance.findMany({
    where: {
      companyId: actor.companyId,
      branchId: input.branchId,
      warehouseId: input.warehouseId,
      quantity: { gt: 0 },
      ...(input.scopeMode === "FULL" ? {} : { variantId: { in: selectedVariantIds } }),
    },
    include: {
      product: { select: { id: true, name: true, status: true, trackingMethod: true } },
      variant: { select: { id: true, name: true, isActive: true, purchasePrice: true } },
    },
    orderBy: [{ product: { name: "asc" } }, { variant: { sku: "asc" } }],
  });
  const variants = input.scopeMode === "FULL" ? [] : await tx.productVariant.findMany({
    where: { companyId: actor.companyId, id: { in: selectedVariantIds }, isActive: true, product: { status: ProductStatus.ACTIVE } },
    include: { product: { select: { id: true, name: true, status: true, trackingMethod: true } } },
  });
  if (input.scopeMode !== "FULL" && variants.length !== selectedVariantIds.length) {
    throw new ApiError(422, "COUNT_VARIANT_UNAVAILABLE", "One or more selected count variants are inactive or unavailable.");
  }

  const units = await tx.physicalStockUnit.findMany({
    where: {
      companyId: actor.companyId,
      currentBranchId: input.branchId,
      currentWarehouseId: input.warehouseId,
      status: StockUnitStatus.IN_STOCK,
      ...(input.scopeMode === "FULL" ? {} : { variantId: { in: selectedVariantIds } }),
    },
    select: { id: true, productId: true, variantId: true, acquisitionCost: true },
    orderBy: { createdAt: "asc" },
  });

  const snapshot: SnapshotLine[] = balances.map((balance) => {
    if (balance.product.status !== ProductStatus.ACTIVE || !balance.variant.isActive) {
      throw new ApiError(409, "COUNT_PRODUCT_UNAVAILABLE", "A stock balance belongs to an inactive product or variant.");
    }
    const physicalUnits = isSerialized(balance.product.trackingMethod)
      ? units.filter((unit) => unit.productId === balance.productId && unit.variantId === balance.variantId)
      : [];
    if (isSerialized(balance.product.trackingMethod)) {
      const physicalValue = round(physicalUnits.reduce((sum, unit) => sum.plus(unit.acquisitionCost), zero()));
      if (!balance.quantity.eq(physicalUnits.length) || !balance.inventoryValue.eq(physicalValue)) {
        throw new ApiError(409, "COUNT_LEDGER_NOT_RECONCILED", `Serialized balance for ${balance.product.name} does not match physical-unit quantity and value.`);
      }
    }
    const unitCost = balance.quantity.gt(0) ? round(balance.inventoryValue.div(balance.quantity)) : round(balance.variant.purchasePrice);
    return {
      productId: balance.productId,
      variantId: balance.variantId,
      lotId: balance.lotId,
      description: `${balance.product.name} — ${balance.variant.name}`,
      trackingMethod: balance.product.trackingMethod,
      expectedQuantity: balance.quantity,
      expectedValue: balance.inventoryValue,
      unitCost,
      stockUnits: physicalUnits.map((unit) => ({ id: unit.id })),
    };
  });

  if (input.scopeMode !== "FULL") {
    for (const variant of variants) {
      if (snapshot.some((line) => line.variantId === variant.id)) continue;
      snapshot.push({
        productId: variant.productId,
        variantId: variant.id,
        lotId: null,
        description: `${variant.product.name} — ${variant.name}`,
        trackingMethod: variant.product.trackingMethod,
        expectedQuantity: zero(),
        expectedValue: zero(),
        unitCost: round(variant.purchasePrice),
        stockUnits: [],
      });
    }
  }
  if (!snapshot.length) throw new ApiError(409, "NO_COUNT_SCOPE_STOCK", "No stock or selected variants are available for this count scope.");
  return snapshot;
}

export async function createStockCount(actor: CountActor, input: StockCountCreateInput) {
  const countDate = parseOperationDate(input.countDate, "Count date");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.stockCount.findUnique({
      where: { companyId_idempotencyKey: { companyId: actor.companyId, idempotencyKey: input.idempotencyKey } },
      include: stockCountInclude,
    });
    if (existing) return existing;
    await validateWarehouse(tx, actor, input);
    await requireOpenPeriod(tx, actor.companyId, countDate);
    const snapshot = await buildSnapshot(tx, actor, input);
    const { number } = await allocateOperationalNumber(tx, {
      companyId: actor.companyId,
      branchId: input.branchId,
      postingDate: countDate,
      documentType: "STOCK_COUNT",
      suffix: "SC",
    });
    const record = await tx.stockCount.create({
      data: {
        companyId: actor.companyId,
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        countNumber: number,
        countDate,
        snapshotAt: new Date(),
        scopeMode: input.scopeMode,
        reason: input.reason,
        notes: input.notes || null,
        preparedById: actor.userId,
        idempotencyKey: input.idempotencyKey,
        lines: {
          create: snapshot.map((line, index) => ({
            productId: line.productId,
            variantId: line.variantId,
            lotId: line.lotId,
            lineNumber: index + 1,
            description: line.description,
            trackingMethod: line.trackingMethod,
            expectedQuantity: line.expectedQuantity,
            expectedValue: line.expectedValue,
            countedQuantity: zero(),
            varianceQuantity: line.expectedQuantity.negated(),
            unitCost: line.unitCost,
            totalVariance: line.expectedValue.negated(),
            units: { create: line.stockUnits.map((unit) => ({ stockUnitId: unit.id, wasExpected: true, counted: false })) },
          })),
        },
      },
      include: stockCountInclude,
    });
    await appendAudit({
      companyId: actor.companyId,
      actorId: actor.userId,
      branchId: record.branchId,
      warehouseId: record.warehouseId,
      action: "STOCK_COUNT_STARTED",
      module: "inventory",
      entityType: "StockCount",
      entityId: record.id,
      entityReference: record.countNumber,
      newValues: { status: record.status, scopeMode: record.scopeMode, lineCount: record.lines.length },
      metadata: { snapshotAt: record.snapshotAt.toISOString(), stockEffect: "NONE_UNTIL_VARIANCE_POSTING" },
    }, tx);
    return record;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 45_000 });
}

export async function recordStockCount(actor: CountActor, id: string, input: StockCountRecordInput) {
  return prisma.$transaction(async (tx) => {
    const record = await lockStockCount(tx, id, actor.companyId);
    if (!record) throw new ApiError(404, "STOCK_COUNT_NOT_FOUND", "Stock count was not found.");
    if (record.status !== OperationalDocumentStatus.DRAFT) throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a draft stock count can be recorded.");
    const submittedIds = input.lines.map((line) => line.lineId);
    if (new Set(submittedIds).size !== input.lines.length || input.lines.length !== record.lines.length || record.lines.some((line) => !submittedIds.includes(line.id))) {
      throw new ApiError(422, "COUNT_LINES_INCOMPLETE", "Submit exactly one count result for every stock-count line.");
    }
    const allUnitIds = input.lines.flatMap((line) => line.countedStockUnitIds);
    if (new Set(allUnitIds).size !== allUnitIds.length) throw new ApiError(422, "DUPLICATE_COUNTED_UNIT", "A physical unit may be counted only once in the session.");

    for (const entered of input.lines) {
      const line = record.lines.find((item) => item.id === entered.lineId)!;
      const serialized = isSerialized(line.trackingMethod);
      let countedQuantity = new Prisma.Decimal(entered.countedQuantity);
      let variance = countedQuantity.minus(line.expectedQuantity);
      let totalVariance: Prisma.Decimal;
      let unitCost = line.unitCost;
      if (serialized) {
        if (!countedQuantity.isInteger() || countedQuantity.toNumber() !== entered.countedStockUnitIds.length) {
          throw new ApiError(422, "SERIALIZED_COUNT_MISMATCH", `Count line ${line.lineNumber} requires one scanned physical unit per counted item.`);
        }
        const expectedIds = new Set(line.units.filter((link) => link.wasExpected).map((link) => link.stockUnitId));
        if (entered.countedStockUnitIds.some((stockUnitId) => !expectedIds.has(stockUnitId))) {
          throw new ApiError(422, "UNEXPECTED_COUNT_UNIT", `Count line ${line.lineNumber} contains a unit outside its snapshot. Record found stock through a controlled adjustment.`);
        }
        await tx.stockCountUnit.updateMany({ where: { stockCountLineId: line.id }, data: { counted: false, countedAt: null } });
        if (entered.countedStockUnitIds.length) {
          await tx.stockCountUnit.updateMany({
            where: { stockCountLineId: line.id, stockUnitId: { in: entered.countedStockUnitIds } },
            data: { counted: true, countedAt: new Date() },
          });
        }
        const missingValue = line.units
          .filter((link) => link.wasExpected && !entered.countedStockUnitIds.includes(link.stockUnitId))
          .reduce((sum, link) => sum.plus(link.stockUnit.acquisitionCost), zero());
        variance = new Prisma.Decimal(entered.countedStockUnitIds.length).minus(line.expectedQuantity);
        totalVariance = round(missingValue).negated();
        if (!variance.isZero()) unitCost = round(totalVariance.abs().div(variance.abs()));
      } else {
        if (entered.countedStockUnitIds.length) throw new ApiError(422, "UNEXPECTED_COUNT_UNITS", `Quantity count line ${line.lineNumber} cannot contain physical units.`);
        totalVariance = round(variance.times(unitCost));
      }
      countedQuantity = round(countedQuantity);
      await tx.stockCountLine.update({
        where: { id: line.id },
        data: { countedQuantity, varianceQuantity: variance, unitCost, totalVariance, notes: entered.notes || null },
      });
    }
    const updated = await tx.stockCount.findFirstOrThrow({ where: { id }, include: stockCountInclude });
    await appendAudit({
      companyId: actor.companyId,
      actorId: actor.userId,
      branchId: record.branchId,
      warehouseId: record.warehouseId,
      action: "STOCK_COUNT_RECORDED",
      module: "inventory",
      entityType: "StockCount",
      entityId: record.id,
      entityReference: record.countNumber,
      newValues: { lineCount: updated.lines.length, varianceLines: updated.lines.filter((line) => !line.varianceQuantity.isZero()).length },
      metadata: { stockEffect: "NONE_UNTIL_POSTING" },
    }, tx);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 45_000 });
}

export async function submitStockCount(actor: CountActor, id: string) {
  return prisma.$transaction(async (tx) => {
    const record = await lockStockCount(tx, id, actor.companyId);
    if (!record) throw new ApiError(404, "STOCK_COUNT_NOT_FOUND", "Stock count was not found.");
    if (record.status !== OperationalDocumentStatus.DRAFT) throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a draft stock count can be submitted.");
    for (const line of record.lines) {
      if (isSerialized(line.trackingMethod)) {
        const counted = line.units.filter((unit) => unit.counted).length;
        if (!line.countedQuantity.eq(counted)) throw new ApiError(409, "SERIALIZED_COUNT_MISMATCH", `Count line ${line.lineNumber} does not match its scanned units.`);
      }
    }
    const updated = await tx.stockCount.update({
      where: { id },
      data: { status: OperationalDocumentStatus.SUBMITTED, submittedById: actor.userId, submittedAt: new Date() },
      include: stockCountInclude,
    });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: record.branchId, warehouseId: record.warehouseId, action: "STOCK_COUNT_SUBMITTED", module: "inventory", entityType: "StockCount", entityId: id, entityReference: record.countNumber, previousValues: { status: record.status }, newValues: { status: updated.status } }, tx);
    return updated;
  });
}

async function assertSnapshotCurrent(tx: Prisma.TransactionClient, actor: CountActor, record: StockCountRecord) {
  for (const line of record.lines) {
    if (line.lotId) {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StockBalance" WHERE "companyId"=${actor.companyId}::uuid AND "warehouseId"=${record.warehouseId}::uuid AND "productId"=${line.productId}::uuid AND "variantId"=${line.variantId}::uuid AND "lotId"=${line.lotId}::uuid FOR UPDATE`);
    } else {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StockBalance" WHERE "companyId"=${actor.companyId}::uuid AND "warehouseId"=${record.warehouseId}::uuid AND "productId"=${line.productId}::uuid AND "variantId"=${line.variantId}::uuid AND "lotId" IS NULL FOR UPDATE`);
    }
    const balance = await tx.stockBalance.findFirst({
      where: { companyId: actor.companyId, branchId: record.branchId, warehouseId: record.warehouseId, productId: line.productId, variantId: line.variantId, lotId: line.lotId },
      select: { quantity: true, inventoryValue: true },
    });
    const currentQuantity = balance?.quantity || zero();
    const currentValue = balance?.inventoryValue || zero();
    if (!currentQuantity.eq(line.expectedQuantity) || !currentValue.eq(line.expectedValue)) {
      throw new ApiError(409, "STOCK_COUNT_STALE", `Stock changed after the snapshot on line ${line.lineNumber}. Cancel and start a fresh count.`, {
        expectedQuantity: line.expectedQuantity.toFixed(4),
        currentQuantity: currentQuantity.toFixed(4),
        expectedValue: line.expectedValue.toFixed(4),
        currentValue: currentValue.toFixed(4),
      });
    }
    if (isSerialized(line.trackingMethod)) {
      const currentUnits = await tx.physicalStockUnit.findMany({
        where: { companyId: actor.companyId, currentWarehouseId: record.warehouseId, productId: line.productId, variantId: line.variantId, status: StockUnitStatus.IN_STOCK },
        select: { id: true },
      });
      const currentIds = currentUnits.map((unit) => unit.id).sort();
      const snapshotIds = line.units.filter((unit) => unit.wasExpected).map((unit) => unit.stockUnitId).sort();
      if (currentIds.length !== snapshotIds.length || currentIds.some((id, index) => id !== snapshotIds[index])) {
        throw new ApiError(409, "STOCK_COUNT_STALE", `Physical-unit custody changed after the snapshot on line ${line.lineNumber}.`);
      }
    }
  }
}

export async function postStockCount(actor: CountActor, id: string) {
  return prisma.$transaction(async (tx) => {
    const record = await lockStockCount(tx, id, actor.companyId);
    if (!record) throw new ApiError(404, "STOCK_COUNT_NOT_FOUND", "Stock count was not found.");
    if (record.status === OperationalDocumentStatus.POSTED) return record;
    if (record.status !== OperationalDocumentStatus.SUBMITTED) throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a submitted stock count can be posted.");
    await assertMakerChecker(tx, actor.companyId, record.preparedById, actor.userId, "approve and post its variance");
    if (!record.warehouse.isActive) throw new ApiError(409, "WAREHOUSE_UNAVAILABLE", "The count warehouse is no longer active.");
    await requireOpenPeriod(tx, actor.companyId, record.countDate);
    await assertSnapshotCurrent(tx, actor, record);

    const varianceLines = record.lines.filter((line) => !line.varianceQuantity.isZero());
    let adjustment: { id: string; adjustmentNumber: string } | null = null;
    if (varianceLines.length) {
      const existingAdjustment = await tx.stockAdjustment.findUnique({ where: { stockCountId: record.id }, include: stockAdjustmentInclude });
      if (existingAdjustment) {
        if (existingAdjustment.status !== OperationalDocumentStatus.POSTED) throw new ApiError(409, "COUNT_ADJUSTMENT_CONFLICT", "The count already has an incomplete generated adjustment.");
        adjustment = existingAdjustment;
      } else {
        const { number } = await allocateOperationalNumber(tx, { companyId: actor.companyId, branchId: record.branchId, postingDate: record.countDate, documentType: "STOCK_COUNT_ADJUSTMENT", suffix: "SCA" });
        let increaseValue = zero();
        let decreaseValue = zero();
        for (const line of varianceLines) {
          if (line.totalVariance.gt(0)) increaseValue = increaseValue.plus(line.totalVariance); else decreaseValue = decreaseValue.plus(line.totalVariance.abs());
        }
        const generated = await tx.stockAdjustment.create({
          data: {
            companyId: actor.companyId,
            branchId: record.branchId,
            warehouseId: record.warehouseId,
            stockCountId: record.id,
            adjustmentNumber: number,
            adjustmentDate: record.countDate,
            reasonCode: "STOCK_COUNT",
            reason: `Posted variance from ${record.countNumber}: ${record.reason}`,
            notes: record.notes,
            increaseValue: round(increaseValue),
            decreaseValue: round(decreaseValue),
            netValue: round(increaseValue.minus(decreaseValue)),
            preparedById: record.preparedById,
            idempotencyKey: `STOCK-COUNT-ADJUSTMENT:${record.id}`,
            lines: {
              create: varianceLines.map((line, index) => ({
                productId: line.productId,
                variantId: line.variantId,
                lotId: line.lotId,
                lineNumber: index + 1,
                description: `Count variance: ${line.description}`,
                trackingMethod: line.trackingMethod,
                quantityDelta: line.varianceQuantity,
                unitCost: line.unitCost,
                totalCost: line.totalVariance,
                notes: line.notes,
                units: isSerialized(line.trackingMethod) && line.varianceQuantity.lt(0)
                  ? { create: line.units.filter((unit) => unit.wasExpected && !unit.counted).map((unit) => ({ stockUnitId: unit.stockUnitId, isNewUnit: false, acquisitionCost: unit.stockUnit.acquisitionCost, attributes: unit.stockUnit.attributes as Prisma.InputJsonValue | undefined })) }
                  : undefined,
              })),
            },
          },
          include: stockAdjustmentInclude,
        });
        const postedAdjustment = await postStockAdjustmentRecord(tx, actor, generated);
        adjustment = { id: postedAdjustment.id, adjustmentNumber: postedAdjustment.adjustmentNumber };
      }
    }
    const posted = await tx.stockCount.update({
      where: { id: record.id },
      data: { status: OperationalDocumentStatus.POSTED, postedById: actor.userId, postedAt: new Date() },
      include: stockCountInclude,
    });
    await appendAudit({
      companyId: actor.companyId,
      actorId: actor.userId,
      branchId: record.branchId,
      warehouseId: record.warehouseId,
      action: "STOCK_COUNT_POSTED",
      module: "inventory",
      entityType: "StockCount",
      entityId: record.id,
      entityReference: record.countNumber,
      previousValues: { status: record.status },
      newValues: { status: posted.status, adjustmentId: adjustment?.id || null },
      metadata: { adjustmentNumber: adjustment?.adjustmentNumber || null, varianceLines: varianceLines.length, totalVariance: moneyString(record.lines.reduce((sum, line) => sum.plus(line.totalVariance), zero())) },
    }, tx);
    return posted;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 120_000 });
}

export async function cancelStockCount(actor: CountActor, id: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const record = await lockStockCount(tx, id, actor.companyId);
    if (!record) throw new ApiError(404, "STOCK_COUNT_NOT_FOUND", "Stock count was not found.");
    if (!cancellableCountStatuses.includes(record.status)) throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only an unposted stock count can be cancelled.");
    const updated = await tx.stockCount.update({ where: { id }, data: { status: OperationalDocumentStatus.CANCELLED, cancelledAt: new Date() }, include: stockCountInclude });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: record.branchId, warehouseId: record.warehouseId, action: "STOCK_COUNT_CANCELLED", module: "inventory", entityType: "StockCount", entityId: record.id, entityReference: record.countNumber, reason, previousValues: { status: record.status }, newValues: { status: updated.status }, metadata: { stockEffect: "NONE" } }, tx);
    return updated;
  });
}
