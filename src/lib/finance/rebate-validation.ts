import { z } from "zod";

const code = z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Use letters, numbers, dot, underscore or hyphen.").transform((value) => value.toUpperCase());
const dateOnly = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD format.").refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Use a real calendar date.");
const amount = z.union([z.string(), z.number()]).transform((value) => String(value).trim()).refine((value) => /^\d{1,15}(\.\d{1,4})?$/.test(value), "Use a non-negative number with at most four decimals.");
const percent = z.string().trim().regex(/^\d{1,3}(\.\d{1,6})?$/, "Use a percentage with at most six decimals.").refine((value) => Number(value) > 0 && Number(value) <= 100, "Use a percentage above zero and at most 100.");

export const REBATE_METHODS = ["PERCENT_OF_VALUE", "PER_UNIT", "FIXED_AMOUNT", "PRICE_PROTECTION"] as const;
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
  if (value.calculationMethod !== "PERCENT_OF_VALUE" && value.calculationMethod !== "PRICE_PROTECTION" && !value.fixedAmount) context.addIssue({ code: "custom", path: ["fixedAmount"], message: "This calculation method requires an amount." });
  if (value.primaryAccountId === value.settlementAccountId) context.addIssue({ code: "custom", path: ["settlementAccountId"], message: "The settlement account must differ from the primary account." });
});

export const rebateItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid(),
  productName: z.string().min(1),
  variantName: z.string().min(1),
  sku: z.string().min(1),
  currentStock: z.number().nonnegative(),
  eligibleQuantity: z.number().positive(),
  oldPrice: z.number().positive(),
  newPrice: z.number().positive(),
  priceDropPerUnit: z.number().positive(),
  claimAmount: z.number().positive(),
});

export type RebateItem = z.infer<typeof rebateItemSchema>;

export const rebateCalculationSchema = z.object({
  periodStart: dateOnly,
  periodEnd: dateOnly,
  items: z.array(rebateItemSchema).optional(),
}).superRefine((value, context) => {
  if (value.periodEnd < value.periodStart) context.addIssue({ code: "custom", path: ["periodEnd"], message: "The period end cannot precede the period start." });
});

export const rebateSettlementSchema = z.object({
  amount: amount.refine((value) => Number(value) > 0, "Use an amount above zero."),
  settlementDate: dateOnly,
  paymentMethodId: z.string().uuid(),
  bankAccountId: z.string().uuid().optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
});
