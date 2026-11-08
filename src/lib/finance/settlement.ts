import "server-only";

import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";

export type SettlementActor = { companyId: string; userId: string };

/**
 * Resolves a configured payment method into the exact cash or bank ledger account that owns the
 * money, enforcing active status, reference requirements and the method/account binding.
 */
export async function resolveSettlement(
  tx: Prisma.TransactionClient,
  actor: SettlementActor,
  input: { paymentMethodId: string; bankAccountId?: string | null; reference?: string | null },
) {
  const method = await tx.paymentMethod.findFirst({ where: { id: input.paymentMethodId, companyId: actor.companyId } });
  if (!method) throw new ApiError(404, "PAYMENT_METHOD_NOT_FOUND", "The selected payment method was not found.");
  if (!method.isActive) throw new ApiError(409, "PAYMENT_METHOD_INACTIVE", "The selected payment method is inactive.");
  if (method.requiresReference && !input.reference) throw new ApiError(422, "PAYMENT_REFERENCE_REQUIRED", `${method.name} requires a reference number.`);
  if (method.methodType === "CASH") {
    const cash = await tx.account.findFirst({ where: { id: method.cashAccountId ?? "", companyId: actor.companyId, accountType: "CASH", isActive: true } });
    if (!cash) throw new ApiError(422, "INVALID_CASH_ACCOUNT", `${method.name} is not linked to an active cash account.`);
    return { methodCode: method.code, methodName: method.name, cashAccountId: cash.id, bankAccountId: null, glAccountId: cash.id, branchId: cash.branchId };
  }
  const bankId = method.bankAccountId ?? input.bankAccountId ?? null;
  if (!bankId) throw new ApiError(422, "INVALID_BANK_ACCOUNT", `${method.name} requires a bank account.`);
  const bank = await tx.bankAccount.findFirst({ where: { id: bankId, companyId: actor.companyId, isActive: true }, include: { glAccount: { select: { id: true, isActive: true, code: true } } } });
  if (!bank) throw new ApiError(422, "INVALID_BANK_ACCOUNT", "Select an active bank account in this company.");
  if (!bank.glAccount.isActive) throw new ApiError(409, "BANK_GL_INACTIVE", "The bank account general ledger account is inactive.");
  return { methodCode: method.code, methodName: method.name, cashAccountId: null, bankAccountId: bank.id, glAccountId: bank.glAccount.id, branchId: bank.branchId };
}
