import { z } from "zod";

const code = z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Use letters, numbers, dot, underscore or hyphen.").transform((value) => value.toUpperCase());
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const dateOnly = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD format.");
const amount = z.union([z.string(), z.number()]).transform((value) => String(value).trim()).refine((value) => /^-?\d{1,15}(\.\d{1,4})?$/.test(value), "Use a number with at most four decimals.");
const positiveAmount = amount.refine((value) => Number(value) > 0, "Amount must be greater than zero.");

export const bankAccountSchema = z.object({
  branchId: z.string().uuid(),
  code: code.pipe(z.string().max(30)),
  bankName: z.string().trim().min(2).max(140),
  accountTitle: z.string().trim().min(2).max(160),
  glAccountId: z.string().uuid(),
  iban: optionalText(40),
  accountNumberLast4: z.string().trim().regex(/^\d{4}$/, "Use the last four digits only.").optional().nullable().or(z.literal("")),
  bankBranchName: optionalText(120),
  currencyCode: z.string().trim().length(3).toUpperCase().default("PKR"),
  isActive: z.boolean().default(true),
});

export const bankStatementLineSchema = z.object({
  transactionDate: dateOnly,
  valueDate: dateOnly.optional().nullable().or(z.literal("")),
  reference: optionalText(120),
  description: z.string().trim().min(2).max(500),
  deposit: amount.default("0"),
  withdrawal: amount.default("0"),
}).superRefine((value, context) => {
  const deposit = Number(value.deposit); const withdrawal = Number(value.withdrawal);
  if (deposit < 0 || withdrawal < 0) context.addIssue({ code: "custom", path: ["deposit"], message: "Statement amounts cannot be negative; use withdrawal for money out." });
  if ((deposit > 0) === (withdrawal > 0)) context.addIssue({ code: "custom", path: ["deposit"], message: "Enter either a deposit or a withdrawal for each statement line." });
});

export const bankStatementSchema = z.object({
  bankAccountId: z.string().uuid(),
  statementNumber: optionalText(80),
  periodStart: dateOnly,
  periodEnd: dateOnly,
  openingBalance: amount,
  closingBalance: amount,
  importedFileName: optionalText(240),
  lines: z.array(bankStatementLineSchema).min(1).max(5_000),
}).superRefine((value, context) => {
  if (value.periodEnd < value.periodStart) context.addIssue({ code: "custom", path: ["periodEnd"], message: "Statement end date cannot precede the start date." });
  const net = value.lines.reduce((sum, line) => sum + Number(line.deposit) - Number(line.withdrawal), 0);
  const expected = Number(value.openingBalance) + net;
  if (Math.abs(expected - Number(value.closingBalance)) > 0.005) {
    context.addIssue({ code: "custom", path: ["closingBalance"], message: `Opening balance plus statement lines must equal the closing balance (${expected.toFixed(4)}).` });
  }
  for (const [index, line] of value.lines.entries()) {
    if (line.transactionDate < value.periodStart || line.transactionDate > value.periodEnd) {
      context.addIssue({ code: "custom", path: ["lines", index, "transactionDate"], message: "Statement line dates must fall inside the statement period." });
    }
  }
});

export const statementMatchSchema = z.object({
  lineId: z.string().uuid(),
  bankTransactionId: z.string().uuid().nullable().optional(),
}).refine((value) => value.bankTransactionId !== undefined, { message: "Provide a bank transaction to match or null to clear the match." });

export const reconciliationCompleteSchema = z.object({
  notes: optionalText(1_000),
});

export const reconciliationReopenSchema = z.object({
  reason: z.string().trim().min(10, "Give at least ten characters of reason.").max(2_000),
});

export { positiveAmount };
