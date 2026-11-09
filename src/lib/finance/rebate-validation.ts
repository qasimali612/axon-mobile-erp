import { z } from "zod";

const code = z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Use letters, numbers, dot, underscore or hyphen.").transform((value) => value.toUpperCase());
const dateOnly = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD format.").refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Use a real calendar date.");
const amount = z.union([z.string(), z.number()]).transform((value) => String(value).trim()).refine((value) => /^\d{1,15}(\.\d{1,4})?$/.test(value), "Use a non-negative number with at most four decimals.");
const percent = z.string().trim().regex(/^\d{1,3}(\.\d{1,6})?$/, "Use a percentage with at most six decimals.").refine((value) => Number(value) > 0 && Number(value) <= 100, "Use a percentage above zero and at most 100.");

export const REBATE_METHODS = [
  "PERCENT_OF_VALUE",
  "PER_UNIT",
  "FIXED_AMOUNT",
  "PRICE_PROTECTION",
  "COMPANY_PRICE_REDUCTION",
  "PURCHASE_REBATE",
  "PROMOTIONAL_REBATE",
  "VOLUME_REBATE",
  "SPECIAL_ADJUSTMENT",
] as const;

export const REBATE_TREATMENTS = ["INCOME", "COST_REDUCTION"] as const;

export const rebateProgramSchema = z.object({
  code: code.pipe(z.string().max(30)),
  name: z.string().trim().min(2).max(160),
  direction: z.enum(["RECEIVABLE", "PAYABLE"]),
  supplierId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  effectiveFrom: dateOnly,
  effectiveTo: dateOnly,
  calculationMethod: z.enum(REBATE_METHODS),
  rate: percent.optional().nullable().or(z.literal("")),
  fixedAmount: amount.optional().nullable().or(z.literal("")),
  primaryAccountId: z.string().uuid(),
  settlementAccountId: z.string().uuid(),
  accountingTreatment: z.enum(REBATE_TREATMENTS),
  isActive: z.boolean().default(true),
  rules: z.record(z.string(), z.any()).optional().nullable(),
}).superRefine((value, context) => {
  if (value.effectiveTo < value.effectiveFrom) context.addIssue({ code: "custom", path: ["effectiveTo"], message: "The effective end date cannot precede the start date." });
  if (value.direction === "RECEIVABLE") {
    if (!value.supplierId) context.addIssue({ code: "custom", path: ["supplierId"], message: "A supplier rebate requires the supplier that grants it." });
    if (value.customerId) context.addIssue({ code: "custom", path: ["customerId"], message: "A supplier rebate cannot reference a customer." });
    if (value.accountingTreatment !== "INCOME") context.addIssue({ code: "custom", path: ["accountingTreatment"], message: "A supplier rebate is recognised as income." });
  } else {
    if (!value.customerId) context.addIssue({ code: "custom", path: ["customerId"], message: "A customer rebate requires the customer that earns it." });
    if (value.supplierId) context.addIssue({ code: "custom", path: ["supplierId"], message: "A customer rebate cannot reference a supplier." });
    if (value.accountingTreatment !== "COST_REDUCTION") context.addIssue({ code: "custom", path: ["accountingTreatment"], message: "A customer rebate reduces sales value." });
  }
  if (value.calculationMethod === "PERCENT_OF_VALUE" && !value.rate) context.addIssue({ code: "custom", path: ["rate"], message: "A percentage of value requires a rate." });
  if (!["PERCENT_OF_VALUE", "PRICE_PROTECTION", "COMPANY_PRICE_REDUCTION"].includes(value.calculationMethod) && !value.fixedAmount) {
    context.addIssue({ code: "custom", path: ["fixedAmount"], message: "This calculation method requires an amount." });
  }
  if (value.primaryAccountId === value.settlementAccountId) context.addIssue({ code: "custom", path: ["settlementAccountId"], message: "The settlement account must differ from the primary account." });
});

export const rebateItemImeiSchema = z.object({
  stockUnitId: z.string().uuid().optional(),
  imei1: z.string().optional().nullable(),
  imei2: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  receiptNumber: z.string().optional().nullable(),
  receiptDate: z.string().optional().nullable(),
  warehouseName: z.string().optional().nullable(),
  costPrice: z.number().optional().nullable(),
});

