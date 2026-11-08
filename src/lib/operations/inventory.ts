import "server-only";

import {
  IdentifierType,
  InventoryMovementType,
  Prisma,
  StockUnitStatus,
  type TrackingMethod,
} from "@prisma/client";
import { ApiError } from "@/lib/api";
import { decimal, moneyString } from "@/lib/finance/money";
import { isValidImei, normalizeImei } from "@/lib/imei";

export type StockMovementInput = {
  companyId: string;
  branchId: string;
  warehouseId: string;
  locationId?: string | null;
  productId: string;
  variantId: string;
  stockUnitId?: string | null;
  lotId?: string | null;
  journalEntryId?: string | null;
  reversalOfId?: string | null;
  movementGroupId: string;
  idempotencyKey: string;
  movementType: InventoryMovementType;
  postingDate: Date;
  quantity: Prisma.Decimal | string;
  unitCost: Prisma.Decimal | string;
  totalCost?: Prisma.Decimal | string;
  allowUnitCostRounding?: boolean;
  sourceDocumentType: string;
  sourceDocumentId: string;
  sourceDocumentNumber: string;
  lineReference: string;
  notes?: string | null;
  createdById: string;
};

export type DeviceIdentifierDraft = {
  type: IdentifierType;
  value: string;
  slot?: number | null;
  isPrimary?: boolean;
};

