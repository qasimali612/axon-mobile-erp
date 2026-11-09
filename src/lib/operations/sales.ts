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
import { assertApprovalPolicy, assertCreditOverrideAllowed, assertDiscountCap } from "@/lib/policies";
import { assertMakerChecker, assertSegregationOfDuties, isSingleUserMode } from "@/lib/operating-mode";
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
  assertSufficientBalance,
  averageUnitCost,
  enableInventoryPosting,
  lockPhysicalStockUnit,
} from "@/lib/operations/inventory";
import { parseOperationDate, salesInvoiceDraftSchema } from "@/lib/operations/validation";
import { loadPriceFloors, resolveSalesPriceList } from "@/lib/catalog/pricing";

export type SalesInvoiceDraftInput = z.infer<typeof salesInvoiceDraftSchema>;

type SalesActor = OperationalActor;

async function lockSalesInvoice(tx: Prisma.TransactionClient, id: string, companyId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SalesInvoice" WHERE "id" = ${id}::uuid AND "companyId" = ${companyId}::uuid FOR UPDATE`);
  return tx.salesInvoice.findFirst({
    where: { id, companyId },
    include: {
      customer: { select: { code: true, name: true, creditLimit: true, status: true } },
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          product: { select: { trackingMethod: true, status: true } },
          variant: { select: { isActive: true, minimumSellingPrice: true } },
          units: { include: { stockUnit: { include: { identifiers: true } } } },
        },
      },
    },
  });
}

function calculateSalesLines(
  lines: SalesInvoiceDraftInput["lines"],
  taxPolicies: Array<{ taxRuleId: string | null; taxRate: Prisma.Decimal }>,
) {
  let subtotal = zero();
  let discountTotal = zero();
  let taxTotal = zero();
  const prepared = lines.map((line, index) => {
    const quantity = decimal(line.quantity);
    const unitPrice = decimal(line.unitPrice);
    const discountAmount = decimal(line.discountAmount);
    const taxRate = taxPolicies[index].taxRate;
    const gross = quantity.times(unitPrice).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    if (discountAmount.gt(gross)) throw new ApiError(422, "INVALID_DISCOUNT", `Sales line ${index + 1} discount exceeds its gross amount.`);
    const taxAmount = gross.minus(discountAmount).times(taxRate).div(100).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    const lineTotal = gross.minus(discountAmount).plus(taxAmount).toDecimalPlaces(4);
    subtotal = subtotal.plus(gross);
    discountTotal = discountTotal.plus(discountAmount);
    taxTotal = taxTotal.plus(taxAmount);
    return {
      productId: line.productId,
      variantId: line.variantId,
      taxRuleId: taxPolicies[index].taxRuleId,
      taxRate,
      lineNumber: index + 1,
      description: line.description,
      quantity,
      unitPrice,
      discountAmount,
      taxAmount,
      lineTotal,
      stockUnitIds: line.stockUnitIds,
    };
  });
  return {
    prepared,
    subtotal: subtotal.toDecimalPlaces(4),
    discountTotal: discountTotal.toDecimalPlaces(4),
    taxTotal: taxTotal.toDecimalPlaces(4),
    grandTotal: subtotal.minus(discountTotal).plus(taxTotal).toDecimalPlaces(4),
  };
}

