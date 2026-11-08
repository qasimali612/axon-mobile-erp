import "server-only";

import {
  IdentifierType,
  InventoryMovementType,
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
import { decimal, moneyString, zero } from "@/lib/finance/money";
import {
  allocateOperationalNumber,
  postOperationalJournal,
  requireOpenPeriod,
  requirePostingAccount,
  reverseOperationalJournal,
  type OperationalActor,
  type SourceJournalLine,
} from "@/lib/operations/accounting";
import {
  applyStockMovement,
  assertSufficientBalance,
  averageUnitCost,
  enableInventoryPosting,
  lockPhysicalStockUnit,
  normalizeDeviceIdentifiers,
  type DeviceIdentifierDraft,
} from "@/lib/operations/inventory";
import {
  operationReversalSchema,
  parseOperationDate,
  stockAdjustmentDraftSchema,
} from "@/lib/operations/validation";
import { prisma } from "@/lib/prisma";

export type StockAdjustmentDraftInput = z.infer<typeof stockAdjustmentDraftSchema>;
export type StockAdjustmentReversalInput = z.infer<typeof operationReversalSchema>;
type AdjustmentActor = OperationalActor;

const round = (value: Prisma.Decimal) => value.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
const isSerialized = (tracking: TrackingMethod) => tracking === TrackingMethod.IMEI || tracking === TrackingMethod.SERIAL;
const postableStatuses: OperationalDocumentStatus[] = [OperationalDocumentStatus.DRAFT, OperationalDocumentStatus.SUBMITTED];

export const stockAdjustmentInclude = Prisma.validator<Prisma.StockAdjustmentInclude>()({
  branch: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, code: true, name: true, isActive: true } },
  stockCount: { select: { id: true, countNumber: true, status: true } },
  reversalOf: { select: { id: true, adjustmentNumber: true, status: true } },
  reversal: { select: { id: true, adjustmentNumber: true, status: true } },
  journalEntry: { select: { id: true, voucherNumber: true, status: true, reversalOfId: true } },
  preparedBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
  postedBy: { select: { id: true, fullName: true } },
  reversedBy: { select: { id: true, fullName: true } },
  lines: {
    orderBy: { lineNumber: "asc" },
    include: {
      product: { select: { id: true, sku: true, name: true, status: true, trackingMethod: true } },
      variant: { select: { id: true, sku: true, name: true, isActive: true } },
      lot: { select: { id: true, lotNumber: true, expiryDate: true } },
      units: {
        orderBy: { createdAt: "asc" },
        include: {
          identifiers: { orderBy: [{ isPrimary: "desc" }, { type: "asc" }, { slot: "asc" }] },
          stockUnit: { include: { identifiers: { orderBy: [{ isPrimary: "desc" }, { type: "asc" }, { slot: "asc" }] } } },
        },
      },
    },
  },
});

export type StockAdjustmentRecord = Prisma.StockAdjustmentGetPayload<{ include: typeof stockAdjustmentInclude }>;

