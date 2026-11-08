import "server-only";

import {
  InventoryMovementType,
  OperationalDocumentStatus,
  Prisma,
  StockReturnDisposition,
  StockReturnType,
  StockUnitStatus,
  TrackingMethod,
  WarehouseType,
} from "@prisma/client";
import type { z } from "zod";
import { ApiError } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { assertMakerChecker, assertSegregationOfDuties } from "@/lib/operating-mode";
import { decimal, moneyString, zero } from "@/lib/finance/money";
import { prisma } from "@/lib/prisma";
import { allocateOperationalNumber, postOperationalJournal, requirePostingAccount, type OperationalActor, type SourceJournalLine } from "@/lib/operations/accounting";
import { applyStockMovement, assertSufficientBalance, averageUnitCost, enableInventoryPosting, lockPhysicalStockUnit } from "@/lib/operations/inventory";
import { parseOperationDate, stockReturnDraftSchema } from "@/lib/operations/validation";

export type StockReturnDraftInput = z.infer<typeof stockReturnDraftSchema>;
type ReturnActor = OperationalActor;
const round = (value: Prisma.Decimal) => value.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
const isSerialized = (tracking: TrackingMethod) => tracking === TrackingMethod.IMEI || tracking === TrackingMethod.SERIAL;

async function lockReturn(tx: Prisma.TransactionClient, id: string, companyId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StockReturn" WHERE "id" = ${id}::uuid AND "companyId" = ${companyId}::uuid FOR UPDATE`);
  return tx.stockReturn.findFirst({
    where: { id, companyId },
    include: {
      customer: { select: { name: true, status: true } }, supplier: { select: { name: true, status: true } },
      salesInvoice: { select: { id: true, status: true, reversalOfId: true } }, purchaseReceipt: { select: { id: true, status: true, reversalOfId: true } },
      lines: { orderBy: { lineNumber: "asc" }, include: { product: { select: { trackingMethod: true, status: true } }, variant: { select: { isActive: true } }, units: { include: { stockUnit: { include: { identifiers: true } } } }, sourceSalesLine: true, sourceReceiptLine: true } },
    },
  });
}

async function validateWarehouse(tx: Prisma.TransactionClient, actor: ReturnActor, input: StockReturnDraftInput) {
  const warehouse = await tx.warehouse.findFirst({ where: { id: input.warehouseId, companyId: actor.companyId, branchId: input.branchId, isActive: true } });
  if (!warehouse) throw new ApiError(404, "WAREHOUSE_NOT_FOUND", "The selected return warehouse was not found in the branch.");
  if (input.returnType === StockReturnType.SALES_RETURN && !warehouse.allowReceiving) throw new ApiError(409, "WAREHOUSE_RECEIVING_DISABLED", "The return warehouse does not allow receiving.");
  if (input.returnType === StockReturnType.PURCHASE_RETURN && !warehouse.allowDispatch) throw new ApiError(409, "WAREHOUSE_DISPATCH_DISABLED", "The supplier-return warehouse does not allow dispatch.");
  return warehouse;
}