export const rebateItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid(),
  productName: z.string().min(1),
  variantName: z.string().min(1),
  brandName: z.string().optional().nullable(),
  sku: z.string().min(1),
  model: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  currentStock: z.number().nonnegative(),
  eligibleQuantity: z.number().nonnegative(),
  claimedQuantity: z.number().nonnegative().optional(),
  approvedQuantity: z.number().nonnegative().optional(),
  settledQuantity: z.number().nonnegative().optional(),
  remainingQuantity: z.number().nonnegative().optional(),
  oldPrice: z.number().positive(),
  newPrice: z.number().nonnegative(),
  priceDropPerUnit: z.number().nonnegative(),
  claimAmount: z.number().nonnegative(),
  approvedAmount: z.number().nonnegative().optional(),
  outstandingAmount: z.number().nonnegative().optional(),
  claimedUnitIds: z.array(z.string()).optional(),
  imeis: z.array(rebateItemImeiSchema).optional(),
  manualAdjustmentReason: z.string().optional().nullable(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "SETTLED"]).optional(),
  rejectionReason: z.string().optional().nullable(),
});

export type RebateItem = z.infer<typeof rebateItemSchema>;

export const rebateCalculationSchema = z.object({
  periodStart: dateOnly,
  periodEnd: dateOnly,
  items: z.array(rebateItemSchema).optional(),
  title: z.string().optional().nullable(),
  supportingDocRef: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
}).superRefine((value, context) => {
  if (value.periodEnd < value.periodStart) context.addIssue({ code: "custom", path: ["periodEnd"], message: "The period end cannot precede the period start." });
});

export const priceAnnouncementItemSchema = z.object({
  variantId: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string().min(1),
  variantName: z.string().min(1),
  brandName: z.string().optional().nullable(),
  sku: z.string().min(1),
  oldPrice: z.number().positive("Previous price must be greater than zero."),
  newPrice: z.number().positive("Revised price must be greater than zero."),
  priceDrop: z.number().nonnegative(),
  rebatePerUnit: z.number().nonnegative(),
  eligibleStockCount: z.number().nonnegative().optional(),
});

export const priceAnnouncementSchema = z.object({
  announcementNumber: z.string().trim().min(2).max(40),
  title: z.string().trim().min(3).max(160),
  supplierId: z.string().uuid("Select the supplier or manufacturer announcing the price cut."),
  announcementDate: dateOnly,
  effectiveFrom: dateOnly,
  effectiveTo: dateOnly,
  submissionDeadline: dateOnly.optional().nullable(),
  purchaseDateFrom: dateOnly.optional().nullable(),
  purchaseDateTo: dateOnly.optional().nullable(),
  primaryAccountId: z.string().uuid("Select the income or cost-reduction GL account."),
  settlementAccountId: z.string().uuid("Select the rebate receivable GL account."),
  applicableBranches: z.array(z.string().uuid()).optional(),
  applicableWarehouses: z.array(z.string().uuid()).optional(),
  supportingDocRef: z.string().trim().max(100).optional().nullable(),
  remarks: z.string().trim().max(500).optional().nullable(),
  items: z.array(priceAnnouncementItemSchema).min(1, "At least one product model must be included in the price announcement."),
}).superRefine((value, context) => {
  if (value.effectiveTo < value.effectiveFrom) {
    context.addIssue({ code: "custom", path: ["effectiveTo"], message: "Effective end date cannot precede start date." });
  }
  if (value.purchaseDateFrom && value.purchaseDateTo && value.purchaseDateTo < value.purchaseDateFrom) {
    context.addIssue({ code: "custom", path: ["purchaseDateTo"], message: "Purchase end date cannot precede start date." });
  }
});

export const rebateSettlementSchema = z.object({
  amount: amount.refine((value) => Number(value) > 0, "Use an amount above zero."),
  settlementDate: dateOnly,
  paymentMethodId: z.string().uuid(),
  bankAccountId: z.string().uuid().optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(300).optional().nullable(),
  itemAllocations: z.array(z.object({
    variantId: z.string().uuid(),
    allocatedAmount: z.number().positive(),
  })).optional(),
});

export const customerPriceProtectionSchema = z.object({
  customerId: z.string().uuid("Select an active customer or dealer."),
  programId: z.string().uuid("Select the price protection program."),
  claimDate: dateOnly,
  salesInvoiceId: z.string().uuid().optional().nullable(),
  settlementType: z.enum(["CREDIT_NOTE", "ACCOUNT_ADJUSTMENT", "BANK_REFUND", "CASH_REFUND"]),
  items: z.array(z.object({
    productId: z.string().uuid(),
    variantId: z.string().uuid(),
    productName: z.string().min(1),
    variantName: z.string().min(1),
    sku: z.string().min(1),
    soldQuantity: z.number().positive(),
    eligibleQuantity: z.number().positive(),
    oldPrice: z.number().positive(),
    newPrice: z.number().positive(),
    rebatePerUnit: z.number().positive(),
    totalRebate: z.number().positive(),
    claimedUnitIds: z.array(z.string()).optional(),
    imeis: z.array(z.string()).optional(),
  })).min(1, "Select at least one eligible item."),
  reference: z.string().trim().max(60).optional().nullable(),
  remarks: z.string().trim().max(400).optional().nullable(),
});