async function prepareSalesDraftData(
  tx: Prisma.TransactionClient,
  actor: SalesActor,
  input: SalesInvoiceDraftInput,
) {
  if (input.currencyCode !== actor.currencyCode) {
    throw new ApiError(422, "CURRENCY_MISMATCH", "Sales invoices must use the company base currency until foreign-currency sales are configured.");
  }
  const allStockUnitIds = input.lines.flatMap((line) => line.stockUnitIds);
  if (new Set(allStockUnitIds).size !== allStockUnitIds.length) {
    throw new ApiError(422, "DUPLICATE_STOCK_UNIT", "A physical stock unit can appear only once on an invoice.");
  }
  const salespersonId = input.salespersonId || actor.userId;
  const [customer, warehouse, salesperson, products, variants, stockUnits] = await Promise.all([
    tx.customer.findFirst({ where: { id: input.customerId, companyId: actor.companyId, status: "ACTIVE", OR: [{ branchId: null }, { branchId: input.branchId }] } }),
    tx.warehouse.findFirst({ where: { id: input.warehouseId, companyId: actor.companyId, branchId: input.branchId, allowDispatch: true, isActive: true } }),
    tx.companyMembership.findFirst({ where: { companyId: actor.companyId, userId: salespersonId, status: "ACTIVE", user: { status: "ACTIVE" } }, select: { userId: true } }),
    tx.product.findMany({ where: { id: { in: [...new Set(input.lines.map((line) => line.productId))] }, companyId: actor.companyId, status: ProductStatus.ACTIVE }, select: { id: true, trackingMethod: true, taxRuleId: true, taxRule: { select: { id: true, rate: true, isActive: true, appliesToSales: true } } } }),
    tx.productVariant.findMany({ where: { id: { in: [...new Set(input.lines.map((line) => line.variantId))] }, companyId: actor.companyId, isActive: true }, select: { id: true, productId: true, minimumSellingPrice: true } }),
    allStockUnitIds.length ? tx.physicalStockUnit.findMany({ where: { id: { in: allStockUnitIds }, companyId: actor.companyId }, select: { id: true, productId: true, variantId: true, status: true, currentBranchId: true, currentWarehouseId: true } }) : Promise.resolve([]),
  ]);
  if (!customer) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "The selected active customer was not found in this branch.");
  if (!warehouse) throw new ApiError(404, "WAREHOUSE_NOT_FOUND", "The selected dispatch warehouse was not found.");
  if (!salesperson) throw new ApiError(422, "SALESPERSON_NOT_FOUND", "The selected active salesperson does not belong to this company.");
  if (stockUnits.length !== allStockUnitIds.length) throw new ApiError(422, "STOCK_UNIT_NOT_FOUND", "One or more selected physical stock units were not found.");

  const productMap = new Map(products.map((product) => [product.id, product]));
  const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
  const priceList = await resolveSalesPriceList(tx, { companyId: actor.companyId, customerId: input.customerId, priceListId: input.priceListId || null, onDate: parseOperationDate(input.invoiceDate, "Invoice date") });
  const priceFloors = await loadPriceFloors(tx, { companyId: actor.companyId, priceListId: priceList?.id ?? null, variantIds: [...variantMap.keys()] });
  const stockUnitMap = new Map(stockUnits.map((unit) => [unit.id, unit]));
  const taxPolicies = input.lines.map((line, index) => {
    const product = productMap.get(line.productId);
    if (!product) throw new ApiError(422, "INVALID_PRODUCT", `Sales line ${index + 1} product is unavailable.`);
    if (line.taxRuleId && line.taxRuleId !== product.taxRuleId) throw new ApiError(403, "SALES_TAX_OVERRIDE_FORBIDDEN", `Sales line ${index + 1} cannot override the configured product tax rule.`);
    if (product.taxRule && (!product.taxRule.isActive || !product.taxRule.appliesToSales)) throw new ApiError(422, "INVALID_TAX_RULE", `Sales line ${index + 1} tax rule is inactive or does not apply to sales.`);
    const taxRate = product.taxRule?.rate ?? zero();
    if (line.taxRate && !decimal(line.taxRate).eq(taxRate)) throw new ApiError(422, "TAX_RATE_MISMATCH", `Sales line ${index + 1} tax rate does not match the configured product rule.`);
    return { taxRuleId: product.taxRule?.id ?? null, taxRate };
  });
  const totals = calculateSalesLines(input.lines, taxPolicies);
  for (const [index, line] of input.lines.entries()) {
    const product = productMap.get(line.productId);
    const variant = variantMap.get(line.variantId);
    if (!product || !variant || variant.productId !== product.id) throw new ApiError(422, "INVALID_PRODUCT", `Sales line ${index + 1} product or variant is unavailable.`);
    const effectiveUnitPrice = decimal(line.quantity).times(line.unitPrice).minus(line.discountAmount).div(line.quantity).toDecimalPlaces(4);
    const listFloor = priceFloors.get(line.variantId)?.minimumPrice ?? null;
    const floor = listFloor ?? variant.minimumSellingPrice;
    if (effectiveUnitPrice.lt(floor)) {
      throw new ApiError(409, "PRICE_BELOW_MINIMUM", `Sales line ${index + 1} effective unit price is below the configured ${listFloor ? "price list" : "variant"} minimum.`);
    }
    const serialized = product.trackingMethod === TrackingMethod.IMEI || product.trackingMethod === TrackingMethod.SERIAL;
    const quantity = decimal(line.quantity);
    if (serialized && (!quantity.isInteger() || line.stockUnitIds.length !== quantity.toNumber())) {
      throw new ApiError(422, "SERIALIZED_QUANTITY_MISMATCH", `Sales line ${index + 1} requires one physical stock unit per item.`);
    }
    if (!serialized && line.stockUnitIds.length) throw new ApiError(422, "UNEXPECTED_STOCK_UNITS", `Sales line ${index + 1} is quantity tracked and cannot contain physical stock units.`);
    for (const stockUnitId of line.stockUnitIds) {
      const unit = stockUnitMap.get(stockUnitId);
      if (!unit) {
        throw new ApiError(404, "STOCK_UNIT_NOT_FOUND", `Physical stock unit ${stockUnitId} on sales line ${index + 1} was not found.`);
      }
      if (unit.productId !== line.productId || unit.variantId !== line.variantId) {
        throw new ApiError(409, "STOCK_UNIT_MISMATCH", `Physical unit on sales line ${index + 1} does not match the selected product or variant.`);
      }
      if (unit.status === StockUnitStatus.SOLD) {
        throw new ApiError(409, "DEVICE_ALREADY_SOLD", `Device on sales line ${index + 1} has already been sold. Duplicate sale is prohibited.`);
      }
      if (unit.status === StockUnitStatus.RESERVED) {
        throw new ApiError(409, "DEVICE_RESERVED", `Device on sales line ${index + 1} is currently reserved by another active order.`);
      }
      if (unit.status !== StockUnitStatus.IN_STOCK) {
        throw new ApiError(409, "STOCK_UNIT_UNAVAILABLE", `Device on sales line ${index + 1} is not in available stock (current status: ${unit.status}).`);
      }
      if (unit.currentWarehouseId !== input.warehouseId) {
        throw new ApiError(409, "STOCK_UNIT_WRONG_WAREHOUSE", `Device on sales line ${index + 1} is located in another warehouse, not the selected dispatch warehouse.`);
      }
    }
  }
  return { totals, salespersonId, priceListId: priceList?.id ?? null };
}

