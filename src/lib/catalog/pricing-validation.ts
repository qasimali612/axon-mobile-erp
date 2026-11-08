import { z } from "zod";

const code = z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Use letters, numbers, dot, underscore or hyphen.").transform((value) => value.toUpperCase());
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const optionalDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD format.").optional().nullable().or(z.literal(""));
const decimalString = (label: string) =>
  z.union([z.string(), z.number()])
    .transform((value) => String(value).trim())
    .refine((value) => /^\d{1,15}(\.\d{1,4})?$/.test(value), `${label} must be a non-negative amount with at most four decimals.`);

export const PRICE_LEVELS = ["RETAIL", "WHOLESALE", "DEALER", "PROMOTIONAL"] as const;
export const PAYMENT_METHOD_TYPES = ["CASH", "BANK_TRANSFER", "CARD", "MOBILE_WALLET", "CHEQUE"] as const;

export const priceListItemSchema = z.object({
  variantId: z.string().uuid(),
  price: decimalString("Price"),
  minimumPrice: decimalString("Minimum price").optional().nullable(),
});

export const priceListMasterSchema = z.object({
  code,
  name: z.string().trim().min(2).max(120),
  priceLevel: z.enum(PRICE_LEVELS).default("RETAIL"),
  currencyCode: z.string().trim().length(3).toUpperCase().default("PKR"),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  effectiveFrom: optionalDate,
  effectiveTo: optionalDate,
  notes: optionalText(1_000),
  items: z.array(priceListItemSchema).max(2_000).optional(),
}).superRefine((value, context) => {
  if (value.effectiveFrom && value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
    context.addIssue({ code: "custom", path: ["effectiveTo"], message: "Effective to date cannot precede the effective from date." });
  }
  const seen = new Set<string>();
  for (const [index, item] of (value.items || []).entries()) {
    if (seen.has(item.variantId)) context.addIssue({ code: "custom", path: ["items", index, "variantId"], message: "A variant can appear only once on a price list." });
    seen.add(item.variantId);
    if (Number(item.minimumPrice || 0) > Number(item.price)) {
      context.addIssue({ code: "custom", path: ["items", index, "minimumPrice"], message: "Line minimum price cannot exceed the list price." });
    }
  }
  if (value.isDefault && !value.isActive) {
    context.addIssue({ code: "custom", path: ["isDefault"], message: "The default price list must stay active." });
  }
});

export const priceListItemUpsertSchema = z.object({
  items: z.array(priceListItemSchema).max(2_000),
}).superRefine((value, context) => {
  const seen = new Set<string>();
  for (const [index, item] of value.items.entries()) {
    if (seen.has(item.variantId)) context.addIssue({ code: "custom", path: ["items", index, "variantId"], message: "A variant can appear only once on a price list." });
    seen.add(item.variantId);
    if (Number(item.minimumPrice || 0) > Number(item.price)) {
      context.addIssue({ code: "custom", path: ["items", index, "minimumPrice"], message: "Line minimum price cannot exceed the list price." });
    }
  }
});

export const paymentMethodMasterSchema = z.object({
  code,
  name: z.string().trim().min(2).max(80),
  methodType: z.enum(PAYMENT_METHOD_TYPES),
  cashAccountId: z.string().uuid().optional().nullable(),
  bankAccountId: z.string().uuid().optional().nullable(),
  requiresReference: z.boolean().default(false),
  sequence: z.number().int().min(0).max(32_767).default(0),
  isActive: z.boolean().default(true),
  notes: optionalText(1_000),
}).superRefine((value, context) => {
  if (value.methodType === "CASH") {
    if (!value.cashAccountId) context.addIssue({ code: "custom", path: ["cashAccountId"], message: "Cash methods must settle into a cash account." });
    if (value.bankAccountId) context.addIssue({ code: "custom", path: ["bankAccountId"], message: "Cash methods cannot reference a bank account." });
  } else {
    if (!value.bankAccountId) context.addIssue({ code: "custom", path: ["bankAccountId"], message: "Non-cash methods must settle into a bank account." });
    if (value.cashAccountId) context.addIssue({ code: "custom", path: ["cashAccountId"], message: "Non-cash methods cannot reference a cash account." });
  }
});
