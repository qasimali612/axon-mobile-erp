import { z } from "zod";

const uuid = z.string().uuid("Select a valid record.");
const money = z.string().regex(/^\d{1,15}(?:\.\d{1,4})?$/, "Use a non-negative amount with at most four places.");

export const supplierItemSchema = z.object({
  supplierId: uuid,
  productId: uuid,
  variantId: uuid.optional().nullable().or(z.literal("")),
  supplierSku: z.string().trim().min(2).max(80),
  description: z.string().trim().max(180).optional().nullable().or(z.literal("")),
  lastCost: money.default("0"),
  leadTimeDays: z.number().int().min(0).max(3650).default(0),
  minOrderQty: money.default("0"),
  isActive: z.boolean().default(true),
});

export const supplierItemUpdateSchema = supplierItemSchema
  .omit({ supplierId: true, productId: true })
  .partial();

export type SupplierItemInput = z.infer<typeof supplierItemSchema>;
