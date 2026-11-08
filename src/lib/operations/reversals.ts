import "server-only";

import {
  InventoryMovementType,
  OperationalDocumentStatus,
  Prisma,
  QualityInspectionResult,
  StockUnitStatus,
  TrackingMethod,
} from "@prisma/client";
import { ApiError } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { assertSegregationOfDuties } from "@/lib/operating-mode";
import { zero } from "@/lib/finance/money";
import { prisma } from "@/lib/prisma";
import {
  allocateOperationalNumber,
  reverseOperationalJournal,
  type OperationalActor,
} from "@/lib/operations/accounting";
import {
  applyStockMovement,
  enableInventoryPosting,
  lockPhysicalStockUnit,
} from "@/lib/operations/inventory";

type ReversalInput = {
  reason: string;
  postingDate: Date;
};

const transactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const;

function assertReversalReason(reason: string) {
  const normalized = reason.trim();
  if (normalized.length < 10 || normalized.length > 1000) {
    throw new ApiError(422, "INVALID_REVERSAL_REASON", "A reversal reason between 10 and 1,000 characters is required.");
  }
  return normalized;
}

async function lockSalesInvoice(tx: Prisma.TransactionClient, companyId: string, id: string) {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "SalesInvoice"
    WHERE "id" = ${id}::uuid AND "companyId" = ${companyId}::uuid
    FOR UPDATE
  `);
  return tx.salesInvoice.findFirst({
    where: { id, companyId },
    include: {
      customer: { select: { name: true } },
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          product: { select: { trackingMethod: true } },
          units: { include: { stockUnit: { include: { identifiers: true } } } },
        },
      },
      reversals: { where: { status: OperationalDocumentStatus.POSTED }, orderBy: { postedAt: "desc" }, take: 1 },
    },
  });
}

async function lockPurchaseReceipt(tx: Prisma.TransactionClient, companyId: string, id: string) {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "PurchaseReceipt"
    WHERE "id" = ${id}::uuid AND "companyId" = ${companyId}::uuid
    FOR UPDATE
  `);
  return tx.purchaseReceipt.findFirst({
    where: { id, companyId },
    include: {
      supplier: { select: { name: true } },
      purchaseOrder: { select: { id: true, status: true } },
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          product: { select: { trackingMethod: true } },
          units: { include: { stockUnit: { include: { identifiers: true } } } },
        },
      },
      reversals: { where: { status: OperationalDocumentStatus.POSTED }, orderBy: { postedAt: "desc" }, take: 1 },
    },
  });
}

