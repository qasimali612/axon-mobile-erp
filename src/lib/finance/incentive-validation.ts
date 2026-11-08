import { z } from "zod";

const code = z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Use letters, numbers, dot, underscore or hyphen.").transform((value) => value.toUpperCase());
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const dateOnly = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD format.").refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Use a real calendar date.");
const amount = z.union([z.string(), z.number()]).transform((value) => String(value).trim()).refine((value) => /^\d{1,15}(\.\d{1,4})?$/.test(value), "Use a non-negative number with at most four decimals.");
const positiveAmount = amount.refine((value) => Number(value) > 0, "Use an amount above zero.");
const signedAmount = z.union([z.string(), z.number()]).transform((value) => String(value).trim()).refine((value) => /^-?\d{1,15}(\.\d{1,4})?$/.test(value), "Use a number with at most four decimals.");
const percent = z.string().trim().regex(/^\d{1,3}(\.\d{1,6})?$/, "Use a percentage with at most six decimals.").refine((value) => Number(value) > 0 && Number(value) <= 100, "Use a percentage above zero and at most 100.");

/** Calculation types this build can evaluate from posted sales. Other enum members are rejected explicitly. */
export const SUPPORTED_INCENTIVE_TYPES = ["PERCENT_NET_SALES", "SALES_TARGET", "BRANCH_TARGET", "FIXED_PER_UNIT"] as const;
export const SUPPORTED_RECIPIENT_TYPES = ["USER", "CUSTOMER", "BRANCH"] as const;
export const RETURN_ADJUSTMENT_RULES = ["REVERSE", "IGNORE"] as const;

export const incentivePlanSchema = z.object({
  code: code.pipe(z.string().max(30)),
  name: z.string().trim().min(2).max(160),
  effectiveFrom: dateOnly,
  effectiveTo: dateOnly,
  recipientType: z.enum(SUPPORTED_RECIPIENT_TYPES),
  branchId: z.string().uuid().optional().nullable(),
  incentiveType: z.enum(SUPPORTED_INCENTIVE_TYPES),
  rate: percent.optional().nullable().or(z.literal("")),
  fixedAmount: amount.optional().nullable().or(z.literal("")),
  minimumTarget: amount.default("0"),
  maximumIncentive: amount.optional().nullable().or(z.literal("")),
  returnAdjustmentRule: z.enum(RETURN_ADJUSTMENT_RULES).default("REVERSE"),
  approvalRequired: z.boolean().default(true),
  expenseAccountId: z.string().uuid(),
  payableAccountId: z.string().uuid(),
  isActive: z.boolean().default(true),
}).superRefine((value, context) => {
  if (value.effectiveTo < value.effectiveFrom) context.addIssue({ code: "custom", path: ["effectiveTo"], message: "The effective end date cannot precede the start date." });
  const percentageType = value.incentiveType === "PERCENT_NET_SALES" || value.incentiveType === "SALES_TARGET" || value.incentiveType === "BRANCH_TARGET";
  if (percentageType && !value.rate) context.addIssue({ code: "custom", path: ["rate"], message: "A percentage rate is required for this incentive type." });
  if (!percentageType && !value.fixedAmount) context.addIssue({ code: "custom", path: ["fixedAmount"], message: "A fixed amount per unit is required for this incentive type." });
  if (value.maximumIncentive && Number(value.maximumIncentive) <= 0) context.addIssue({ code: "custom", path: ["maximumIncentive"], message: "The maximum incentive must be above zero when it is set." });
});

export const incentiveCalculationSchema = z.object({
  periodStart: dateOnly,
  periodEnd: dateOnly,
  branchId: z.string().uuid().optional().nullable(),
}).superRefine((value, context) => {
  if (value.periodEnd < value.periodStart) context.addIssue({ code: "custom", path: ["periodEnd"], message: "The period end cannot precede the period start." });
});

export const incentiveAdjustmentSchema = z.object({
  adjustmentAmount: signedAmount,
  reason: z.string().trim().min(5, "Give at least five characters of reason.").max(500),
});

export const incentiveAccrualSchema = z.object({
  postingDate: dateOnly.optional(),
});

export const incentivePaymentSchema = z.object({
  amount: positiveAmount,
  paymentDate: dateOnly,
  paymentMethodId: z.string().uuid(),
  bankAccountId: z.string().uuid().optional().nullable(),
  reference: optionalText(120),
});

export const incentiveReversalSchema = z.object({
  reason: z.string().trim().min(5, "Give at least five characters of reason.").max(500),
});

export const receivedIncentiveSchema = z.object({
  referenceNumber: z.string().trim().min(1).max(60),
  payerName: z.string().trim().min(2).max(160),
  programName: z.string().trim().min(2).max(160),
  supplierId: z.string().uuid().optional().nullable(),
  planId: z.string().uuid().optional().nullable(),
  periodStart: dateOnly,
  periodEnd: dateOnly,
  targetQuantity: amount.default("0"),
  achievedQuantity: amount.default("0"),
  eligibleAmount: positiveAmount,
  expectedReceiptDate: dateOnly.optional().nullable().or(z.literal("")),
  incomeAccountId: z.string().uuid(),
  receivableAccountId: z.string().uuid(),
}).superRefine((value, context) => {
  if (value.periodEnd < value.periodStart) context.addIssue({ code: "custom", path: ["periodEnd"], message: "The period end cannot precede the period start." });
  if (value.expectedReceiptDate && value.expectedReceiptDate < value.periodEnd) context.addIssue({ code: "custom", path: ["expectedReceiptDate"], message: "The expected receipt cannot precede the claim period." });
});

export const receivedIncentivePaymentSchema = z.object({
  amount: positiveAmount,
  receiptDate: dateOnly,
  paymentMethodId: z.string().uuid(),
  bankAccountId: z.string().uuid().optional().nullable(),
  reference: optionalText(120),
});
