import { PolicyDocumentType, Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { deferPolicyAudit } from "@/lib/policy-audit";
import { appendAudit } from "@/lib/audit";

/**
 * Commercial control gates.
 *
 * Amount-banded approval policies add a permission requirement on top of maker/checker/poster
 * separation — they never replace it. Discount caps and credit-limit overrides are explicit,
 * reasoned exceptions that are audited. With no policy rows configured every gate is a no-op, so
 * existing workflows behave exactly as before until an owner deliberately configures a control.
 */

export type PolicyActor = { companyId: string; userId: string; permissions?: string[]; overrideReason?: string };

export type PolicyBand = { id: string; name: string; minAmount: Prisma.Decimal; maxAmount: Prisma.Decimal | null; requiredPermission: string };

export function bandCovers(amount: Prisma.Decimal, band: { minAmount: Prisma.Decimal; maxAmount: Prisma.Decimal | null }) {
  if (amount.lt(band.minAmount)) return false;
  return band.maxAmount === null ? true : amount.lte(band.maxAmount);
}

/**
 * Enforces every active approval policy whose band covers `amount`. The actor must hold **all**
 * matching permissions, so overlapping bands stack instead of weakening each other.
 */
export async function assertApprovalPolicy(
  tx: Prisma.TransactionClient,
  input: { actor: PolicyActor; documentType: PolicyDocumentType; amount: Prisma.Decimal; entityType: string; entityId: string; reference: string },
) {
  if (!input.actor.permissions) return;
  const policies = await tx.approvalPolicy.findMany({
    where: { companyId: input.actor.companyId, documentType: input.documentType, isActive: true },
    orderBy: [{ minAmount: "asc" }, { name: "asc" }],
  });
  const matching = policies.filter((policy) => bandCovers(input.amount, policy));
  if (matching.length === 0) return;
  const missing = matching.filter((policy) => !input.actor.permissions?.includes(policy.requiredPermission));
  if (missing.length === 0) return;
  const refusal = new ApiError(403, "APPROVAL_POLICY_REQUIRED", "This amount requires an additional approval authority that your role does not hold.", {
    amount: input.amount.toFixed(4),
    documentType: input.documentType,
    policies: missing.map((policy) => ({ name: policy.name, requiredPermission: policy.requiredPermission })),
  });
  // Written after the surrounding transaction rolls back, otherwise the evidence disappears with it.
  deferPolicyAudit(refusal, {
    companyId: input.actor.companyId,
    actorId: input.actor.userId,
    action: "APPROVAL_POLICY_BLOCKED",
    module: "policy",
    entityType: input.entityType,
    entityId: input.entityId,
    entityReference: input.reference,
    reason: "Approval policy band required an authority the actor does not hold.",
    metadata: { documentType: input.documentType, amount: input.amount.toFixed(4), policies: missing.map((policy) => policy.name), required: missing.map((policy) => policy.requiredPermission) },
  });
  throw refusal;
}

export type DiscountPolicy = { maxPercent: number; overridePermission: string };

const DEFAULT_DISCOUNT_POLICY: DiscountPolicy = { maxPercent: 100, overridePermission: "sales.discount.override" };

/** Reads `sales.discount.policy` from company settings; defaults to "no cap" so nothing changes silently. */
export async function loadDiscountPolicy(tx: Prisma.TransactionClient, companyId: string): Promise<DiscountPolicy> {
  const setting = await tx.systemSetting.findUnique({ where: { companyId_key: { companyId, key: "sales.discount.policy" } }, select: { value: true } });
  const value = (setting?.value ?? {}) as Partial<DiscountPolicy>;
  const maxPercent = Number(value.maxPercent);
  return {
    maxPercent: Number.isFinite(maxPercent) && maxPercent >= 0 && maxPercent <= 100 ? maxPercent : DEFAULT_DISCOUNT_POLICY.maxPercent,
    overridePermission: typeof value.overridePermission === "string" && value.overridePermission ? value.overridePermission : DEFAULT_DISCOUNT_POLICY.overridePermission,
  };
}

/**
 * Enforces the discount cap on a sales invoice. A cashier may discount up to the configured
 * percentage; beyond that the submitter needs the override permission and a written reason.
 */
export async function assertDiscountCap(
  tx: Prisma.TransactionClient,
  input: { actor: PolicyActor; subtotal: Prisma.Decimal; discountTotal: Prisma.Decimal; entityId: string; reference: string },
) {
  const policy = await loadDiscountPolicy(tx, input.actor.companyId);
  if (policy.maxPercent >= 100 || input.subtotal.lte(0)) return;
  const percent = Number(input.discountTotal.div(input.subtotal).times(100).toFixed(4));
  if (percent <= policy.maxPercent) return;
  const permitted = Boolean(input.actor.permissions?.includes(policy.overridePermission));
  const reason = (input.actor.overrideReason || "").trim();
  if (!permitted || reason.length < 10) {
    throw new ApiError(422, "DISCOUNT_CAP_EXCEEDED", `A discount of ${percent.toFixed(2)}% exceeds the ${policy.maxPercent}% cap.`, {
      discountPercent: percent.toFixed(4),
      maxPercent: policy.maxPercent,
      overridePermission: policy.overridePermission,
      reasonRequired: permitted,
    });
  }
  await appendAudit({
    companyId: input.actor.companyId,
    actorId: input.actor.userId,
    action: "DISCOUNT_CAP_OVERRIDDEN",
    module: "sales",
    entityType: "SalesInvoice",
    entityId: input.entityId,
    entityReference: input.reference,
    metadata: { discountPercent: percent.toFixed(4), maxPercent: policy.maxPercent, reason },
  }, tx);
}

/** Credit-limit exceptions require the override permission and a written reason. */
export function assertCreditOverrideAllowed(actor: PolicyActor, input: { outstanding: Prisma.Decimal; invoiceTotal: Prisma.Decimal; creditLimit: Prisma.Decimal }) {
  const permitted = Boolean(actor.permissions?.includes("customer.credit.override"));
  const reason = (actor.overrideReason || "").trim();
  if (!permitted || reason.length < 10) {
    throw new ApiError(409, "CREDIT_LIMIT_EXCEEDED", "Approving this invoice would exceed the customer's configured credit limit.", {
      outstanding: input.outstanding.toFixed(4),
      invoiceTotal: input.invoiceTotal.toFixed(4),
      creditLimit: input.creditLimit.toFixed(4),
      overridePermission: "customer.credit.override",
      reasonRequired: permitted,
    });
  }
  return reason;
}