export async function createSalesInvoiceDraft(actor: SalesActor, input: SalesInvoiceDraftInput) {
  const invoiceDate = parseOperationDate(input.invoiceDate, "Invoice date");
  const dueDate = input.dueDate ? parseOperationDate(input.dueDate, "Due date") : null;
  if (dueDate && dueDate < invoiceDate) throw new ApiError(422, "INVALID_DUE_DATE", "Due date cannot be earlier than invoice date.");
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.salesInvoice.findUnique({
        where: { companyId_idempotencyKey: { companyId: actor.companyId, idempotencyKey: input.idempotencyKey } },
        include: { lines: { include: { units: true }, orderBy: { lineNumber: "asc" } } },
      });
      if (existing) return existing;

      const prepared = await prepareSalesDraftData(tx, actor, input);
      const totals = prepared.totals;

      const { number } = await allocateOperationalNumber(tx, {
        companyId: actor.companyId,
        branchId: input.branchId,
        postingDate: invoiceDate,
        documentType: "SALES_INVOICE",
        suffix: "SI",
      });
      const invoice = await tx.salesInvoice.create({
        data: {
          companyId: actor.companyId,
          branchId: input.branchId,
          warehouseId: input.warehouseId,
          customerId: input.customerId,
          salespersonId: prepared.salespersonId,
          priceListId: prepared.priceListId,
          invoiceNumber: number,
          invoiceDate,
          dueDate,
          currencyCode: input.currencyCode,
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          taxTotal: totals.taxTotal,
          grandTotal: totals.grandTotal,
          idempotencyKey: input.idempotencyKey,
          notes: input.notes || null,
          preparedById: actor.userId,
          lines: {
            create: totals.prepared.map((line) => ({
              productId: line.productId,
              variantId: line.variantId,
              taxRuleId: line.taxRuleId,
              taxRate: line.taxRate,
              lineNumber: line.lineNumber,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discountAmount: line.discountAmount,
              taxAmount: line.taxAmount,
              lineTotal: line.lineTotal,
              units: { create: line.stockUnitIds.map((stockUnitId) => ({ stockUnitId })) },
            })),
          },
        },
        include: { lines: { include: { units: true }, orderBy: { lineNumber: "asc" } } },
      });

      await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: input.branchId, warehouseId: input.warehouseId, action: "SALES_INVOICE_DRAFT_CREATED", module: "sales", entityType: "SalesInvoice", entityId: invoice.id, entityReference: invoice.invoiceNumber, newValues: { status: invoice.status, grandTotal: moneyString(invoice.grandTotal) }, metadata: { stockEffect: "NONE_UNTIL_POSTING" } }, tx);
      return invoice;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 },
  );
}

