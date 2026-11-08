import { IdentifierType, PaymentDirection, PurchaseReceiptType, QualityInspectionResult, StockReturnDisposition, StockReturnType } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "@/lib/api";

export const operationUuid = z.string().uuid();
export const operationDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format.");
const positiveDecimal = z
  .string()
  .regex(/^\d{1,15}(?:\.\d{1,4})?$/, "Use a non-negative decimal with at most four places.")
  .refine((value) => Number(value) > 0, "The value must be greater than zero.");
const nonnegativeMoney = z.string().regex(/^\d{1,15}(?:\.\d{1,4})?$/, "Use a non-negative amount with at most four places.");
const signedNonzeroDecimal = z
  .string()
  .regex(/^-?\d{1,15}(?:\.\d{1,4})?$/, "Use a signed decimal with at most four places.")
  .refine((value) => Number(value) !== 0, "The value cannot be zero.");
const idempotencyKey = z.string().trim().min(8).max(120);

export const purchaseOrderDraftSchema = z.object({
  branchId: operationUuid,
  warehouseId: operationUuid,
  supplierId: operationUuid,
  orderDate: operationDate,
  expectedDate: operationDate.optional().nullable(),
  supplierReference: z.string().trim().max(100).optional().nullable(),
  paymentTermsDays: z.number().int().min(0).max(3650).default(0),
  currencyCode: z.string().trim().length(3).toUpperCase().default("PKR"),
  exchangeRate: positiveDecimal.default("1"),
  documentDiscount: nonnegativeMoney.default("0"),
  freightTotal: nonnegativeMoney.default("0"),
  otherCharges: nonnegativeMoney.default("0"),
  notes: z.string().trim().max(2_000).optional().nullable(),
  idempotencyKey,
  lines: z.array(z.object({
    productId: operationUuid,
    variantId: operationUuid,
    taxRuleId: operationUuid.optional().nullable(),
    description: z.string().trim().min(2).max(500),
    quantity: positiveDecimal,
    unitCost: nonnegativeMoney,
    discountAmount: nonnegativeMoney.default("0"),
    taxRate: nonnegativeMoney.optional(),
    // Retained as an optional compatibility field. The server ignores this
    // value and recalculates tax from the selected, active tax rule.
    taxAmount: nonnegativeMoney.optional(),
  })).min(1).max(200),
});

const identifierSchema = z.object({
  type: z.nativeEnum(IdentifierType),
  value: z.string().trim().min(1).max(120),
  slot: z.number().int().min(1).max(8).optional().nullable(),
  isPrimary: z.boolean().optional(),
});

export const purchaseReceiptDraftSchema = z.object({
  branchId: operationUuid,
  warehouseId: operationUuid,
  supplierId: operationUuid,
  purchaseOrderId: operationUuid.optional().nullable(),
  receiptType: z.nativeEnum(PurchaseReceiptType).optional(),
  receiptDate: operationDate,
  supplierInvoiceNumber: z.string().trim().max(80).optional().nullable(),
  supplierDeliveryNote: z.string().trim().max(100).optional().nullable(),
  directReceiptReason: z.string().trim().max(300).optional().nullable(),
  allowOverReceipt: z.boolean().default(false),
  overReceiptReason: z.string().trim().max(300).optional().nullable(),
  requiresInspection: z.boolean().default(false),
  invoiceDate: operationDate.optional().nullable(),
  dueDate: operationDate.optional().nullable(),
  currencyCode: z.string().trim().length(3).toUpperCase().default("PKR"),
  documentDiscount: nonnegativeMoney.default("0"),
  freightTotal: nonnegativeMoney.default("0"),
  otherCharges: nonnegativeMoney.default("0"),
  notes: z.string().trim().max(2_000).optional().nullable(),
  idempotencyKey,
  lines: z.array(z.object({
    orderLineId: operationUuid.optional().nullable(),
    productId: operationUuid,
    variantId: operationUuid,
    taxRuleId: operationUuid.optional().nullable(),
    lotId: operationUuid.optional().nullable(),
    description: z.string().trim().min(2).max(500),
    quantity: positiveDecimal,
    acceptedQuantity: nonnegativeMoney.optional(),
    rejectedQuantity: nonnegativeMoney.default("0"),
    unitCost: nonnegativeMoney,
    discountAmount: nonnegativeMoney.default("0"),
    taxRate: nonnegativeMoney.optional(),
    taxAmount: nonnegativeMoney.optional(),
    inspectionNotes: z.string().trim().max(500).optional().nullable(),
    units: z.array(z.object({
      identifiers: z.array(identifierSchema).min(1).max(12),
      attributes: z.record(z.string(), z.unknown()).optional().nullable(),
      condition: z.string().trim().max(80).optional().nullable(),
      inspectionStatus: z.nativeEnum(QualityInspectionResult).default(QualityInspectionResult.ACCEPTED),
    })).max(500).default([]),
  })).min(1).max(200),
});