export async function reversePostedSalesInvoice(actor: OperationalActor, id: string, input: ReversalInput) {
  const reason = assertReversalReason(input.reason);
  return prisma.$transaction(async (tx) => {
    const invoice = await lockSalesInvoice(tx, actor.companyId, id);
    if (!invoice) throw new ApiError(404, "SALES_INVOICE_NOT_FOUND", "Sales invoice was not found.");
    if (invoice.reversalOfId) throw new ApiError(409, "REVERSAL_DOCUMENT_NOT_REVERSIBLE", "A reversal invoice cannot itself be reversed through this workflow.");
    if (invoice.status === OperationalDocumentStatus.REVERSED && invoice.reversals[0]) return invoice.reversals[0];
    if (invoice.status !== OperationalDocumentStatus.POSTED || !invoice.journalEntryId || !invoice.approvedById) {
      throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a posted sales invoice with complete approval and journal history can be reversed.");
    }
    await assertSegregationOfDuties(tx, actor.companyId, actor.userId, invoice.preparedById, invoice.approvedById, "reverse this sales invoice", [invoice.postedById]);

    const [postedAllocation, postedReturn] = await Promise.all([
      tx.paymentAllocation.findFirst({
        where: { salesInvoiceId: invoice.id, payment: { status: OperationalDocumentStatus.POSTED } },
        select: { id: true },
      }),
      tx.stockReturn.findFirst({
        where: { salesInvoiceId: invoice.id, status: { notIn: [OperationalDocumentStatus.CANCELLED, OperationalDocumentStatus.REJECTED] } },
        select: { id: true, returnNumber: true },
      }),
    ]);
    if (postedAllocation) {
      throw new ApiError(409, "INVOICE_HAS_POSTED_SETTLEMENTS", "Reverse or refund posted customer allocations before reversing this invoice.");
    }
    if (postedReturn) {
      throw new ApiError(409, "INVOICE_HAS_ACTIVE_RETURNS", `Return ${postedReturn.returnNumber} must be cancelled or otherwise resolved before reversing this invoice.`);
    }

    const originalMovements = await tx.inventoryMovement.findMany({
      where: {
        companyId: actor.companyId,
        sourceDocumentType: "SalesInvoice",
        sourceDocumentId: invoice.id,
        movementType: InventoryMovementType.SALE_ISSUE,
      },
      orderBy: { postedAt: "asc" },
    });
    if (!originalMovements.length || originalMovements.some((movement) => movement.journalEntryId !== invoice.journalEntryId)) {
      throw new ApiError(409, "INCOMPLETE_STOCK_HISTORY", "The invoice stock issue history is incomplete or is not linked to its source journal.");
    }
    const alreadyReversed = await tx.inventoryMovement.findFirst({
      where: { reversalOfId: { in: originalMovements.map((movement) => movement.id) } },
      select: { id: true },
    });
    if (alreadyReversed) throw new ApiError(409, "STOCK_ALREADY_REVERSED", "One or more invoice stock movements already have a reversal.");

    await enableInventoryPosting(tx);
    for (const line of invoice.lines) {
      const serialized = line.product.trackingMethod === TrackingMethod.IMEI || line.product.trackingMethod === TrackingMethod.SERIAL;
      const movements = originalMovements.filter((movement) => movement.lineReference === line.id);
      const expectedCount = serialized ? line.units.length : 1;
      if (movements.length !== expectedCount) {
        throw new ApiError(409, "INCOMPLETE_STOCK_HISTORY", `Sales line ${line.lineNumber} does not have its complete stock issue history.`);
      }
      if (serialized) {
        for (const link of line.units) {
          const unit = await lockPhysicalStockUnit(tx, { companyId: actor.companyId, stockUnitId: link.stockUnitId });
          if (
            unit.status !== StockUnitStatus.SOLD ||
            unit.currentBranchId !== null ||
            unit.currentWarehouseId !== null ||
            unit.productId !== line.productId ||
            unit.variantId !== line.variantId
          ) {
            throw new ApiError(409, "SOLD_UNIT_UNAVAILABLE", `A physical unit on sales line ${line.lineNumber} has already moved through a downstream workflow.`);
          }
        }
      }
    }

    const { number: reversalNumber } = await allocateOperationalNumber(tx, {
      companyId: actor.companyId,
      branchId: invoice.branchId,
      postingDate: input.postingDate,
      documentType: "SALES_INVOICE_REVERSAL",
      suffix: "SIR",
    });
    const reversal = await tx.salesInvoice.create({
      data: {
        companyId: actor.companyId,
        branchId: invoice.branchId,
        warehouseId: invoice.warehouseId,
        customerId: invoice.customerId,
        salespersonId: invoice.salespersonId,
        reversalOfId: invoice.id,
        invoiceNumber: reversalNumber,
        invoiceDate: input.postingDate,
        dueDate: input.postingDate,
        status: OperationalDocumentStatus.DRAFT,
        currencyCode: invoice.currencyCode,
        subtotal: invoice.subtotal.negated(),
        discountTotal: invoice.discountTotal.negated(),
        taxTotal: invoice.taxTotal.negated(),
        grandTotal: invoice.grandTotal.negated(),
        costTotal: invoice.costTotal.negated(),
        idempotencyKey: `SI-REV:${invoice.id}`,
        notes: `Reversal of ${invoice.invoiceNumber}. ${reason}`,
        preparedById: invoice.preparedById,
      },
    });

    const reversalLineByOriginal = new Map<string, string>();
    for (const line of invoice.lines) {
      const reversalLine = await tx.salesInvoiceLine.create({
        data: {
          invoiceId: reversal.id,
          productId: line.productId,
          variantId: line.variantId,
          taxRuleId: line.taxRuleId,
          lineNumber: line.lineNumber,
          description: `Reversal: ${line.description}`,
          quantity: line.quantity.negated(),
          unitPrice: line.unitPrice,
          discountAmount: line.discountAmount.negated(),
          taxRate: line.taxRate,
          taxAmount: line.taxAmount.negated(),
          lineTotal: line.lineTotal.negated(),
          costTotal: line.costTotal.negated(),
          units: { create: line.units.map((unit) => ({ stockUnitId: unit.stockUnitId })) },
        },
      });
      reversalLineByOriginal.set(line.id, reversalLine.id);
    }
    const approvedAt = new Date();
    await tx.salesInvoice.update({ where: { id: reversal.id }, data: { status: OperationalDocumentStatus.SUBMITTED } });
    await tx.salesInvoice.update({
      where: { id: reversal.id },
      data: { status: OperationalDocumentStatus.APPROVED, approvedById: invoice.approvedById, approvedAt },
    });

    const reversalJournal = await reverseOperationalJournal(tx, {
      actor,
      branchId: invoice.branchId,
      originalJournalId: invoice.journalEntryId,
      postingDate: input.postingDate,
      sourceModule: "SALES_REVERSAL",
      sourceDocumentType: "SalesInvoice",
      sourceDocumentId: reversal.id,
      sourceDocumentNumber: reversal.invoiceNumber,
      idempotencyKey: `SALES-INVOICE-REVERSAL:${invoice.id}`,
      documentType: "SALES_INVOICE_REVERSAL_JOURNAL",
      voucherSuffix: "SIV",
      narration: `Reversal of sales invoice ${invoice.invoiceNumber}: ${reason}`,
      referenceDocument: invoice.invoiceNumber,
    });

    const movementGroupId = crypto.randomUUID();
    for (const movement of originalMovements) {
      const reversalLineId = movement.lineReference ? reversalLineByOriginal.get(movement.lineReference) : null;
      if (!reversalLineId) throw new ApiError(409, "INCOMPLETE_STOCK_HISTORY", "A stock issue does not resolve to an invoice line.");
      await applyStockMovement(tx, {
        companyId: actor.companyId,
        branchId: invoice.branchId,
        warehouseId: invoice.warehouseId,
        locationId: movement.locationId,
        productId: movement.productId,
        variantId: movement.variantId,
        stockUnitId: movement.stockUnitId,
        lotId: movement.lotId,
        journalEntryId: reversalJournal.id,
        reversalOfId: movement.id,
        movementGroupId,
        idempotencyKey: `SI-REV:${invoice.id}:${movement.id}`,
        movementType: InventoryMovementType.SALES_RETURN,
        postingDate: input.postingDate,
        quantity: movement.quantity.negated(),
        unitCost: movement.unitCost,
        totalCost: movement.totalCost.negated(),
        allowUnitCostRounding: true,
        sourceDocumentType: "SalesInvoice",
        sourceDocumentId: reversal.id,
        sourceDocumentNumber: reversal.invoiceNumber,
        lineReference: reversalLineId,
        notes: `Authorized reversal of ${invoice.invoiceNumber}`,
        createdById: actor.userId,
      });
      if (movement.stockUnitId) {
        await tx.physicalStockUnit.update({
          where: { id: movement.stockUnitId },
          data: {
            status: StockUnitStatus.IN_STOCK,
            currentBranchId: invoice.branchId,
            currentWarehouseId: invoice.warehouseId,
            currentLocationId: movement.locationId,
            soldAt: null,
            version: { increment: 1 },
          },
        });
      }
    }

    const postedAt = new Date();
    const postedReversal = await tx.salesInvoice.update({
      where: { id: reversal.id },
      data: {
        status: OperationalDocumentStatus.POSTED,
        journalEntryId: reversalJournal.id,
        postedById: actor.userId,
        postedAt,
      },
      include: { lines: { include: { units: true }, orderBy: { lineNumber: "asc" } }, journalEntry: true },
    });
    await tx.salesInvoice.update({
      where: { id: invoice.id },
      data: {
        status: OperationalDocumentStatus.REVERSED,
        reversedById: actor.userId,
        reversedAt: postedAt,
        reversalReason: reason,
      },
    });

    await appendAudit({
      companyId: actor.companyId,
      actorId: actor.userId,
      branchId: invoice.branchId,
      warehouseId: invoice.warehouseId,
      action: "SALES_INVOICE_REVERSAL_POSTED",
      module: "sales",
      entityType: "SalesInvoice",
      entityId: reversal.id,
      entityReference: reversal.invoiceNumber,
      newValues: { status: postedReversal.status, journalEntryId: reversalJournal.id },
      metadata: { originalInvoiceId: invoice.id, originalInvoiceNumber: invoice.invoiceNumber, reason, movementGroupId },
    }, tx);
    await appendAudit({
      companyId: actor.companyId,
      actorId: actor.userId,
      branchId: invoice.branchId,
      warehouseId: invoice.warehouseId,
      action: "SALES_INVOICE_REVERSED",
      module: "sales",
      entityType: "SalesInvoice",
      entityId: invoice.id,
      entityReference: invoice.invoiceNumber,
      previousValues: { status: OperationalDocumentStatus.POSTED },
      newValues: { status: OperationalDocumentStatus.REVERSED },
      metadata: { reversalInvoiceId: reversal.id, reversalInvoiceNumber: reversal.invoiceNumber, reason },
    }, tx);
    return postedReversal;
  }, transactionOptions);
}

