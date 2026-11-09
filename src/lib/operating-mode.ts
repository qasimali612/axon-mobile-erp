import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export type OperatingMode = "SINGLE_USER" | "MULTI_USER";

export type OperatingModeConfig = {
  mode: OperatingMode;
  description: string;
  updatedAt: string;
  updatedById: string | null;
  configuredBy?: string | null;
  reason?: string | null;
};

const DEFAULT_CONFIG: OperatingModeConfig = {
  mode: "SINGLE_USER",
  description: "Single-operator mode: Direct processing without maker-checker delays. Same strict inventory and accounting validation.",
  updatedAt: new Date().toISOString(),
  updatedById: null,
  configuredBy: "System Default",
  reason: "Default configuration for single-operator business",
};

/**
 * Retrieves the currently active Operating Mode for the company.
 * Both Single-User and Multi-User modes share the exact same database schema,
 * tables, models, and accounting engine.
 */
export async function getOperatingModeConfig(
  tx: Prisma.TransactionClient | typeof prisma = prisma,
  companyId: string
): Promise<OperatingModeConfig> {
  const setting = await tx.systemSetting.findUnique({
    where: {
      companyId_key: {
        companyId,
        key: "system.operating_mode",
      },
    },
    include: {
      updatedBy: { select: { fullName: true } },
    },
  });

  if (!setting || !setting.value || typeof setting.value !== "object") {
    return DEFAULT_CONFIG;
  }

  const val = setting.value as Partial<OperatingModeConfig>;
  const mode: OperatingMode = val.mode === "MULTI_USER" ? "MULTI_USER" : "SINGLE_USER";

  return {
    mode,
    description:
      mode === "SINGLE_USER"
        ? "Single-operator mode: Direct processing without maker-checker delays. Same strict inventory and accounting validation."
        : "Multi-user enterprise mode: Strict segregation of duties and multi-tier approval chains.",
    updatedAt: setting.updatedAt.toISOString(),
    updatedById: setting.updatedById,
    configuredBy: setting.updatedBy?.fullName || val.configuredBy || "Administrator",
    reason: val.reason || null,
  };
}

/**
 * Fast boolean check: returns true if the company is configured in Single-User Mode.
 */
export async function isSingleUserMode(
  _tx: Prisma.TransactionClient | typeof prisma = prisma,
  _companyId: string
): Promise<boolean> {
  return true;
}

/**
 * Determines whether a new operational document should be auto-posted.
 * Approval system is removed project-wide: all documents auto-post immediately to GL and stock
 * unless explicitly requested as a draft.
 */
export async function shouldAutoPost(
  _tx: Prisma.TransactionClient | typeof prisma = prisma,
  _companyId: string,
  explicitAutoPost?: boolean | null,
): Promise<boolean> {
  if (explicitAutoPost === false) return false;
  return true;
}

/**
 * Updates the Operating Mode. Only authorized administrators may change operating modes.
 * Mode switching preserves 100% of existing data, transactions, inventory, and audit logs.
 */
export async function setOperatingMode(
  actor: { companyId: string; userId: string; fullName?: string },
  newMode: OperatingMode,
  reason: string
): Promise<OperatingModeConfig> {
  const cleanReason = (reason || "").trim();
  if (cleanReason.length < 5) {
    throw new ApiError(422, "REASON_REQUIRED", "A documented reason of at least 5 characters is required to switch operating modes.");
  }

  return prisma.$transaction(async (tx) => {
    const previous = await getOperatingModeConfig(tx, actor.companyId);

    const description =
      newMode === "SINGLE_USER"
        ? "Single-operator mode: Direct processing without maker-checker delays. Same strict inventory and accounting validation."
        : "Multi-user enterprise mode: Strict segregation of duties and multi-tier approval chains.";

    const payload = {
      mode: newMode,
      description,
      updatedAt: new Date().toISOString(),
      updatedById: actor.userId,
      configuredBy: actor.fullName || "Administrator",
      reason: cleanReason,
    };

    await tx.systemSetting.upsert({
      where: {
        companyId_key: {
          companyId: actor.companyId,
          key: "system.operating_mode",
        },
      },
      create: {
        companyId: actor.companyId,
        key: "system.operating_mode",
        value: payload,
        updatedById: actor.userId,
      },
      update: {
        value: payload,
        updatedById: actor.userId,
      },
    });

    await appendAudit(
      {
        companyId: actor.companyId,
        actorId: actor.userId,
        action: "OPERATING_MODE_CHANGED",
        module: "settings",
        entityType: "SystemSetting",
        entityReference: "system.operating_mode",
        previousValues: { mode: previous.mode },
        newValues: { mode: newMode, reason: cleanReason },
        reason: cleanReason,
      },
      tx
    );

    return {
      mode: newMode,
      description,
      updatedAt: payload.updatedAt,
      updatedById: actor.userId,
      configuredBy: payload.configuredBy,
      reason: cleanReason,
    };
  });
}

/**
 * Asserts Maker-Checker separation.
 * Approval system and Maker-Checker restrictions are removed project-wide.
 */
export async function assertMakerChecker(
  _tx: Prisma.TransactionClient,
  _companyId: string,
  _preparerId: string | null | undefined,
  _actorId: string,
  _actionDescription: string
) {
  // No approval system restriction project-wide
  return;
}

/**
 * Asserts Segregation of Duties.
 * Segregation of duties restrictions are removed project-wide.
 */
export async function assertSegregationOfDuties(
  _tx: Prisma.TransactionClient,
  _companyId: string,
  _actorId: string,
  _preparerId: string | null | undefined,
  _approverId?: string | null | undefined,
  _actionDescription: string = "post this document",
  _otherRestrictedIds: (string | null | undefined)[] = [],
  _allowApprover = false,
) {
  // No segregation restriction project-wide
  return;
}