export const purchaseReceiptInspectionSchema = z.object({
  lines: z.array(z.object({
    lineId: operationUuid,
    acceptedQuantity: nonnegativeMoney.optional(),
    rejectedQuantity: nonnegativeMoney.optional(),
    notes: z.string().trim().max(500).optional().nullable(),
    units: z.array(z.object({
      unitId: operationUuid,
      result: z.nativeEnum(QualityInspectionResult).refine((value) => value !== QualityInspectionResult.PENDING, "Inspection result cannot remain pending."),
      condition: z.string().trim().max(80).optional().nullable(),
      notes: z.string().trim().max(500).optional().nullable(),
    })).max(500).default([]),
  })).min(1).max(200),
});

export const salesInvoiceDraftSchema = z.object({
  branchId: operationUuid,
  warehouseId: operationUuid,
  customerId: operationUuid,
  salespersonId: operationUuid.optional().nullable(),
  priceListId: operationUuid.optional().nullable(),
  invoiceDate: operationDate,
  dueDate: operationDate.optional().nullable(),
  currencyCode: z.string().trim().length(3).toUpperCase().default("PKR"),
  notes: z.string().trim().max(2_000).optional().nullable(),
  idempotencyKey,
  lines: z.array(z.object({
    productId: operationUuid,
    variantId: operationUuid,
    description: z.string().trim().min(2).max(500),
    quantity: positiveDecimal,
    unitPrice: nonnegativeMoney,
    discountAmount: nonnegativeMoney.default("0"),
    taxRuleId: operationUuid.optional().nullable(),
    taxRate: nonnegativeMoney.optional(),
    // Compatibility only; the server recalculates tax from the active rule.
    taxAmount: nonnegativeMoney.optional(),
    stockUnitIds: z.array(operationUuid).max(500).default([]),
  })).min(1).max(200),
});

export const stockReturnDraftSchema = z.object({
  returnType: z.nativeEnum(StockReturnType),
  branchId: operationUuid,
  warehouseId: operationUuid,
  sourceDocumentId: operationUuid,
  returnDate: operationDate,
  currencyCode: z.string().trim().length(3).toUpperCase().default("PKR"),
  reason: z.string().trim().min(10).max(500),
  notes: z.string().trim().max(2_000).optional().nullable(),
  idempotencyKey,
  lines: z.array(z.object({
    sourceLineId: operationUuid,
    quantity: positiveDecimal,
    disposition: z.nativeEnum(StockReturnDisposition),
    condition: z.string().trim().max(80).optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
    stockUnitIds: z.array(operationUuid).max(500).default([]),
  })).min(1).max(200),
});

export const stockTransferDraftSchema = z.object({
  sourceBranchId: operationUuid,
  sourceWarehouseId: operationUuid,
  destinationBranchId: operationUuid,
  destinationWarehouseId: operationUuid,
  transferDate: operationDate,
  reference: z.string().trim().max(100).optional().nullable(),
  reason: z.string().trim().min(3).max(200),
  remarks: z.string().trim().max(2_000).optional().nullable(),
  idempotencyKey,
  lines: z.array(z.object({
    productId: operationUuid,
    variantId: operationUuid,
    lotId: operationUuid.optional().nullable(),
    quantity: positiveDecimal,
    stockUnitIds: z.array(operationUuid).max(500).default([]),
  })).min(1).max(200),
}).refine((transfer) => transfer.sourceWarehouseId !== transfer.destinationWarehouseId, {
  message: "Source and destination warehouses must be different.",
  path: ["destinationWarehouseId"],
});

export const stockTransferCancellationSchema = z.object({
  reason: z.string().trim().min(10).max(1_000),
});

