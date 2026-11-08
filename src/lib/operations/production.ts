import "server-only";

import {
  IdentifierType,
  InventoryMovementType,
  Prisma,
  ProductStatus,
  StockUnitStatus,
  TrackingMethod,
} from "@prisma/client";
import { ApiError } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { assertMakerChecker } from "@/lib/operating-mode";
import { decimal, moneyString } from "@/lib/finance/money";
import { isValidImei, normalizeImei } from "@/lib/imei";
import {
  allocateOperationalNumber,
  postOperationalJournal,
  requireOpenPeriod,
  requirePostingAccount,
  type OperationalActor,
} from "@/lib/operations/accounting";
import {
  applyStockMovement,
  enableInventoryPosting,
} from "@/lib/operations/inventory";
import { prisma } from "@/lib/prisma";

export type BomInput = {
  code: string;
  name: string;
  productId: string;
  variantId: string;
  outputQuantity?: number | string;
  scrapPercentage?: number | string;
  description?: string | null;
  items: Array<{
    componentProductId: string;
    componentVariantId: string;
    quantity: number | string;
    scrapTolerance?: number | string;
    notes?: string | null;
  }>;
};

export type ProductionOrderDraftInput = {
  branchId: string;
  bomId: string;
  sourceWarehouseId: string;
  targetWarehouseId: string;
  plannedQuantity: number | string;
  plannedStartDate: string;
  plannedEndDate: string;
  notes?: string | null;
};

export type ReceiveUnitInput = {
  imei1: string;
  imei2?: string | null;
  serialNumber?: string | null;
  qcResult?: string;
  qcNotes?: string | null;
};

export async function createBom(companyId: string, actorId: string, input: BomInput) {
  return await prisma.$transaction(async (tx) => {
    const existing = await tx.bom.findUnique({
      where: { companyId_code: { companyId, code: input.code.toUpperCase() } },
    });
    if (existing) {
      throw new ApiError(409, "BOM_CODE_EXISTS", `BOM with code ${input.code} already exists.`);
    }

    const product = await tx.product.findFirst({
      where: { id: input.productId, companyId, status: ProductStatus.ACTIVE },
      include: { variants: { where: { id: input.variantId } } },
    });
    if (!product || !product.variants.length) {
      throw new ApiError(404, "PRODUCT_NOT_FOUND", "Finished product or variant not found.");
    }

    const bom = await tx.bom.create({
      data: {
        companyId,
        code: input.code.toUpperCase(),
        name: input.name,
        productId: input.productId,
        variantId: input.variantId,
        outputQuantity: decimal(String(input.outputQuantity ?? 1)),
        scrapPercentage: decimal(String(input.scrapPercentage ?? 0)),
        description: input.description || null,
        items: {
          create: input.items.map((item) => ({
            componentProductId: item.componentProductId,
            componentVariantId: item.componentVariantId,
            quantity: decimal(String(item.quantity)),
            scrapTolerance: decimal(String(item.scrapTolerance ?? 0)),
            notes: item.notes || null,
          })),
        },
      },
      include: {
        product: { select: { sku: true, name: true } },
        variant: { select: { sku: true, name: true, color: true } },
        items: {
          include: {
            componentProduct: { select: { sku: true, name: true } },
            componentVariant: { select: { sku: true, name: true } },
          },
        },
      },
    });

    await appendAudit(
      {
        companyId,
        actorId,
        action: "BOM_CREATED",
        module: "production",
        entityType: "Bom",
        entityId: bom.id,
        entityReference: bom.code,
        newValues: input,
      },
      tx,
    );

    return bom;
  });
}