export async function enableInventoryPosting(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT set_config('app.inventory_posting', 'on', true)`;
}

export function stockBalanceKey(input: {
  branchId: string;
  warehouseId: string;
  productId: string;
  variantId: string;
  lotId?: string | null;
}) {
  return [input.branchId, input.warehouseId, input.productId, input.variantId, input.lotId || "NOLOT"].join(":");
}

export async function applyStockMovement(tx: Prisma.TransactionClient, input: StockMovementInput) {
  const existing = await tx.inventoryMovement.findUnique({
    where: {
      companyId_idempotencyKey: {
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (existing) return existing;

  const quantity = decimal(input.quantity);
  const unitCost = decimal(input.unitCost);
  const calculatedTotal = quantity.times(unitCost).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
  const totalCost = input.totalCost === undefined ? calculatedTotal : decimal(input.totalCost);
  const costDifference = totalCost.minus(calculatedTotal).abs();
  const unitRoundingTolerance = quantity.abs().times("0.00005").plus("0.0001");
  if (costDifference.gt("0.0001") && (!input.allowUnitCostRounding || costDifference.gt(unitRoundingTolerance))) {
    throw new ApiError(422, "INVALID_MOVEMENT_VALUE", "Movement total differs from quantity times unit cost beyond permitted unit-cost rounding tolerance.");
  }
  const key = stockBalanceKey(input);
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "StockBalance"
    WHERE "companyId" = ${input.companyId}::uuid
      AND "branchId" = ${input.branchId}::uuid
      AND "warehouseId" = ${input.warehouseId}::uuid
      AND "productId" = ${input.productId}::uuid
      AND "variantId" = ${input.variantId}::uuid
      AND "lotId" IS NOT DISTINCT FROM ${input.lotId || null}::uuid
    FOR UPDATE
  `);
  const current = await tx.stockBalance.findFirst({
    where: {
      companyId: input.companyId,
      branchId: input.branchId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      variantId: input.variantId,
      lotId: input.lotId || null,
    },
  });
  const nextQuantity = (current?.quantity || new Prisma.Decimal(0)).plus(quantity).toDecimalPlaces(4);
  const nextValue = (current?.inventoryValue || new Prisma.Decimal(0)).plus(totalCost).toDecimalPlaces(4);
  if (nextQuantity.lt(0) || nextValue.lt(0)) {
    throw new ApiError(409, "INSUFFICIENT_STOCK", "The stock movement would create a negative quantity or inventory value.", {
      availableQuantity: current?.quantity.toFixed(4) || "0.0000",
      requestedQuantity: quantity.abs().toFixed(4),
      availableValue: current?.inventoryValue.toFixed(4) || "0.0000",
      movementValue: totalCost.abs().toFixed(4),
    });
  }

  const movement = await tx.inventoryMovement.create({
    data: {
      companyId: input.companyId,
      branchId: input.branchId,
      warehouseId: input.warehouseId,
      locationId: input.locationId || null,
      productId: input.productId,
      variantId: input.variantId,
      stockUnitId: input.stockUnitId || null,
      lotId: input.lotId || null,
      journalEntryId: input.journalEntryId || null,
      reversalOfId: input.reversalOfId || null,
      movementGroupId: input.movementGroupId,
      idempotencyKey: input.idempotencyKey,
      movementType: input.movementType,
      postingDate: input.postingDate,
      quantity,
      unitCost,
      totalCost,
      sourceDocumentType: input.sourceDocumentType,
      sourceDocumentId: input.sourceDocumentId,
      sourceDocumentNumber: input.sourceDocumentNumber,
      lineReference: input.lineReference,
      notes: input.notes || null,
      createdById: input.createdById,
    },
  });

  if (current) {
    const result = await tx.stockBalance.updateMany({
      where: { id: current.id, version: current.version },
      data: {
        quantity: nextQuantity,
        inventoryValue: nextValue,
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) throw new ApiError(409, "STOCK_CONCURRENCY_CONFLICT", "Stock changed concurrently; retry the posting.");
  } else {
    await tx.stockBalance.create({
      data: {
        companyId: input.companyId,
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        variantId: input.variantId,
        lotId: input.lotId || null,
        balanceKey: key,
        quantity: nextQuantity,
        inventoryValue: nextValue,
      },
    });
  }
  return movement;
}

export function normalizeDeviceIdentifiers(
  trackingMethod: TrackingMethod,
  identifiers: DeviceIdentifierDraft[],
) {
  if (!identifiers.length) throw new ApiError(422, "IDENTIFIER_REQUIRED", "Serialized stock requires at least one identifier.");
  const normalized = identifiers.map((identifier, index) => {
    const value = identifier.value.trim();
    if (!value) throw new ApiError(422, "INVALID_IDENTIFIER", `Identifier ${index + 1} is blank.`);
    const normalizedValue = identifier.type === IdentifierType.IMEI
      ? normalizeImei(value)
      : value.replace(/\s+/g, "").toUpperCase();
    if (identifier.type === IdentifierType.IMEI && !isValidImei(normalizedValue)) {
      throw new ApiError(422, "INVALID_IMEI", `${value} is not a valid 15-digit IMEI with a valid Luhn check digit.`);
    }
    return {
      type: identifier.type,
      value,
      normalizedValue,
      slot: identifier.slot || null,
      isPrimary: identifier.isPrimary ?? index === 0,
    };
  });
  const seenUnitIdentifiers = new Set<string>();
  for (const identifier of normalized) {
    const key = `${identifier.type}:${identifier.normalizedValue}`;
    if (seenUnitIdentifiers.has(key)) {
      if (identifier.type === IdentifierType.IMEI) {
        throw new ApiError(422, "DUPLICATE_IDENTIFIER", `Dual-SIM device cannot have identical IMEI 1 and IMEI 2: ${identifier.value}. Each SIM slot requires a distinct IMEI.`);
      }
      throw new ApiError(422, "DUPLICATE_IDENTIFIER", `Identifier ${identifier.value} is duplicated on the same physical unit.`);
    }
    seenUnitIdentifiers.add(key);
  }
  if (normalized.filter((identifier) => identifier.isPrimary).length !== 1) {
    throw new ApiError(422, "PRIMARY_IDENTIFIER_REQUIRED", "Exactly one identifier must be marked primary.");
  }
  const imeis = normalized.filter((identifier) => identifier.type === IdentifierType.IMEI);
  if (trackingMethod === "IMEI" && !imeis.length) {
    throw new ApiError(422, "IMEI_REQUIRED", "IMEI-tracked stock requires at least one valid IMEI.");
  }
  const slots = imeis.map((identifier) => identifier.slot);
  if (imeis.some((identifier) => !identifier.slot) || new Set(slots).size !== slots.length) {
    throw new ApiError(422, "IMEI_SLOT_REQUIRED", "Every IMEI must have a unique SIM slot number on its physical stock unit.");
  }
  return normalized;
}

export async function lockPhysicalStockUnit(
  tx: Prisma.TransactionClient,
  input: { companyId: string; stockUnitId: string },
) {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "PhysicalStockUnit"
    WHERE "id" = ${input.stockUnitId}::uuid AND "companyId" = ${input.companyId}::uuid
    FOR UPDATE
  `);
  const unit = await tx.physicalStockUnit.findFirst({
    where: { id: input.stockUnitId, companyId: input.companyId },
    include: { identifiers: { orderBy: [{ isPrimary: "desc" }, { slot: "asc" }] } },
  });
  if (!unit) throw new ApiError(404, "STOCK_UNIT_NOT_FOUND", "The physical stock unit was not found.");
  return unit;
}

export function assertUnitAvailable(unit: { status: StockUnitStatus; currentWarehouseId: string | null }, warehouseId: string) {
  if (unit.status !== StockUnitStatus.IN_STOCK || unit.currentWarehouseId !== warehouseId) {
    throw new ApiError(409, "STOCK_UNIT_UNAVAILABLE", "The selected physical stock unit is not available in this warehouse.");
  }
}

export function averageUnitCost(balance: { quantity: Prisma.Decimal; inventoryValue: Prisma.Decimal }) {
  if (balance.quantity.lte(0)) throw new ApiError(409, "NO_STOCK", "No stock is available for this item.");
  return balance.inventoryValue.div(balance.quantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

export function assertSufficientBalance(
  balance: { quantity: Prisma.Decimal; inventoryValue: Prisma.Decimal } | null,
  requested: Prisma.Decimal,
) {
  if (!balance || balance.quantity.lt(requested)) {
    throw new ApiError(409, "INSUFFICIENT_STOCK", "Available stock is below the requested quantity.", {
      available: balance?.quantity.toFixed(4) || "0.0000",
      requested: requested.toFixed(4),
    });
  }
  if (balance.inventoryValue.lt(0)) {
    throw new ApiError(409, "INVALID_STOCK_VALUE", `Inventory has an invalid value of ${moneyString(balance.inventoryValue)}.`);
  }
}
