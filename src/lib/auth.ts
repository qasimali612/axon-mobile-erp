import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { MembershipStatus, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";

export const SESSION_COOKIE = "axon_session";
const PREVIEW_SESSION_COOKIE = "axon_preview_session";
const DEFAULT_SESSION_HOURS = 12;

function sessionCookieOptions(expires?: Date, partitioned = false) {
  const embeddedPreview = process.env.PREVIEW_IFRAME_MODE === "true";
  return {
    httpOnly: true,
    sameSite: embeddedPreview ? ("none" as const) : ("lax" as const),
    secure: process.env.NODE_ENV === "production" || embeddedPreview,
    partitioned: embeddedPreview && partitioned,
    path: "/",
    ...(expires ? { expires } : {}),
  };
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type AuthContext = {
  sessionId: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    status: UserStatus;
    forcePasswordChange: boolean;
  };
  company: {
    id: string;
    code: string;
    name: string;
    currencyCode: string;
    timeZone: string;
  };
  activeBranchId: string | null;
  activeWarehouseId: string | null;
  roles: Array<{
    id: string;
    name: string;
    code: string;
    branchId: string | null;
    warehouseId: string | null;
    permissions: string[];
  }>;
  permissions: string[];
};

const sessionInclude = {
  user: {
    include: {
      memberships: {
        where: { status: MembershipStatus.ACTIVE },
        include: {
          company: true,
          userRoles: {
            include: {
              role: {
                include: {
                  permissions: { include: { permission: true } },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

async function requestFingerprint() {
  const requestHeaders = await headers();
  return {
    ipAddress:
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      requestHeaders.get("x-real-ip") ||
      "unknown",
    userAgent: requestHeaders.get("user-agent")?.slice(0, 500) || "unknown",
  };
}

export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const cookieStore = await cookies();
  const token =
    cookieStore.get(PREVIEW_SESSION_COOKIE)?.value ||
    cookieStore.get(SESSION_COOKIE)?.value;
  const now = new Date();

  let session =
    token && token.length >= 32
      ? await prisma.session.findUnique({
          where: { tokenHash: tokenHash(token) },
          include: sessionInclude,
        })
      : null;

  // Arena's embedded preview can block all third-party cookies. This isolated,
  // explicitly enabled fallback reuses only a recently authenticated session
  // with the exact proxy IP and user-agent. It is never active in deployment.
  if (!session && process.env.PREVIEW_IFRAME_MODE === "true") {
    const fingerprint = await requestFingerprint();
    session = await prisma.session.findFirst({
      where: {
        ipAddress: fingerprint.ipAddress,
        userAgent: fingerprint.userAgent,
        revokedAt: null,
        expiresAt: { gt: now },
        createdAt: { gte: new Date(now.getTime() - 30 * 60 * 1000) },
      },
      include: sessionInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= now ||
    session.user.status !== UserStatus.ACTIVE
  ) {
    return null;
  }

  const membership = session.user.memberships.find(
    (item) => item.companyId === session.activeCompanyId,
  );
  if (!membership || membership.company.status !== "ACTIVE") return null;

  const validRoles = membership.userRoles.filter(
    (assignment) =>
      assignment.role.isActive &&
      assignment.validFrom <= now &&
      (!assignment.validUntil || assignment.validUntil > now),
  );

  const roles = validRoles.map((assignment) => ({
    id: assignment.role.id,
    name: assignment.role.name,
    code: assignment.role.code,
    branchId: assignment.branchId,
    warehouseId: assignment.warehouseId,
    permissions: assignment.role.permissions.map((grant) => grant.permission.key),
  }));

  const permissions = [...new Set(roles.flatMap((role) => role.permissions))];

  // Avoid a write on every request while still maintaining useful session activity.
  if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    void prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    }).catch(() => undefined);
  }

  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      email: session.user.email,
      fullName: session.user.fullName,
      status: session.user.status,
      forcePasswordChange: session.user.forcePasswordChange,
    },
    company: {
      id: membership.company.id,
      code: membership.company.code,
      name: membership.company.name,
      currencyCode: membership.company.currencyCode,
      timeZone: membership.company.timeZone,
    },
    activeBranchId: session.activeBranchId,
    activeWarehouseId: session.activeWarehouseId,
    roles,
    permissions,
  };
});

export async function requireAuth() {
  const context = await getAuthContext();
  if (!context) throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
  return context;
}

function roleScopeMatches(
  role: AuthContext["roles"][number],
  scope?: { branchId?: string | null; warehouseId?: string | null },
) {
  if (!scope?.branchId && !scope?.warehouseId) return true;
  if (role.warehouseId && role.warehouseId !== scope.warehouseId) return false;
  if (role.branchId && role.branchId !== scope.branchId) return false;
  return true;
}

export async function requirePermission(
  permission: string,
  scope?: { branchId?: string | null; warehouseId?: string | null },
) {
  const context = await requireAuth();
  const permitted = context.roles.some(
    (role) => role.permissions.includes(permission) && roleScopeMatches(role, scope),
  );
  if (!permitted) {
    throw new ApiError(403, "FORBIDDEN", "You do not have permission to perform this action.");
  }
  return context;
}

export async function requireCompanyPermission(permission: string) {
  const context = await requireAuth();
  const permitted = context.roles.some(
    (role) => role.permissions.includes(permission) && !role.branchId && !role.warehouseId,
  );
  if (!permitted) {
    throw new ApiError(403, "COMPANY_SCOPE_REQUIRED", "Company-wide permission is required for this action.");
  }
  return context;
}

export async function requirePagePermission(permission: string): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) redirect("/login");
  if (!context.permissions.includes(permission)) redirect("/unauthorized");
  return context;
}

export async function requireAnyPagePermission(permissions: string[]): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) redirect("/login");
  if (!permissions.some((permission) => context.permissions.includes(permission))) redirect("/unauthorized");
  return context;
}

/** Null means the permission is company-wide; an array is the exact allowed branch set. */
export function permittedBranchIds(context: AuthContext, permission: string): string[] | null {
  const grantingRoles = context.roles.filter((role) => role.permissions.includes(permission));
  if (grantingRoles.some((role) => !role.branchId && !role.warehouseId)) return null;
  return [...new Set(grantingRoles.flatMap((role) => (role.branchId ? [role.branchId] : [])))];
}

export type OperationalDocumentScope = { branchId?: string; warehouseId?: string };

/**
 * Returns the exact row scopes granted for an operational document.
 * Null means company-wide access. A branch-only role grants every warehouse in
 * that branch; a warehouse role grants only that warehouse. This is safer than
 * reducing warehouse roles to branch IDs in list and reporting queries.
 */
export function permittedDocumentScopes(
  context: AuthContext,
  permission: string,
): OperationalDocumentScope[] | null {
  const grantingRoles = context.roles.filter((role) => role.permissions.includes(permission));
  if (grantingRoles.some((role) => !role.branchId && !role.warehouseId)) return null;

  const unique = new Map<string, OperationalDocumentScope>();
  for (const role of grantingRoles) {
    const scope: OperationalDocumentScope = {
      ...(role.branchId ? { branchId: role.branchId } : {}),
      ...(role.warehouseId ? { warehouseId: role.warehouseId } : {}),
    };
    if (!scope.branchId && !scope.warehouseId) continue;
    unique.set(`${scope.branchId || "*"}:${scope.warehouseId || "*"}`, scope);
  }
  return [...unique.values()];
}

export function assertPermittedBranch(context: AuthContext, permission: string, branchId: string) {
  const allowed = permittedBranchIds(context, permission);
  if (allowed && !allowed.includes(branchId)) {
    throw new ApiError(403, "BRANCH_SCOPE_FORBIDDEN", "You do not have access to this branch.");
  }
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function createSession(
  userId: string,
  activeCompanyId: string,
  activeBranchId?: string | null,
  activeWarehouseId?: string | null,
) {
  const token = randomBytes(32).toString("base64url");
  const fingerprint = await requestFingerprint();
  const ttlHours = Math.max(1, Number(process.env.SESSION_TTL_HOURS || DEFAULT_SESSION_HOURS));
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  const session = await prisma.session.create({
    data: {
      tokenHash: tokenHash(token),
      userId,
      activeCompanyId,
      activeBranchId,
      activeWarehouseId,
      ipAddress: fingerprint.ipAddress,
      userAgent: fingerprint.userAgent,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  if (process.env.PREVIEW_IFRAME_MODE === "true") {
    cookieStore.set(
      PREVIEW_SESSION_COOKIE,
      token,
      sessionCookieOptions(expiresAt, true),
    );
  }

  return session;
}

export async function revokeCurrentSession(sessionId?: string) {
  const cookieStore = await cookies();
  const tokens = [
    cookieStore.get(SESSION_COOKIE)?.value,
    cookieStore.get(PREVIEW_SESSION_COOKIE)?.value,
  ].filter((value): value is string => Boolean(value));

  if (sessionId || tokens.length) {
    await prisma.session.updateMany({
      where: {
        revokedAt: null,
        ...(sessionId
          ? { id: sessionId }
          : { tokenHash: { in: tokens.map((token) => tokenHash(token)) } }),
      },
      data: { revokedAt: new Date() },
    });
  }

  cookieStore.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(new Date(0)),
    maxAge: 0,
  });
  cookieStore.set(PREVIEW_SESSION_COOKIE, "", {
    ...sessionCookieOptions(new Date(0), true),
    maxAge: 0,
  });
}
