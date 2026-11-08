import { z } from "zod";

const amount = z.union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d{1,15}(\.\d{1,4})?$/.test(value), "Use a non-negative amount with at most four decimals.");

export const budgetLineSchema = z.object({
  accountId: z.string().uuid(),
  periodId: z.string().uuid(),
  amount,
  notes: z.string().trim().max(500).optional().nullable(),
});

export const budgetSchema = z.object({
  code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Use letters, numbers, dot, underscore or hyphen.").transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(160),
  fiscalYearId: z.string().uuid(),
  branchId: z.string().uuid().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  costCenterId: z.string().uuid().optional().nullable(),
  lines: z.array(budgetLineSchema).max(5_000).default([]),
}).superRefine((value, context) => {
  const seen = new Set<string>();
  for (const [index, line] of value.lines.entries()) {
    const key = `${line.accountId}:${line.periodId}`;
    if (seen.has(key)) {
      context.addIssue({ code: "custom", path: ["lines", index], message: "Each account may appear only once per period." });
    }
    seen.add(key);
  }
});
