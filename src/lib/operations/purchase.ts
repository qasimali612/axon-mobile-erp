import "server-only";

import {
  IdentifierType,
  InventoryMovementType,
  OperationalDocumentStatus,
  Prisma,
  ProductStatus,
  PurchaseReceiptType,
  QualityInspectionResult,
  StockUnitStatus,
  TrackingMethod,
} from "@prisma/client";
import type { z } from "zod";
import { ApiError } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { assertApprovalPolicy } from "@/lib/policies";
import { assertMakerChecker, assertSegregationOfDuties } from "@/lib/operating-mode";
import { decimal, moneyString, zero } from "@/lib/finance/money";
import { prisma } from "@/lib/prisma";
import {
  allocateOperationalNumber,
  postOperationalJournal,
  requirePostingAccount,
  type OperationalActor,
} from "@/lib/operations/accounting";
import {
  applyStockMovement,
  enableInventoryPosting,
  normalizeDeviceIdentifiers,
  type DeviceIdentifierDraft,
} from "@/lib/operations/inventory";
import { calculateProcurementDocument } from "@/lib/operations/procurement-calculation";
import {
  parseOperationDate,
  purchaseOrderDraftSchema,
  purchaseReceiptDraftSchema,
  purchaseReceiptInspectionSchema,
} from "@/lib/operations/validation";

export type PurchaseOrderDraftInput = z.infer<typeof purchaseOrderDraftSchema>;
export type PurchaseReceiptDraftInput = z.infer<typeof purchaseReceiptDraftSchema>;
export type PurchaseReceiptInspectionInput = z.infer<typeof purchaseReceiptInspectionSchema>;

type PurchaseActor = OperationalActor;
type PurchaseDraftOptions = { allowTaxOverride?: boolean };
type ReceiptDraftOptions = PurchaseDraftOptions & { allowDirectReceipt?: boolean; allowOverReceipt?: boolean };

type TaxableLine = {
  productId: string;
  variantId: string;
  taxRuleId?: string | null;
  taxRate?: string;
};

async function lockPurchaseOrder(tx: Prisma.TransactionClient, id: string, companyId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${id}::uuid AND "companyId" = ${companyId}::uuid FOR UPDATE`);
  return tx.purchaseOrder.findFirst({
    where: { id, companyId },
    include: {
      supplier: { select: { code: true, name: true } },
      lines: { orderBy: { lineNumber: "asc" } },
    },
  });
}

async function lockPurchaseReceipt(tx: Prisma.TransactionClient, id: string, companyId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "PurchaseReceipt" WHERE "id" = ${id}::uuid AND "companyId" = ${companyId}::uuid FOR UPDATE`);
  return tx.purchaseReceipt.findFirst({
    where: { id, companyId },
    include: {
      supplier: { select: { code: true, name: true } },
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          product: { select: { trackingMethod: true, status: true } },
          variant: { select: { isActive: true } },
          units: { orderBy: { id: "asc" } },
        },
      },
    },
  });
}

