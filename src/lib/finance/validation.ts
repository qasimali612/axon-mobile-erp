import { CashFlowActivity, JournalType } from "@prisma/client";
import { z } from "zod";

const uuid = z.string().uuid();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format.");
const money = z.string().regex(/^\d{1,15}(?:\.\d{1,4})?$/, "Use a non-negative amount with no more than four decimal places.");
const rate = z.string().regex(/^\d{1,11}(?:\.\d{1,8})?$/, "Use a positive exchange rate with no more than eight decimal places.");

export const journalDraftSchema = z.object({
  branchId: uuid,
  postingDate: dateOnly,
  voucherDate: dateOnly.optional(),
  voucherType: z.nativeEnum(JournalType).default(JournalType.GENERAL),
  cashFlowActivity: z.nativeEnum(CashFlowActivity).default(CashFlowActivity.NONE),
  narration: z.string().trim().min(5).max(2_000),
  referenceDocument: z.string().trim().max(120).optional().nullable(),
  idempotencyKey: z.string().trim().min(8).max(120).optional().nullable(),
  costCenterId: uuid.optional().nullable(),
  departmentId: uuid.optional().nullable(),
  lines: z
    .array(
      z
        .object({
          accountId: uuid,
          description: z.string().trim().min(2).max(500),
          debit: money.default("0"),
          credit: money.default("0"),
          currencyCode: z.string().trim().length(3).toUpperCase().optional(),
          exchangeRate: rate.optional(),
          costCenterId: uuid.optional().nullable(),
          departmentId: uuid.optional().nullable(),
          customerId: uuid.optional().nullable(),
          supplierId: uuid.optional().nullable(),
          bankAccountId: uuid.optional().nullable(),
          salespersonId: uuid.optional().nullable(),
          invoiceNumber: z.string().trim().max(80).optional().nullable(),
          dueDate: dateOnly.optional().nullable(),
        })
        .refine((line) => !(line.customerId && line.supplierId), {
          message: "A journal line cannot reference both a customer and a supplier.",
        }),
    )
    .min(2)
    .max(200),
});

export const journalReversalSchema = z.object({
  postingDate: dateOnly,
  reason: z.string().trim().min(10).max(1_000),
  idempotencyKey: z.string().trim().min(8).max(120),
});