export async function lockStockAdjustment(tx: Prisma.TransactionClient, id: string, companyId: string) {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "StockAdjustment" WHERE "id"=${id}::uuid AND "companyId"=${companyId}::uuid FOR UPDATE`,
  );
  return tx.stockAdjustment.findFirst({ where: { id, companyId }, include: stockAdjustmentInclude });
}

async function validateWarehouse(
  tx: Prisma.TransactionClient,
  actor: AdjustmentActor,
  input: { branchId: string; warehouseId: string },
) {
  const warehouse = await tx.warehouse.findFirst({
    where: { id: input.warehouseId, companyId: actor.companyId, branchId: input.branchId, isActive: true },
    select: { id: true, branchId: true, isActive: true },
  });
  if (!warehouse) throw new ApiError(404, "WAREHOUSE_NOT_FOUND", "The active adjustment warehouse was not found in the selected branch.");
  return warehouse;
}

async function activeReservedQuantity(
  tx: Prisma.TransactionClient,
  input: { companyId: string; warehouseId: string; productId: string; variantId: string },
) {
  const reservations = await tx.inventoryReservation.aggregate({
    where: {
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      variantId: input.variantId,
      releasedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    _sum: { quantity: true },
  });
  return reservations._sum.quantity || zero();
}

async function assertQuantityAvailable(
  tx: Prisma.TransactionClient,
  input: { companyId: string; warehouseId: string; productId: string; variantId: string },
  balance: { quantity: Prisma.Decimal; inventoryValue: Prisma.Decimal } | null,
  requested: Prisma.Decimal,
) {
  assertSufficientBalance(balance, requested);
  const reserved = await activeReservedQuantity(tx, input);
  if (balance!.quantity.minus(reserved).lt(requested)) {
    throw new ApiError(409, "INSUFFICIENT_AVAILABLE_STOCK", "Unreserved stock is below the requested adjustment-out quantity.", {
      onHand: balance!.quantity.toFixed(4),
      reserved: reserved.toFixed(4),
      requested: requested.toFixed(4),
    });
  }
}

async function assertUnitNotReserved(tx: Prisma.TransactionClient, companyId: string, stockUnitId: string, lineNumber: number) {
  const reserved = await tx.inventoryReservation.findFirst({
    where: {
      companyId,
      stockUnitId,
      releasedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  if (reserved) throw new ApiError(409, "ADJUSTMENT_UNIT_RESERVED", `A physical unit on adjustment line ${lineNumber} is actively reserved.`);
}

type PreparedUnit = {
  stockUnitId: string | null;
  isNewUnit: boolean;
  acquisitionCost: Prisma.Decimal;
  attributes: Prisma.InputJsonValue | null;
  identifiers: ReturnType<typeof normalizeDeviceIdentifiers>;
};

type PreparedLine = {
  productId: string;
  variantId: string;
  lotId: string | null;
  lineNumber: number;
  description: string;
  trackingMethod: TrackingMethod;
  quantityDelta: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  totalCost: Prisma.Decimal;
  notes: string | null;
  units: PreparedUnit[];
};

async function prepareAdjustmentLines(
  tx: Prisma.TransactionClient,
  actor: AdjustmentActor,
  input: StockAdjustmentDraftInput,
): Promise<PreparedLine[]> {
  const identities = input.lines.map((line) => `${line.variantId}:${line.lotId || "NO_LOT"}`);
  if (new Set(identities).size !== identities.length) {
    throw new ApiError(422, "DUPLICATE_ADJUSTMENT_LINE", "Each variant and lot combination may appear only once on an adjustment.");
  }
  const allSelectedIds = input.lines.flatMap((line) => [
    ...line.stockUnitIds,
    ...line.units.flatMap((unit) => unit.stockUnitId ? [unit.stockUnitId] : []),
  ]);
  if (new Set(allSelectedIds).size !== allSelectedIds.length) {
    throw new ApiError(422, "DUPLICATE_STOCK_UNIT", "A physical stock unit may appear only once on an adjustment.");
  }

  const products = await tx.product.findMany({
    where: { companyId: actor.companyId, id: { in: [...new Set(input.lines.map((line) => line.productId))] } },
    include: { variants: true },
  });
  const productMap = new Map(products.map((product) => [product.id, product]));
  const draftIdentifierKeys = new Set<string>();
  const prepared: PreparedLine[] = [];

  for (const [index, requested] of input.lines.entries()) {
    const lineNumber = index + 1;
    const product = productMap.get(requested.productId);
    if (!product || product.status !== ProductStatus.ACTIVE) {
      throw new ApiError(422, "PRODUCT_NOT_AVAILABLE", `Adjustment line ${lineNumber} uses an inactive or unavailable product.`);
    }
    const variant = product.variants.find((item) => item.id === requested.variantId);
    if (!variant || !variant.isActive) {
      throw new ApiError(422, "VARIANT_NOT_AVAILABLE", `Adjustment line ${lineNumber} uses an inactive or mismatched variant.`);
    }
    const quantityDelta = decimal(requested.quantityDelta);
    const absoluteQuantity = quantityDelta.abs();
    const serialized = isSerialized(product.trackingMethod);
    if (product.trackingMethod === TrackingMethod.BATCH && !requested.lotId) {
      throw new ApiError(422, "BATCH_LOT_REQUIRED", `Adjustment line ${lineNumber} requires a lot.`);
    }
    if (requested.lotId) {
      const lot = await tx.inventoryLot.findFirst({
        where: { id: requested.lotId, companyId: actor.companyId, productId: product.id, variantId: variant.id },
        select: { id: true },
      });
      if (!lot) throw new ApiError(422, "LOT_NOT_AVAILABLE", `Adjustment line ${lineNumber} uses an invalid lot.`);
    }
    if (serialized && !absoluteQuantity.isInteger()) {
      throw new ApiError(422, "SERIALIZED_QUANTITY_MISMATCH", `Adjustment line ${lineNumber} requires a whole-number quantity.`);
    }

    const units: PreparedUnit[] = [];
    let totalCost = zero();
    if (serialized && quantityDelta.lt(0)) {
      if (requested.units.length || requested.stockUnitIds.length !== absoluteQuantity.toNumber()) {
        throw new ApiError(422, "SERIALIZED_QUANTITY_MISMATCH", `Adjustment-out line ${lineNumber} requires one selected stock unit per item.`);
      }
      const records = await tx.physicalStockUnit.findMany({
        where: { companyId: actor.companyId, id: { in: requested.stockUnitIds } },
        select: { id: true, productId: true, variantId: true, status: true, currentBranchId: true, currentWarehouseId: true, acquisitionCost: true, attributes: true },
      });
      const unitMap = new Map(records.map((unit) => [unit.id, unit]));
      for (const stockUnitId of requested.stockUnitIds) {
        const unit = unitMap.get(stockUnitId);
        if (!unit || unit.productId !== product.id || unit.variantId !== variant.id || unit.status !== StockUnitStatus.IN_STOCK || unit.currentBranchId !== input.branchId || unit.currentWarehouseId !== input.warehouseId) {
          throw new ApiError(409, "ADJUSTMENT_UNIT_UNAVAILABLE", `A physical unit on adjustment line ${lineNumber} is not available in the selected warehouse.`);
        }
        await assertUnitNotReserved(tx, actor.companyId, stockUnitId, lineNumber);
        totalCost = totalCost.plus(unit.acquisitionCost);
        units.push({ stockUnitId, isNewUnit: false, acquisitionCost: unit.acquisitionCost, attributes: unit.attributes as Prisma.InputJsonValue | null, identifiers: [] });
      }
      totalCost = round(totalCost).negated();
    } else if (serialized) {
      if (requested.stockUnitIds.length || requested.units.length !== absoluteQuantity.toNumber()) {
        throw new ApiError(422, "SERIALIZED_QUANTITY_MISMATCH", `Adjustment-in line ${lineNumber} requires one physical-unit record per item.`);
      }
      for (const draft of requested.units) {
        if (draft.stockUnitId) {
          if (draft.identifiers.length) throw new ApiError(422, "RESTORED_UNIT_IDENTIFIERS_IMMUTABLE", `Restored unit on line ${lineNumber} cannot replace its identifiers.`);
          const unit = await tx.physicalStockUnit.findFirst({
            where: { id: draft.stockUnitId, companyId: actor.companyId, productId: product.id, variantId: variant.id },
            select: { id: true, status: true, currentWarehouseId: true, acquisitionCost: true, attributes: true },
          });
          if (!unit || unit.status !== StockUnitStatus.SCRAPPED || unit.currentWarehouseId !== null) {
            throw new ApiError(409, "RESTORE_UNIT_UNAVAILABLE", `Restored physical unit on line ${lineNumber} is not in scrapped status outside warehouse custody.`);
          }
          totalCost = totalCost.plus(unit.acquisitionCost);
          units.push({ stockUnitId: unit.id, isNewUnit: false, acquisitionCost: unit.acquisitionCost, attributes: unit.attributes as Prisma.InputJsonValue | null, identifiers: [] });
        } else {
          const unitCost = decimal(draft.unitCost);
          const identifiers = normalizeDeviceIdentifiers(product.trackingMethod, draft.identifiers as DeviceIdentifierDraft[]);
          for (const identifier of identifiers) {
            const key = `${identifier.type}:${identifier.normalizedValue}`;
            if (draftIdentifierKeys.has(key)) throw new ApiError(422, "DUPLICATE_IDENTIFIER", `An identifier on adjustment line ${lineNumber} appears more than once in the document.`);
            draftIdentifierKeys.add(key);
          }
          const existing = await tx.deviceIdentifier.findFirst({
            where: { companyId: actor.companyId, OR: identifiers.map((identifier) => ({ type: identifier.type, normalizedValue: identifier.normalizedValue })) },
            select: { id: true },
          });
          if (existing) throw new ApiError(409, "IDENTIFIER_ALREADY_REGISTERED", `An identifier on adjustment line ${lineNumber} is already registered.`);
          totalCost = totalCost.plus(unitCost);
          units.push({ stockUnitId: null, isNewUnit: true, acquisitionCost: unitCost, attributes: (draft.attributes || null) as Prisma.InputJsonValue | null, identifiers });
        }
      }
      totalCost = round(totalCost);
    } else {
      if (requested.stockUnitIds.length || requested.units.length) {
        throw new ApiError(422, "UNEXPECTED_STOCK_UNITS", `Quantity adjustment line ${lineNumber} cannot contain physical units.`);
      }
      if (quantityDelta.gt(0)) {
        const unitCost = decimal(requested.unitCost || "0");
        totalCost = round(quantityDelta.times(unitCost));
      } else {
        const balance = await tx.stockBalance.findFirst({
          where: {
            companyId: actor.companyId,
            branchId: input.branchId,
            warehouseId: input.warehouseId,
            productId: product.id,
            variantId: variant.id,
            lotId: requested.lotId || null,
          },
        });
        await assertQuantityAvailable(tx, { companyId: actor.companyId, warehouseId: input.warehouseId, productId: product.id, variantId: variant.id }, balance, absoluteQuantity);
        const value = absoluteQuantity.eq(balance!.quantity) ? round(balance!.inventoryValue) : round(averageUnitCost(balance!).times(absoluteQuantity));
        totalCost = value.negated();
      }
    }
    const unitCost = round(totalCost.abs().div(absoluteQuantity));
    prepared.push({
      productId: product.id,
      variantId: variant.id,
      lotId: requested.lotId || null,
      lineNumber,
      description: `${product.name} — ${variant.name}`,
      trackingMethod: product.trackingMethod,
      quantityDelta,
      unitCost,
      totalCost,
      notes: requested.notes || null,
      units,
    });
  }
  return prepared;
}

export async function createStockAdjustmentDraft(actor: AdjustmentActor, input: StockAdjustmentDraftInput) {
  const adjustmentDate = parseOperationDate(input.adjustmentDate, "Adjustment date");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.stockAdjustment.findUnique({
      where: { companyId_idempotencyKey: { companyId: actor.companyId, idempotencyKey: input.idempotencyKey } },
      include: stockAdjustmentInclude,
    });
    if (existing) return existing;
    await validateWarehouse(tx, actor, input);
    const lines = await prepareAdjustmentLines(tx, actor, input);
    const { number } = await allocateOperationalNumber(tx, {
      companyId: actor.companyId,
      branchId: input.branchId,
      postingDate: adjustmentDate,
      documentType: "STOCK_ADJUSTMENT",
      suffix: "SA",
    });
    const increaseValue = round(lines.filter((line) => line.totalCost.gt(0)).reduce((sum, line) => sum.plus(line.totalCost), zero()));
    const decreaseValue = round(lines.filter((line) => line.totalCost.lt(0)).reduce((sum, line) => sum.plus(line.totalCost.abs()), zero()));
    const record = await tx.stockAdjustment.create({
      data: {
        companyId: actor.companyId,
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        adjustmentNumber: number,
        adjustmentDate,
        reasonCode: input.reasonCode,
        reason: input.reason,
        notes: input.notes || null,
        increaseValue,
        decreaseValue,
        netValue: increaseValue.minus(decreaseValue),
        preparedById: actor.userId,
        idempotencyKey: input.idempotencyKey,
        lines: {
          create: lines.map((line) => ({
            productId: line.productId,
            variantId: line.variantId,
            lotId: line.lotId,
            lineNumber: line.lineNumber,
            description: line.description,
            trackingMethod: line.trackingMethod,
            quantityDelta: line.quantityDelta,
            unitCost: line.unitCost,
            totalCost: line.totalCost,
            notes: line.notes,
            units: {
              create: line.units.map((unit) => ({
                stockUnitId: unit.stockUnitId,
                isNewUnit: unit.isNewUnit,
                acquisitionCost: unit.acquisitionCost,
                ...(unit.attributes !== null ? { attributes: unit.attributes } : {}),
                identifiers: { create: unit.identifiers },
              })),
            },
          })),
        },
      },
      include: stockAdjustmentInclude,
    });
    await appendAudit({
      companyId: actor.companyId,
      actorId: actor.userId,
      branchId: record.branchId,
      warehouseId: record.warehouseId,
      action: "STOCK_ADJUSTMENT_DRAFT_CREATED",
      module: "inventory",
      entityType: "StockAdjustment",
      entityId: record.id,
      entityReference: record.adjustmentNumber,
      newValues: { status: record.status, lineCount: record.lines.length, netValue: moneyString(record.netValue) },
      metadata: { stockEffect: "NONE_UNTIL_POSTING" },
    }, tx);
    return record;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

export async function submitStockAdjustment(actor: AdjustmentActor, id: string) {
  return prisma.$transaction(async (tx) => {
    const record = await lockStockAdjustment(tx, id, actor.companyId);
    if (!record) throw new ApiError(404, "ADJUSTMENT_NOT_FOUND", "Stock adjustment was not found.");
    if (record.status !== OperationalDocumentStatus.DRAFT) throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a draft adjustment can be submitted.");
    if (record.preparedById !== actor.userId) throw new ApiError(403, "NOT_PREPARER", "Only the preparer may submit this adjustment.");
    const updated = await tx.stockAdjustment.update({
      where: { id },
      data: { status: OperationalDocumentStatus.SUBMITTED, submittedAt: new Date() },
      include: stockAdjustmentInclude,
    });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: record.branchId, warehouseId: record.warehouseId, action: "STOCK_ADJUSTMENT_SUBMITTED", module: "inventory", entityType: "StockAdjustment", entityId: id, entityReference: record.adjustmentNumber, previousValues: { status: record.status }, newValues: { status: updated.status } }, tx);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

type OriginalMovement = { id: string; quantity: Prisma.Decimal; totalCost: Prisma.Decimal };
type OriginalMovementMap = Map<string, OriginalMovement>;
const movementKey = (lineNumber: number, stockUnitId: string | null) => `${lineNumber}:${stockUnitId || "QTY"}`;

type LinePlan = {
  lineId: string;
  lineNumber: number;
  quantityDelta: Prisma.Decimal;
  totalCost: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  units: Array<{
    linkId: string;
    stockUnitId: string;
    acquisitionCost: Prisma.Decimal;
    isNew: boolean;
    identifiers: Array<{ type: IdentifierType; value: string; normalizedValue: string; slot: number | null; isPrimary: boolean }>;
    attributes: Prisma.JsonValue | null;
  }>;
};

export async function postStockAdjustmentRecord(
  tx: Prisma.TransactionClient,
  actor: AdjustmentActor,
  record: StockAdjustmentRecord,
  original?: { adjustment: StockAdjustmentRecord; movements: OriginalMovementMap },
) {
  if (!postableStatuses.includes(record.status)) throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a draft or submitted stock adjustment can be posted.");
  await assertMakerChecker(tx, actor.companyId, record.preparedById, actor.userId, "approve and post this stock adjustment");
  if (!record.warehouse.isActive) throw new ApiError(409, "WAREHOUSE_UNAVAILABLE", "The adjustment warehouse is no longer active.");
  await requireOpenPeriod(tx, actor.companyId, record.adjustmentDate);

  const plans: LinePlan[] = [];
  let increaseValue = zero();
  let decreaseValue = zero();
  for (const line of record.lines) {
    if (line.product.status !== ProductStatus.ACTIVE || !line.variant.isActive || line.product.trackingMethod !== line.trackingMethod) {
      throw new ApiError(409, "ADJUSTMENT_PRODUCT_UNAVAILABLE", `Product on adjustment line ${line.lineNumber} is inactive or its tracking method changed.`);
    }
    const serialized = isSerialized(line.trackingMethod);
    const absoluteQuantity = line.quantityDelta.abs();
    let totalCost = zero();
    const units: LinePlan["units"] = [];

    if (serialized) {
      if (!absoluteQuantity.isInteger() || line.units.length !== absoluteQuantity.toNumber()) {
        throw new ApiError(409, "SERIALIZED_QUANTITY_MISMATCH", `Adjustment line ${line.lineNumber} no longer has one physical-unit record per item.`);
      }
      for (const link of line.units) {
        if (line.quantityDelta.lt(0)) {
          if (!link.stockUnitId) throw new ApiError(409, "ADJUSTMENT_UNIT_MISSING", `Adjustment-out line ${line.lineNumber} has an unlinked unit.`);
          const unit = await lockPhysicalStockUnit(tx, { companyId: actor.companyId, stockUnitId: link.stockUnitId });
          if (unit.productId !== line.productId || unit.variantId !== line.variantId || unit.status !== StockUnitStatus.IN_STOCK || unit.currentBranchId !== record.branchId || unit.currentWarehouseId !== record.warehouseId) {
            throw new ApiError(409, "ADJUSTMENT_UNIT_UNAVAILABLE", `A physical unit on line ${line.lineNumber} is no longer available in the warehouse.`);
          }
          await assertUnitNotReserved(tx, actor.companyId, unit.id, line.lineNumber);
          totalCost = totalCost.plus(unit.acquisitionCost);
          units.push({ linkId: link.id, stockUnitId: unit.id, acquisitionCost: unit.acquisitionCost, isNew: false, identifiers: [], attributes: unit.attributes });
        } else if (link.isNewUnit) {
          if (link.stockUnitId) throw new ApiError(409, "NEW_UNIT_ALREADY_LINKED", `New unit on line ${line.lineNumber} is already linked before posting.`);
          const stockUnitId = crypto.randomUUID();
          totalCost = totalCost.plus(link.acquisitionCost);
          units.push({
            linkId: link.id,
            stockUnitId,
            acquisitionCost: link.acquisitionCost,
            isNew: true,
            identifiers: link.identifiers.map((identifier) => ({ type: identifier.type, value: identifier.value, normalizedValue: identifier.normalizedValue, slot: identifier.slot, isPrimary: identifier.isPrimary })),
            attributes: link.attributes,
          });
        } else {
          if (!link.stockUnitId) throw new ApiError(409, "RESTORE_UNIT_MISSING", `Restored unit on line ${line.lineNumber} is not linked.`);
          const unit = await lockPhysicalStockUnit(tx, { companyId: actor.companyId, stockUnitId: link.stockUnitId });
          if (unit.productId !== line.productId || unit.variantId !== line.variantId || unit.status !== StockUnitStatus.SCRAPPED || unit.currentWarehouseId !== null) {
            throw new ApiError(409, "RESTORE_UNIT_UNAVAILABLE", `A restored physical unit on line ${line.lineNumber} is no longer eligible.`);
          }
          totalCost = totalCost.plus(unit.acquisitionCost);
          units.push({ linkId: link.id, stockUnitId: unit.id, acquisitionCost: unit.acquisitionCost, isNew: false, identifiers: [], attributes: unit.attributes });
        }
      }
      totalCost = round(totalCost).times(line.quantityDelta.isNegative() ? -1 : 1);
    } else if (line.quantityDelta.lt(0)) {
      if (line.lotId) {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StockBalance" WHERE "companyId"=${actor.companyId}::uuid AND "warehouseId"=${record.warehouseId}::uuid AND "productId"=${line.productId}::uuid AND "variantId"=${line.variantId}::uuid AND "lotId"=${line.lotId}::uuid FOR UPDATE`);
      } else {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StockBalance" WHERE "companyId"=${actor.companyId}::uuid AND "warehouseId"=${record.warehouseId}::uuid AND "productId"=${line.productId}::uuid AND "variantId"=${line.variantId}::uuid AND "lotId" IS NULL FOR UPDATE`);
      }
      const balance = await tx.stockBalance.findFirst({
        where: { companyId: actor.companyId, branchId: record.branchId, warehouseId: record.warehouseId, productId: line.productId, variantId: line.variantId, lotId: line.lotId },
      });
      await assertQuantityAvailable(tx, { companyId: actor.companyId, warehouseId: record.warehouseId, productId: line.productId, variantId: line.variantId }, balance, absoluteQuantity);
      const sourceMovement = original?.movements.get(movementKey(line.lineNumber, null));
      totalCost = sourceMovement
        ? round(sourceMovement.totalCost.negated())
        : (absoluteQuantity.eq(balance!.quantity) ? round(balance!.inventoryValue) : round(averageUnitCost(balance!).times(absoluteQuantity))).negated();
    } else {
      const sourceMovement = original?.movements.get(movementKey(line.lineNumber, null));
      totalCost = sourceMovement ? round(sourceMovement.totalCost.negated()) : round(line.quantityDelta.times(line.unitCost));
    }

    if (original && serialized) {
      totalCost = round(line.units.reduce((sum, link) => {
        const source = original.movements.get(movementKey(line.lineNumber, link.stockUnitId));
        if (!source) throw new ApiError(409, "REVERSAL_MOVEMENT_MISSING", `Original physical-unit movement for line ${line.lineNumber} is missing.`);
        return sum.plus(source.totalCost.negated());
      }, zero()));
    }
    const unitCost = round(totalCost.abs().div(absoluteQuantity));
    if (totalCost.gt(0)) increaseValue = increaseValue.plus(totalCost); else decreaseValue = decreaseValue.plus(totalCost.abs());
    plans.push({ lineId: line.id, lineNumber: line.lineNumber, quantityDelta: line.quantityDelta, totalCost, unitCost, units });
  }
  increaseValue = round(increaseValue);
  decreaseValue = round(decreaseValue);
  if (increaseValue.plus(decreaseValue).lte(0)) {
    throw new ApiError(422, "ZERO_VALUE_ADJUSTMENT", "A posted stock adjustment requires a positive inventory value effect.");
  }
  for (const plan of plans) {
    await tx.stockAdjustmentLine.update({ where: { id: plan.lineId }, data: { unitCost: plan.unitCost, totalCost: plan.totalCost } });
  }
  await tx.stockAdjustment.update({
    where: { id: record.id },
    data: { increaseValue, decreaseValue, netValue: increaseValue.minus(decreaseValue) },
  });

  const journal = original
    ? await reverseOperationalJournal(tx, {
        actor,
        branchId: record.branchId,
        originalJournalId: original.adjustment.journalEntryId!,
        postingDate: record.adjustmentDate,
        sourceModule: "INVENTORY",
        sourceDocumentType: "StockAdjustment",
        sourceDocumentId: record.id,
        sourceDocumentNumber: record.adjustmentNumber,
        idempotencyKey: `STOCK-ADJUSTMENT-REVERSAL:${record.id}`,
        documentType: "STOCK_ADJUSTMENT_REVERSAL_JOURNAL",
        voucherSuffix: "SARV",
        narration: `Reversal of inventory adjustment ${original.adjustment.adjustmentNumber}`,
        allowApproverPosting: true,
      })
    : await (async () => {
        const [inventory, gain, loss] = await Promise.all([
          requirePostingAccount(tx, { companyId: actor.companyId, branchId: record.branchId, accountType: "INVENTORY" }),
          increaseValue.gt(0) ? requirePostingAccount(tx, { companyId: actor.companyId, branchId: record.branchId, accountType: "INVENTORY_ADJUSTMENT_GAIN" }) : Promise.resolve(null),
          decreaseValue.gt(0) ? requirePostingAccount(tx, { companyId: actor.companyId, branchId: record.branchId, accountType: "INVENTORY_ADJUSTMENT_LOSS" }) : Promise.resolve(null),
        ]);
        const lines: SourceJournalLine[] = [
          ...(increaseValue.gt(0) ? [
            { accountId: inventory.id, description: `Inventory increase ${record.adjustmentNumber}`, debit: increaseValue },
            { accountId: gain!.id, description: `Inventory adjustment gain ${record.adjustmentNumber}`, credit: increaseValue },
          ] : []),
          ...(decreaseValue.gt(0) ? [
            { accountId: loss!.id, description: `Inventory adjustment loss ${record.adjustmentNumber}`, debit: decreaseValue },
            { accountId: inventory.id, description: `Inventory decrease ${record.adjustmentNumber}`, credit: decreaseValue },
          ] : []),
        ];
        return postOperationalJournal(tx, {
          actor,
          branchId: record.branchId,
          postingDate: record.adjustmentDate,
          preparedById: record.preparedById,
          approvedById: actor.userId,
          allowApproverPosting: true,
          documentType: "STOCK_ADJUSTMENT_JOURNAL",
          voucherSuffix: "SAV",
          sourceModule: "INVENTORY",
          sourceDocumentType: "StockAdjustment",
          sourceDocumentId: record.id,
          sourceDocumentNumber: record.adjustmentNumber,
          idempotencyKey: `STOCK-ADJUSTMENT:${record.id}`,
          narration: `Inventory adjustment ${record.adjustmentNumber}: ${record.reason}`,
          lines,
        });
      })();

  await enableInventoryPosting(tx);
  const movementGroupId = crypto.randomUUID();
  for (const line of record.lines) {
    const plan = plans.find((item) => item.lineId === line.id)!;
    if (isSerialized(line.trackingMethod)) {
      for (const unitPlan of plan.units) {
        if (unitPlan.isNew) {
          await tx.physicalStockUnit.create({
            data: {
              id: unitPlan.stockUnitId,
              companyId: actor.companyId,
              productId: line.productId,
              variantId: line.variantId,
              currentBranchId: record.branchId,
              currentWarehouseId: record.warehouseId,
              status: StockUnitStatus.IN_STOCK,
              acquisitionDate: record.adjustmentDate,
              acquisitionCost: unitPlan.acquisitionCost,
              attributes: unitPlan.attributes as Prisma.InputJsonValue | undefined,
              identifiers: {
                create: unitPlan.identifiers.map((identifier) => ({
                  ...identifier,
                  company: { connect: { id: actor.companyId } },
                })),
              },
            },
          });
          await tx.stockAdjustmentUnit.update({ where: { id: unitPlan.linkId }, data: { stockUnitId: unitPlan.stockUnitId } });
        }
        const sourceMovement = original?.movements.get(movementKey(line.lineNumber, unitPlan.stockUnitId));
        if (original && !sourceMovement) throw new ApiError(409, "REVERSAL_MOVEMENT_MISSING", `Original movement for physical unit on line ${line.lineNumber} is missing.`);
        const movementType = line.quantityDelta.gt(0) ? InventoryMovementType.ADJUSTMENT_IN : InventoryMovementType.ADJUSTMENT_OUT;
        const signedQuantity = line.quantityDelta.gt(0) ? "1" : "-1";
        const signedCost = line.quantityDelta.gt(0) ? unitPlan.acquisitionCost : unitPlan.acquisitionCost.negated();
        await applyStockMovement(tx, {
          companyId: actor.companyId,
          branchId: record.branchId,
          warehouseId: record.warehouseId,
          productId: line.productId,
          variantId: line.variantId,
          stockUnitId: unitPlan.stockUnitId,
          journalEntryId: journal.id,
          reversalOfId: sourceMovement?.id,
          movementGroupId,
          idempotencyKey: `SA:${record.id}:${line.id}:${unitPlan.stockUnitId}`,
          movementType,
          postingDate: record.adjustmentDate,
          quantity: signedQuantity,
          unitCost: unitPlan.acquisitionCost,
          totalCost: signedCost,
          sourceDocumentType: "StockAdjustment",
          sourceDocumentId: record.id,
          sourceDocumentNumber: record.adjustmentNumber,
          lineReference: line.id,
          createdById: actor.userId,
        });
        if (!unitPlan.isNew) {
          await tx.physicalStockUnit.update({
            where: { id: unitPlan.stockUnitId },
            data: line.quantityDelta.gt(0)
              ? { status: StockUnitStatus.IN_STOCK, currentBranchId: record.branchId, currentWarehouseId: record.warehouseId, currentLocationId: null, version: { increment: 1 } }
              : { status: StockUnitStatus.SCRAPPED, currentBranchId: null, currentWarehouseId: null, currentLocationId: null, soldAt: null, version: { increment: 1 } },
          });
        }
      }
    } else {
      const sourceMovement = original?.movements.get(movementKey(line.lineNumber, null));
      if (original && !sourceMovement) throw new ApiError(409, "REVERSAL_MOVEMENT_MISSING", `Original quantity movement for line ${line.lineNumber} is missing.`);
      await applyStockMovement(tx, {
        companyId: actor.companyId,
        branchId: record.branchId,
        warehouseId: record.warehouseId,
        productId: line.productId,
        variantId: line.variantId,
        lotId: line.lotId,
        journalEntryId: journal.id,
        reversalOfId: sourceMovement?.id,
        movementGroupId,
        idempotencyKey: `SA:${record.id}:${line.id}:QTY`,
        movementType: line.quantityDelta.gt(0) ? InventoryMovementType.ADJUSTMENT_IN : InventoryMovementType.ADJUSTMENT_OUT,
        postingDate: record.adjustmentDate,
        quantity: line.quantityDelta,
        unitCost: plan.unitCost,
        totalCost: plan.totalCost,
        sourceDocumentType: "StockAdjustment",
        sourceDocumentId: record.id,
        sourceDocumentNumber: record.adjustmentNumber,
        lineReference: line.id,
        createdById: actor.userId,
      });
    }
  }

  const posted = await tx.stockAdjustment.update({
    where: { id: record.id },
    data: {
      status: OperationalDocumentStatus.POSTED,
      journalEntryId: journal.id,
      approvedById: actor.userId,
      approvedAt: new Date(),
      postedById: actor.userId,
      postedAt: new Date(),
      increaseValue,
      decreaseValue,
      netValue: increaseValue.minus(decreaseValue),
    },
    include: stockAdjustmentInclude,
  });
  await appendAudit({
    companyId: actor.companyId,
    actorId: actor.userId,
    branchId: record.branchId,
    warehouseId: record.warehouseId,
    action: record.reversalOfId ? "STOCK_ADJUSTMENT_REVERSAL_POSTED" : "STOCK_ADJUSTMENT_POSTED",
    module: "inventory",
    entityType: "StockAdjustment",
    entityId: record.id,
    entityReference: record.adjustmentNumber,
    previousValues: { status: record.status },
    newValues: { status: posted.status, journalEntryId: journal.id, netValue: moneyString(posted.netValue) },
    metadata: { movementGroupId, stockCountId: record.stockCountId, reversalOfId: record.reversalOfId },
  }, tx);
  return posted;
}