async function enableQualityInspection(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT set_config('app.quality_inspection', 'on', true)`;
}

async function resolveCatalogAndTaxes(
  tx: Prisma.TransactionClient,
  companyId: string,
  lines: TaxableLine[],
  options: PurchaseDraftOptions,
) {
  const productIds = [...new Set(lines.map((line) => line.productId))];
  const variantIds = [...new Set(lines.map((line) => line.variantId))];
  const requestedRuleIds = [...new Set(lines.map((line) => line.taxRuleId).filter((value): value is string => Boolean(value)))];
  const [products, variants, requestedRules] = await Promise.all([
    tx.product.findMany({
      where: { id: { in: productIds }, companyId, status: ProductStatus.ACTIVE },
      select: {
        id: true,
        name: true,
        trackingMethod: true,
        taxRuleId: true,
        taxRule: { select: { id: true, rate: true, isActive: true, appliesToPurchases: true } },
      },
    }),
    tx.productVariant.findMany({
      where: { id: { in: variantIds }, companyId, isActive: true },
      select: { id: true, productId: true, isActive: true },
    }),
    requestedRuleIds.length
      ? tx.taxRule.findMany({
          where: { id: { in: requestedRuleIds }, companyId, isActive: true, appliesToPurchases: true },
          select: { id: true, rate: true, isActive: true, appliesToPurchases: true },
        })
      : Promise.resolve([]),
  ]);
  const productMap = new Map(products.map((product) => [product.id, product]));
  const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
  const ruleMap = new Map(requestedRules.map((rule) => [rule.id, rule]));

  return lines.map((line, index) => {
    const product = productMap.get(line.productId);
    const variant = variantMap.get(line.variantId);
    if (!product || !variant || variant.productId !== product.id) {
      throw new ApiError(422, "INVALID_PRODUCT", `Line ${index + 1} product or variant is unavailable or mismatched.`);
    }
    if (line.taxRuleId && product.taxRuleId && line.taxRuleId !== product.taxRuleId && !options.allowTaxOverride) {
      throw new ApiError(403, "TAX_OVERRIDE_FORBIDDEN", `Line ${index + 1} cannot override the product tax rule.`);
    }
    const selectedRule = line.taxRuleId ? ruleMap.get(line.taxRuleId) : product.taxRule;
    if (line.taxRuleId && !selectedRule) {
      throw new ApiError(422, "INVALID_TAX_RULE", `Line ${index + 1} tax rule is inactive or unavailable.`);
    }
    if (selectedRule && (!selectedRule.isActive || !selectedRule.appliesToPurchases)) {
      throw new ApiError(422, "INVALID_TAX_RULE", `Line ${index + 1} tax rule does not apply to purchases.`);
    }
    const taxRate = selectedRule?.rate ?? zero();
    if (!selectedRule && line.taxRate && decimal(line.taxRate).gt(0)) {
      throw new ApiError(422, "TAX_RULE_REQUIRED", `Line ${index + 1} requires an active configured tax rule.`);
    }
    if (line.taxRate && !decimal(line.taxRate).eq(taxRate)) {
      throw new ApiError(422, "TAX_RATE_MISMATCH", `Line ${index + 1} tax rate does not match the configured rule.`);
    }
    return { product, variant, taxRuleId: selectedRule?.id ?? null, taxRate };
  });
}

function validateDocumentDates(primary: Date, later: Date | null, label: string) {
  if (later && later < primary) throw new ApiError(422, "INVALID_DATE_RANGE", `${label} cannot be earlier than the document date.`);
}

async function prepareOrderData(
  tx: Prisma.TransactionClient,
  actor: PurchaseActor,
  input: PurchaseOrderDraftInput,
  options: PurchaseDraftOptions,
) {
  const [supplier, warehouse, catalog] = await Promise.all([
    tx.supplier.findFirst({ where: { id: input.supplierId, companyId: actor.companyId, status: "ACTIVE" } }),
    tx.warehouse.findFirst({
      where: {
        id: input.warehouseId,
        companyId: actor.companyId,
        branchId: input.branchId,
        allowReceiving: true,
        isActive: true,
      },
    }),
    resolveCatalogAndTaxes(tx, actor.companyId, input.lines, options),
  ]);
  if (!supplier) throw new ApiError(404, "SUPPLIER_NOT_FOUND", "The selected active supplier was not found.");
  if (!warehouse) throw new ApiError(404, "WAREHOUSE_NOT_FOUND", "The selected receiving warehouse was not found.");

  const totals = calculateProcurementDocument(
    input.lines.map((line, index) => ({
      quantity: line.quantity,
      unitCost: line.unitCost,
      discountAmount: line.discountAmount,
      taxRate: catalog[index].taxRate,
    })),
    {
      documentDiscount: input.documentDiscount,
      freightTotal: input.freightTotal,
      otherCharges: input.otherCharges,
    },
    { label: "Purchase order" },
  );
  const lines = input.lines.map((line, index) => ({
    productId: line.productId,
    variantId: line.variantId,
    taxRuleId: catalog[index].taxRuleId,
    lineNumber: index + 1,
    description: line.description,
    orderedQuantity: totals.prepared[index].quantity,
    unitCost: totals.prepared[index].unitCost,
    discountAmount: totals.prepared[index].discountAmount,
    taxRate: totals.prepared[index].taxRate,
    taxAmount: totals.prepared[index].taxAmount,
    lineTotal: totals.prepared[index].lineTotal,
  }));
  return { totals, lines };
}

export async function createPurchaseOrderDraft(
  actor: PurchaseActor,
  input: PurchaseOrderDraftInput,
  options: PurchaseDraftOptions = {},
) {
  const orderDate = parseOperationDate(input.orderDate, "Order date");
  const expectedDate = input.expectedDate ? parseOperationDate(input.expectedDate, "Expected date") : null;
  validateDocumentDates(orderDate, expectedDate, "Expected date");
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.purchaseOrder.findUnique({
        where: { companyId_idempotencyKey: { companyId: actor.companyId, idempotencyKey: input.idempotencyKey } },
        include: { lines: { orderBy: { lineNumber: "asc" } } },
      });
      if (existing) return existing;
      const prepared = await prepareOrderData(tx, actor, input, options);
      const { number } = await allocateOperationalNumber(tx, {
        companyId: actor.companyId,
        branchId: input.branchId,
        postingDate: orderDate,
        documentType: "PURCHASE_ORDER",
        suffix: "PO",
      });
      const order = await tx.purchaseOrder.create({
        data: {
          companyId: actor.companyId,
          branchId: input.branchId,
          supplierId: input.supplierId,
          warehouseId: input.warehouseId,
          orderNumber: number,
          orderDate,
          expectedDate,
          supplierReference: input.supplierReference || null,
          paymentTermsDays: input.paymentTermsDays,
          currencyCode: input.currencyCode,
          exchangeRate: decimal(input.exchangeRate),
          subtotal: prepared.totals.subtotal,
          discountTotal: prepared.totals.discountTotal,
          documentDiscount: prepared.totals.documentDiscount,
          taxTotal: prepared.totals.taxTotal,
          freightTotal: prepared.totals.freightTotal,
          otherCharges: prepared.totals.otherCharges,
          grandTotal: prepared.totals.grandTotal,
          idempotencyKey: input.idempotencyKey,
          notes: input.notes || null,
          preparedById: actor.userId,
          lines: { create: prepared.lines },
        },
        include: { lines: { orderBy: { lineNumber: "asc" } } },
      });
      await appendAudit(
        {
          companyId: actor.companyId,
          actorId: actor.userId,
          branchId: input.branchId,
          warehouseId: input.warehouseId,
          action: "PURCHASE_ORDER_DRAFT_CREATED",
          module: "purchase",
          entityType: "PurchaseOrder",
          entityId: order.id,
          entityReference: order.orderNumber,
          newValues: { status: order.status, lineCount: order.lines.length, grandTotal: moneyString(order.grandTotal) },
        },
        tx,
      );
      return order;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updatePurchaseOrderDraft(
  actor: PurchaseActor,
  id: string,
  input: PurchaseOrderDraftInput,
  options: PurchaseDraftOptions = {},
) {
  const orderDate = parseOperationDate(input.orderDate, "Order date");
  const expectedDate = input.expectedDate ? parseOperationDate(input.expectedDate, "Expected date") : null;
  validateDocumentDates(orderDate, expectedDate, "Expected date");
  return prisma.$transaction(async (tx) => {
    const current = await lockPurchaseOrder(tx, id, actor.companyId);
    if (!current) throw new ApiError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order was not found.");
    if (current.status !== OperationalDocumentStatus.DRAFT) throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a draft purchase order can be edited.");
    if (current.preparedById !== actor.userId) throw new ApiError(403, "NOT_PREPARER", "Only the preparer may edit this purchase order.");
    const prepared = await prepareOrderData(tx, actor, input, options);
    await tx.purchaseOrderLine.deleteMany({ where: { orderId: id } });
    const updated = await tx.purchaseOrder.update({
      where: { id },
      data: {
        branchId: input.branchId,
        supplierId: input.supplierId,
        warehouseId: input.warehouseId,
        orderDate,
        expectedDate,
        supplierReference: input.supplierReference || null,
        paymentTermsDays: input.paymentTermsDays,
        currencyCode: input.currencyCode,
        exchangeRate: decimal(input.exchangeRate),
        subtotal: prepared.totals.subtotal,
        discountTotal: prepared.totals.discountTotal,
        documentDiscount: prepared.totals.documentDiscount,
        taxTotal: prepared.totals.taxTotal,
        freightTotal: prepared.totals.freightTotal,
        otherCharges: prepared.totals.otherCharges,
        grandTotal: prepared.totals.grandTotal,
        notes: input.notes || null,
        lines: { create: prepared.lines },
      },
      include: { lines: { orderBy: { lineNumber: "asc" } } },
    });
    await appendAudit(
      {
        companyId: actor.companyId,
        actorId: actor.userId,
        branchId: updated.branchId,
        warehouseId: updated.warehouseId,
        action: "PURCHASE_ORDER_DRAFT_UPDATED",
        module: "purchase",
        entityType: "PurchaseOrder",
        entityId: id,
        entityReference: updated.orderNumber,
        previousValues: { grandTotal: moneyString(current.grandTotal), lineCount: current.lines.length },
        newValues: { grandTotal: moneyString(updated.grandTotal), lineCount: updated.lines.length },
      },
      tx,
    );
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function submitPurchaseOrder(actor: PurchaseActor, id: string) {
  return prisma.$transaction(async (tx) => {
    const order = await lockPurchaseOrder(tx, id, actor.companyId);
    if (!order) throw new ApiError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order was not found.");
    if (order.preparedById !== actor.userId) throw new ApiError(403, "NOT_PREPARER", "Only the preparer may submit this purchase order.");
    if (order.status !== OperationalDocumentStatus.DRAFT) throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a draft purchase order can be submitted.");
    if (!order.lines.length) throw new ApiError(422, "EMPTY_PURCHASE_ORDER", "The purchase order has no lines.");
    const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: OperationalDocumentStatus.SUBMITTED } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: order.branchId, warehouseId: order.warehouseId, action: "PURCHASE_ORDER_SUBMITTED", module: "purchase", entityType: "PurchaseOrder", entityId: id, entityReference: order.orderNumber, previousValues: { status: order.status }, newValues: { status: updated.status } }, tx);
    return updated;
  });
}

export async function approvePurchaseOrder(actor: PurchaseActor, id: string) {
  return prisma.$transaction(async (tx) => {
    const order = await lockPurchaseOrder(tx, id, actor.companyId);
    if (!order) throw new ApiError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order was not found.");
    if (order.status === OperationalDocumentStatus.APPROVED) return order;
    if (order.status !== OperationalDocumentStatus.DRAFT && order.status !== OperationalDocumentStatus.SUBMITTED) throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a draft or submitted purchase order can be approved.");
    await assertMakerChecker(tx, actor.companyId, order.preparedById, actor.userId, "approve this purchase order");
    await assertApprovalPolicy(tx, { actor, documentType: "PURCHASE_ORDER", amount: order.grandTotal, entityType: "PurchaseOrder", entityId: id, reference: order.orderNumber });
    const updated = await tx.purchaseOrder.update({
      where: { id },
      data: { status: OperationalDocumentStatus.APPROVED, approvedById: actor.userId, approvedAt: new Date() },
    });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: order.branchId, warehouseId: order.warehouseId, action: "PURCHASE_ORDER_APPROVED", module: "purchase", entityType: "PurchaseOrder", entityId: id, entityReference: order.orderNumber, previousValues: { status: order.status }, newValues: { status: updated.status } }, tx);
    return updated;
  });
}

export async function rejectPurchaseOrder(actor: PurchaseActor, id: string, reason: string) {
  if (reason.trim().length < 10) throw new ApiError(422, "REASON_REQUIRED", "A rejection reason of at least 10 characters is required.");
  return prisma.$transaction(async (tx) => {
    const order = await lockPurchaseOrder(tx, id, actor.companyId);
    if (!order) throw new ApiError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order was not found.");
    if (order.status !== OperationalDocumentStatus.SUBMITTED) throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a submitted order can be rejected.");
    await assertMakerChecker(tx, actor.companyId, order.preparedById, actor.userId, "reject this purchase order");
    const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: OperationalDocumentStatus.REJECTED } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: order.branchId, warehouseId: order.warehouseId, action: "PURCHASE_ORDER_REJECTED", module: "purchase", entityType: "PurchaseOrder", entityId: id, entityReference: order.orderNumber, previousValues: { status: order.status }, newValues: { status: updated.status }, metadata: { reason: reason.trim() } }, tx);
    return updated;
  });
}

export async function cancelPurchaseOrder(actor: PurchaseActor, id: string, reason: string) {
  if (reason.trim().length < 10) throw new ApiError(422, "REASON_REQUIRED", "A cancellation reason of at least 10 characters is required.");
  return prisma.$transaction(async (tx) => {
    const order = await lockPurchaseOrder(tx, id, actor.companyId);
    if (!order) throw new ApiError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order was not found.");
    const cancellable: OperationalDocumentStatus[] = [OperationalDocumentStatus.DRAFT, OperationalDocumentStatus.SUBMITTED, OperationalDocumentStatus.APPROVED];
    if (!cancellable.includes(order.status)) {
      throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a draft, submitted, or unreceived approved order can be cancelled.");
    }
    if (order.lines.some((line) => line.receivedQuantity.gt(0))) throw new ApiError(409, "ORDER_ALREADY_RECEIVED", "An order with received quantities cannot be cancelled; close its outstanding balance instead.");
    const linkedReceipts = await tx.purchaseReceipt.count({ where: { purchaseOrderId: id, status: { notIn: [OperationalDocumentStatus.CANCELLED, OperationalDocumentStatus.REJECTED] } } });
    if (linkedReceipts) throw new ApiError(409, "LINKED_RECEIPTS", "Cancel all open linked goods receipts before cancelling this order.");
    if (order.status === OperationalDocumentStatus.DRAFT && order.preparedById !== actor.userId) throw new ApiError(403, "NOT_PREPARER", "Only the preparer may cancel this draft order.");
    if (order.status !== OperationalDocumentStatus.DRAFT) {
      await assertMakerChecker(tx, actor.companyId, order.preparedById, actor.userId, "cancel this purchase order");
    }
    const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: OperationalDocumentStatus.CANCELLED } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: order.branchId, warehouseId: order.warehouseId, action: "PURCHASE_ORDER_CANCELLED", module: "purchase", entityType: "PurchaseOrder", entityId: id, entityReference: order.orderNumber, previousValues: { status: order.status }, newValues: { status: updated.status }, metadata: { reason: reason.trim() } }, tx);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function closePurchaseOrder(actor: PurchaseActor, id: string, reason: string) {
  if (reason.trim().length < 10) throw new ApiError(422, "REASON_REQUIRED", "A close reason of at least 10 characters is required.");
  return prisma.$transaction(async (tx) => {
    const order = await lockPurchaseOrder(tx, id, actor.companyId);
    if (!order) throw new ApiError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order was not found.");
    if (order.status !== OperationalDocumentStatus.APPROVED && order.status !== OperationalDocumentStatus.PARTIALLY_RECEIVED && order.status !== OperationalDocumentStatus.FULLY_RECEIVED) {
      throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only an approved or received purchase order can be closed.");
    }
    const openReceipts = await tx.purchaseReceipt.count({
      where: { purchaseOrderId: id, status: { in: [OperationalDocumentStatus.DRAFT, OperationalDocumentStatus.SUBMITTED, OperationalDocumentStatus.INSPECTION, OperationalDocumentStatus.APPROVED] } },
    });
    if (openReceipts) throw new ApiError(409, "OPEN_RECEIPTS", "Resolve all open goods receipts before closing this purchase order.");
    const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: OperationalDocumentStatus.CLOSED } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: order.branchId, warehouseId: order.warehouseId, action: "PURCHASE_ORDER_CLOSED", module: "purchase", entityType: "PurchaseOrder", entityId: id, entityReference: order.orderNumber, previousValues: { status: order.status }, newValues: { status: updated.status }, metadata: { reason: reason.trim() } }, tx);
    return updated;
  });
}

function inferReceiptType(input: PurchaseReceiptDraftInput) {
  return input.receiptType ?? (input.purchaseOrderId ? PurchaseReceiptType.PO_BASED : PurchaseReceiptType.DIRECT);
}

function deriveInspectionStatus(accepted: Prisma.Decimal, rejected: Prisma.Decimal, hasPendingUnits: boolean) {
  if (hasPendingUnits) return QualityInspectionResult.PENDING;
  if (accepted.eq(0)) return QualityInspectionResult.REJECTED;
  if (rejected.gt(0)) return QualityInspectionResult.QUARANTINED;
  return QualityInspectionResult.ACCEPTED;
}

async function prepareReceiptData(
  tx: Prisma.TransactionClient,
  actor: PurchaseActor,
  input: PurchaseReceiptDraftInput,
  options: ReceiptDraftOptions,
) {
  const receiptType = inferReceiptType(input);
  if (receiptType === PurchaseReceiptType.PO_BASED && !input.purchaseOrderId) {
    throw new ApiError(422, "PURCHASE_ORDER_REQUIRED", "A PO-based receipt requires a purchase order.");
  }
  if (receiptType === PurchaseReceiptType.DIRECT && input.purchaseOrderId) {
    throw new ApiError(422, "DIRECT_RECEIPT_PO_CONFLICT", "A direct receipt cannot reference a purchase order.");
  }
  if (receiptType === PurchaseReceiptType.DIRECT && !options.allowDirectReceipt) {
    throw new ApiError(403, "DIRECT_RECEIPT_FORBIDDEN", "A separate direct-receipt permission is required.");
  }
  if (receiptType === PurchaseReceiptType.DIRECT && (input.directReceiptReason?.trim().length ?? 0) < 10) {
    throw new ApiError(422, "DIRECT_RECEIPT_REASON_REQUIRED", "A direct receipt requires a reason of at least 10 characters.");
  }
  if (input.allowOverReceipt && !options.allowOverReceipt) {
    throw new ApiError(403, "OVER_RECEIPT_FORBIDDEN", "A separate over-receipt permission is required.");
  }
  if (input.allowOverReceipt && (input.overReceiptReason?.trim().length ?? 0) < 10) {
    throw new ApiError(422, "OVER_RECEIPT_REASON_REQUIRED", "An over-receipt override requires a reason of at least 10 characters.");
  }

  const [supplier, warehouse, catalog, purchaseOrder] = await Promise.all([
    tx.supplier.findFirst({ where: { id: input.supplierId, companyId: actor.companyId, status: "ACTIVE" } }),
    tx.warehouse.findFirst({ where: { id: input.warehouseId, companyId: actor.companyId, branchId: input.branchId, allowReceiving: true, isActive: true } }),
    resolveCatalogAndTaxes(tx, actor.companyId, input.lines, options),
    input.purchaseOrderId
      ? tx.purchaseOrder.findFirst({
          where: { id: input.purchaseOrderId, companyId: actor.companyId, status: { in: [OperationalDocumentStatus.APPROVED, OperationalDocumentStatus.PARTIALLY_RECEIVED] } },
          include: { lines: true },
        })
      : Promise.resolve(null),
  ]);
  if (!supplier) throw new ApiError(404, "SUPPLIER_NOT_FOUND", "The selected active supplier was not found.");
  if (!warehouse) throw new ApiError(404, "WAREHOUSE_NOT_FOUND", "The selected receiving warehouse was not found.");
  if (input.purchaseOrderId && !purchaseOrder) throw new ApiError(404, "PURCHASE_ORDER_NOT_FOUND", "The selected open approved purchase order was not found.");
  if (purchaseOrder && (purchaseOrder.branchId !== input.branchId || purchaseOrder.warehouseId !== input.warehouseId || purchaseOrder.supplierId !== input.supplierId)) {
    throw new ApiError(422, "PURCHASE_ORDER_SCOPE_MISMATCH", "Supplier, branch, and warehouse must match the selected purchase order.");
  }

  const orderLineMap = new Map(purchaseOrder?.lines.map((line) => [line.id, line]) ?? []);
  const seenOrderLines = new Set<string>();
  const seenIdentifiers = new Set<string>();
  const stagedIdentifiers: Array<{ type: IdentifierType; normalizedValue: string }> = [];
  const staged = input.lines.map((line, index) => {
    const quantity = decimal(line.quantity);
    const rejectedQuantity = decimal(line.rejectedQuantity);
    const acceptedQuantity = line.acceptedQuantity ? decimal(line.acceptedQuantity) : quantity.minus(rejectedQuantity).toDecimalPlaces(4);
    if (acceptedQuantity.lt(0) || rejectedQuantity.lt(0) || !acceptedQuantity.plus(rejectedQuantity).eq(quantity)) {
      throw new ApiError(422, "INVALID_INSPECTION_QUANTITIES", `Receipt line ${index + 1} accepted and rejected quantities must equal received quantity.`);
    }
    const orderLine = line.orderLineId ? orderLineMap.get(line.orderLineId) : undefined;
    if (purchaseOrder) {
      if (!line.orderLineId || !orderLine) throw new ApiError(422, "ORDER_LINE_REQUIRED", `Receipt line ${index + 1} must reference a line on the selected purchase order.`);
      if (seenOrderLines.has(line.orderLineId)) throw new ApiError(422, "DUPLICATE_ORDER_LINE", `Purchase-order line ${index + 1} is repeated in this receipt.`);
      seenOrderLines.add(line.orderLineId);
      if (orderLine.productId !== line.productId || orderLine.variantId !== line.variantId) {
        throw new ApiError(422, "ORDER_LINE_PRODUCT_MISMATCH", `Receipt line ${index + 1} does not match its purchase-order product.`);
      }
      const outstanding = orderLine.orderedQuantity.minus(orderLine.receivedQuantity);
      if (acceptedQuantity.gt(outstanding) && !input.allowOverReceipt) {
        throw new ApiError(422, "OVER_RECEIPT", `Receipt line ${index + 1} exceeds outstanding quantity ${outstanding.toFixed(4)}.`);
      }
    } else if (line.orderLineId) {
      throw new ApiError(422, "DIRECT_RECEIPT_ORDER_LINE", `Direct receipt line ${index + 1} cannot reference a purchase-order line.`);
    }

    const trackingMethod = catalog[index].product.trackingMethod;
    const serialized = trackingMethod === TrackingMethod.IMEI || trackingMethod === TrackingMethod.SERIAL;
    let hasPendingUnits = false;
    if (serialized) {
      if (!quantity.isInteger() || line.units.length !== quantity.toNumber()) {
        throw new ApiError(422, "SERIALIZED_QUANTITY_MISMATCH", `Receipt line ${index + 1} requires one physical-unit row per received device.`);
      }
      let stagedAccepted = 0;
      let stagedRejected = 0;
      line.units.forEach((unit) => {
        const normalizedIdentifiers = normalizeDeviceIdentifiers(trackingMethod, unit.identifiers as DeviceIdentifierDraft[]);
        normalizedIdentifiers.forEach((identifier) => {
          const key = `${identifier.type}:${identifier.normalizedValue}`;
          if (seenIdentifiers.has(key)) throw new ApiError(422, "DUPLICATE_IDENTIFIER", `Identifier ${identifier.value} is duplicated in this receipt.`);
          seenIdentifiers.add(key);
          stagedIdentifiers.push({ type: identifier.type, normalizedValue: identifier.normalizedValue });
        });
        if (unit.inspectionStatus === QualityInspectionResult.REJECTED || unit.inspectionStatus === QualityInspectionResult.QUARANTINED) stagedRejected += 1;
        else stagedAccepted += 1;
        if (unit.inspectionStatus === QualityInspectionResult.PENDING) hasPendingUnits = true;
      });
      if (!acceptedQuantity.eq(stagedAccepted) || !rejectedQuantity.eq(stagedRejected)) {
        throw new ApiError(422, "UNIT_INSPECTION_MISMATCH", `Receipt line ${index + 1} accepted/rejected quantities do not match its physical-unit results.`);
      }
    } else if (line.units.length) {
      throw new ApiError(422, "UNEXPECTED_SERIALS", `Receipt line ${index + 1} is quantity-tracked and cannot contain device identifiers.`);
    }
    return {
      input: line,
      acceptedQuantity,
      rejectedQuantity,
      taxRuleId: catalog[index].taxRuleId,
      taxRate: catalog[index].taxRate,
      inspectionStatus: deriveInspectionStatus(acceptedQuantity, rejectedQuantity, hasPendingUnits),
    };
  });

  if (stagedIdentifiers.length > 4_000) throw new ApiError(422, "TOO_MANY_IDENTIFIERS", "A receipt cannot stage more than 4,000 identifiers.");
  if (stagedIdentifiers.length) {
    const existingIdentifier = await tx.deviceIdentifier.findFirst({
      where: {
        companyId: actor.companyId,
        OR: stagedIdentifiers.map((identifier) => ({ type: identifier.type, normalizedValue: identifier.normalizedValue })),
      },
      include: {
        stockUnit: {
          select: {
            status: true,
            currentWarehouse: { select: { code: true, name: true } },
            product: { select: { name: true } },
          },
        },
      },
    });
    if (existingIdentifier) {
      const unit = existingIdentifier.stockUnit;
      const whName = unit.currentWarehouse ? `${unit.currentWarehouse.name} (${unit.currentWarehouse.code})` : "Outside warehouse";
      throw new ApiError(
        409,
        "IDENTIFIER_ALREADY_EXISTS",
        `Duplicate IMEI/Identifier detected: ${existingIdentifier.value} already exists in company inventory (${unit.product.name}, Status: ${unit.status}, Warehouse: ${whName}). Receiving duplicate IMEI is prohibited.`,
      );
    }
  }

  const totals = calculateProcurementDocument(
    staged.map((line) => ({
      quantity: line.acceptedQuantity,
      unitCost: line.input.unitCost,
      discountAmount: line.input.discountAmount,
      taxRate: line.taxRate,
    })),
    { documentDiscount: input.documentDiscount, freightTotal: input.freightTotal, otherCharges: input.otherCharges },
    { allowZeroQuantity: true, label: "Goods receipt" },
  );
  if (totals.prepared.every((line) => line.quantity.eq(0))) {
    throw new ApiError(422, "NO_ACCEPTED_QUANTITY", "A goods receipt must contain at least one accepted item before it can be saved.");
  }

  const lines = staged.map((line, index) => ({
    orderLineId: line.input.orderLineId || null,
    productId: line.input.productId,
    variantId: line.input.variantId,
    taxRuleId: line.taxRuleId,
    lotId: line.input.lotId || null,
    lineNumber: index + 1,
    description: line.input.description,
    quantity: decimal(line.input.quantity),
    acceptedQuantity: line.acceptedQuantity,
    rejectedQuantity: line.rejectedQuantity,
    unitCost: totals.prepared[index].unitCost,
    discountAmount: totals.prepared[index].discountAmount,
    taxRate: totals.prepared[index].taxRate,
    taxAmount: totals.prepared[index].taxAmount,
    allocatedDocumentDiscount: totals.prepared[index].allocatedDocumentDiscount,
    allocatedFreight: totals.prepared[index].allocatedFreight,
    allocatedOtherCharges: totals.prepared[index].allocatedOtherCharges,
    landedUnitCost: totals.prepared[index].landedUnitCost,
    lineTotal: totals.prepared[index].lineTotal,
    inspectionStatus: line.inspectionStatus,
    inspectionNotes: line.input.inspectionNotes || null,
    units: line.input.units,
  }));
  return { receiptType, totals, lines };
}

export async function createPurchaseReceiptDraft(
  actor: PurchaseActor,
  input: PurchaseReceiptDraftInput,
  options: ReceiptDraftOptions = {},
) {
  const receiptDate = parseOperationDate(input.receiptDate, "Receipt date");
  const invoiceDate = input.invoiceDate ? parseOperationDate(input.invoiceDate, "Invoice date") : null;
  const dueDate = input.dueDate ? parseOperationDate(input.dueDate, "Due date") : null;
  if (invoiceDate) validateDocumentDates(invoiceDate, dueDate, "Due date");
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.purchaseReceipt.findUnique({
        where: { companyId_idempotencyKey: { companyId: actor.companyId, idempotencyKey: input.idempotencyKey } },
        include: { lines: { include: { units: true }, orderBy: { lineNumber: "asc" } } },
      });
      if (existing) return existing;
      const prepared = await prepareReceiptData(tx, actor, input, options);
      const { number } = await allocateOperationalNumber(tx, {
        companyId: actor.companyId,
        branchId: input.branchId,
        postingDate: receiptDate,
        documentType: "PURCHASE_RECEIPT",
        suffix: "GRN",
      });
      const receipt = await tx.purchaseReceipt.create({
        data: {
          companyId: actor.companyId,
          branchId: input.branchId,
          warehouseId: input.warehouseId,
          supplierId: input.supplierId,
          purchaseOrderId: input.purchaseOrderId || null,
          receiptNumber: number,
          receiptType: prepared.receiptType,
          supplierInvoiceNumber: input.supplierInvoiceNumber || null,
          supplierDeliveryNote: input.supplierDeliveryNote || null,
          directReceiptReason: prepared.receiptType === PurchaseReceiptType.DIRECT ? input.directReceiptReason!.trim() : null,
          allowOverReceipt: input.allowOverReceipt,
          overReceiptReason: input.allowOverReceipt ? input.overReceiptReason!.trim() : null,
          requiresInspection: input.requiresInspection,
          receiptDate,
          invoiceDate,
          dueDate,
          currencyCode: input.currencyCode,
          subtotal: prepared.totals.subtotal,
          discountTotal: prepared.totals.discountTotal,
          documentDiscount: prepared.totals.documentDiscount,
          taxTotal: prepared.totals.taxTotal,
          freightTotal: prepared.totals.freightTotal,
          otherCharges: prepared.totals.otherCharges,
          grandTotal: prepared.totals.grandTotal,
          idempotencyKey: input.idempotencyKey,
          notes: input.notes || null,
          preparedById: actor.userId,
          receivedById: actor.userId,
          lines: {
            create: prepared.lines.map((line) => ({
              orderLineId: line.orderLineId,
              productId: line.productId,
              variantId: line.variantId,
              taxRuleId: line.taxRuleId,
              lotId: line.lotId,
              lineNumber: line.lineNumber,
              description: line.description,
              quantity: line.quantity,
              acceptedQuantity: line.acceptedQuantity,
              rejectedQuantity: line.rejectedQuantity,
              unitCost: line.unitCost,
              discountAmount: line.discountAmount,
              taxRate: line.taxRate,
              taxAmount: line.taxAmount,
              allocatedDocumentDiscount: line.allocatedDocumentDiscount,
              allocatedFreight: line.allocatedFreight,
              allocatedOtherCharges: line.allocatedOtherCharges,
              landedUnitCost: line.landedUnitCost,
              lineTotal: line.lineTotal,
              inspectionStatus: line.inspectionStatus,
              inspectionNotes: line.inspectionNotes,
              units: {
                create: line.units.map((unit) => ({
                  identifiers: unit.identifiers as unknown as Prisma.InputJsonValue,
                  attributes: (unit.attributes || undefined) as Prisma.InputJsonValue | undefined,
                  condition: unit.condition || null,
                  inspectionStatus: unit.inspectionStatus,
                })),
              },
            })),
          },
        },
        include: { lines: { include: { units: true }, orderBy: { lineNumber: "asc" } } },
      });
      await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: input.branchId, warehouseId: input.warehouseId, action: "PURCHASE_RECEIPT_DRAFT_CREATED", module: "purchase", entityType: "PurchaseReceipt", entityId: receipt.id, entityReference: receipt.receiptNumber, newValues: { status: receipt.status, receiptType: receipt.receiptType, lineCount: receipt.lines.length, grandTotal: moneyString(receipt.grandTotal) }, metadata: { allowOverReceipt: receipt.allowOverReceipt, overReceiptReason: receipt.overReceiptReason } }, tx);
      return receipt;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updatePurchaseReceiptDraft(
  actor: PurchaseActor,
  id: string,
  input: PurchaseReceiptDraftInput,
  options: ReceiptDraftOptions = {},
) {
  const receiptDate = parseOperationDate(input.receiptDate, "Receipt date");
  const invoiceDate = input.invoiceDate ? parseOperationDate(input.invoiceDate, "Invoice date") : null;
  const dueDate = input.dueDate ? parseOperationDate(input.dueDate, "Due date") : null;
  if (invoiceDate) validateDocumentDates(invoiceDate, dueDate, "Due date");
  return prisma.$transaction(async (tx) => {
    const current = await lockPurchaseReceipt(tx, id, actor.companyId);
    if (!current) throw new ApiError(404, "PURCHASE_RECEIPT_NOT_FOUND", "Purchase receipt was not found.");
    if (current.status !== OperationalDocumentStatus.DRAFT) throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a draft goods receipt can be edited.");
    if (current.preparedById !== actor.userId) throw new ApiError(403, "NOT_PREPARER", "Only the preparer may edit this goods receipt.");
    const prepared = await prepareReceiptData(tx, actor, input, options);
    await tx.purchaseReceiptUnit.deleteMany({ where: { receiptLine: { receiptId: id } } });
    await tx.purchaseReceiptLine.deleteMany({ where: { receiptId: id } });
    const updated = await tx.purchaseReceipt.update({
      where: { id },
      data: {
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        supplierId: input.supplierId,
        purchaseOrderId: input.purchaseOrderId || null,
        receiptType: prepared.receiptType,
        supplierInvoiceNumber: input.supplierInvoiceNumber || null,
        supplierDeliveryNote: input.supplierDeliveryNote || null,
        directReceiptReason: prepared.receiptType === PurchaseReceiptType.DIRECT ? input.directReceiptReason!.trim() : null,
        allowOverReceipt: input.allowOverReceipt,
        overReceiptReason: input.allowOverReceipt ? input.overReceiptReason!.trim() : null,
        requiresInspection: input.requiresInspection,
        receiptDate,
        invoiceDate,
        dueDate,
        currencyCode: input.currencyCode,
        subtotal: prepared.totals.subtotal,
        discountTotal: prepared.totals.discountTotal,
        documentDiscount: prepared.totals.documentDiscount,
        taxTotal: prepared.totals.taxTotal,
        freightTotal: prepared.totals.freightTotal,
        otherCharges: prepared.totals.otherCharges,
        grandTotal: prepared.totals.grandTotal,
        notes: input.notes || null,
        lines: {
          create: prepared.lines.map((line) => ({
            orderLineId: line.orderLineId,
            productId: line.productId,
            variantId: line.variantId,
            taxRuleId: line.taxRuleId,
            lotId: line.lotId,
            lineNumber: line.lineNumber,
            description: line.description,
            quantity: line.quantity,
            acceptedQuantity: line.acceptedQuantity,
            rejectedQuantity: line.rejectedQuantity,
            unitCost: line.unitCost,
            discountAmount: line.discountAmount,
            taxRate: line.taxRate,
            taxAmount: line.taxAmount,
            allocatedDocumentDiscount: line.allocatedDocumentDiscount,
            allocatedFreight: line.allocatedFreight,
            allocatedOtherCharges: line.allocatedOtherCharges,
            landedUnitCost: line.landedUnitCost,
            lineTotal: line.lineTotal,
            inspectionStatus: line.inspectionStatus,
            inspectionNotes: line.inspectionNotes,
            units: { create: line.units.map((unit) => ({ identifiers: unit.identifiers as unknown as Prisma.InputJsonValue, attributes: (unit.attributes || undefined) as Prisma.InputJsonValue | undefined, condition: unit.condition || null, inspectionStatus: unit.inspectionStatus })) },
          })),
        },
      },
      include: { lines: { include: { units: true }, orderBy: { lineNumber: "asc" } } },
    });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: updated.branchId, warehouseId: updated.warehouseId, action: "PURCHASE_RECEIPT_DRAFT_UPDATED", module: "purchase", entityType: "PurchaseReceipt", entityId: id, entityReference: updated.receiptNumber, previousValues: { grandTotal: moneyString(current.grandTotal), lineCount: current.lines.length }, newValues: { grandTotal: moneyString(updated.grandTotal), lineCount: updated.lines.length } }, tx);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function cancelPurchaseReceipt(actor: PurchaseActor, id: string, reason: string) {
  if (reason.trim().length < 10) throw new ApiError(422, "REASON_REQUIRED", "A cancellation reason of at least 10 characters is required.");
  return prisma.$transaction(async (tx) => {
    const receipt = await lockPurchaseReceipt(tx, id, actor.companyId);
    if (!receipt) throw new ApiError(404, "PURCHASE_RECEIPT_NOT_FOUND", "Purchase receipt was not found.");
    const cancellable: OperationalDocumentStatus[] = [OperationalDocumentStatus.DRAFT, OperationalDocumentStatus.SUBMITTED, OperationalDocumentStatus.INSPECTION, OperationalDocumentStatus.APPROVED];
    if (!cancellable.includes(receipt.status)) throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only an unposted draft, submitted, inspection-stage, or approved receipt can be cancelled.");
    const [movementCount, journalCount] = await Promise.all([
      tx.inventoryMovement.count({ where: { sourceDocumentType: "PurchaseReceipt", sourceDocumentId: id } }),
      tx.journalEntry.count({ where: { sourceDocumentType: "PurchaseReceipt", sourceDocumentId: id } }),
    ]);
    if (movementCount || journalCount || receipt.journalEntryId) throw new ApiError(409, "RECEIPT_HAS_POSTING_EFFECTS", "This receipt has posting effects and must use an authorized reversal instead of cancellation.");
    if (receipt.status === OperationalDocumentStatus.DRAFT && receipt.preparedById !== actor.userId) throw new ApiError(403, "NOT_PREPARER", "Only the preparer may cancel this draft receipt.");
    if (receipt.status !== OperationalDocumentStatus.DRAFT) {
      await assertMakerChecker(tx, actor.companyId, receipt.preparedById, actor.userId, "cancel this goods receipt");
    }
    const updated = await tx.purchaseReceipt.update({ where: { id }, data: { status: OperationalDocumentStatus.CANCELLED } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: receipt.branchId, warehouseId: receipt.warehouseId, action: "PURCHASE_RECEIPT_CANCELLED", module: "purchase", entityType: "PurchaseReceipt", entityId: id, entityReference: receipt.receiptNumber, previousValues: { status: receipt.status }, newValues: { status: updated.status }, metadata: { reason: reason.trim(), stockEffect: "NONE" } }, tx);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function submitPurchaseReceipt(actor: PurchaseActor, id: string) {
  return prisma.$transaction(async (tx) => {
    const receipt = await lockPurchaseReceipt(tx, id, actor.companyId);
    if (!receipt) throw new ApiError(404, "PURCHASE_RECEIPT_NOT_FOUND", "Purchase receipt was not found.");
    const canSubmit =
      receipt.preparedById === actor.userId ||
      !actor.permissions ||
      actor.permissions.includes("PURCHASE_RECEIPT_APPROVE") ||
      actor.permissions.includes("PURCHASE_RECEIPT_CREATE") ||
      actor.permissions.includes("purchase.manage");
    if (!canSubmit) throw new ApiError(403, "NOT_PREPARER", "Only the preparer or authorized staff may submit this receipt.");
    if (receipt.status !== OperationalDocumentStatus.DRAFT) throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a draft receipt can be submitted.");
    if (!receipt.lines.length) throw new ApiError(422, "EMPTY_RECEIPT", "The goods receipt has no lines.");
    const hasPending = receipt.lines.some((line) => line.inspectionStatus === QualityInspectionResult.PENDING || line.units.some((unit) => unit.inspectionStatus === QualityInspectionResult.PENDING));
    const nextStatus = receipt.requiresInspection || hasPending ? OperationalDocumentStatus.INSPECTION : OperationalDocumentStatus.SUBMITTED;
    const updated = await tx.purchaseReceipt.update({ where: { id }, data: { status: nextStatus } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: receipt.branchId, warehouseId: receipt.warehouseId, action: nextStatus === OperationalDocumentStatus.INSPECTION ? "PURCHASE_RECEIPT_SENT_TO_INSPECTION" : "PURCHASE_RECEIPT_SUBMITTED", module: "purchase", entityType: "PurchaseReceipt", entityId: id, entityReference: receipt.receiptNumber, previousValues: { status: receipt.status }, newValues: { status: updated.status } }, tx);
    return updated;
  });
}

export async function inspectPurchaseReceipt(actor: PurchaseActor, id: string, input: PurchaseReceiptInspectionInput) {
  return prisma.$transaction(async (tx) => {
    const receipt = await lockPurchaseReceipt(tx, id, actor.companyId);
    if (!receipt) throw new ApiError(404, "PURCHASE_RECEIPT_NOT_FOUND", "Purchase receipt was not found.");
    if (receipt.status !== OperationalDocumentStatus.SUBMITTED && receipt.status !== OperationalDocumentStatus.INSPECTION) {
      throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a submitted or inspection-stage receipt can be inspected.");
    }
    await assertMakerChecker(tx, actor.companyId, receipt.preparedById, actor.userId, "inspect this goods receipt");
    if (input.lines.length !== receipt.lines.length) throw new ApiError(422, "INCOMPLETE_INSPECTION", "Inspection results are required for every receipt line.");
    const inputMap = new Map(input.lines.map((line) => [line.lineId, line]));
    await enableQualityInspection(tx);

    const adjusted = receipt.lines.map((line) => {
      const result = inputMap.get(line.id);
      if (!result) throw new ApiError(422, "INCOMPLETE_INSPECTION", `Inspection result is missing for receipt line ${line.lineNumber}.`);
      const serialized = line.product.trackingMethod === TrackingMethod.IMEI || line.product.trackingMethod === TrackingMethod.SERIAL;
      let accepted: Prisma.Decimal;
      let rejected: Prisma.Decimal;
      if (serialized) {
        if (result.units.length !== line.units.length) throw new ApiError(422, "INCOMPLETE_UNIT_INSPECTION", `Every physical unit on line ${line.lineNumber} requires an inspection result.`);
        const unitMap = new Map(result.units.map((unit) => [unit.unitId, unit]));
        if (line.units.some((unit) => !unitMap.has(unit.id))) throw new ApiError(422, "INVALID_UNIT_INSPECTION", `Line ${line.lineNumber} includes an unknown or missing unit result.`);
        accepted = decimal(String(result.units.filter((unit) => unit.result === QualityInspectionResult.ACCEPTED).length));
        rejected = line.quantity.minus(accepted).toDecimalPlaces(4);
      } else {
        if (result.units.length) throw new ApiError(422, "UNEXPECTED_UNIT_INSPECTION", `Quantity-tracked line ${line.lineNumber} cannot contain unit results.`);
        accepted = decimal(result.acceptedQuantity ?? line.acceptedQuantity.toFixed(4));
        rejected = decimal(result.rejectedQuantity ?? line.quantity.minus(accepted).toFixed(4));
        if (!accepted.plus(rejected).eq(line.quantity)) throw new ApiError(422, "INVALID_INSPECTION_QUANTITIES", `Line ${line.lineNumber} accepted and rejected quantities must equal received quantity.`);
      }
      const discount = line.acceptedQuantity.gt(0)
        ? line.discountAmount.times(accepted).div(line.acceptedQuantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
        : zero();
      return { line, result, accepted, rejected, discount };
    });
    if (adjusted.every((entry) => entry.accepted.eq(0))) throw new ApiError(422, "NO_ACCEPTED_QUANTITY", "At least one item must be accepted before approval.");

    const totals = calculateProcurementDocument(
      adjusted.map((entry) => ({ quantity: entry.accepted, unitCost: entry.line.unitCost, discountAmount: entry.discount, taxRate: entry.line.taxRate })),
      { documentDiscount: receipt.documentDiscount, freightTotal: receipt.freightTotal, otherCharges: receipt.otherCharges },
      { allowZeroQuantity: true, label: "Goods receipt inspection" },
    );
    for (const [index, entry] of adjusted.entries()) {
      const status = deriveInspectionStatus(entry.accepted, entry.rejected, false);
      await tx.purchaseReceiptLine.update({
        where: { id: entry.line.id },
        data: {
          acceptedQuantity: entry.accepted,
          rejectedQuantity: entry.rejected,
          discountAmount: totals.prepared[index].discountAmount,
          taxAmount: totals.prepared[index].taxAmount,
          allocatedDocumentDiscount: totals.prepared[index].allocatedDocumentDiscount,
          allocatedFreight: totals.prepared[index].allocatedFreight,
          allocatedOtherCharges: totals.prepared[index].allocatedOtherCharges,
          landedUnitCost: totals.prepared[index].landedUnitCost,
          lineTotal: totals.prepared[index].lineTotal,
          inspectionStatus: status,
          inspectionNotes: entry.result.notes || null,
        },
      });
      if (entry.line.units.length) {
        const unitResults = new Map(entry.result.units.map((unit) => [unit.unitId, unit]));
        for (const unit of entry.line.units) {
          const unitResult = unitResults.get(unit.id)!;
          await tx.purchaseReceiptUnit.update({ where: { id: unit.id }, data: { inspectionStatus: unitResult.result, condition: unitResult.condition || null } });
          await tx.qualityInspection.create({
            data: { companyId: actor.companyId, receiptId: receipt.id, receiptLineId: entry.line.id, receiptUnitId: unit.id, inspectedById: actor.userId, result: unitResult.result, condition: unitResult.condition || null, notes: unitResult.notes || null },
          });
        }
      } else {
        await tx.qualityInspection.create({
          data: { companyId: actor.companyId, receiptId: receipt.id, receiptLineId: entry.line.id, inspectedById: actor.userId, result: status, notes: entry.result.notes || null },
        });
      }
    }
    const updated = await tx.purchaseReceipt.update({
      where: { id },
      data: {
        status: OperationalDocumentStatus.INSPECTION,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxTotal: totals.taxTotal,
        grandTotal: totals.grandTotal,
      },
      include: { lines: { include: { units: true }, orderBy: { lineNumber: "asc" } }, inspections: true },
    });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: receipt.branchId, warehouseId: receipt.warehouseId, action: "PURCHASE_RECEIPT_INSPECTED", module: "purchase", entityType: "PurchaseReceipt", entityId: id, entityReference: receipt.receiptNumber, previousValues: { status: receipt.status }, newValues: { status: updated.status, acceptedQuantity: adjusted.reduce((sum, line) => sum.plus(line.accepted), zero()).toFixed(4), rejectedQuantity: adjusted.reduce((sum, line) => sum.plus(line.rejected), zero()).toFixed(4) } }, tx);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function approvePurchaseReceipt(actor: PurchaseActor, id: string) {
  return prisma.$transaction(async (tx) => {
    const receipt = await lockPurchaseReceipt(tx, id, actor.companyId);
    if (!receipt) throw new ApiError(404, "PURCHASE_RECEIPT_NOT_FOUND", "Purchase receipt was not found.");
    if (receipt.status === OperationalDocumentStatus.APPROVED || receipt.status === OperationalDocumentStatus.POSTED) return receipt;
    if (receipt.status !== OperationalDocumentStatus.DRAFT && receipt.status !== OperationalDocumentStatus.SUBMITTED && receipt.status !== OperationalDocumentStatus.INSPECTION) throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only an unposted receipt can be approved.");
    await assertMakerChecker(tx, actor.companyId, receipt.preparedById, actor.userId, "approve this goods receipt");
    if (receipt.lines.some((line) => line.inspectionStatus === QualityInspectionResult.PENDING || line.units.some((unit) => unit.inspectionStatus === QualityInspectionResult.PENDING))) {
      throw new ApiError(409, "INSPECTION_PENDING", "Complete all required line and unit inspections before approval.");
    }
    if (receipt.lines.every((line) => line.acceptedQuantity.eq(0))) throw new ApiError(422, "NO_ACCEPTED_QUANTITY", "A receipt with no accepted quantity cannot be approved.");
    const updated = await tx.purchaseReceipt.update({ where: { id }, data: { status: OperationalDocumentStatus.APPROVED, approvedById: actor.userId, approvedAt: new Date() } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: receipt.branchId, warehouseId: receipt.warehouseId, action: "PURCHASE_RECEIPT_APPROVED", module: "purchase", entityType: "PurchaseReceipt", entityId: id, entityReference: receipt.receiptNumber, previousValues: { status: receipt.status }, newValues: { status: updated.status } }, tx);
    return updated;
  });
}

function identifiersFromJson(value: Prisma.JsonValue): DeviceIdentifierDraft[] {
  if (!Array.isArray(value)) throw new ApiError(409, "INVALID_STAGED_IDENTIFIERS", "Staged device identifiers are invalid.");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new ApiError(409, "INVALID_STAGED_IDENTIFIERS", "Staged device identifiers are invalid.");
    const record = item as Record<string, Prisma.JsonValue>;
    if (!Object.values(IdentifierType).includes(record.type as IdentifierType) || typeof record.value !== "string") {
      throw new ApiError(409, "INVALID_STAGED_IDENTIFIERS", "A staged device identifier is invalid.");
    }
    return { type: record.type as IdentifierType, value: record.value, slot: typeof record.slot === "number" ? record.slot : null, isPrimary: typeof record.isPrimary === "boolean" ? record.isPrimary : undefined };
  });
}

export async function postPurchaseReceipt(actor: PurchaseActor, id: string) {
  return prisma.$transaction(
    async (tx) => {
      const receipt = await lockPurchaseReceipt(tx, id, actor.companyId);
      if (!receipt) throw new ApiError(404, "PURCHASE_RECEIPT_NOT_FOUND", "Purchase receipt was not found.");
      if (receipt.status === OperationalDocumentStatus.POSTED) return receipt;
      if (receipt.status === OperationalDocumentStatus.DRAFT || receipt.status === OperationalDocumentStatus.SUBMITTED) {
        await tx.purchaseReceipt.update({
          where: { id },
          data: {
            status: OperationalDocumentStatus.APPROVED,
            approvedById: receipt.approvedById || actor.userId,
            approvedAt: receipt.approvedAt || new Date(),
          },
        });
        receipt.status = OperationalDocumentStatus.APPROVED;
        receipt.approvedById = receipt.approvedById || actor.userId;
      }
      await assertSegregationOfDuties(tx, actor.companyId, actor.userId, receipt.preparedById, receipt.approvedById, "post this goods receipt", [], true);

      let purchaseOrder: Awaited<ReturnType<typeof lockPurchaseOrder>> = null;
      if (receipt.purchaseOrderId) {
        purchaseOrder = await lockPurchaseOrder(tx, receipt.purchaseOrderId, actor.companyId);
        if (!purchaseOrder || (purchaseOrder.status !== OperationalDocumentStatus.APPROVED && purchaseOrder.status !== OperationalDocumentStatus.PARTIALLY_RECEIVED)) {
          throw new ApiError(409, "PURCHASE_ORDER_NOT_OPEN", "The linked purchase order is no longer open for receiving.");
        }
        const increments = new Map<string, Prisma.Decimal>();
        for (const line of receipt.lines) {
          if (!line.orderLineId) throw new ApiError(409, "ORDER_LINE_REQUIRED", `Receipt line ${line.lineNumber} no longer references a purchase-order line.`);
          increments.set(line.orderLineId, (increments.get(line.orderLineId) ?? zero()).plus(line.acceptedQuantity));
        }
        const orderLines = new Map(purchaseOrder.lines.map((line) => [line.id, line]));
        for (const [orderLineId, increment] of increments) {
          const orderLine = orderLines.get(orderLineId);
          if (!orderLine) throw new ApiError(409, "ORDER_LINE_NOT_FOUND", "A linked purchase-order line was removed or is unavailable.");
          if (orderLine.receivedQuantity.plus(increment).gt(orderLine.orderedQuantity) && !receipt.allowOverReceipt) {
            throw new ApiError(409, "OVER_RECEIPT", `Posting would exceed ordered quantity on PO line ${orderLine.lineNumber}.`);
          }
        }
      }

      await enableInventoryPosting(tx);
      const [inventoryAccount, payableAccount] = await Promise.all([
        requirePostingAccount(tx, { companyId: actor.companyId, branchId: receipt.branchId, accountType: "INVENTORY" }),
        requirePostingAccount(tx, { companyId: actor.companyId, branchId: receipt.branchId, accountType: "ACCOUNTS_PAYABLE" }),
      ]);
      const taxAccount = receipt.taxTotal.gt(0) ? await requirePostingAccount(tx, { companyId: actor.companyId, branchId: receipt.branchId, accountType: "TAX_RECEIVABLE" }) : null;
      const inventoryValue = receipt.subtotal.minus(receipt.discountTotal).minus(receipt.documentDiscount).plus(receipt.freightTotal).plus(receipt.otherCharges).toDecimalPlaces(4);
      const journal = await postOperationalJournal(tx, {
        actor,
        branchId: receipt.branchId,
        postingDate: receipt.receiptDate,
        preparedById: receipt.preparedById,
        approvedById: receipt.approvedById || actor.userId,
        documentType: "PURCHASE_RECEIPT_JOURNAL",
        voucherSuffix: "PV",
        sourceModule: "PURCHASE",
        sourceDocumentType: "PurchaseReceipt",
        sourceDocumentId: receipt.id,
        sourceDocumentNumber: receipt.receiptNumber,
        idempotencyKey: `PURCHASE-RECEIPT:${receipt.id}`,
        narration: `Goods receipt ${receipt.receiptNumber} from ${receipt.supplier.name}`,
        referenceDocument: receipt.supplierInvoiceNumber || receipt.receiptNumber,
        allowApproverPosting: true,
        lines: [
          { accountId: inventoryAccount.id, description: `Inventory and landed costs on ${receipt.receiptNumber}`, debit: inventoryValue, supplierId: receipt.supplierId, invoiceNumber: receipt.supplierInvoiceNumber, dueDate: receipt.dueDate },
          ...(taxAccount ? [{ accountId: taxAccount.id, description: `Recoverable input tax on ${receipt.receiptNumber}`, debit: receipt.taxTotal, supplierId: receipt.supplierId, invoiceNumber: receipt.supplierInvoiceNumber, dueDate: receipt.dueDate }] : []),
          { accountId: payableAccount.id, description: `Supplier payable for ${receipt.receiptNumber}`, credit: receipt.grandTotal, supplierId: receipt.supplierId, invoiceNumber: receipt.supplierInvoiceNumber || receipt.receiptNumber, dueDate: receipt.dueDate },
        ],
      });

      const movementGroupId = crypto.randomUUID();
      for (const line of receipt.lines) {
        if (line.product.status !== ProductStatus.ACTIVE || !line.variant.isActive) throw new ApiError(409, "PRODUCT_INACTIVE", `Receipt line ${line.lineNumber} product or variant is inactive.`);
        if (line.inspectionStatus === QualityInspectionResult.PENDING) throw new ApiError(409, "INSPECTION_PENDING", `Receipt line ${line.lineNumber} is still pending inspection.`);
        const serialized = line.product.trackingMethod === TrackingMethod.IMEI || line.product.trackingMethod === TrackingMethod.SERIAL;
        const lineInventoryValue = line.acceptedQuantity.times(line.unitCost).minus(line.discountAmount).minus(line.allocatedDocumentDiscount).plus(line.allocatedFreight).plus(line.allocatedOtherCharges).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
        if (serialized) {
          const acceptedUnits = line.units.filter((unit) => unit.inspectionStatus === QualityInspectionResult.ACCEPTED);
          let postedLineCost = zero();
          if (!line.acceptedQuantity.isInteger() || acceptedUnits.length !== line.acceptedQuantity.toNumber()) {
            throw new ApiError(409, "SERIALIZED_QUANTITY_MISMATCH", `Receipt line ${line.lineNumber} accepted physical-unit count does not match accepted quantity.`);
          }
          for (const [unitIndex, staged] of acceptedUnits.entries()) {
            if (unitIndex >= 500) throw new ApiError(422, "TOO_MANY_UNITS", "A receipt line cannot exceed 500 physical units.");
            const identifiers = normalizeDeviceIdentifiers(line.product.trackingMethod, identifiersFromJson(staged.identifiers));
            const unitAcquisitionCost = unitIndex === acceptedUnits.length - 1 ? lineInventoryValue.minus(postedLineCost).toDecimalPlaces(4) : line.landedUnitCost;
            postedLineCost = postedLineCost.plus(unitAcquisitionCost);
            const unit = await tx.physicalStockUnit.create({
              data: {
                companyId: actor.companyId,
                productId: line.productId,
                variantId: line.variantId,
                currentBranchId: receipt.branchId,
                currentWarehouseId: receipt.warehouseId,
                status: StockUnitStatus.IN_STOCK,
                acquisitionDate: receipt.receiptDate,
                acquisitionCost: unitAcquisitionCost,
                attributes: staged.attributes === null ? (staged.condition ? { condition: staged.condition } : undefined) : ({ ...(staged.attributes as Prisma.JsonObject), ...(staged.condition ? { condition: staged.condition } : {}) } as Prisma.InputJsonValue),
                identifiers: { create: identifiers.map((identifier) => ({ companyId: actor.companyId, type: identifier.type, value: identifier.value, normalizedValue: identifier.normalizedValue, slot: identifier.slot, isPrimary: identifier.isPrimary })) },
              },
            });
            await tx.purchaseReceiptUnit.update({ where: { id: staged.id }, data: { stockUnitId: unit.id } });
            await applyStockMovement(tx, {
              companyId: actor.companyId, branchId: receipt.branchId, warehouseId: receipt.warehouseId, productId: line.productId, variantId: line.variantId,
              stockUnitId: unit.id, lotId: line.lotId, journalEntryId: journal.id, movementGroupId,
              idempotencyKey: `PR:${receipt.id}:${line.id}:${unit.id}`, movementType: InventoryMovementType.PURCHASE_RECEIPT,
              postingDate: receipt.receiptDate, quantity: "1", unitCost: unitAcquisitionCost,
              sourceDocumentType: "PurchaseReceipt", sourceDocumentId: receipt.id, sourceDocumentNumber: receipt.receiptNumber,
              lineReference: line.id, createdById: actor.userId,
            });
          }
        } else if (line.acceptedQuantity.gt(0)) {
          await applyStockMovement(tx, {
            companyId: actor.companyId, branchId: receipt.branchId, warehouseId: receipt.warehouseId, productId: line.productId, variantId: line.variantId,
            lotId: line.lotId, journalEntryId: journal.id, movementGroupId, idempotencyKey: `PR:${receipt.id}:${line.id}:QTY`,
            movementType: InventoryMovementType.PURCHASE_RECEIPT, postingDate: receipt.receiptDate,
            quantity: line.acceptedQuantity, unitCost: line.landedUnitCost, totalCost: lineInventoryValue, allowUnitCostRounding: true,
            sourceDocumentType: "PurchaseReceipt", sourceDocumentId: receipt.id, sourceDocumentNumber: receipt.receiptNumber,
            lineReference: line.id, createdById: actor.userId,
          });
        }
        if (line.orderLineId && line.acceptedQuantity.gt(0)) {
          await tx.purchaseOrderLine.update({ where: { id: line.orderLineId }, data: { receivedQuantity: { increment: line.acceptedQuantity } } });
        }
      }

      if (purchaseOrder) {
        const states = await tx.purchaseOrderLine.findMany({ where: { orderId: purchaseOrder.id }, select: { orderedQuantity: true, receivedQuantity: true } });
        const nextStatus = states.every((line) => line.receivedQuantity.gte(line.orderedQuantity))
          ? OperationalDocumentStatus.FULLY_RECEIVED
          : states.some((line) => line.receivedQuantity.gt(0))
            ? OperationalDocumentStatus.PARTIALLY_RECEIVED
            : OperationalDocumentStatus.APPROVED;
        if (nextStatus !== purchaseOrder.status) await tx.purchaseOrder.update({ where: { id: purchaseOrder.id }, data: { status: nextStatus } });
      }

      const postedAt = new Date();
      const posted = await tx.purchaseReceipt.update({
        where: { id: receipt.id },
        data: { status: OperationalDocumentStatus.POSTED, journalEntryId: journal.id, postedById: actor.userId, postedAt },
        include: { lines: { include: { units: true }, orderBy: { lineNumber: "asc" } }, journalEntry: true },
      });
      await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: receipt.branchId, warehouseId: receipt.warehouseId, action: "PURCHASE_RECEIPT_POSTED", module: "purchase", entityType: "PurchaseReceipt", entityId: receipt.id, entityReference: receipt.receiptNumber, previousValues: { status: receipt.status }, newValues: { status: posted.status, journalEntryId: journal.id }, metadata: { movementGroupId, inventoryValue: moneyString(inventoryValue), allowOverReceipt: receipt.allowOverReceipt, overReceiptReason: receipt.overReceiptReason } }, tx);
      return posted;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 },
  );
}