export async function createProductionOrder(
  companyId: string,
  actorId: string,
  input: ProductionOrderDraftInput,
) {
  return await prisma.$transaction(async (tx) => {
    const bom = await tx.bom.findFirst({
      where: { id: input.bomId, companyId, isActive: true },
      include: { items: true },
    });
    if (!bom || !bom.items.length) {
      throw new ApiError(404, "BOM_NOT_FOUND", "Active BOM with items is required.");
    }

    const [branch, sourceWh, targetWh] = await Promise.all([
      tx.branch.findFirst({ where: { id: input.branchId, companyId, isActive: true } }),
      tx.warehouse.findFirst({ where: { id: input.sourceWarehouseId, companyId, isActive: true } }),
      tx.warehouse.findFirst({ where: { id: input.targetWarehouseId, companyId, isActive: true } }),
    ]);
    if (!branch || !sourceWh || !targetWh) {
      throw new ApiError(400, "INVALID_FACILITY", "Branch and warehouses must be active and valid.");
    }

    const postingDate = new Date();
    const { number: orderNumber } = await allocateOperationalNumber(tx, {
      companyId,
      branchId: input.branchId,
      postingDate,
      documentType: "PRODUCTION_ORDER",
      suffix: "PRD",
    });

    const plannedQty = decimal(String(input.plannedQuantity));

    const order = await tx.productionOrder.create({
      data: {
        companyId,
        branchId: input.branchId,
        bomId: input.bomId,
        orderNumber,
        sourceWarehouseId: input.sourceWarehouseId,
        targetWarehouseId: input.targetWarehouseId,
        productId: bom.productId,
        variantId: bom.variantId,
        plannedQuantity: plannedQty,
        plannedStartDate: new Date(input.plannedStartDate),
        plannedEndDate: new Date(input.plannedEndDate),
        notes: input.notes || null,
        createdById: actorId,
        status: "DRAFT",
      },
      include: {
        bom: { include: { items: true } },
        product: { select: { sku: true, name: true } },
        variant: { select: { sku: true, name: true, color: true } },
        branch: { select: { code: true, name: true } },
        sourceWarehouse: { select: { code: true, name: true } },
        targetWarehouse: { select: { code: true, name: true } },
      },
    });

    await appendAudit(
      {
        companyId,
        actorId,
        branchId: input.branchId,
        action: "PRODUCTION_ORDER_CREATED",
        module: "production",
        entityType: "ProductionOrder",
        entityId: order.id,
        entityReference: order.orderNumber,
        newValues: input,
      },
      tx,
    );

    return order;
  });
}

export async function submitProductionOrder(companyId: string, orderId: string, actorId: string) {
  return await prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.findFirst({
      where: { id: orderId, companyId },
    });
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Production order not found.");
    if (order.status !== "DRAFT") {
      throw new ApiError(409, "INVALID_STATUS", `Cannot submit order in ${order.status} state.`);
    }

    const updated = await tx.productionOrder.update({
      where: { id: orderId },
      data: { status: "PLANNED" },
    });

    await appendAudit(
      {
        companyId,
        actorId,
        branchId: order.branchId,
        action: "PRODUCTION_ORDER_SUBMITTED",
        module: "production",
        entityType: "ProductionOrder",
        entityId: order.id,
        entityReference: order.orderNumber,
      },
      tx,
    );

    return updated;
  });
}

export async function approveProductionOrder(companyId: string, orderId: string, actorId: string) {
  return await prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.findFirst({
      where: { id: orderId, companyId },
    });
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Production order not found.");
    if (order.status !== "PLANNED") {
      throw new ApiError(409, "INVALID_STATUS", `Cannot approve order in ${order.status} state.`);
    }
    await assertMakerChecker(tx, companyId, order.createdById, actorId, "approve their own production order");

    const updated = await tx.productionOrder.update({
      where: { id: orderId },
      data: {
        status: "IN_PROGRESS",
        approvedById: actorId,
        actualStartDate: new Date(),
      },
    });

    await appendAudit(
      {
        companyId,
        actorId,
        branchId: order.branchId,
        action: "PRODUCTION_ORDER_APPROVED",
        module: "production",
        entityType: "ProductionOrder",
        entityId: order.id,
        entityReference: order.orderNumber,
      },
      tx,
    );

    return updated;
  });
}