export async function postStockAdjustment(actor: AdjustmentActor, id: string) {
  return prisma.$transaction(async (tx) => {
    const record = await lockStockAdjustment(tx, id, actor.companyId);
    if (!record) throw new ApiError(404, "ADJUSTMENT_NOT_FOUND", "Stock adjustment was not found.");
    if (record.status === OperationalDocumentStatus.POSTED || record.status === OperationalDocumentStatus.REVERSED) return record;
    if (record.reversalOfId) throw new ApiError(409, "REVERSAL_REQUIRES_AUTHORIZED_FLOW", "Use the authorized adjustment reversal workflow.");
    return postStockAdjustmentRecord(tx, actor, record);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 60_000 });
}

export async function cancelStockAdjustment(actor: AdjustmentActor, id: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const record = await lockStockAdjustment(tx, id, actor.companyId);
    if (!record) throw new ApiError(404, "ADJUSTMENT_NOT_FOUND", "Stock adjustment was not found.");
    if (!postableStatuses.includes(record.status)) throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only an unposted adjustment can be cancelled.");
    const updated = await tx.stockAdjustment.update({ where: { id }, data: { status: OperationalDocumentStatus.CANCELLED, cancelledAt: new Date() }, include: stockAdjustmentInclude });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: record.branchId, warehouseId: record.warehouseId, action: "STOCK_ADJUSTMENT_CANCELLED", module: "inventory", entityType: "StockAdjustment", entityId: id, entityReference: record.adjustmentNumber, reason, previousValues: { status: record.status }, newValues: { status: updated.status }, metadata: { stockEffect: "NONE" } }, tx);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

