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
  tx: Prisma.TransactionClient | typeof prisma = prisma,
  companyId: string
): Promise<boolean> {
  const config = await getOperatingModeConfig(tx, companyId);
  return config.mode === "SINGLE_USER";
}

/**
 * Determines whether a new operational document should be auto-posted.
 * In Single-User Mode: Defaults to true (auto-post directly to stock and General Ledger)
 * unless explicitly requested as draft (e.g. autoPost === false).
 * In Multi-User Mode: Defaults to false (enforces draft -> submit -> checker approval -> poster segregation)
 * unless explicitly requested.
 */
export async function shouldAutoPost(
  tx: Prisma.TransactionClient | typeof prisma = prisma,
  companyId: string,
  explicitAutoPost?: boolean | null,
): Promise<boolean> {
  if (explicitAutoPost === false) return false;
  if (explicitAutoPost === true) return true;
  return isSingleUserMode(tx, companyId);
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
 * In Single-User Mode: Maker-Checker separation is waived because there is only one operator.
 * In Multi-User Mode: Preparer cannot approve or process their own document.
 */
export async function assertMakerChecker(
  tx: Prisma.TransactionClient,
  companyId: string,
  preparerId: string | null | undefined,
  actorId: string,
  actionDescription: string
) {
  const singleUser = await isSingleUserMode(tx, companyId);
  if (singleUser) return; // Permitted in single-user mode!

  if (preparerId && preparerId === actorId) {
    throw new ApiError(
      409,
      "MAKER_CHECKER_REQUIRED",
      `The preparer cannot ${actionDescription} in Multi-User Mode. Switch to Single-User Mode if operating as a sole business owner.`
    );
  }
}

/**
 * Asserts Segregation of Duties.
 * In Single-User Mode: Waived for the sole business operator.
 * In Multi-User Mode: Posting or reversal officer must differ from preparer, approver, and any other restricted actors.
 */
export async function assertSegregationOfDuties(
  tx: Prisma.TransactionClient,
  companyId: string,
  actorId: string,
  preparerId: string | null | undefined,
  approverId?: string | null | undefined,
  actionDescription: string = "post this document",
  otherRestrictedIds: (string | null | undefined)[] = [],
  allowApprover = false,
) {
  const singleUser = await isSingleUserMode(tx, companyId);
  if (singleUser) return; // Permitted in single-user mode!

  const restricted = new Set(
    [preparerId, ...(allowApprover ? [] : [approverId]), ...otherRestrictedIds].filter((id): id is string => Boolean(id))
  );

  if (restricted.has(actorId)) {
    throw new ApiError(
      409,
      "SEGREGATION_OF_DUTIES",
      `The user cannot ${actionDescription} in Multi-User Mode due to segregation of duties. Switch to Single-User Mode if operating as a sole business owner.`
    );
  }
}