export async function updateSalesInvoiceDraft(actor: SalesActor, id: string, input: SalesInvoiceDraftInput) {
  const invoiceDate = parseOperationDate(input.invoiceDate, "Invoice date");
  const dueDate = input.dueDate ? parseOperationDate(input.dueDate, "Due date") : null;
  if (dueDate && dueDate < invoiceDate) throw new ApiError(422, "INVALID_DUE_DATE", "Due date cannot be earlier than invoice date.");
  return prisma.$transaction(
    async (tx) => {
      const current = await lockSalesInvoice(tx, id, actor.companyId);
      if (!current) throw new ApiError(404, "SALES_INVOICE_NOT_FOUND", "Sales invoice was not found.");
      if (
        current.status === OperationalDocumentStatus.POSTED ||
        current.status === OperationalDocumentStatus.REVERSED ||
        current.status === OperationalDocumentStatus.CANCELLED
      ) {
        throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Posted, reversed, or cancelled sales invoices cannot be edited.");
      }
      const canEdit =
        current.preparedById === actor.userId ||
        !actor.permissions ||
        actor.permissions.includes("SALES_INVOICE_APPROVE") ||
        actor.permissions.includes("SALES_INVOICE_CREATE") ||
        actor.permissions.includes("SALES_INVOICE_POST") ||
        actor.permissions.includes("sales.manage");
      if (!canEdit) throw new ApiError(403, "NOT_PREPARER", "Only the preparer or authorized staff may edit this sales invoice.");

      // Revert parent status to DRAFT first so modifying lines does not violate the database protect_operational_child trigger
      if (current.status === OperationalDocumentStatus.SUBMITTED || current.status === OperationalDocumentStatus.APPROVED) {
        await tx.salesInvoice.update({
          where: { id },
          data: { status: OperationalDocumentStatus.DRAFT, approvedById: null, approvedAt: null },
        });
      }

      const prepared = await prepareSalesDraftData(tx, actor, input);
      const existingLines = await tx.salesInvoiceLine.findMany({
        where: { invoiceId: id },
        select: { id: true },
      });
      const lineIds = existingLines.map((l) => l.id);
      if (lineIds.length > 0) {
        await tx.salesInvoiceUnit.deleteMany({
          where: { invoiceLineId: { in: lineIds } },
        });
      }
      await tx.salesInvoiceLine.deleteMany({ where: { invoiceId: id } });
      const updated = await tx.salesInvoice.update({
        where: { id },
        data: {
          branchId: input.branchId,
          warehouseId: input.warehouseId,
          customerId: input.customerId,
          salespersonId: prepared.salespersonId,
          priceListId: prepared.priceListId,
          preparedById: actor.userId,
          status: OperationalDocumentStatus.DRAFT,
          approvedById: null,
          approvedAt: null,
          invoiceDate,
          dueDate,
          currencyCode: input.currencyCode,
          subtotal: prepared.totals.subtotal,
          discountTotal: prepared.totals.discountTotal,
          taxTotal: prepared.totals.taxTotal,
          grandTotal: prepared.totals.grandTotal,
          costTotal: zero(),
          notes: input.notes || null,
          lines: {
            create: prepared.totals.prepared.map((line) => ({
              productId: line.productId,
              variantId: line.variantId,
              taxRuleId: line.taxRuleId,
              taxRate: line.taxRate,
              lineNumber: line.lineNumber,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discountAmount: line.discountAmount,
              taxAmount: line.taxAmount,
              lineTotal: line.lineTotal,
              units: { create: line.stockUnitIds.map((stockUnitId) => ({ stockUnitId })) },
            })),
          },
        },
        include: { lines: { include: { units: true }, orderBy: { lineNumber: "asc" } } },
      });
      await appendAudit({
        companyId: actor.companyId,
        actorId: actor.userId,
        branchId: updated.branchId,
        warehouseId: updated.warehouseId,
        action: "SALES_INVOICE_DRAFT_UPDATED",
        module: "sales",
        entityType: "SalesInvoice",
        entityId: id,
        entityReference: updated.invoiceNumber,
        previousValues: { grandTotal: moneyString(current.grandTotal), lineCount: current.lines.length },
        newValues: { grandTotal: moneyString(updated.grandTotal), lineCount: updated.lines.length },
        metadata: { stockEffect: "NONE_UNTIL_POSTING" },
      }, tx);
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 },
  );
}