export async function reversePostedPurchaseReceipt(actor: OperationalActor, id: string, input: ReversalInput) {
  const reason = assertReversalReason(input.reason);
  return prisma.$transaction(async (tx) => {
    const receipt = await lockPurchaseReceipt(tx, actor.companyId, id);
    if (!receipt) throw new ApiError(404, "PURCHASE_RECEIPT_NOT_FOUND", "Goods receipt was not found.");
    if (receipt.reversalOfId) throw new ApiError(409, "REVERSAL_DOCUMENT_NOT_REVERSIBLE", "A reversal receipt cannot itself be reversed through this workflow.");
    if (receipt.status === OperationalDocumentStatus.REVERSED && receipt.reversals[0]) return receipt.reversals[0];
    if (receipt.status !== OperationalDocumentStatus.POSTED || !receipt.journalEntryId || !receipt.approvedById) {
      throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a posted goods receipt with complete approval and journal history can be reversed.");
    }
    await assertSegregationOfDuties(tx, actor.companyId, actor.userId, receipt.preparedById, receipt.approvedById, "reverse this goods receipt", [receipt.postedById]);
    if (receipt.purchaseOrder?.status === OperationalDocumentStatus.CLOSED) {
      throw new ApiError(409, "PURCHASE_ORDER_CLOSED", "Reopen the purchase order through an authorized process before reversing this receipt.");
    }

    const [postedAllocation, postedReturn] = await Promise.all([
      tx.paymentAllocation.findFirst({
        where: { purchaseReceiptId: receipt.id, payment: { status: OperationalDocumentStatus.POSTED } },
        select: { id: true },
      }),
      tx.stockReturn.findFirst({
        where: { purchaseReceiptId: receipt.id, status: { notIn: [OperationalDocumentStatus.CANCELLED, OperationalDocumentStatus.REJECTED] } },
        select: { id: true, returnNumber: true },
      }),
    ]);
    if (postedAllocation) {
      throw new ApiError(409, "RECEIPT_HAS_POSTED_SETTLEMENTS", "Reverse or refund posted supplier allocations before reversing this receipt.");
    }
    if (postedReturn) {
      throw new ApiError(409, "RECEIPT_HAS_ACTIVE_RETURNS", `Supplier return ${postedReturn.returnNumber} must be cancelled or otherwise resolved before reversing this receipt.`);
    }

    const originalMovements = await tx.inventoryMovement.findMany({
      where: {
        companyId: actor.companyId,
        sourceDocumentType: "PurchaseReceipt",
        sourceDocumentId: receipt.id,
        movementType: InventoryMovementType.PURCHASE_RECEIPT,
      },
      orderBy: { postedAt: "asc" },
    });
    if (!originalMovements.length || originalMovements.some((movement) => movement.journalEntryId !== receipt.journalEntryId)) {
      throw new ApiError(409, "INCOMPLETE_STOCK_HISTORY", "The receipt stock history is incomplete or is not linked to its source journal.");
    }
    const alreadyReversed = await tx.inventoryMovement.findFirst({
      where: { reversalOfId: { in: originalMovements.map((movement) => movement.id) } },
      select: { id: true },
    });
    if (alreadyReversed) throw new ApiError(409, "STOCK_ALREADY_REVERSED", "One or more receipt stock movements already have a reversal.");

    await enableInventoryPosting(tx);
    const acceptedLines = receipt.lines.filter((line) => line.acceptedQuantity.gt(0));
    if (!acceptedLines.length) throw new ApiError(409, "NO_RECEIVED_STOCK", "The receipt has no accepted stock to reverse.");
    for (const line of acceptedLines) {
      const serialized = line.product.trackingMethod === TrackingMethod.IMEI || line.product.trackingMethod === TrackingMethod.SERIAL;
      const movements = originalMovements.filter((movement) => movement.lineReference === line.id);
      const postedUnits = line.units.filter((unit) => unit.stockUnitId !== null);
      const expectedCount = serialized ? postedUnits.length : 1;
      if (movements.length !== expectedCount) {
        throw new ApiError(409, "INCOMPLETE_STOCK_HISTORY", `Receipt line ${line.lineNumber} does not have its complete stock receipt history.`);
      }
      if (serialized) {
        if (!line.acceptedQuantity.isInteger() || postedUnits.length !== line.acceptedQuantity.toNumber()) {
          throw new ApiError(409, "INCOMPLETE_STOCK_HISTORY", `Receipt line ${line.lineNumber} physical-unit history does not match its accepted quantity.`);
        }
        for (const link of postedUnits) {
          const unit = await lockPhysicalStockUnit(tx, { companyId: actor.companyId, stockUnitId: link.stockUnitId! });
          if (
            unit.status !== StockUnitStatus.IN_STOCK ||
            unit.currentBranchId !== receipt.branchId ||
            unit.currentWarehouseId !== receipt.warehouseId ||
            unit.productId !== line.productId ||
            unit.variantId !== line.variantId
          ) {
            throw new ApiError(409, "RECEIVED_UNIT_UNAVAILABLE", `A physical unit on receipt line ${line.lineNumber} has been sold, transferred, returned, reserved, or otherwise consumed.`);
          }
        }
      } else {
        const movement = movements[0];
        await tx.$queryRaw(Prisma.sql`
          SELECT "id" FROM "StockBalance"
          WHERE "companyId" = ${actor.companyId}::uuid AND "branchId" = ${receipt.branchId}::uuid
            AND "warehouseId" = ${receipt.warehouseId}::uuid AND "productId" = ${line.productId}::uuid
            AND "variantId" = ${line.variantId}::uuid AND "lotId" IS NOT DISTINCT FROM ${line.lotId}::uuid
          FOR UPDATE
        `);
        const [balance, reservations] = await Promise.all([
          tx.stockBalance.findFirst({ where: { companyId: actor.companyId, branchId: receipt.branchId, warehouseId: receipt.warehouseId, productId: line.productId, variantId: line.variantId, lotId: line.lotId } }),
          tx.inventoryReservation.aggregate({
            where: { companyId: actor.companyId, branchId: receipt.branchId, warehouseId: receipt.warehouseId, productId: line.productId, variantId: line.variantId, stockUnitId: null, releasedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            _sum: { quantity: true },
          }),
        ]);
        const reserved = reservations._sum.quantity || zero();
        if (!balance || balance.quantity.minus(reserved).lt(movement.quantity) || balance.inventoryValue.lt(movement.totalCost)) {
          throw new ApiError(409, "RECEIVED_QUANTITY_UNAVAILABLE", `Receipt line ${line.lineNumber} stock is no longer fully available after downstream issues, transfers, returns, or reservations.`);
        }
      }
    }

    const { number: reversalNumber } = await allocateOperationalNumber(tx, {
      companyId: actor.companyId,
      branchId: receipt.branchId,
      postingDate: input.postingDate,
      documentType: "PURCHASE_RECEIPT_REVERSAL",
      suffix: "GRR",
    });
    const reversal = await tx.purchaseReceipt.create({
      data: {
        companyId: actor.companyId,
        branchId: receipt.branchId,
        warehouseId: receipt.warehouseId,
        supplierId: receipt.supplierId,
        purchaseOrderId: receipt.purchaseOrderId,
        reversalOfId: receipt.id,
        receiptNumber: reversalNumber,
        receiptType: receipt.receiptType,
        supplierInvoiceNumber: null,
        supplierDeliveryNote: receipt.supplierDeliveryNote,
        directReceiptReason: receipt.directReceiptReason,
        allowOverReceipt: false,
        overReceiptReason: null,
        requiresInspection: false,
        receiptDate: input.postingDate,
        invoiceDate: input.postingDate,
        dueDate: input.postingDate,
        status: OperationalDocumentStatus.DRAFT,
        currencyCode: receipt.currencyCode,
        subtotal: receipt.subtotal.negated(),
        discountTotal: receipt.discountTotal.negated(),
        documentDiscount: receipt.documentDiscount.negated(),
        taxTotal: receipt.taxTotal.negated(),
        freightTotal: receipt.freightTotal.negated(),
        otherCharges: receipt.otherCharges.negated(),
        grandTotal: receipt.grandTotal.negated(),
        idempotencyKey: `PR-REV:${receipt.id}`,
        notes: `Reversal of ${receipt.receiptNumber}. ${reason}`,
        preparedById: receipt.preparedById,
        receivedById: receipt.receivedById,
      },
    });

    const reversalLineByOriginal = new Map<string, string>();
    for (const line of acceptedLines) {
      const postedUnits = line.units.filter((unit) => unit.stockUnitId !== null);
      const reversalLine = await tx.purchaseReceiptLine.create({
        data: {
          receiptId: reversal.id,
          orderLineId: line.orderLineId,
          productId: line.productId,
          variantId: line.variantId,
          taxRuleId: line.taxRuleId,
          lotId: line.lotId,
          lineNumber: line.lineNumber,
          description: `Reversal: ${line.description}`,
          quantity: line.acceptedQuantity.negated(),
          acceptedQuantity: line.acceptedQuantity.negated(),
          rejectedQuantity: zero(),
          unitCost: line.unitCost,
          discountAmount: line.discountAmount.negated(),
          taxRate: line.taxRate,
          taxAmount: line.taxAmount.negated(),
          allocatedDocumentDiscount: line.allocatedDocumentDiscount.negated(),
          allocatedFreight: line.allocatedFreight.negated(),
          allocatedOtherCharges: line.allocatedOtherCharges.negated(),
          landedUnitCost: line.landedUnitCost,
          lineTotal: line.lineTotal.negated(),
          inspectionStatus: QualityInspectionResult.ACCEPTED,
          inspectionNotes: `Authorized reversal of ${receipt.receiptNumber}`,
          units: {
            create: postedUnits.map((unit) => ({
              stockUnitId: unit.stockUnitId!,
              identifiers: unit.identifiers as Prisma.InputJsonValue,
              attributes: unit.attributes === null ? Prisma.JsonNull : unit.attributes as Prisma.InputJsonValue,
              condition: unit.condition,
              inspectionStatus: QualityInspectionResult.ACCEPTED,
            })),
          },
        },
      });
      reversalLineByOriginal.set(line.id, reversalLine.id);
    }
    const approvedAt = new Date();
    await tx.purchaseReceipt.update({ where: { id: reversal.id }, data: { status: OperationalDocumentStatus.SUBMITTED } });
    await tx.purchaseReceipt.update({
      where: { id: reversal.id },
      data: { status: OperationalDocumentStatus.APPROVED, approvedById: receipt.approvedById, approvedAt },
    });

    const reversalJournal = await reverseOperationalJournal(tx, {
      actor,
      branchId: receipt.branchId,
      originalJournalId: receipt.journalEntryId,
      postingDate: input.postingDate,
      sourceModule: "PURCHASE_RECEIPT_REVERSAL",
      sourceDocumentType: "PurchaseReceipt",
      sourceDocumentId: reversal.id,
      sourceDocumentNumber: reversal.receiptNumber,
      idempotencyKey: `PURCHASE-RECEIPT-REVERSAL:${receipt.id}`,
      documentType: "PURCHASE_RECEIPT_REVERSAL_JOURNAL",
      voucherSuffix: "GRV",
      narration: `Reversal of goods receipt ${receipt.receiptNumber}: ${reason}`,
      referenceDocument: receipt.receiptNumber,
    });

    const movementGroupId = crypto.randomUUID();
    for (const movement of originalMovements) {
      const reversalLineId = movement.lineReference ? reversalLineByOriginal.get(movement.lineReference) : null;
      if (!reversalLineId) throw new ApiError(409, "INCOMPLETE_STOCK_HISTORY", "A receipt movement does not resolve to an accepted receipt line.");
      await applyStockMovement(tx, {
        companyId: actor.companyId,
        branchId: receipt.branchId,
        warehouseId: receipt.warehouseId,
        locationId: movement.locationId,
        productId: movement.productId,
        variantId: movement.variantId,
        stockUnitId: movement.stockUnitId,
        lotId: movement.lotId,
        journalEntryId: reversalJournal.id,
        reversalOfId: movement.id,
        movementGroupId,
        idempotencyKey: `PR-REV:${receipt.id}:${movement.id}`,
        movementType: InventoryMovementType.PURCHASE_RETURN,
        postingDate: input.postingDate,
        quantity: movement.quantity.negated(),
        unitCost: movement.unitCost,
        totalCost: movement.totalCost.negated(),
        allowUnitCostRounding: true,
        sourceDocumentType: "PurchaseReceipt",
        sourceDocumentId: reversal.id,
        sourceDocumentNumber: reversal.receiptNumber,
        lineReference: reversalLineId,
        notes: `Authorized reversal of ${receipt.receiptNumber}`,
        createdById: actor.userId,
      });
      if (movement.stockUnitId) {
        await tx.physicalStockUnit.update({
          where: { id: movement.stockUnitId },
          data: {
            status: StockUnitStatus.RETURNED,
            currentBranchId: null,
            currentWarehouseId: null,
            currentLocationId: null,
            soldAt: null,
            version: { increment: 1 },
          },
        });
      }
    }

    if (receipt.purchaseOrderId) {
      await tx.$executeRaw`SELECT set_config('app.operational_reversal', 'on', true)`;
      const orderLineIds = acceptedLines.flatMap((line) => line.orderLineId ? [line.orderLineId] : []);
      if (orderLineIds.length) {
        await tx.$queryRaw(Prisma.sql`
          SELECT "id" FROM "PurchaseOrderLine"
          WHERE "id" IN (${Prisma.join(orderLineIds.map((lineId) => Prisma.sql`${lineId}::uuid`))})
          FOR UPDATE
        `);
      }
      for (const line of acceptedLines) {
        if (!line.orderLineId) continue;
        const orderLine = await tx.purchaseOrderLine.findUnique({ where: { id: line.orderLineId }, select: { receivedQuantity: true } });
        if (!orderLine || orderLine.receivedQuantity.lt(line.acceptedQuantity)) {
          throw new ApiError(409, "PURCHASE_ORDER_RECEIPT_MISMATCH", `Purchase-order fulfillment for receipt line ${line.lineNumber} cannot be safely reversed.`);
        }
        await tx.purchaseOrderLine.update({
          where: { id: line.orderLineId },
          data: { receivedQuantity: { decrement: line.acceptedQuantity } },
        });
      }
      const states = await tx.purchaseOrderLine.findMany({
        where: { orderId: receipt.purchaseOrderId },
        select: { orderedQuantity: true, receivedQuantity: true },
      });
      const nextStatus = states.every((line) => line.receivedQuantity.gte(line.orderedQuantity))
        ? OperationalDocumentStatus.FULLY_RECEIVED
        : states.some((line) => line.receivedQuantity.gt(0))
          ? OperationalDocumentStatus.PARTIALLY_RECEIVED
          : OperationalDocumentStatus.APPROVED;
      if (receipt.purchaseOrder?.status !== nextStatus) {
        await tx.purchaseOrder.update({ where: { id: receipt.purchaseOrderId }, data: { status: nextStatus } });
      }
    }

    const postedAt = new Date();
    const postedReversal = await tx.purchaseReceipt.update({
      where: { id: reversal.id },
      data: {
        status: OperationalDocumentStatus.POSTED,
        journalEntryId: reversalJournal.id,
        postedById: actor.userId,
        postedAt,
      },
      include: { lines: { include: { units: true }, orderBy: { lineNumber: "asc" } }, journalEntry: true },
    });
    await tx.purchaseReceipt.update({
      where: { id: receipt.id },
      data: {
        status: OperationalDocumentStatus.REVERSED,
        reversedById: actor.userId,
        reversedAt: postedAt,
        reversalReason: reason,
      },
    });

    await appendAudit({
      companyId: actor.companyId,
      actorId: actor.userId,
      branchId: receipt.branchId,
      warehouseId: receipt.warehouseId,
      action: "PURCHASE_RECEIPT_REVERSAL_POSTED",
      module: "purchase",
      entityType: "PurchaseReceipt",
      entityId: reversal.id,
      entityReference: reversal.receiptNumber,
      newValues: { status: postedReversal.status, journalEntryId: reversalJournal.id },
      metadata: { originalReceiptId: receipt.id, originalReceiptNumber: receipt.receiptNumber, reason, movementGroupId },
    }, tx);
    await appendAudit({
      companyId: actor.companyId,
      actorId: actor.userId,
      branchId: receipt.branchId,
      warehouseId: receipt.warehouseId,
      action: "PURCHASE_RECEIPT_REVERSED",
      module: "purchase",
      entityType: "PurchaseReceipt",
      entityId: receipt.id,
      entityReference: receipt.receiptNumber,
      previousValues: { status: OperationalDocumentStatus.POSTED },
      newValues: { status: OperationalDocumentStatus.REVERSED },
      metadata: { reversalReceiptId: reversal.id, reversalReceiptNumber: reversal.receiptNumber, reason },
    }, tx);
    return postedReversal;
  }, transactionOptions);
}
