import { z } from "zod";

export const idSchema = z.string().uuid();

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(190),
  password: z.string().min(8).max(128),
});

export const companySchema = z.object({
  name: z.string().trim().min(2).max(160),
  legalName: z.string().trim().max(200).optional().or(z.literal("")),
  registrationNumber: z.string().trim().max(80).optional().or(z.literal("")),
  taxRegistrationNumber: z.string().trim().max(80).optional().or(z.literal("")),
  addressLine1: z.string().trim().max(200).optional().or(z.literal("")),
  addressLine2: z.string().trim().max(200).optional().or(z.literal("")),
  countryCode: z.string().trim().toUpperCase().length(2),
  province: z.string().trim().max(100).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  postalCode: z.string().trim().max(20).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email().max(190).optional().or(z.literal("")),
  currencyCode: z.string().trim().toUpperCase().length(3),
  timeZone: z.string().trim().min(3).max(64),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
  decimalPrecision: z.coerce.number().int().min(0).max(4),
  inventoryCostingMethod: z.enum(["SPECIFIC", "FIFO", "WEIGHTED_AVERAGE"]),
  allowNegativeStock: z.boolean().default(false),
});

export const branchSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(20).regex(/^[A-Z0-9-]+$/),
  name: z.string().trim().min(2).max(140),
  type: z.enum(["HEAD_OFFICE", "RETAIL_STORE", "WHOLESALE", "DISTRIBUTION_CENTER"]),
  documentPrefix: z.string().trim().toUpperCase().min(2).max(12).regex(/^[A-Z0-9-]+$/),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  province: z.string().trim().max(100).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email().max(190).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});

export const warehouseSchema = z.object({
  branchId: idSchema,
  code: z.string().trim().toUpperCase().min(2).max(24).regex(/^[A-Z0-9-]+$/),
  name: z.string().trim().min(2).max(140),
  type: z.enum(["MAIN", "RETAIL", "TRANSIT", "QUARANTINE", "DAMAGED", "SERVICE"]),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  allowReceiving: z.boolean().default(true),
  allowDispatch: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const moneyString = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine((value) => /^\d{1,15}(\.\d{1,4})?$/.test(value), "Enter a valid non-negative amount.");

const productVariantFields = z.object({
  sku: z.string().trim().toUpperCase().min(2).max(60).regex(/^[A-Z0-9._-]+$/),
  name: z.string().trim().min(2).max(160),
  color: z.string().trim().max(60).optional().or(z.literal("")),
  ramGb: z.coerce.number().int().min(0).max(1024).optional().nullable(),
  storageGb: z.coerce.number().int().min(0).max(16384).optional().nullable(),
  networkType: z.string().trim().max(40).optional().or(z.literal("")),
  simConfiguration: z.string().trim().max(40).optional().or(z.literal("")),
  regionVariant: z.string().trim().max(80).optional().or(z.literal("")),
  purchasePrice: moneyString,
  wholesalePrice: moneyString,
  retailPrice: moneyString,
  minimumSellingPrice: moneyString,
});

export const productVariantSchema = productVariantFields.extend({
  isActive: z.boolean().default(true),
  barcodes: z.array(z.object({
    barcode: z.string().trim().min(2).max(100),
    type: z.string().trim().min(2).max(20).toUpperCase().default("CODE128"),
    isPrimary: z.boolean().default(false),
  })).max(20).default([]),
}).superRefine((data, context) => {
  if (Number(data.minimumSellingPrice) > Number(data.retailPrice)) context.addIssue({ code: "custom", path: ["minimumSellingPrice"], message: "Minimum price cannot exceed retail price." });
  if (data.barcodes.filter((barcode) => barcode.isPrimary).length > 1) context.addIssue({ code: "custom", path: ["barcodes"], message: "Only one barcode can be primary for a variant." });
  if (new Set(data.barcodes.map((barcode) => barcode.barcode)).size !== data.barcodes.length) context.addIssue({ code: "custom", path: ["barcodes"], message: "Variant barcodes must be unique." });
});

export const productSchema = z.object({
  sku: z.string().trim().toUpperCase().min(2).max(60).regex(/^[A-Z0-9._-]+$/),
  name: z.string().trim().min(2).max(180),
  model: z.string().trim().max(120).optional().or(z.literal("")),
  modelCode: z.string().trim().max(80).optional().or(z.literal("")),
  categoryId: idSchema,
  brandId: idSchema.optional().nullable().or(z.literal("")),
  unitId: idSchema,
  productType: z.enum(["SMARTPHONE", "FEATURE_PHONE", "TABLET", "SMARTWATCH", "ACCESSORY", "SPARE_PART", "SERVICE", "OTHER"]),
  trackingMethod: z.enum(["IMEI", "SERIAL", "BATCH", "QUANTITY"]),
  costingMethod: z.enum(["SPECIFIC", "FIFO", "WEIGHTED_AVERAGE"]),
  standardPurchasePrice: moneyString,
  reorderLevel: moneyString,
  maxStockLevel: moneyString.default("0"),
  preferredSupplierId: idSchema.optional().nullable().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  variant: productVariantFields.extend({
    barcode: z.string().trim().max(100).optional().or(z.literal("")),
  }),
}).superRefine((data, context) => {
  if (["SMARTPHONE", "FEATURE_PHONE"].includes(data.productType) && data.trackingMethod !== "IMEI") {
    context.addIssue({ code: "custom", path: ["trackingMethod"], message: "Phones must use IMEI tracking." });
  }
  if (Number(data.variant.minimumSellingPrice) > Number(data.variant.retailPrice)) {
    context.addIssue({ code: "custom", path: ["variant", "minimumSellingPrice"], message: "Minimum price cannot exceed retail price." });
  }
});

export const userCreateSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: z.string().trim().toLowerCase().email().max(190),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  temporaryPassword: z.string().min(12).max(128),
  roleId: idSchema,
  branchId: idSchema.optional().nullable().or(z.literal("")),
  warehouseId: idSchema.optional().nullable().or(z.literal("")),
});

export const roleCreateSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(50).regex(/^[A-Z0-9_]+$/),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  permissionKeys: z.array(z.string().max(120)).max(200),
});

export const departmentSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(30).regex(/^[A-Z0-9-]+$/),
  name: z.string().trim().min(2).max(120),
  branchId: idSchema.optional().nullable().or(z.literal("")),
  isActive: z.boolean().default(true),
});

export const sequenceSchema = z.object({
  prefix: z.string().trim().toUpperCase().min(1).max(20),
  padding: z.coerce.number().int().min(3).max(10),
  nextValue: z.coerce.number().int().min(1).optional(),
});
