import type { Prisma } from "@prisma/client";

/**
 * Deferred audit payloads for refused policy checks.
 *
 * A policy refusal is raised inside the posting transaction, so an audit row written on that
 * transaction client is rolled back together with the document. The refusal is exactly the event an
 * operator needs to see, so the payload is parked against the thrown error and flushed by
 * `apiError()` once the transaction has unwound.
 */
export type PolicyAuditPayload = {
  companyId: string;
  actorId?: string | null;
  branchId?: string | null;
  action: string;
  module: string;
  entityType: string;
  entityId?: string | null;
  entityReference?: string | null;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue;
};

const pending = new WeakMap<Error, PolicyAuditPayload>();

export function deferPolicyAudit(error: Error, payload: PolicyAuditPayload) {
  pending.set(error, payload);
}

export function takePolicyAudit(error: unknown): PolicyAuditPayload | null {
  if (!(error instanceof Error)) return null;
  const payload = pending.get(error);
  if (!payload) return null;
  pending.delete(error);
  return payload;
}
