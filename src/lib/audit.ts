import { AuditOutcome, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;

type AuditInput = {
  companyId: string;
  actorId?: string | null;
  branchId?: string | null;
  warehouseId?: string | null;
  action: string;
  module: string;
  entityType: string;
  entityId?: string | null;
  entityReference?: string | null;
  outcome?: AuditOutcome;
  reason?: string | null;
  previousValues?: Prisma.InputJsonValue;
  newValues?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

/** Append-only audit writer. The database migration also rejects UPDATE/DELETE. */
export async function appendAudit(input: AuditInput, db: DbClient = prisma) {
  return db.auditLog.create({
    data: {
      companyId: input.companyId,
      actorId: input.actorId,
      branchId: input.branchId,
      warehouseId: input.warehouseId,
      action: input.action,
      module: input.module,
      entityType: input.entityType,
      entityId: input.entityId,
      entityReference: input.entityReference,
      outcome: input.outcome ?? AuditOutcome.SUCCESS,
      reason: input.reason,
      previousValues: input.previousValues,
      newValues: input.newValues,
      metadata: input.metadata,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      requestId: input.requestId,
    },
  });
}
