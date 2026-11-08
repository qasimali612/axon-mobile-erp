import { describe, expect, it } from "vitest";
import { bankAccountSchema, bankStatementSchema, reconciliationReopenSchema, statementMatchSchema } from "./banking-validation";

const branchId = "11111111-1111-4111-8111-111111111111";
const glAccountId = "22222222-2222-4222-8222-222222222222";
const bankAccountId = "33333333-3333-4333-8333-333333333333";
const lineId = "44444444-4444-4444-8444-444444444444";
const transactionId = "55555555-5555-4555-8555-555555555555";

const account = { branchId, code: "hbl-1", bankName: "HBL", accountTitle: "Operating", glAccountId, iban: null, accountNumberLast4: "1234", bankBranchName: null, currencyCode: "pkr", isActive: true };
const statement = {
  bankAccountId,
  statementNumber: "ST-1",
  periodStart: "2026-10-01",
  periodEnd: "2026-10-31",
  openingBalance: "1000",
  closingBalance: "1500",
  lines: [{ transactionDate: "2026-10-05", reference: "R1", description: "Deposit", deposit: "500", withdrawal: "0" }],
};

describe("bank account validation", () => {
  it("normalizes the code and currency", () => {
    const parsed = bankAccountSchema.parse(account);
    expect(parsed.code).toBe("HBL-1");
    expect(parsed.currencyCode).toBe("PKR");
  });

  it("rejects a non-numeric account suffix", () => {
    expect(bankAccountSchema.safeParse({ ...account, accountNumberLast4: "12a4" }).success).toBe(false);
  });
});

describe("bank statement validation", () => {
  it("accepts a balanced statement", () => {
    expect(bankStatementSchema.safeParse(statement).success).toBe(true);
  });

  it("rejects a closing balance that does not follow from opening plus lines", () => {
    expect(bankStatementSchema.safeParse({ ...statement, closingBalance: "9999" }).success).toBe(false);
  });

  it("rejects lines outside the statement period", () => {
    expect(bankStatementSchema.safeParse({ ...statement, lines: [{ transactionDate: "2026-09-30", reference: null, description: "Early", deposit: "500", withdrawal: "0" }] }).success).toBe(false);
  });

  it("rejects a line that is both a deposit and a withdrawal", () => {
    expect(bankStatementSchema.safeParse({ ...statement, lines: [{ transactionDate: "2026-10-05", reference: null, description: "Both", deposit: "500", withdrawal: "500" }], closingBalance: "1000" }).success).toBe(false);
  });

  it("rejects a reversed period", () => {
    expect(bankStatementSchema.safeParse({ ...statement, periodEnd: "2026-09-01" }).success).toBe(false);
  });

  it("rejects negative amounts", () => {
    expect(bankStatementSchema.safeParse({ ...statement, lines: [{ transactionDate: "2026-10-05", reference: null, description: "Negative", deposit: "-500", withdrawal: "0" }], closingBalance: "500" }).success).toBe(false);
  });
});

describe("reconciliation inputs", () => {
  it("requires a match target to be stated, allowing null to clear", () => {
    expect(statementMatchSchema.safeParse({ lineId, bankTransactionId: transactionId }).success).toBe(true);
    expect(statementMatchSchema.safeParse({ lineId, bankTransactionId: null }).success).toBe(true);
    expect(statementMatchSchema.safeParse({ lineId }).success).toBe(false);
  });

  it("requires a meaningful reopen reason", () => {
    expect(reconciliationReopenSchema.safeParse({ reason: "typo" }).success).toBe(false);
    expect(reconciliationReopenSchema.safeParse({ reason: "Statement was imported with the wrong closing balance" }).success).toBe(true);
  });
});
