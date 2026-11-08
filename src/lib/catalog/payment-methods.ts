import "server-only";

import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";

type SettlementInput = { methodType: string; cashAccountId?: string | null; bankAccountId?: string | null };

/** Resolves and validates a payment method settlement target into the accounting entities that own the money. */
export async function validateSettlement(tx: Prisma.TransactionClient, companyId: string, input: SettlementInput) {
  if (input.methodType === "CASH") {
    const cash = await tx.account.findFirst({ where: { id: input.cashAccountId!, companyId, accountType: "CASH", isActive: true } });
    if (!cash) throw new ApiError(422, "INVALID_CASH_ACCOUNT", "Select an active cash account in this company.");
    return { cashAccountId: cash.id, bankAccountId: null };
  }
  const bank = await tx.bankAccount.findFirst({ where: { id: input.bankAccountId!, companyId, isActive: true }, include: { glAccount: { select: { isActive: true } } } });
  if (!bank) throw new ApiError(422, "INVALID_BANK_ACCOUNT", "Select an active bank account in this company.");
  if (!bank.glAccount.isActive) throw new ApiError(409, "BANK_GL_INACTIVE", "The bank account general ledger account is inactive.");
  return { cashAccountId: null, bankAccountId: bank.id };
}