export async function cancelSalesInvoiceDraft(actor: SalesActor, id: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const invoice = await lockSalesInvoice(tx, id, actor.companyId);
    if (!invoice) throw new ApiError(404, "SALES_INVOICE_NOT_FOUND", "Sales invoice was not found.");
    if (invoice.status !== OperationalDocumentStatus.DRAFT) throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a draft sales invoice can be cancelled through this action.");
    const canCancel =
      invoice.preparedById === actor.userId ||
      !actor.permissions ||
      actor.permissions.includes("SALES_INVOICE_APPROVE") ||
      actor.permissions.includes("SALES_INVOICE_CREATE") ||
      actor.permissions.includes("sales.manage");
    if (!canCancel) throw new ApiError(403, "NOT_PREPARER", "Only the preparer or authorized staff may cancel this draft sales invoice.");
    const updated = await tx.salesInvoice.update({ where: { id }, data: { status: OperationalDocumentStatus.CANCELLED, reversalReason: reason } });
    await appendAudit({
      companyId: actor.companyId,
      actorId: actor.userId,
      branchId: invoice.branchId,
      warehouseId: invoice.warehouseId,
      action: "SALES_INVOICE_DRAFT_CANCELLED",
      module: "sales",
      entityType: "SalesInvoice",
      entityId: id,
      entityReference: invoice.invoiceNumber,
      previousValues: { status: invoice.status },
      newValues: { status: updated.status },
      metadata: { reason, stockEffect: "NONE" },
    }, tx);
    return updated;
  });
}

export async function submitSalesInvoice(actor: SalesActor, id: string) {
  return prisma.$transaction(async (tx) => {
    const invoice = await lockSalesInvoice(tx, id, actor.companyId);
    if (!invoice) throw new ApiError(404, "SALES_INVOICE_NOT_FOUND", "Sales invoice was not found.");
    if (invoice.status === OperationalDocumentStatus.SUBMITTED) {
      return invoice;
    }
    const canSubmit =
      invoice.preparedById === actor.userId ||
      !actor.permissions ||
      actor.permissions.includes("SALES_INVOICE_APPROVE") ||
      actor.permissions.includes("SALES_INVOICE_CREATE") ||
      actor.permissions.includes("sales.manage");
    if (!canSubmit) throw new ApiError(403, "NOT_PREPARER", "Only the preparer or authorized staff may submit this invoice.");
    if (invoice.status !== OperationalDocumentStatus.DRAFT) throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a draft invoice can be submitted.");
    await assertDiscountCap(tx, { actor, subtotal: invoice.subtotal, discountTotal: invoice.discountTotal, entityId: id, reference: invoice.invoiceNumber });
    await assertApprovalPolicy(tx, { actor, documentType: "SALES_INVOICE", amount: invoice.grandTotal, entityType: "SalesInvoice", entityId: id, reference: invoice.invoiceNumber });
    const updated = await tx.salesInvoice.update({ where: { id }, data: { status: OperationalDocumentStatus.SUBMITTED } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: invoice.branchId, warehouseId: invoice.warehouseId, action: "SALES_INVOICE_SUBMITTED", module: "sales", entityType: "SalesInvoice", entityId: id, entityReference: invoice.invoiceNumber, previousValues: { status: invoice.status }, newValues: { status: updated.status } }, tx);
    return updated;
  });
}

