import "server-only";

import {
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
import { allocateOperationalNumber, requireOpenPeriod, type OperationalActor } from "@/lib/operations/accounting";
import {
  applyStockMovement,
  assertSufficientBalance,
  averageUnitCost,
  enableInventoryPosting,
  lockPhysicalStockUnit,
} from "@/lib/operations/inventory";
import {
  operationReversalSchema,
  parseOperationDate,
  stockTransferDraftSchema,
} from "@/lib/operations/validation";
import { prisma } from "@/lib/prisma";

export type StockTransferDraftInput = z.infer<typeof stockTransferDraftSchema>;
export type StockTransferReversalInput = z.infer<typeof operationReversalSchema>;
type TransferActor = OperationalActor;

const round = (value: Prisma.Decimal) => value.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
const isSerialized = (tracking: TrackingMethod) => tracking === TrackingMethod.IMEI || tracking === TrackingMethod.SERIAL;
const postableTransferStatuses: OperationalDocumentStatus[] = [
  OperationalDocumentStatus.DRAFT,
  OperationalDocumentStatus.SUBMITTED,
  OperationalDocumentStatus.APPROVED,
];

const transferInclude = Prisma.validator<Prisma.StockTransferInclude>()({
  sourceBranch: { select: { id: true, code: true, name: true } },
  sourceWarehouse: { select: { id: true, code: true, name: true, isActive: true, allowDispatch: true } },
  destinationBranch: { select: { id: true, code: true, name: true } },
  destinationWarehouse: { select: { id: true, code: true, name: true, isActive: true, allowReceiving: true } },
  preparedBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
  postedBy: { select: { id: true, fullName: true } },
  reversedBy: { select: { id: true, fullName: true } },
  reversalOf: { select: { id: true, transferNumber: true, status: true } },
  reversal: { select: { id: true, transferNumber: true, status: true } },
  lines: {
    orderBy: { lineNumber: "asc" },
    include: {
      product: { select: { id: true, sku: true, name: true, status: true, trackingMethod: true } },
      variant: { select: { id: true, sku: true, name: true, isActive: true } },
      lot: { select: { id: true, lotNumber: true, expiryDate: true } },
      units: {
        include: {
          stockUnit: {
            include: { identifiers: { orderBy: [{ isPrimary: "desc" }, { type: "asc" }, { slot: "asc" }] } },
          },
        },
      },
    },
  },
});

export type StockTransferRecord = Prisma.StockTransferGetPayload<{ include: typeof transferInclude }>;

async function lockTransfer(tx: Prisma.TransactionClient, id: string, companyId: string) {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "StockTransfer" WHERE "id" = ${id}::uuid AND "companyId" = ${companyId}::uuid FOR UPDATE`,
  );
  return tx.stockTransfer.findFirst({ where: { id, companyId }, include: transferInclude });
}

async function validateWarehouses(
  tx: Prisma.TransactionClient,
  actor: TransferActor,
  input: Pick<
    StockTransferDraftInput,
    "sourceBranchId" | "sourceWarehouseId" | "destinationBranchId" | "destinationWarehouseId"
  >,
) {
  if (input.sourceWarehouseId === input.destinationWarehouseId) {
    throw new ApiError(422, "SAME_TRANSFER_WAREHOUSE", "Source and destination warehouses must be different.");
  }
  const [source, destination] = await Promise.all([
    tx.warehouse.findFirst({
      where: {
        id: input.sourceWarehouseId,
        companyId: actor.companyId,
        branchId: input.sourceBranchId,
        isActive: true,
      },
      select: { id: true, branchId: true, allowDispatch: true },
    }),
    tx.warehouse.findFirst({
      where: {
        id: input.destinationWarehouseId,
        companyId: actor.companyId,
        branchId: input.destinationBranchId,
        isActive: true,
      },
      select: { id: true, branchId: true, allowReceiving: true },
    }),
  ]);
  if (!source) throw new ApiError(404, "SOURCE_WAREHOUSE_NOT_FOUND", "The active source warehouse was not found in the selected branch.");
  if (!destination) throw new ApiError(404, "DESTINATION_WAREHOUSE_NOT_FOUND", "The active destination warehouse was not found in the selected branch.");
  if (!source.allowDispatch) throw new ApiError(409, "WAREHOUSE_DISPATCH_DISABLED", "The source warehouse does not allow dispatch.");
  if (!destination.allowReceiving) throw new ApiError(409, "WAREHOUSE_RECEIVING_DISABLED", "The destination warehouse does not allow receiving.");
  return { source, destination };
}

async function assertTransferQuantityAvailable(
  tx: Prisma.TransactionClient,
  input: { companyId: string; warehouseId: string; productId: string; variantId: string },
  balance: { quantity: Prisma.Decimal; inventoryValue: Prisma.Decimal } | null,
  requested: Prisma.Decimal,
) {
  assertSufficientBalance(balance, requested);
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
  const reserved = reservations._sum.quantity || zero();
  const available = balance!.quantity.minus(reserved);
  if (available.lt(requested)) {
    throw new ApiError(409, "INSUFFICIENT_AVAILABLE_STOCK", "Unreserved stock is below the requested transfer quantity.", {
      onHand: balance!.quantity.toFixed(4),
      reserved: reserved.toFixed(4),
      available: Prisma.Decimal.max(available, 0).toFixed(4),
      requested: requested.toFixed(4),
    });
  }
}

type PreparedTransferLine = {
  productId: string;
  variantId: string;
  lotId: string | null;
  lineNumber: number;
  description: string;
  trackingMethod: TrackingMethod;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  totalCost: Prisma.Decimal;
  stockUnitIds: string[];
};

async function prepareDraftLines(
  tx: Prisma.TransactionClient,
  actor: TransferActor,
  sourceBranchId: string,
  sourceWarehouseId: string,
  input: StockTransferDraftInput,
): Promise<PreparedTransferLine[]> {
  const identityKeys = input.lines.map((line) => `${line.variantId}:${line.lotId || "NO_LOT"}`);
  if (new Set(identityKeys).size !== identityKeys.length) {
    throw new ApiError(422, "DUPLICATE_TRANSFER_LINE", "Each variant and lot combination may appear only once on a transfer.");
  }
  const allUnitIds = input.lines.flatMap((line) => line.stockUnitIds);
  if (new Set(allUnitIds).size !== allUnitIds.length) {
    throw new ApiError(422, "DUPLICATE_STOCK_UNIT", "A physical stock unit may appear only once on a transfer.");
  }

  const products = await tx.product.findMany({
    where: { companyId: actor.companyId, id: { in: [...new Set(input.lines.map((line) => line.productId))] } },
    include: { variants: true },
  });
  const productMap = new Map(products.map((product) => [product.id, product]));
  const prepared: PreparedTransferLine[] = [];

  for (const [index, requested] of input.lines.entries()) {
    const product = productMap.get(requested.productId);
    if (!product || product.status !== ProductStatus.ACTIVE) {
      throw new ApiError(422, "PRODUCT_NOT_AVAILABLE", `Transfer line ${index + 1} uses an inactive or unavailable product.`);
    }
    const variant = product.variants.find((candidate) => candidate.id === requested.variantId);
    if (!variant || !variant.isActive || variant.companyId !== actor.companyId) {
      throw new ApiError(422, "VARIANT_NOT_AVAILABLE", `Transfer line ${index + 1} uses an inactive or mismatched variant.`);
    }
    const quantity = decimal(requested.quantity);
    const serialized = isSerialized(product.trackingMethod);
    if (product.trackingMethod === TrackingMethod.BATCH && !requested.lotId) {
      throw new ApiError(422, "BATCH_LOT_REQUIRED", `Transfer line ${index + 1} requires a lot.`);
    }
    if (serialized && (!quantity.isInteger() || requested.stockUnitIds.length !== quantity.toNumber())) {
      throw new ApiError(
        422,
        "SERIALIZED_QUANTITY_MISMATCH",
        `Transfer line ${index + 1} requires exactly one selected physical unit per whole item.`,
      );
    }
    if (!serialized && requested.stockUnitIds.length) {
      throw new ApiError(422, "UNEXPECTED_STOCK_UNITS", `Transfer line ${index + 1} is quantity tracked and cannot contain physical units.`);
    }

    let totalCost = zero();
    if (serialized) {
      const units = await tx.physicalStockUnit.findMany({
        where: { companyId: actor.companyId, id: { in: requested.stockUnitIds } },
        select: {
          id: true,
          productId: true,
          variantId: true,
          status: true,
          currentBranchId: true,
          currentWarehouseId: true,
          acquisitionCost: true,
        },
      });
      const unitMap = new Map(units.map((unit) => [unit.id, unit]));
      for (const stockUnitId of requested.stockUnitIds) {
        const unit = unitMap.get(stockUnitId);
        if (
          !unit ||
          unit.productId !== requested.productId ||
          unit.variantId !== requested.variantId ||
          unit.status !== StockUnitStatus.IN_STOCK ||
          unit.currentBranchId !== sourceBranchId ||
          unit.currentWarehouseId !== sourceWarehouseId
        ) {
          throw new ApiError(409, "TRANSFER_UNIT_UNAVAILABLE", `A physical unit on transfer line ${index + 1} is not available in the source warehouse.`);
        }
        const reserved = await tx.inventoryReservation.findFirst({
          where: {
            companyId: actor.companyId,
            stockUnitId,
            releasedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: { id: true },
        });
        if (reserved) throw new ApiError(409, "TRANSFER_UNIT_RESERVED", `A physical unit on transfer line ${index + 1} is actively reserved.`);
        totalCost = totalCost.plus(unit.acquisitionCost);
      }
      totalCost = round(totalCost);
    } else {
      if (requested.lotId) {
        const lot = await tx.inventoryLot.findFirst({
          where: {
            id: requested.lotId,
            companyId: actor.companyId,
            productId: requested.productId,
            variantId: requested.variantId,
          },
          select: { id: true },
        });
        if (!lot) throw new ApiError(422, "LOT_NOT_AVAILABLE", `Transfer line ${index + 1} uses an invalid lot.`);
      }
      const balance = await tx.stockBalance.findFirst({
        where: {
          companyId: actor.companyId,
          branchId: sourceBranchId,
          warehouseId: sourceWarehouseId,
          productId: requested.productId,
          variantId: requested.variantId,
          lotId: requested.lotId || null,
        },
      });
      await assertTransferQuantityAvailable(tx, {
        companyId: actor.companyId,
        warehouseId: sourceWarehouseId,
        productId: requested.productId,
        variantId: requested.variantId,
      }, balance, quantity);
      totalCost = quantity.eq(balance!.quantity)
        ? round(balance!.inventoryValue)
        : round(averageUnitCost(balance!).times(quantity));
    }
    const unitCost = round(totalCost.div(quantity));
    prepared.push({
      productId: requested.productId,
      variantId: requested.variantId,
      lotId: requested.lotId || null,
      lineNumber: index + 1,
      description: `${product.name} — ${variant.name}`,
      trackingMethod: product.trackingMethod,
      quantity,
      unitCost,
      totalCost,
      stockUnitIds: requested.stockUnitIds,
    });
  }
  return prepared;
}

export async function createStockTransferDraft(actor: TransferActor, input: StockTransferDraftInput) {
  const transferDate = parseOperationDate(input.transferDate, "Transfer date");
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.stockTransfer.findUnique({
        where: { companyId_idempotencyKey: { companyId: actor.companyId, idempotencyKey: input.idempotencyKey } },
        include: transferInclude,
      });
      if (existing) return existing;
      await validateWarehouses(tx, actor, input);
      const lines = await prepareDraftLines(tx, actor, input.sourceBranchId, input.sourceWarehouseId, input);
      const { number } = await allocateOperationalNumber(tx, {
        companyId: actor.companyId,
        branchId: input.sourceBranchId,
        postingDate: transferDate,
        documentType: "STOCK_TRANSFER",
        suffix: "ST",
      });
      const record = await tx.stockTransfer.create({
        data: {
          companyId: actor.companyId,
          sourceBranchId: input.sourceBranchId,
          sourceWarehouseId: input.sourceWarehouseId,
          destinationBranchId: input.destinationBranchId,
          destinationWarehouseId: input.destinationWarehouseId,
          transferNumber: number,
          transferDate,
          reference: input.reference || null,
          reason: input.reason,
          remarks: input.remarks || null,
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
              quantity: line.quantity,
              unitCost: line.unitCost,
              totalCost: line.totalCost,
              units: { create: line.stockUnitIds.map((stockUnitId) => ({ stockUnitId })) },
            })),
          },
        },
        include: transferInclude,
      });
      await appendAudit(
        {
          companyId: actor.companyId,
          actorId: actor.userId,
          branchId: record.sourceBranchId,
          warehouseId: record.sourceWarehouseId,
          action: "STOCK_TRANSFER_DRAFT_CREATED",
          module: "inventory",
          entityType: "StockTransfer",
          entityId: record.id,
          entityReference: record.transferNumber,
          newValues: {
            status: record.status,
            destinationWarehouseId: record.destinationWarehouseId,
            lineCount: record.lines.length,
          },
          metadata: { stockEffect: "NONE_UNTIL_POSTING" },
        },
        tx,
      );
      return record;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 },
  );
}

export async function updateStockTransferDraft(actor: TransferActor, id: string, input: StockTransferDraftInput) {
  const transferDate = parseOperationDate(input.transferDate, "Transfer date");
  return prisma.$transaction(
    async (tx) => {
      const existing = await lockTransfer(tx, id, actor.companyId);
      if (!existing) throw new ApiError(404, "TRANSFER_NOT_FOUND", "Stock transfer was not found.");
      if (existing.status !== OperationalDocumentStatus.DRAFT) {
        throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a draft stock transfer can be edited.");
      }
      if (existing.preparedById !== actor.userId) {
        throw new ApiError(403, "NOT_PREPARER", "Only the preparer may edit this draft stock transfer.");
      }
      if (input.idempotencyKey !== existing.idempotencyKey) {
        throw new ApiError(422, "IDEMPOTENCY_KEY_IMMUTABLE", "A draft's idempotency key cannot be changed.");
      }
      await validateWarehouses(tx, actor, input);
      await requireOpenPeriod(tx, actor.companyId, transferDate);
      const lines = await prepareDraftLines(tx, actor, input.sourceBranchId, input.sourceWarehouseId, input);
      await tx.stockTransferUnit.deleteMany({ where: { transferLine: { transferId: id } } });
      await tx.stockTransferLine.deleteMany({ where: { transferId: id } });
      return tx.stockTransfer.update({
        where: { id },
        data: {
          sourceBranchId: input.sourceBranchId,
          sourceWarehouseId: input.sourceWarehouseId,
          destinationBranchId: input.destinationBranchId,
          destinationWarehouseId: input.destinationWarehouseId,
          transferDate,
          reference: input.reference || null,
          reason: input.reason,
          remarks: input.remarks || null,
          lines: {
            create: lines.map((line) => ({
              productId: line.productId,
              variantId: line.variantId,
              lotId: line.lotId,
              lineNumber: line.lineNumber,
              description: line.description,
              trackingMethod: line.trackingMethod,
              quantity: line.quantity,
              unitCost: line.unitCost,
              totalCost: line.totalCost,
              units: { create: line.stockUnitIds.map((stockUnitId) => ({ stockUnitId })) },
            })),
          },
        },
        include: transferInclude,
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 },
  );
}

export async function submitStockTransfer(actor: TransferActor, id: string) {
  return prisma.$transaction(async (tx) => {
    const record = await lockTransfer(tx, id, actor.companyId);
    if (!record) throw new ApiError(404, "TRANSFER_NOT_FOUND", "Stock transfer was not found.");
    if (record.status !== OperationalDocumentStatus.DRAFT) {
      throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a draft stock transfer can be submitted.");
    }
    if (record.preparedById !== actor.userId) throw new ApiError(403, "NOT_PREPARER", "Only the preparer may submit this transfer.");
    const updated = await tx.stockTransfer.update({
      where: { id },
      data: { status: OperationalDocumentStatus.SUBMITTED, submittedAt: new Date() },
      include: transferInclude,
    });
    await appendAudit({
      companyId: actor.companyId,
      actorId: actor.userId,
      branchId: record.sourceBranchId,
      warehouseId: record.sourceWarehouseId,
      action: "STOCK_TRANSFER_SUBMITTED",
      module: "inventory",
      entityType: "StockTransfer",
      entityId: record.id,
      entityReference: record.transferNumber,
      previousValues: { status: record.status },
      newValues: { status: updated.status },
    }, tx);
    return updated;
  });
}

export async function approveStockTransfer(actor: TransferActor, id: string) {
  return prisma.$transaction(async (tx) => {
    const record = await lockTransfer(tx, id, actor.companyId);
    if (!record) throw new ApiError(404, "TRANSFER_NOT_FOUND", "Stock transfer was not found.");
    if (record.status !== OperationalDocumentStatus.SUBMITTED) {
      throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a submitted stock transfer can be approved.");
    }
    await assertMakerChecker(tx, actor.companyId, record.preparedById, actor.userId, "approve the same stock transfer");
    const updated = await tx.stockTransfer.update({
      where: { id },
      data: { status: OperationalDocumentStatus.APPROVED, approvedById: actor.userId, approvedAt: new Date() },
      include: transferInclude,
    });
    await appendAudit({
      companyId: actor.companyId,
      actorId: actor.userId,
      branchId: record.sourceBranchId,
      warehouseId: record.sourceWarehouseId,
      action: "STOCK_TRANSFER_APPROVED",
      module: "inventory",
      entityType: "StockTransfer",
      entityId: record.id,
      entityReference: record.transferNumber,
      previousValues: { status: record.status },
      newValues: { status: updated.status },
    }, tx);
    return updated;
  });
}

type OriginalMovementMap = Map<string, { id: string; quantity: Prisma.Decimal; totalCost: Prisma.Decimal }>;
const movementMapKey = (lineNumber: number, movementType: InventoryMovementType, stockUnitId: string | null) =>
  `${lineNumber}:${movementType}:${stockUnitId || "QTY"}`;

async function postTransferWithinTransaction(
  tx: Prisma.TransactionClient,
  actor: TransferActor,
  record: StockTransferRecord,
  originalMovements?: OriginalMovementMap,
) {
  if (!postableTransferStatuses.includes(record.status)) {
    throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a draft, submitted, or approved stock transfer can be posted.");
  }
  if (!record.sourceWarehouse.isActive || !record.sourceWarehouse.allowDispatch) {
    throw new ApiError(409, "SOURCE_WAREHOUSE_UNAVAILABLE", "The source warehouse is no longer active for dispatch.");
  }
  if (!record.destinationWarehouse.isActive || !record.destinationWarehouse.allowReceiving) {
    throw new ApiError(409, "DESTINATION_WAREHOUSE_UNAVAILABLE", "The destination warehouse is no longer active for receiving.");
  }
  await requireOpenPeriod(tx, actor.companyId, record.transferDate);
  await enableInventoryPosting(tx);
  const movementGroupId = crypto.randomUUID();

  for (const line of record.lines) {
    if (line.product.status !== ProductStatus.ACTIVE || !line.variant.isActive || line.product.trackingMethod !== line.trackingMethod) {
      throw new ApiError(409, "TRANSFER_PRODUCT_UNAVAILABLE", `Product on transfer line ${line.lineNumber} is inactive or its tracking configuration changed.`);
    }
    const serialized = isSerialized(line.trackingMethod);
    let lineTotalCost = zero();

    if (serialized) {
      if (!line.quantity.isInteger() || line.units.length !== line.quantity.toNumber()) {
        throw new ApiError(409, "SERIALIZED_QUANTITY_MISMATCH", `Transfer line ${line.lineNumber} no longer has exactly one unit per item.`);
      }
      const lockedUnits = [];
      for (const link of line.units) {
        const unit = await lockPhysicalStockUnit(tx, { companyId: actor.companyId, stockUnitId: link.stockUnitId });
        if (
          unit.productId !== line.productId ||
          unit.variantId !== line.variantId ||
          unit.status !== StockUnitStatus.IN_STOCK ||
          unit.currentBranchId !== record.sourceBranchId ||
          unit.currentWarehouseId !== record.sourceWarehouseId
        ) {
          throw new ApiError(409, "TRANSFER_UNIT_UNAVAILABLE", `A physical unit on line ${line.lineNumber} is no longer available at the source.`);
        }
        const reserved = await tx.inventoryReservation.findFirst({
          where: {
            companyId: actor.companyId,
            stockUnitId: unit.id,
            releasedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: { id: true },
        });
        if (reserved) throw new ApiError(409, "TRANSFER_UNIT_RESERVED", `A physical unit on line ${line.lineNumber} is actively reserved.`);
        lineTotalCost = lineTotalCost.plus(unit.acquisitionCost);
        lockedUnits.push(unit);
      }
      lineTotalCost = round(lineTotalCost);
      await tx.stockTransferLine.update({
        where: { id: line.id },
        data: { unitCost: round(lineTotalCost.div(line.quantity)), totalCost: lineTotalCost },
      });

      for (const unit of lockedUnits) {
        const originalIn = originalMovements?.get(movementMapKey(line.lineNumber, InventoryMovementType.TRANSFER_IN, unit.id));
        const originalOut = originalMovements?.get(movementMapKey(line.lineNumber, InventoryMovementType.TRANSFER_OUT, unit.id));
        if (originalMovements && (!originalIn || !originalOut)) {
          throw new ApiError(409, "REVERSAL_MOVEMENT_MISSING", `Original stock effects for unit on line ${line.lineNumber} are incomplete.`);
        }
        await applyStockMovement(tx, {
          companyId: actor.companyId,
          branchId: record.sourceBranchId,
          warehouseId: record.sourceWarehouseId,
          productId: line.productId,
          variantId: line.variantId,
          stockUnitId: unit.id,
          movementGroupId,
          reversalOfId: originalIn?.id,
          idempotencyKey: `STO:${record.id}:${line.id}:${unit.id}`,
          movementType: InventoryMovementType.TRANSFER_OUT,
          postingDate: record.transferDate,
          quantity: "-1",
          unitCost: unit.acquisitionCost,
          totalCost: unit.acquisitionCost.negated(),
          sourceDocumentType: "StockTransfer",
          sourceDocumentId: record.id,
          sourceDocumentNumber: record.transferNumber,
          lineReference: line.id,
          createdById: actor.userId,
        });
        await applyStockMovement(tx, {
          companyId: actor.companyId,
          branchId: record.destinationBranchId,
          warehouseId: record.destinationWarehouseId,
          productId: line.productId,
          variantId: line.variantId,
          stockUnitId: unit.id,
          movementGroupId,
          reversalOfId: originalOut?.id,
          idempotencyKey: `STI:${record.id}:${line.id}:${unit.id}`,
          movementType: InventoryMovementType.TRANSFER_IN,
          postingDate: record.transferDate,
          quantity: "1",
          unitCost: unit.acquisitionCost,
          totalCost: unit.acquisitionCost,
          sourceDocumentType: "StockTransfer",
          sourceDocumentId: record.id,
          sourceDocumentNumber: record.transferNumber,
          lineReference: line.id,
          createdById: actor.userId,
        });
        await tx.physicalStockUnit.update({
          where: { id: unit.id },
          data: {
            currentBranchId: record.destinationBranchId,
            currentWarehouseId: record.destinationWarehouseId,
            currentLocationId: null,
            version: { increment: 1 },
          },
        });
      }
    } else {
      if (line.trackingMethod === TrackingMethod.BATCH && !line.lotId) {
        throw new ApiError(409, "BATCH_LOT_REQUIRED", `Transfer line ${line.lineNumber} requires a lot.`);
      }
      if (line.units.length) throw new ApiError(409, "UNEXPECTED_STOCK_UNITS", `Quantity line ${line.lineNumber} cannot contain physical units.`);
      if (line.lotId) {
        const lot = await tx.inventoryLot.findFirst({
          where: { id: line.lotId, companyId: actor.companyId, productId: line.productId, variantId: line.variantId },
          select: { id: true },
        });
        if (!lot) throw new ApiError(409, "LOT_NOT_AVAILABLE", `Lot on transfer line ${line.lineNumber} is no longer available.`);
      }
      if (line.lotId) {
        await tx.$queryRaw(Prisma.sql`
          SELECT "id" FROM "StockBalance"
          WHERE "companyId"=${actor.companyId}::uuid AND "branchId"=${record.sourceBranchId}::uuid
            AND "warehouseId"=${record.sourceWarehouseId}::uuid AND "productId"=${line.productId}::uuid
            AND "variantId"=${line.variantId}::uuid AND "lotId"=${line.lotId}::uuid FOR UPDATE
        `);
      } else {
        await tx.$queryRaw(Prisma.sql`
          SELECT "id" FROM "StockBalance"
          WHERE "companyId"=${actor.companyId}::uuid AND "branchId"=${record.sourceBranchId}::uuid
            AND "warehouseId"=${record.sourceWarehouseId}::uuid AND "productId"=${line.productId}::uuid
            AND "variantId"=${line.variantId}::uuid AND "lotId" IS NULL FOR UPDATE
        `);
      }
      const balance = await tx.stockBalance.findFirst({
        where: {
          companyId: actor.companyId,
          branchId: record.sourceBranchId,
          warehouseId: record.sourceWarehouseId,
          productId: line.productId,
          variantId: line.variantId,
          lotId: line.lotId,
        },
      });
      await assertTransferQuantityAvailable(tx, {
        companyId: actor.companyId,
        warehouseId: record.sourceWarehouseId,
        productId: line.productId,
        variantId: line.variantId,
      }, balance, line.quantity);
      const originalIn = originalMovements?.get(movementMapKey(line.lineNumber, InventoryMovementType.TRANSFER_IN, null));
      const originalOut = originalMovements?.get(movementMapKey(line.lineNumber, InventoryMovementType.TRANSFER_OUT, null));
      if (originalMovements && (!originalIn || !originalOut)) {
        throw new ApiError(409, "REVERSAL_MOVEMENT_MISSING", `Original stock effects for quantity line ${line.lineNumber} are incomplete.`);
      }
      // A reversal removes the exact value introduced by the original transfer;
      // ordinary transfers use the source warehouse's current weighted value.
      lineTotalCost = originalIn
        ? round(originalIn.totalCost)
        : line.quantity.eq(balance!.quantity)
          ? round(balance!.inventoryValue)
          : round(averageUnitCost(balance!).times(line.quantity));
      const lineUnitCost = round(lineTotalCost.div(line.quantity));
      await tx.stockTransferLine.update({
        where: { id: line.id },
        data: { unitCost: lineUnitCost, totalCost: lineTotalCost },
      });
      await applyStockMovement(tx, {
        companyId: actor.companyId,
        branchId: record.sourceBranchId,
        warehouseId: record.sourceWarehouseId,
        productId: line.productId,
        variantId: line.variantId,
        lotId: line.lotId,
        movementGroupId,
        reversalOfId: originalIn?.id,
        idempotencyKey: `STO:${record.id}:${line.id}:QTY`,
        movementType: InventoryMovementType.TRANSFER_OUT,
        postingDate: record.transferDate,
        quantity: line.quantity.negated(),
        unitCost: lineUnitCost,
        totalCost: lineTotalCost.negated(),
        sourceDocumentType: "StockTransfer",
        sourceDocumentId: record.id,
        sourceDocumentNumber: record.transferNumber,
        lineReference: line.id,
        createdById: actor.userId,
      });
      await applyStockMovement(tx, {
        companyId: actor.companyId,
        branchId: record.destinationBranchId,
        warehouseId: record.destinationWarehouseId,
        productId: line.productId,
        variantId: line.variantId,
        lotId: line.lotId,
        movementGroupId,
        reversalOfId: originalOut?.id,
        idempotencyKey: `STI:${record.id}:${line.id}:QTY`,
        movementType: InventoryMovementType.TRANSFER_IN,
        postingDate: record.transferDate,
        quantity: line.quantity,
        unitCost: lineUnitCost,
        totalCost: lineTotalCost,
        sourceDocumentType: "StockTransfer",
        sourceDocumentId: record.id,
        sourceDocumentNumber: record.transferNumber,
        lineReference: line.id,
        createdById: actor.userId,
      });
    }
  }

  const posted = await tx.stockTransfer.update({
    where: { id: record.id },
    data: { status: OperationalDocumentStatus.POSTED, postedById: actor.userId, postedAt: new Date() },
    include: transferInclude,
  });
  await appendAudit({
    companyId: actor.companyId,
    actorId: actor.userId,
    branchId: record.sourceBranchId,
    warehouseId: record.sourceWarehouseId,
    action: record.reversalOfId ? "STOCK_TRANSFER_REVERSAL_POSTED" : "STOCK_TRANSFER_POSTED",
    module: "inventory",
    entityType: "StockTransfer",
    entityId: record.id,
    entityReference: record.transferNumber,
    previousValues: { status: record.status },
    newValues: { status: posted.status, destinationWarehouseId: posted.destinationWarehouseId },
    metadata: {
      movementGroupId,
      lineCount: posted.lines.length,
      totalCost: moneyString(posted.lines.reduce((sum, line) => sum.plus(line.totalCost), zero())),
      reversalOfId: record.reversalOfId,
    },
  }, tx);
  return posted;
}

export async function postStockTransfer(actor: TransferActor, id: string) {
  return prisma.$transaction(
    async (tx) => {
      const record = await lockTransfer(tx, id, actor.companyId);
      if (!record) throw new ApiError(404, "TRANSFER_NOT_FOUND", "Stock transfer was not found.");
      if (record.status === OperationalDocumentStatus.POSTED || record.status === OperationalDocumentStatus.REVERSED) return record;
      if (record.reversalOfId) throw new ApiError(409, "REVERSAL_REQUIRES_AUTHORIZED_FLOW", "Use the authorized reversal workflow for reversal transfers.");
      return postTransferWithinTransaction(tx, actor, record);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 45_000 },
  );
}

export async function cancelStockTransfer(actor: TransferActor, id: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const record = await lockTransfer(tx, id, actor.companyId);
    if (!record) throw new ApiError(404, "TRANSFER_NOT_FOUND", "Stock transfer was not found.");
    if (!postableTransferStatuses.includes(record.status)) {
      throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only an unposted stock transfer can be cancelled.");
    }
    const updated = await tx.stockTransfer.update({
      where: { id },
      data: { status: OperationalDocumentStatus.CANCELLED, cancelledAt: new Date() },
      include: transferInclude,
    });
    await appendAudit({
      companyId: actor.companyId,
      actorId: actor.userId,
      branchId: record.sourceBranchId,
      warehouseId: record.sourceWarehouseId,
      action: "STOCK_TRANSFER_CANCELLED",
      module: "inventory",
      entityType: "StockTransfer",
      entityId: record.id,
      entityReference: record.transferNumber,
      reason,
      previousValues: { status: record.status },
      newValues: { status: updated.status },
      metadata: { stockEffect: "NONE" },
    }, tx);
    return updated;
  });
}

export async function reverseStockTransfer(actor: TransferActor, id: string, input: StockTransferReversalInput) {
  const postingDate = parseOperationDate(input.postingDate, "Reversal date");
  return prisma.$transaction(
    async (tx) => {
      const original = await lockTransfer(tx, id, actor.companyId);
      if (!original) throw new ApiError(404, "TRANSFER_NOT_FOUND", "Stock transfer was not found.");
      if (original.reversalOfId) throw new ApiError(409, "REVERSAL_OF_REVERSAL", "A reversal transfer cannot itself be reversed.");
      if (original.status === OperationalDocumentStatus.REVERSED && original.reversal) {
        const existing = await tx.stockTransfer.findFirst({ where: { id: original.reversal.id, companyId: actor.companyId }, include: transferInclude });
        if (existing) return existing;
      }
      if (original.status !== OperationalDocumentStatus.POSTED) {
        throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only an active posted stock transfer can be reversed.");
      }
      const idempotent = await tx.stockTransfer.findUnique({
        where: { companyId_idempotencyKey: { companyId: actor.companyId, idempotencyKey: input.idempotencyKey } },
        include: transferInclude,
      });
      if (idempotent) {
        if (idempotent.reversalOfId !== original.id) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "The reversal key belongs to another stock transfer.");
        return idempotent;
      }
      await validateWarehouses(tx, actor, {
        sourceBranchId: original.destinationBranchId,
        sourceWarehouseId: original.destinationWarehouseId,
        destinationBranchId: original.sourceBranchId,
        destinationWarehouseId: original.sourceWarehouseId,
      });
      const { number } = await allocateOperationalNumber(tx, {
        companyId: actor.companyId,
        branchId: original.destinationBranchId,
        postingDate,
        documentType: "STOCK_TRANSFER_REVERSAL",
        suffix: "STR",
      });
      const reversal = await tx.stockTransfer.create({
        data: {
          companyId: actor.companyId,
          sourceBranchId: original.destinationBranchId,
          sourceWarehouseId: original.destinationWarehouseId,
          destinationBranchId: original.sourceBranchId,
          destinationWarehouseId: original.sourceWarehouseId,
          reversalOfId: original.id,
          transferNumber: number,
          transferDate: postingDate,
          reference: original.transferNumber,
          reason: input.reason,
          remarks: `Authorized reversal of ${original.transferNumber}`,
          preparedById: actor.userId,
          idempotencyKey: input.idempotencyKey,
          lines: {
            create: original.lines.map((line) => ({
              productId: line.productId,
              variantId: line.variantId,
              lotId: line.lotId,
              lineNumber: line.lineNumber,
              description: `Reversal: ${line.description}`,
              trackingMethod: line.trackingMethod,
              quantity: line.quantity,
              unitCost: line.unitCost,
              totalCost: line.totalCost,
              units: { create: line.units.map((link) => ({ stockUnitId: link.stockUnitId })) },
            })),
          },
        },
        include: transferInclude,
      });
      const originalLineNumber = new Map(original.lines.map((line) => [line.id, line.lineNumber]));
      const movements = await tx.inventoryMovement.findMany({
        where: {
          companyId: actor.companyId,
          sourceDocumentType: "StockTransfer",
          sourceDocumentId: original.id,
          movementType: { in: [InventoryMovementType.TRANSFER_OUT, InventoryMovementType.TRANSFER_IN] },
        },
        select: { id: true, lineReference: true, movementType: true, stockUnitId: true, quantity: true, totalCost: true },
      });
      const movementMap: OriginalMovementMap = new Map();
      for (const movement of movements) {
        const lineNumber = originalLineNumber.get(movement.lineReference || "");
        if (!lineNumber) throw new ApiError(409, "ORIGINAL_MOVEMENT_INVALID", "The original transfer contains an unrecognized stock movement.");
        movementMap.set(movementMapKey(lineNumber, movement.movementType, movement.stockUnitId), movement);
      }
      const posted = await postTransferWithinTransaction(tx, actor, reversal, movementMap);
      await tx.stockTransfer.update({
        where: { id: original.id },
        data: { status: OperationalDocumentStatus.REVERSED, reversedById: actor.userId, reversedAt: new Date() },
      });
      await appendAudit({
        companyId: actor.companyId,
        actorId: actor.userId,
        branchId: original.sourceBranchId,
        warehouseId: original.sourceWarehouseId,
        action: "STOCK_TRANSFER_REVERSED",
        module: "inventory",
        entityType: "StockTransfer",
        entityId: original.id,
        entityReference: original.transferNumber,
        reason: input.reason,
        previousValues: { status: original.status },
        newValues: { status: OperationalDocumentStatus.REVERSED, reversalId: posted.id },
        metadata: { reversalNumber: posted.transferNumber },
      }, tx);
      return posted;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 60_000 },
  );
}

export { transferInclude };