export async function createStockReturnDraft(actor: ReturnActor, input: StockReturnDraftInput) {
  const returnDate = parseOperationDate(input.returnDate, "Return date");
  if (new Set(input.lines.map((line) => line.sourceLineId)).size !== input.lines.length) throw new ApiError(422, "DUPLICATE_SOURCE_LINE", "Each source line may appear only once on a return.");
  const allUnitIds = input.lines.flatMap((line) => line.stockUnitIds);
  if (new Set(allUnitIds).size !== allUnitIds.length) throw new ApiError(422, "DUPLICATE_STOCK_UNIT", "A physical unit may appear only once on a return.");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.stockReturn.findUnique({ where: { companyId_idempotencyKey: { companyId: actor.companyId, idempotencyKey: input.idempotencyKey } }, include: { lines: { include: { units: true }, orderBy: { lineNumber: "asc" } } } });
    if (existing) return existing;
    const warehouse = await validateWarehouse(tx, actor, input);
    let subtotal = zero(), discountTotal = zero(), taxTotal = zero(), grandTotal = zero(), costTotal = zero();
    const prepared: Array<{ sourceSalesLineId: string | null; sourceReceiptLineId: string | null; productId: string; variantId: string; lineNumber: number; description: string; quantity: Prisma.Decimal; unitAmount: Prisma.Decimal; discountAmount: Prisma.Decimal; taxRate: Prisma.Decimal; taxAmount: Prisma.Decimal; lineTotal: Prisma.Decimal; costTotal: Prisma.Decimal; disposition: StockReturnDisposition; condition: string | null; notes: string | null; stockUnitIds: string[] }> = [];
    let customerId: string | null = null, supplierId: string | null = null, salesInvoiceId: string | null = null, purchaseReceiptId: string | null = null;

    if (input.returnType === StockReturnType.SALES_RETURN) {
      const invoice = await tx.salesInvoice.findFirst({ where: { id: input.sourceDocumentId, companyId: actor.companyId }, include: { lines: { include: { product: { select: { trackingMethod: true } }, units: { include: { stockUnit: { select: { id: true, status: true, acquisitionCost: true, currentWarehouseId: true } } } } } } } });
      if (!invoice || invoice.status !== OperationalDocumentStatus.POSTED) throw new ApiError(409, "SOURCE_INVOICE_NOT_POSTED", "A sales return requires a posted source invoice.");
      if (invoice.branchId !== input.branchId || invoice.currencyCode !== input.currencyCode) throw new ApiError(422, "SOURCE_CONTEXT_MISMATCH", "Return branch and currency must match the source invoice.");
      customerId = invoice.customerId; salesInvoiceId = invoice.id;
      const map = new Map(invoice.lines.map((line) => [line.id, line]));
      for (const [index, requested] of input.lines.entries()) {
        const source = map.get(requested.sourceLineId); if (!source) throw new ApiError(422, "INVALID_SOURCE_LINE", `Return line ${index + 1} is not on the source invoice.`);
        if (requested.disposition !== StockReturnDisposition.RESTOCK && requested.disposition !== StockReturnDisposition.QUARANTINE) throw new ApiError(422, "INVALID_DISPOSITION", "Sales returns may be restocked or quarantined after inspection.");
        const quarantineWarehouse = warehouse.type === WarehouseType.QUARANTINE || warehouse.type === WarehouseType.DAMAGED;
        if (requested.disposition === StockReturnDisposition.QUARANTINE && !quarantineWarehouse) throw new ApiError(422, "QUARANTINE_WAREHOUSE_REQUIRED", "Quarantined returns must be received into a quarantine or damaged warehouse.");
        if (requested.disposition === StockReturnDisposition.RESTOCK && quarantineWarehouse) throw new ApiError(422, "SELLABLE_WAREHOUSE_REQUIRED", "Restockable returns require a normal receiving warehouse.");
        const quantity = decimal(requested.quantity); if (quantity.gt(source.quantity)) throw new ApiError(422, "RETURN_QUANTITY_EXCEEDED", `Return line ${index + 1} exceeds the sold quantity.`);
        const serialized = isSerialized(source.product.trackingMethod);
        if (serialized && (!quantity.isInteger() || requested.stockUnitIds.length !== quantity.toNumber())) throw new ApiError(422, "SERIALIZED_QUANTITY_MISMATCH", `Return line ${index + 1} requires one sold physical unit per item.`);
        if (!serialized && requested.stockUnitIds.length) throw new ApiError(422, "UNEXPECTED_STOCK_UNITS", `Return line ${index + 1} is quantity tracked.`);
        let serializedCost: Prisma.Decimal | null = null;
        if (serialized) {
          const sold = new Map(source.units.map((unit) => [unit.stockUnitId, unit.stockUnit]));
          const selected = requested.stockUnitIds.map((id) => sold.get(id));
          if (selected.some((unit) => !unit)) throw new ApiError(422, "INVALID_RETURN_UNIT", `Return line ${index + 1} includes a device not sold on that invoice line.`);
          if (selected.some((unit) => unit!.status !== StockUnitStatus.SOLD)) throw new ApiError(409, "RETURN_UNIT_UNAVAILABLE", `A device on return line ${index + 1} is no longer sold and eligible for return.`);
          serializedCost = round(selected.reduce((sum, unit) => sum.plus(unit!.acquisitionCost), zero()));
        }
        const ratio = quantity.div(source.quantity); const gross = round(quantity.times(source.unitPrice)); const discount = round(source.discountAmount.times(ratio)); const tax = round(source.taxAmount.times(ratio)); const total = round(gross.minus(discount).plus(tax)); const cost = serializedCost ?? round(source.costTotal.times(ratio));
        subtotal = subtotal.plus(gross); discountTotal = discountTotal.plus(discount); taxTotal = taxTotal.plus(tax); grandTotal = grandTotal.plus(total); costTotal = costTotal.plus(cost);
        prepared.push({ sourceSalesLineId: source.id, sourceReceiptLineId: null, productId: source.productId, variantId: source.variantId, lineNumber: index + 1, description: `Return: ${source.description}`, quantity, unitAmount: source.unitPrice, discountAmount: discount, taxRate: source.taxRate, taxAmount: tax, lineTotal: total, costTotal: cost, disposition: requested.disposition, condition: requested.condition || null, notes: requested.notes || null, stockUnitIds: requested.stockUnitIds });
      }
    } else {
      const receipt = await tx.purchaseReceipt.findFirst({ where: { id: input.sourceDocumentId, companyId: actor.companyId }, include: { lines: { include: { product: { select: { trackingMethod: true } }, units: { include: { stockUnit: { select: { id: true, status: true, acquisitionCost: true, currentWarehouseId: true } } } } } } } });
      if (!receipt || receipt.status !== OperationalDocumentStatus.POSTED) throw new ApiError(409, "SOURCE_RECEIPT_NOT_POSTED", "A purchase return requires a posted source goods receipt.");
      if (receipt.branchId !== input.branchId || receipt.currencyCode !== input.currencyCode) throw new ApiError(422, "SOURCE_CONTEXT_MISMATCH", "Return branch and currency must match the source receipt.");
      supplierId = receipt.supplierId; purchaseReceiptId = receipt.id;
      const map = new Map(receipt.lines.map((line) => [line.id, line]));
      for (const [index, requested] of input.lines.entries()) {
        const source = map.get(requested.sourceLineId); if (!source) throw new ApiError(422, "INVALID_SOURCE_LINE", `Return line ${index + 1} is not on the source receipt.`);
        if (requested.disposition !== StockReturnDisposition.RETURN_TO_VENDOR) throw new ApiError(422, "INVALID_DISPOSITION", "Purchase returns must use the return-to-vendor disposition.");
        const quantity = decimal(requested.quantity); if (quantity.gt(source.acceptedQuantity)) throw new ApiError(422, "RETURN_QUANTITY_EXCEEDED", `Return line ${index + 1} exceeds the accepted receipt quantity.`);
        const serialized = isSerialized(source.product.trackingMethod);
        if (serialized && (!quantity.isInteger() || requested.stockUnitIds.length !== quantity.toNumber())) throw new ApiError(422, "SERIALIZED_QUANTITY_MISMATCH", `Return line ${index + 1} requires one physical unit per item.`);
        if (!serialized && requested.stockUnitIds.length) throw new ApiError(422, "UNEXPECTED_STOCK_UNITS", `Return line ${index + 1} is quantity tracked.`);
        let inventoryCost: Prisma.Decimal;
        if (serialized) {
          const received = new Map(source.units.filter((unit) => unit.stockUnitId && unit.stockUnit).map((unit) => [unit.stockUnitId!, unit.stockUnit!]));
          const selected = requested.stockUnitIds.map((id) => received.get(id));
          if (selected.some((unit) => !unit)) throw new ApiError(422, "INVALID_RETURN_UNIT", `Return line ${index + 1} includes a device not received on that source line.`);
          if (selected.some((unit) => unit!.status !== StockUnitStatus.IN_STOCK || unit!.currentWarehouseId !== input.warehouseId)) throw new ApiError(409, "RETURN_UNIT_UNAVAILABLE", `A device on return line ${index + 1} is not available in the selected warehouse.`);
          inventoryCost = round(selected.reduce((sum, unit) => sum.plus(unit!.acquisitionCost), zero()));
        } else {
          const balance = await tx.stockBalance.findFirst({ where: { companyId: actor.companyId, branchId: input.branchId, warehouseId: input.warehouseId, productId: source.productId, variantId: source.variantId, lotId: null } });
          assertSufficientBalance(balance, quantity);
          inventoryCost = quantity.eq(balance!.quantity) ? balance!.inventoryValue : round(averageUnitCost(balance!).times(quantity));
        }
        const ratio = quantity.div(source.acceptedQuantity); const gross = round(quantity.times(source.unitCost)); const discount = round(source.discountAmount.plus(source.allocatedDocumentDiscount).times(ratio)); const tax = round(source.taxAmount.times(ratio)); const total = round(gross.minus(discount).plus(tax)); const cost = inventoryCost;
        subtotal = subtotal.plus(gross); discountTotal = discountTotal.plus(discount); taxTotal = taxTotal.plus(tax); grandTotal = grandTotal.plus(total); costTotal = costTotal.plus(cost);
        prepared.push({ sourceSalesLineId: null, sourceReceiptLineId: source.id, productId: source.productId, variantId: source.variantId, lineNumber: index + 1, description: `Supplier return: ${source.description}`, quantity, unitAmount: source.unitCost, discountAmount: discount, taxRate: source.taxRate, taxAmount: tax, lineTotal: total, costTotal: cost, disposition: requested.disposition, condition: requested.condition || null, notes: requested.notes || null, stockUnitIds: requested.stockUnitIds });
      }
    }
    const { number } = await allocateOperationalNumber(tx, { companyId: actor.companyId, branchId: input.branchId, postingDate: returnDate, documentType: input.returnType, suffix: input.returnType === StockReturnType.SALES_RETURN ? "SR" : "PR" });
    const record = await tx.stockReturn.create({ data: { companyId: actor.companyId, branchId: input.branchId, warehouseId: input.warehouseId, customerId, supplierId, salesInvoiceId, purchaseReceiptId, returnNumber: number, returnType: input.returnType, returnDate, currencyCode: input.currencyCode, subtotal: round(subtotal), discountTotal: round(discountTotal), taxTotal: round(taxTotal), grandTotal: round(grandTotal), costTotal: round(costTotal), reason: input.reason, notes: input.notes || null, idempotencyKey: input.idempotencyKey, preparedById: actor.userId, lines: { create: prepared.map((line) => ({ sourceSalesLineId: line.sourceSalesLineId, sourceReceiptLineId: line.sourceReceiptLineId, productId: line.productId, variantId: line.variantId, lineNumber: line.lineNumber, description: line.description, quantity: line.quantity, unitAmount: line.unitAmount, discountAmount: line.discountAmount, taxRate: line.taxRate, taxAmount: line.taxAmount, lineTotal: line.lineTotal, costTotal: line.costTotal, disposition: line.disposition, condition: line.condition, notes: line.notes, units: { create: line.stockUnitIds.map((stockUnitId) => ({ stockUnitId })) } })) } }, include: { lines: { include: { units: true }, orderBy: { lineNumber: "asc" } } } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: record.branchId, warehouseId: record.warehouseId, action: "STOCK_RETURN_DRAFT_CREATED", module: "returns", entityType: "StockReturn", entityId: record.id, entityReference: record.returnNumber, newValues: { returnType: record.returnType, status: record.status, grandTotal: moneyString(record.grandTotal), costTotal: moneyString(record.costTotal) }, metadata: { stockEffect: "NONE_UNTIL_POSTING" } }, tx);
    return record;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

export async function submitStockReturn(actor: ReturnActor, id: string) {
  return prisma.$transaction(async (tx) => { const record = await lockReturn(tx, id, actor.companyId); if (!record) throw new ApiError(404, "RETURN_NOT_FOUND", "Return document was not found."); if (record.status !== OperationalDocumentStatus.DRAFT) throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a draft return can be submitted."); if (record.preparedById !== actor.userId) throw new ApiError(403, "NOT_PREPARER", "Only the preparer may submit this return."); const updated = await tx.stockReturn.update({ where: { id }, data: { status: OperationalDocumentStatus.SUBMITTED } }); await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: record.branchId, warehouseId: record.warehouseId, action: "STOCK_RETURN_SUBMITTED", module: "returns", entityType: "StockReturn", entityId: id, entityReference: record.returnNumber, previousValues: { status: record.status }, newValues: { status: updated.status } }, tx); return updated; });
}

export async function approveStockReturn(actor: ReturnActor, id: string) {
  return prisma.$transaction(async (tx) => { const record = await lockReturn(tx, id, actor.companyId); if (!record) throw new ApiError(404, "RETURN_NOT_FOUND", "Return document was not found."); if (record.status !== OperationalDocumentStatus.SUBMITTED) throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a submitted return can be approved."); await assertMakerChecker(tx, actor.companyId, record.preparedById, actor.userId, "approve the same return"); const updated = await tx.stockReturn.update({ where: { id }, data: { status: OperationalDocumentStatus.APPROVED, approvedById: actor.userId, approvedAt: new Date() } }); await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: record.branchId, warehouseId: record.warehouseId, action: "STOCK_RETURN_APPROVED", module: "returns", entityType: "StockReturn", entityId: id, entityReference: record.returnNumber, previousValues: { status: record.status }, newValues: { status: updated.status } }, tx); return updated; });
}

export async function postStockReturn(actor: ReturnActor, id: string) {
  return prisma.$transaction(async (tx) => {
    const record = await lockReturn(tx, id, actor.companyId); if (!record) throw new ApiError(404, "RETURN_NOT_FOUND", "Return document was not found.");
    if (record.status === OperationalDocumentStatus.POSTED) return record;
    if (record.status !== OperationalDocumentStatus.APPROVED || !record.approvedById) throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only an approved return can be posted.");
    await assertSegregationOfDuties(tx, actor.companyId, actor.userId, record.preparedById, record.approvedById, "post this stock return");
    if (record.returnType === StockReturnType.SALES_RETURN) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SalesInvoice" WHERE "id" = ${record.salesInvoiceId}::uuid FOR UPDATE`);
    else await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "PurchaseReceipt" WHERE "id" = ${record.purchaseReceiptId}::uuid FOR UPDATE`);
    const sourceDocument = record.returnType === StockReturnType.SALES_RETURN ? record.salesInvoice : record.purchaseReceipt;
    if (!sourceDocument || sourceDocument.status !== OperationalDocumentStatus.POSTED || sourceDocument.reversalOfId !== null) {
      throw new ApiError(409, "RETURN_SOURCE_NOT_POSTED", "The source document is no longer an active posted transaction.");
    }
    await enableInventoryPosting(tx);

    for (const line of record.lines) {
      const sourceId = record.returnType === StockReturnType.SALES_RETURN ? line.sourceSalesLineId! : line.sourceReceiptLineId!;
      const prior = await tx.stockReturnLine.aggregate({ where: { id: { not: line.id }, ...(record.returnType === StockReturnType.SALES_RETURN ? { sourceSalesLineId: sourceId } : { sourceReceiptLineId: sourceId }), stockReturn: { companyId: actor.companyId, status: OperationalDocumentStatus.POSTED } }, _sum: { quantity: true } });
      const sourceQuantity = record.returnType === StockReturnType.SALES_RETURN ? line.sourceSalesLine!.quantity : line.sourceReceiptLine!.acceptedQuantity;
      if ((prior._sum.quantity || zero()).plus(line.quantity).gt(sourceQuantity)) throw new ApiError(409, "RETURN_QUANTITY_EXCEEDED", `Return line ${line.lineNumber} exceeds the remaining source quantity.`);
    }

    const [receivable, payable, revenue, cogs, inventory, taxPayable, inputTax] = await Promise.all([
      record.returnType === StockReturnType.SALES_RETURN ? requirePostingAccount(tx, { companyId: actor.companyId, branchId: record.branchId, accountType: "ACCOUNTS_RECEIVABLE" }) : Promise.resolve(null),
      record.returnType === StockReturnType.PURCHASE_RETURN ? requirePostingAccount(tx, { companyId: actor.companyId, branchId: record.branchId, accountType: "ACCOUNTS_PAYABLE" }) : Promise.resolve(null),
      record.returnType === StockReturnType.SALES_RETURN ? requirePostingAccount(tx, { companyId: actor.companyId, branchId: record.branchId, accountType: "SALES_REVENUE" }) : Promise.resolve(null),
      requirePostingAccount(tx, { companyId: actor.companyId, branchId: record.branchId, accountType: "COGS" }),
      requirePostingAccount(tx, { companyId: actor.companyId, branchId: record.branchId, accountType: "INVENTORY" }),
      record.returnType === StockReturnType.SALES_RETURN && record.taxTotal.gt(0) ? requirePostingAccount(tx, { companyId: actor.companyId, branchId: record.branchId, accountType: "TAX_PAYABLE" }) : Promise.resolve(null),
      record.returnType === StockReturnType.PURCHASE_RETURN && record.taxTotal.gt(0) ? requirePostingAccount(tx, { companyId: actor.companyId, branchId: record.branchId, accountType: "TAX_RECEIVABLE" }) : Promise.resolve(null),
    ]);
    const net = record.subtotal.minus(record.discountTotal).toDecimalPlaces(4); const variance = record.costTotal.minus(net).toDecimalPlaces(4);
    const journalLines: SourceJournalLine[] = record.returnType === StockReturnType.SALES_RETURN ? [
      { accountId: revenue!.id, description: `Sales return ${record.returnNumber}`, debit: net, customerId: record.customerId },
      ...(taxPayable ? [{ accountId: taxPayable.id, description: `Output tax reversal ${record.returnNumber}`, debit: record.taxTotal, customerId: record.customerId }] : []),
      { accountId: receivable!.id, description: `Customer credit ${record.returnNumber}`, credit: record.grandTotal, customerId: record.customerId },
      { accountId: inventory.id, description: `Returned inventory ${record.returnNumber}`, debit: record.costTotal, customerId: record.customerId },
      { accountId: cogs.id, description: `COGS reversal ${record.returnNumber}`, credit: record.costTotal, customerId: record.customerId },
    ] : [
      { accountId: payable!.id, description: `Supplier credit ${record.returnNumber}`, debit: record.grandTotal, supplierId: record.supplierId },
      { accountId: inventory.id, description: `Inventory returned to supplier ${record.returnNumber}`, credit: record.costTotal, supplierId: record.supplierId },
      ...(inputTax ? [{ accountId: inputTax.id, description: `Input tax reversal ${record.returnNumber}`, credit: record.taxTotal, supplierId: record.supplierId }] : []),
      ...(variance.gt(0) ? [{ accountId: cogs.id, description: `Unrecoverable landed cost ${record.returnNumber}`, debit: variance, supplierId: record.supplierId }] : variance.lt(0) ? [{ accountId: cogs.id, description: `Purchase return cost variance ${record.returnNumber}`, credit: variance.abs(), supplierId: record.supplierId }] : []),
    ];
    const postingLines = journalLines.filter((line) => decimal(line.debit || line.credit || "0").gt(0));
    const journal = await postOperationalJournal(tx, { actor, branchId: record.branchId, postingDate: record.returnDate, preparedById: record.preparedById, approvedById: record.approvedById, documentType: record.returnType === StockReturnType.SALES_RETURN ? "SALES_RETURN_JOURNAL" : "PURCHASE_RETURN_JOURNAL", voucherSuffix: record.returnType === StockReturnType.SALES_RETURN ? "SRV" : "PRV", sourceModule: "RETURNS", sourceDocumentType: "StockReturn", sourceDocumentId: record.id, sourceDocumentNumber: record.returnNumber, idempotencyKey: `STOCK-RETURN:${record.id}`, narration: `${record.returnType.replaceAll("_", " ")} ${record.returnNumber}`, lines: postingLines });

    const movementGroupId = crypto.randomUUID();
    for (const line of record.lines) {
      const serialized = isSerialized(line.product.trackingMethod);
      if (serialized) {
        for (const link of line.units) {
          const unit = await lockPhysicalStockUnit(tx, { companyId: actor.companyId, stockUnitId: link.stockUnitId });
          if (unit.productId !== line.productId || unit.variantId !== line.variantId) throw new ApiError(409, "RETURN_UNIT_MISMATCH", `A physical unit on line ${line.lineNumber} no longer matches its product.`);
          if (record.returnType === StockReturnType.SALES_RETURN) {
            if (unit.status !== StockUnitStatus.SOLD) throw new ApiError(409, "RETURN_UNIT_UNAVAILABLE", `A device on line ${line.lineNumber} is no longer in sold status.`);
            await applyStockMovement(tx, { companyId: actor.companyId, branchId: record.branchId, warehouseId: record.warehouseId, productId: line.productId, variantId: line.variantId, stockUnitId: unit.id, journalEntryId: journal.id, movementGroupId, idempotencyKey: `SR:${record.id}:${line.id}:${unit.id}`, movementType: InventoryMovementType.SALES_RETURN, postingDate: record.returnDate, quantity: "1", unitCost: unit.acquisitionCost, sourceDocumentType: "StockReturn", sourceDocumentId: record.id, sourceDocumentNumber: record.returnNumber, lineReference: line.id, createdById: actor.userId });
            await tx.physicalStockUnit.update({ where: { id: unit.id }, data: { status: line.disposition === StockReturnDisposition.RESTOCK ? StockUnitStatus.IN_STOCK : StockUnitStatus.QUARANTINED, currentBranchId: record.branchId, currentWarehouseId: record.warehouseId, currentLocationId: null, soldAt: null, version: { increment: 1 } } });
          } else {
            if (unit.status !== StockUnitStatus.IN_STOCK || unit.currentWarehouseId !== record.warehouseId) throw new ApiError(409, "RETURN_UNIT_UNAVAILABLE", `A device on line ${line.lineNumber} is not available in the return warehouse.`);
            await applyStockMovement(tx, { companyId: actor.companyId, branchId: record.branchId, warehouseId: record.warehouseId, productId: line.productId, variantId: line.variantId, stockUnitId: unit.id, journalEntryId: journal.id, movementGroupId, idempotencyKey: `PR:${record.id}:${line.id}:${unit.id}`, movementType: InventoryMovementType.PURCHASE_RETURN, postingDate: record.returnDate, quantity: "-1", unitCost: unit.acquisitionCost, sourceDocumentType: "StockReturn", sourceDocumentId: record.id, sourceDocumentNumber: record.returnNumber, lineReference: line.id, createdById: actor.userId });
            await tx.physicalStockUnit.update({ where: { id: unit.id }, data: { status: StockUnitStatus.RETURNED, currentBranchId: null, currentWarehouseId: null, currentLocationId: null, version: { increment: 1 } } });
          }
        }
      } else {
        if (record.returnType === StockReturnType.PURCHASE_RETURN) {
          await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StockBalance" WHERE "companyId"=${actor.companyId}::uuid AND "warehouseId"=${record.warehouseId}::uuid AND "productId"=${line.productId}::uuid AND "variantId"=${line.variantId}::uuid AND "lotId" IS NULL FOR UPDATE`);
          const balance = await tx.stockBalance.findFirst({ where: { companyId: actor.companyId, branchId: record.branchId, warehouseId: record.warehouseId, productId: line.productId, variantId: line.variantId, lotId: null } }); assertSufficientBalance(balance, line.quantity);
        }
        await applyStockMovement(tx, { companyId: actor.companyId, branchId: record.branchId, warehouseId: record.warehouseId, productId: line.productId, variantId: line.variantId, journalEntryId: journal.id, movementGroupId, idempotencyKey: `${record.returnType === StockReturnType.SALES_RETURN ? "SR" : "PR"}:${record.id}:${line.id}:QTY`, movementType: record.returnType === StockReturnType.SALES_RETURN ? InventoryMovementType.SALES_RETURN : InventoryMovementType.PURCHASE_RETURN, postingDate: record.returnDate, quantity: record.returnType === StockReturnType.SALES_RETURN ? line.quantity : line.quantity.negated(), unitCost: line.quantity.gt(0) ? line.costTotal.div(line.quantity).toDecimalPlaces(4) : zero(), totalCost: record.returnType === StockReturnType.SALES_RETURN ? line.costTotal : line.costTotal.negated(), sourceDocumentType: "StockReturn", sourceDocumentId: record.id, sourceDocumentNumber: record.returnNumber, lineReference: line.id, createdById: actor.userId });
      }
    }
    const posted = await tx.stockReturn.update({ where: { id: record.id }, data: { status: OperationalDocumentStatus.POSTED, journalEntryId: journal.id, postedById: actor.userId, postedAt: new Date() }, include: { lines: { include: { units: { include: { stockUnit: { include: { identifiers: true } } } } }, orderBy: { lineNumber: "asc" } }, journalEntry: true } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: record.branchId, warehouseId: record.warehouseId, action: "STOCK_RETURN_POSTED", module: "returns", entityType: "StockReturn", entityId: record.id, entityReference: record.returnNumber, previousValues: { status: record.status }, newValues: { status: posted.status, journalEntryId: journal.id }, metadata: { movementGroupId, grandTotal: moneyString(record.grandTotal), costTotal: moneyString(record.costTotal) } }, tx);
    return posted;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 45_000 });
}