export const stockAdjustmentDraftSchema = z.object({
  branchId: operationUuid,
  warehouseId: operationUuid,
  adjustmentDate: operationDate,
  reasonCode: z.string().trim().min(2).max(40).toUpperCase(),
  reason: z.string().trim().min(10).max(500),
  notes: z.string().trim().max(2_000).optional().nullable(),
  idempotencyKey,
  lines: z.array(z.object({
    productId: operationUuid,
    variantId: operationUuid,
    lotId: operationUuid.optional().nullable(),
    quantityDelta: signedNonzeroDecimal,
    unitCost: nonnegativeMoney.optional(),
    notes: z.string().trim().max(500).optional().nullable(),
    stockUnitIds: z.array(operationUuid).max(500).default([]),
    units: z.array(z.object({
      stockUnitId: operationUuid.optional().nullable(),
      unitCost: nonnegativeMoney,
      attributes: z.record(z.string(), z.unknown()).optional().nullable(),
      identifiers: z.array(identifierSchema).max(12).default([]),
    })).max(500).default([]),
  })).min(1).max(200),
});

export const stockCountCreateSchema = z.object({
  branchId: operationUuid,
  warehouseId: operationUuid,
  countDate: operationDate,
  scopeMode: z.enum(["FULL", "PARTIAL", "CYCLE"]).default("FULL"),
  reason: z.string().trim().min(10).max(500),
  notes: z.string().trim().max(2_000).optional().nullable(),
  variantIds: z.array(operationUuid).max(500).default([]),
  idempotencyKey,
}).refine((count) => count.scopeMode === "FULL" || count.variantIds.length > 0, {
  message: "Partial and cycle counts require at least one selected variant.",
  path: ["variantIds"],
});

export const stockCountRecordSchema = z.object({
  lines: z.array(z.object({
    lineId: operationUuid,
    countedQuantity: nonnegativeMoney,
    countedStockUnitIds: z.array(operationUuid).max(1_000).default([]),
    notes: z.string().trim().max(500).optional().nullable(),
  })).min(1).max(500),
});

export const paymentDraftSchema = z.object({
  branchId: operationUuid,
  customerId: operationUuid.optional().nullable(),
  supplierId: operationUuid.optional().nullable(),
  bankAccountId: operationUuid.optional().nullable(),
  cashAccountId: operationUuid.optional().nullable(),
  paymentMethodId: operationUuid.optional().nullable(),
  paymentDate: operationDate,
  direction: z.nativeEnum(PaymentDirection),
  currencyCode: z.string().trim().length(3).toUpperCase().default("PKR"),
  amount: positiveDecimal,
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(2_000).optional().nullable(),
  idempotencyKey,
  allocations: z.array(z.object({
    salesInvoiceId: operationUuid.optional().nullable(),
    purchaseReceiptId: operationUuid.optional().nullable(),
    amount: positiveDecimal,
  }).refine((allocation) => Boolean(allocation.salesInvoiceId) !== Boolean(allocation.purchaseReceiptId), {
    message: "Each allocation must reference exactly one sales invoice or purchase receipt.",
  })).max(200).default([]),
}).refine((payment) => Boolean(payment.customerId) !== Boolean(payment.supplierId), {
  message: "A payment must reference exactly one customer or supplier.",
}).refine((payment) => Boolean(payment.paymentMethodId) || Boolean(payment.bankAccountId) !== Boolean(payment.cashAccountId), {
  message: "A payment must settle through exactly one bank or cash account, or through an active payment method.",
});

export const customerDraftSchema = z.object({
  branchId: operationUuid.optional().nullable(),
  code: z.string().trim().min(2).max(30).toUpperCase(),
  name: z.string().trim().min(2).max(160),
  customerType: z.string().trim().min(2).max(40).default("RETAIL"),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email().max(190).optional().nullable().or(z.literal("")),
  address: z.string().trim().max(2_000).optional().nullable(),
  taxNumber: z.string().trim().max(80).optional().nullable(),
  creditLimit: nonnegativeMoney.default("0"),
  paymentTermsDays: z.number().int().min(0).max(3650).default(0),
  priceListId: operationUuid.optional().nullable(),
});

export const supplierDraftSchema = z.object({
  branchId: operationUuid.optional().nullable(),
  code: z.string().trim().min(2).max(30).toUpperCase(),
  name: z.string().trim().min(2).max(160),
  contactPerson: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email().max(190).optional().nullable().or(z.literal("")),
  address: z.string().trim().max(2_000).optional().nullable(),
  taxNumber: z.string().trim().max(80).optional().nullable(),
  creditLimit: nonnegativeMoney.default("0"),
  paymentTermsDays: z.number().int().min(0).max(3650).default(0),
});

export const operationReversalSchema = z.object({
  postingDate: operationDate,
  reason: z.string().trim().min(10).max(1_000),
  idempotencyKey,
});

export function parseOperationDate(value: string, label = "Date") {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ApiError(422, "INVALID_DATE", `${label} is not a valid calendar date.`);
  }
  return parsed;
}