export async function issueProductionMaterials(
  actor: OperationalActor,
  orderId: string,
) {
  return await prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.findFirst({
      where: { id: orderId, companyId: actor.companyId },
      include: {
        bom: { include: { items: { include: { componentProduct: true, componentVariant: true } } } },
      },
    });
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Production order not found.");
    if (!["IN_PROGRESS", "PLANNED"].includes(order.status)) {
      throw new ApiError(409, "INVALID_STATUS", `Cannot issue materials for order in ${order.status} status.`);
    }

    await enableInventoryPosting(tx);

    const postingDate = new Date();
    let totalMaterialCost = decimal("0");
    const issuedLines: Array<{
      productId: string;
      variantId: string;
      quantity: Prisma.Decimal;
      unitCost: Prisma.Decimal;
      totalCost: Prisma.Decimal;
    }> = [];

    for (const item of order.bom.items) {
      const requiredQty = decimal(item.quantity).times(order.plannedQuantity);

      // Check available stock in source warehouse
      const stockBalance = await tx.stockBalance.findFirst({
        where: {
          companyId: actor.companyId,
          warehouseId: order.sourceWarehouseId,
          productId: item.componentProductId,
          variantId: item.componentVariantId,
        },
      });

      const currentQty = stockBalance ? decimal(stockBalance.quantity) : decimal("0");
      if (currentQty.lt(requiredQty)) {
        throw new ApiError(
          422,
          "INSUFFICIENT_STOCK",
          `Insufficient stock in source warehouse for component ${item.componentProduct.sku}. Required: ${requiredQty}, Available: ${currentQty}.`,
        );
      }

      const unitCost = stockBalance && stockBalance.quantity.gt(0)
        ? stockBalance.inventoryValue.dividedBy(stockBalance.quantity)
        : item.componentVariant.purchasePrice;
      const lineCost = requiredQty.times(unitCost).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
      totalMaterialCost = totalMaterialCost.plus(lineCost);

      const idempotencyKey = `PRD-ISSUE-${order.id}-${item.id}`;
      const movement = await applyStockMovement(tx, {
        companyId: actor.companyId,
        branchId: order.branchId,
        warehouseId: order.sourceWarehouseId,
        productId: item.componentProductId,
        variantId: item.componentVariantId,
        movementType: InventoryMovementType.ADJUSTMENT_OUT,
        postingDate,
        quantity: requiredQty.negated(),
        unitCost,
        totalCost: lineCost.negated(),
        sourceDocumentType: "PRODUCTION_ORDER",
        sourceDocumentId: order.id,
        sourceDocumentNumber: order.orderNumber,
        lineReference: `ISSUE-${item.componentProduct.sku}`,
        movementGroupId: order.id,
        idempotencyKey,
        createdById: actor.userId,
      });

      await tx.productionMaterialIssue.create({
        data: {
          productionOrderId: order.id,
          productId: item.componentProductId,
          variantId: item.componentVariantId,
          warehouseId: order.sourceWarehouseId,
          quantity: requiredQty,
          unitCost,
          totalCost: lineCost,
          movementId: movement.id,
        },
      });

      issuedLines.push({
        productId: item.componentProductId,
        variantId: item.componentVariantId,
        quantity: requiredQty,
        unitCost,
        totalCost: lineCost,
      });
    }

    const unitCost = totalMaterialCost.dividedBy(order.plannedQuantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

    const updated = await tx.productionOrder.update({
      where: { id: order.id },
      data: {
        status: "IN_PROGRESS",
        totalCost: totalMaterialCost,
        unitCost,
      },
    });

    await appendAudit(
      {
        companyId: actor.companyId,
        actorId: actor.userId,
        branchId: order.branchId,
        action: "PRODUCTION_MATERIALS_ISSUED",
        module: "production",
        entityType: "ProductionOrder",
        entityId: order.id,
        entityReference: order.orderNumber,
        newValues: { totalMaterialCost: totalMaterialCost.toString(), componentsCount: issuedLines.length },
      },
      tx,
    );

    return { order: updated, issuedLines, totalMaterialCost: totalMaterialCost.toString() };
  });
}

