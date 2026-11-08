import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const code = z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Use letters, numbers, dot, underscore or hyphen.").transform((value) => value.toUpperCase());
export const categoryMasterSchema = z.object({
  code,
  name: z.string().trim().min(2).max(100),
  parentId: z.string().uuid().optional().nullable(),
  description: optionalText(1_000),
  isActive: z.boolean().default(true),
});
export const brandMasterSchema = z.object({
  code,
  name: z.string().trim().min(2).max(100),
  logoUrl: z.string().trim().url().max(2_000).optional().nullable().or(z.literal("")),
  isActive: z.boolean().default(true),
});
export const unitMasterSchema = z.object({
  code: code.pipe(z.string().max(20)),
  name: z.string().trim().min(2).max(60),
  decimalPlaces: z.number().int().min(0).max(6),
  isActive: z.boolean().default(true),
});
export const warehouseLocationSchema = z.object({
  parentId: z.string().uuid().optional().nullable(),
  code,
  name: z.string().trim().min(2).max(100),
  type: z.enum(["ZONE", "RACK", "SHELF", "BIN"]),
  barcode: z.string().trim().min(2).max(80).optional().nullable(),
  sequence: z.number().int().min(0).max(32_767).default(0),
  isQuarantine: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