export async function approveSalesInvoice(actor: SalesActor, id: string) {
  return prisma.$transaction(async (tx) => {
    const invoice = await lockSalesInvoice(tx, id, actor.companyId);
    if (!invoice) throw new ApiError(404, "SALES_INVOICE_NOT_FOUND", "Sales invoice was not found.");
    if (invoice.status === OperationalDocumentStatus.APPROVED || invoice.status === OperationalDocumentStatus.POSTED) return invoice;
    await assertMakerChecker(tx, actor.companyId, invoice.preparedById, actor.userId, "approve this sales invoice");
    if (invoice.dueDate) {
      const receivable = await requirePostingAccount(tx, { companyId: actor.companyId, branchId: invoice.branchId, accountType: "ACCOUNTS_RECEIVABLE" });
      const rows = await tx.$queryRaw<Array<{ balance: Prisma.Decimal }>>(Prisma.sql`
        SELECT COALESCE(SUM(l."baseDebit" - l."baseCredit"),0)::numeric(19,4) AS balance
        FROM "JournalEntryLine" l JOIN "JournalEntry" j ON j."id" = l."entryId"
        WHERE j."companyId" = ${actor.companyId}::uuid AND j."status" = 'POSTED'
          AND l."accountId" = ${receivable.id}::uuid AND l."customerId" = ${invoice.customerId}::uuid
      `);
      const outstanding = rows[0]?.balance || zero();
      if (outstanding.plus(invoice.grandTotal).gt(invoice.customer.creditLimit)) {
        const singleUser = await isSingleUserMode(tx, actor.companyId);
        const reason = assertCreditOverrideAllowed(actor, { outstanding, invoiceTotal: invoice.grandTotal, creditLimit: invoice.customer.creditLimit }, singleUser);
        await appendAudit({
          companyId: actor.companyId,
          actorId: actor.userId,
          branchId: invoice.branchId,
          warehouseId: invoice.warehouseId,
          action: "CREDIT_LIMIT_OVERRIDDEN",
          module: "sales",
          entityType: "SalesInvoice",
          entityId: id,
          entityReference: invoice.invoiceNumber,
          metadata: { reason, outstanding: outstanding.toFixed(4), invoiceTotal: invoice.grandTotal.toFixed(4), creditLimit: invoice.customer.creditLimit.toFixed(4) },
        }, tx);
      }
    }
    await assertApprovalPolicy(tx, { actor, documentType: "SALES_INVOICE", amount: invoice.grandTotal, entityType: "SalesInvoice", entityId: id, reference: invoice.invoiceNumber });
    const updated = await tx.salesInvoice.update({ where: { id }, data: { status: OperationalDocumentStatus.APPROVED, approvedById: actor.userId, approvedAt: new Date() } });
    await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: invoice.branchId, warehouseId: invoice.warehouseId, action: "SALES_INVOICE_APPROVED", module: "sales", entityType: "SalesInvoice", entityId: id, entityReference: invoice.invoiceNumber, previousValues: { status: invoice.status }, newValues: { status: updated.status } }, tx);
    return updated;
  });
}