export async function receiveFinishedGoods(
  actor: OperationalActor,
  orderId: string,
  units: ReceiveUnitInput[],
) {
  if (!units.length) {
    throw new ApiError(400, "NO_UNITS_PROVIDED", "At least one finished phone unit must be provided.");
  }

  return await prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.findFirst({
      where: { id: orderId, companyId: actor.companyId },
      include: {
        product: { select: { id: true, sku: true, name: true, trackingMethod: true } },
        variant: { select: { id: true, sku: true, name: true, purchasePrice: true } },
      },
    });
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Production order not found.");
    if (order.status !== "IN_PROGRESS") {
      throw new ApiError(409, "INVALID_STATUS", `Production order must be IN_PROGRESS to receive finished goods.`);
    }

    const currentCompleted = decimal(order.completedQuantity);
    const newTotal = currentCompleted.plus(units.length);
    if (newTotal.gt(order.plannedQuantity)) {
      throw new ApiError(
        422,
        "QUANTITY_EXCEEDED",
        `Receipt quantity (${units.length}) exceeds remaining planned order quantity (${order.plannedQuantity.minus(currentCompleted)}).`,
      );
    }

    await enableInventoryPosting(tx);

    const unitCost = order.unitCost.gt(0) ? order.unitCost : order.variant.purchasePrice;
    const postingDate = new Date();
    const createdUnits: string[] = [];

    for (let index = 0; index < units.length; index++) {
      const u = units[index];
      const imei1Clean = normalizeImei(u.imei1);
      if (!isValidImei(imei1Clean)) {
        throw new ApiError(422, "INVALID_IMEI", `IMEI 1 '${u.imei1}' is invalid (Luhn check failed).`);
      }

      // Check uniqueness of IMEI 1 in this company
      const conflict1 = await tx.deviceIdentifier.findFirst({
        where: { companyId: actor.companyId, normalizedValue: imei1Clean },
      });
      if (conflict1) {
        throw new ApiError(409, "DUPLICATE_IMEI", `IMEI '${u.imei1}' is already registered in this company.`);
      }

      let imei2Clean: string | null = null;
      if (u.imei2?.trim()) {
        imei2Clean = normalizeImei(u.imei2);
        if (!isValidImei(imei2Clean)) {
          throw new ApiError(422, "INVALID_IMEI", `IMEI 2 '${u.imei2}' is invalid (Luhn check failed).`);
        }
        if (imei2Clean === imei1Clean) {
          throw new ApiError(422, "IDENTICAL_IMEI", `IMEI 1 and IMEI 2 cannot be identical on device ${index + 1}.`);
        }
        const conflict2 = await tx.deviceIdentifier.findFirst({
          where: { companyId: actor.companyId, normalizedValue: imei2Clean },
        });
        if (conflict2) {
          throw new ApiError(409, "DUPLICATE_IMEI", `IMEI 2 '${u.imei2}' is already registered in this company.`);
        }
      }

      // Create PhysicalStockUnit
      const stockUnit = await tx.physicalStockUnit.create({
        data: {
          companyId: actor.companyId,
          productId: order.productId,
          variantId: order.variantId,
          currentBranchId: order.branchId,
          currentWarehouseId: order.targetWarehouseId,
          status: StockUnitStatus.IN_STOCK,
          acquisitionDate: postingDate,
          acquisitionCost: unitCost,
        },
      });

      // Create DeviceIdentifier for IMEI 1
      await tx.deviceIdentifier.create({
        data: {
          companyId: actor.companyId,
          stockUnitId: stockUnit.id,
          type: IdentifierType.IMEI,
          value: u.imei1.trim(),
          normalizedValue: imei1Clean,
          slot: 1,
          isPrimary: true,
        },
      });

      // Create DeviceIdentifier for IMEI 2
      if (imei2Clean) {
        await tx.deviceIdentifier.create({
          data: {
            companyId: actor.companyId,
            stockUnitId: stockUnit.id,
            type: IdentifierType.IMEI,
            value: u.imei2!.trim(),
            normalizedValue: imei2Clean,
            slot: 2,
            isPrimary: false,
          },
        });
      }

      // Create DeviceIdentifier for Serial Number
      if (u.serialNumber?.trim()) {
        await tx.deviceIdentifier.create({
          data: {
            companyId: actor.companyId,
            stockUnitId: stockUnit.id,
            type: IdentifierType.SERIAL,
            value: u.serialNumber.trim(),
            normalizedValue: u.serialNumber.trim().toUpperCase(),
            slot: 1,
            isPrimary: false,
          },
        });
      }

      // Link to ProductionOrderUnit
      await tx.productionOrderUnit.create({
        data: {
          productionOrderId: order.id,
          physicalStockUnitId: stockUnit.id,
          imei1: u.imei1.trim(),
          imei2: u.imei2?.trim() || null,
          serialNumber: u.serialNumber?.trim() || null,
          qcResult: u.qcResult || "PASS",
          qcNotes: u.qcNotes || null,
        },
      });

      // Apply Stock Movement into Target Warehouse
      const idempotencyKey = `PRD-RECEIPT-${order.id}-${stockUnit.id}`;
      await applyStockMovement(tx, {
        companyId: actor.companyId,
        branchId: order.branchId,
        warehouseId: order.targetWarehouseId,
        productId: order.productId,
        variantId: order.variantId,
        stockUnitId: stockUnit.id,
        movementType: InventoryMovementType.ADJUSTMENT_IN,
        postingDate,
        quantity: decimal("1"),
        unitCost,
        totalCost: unitCost,
        sourceDocumentType: "PRODUCTION_ORDER",
        sourceDocumentId: order.id,
        sourceDocumentNumber: order.orderNumber,
        lineReference: `FG-${u.imei1.trim()}`,
        movementGroupId: order.id,
        idempotencyKey,
        createdById: actor.userId,
      });

      createdUnits.push(stockUnit.id);
    }

    const nextCompleted = currentCompleted.plus(units.length);
    const isCompleted = nextCompleted.gte(order.plannedQuantity);

    const updated = await tx.productionOrder.update({
      where: { id: order.id },
      data: {
        completedQuantity: nextCompleted,
        status: isCompleted ? "COMPLETED" : "IN_PROGRESS",
        postedById: actor.userId,
        ...(isCompleted ? { actualEndDate: new Date() } : {}),
      },
    });

    await appendAudit(
      {
        companyId: actor.companyId,
        actorId: actor.userId,
        branchId: order.branchId,
        action: "PRODUCTION_UNITS_RECEIVED",
        module: "production",
        entityType: "ProductionOrder",
        entityId: order.id,
        entityReference: order.orderNumber,
        newValues: { receivedCount: units.length, totalCompleted: nextCompleted.toString() },
      },
      tx,
    );

    return { order: updated, receivedUnits: createdUnits.length };
  });
}
