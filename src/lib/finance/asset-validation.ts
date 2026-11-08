import { DepreciationMethod } from "@prisma/client";
import { z } from "zod";

const code = z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Use letters, numbers, dot, underscore or hyphen.").transform((value) => value.toUpperCase());
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const dateOnly = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD format.").refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Use a real calendar date.");
const rate = z.string().trim().regex(/^\d{1,3}(\.\d{1,6})?$/, "Use a percentage with at most six decimals.").refine((value) => Number(value) > 0 && Number(value) <= 100, "Use a percentage above zero and at most 100.");
const amount = z.union([z.string(), z.number()]).transform((value) => String(value).trim()).refine((value) => /^\d{1,15}(\.\d{1,4})?$/.test(value), "Use a non-negative number with at most four decimals.");

export const assetCategorySchema = z.object({
  code: code.pipe(z.string().max(30)),
  name: z.string().trim().min(2).max(120),
  depreciable: z.boolean().default(true),
  defaultUsefulLifeMonths: z.number().int().min(1).max(1_200).optional().nullable(),
  defaultMethod: z.nativeEnum(DepreciationMethod).default(DepreciationMethod.STRAIGHT_LINE),
  defaultRate: rate.optional().nullable().or(z.literal("")),
  assetAccountId: z.string().uuid(),
  accumulatedAccountId: z.string().uuid(),
  expenseAccountId: z.string().uuid(),
  disposalAccountId: z.string().uuid(),
  isActive: z.boolean().default(true),
});

export const fixedAssetSchema = z.object({
  categoryId: z.string().uuid(),
  branchId: z.string().uuid(),
  code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Use letters, numbers, dot, underscore or hyphen.").transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(180),
  description: optionalText(2_000),
  serialNumber: optionalText(120),
  supplierId: z.string().uuid().optional().nullable(),
  custodianId: z.string().uuid().optional().nullable(),
  assetLocation: optionalText(180),
  purchaseDate: dateOnly,
  capitalizationDate: dateOnly,
  depreciationStartDate: dateOnly.optional().nullable().or(z.literal("")),
  purchaseCost: amount,
  additionalCost: amount.default("0"),
  residualValue: amount.default("0"),
  usefulLifeMonths: z.number().int().min(1).max(1_200).optional().nullable(),
  depreciationMethod: z.nativeEnum(DepreciationMethod).default(DepreciationMethod.STRAIGHT_LINE),
  depreciationRate: rate.optional().nullable().or(z.literal("")),
}).superRefine((value, context) => {
  if (value.capitalizationDate < value.purchaseDate) context.addIssue({ code: "custom", path: ["capitalizationDate"], message: "Capitalization date cannot precede the purchase date." });
});

export const capitalizationSchema = z.object({
  settlementAccountId: z.string().uuid(),
  postingDate: dateOnly.optional(),
});

export const depreciationGenerateSchema = z.object({
  periodDate: dateOnly,
  categoryId: z.string().uuid().optional().nullable(),
});

export const depreciationPostSchema = z.object({
  periodDate: dateOnly,
  scheduleIds: z.array(z.string().uuid()).max(2_000).optional(),
});

export const assetDisposalSchema = z.object({
  disposalDate: dateOnly,
  method: z.enum(["SALE", "SCRAP", "WRITE_OFF", "TRADE_IN", "DONATION"]),
  proceeds: amount.default("0"),
  proceedsAccountId: z.string().uuid().optional().nullable(),
  reason: z.string().trim().min(10, "Give at least ten characters of reason.").max(2_000),
});