export async function postSalesInvoice(actor: SalesActor, id: string) {
  return prisma.$transaction(
    async (tx) => {
      const invoice = await lockSalesInvoice(tx, id, actor.companyId);
      if (!invoice) throw new ApiError(404, "SALES_INVOICE_NOT_FOUND", "Sales invoice was not found.");
      if (invoice.status === OperationalDocumentStatus.POSTED) return invoice;
      if (invoice.status === OperationalDocumentStatus.DRAFT || invoice.status === OperationalDocumentStatus.SUBMITTED) {
        await tx.salesInvoice.update({
          where: { id },
          data: {
            status: OperationalDocumentStatus.APPROVED,
            approvedById: invoice.approvedById || actor.userId,
            approvedAt: invoice.approvedAt || new Date(),
          },
        });
        invoice.status = OperationalDocumentStatus.APPROVED;
        invoice.approvedById = invoice.approvedById || actor.userId;
      }
      await assertSegregationOfDuties(tx, actor.companyId, actor.userId, invoice.preparedById, invoice.approvedById, "post this sales invoice", [], true);
      if (invoice.customer.status !== "ACTIVE") throw new ApiError(409, "CUSTOMER_INACTIVE", "The customer is no longer active.");
      await enableInventoryPosting(tx);

      let totalCost = zero();
      const lineCosts = new Map<string, { total: Prisma.Decimal; unitCost: Prisma.Decimal }>();
      for (const line of invoice.lines) {
        if (line.product.status !== ProductStatus.ACTIVE || !line.variant.isActive) throw new ApiError(409, "PRODUCT_INACTIVE", `Sales line ${line.lineNumber} product or variant is inactive.`);
        const serialized = line.product.trackingMethod === TrackingMethod.IMEI || line.product.trackingMethod === TrackingMethod.SERIAL;
        let lineCost = zero();
        let unitCost = zero();
        if (serialized) {
          if (!line.quantity.isInteger() || line.units.length !== line.quantity.toNumber()) throw new ApiError(409, "SERIALIZED_QUANTITY_MISMATCH", `Sales line ${line.lineNumber} physical-unit count is invalid.`);
          for (const link of line.units) {
            const unit = await lockPhysicalStockUnit(tx, { companyId: actor.companyId, stockUnitId: link.stockUnitId });
            if (unit.status !== StockUnitStatus.IN_STOCK || unit.currentWarehouseId !== invoice.warehouseId || unit.productId !== line.productId || unit.variantId !== line.variantId) {
              throw new ApiError(409, "STOCK_UNIT_UNAVAILABLE", `A physical unit on sales line ${line.lineNumber} is no longer available.`);
            }
            const activeReservation = await tx.inventoryReservation.findFirst({ where: { companyId: actor.companyId, stockUnitId: unit.id, releasedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { id: true } });
            if (activeReservation) throw new ApiError(409, "STOCK_UNIT_RESERVED", `A physical unit on sales line ${line.lineNumber} is reserved by another workflow.`);
            lineCost = lineCost.plus(unit.acquisitionCost);
          }
          unitCost = lineCost.div(line.quantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
        } else {
          await tx.$queryRaw(Prisma.sql`
            SELECT "id" FROM "StockBalance"
            WHERE "companyId" = ${actor.companyId}::uuid AND "branchId" = ${invoice.branchId}::uuid
              AND "warehouseId" = ${invoice.warehouseId}::uuid AND "productId" = ${line.productId}::uuid
              AND "variantId" = ${line.variantId}::uuid AND "lotId" IS NULL FOR UPDATE
          `);
          const balance = await tx.stockBalance.findFirst({ where: { companyId: actor.companyId, branchId: invoice.branchId, warehouseId: invoice.warehouseId, productId: line.productId, variantId: line.variantId, lotId: null } });
          assertSufficientBalance(balance, line.quantity);
          const reservations = await tx.inventoryReservation.aggregate({ where: { companyId: actor.companyId, branchId: invoice.branchId, warehouseId: invoice.warehouseId, productId: line.productId, variantId: line.variantId, stockUnitId: null, releasedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, _sum: { quantity: true } });
          const reserved = reservations._sum.quantity || zero();
          if (balance!.quantity.minus(reserved).lt(line.quantity)) throw new ApiError(409, "INSUFFICIENT_AVAILABLE_STOCK", `Sales line ${line.lineNumber} exceeds stock available after active reservations.`, { onHand: balance!.quantity.toFixed(4), reserved: reserved.toFixed(4), requested: line.quantity.toFixed(4) });
          unitCost = averageUnitCost(balance!);
          lineCost = line.quantity.equals(balance!.quantity)
            ? balance!.inventoryValue
            : unitCost.times(line.quantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
        }
        await tx.salesInvoiceLine.update({ where: { id: line.id }, data: { costTotal: lineCost } });
        lineCosts.set(line.id, { total: lineCost, unitCost });
        totalCost = totalCost.plus(lineCost);
      }
      totalCost = totalCost.toDecimalPlaces(4);
      await tx.salesInvoice.update({ where: { id: invoice.id }, data: { costTotal: totalCost } });

      const [receivableAccount, revenueAccount, cogsAccount, inventoryAccount] = await Promise.all([
        requirePostingAccount(tx, { companyId: actor.companyId, branchId: invoice.branchId, accountType: "ACCOUNTS_RECEIVABLE" }),
        requirePostingAccount(tx, { companyId: actor.companyId, branchId: invoice.branchId, accountType: "SALES_REVENUE" }),
        requirePostingAccount(tx, { companyId: actor.companyId, branchId: invoice.branchId, accountType: "COGS" }),
        requirePostingAccount(tx, { companyId: actor.companyId, branchId: invoice.branchId, accountType: "INVENTORY" }),
      ]);
      const taxAccount = invoice.taxTotal.gt(0)
        ? await requirePostingAccount(tx, { companyId: actor.companyId, branchId: invoice.branchId, accountType: "TAX_PAYABLE" })
        : null;
      const netRevenue = invoice.subtotal.minus(invoice.discountTotal).toDecimalPlaces(4);
      const journal = await postOperationalJournal(tx, {
        actor,
        branchId: invoice.branchId,
        postingDate: invoice.invoiceDate,
        preparedById: invoice.preparedById,
        approvedById: invoice.approvedById || actor.userId,
        documentType: "SALES_INVOICE_JOURNAL",
        voucherSuffix: "SV",
        sourceModule: "SALES",
        sourceDocumentType: "SalesInvoice",
        sourceDocumentId: invoice.id,
        sourceDocumentNumber: invoice.invoiceNumber,
        idempotencyKey: `SALES-INVOICE:${invoice.id}`,
        narration: `Sales invoice ${invoice.invoiceNumber} for ${invoice.customer.name}`,
        allowApproverPosting: true,
        lines: [
          { accountId: receivableAccount.id, description: `Customer receivable for ${invoice.invoiceNumber}`, debit: invoice.grandTotal, customerId: invoice.customerId, salespersonId: invoice.salespersonId, invoiceNumber: invoice.invoiceNumber, dueDate: invoice.dueDate },
          { accountId: revenueAccount.id, description: `Net sales on ${invoice.invoiceNumber}`, credit: netRevenue, customerId: invoice.customerId, salespersonId: invoice.salespersonId, invoiceNumber: invoice.invoiceNumber, dueDate: invoice.dueDate },
          ...(taxAccount ? [{ accountId: taxAccount.id, description: `Output tax on ${invoice.invoiceNumber}`, credit: invoice.taxTotal, customerId: invoice.customerId, salespersonId: invoice.salespersonId, invoiceNumber: invoice.invoiceNumber, dueDate: invoice.dueDate }] : []),
          { accountId: cogsAccount.id, description: `Cost of goods sold on ${invoice.invoiceNumber}`, debit: totalCost, customerId: invoice.customerId, salespersonId: invoice.salespersonId, invoiceNumber: invoice.invoiceNumber },
          { accountId: inventoryAccount.id, description: `Inventory issued on ${invoice.invoiceNumber}`, credit: totalCost, customerId: invoice.customerId, salespersonId: invoice.salespersonId, invoiceNumber: invoice.invoiceNumber },
        ],
      });

      const movementGroupId = crypto.randomUUID();
      for (const line of invoice.lines) {
        const cost = lineCosts.get(line.id)!;
        const serialized = line.product.trackingMethod === TrackingMethod.IMEI || line.product.trackingMethod === TrackingMethod.SERIAL;
        if (serialized) {
          for (const link of line.units) {
            const unit = await tx.physicalStockUnit.findUniqueOrThrow({ where: { id: link.stockUnitId } });
            await applyStockMovement(tx, {
              companyId: actor.companyId,
              branchId: invoice.branchId,
              warehouseId: invoice.warehouseId,
              productId: line.productId,
              variantId: line.variantId,
              stockUnitId: unit.id,
              journalEntryId: journal.id,
              movementGroupId,
              idempotencyKey: `SI:${invoice.id}:${line.id}:${unit.id}`,
              movementType: InventoryMovementType.SALE_ISSUE,
              postingDate: invoice.invoiceDate,
              quantity: "-1",
              unitCost: unit.acquisitionCost,
              sourceDocumentType: "SalesInvoice",
              sourceDocumentId: invoice.id,
              sourceDocumentNumber: invoice.invoiceNumber,
              lineReference: line.id,
              createdById: actor.userId,
            });
            await tx.physicalStockUnit.update({ where: { id: unit.id }, data: { status: StockUnitStatus.SOLD, currentBranchId: null, currentWarehouseId: null, currentLocationId: null, soldAt: new Date(), version: { increment: 1 } } });
          }
        } else {
          await applyStockMovement(tx, {
            companyId: actor.companyId,
            branchId: invoice.branchId,
            warehouseId: invoice.warehouseId,
            productId: line.productId,
            variantId: line.variantId,
            journalEntryId: journal.id,
            movementGroupId,
            idempotencyKey: `SI:${invoice.id}:${line.id}:QTY`,
            movementType: InventoryMovementType.SALE_ISSUE,
            postingDate: invoice.invoiceDate,
            quantity: line.quantity.negated(),
            unitCost: cost.unitCost,
            totalCost: cost.total.negated(),
            sourceDocumentType: "SalesInvoice",
            sourceDocumentId: invoice.id,
            sourceDocumentNumber: invoice.invoiceNumber,
            lineReference: line.id,
            createdById: actor.userId,
          });
        }
      }
      const posted = await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: { status: OperationalDocumentStatus.POSTED, journalEntryId: journal.id, postedById: actor.userId, postedAt: new Date(), costTotal: totalCost },
        include: { lines: { include: { units: { include: { stockUnit: { include: { identifiers: true } } } } }, orderBy: { lineNumber: "asc" } }, journalEntry: true },
      });
      await appendAudit({ companyId: actor.companyId, actorId: actor.userId, branchId: invoice.branchId, warehouseId: invoice.warehouseId, action: "SALES_INVOICE_POSTED", module: "sales", entityType: "SalesInvoice", entityId: invoice.id, entityReference: invoice.invoiceNumber, previousValues: { status: invoice.status }, newValues: { status: posted.status, journalEntryId: journal.id }, metadata: { movementGroupId, costTotal: moneyString(totalCost) } }, tx);
      return posted;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 },
  );
}