export async function reverseStockAdjustment(actor: AdjustmentActor, id: string, input: StockAdjustmentReversalInput) {
  const postingDate = parseOperationDate(input.postingDate, "Reversal date");
  return prisma.$transaction(async (tx) => {
    const original = await lockStockAdjustment(tx, id, actor.companyId);
    if (!original) throw new ApiError(404, "ADJUSTMENT_NOT_FOUND", "Stock adjustment was not found.");
    if (original.stockCountId) throw new ApiError(409, "COUNT_ADJUSTMENT_REVERSAL_BLOCKED", "A generated stock-count adjustment cannot be reversed independently. Record any later correction as a new controlled adjustment.");
    if (original.reversalOfId) throw new ApiError(409, "REVERSAL_OF_REVERSAL", "An adjustment reversal cannot itself be reversed.");
    if (original.status === OperationalDocumentStatus.REVERSED && original.reversal) {
      const existing = await tx.stockAdjustment.findFirst({ where: { id: original.reversal.id, companyId: actor.companyId }, include: stockAdjustmentInclude });
      if (existing) return existing;
    }
    if (original.status !== OperationalDocumentStatus.POSTED || !original.journalEntryId) throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only an active posted adjustment can be reversed.");
    await assertMakerChecker(tx, actor.companyId, original.preparedById, actor.userId, "post this adjustment reversal");
    const idempotent = await tx.stockAdjustment.findUnique({ where: { companyId_idempotencyKey: { companyId: actor.companyId, idempotencyKey: input.idempotencyKey } }, include: stockAdjustmentInclude });
    if (idempotent) {
      if (idempotent.reversalOfId !== original.id) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "The reversal key belongs to another adjustment.");
      return idempotent;
    }
    const { number } = await allocateOperationalNumber(tx, { companyId: actor.companyId, branchId: original.branchId, postingDate, documentType: "STOCK_ADJUSTMENT_REVERSAL", suffix: "SAR" });
    const reversal = await tx.stockAdjustment.create({
      data: {
        companyId: actor.companyId,
        branchId: original.branchId,
        warehouseId: original.warehouseId,
        reversalOfId: original.id,
        adjustmentNumber: number,
        adjustmentDate: postingDate,
        reasonCode: "REVERSAL",
        reason: input.reason,
        notes: `Authorized reversal of ${original.adjustmentNumber}`,
        increaseValue: original.decreaseValue,
        decreaseValue: original.increaseValue,
        netValue: original.netValue.negated(),
        preparedById: original.preparedById,
        idempotencyKey: input.idempotencyKey,
        lines: {
          create: original.lines.map((line) => ({
            productId: line.productId,
            variantId: line.variantId,
            lotId: line.lotId,
            lineNumber: line.lineNumber,
            description: `Reversal: ${line.description}`,
            trackingMethod: line.trackingMethod,
            quantityDelta: line.quantityDelta.negated(),
            unitCost: line.unitCost,
            totalCost: line.totalCost.negated(),
            notes: line.notes,
            units: {
              create: line.units.map((link) => ({
                stockUnitId: link.stockUnitId,
                isNewUnit: false,
                acquisitionCost: link.acquisitionCost,
                attributes: link.attributes as Prisma.InputJsonValue | undefined,
              })),
            },
          })),
        },
      },
      include: stockAdjustmentInclude,
    });
    const lineNumbers = new Map(original.lines.map((line) => [line.id, line.lineNumber]));
    const sourceMovements = await tx.inventoryMovement.findMany({
      where: { companyId: actor.companyId, sourceDocumentType: "StockAdjustment", sourceDocumentId: original.id },
      select: { id: true, lineReference: true, stockUnitId: true, quantity: true, totalCost: true },
    });
    const movementMap: OriginalMovementMap = new Map();
    for (const movement of sourceMovements) {
      const lineNumber = lineNumbers.get(movement.lineReference || "");
      if (!lineNumber) throw new ApiError(409, "ORIGINAL_MOVEMENT_INVALID", "The original adjustment contains an unrecognized movement.");
      movementMap.set(movementKey(lineNumber, movement.stockUnitId), movement);
    }
    const posted = await postStockAdjustmentRecord(tx, actor, reversal, { adjustment: original, movements: movementMap });
    await tx.stockAdjustment.update({ where: { id: original.id }, data: { status: OperationalDocumentStatus.REVERSED, reversedById: actor.userId, reversedAt: new Date() } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: original.branchId, warehouseId: original.warehouseId, action: "STOCK_ADJUSTMENT_REVERSED", module: "inventory", entityType: "StockAdjustment", entityId: original.id, entityReference: original.adjustmentNumber, reason: input.reason, previousValues: { status: original.status }, newValues: { status: OperationalDocumentStatus.REVERSED, reversalId: posted.id }, metadata: { reversalNumber: posted.adjustmentNumber } }, tx);
    return posted;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 90_000 });
}
