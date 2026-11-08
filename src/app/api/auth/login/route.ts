import { NextResponse } from "next/server";
import { subMinutes } from "date-fns";
import { AuditOutcome, MembershipStatus, UserStatus } from "@prisma/client";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { createSession, verifyPassword } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { clientIp } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation";

const DUMMY_HASH = "$2b$12$0rM2xfvaX1UzVTXSM1lEX.3BVOSFyv8WCY1De0wMNQdFfhcFj.Vka";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = loginSchema.parse(await request.json());
    const ipAddress = clientIp(request.headers);
    const since = subMinutes(new Date(), 15);

    const recentFailures = await prisma.loginAttempt.count({
      where: {
        succeeded: false,
        attemptedAt: { gte: since },
        OR: [{ email: input.email }, { ipAddress }],
      },
    });
    if (recentFailures >= 8) {
      throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Too many sign-in attempts. Try again in 15 minutes.");
    }

    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: {
        memberships: {
          where: { status: MembershipStatus.ACTIVE, company: { status: "ACTIVE" } },
          include: {
            company: true,
            userRoles: { include: { role: true } },
          },
          orderBy: { joinedAt: "asc" },
        },
      },
    });

    const passwordMatches = await verifyPassword(input.password, user?.passwordHash || DUMMY_HASH);
    const locked = Boolean(user?.lockedUntil && user.lockedUntil > new Date());
    const validUser = user && user.status === UserStatus.ACTIVE && passwordMatches && !locked;

    if (!validUser || !user.memberships[0]) {
      await prisma.loginAttempt.create({
        data: {
          email: input.email,
          ipAddress,
          succeeded: false,
          reason: locked ? "ACCOUNT_LOCKED" : "INVALID_CREDENTIALS",
        },
      });
      if (user) {
        const failures = user.failedLoginCount + 1;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: failures,
            lockedUntil: failures >= 8 ? new Date(Date.now() + 15 * 60 * 1000) : user.lockedUntil,
          },
        });
      }
      throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }

    const membership = user.memberships[0];

    // Check for user-scoped role assignments
    const scopedBranchId = membership.userRoles.find((ur) => ur.branchId)?.branchId;
    const scopedWarehouseId = membership.userRoles.find((ur) => ur.warehouseId)?.warehouseId;

    // Resolve branch: Scoped role branch -> HEAD_OFFICE -> first active branch
    const branch = scopedBranchId
      ? await prisma.branch.findFirst({
          where: { id: scopedBranchId, companyId: membership.companyId, isActive: true },
        })
      : (await prisma.branch.findFirst({
          where: { companyId: membership.companyId, type: "HEAD_OFFICE", isActive: true },
        })) ||
        (await prisma.branch.findFirst({
          where: { companyId: membership.companyId, isActive: true },
          orderBy: [{ name: "asc" }],
        }));

    // Resolve warehouse: Must belong to the resolved active branch to prevent scope guard violation
    const warehouse = branch
      ? (scopedWarehouseId
          ? await prisma.warehouse.findFirst({
              where: { id: scopedWarehouseId, companyId: membership.companyId, branchId: branch.id, isActive: true },
            })
          : null) ||
        (await prisma.warehouse.findFirst({
          where: { companyId: membership.companyId, branchId: branch.id, isActive: true },
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        }))
      : null;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
      }),
      prisma.loginAttempt.create({
        data: { email: input.email, ipAddress, succeeded: true, reason: "SUCCESS" },
      }),
    ]);

    const session = await createSession(
      user.id,
      membership.companyId,
      branch?.id,
      warehouse?.id,
    );

    await appendAudit({
      companyId: membership.companyId,
      actorId: user.id,
      branchId: branch?.id,
      warehouseId: warehouse?.id,
      action: "LOGIN",
      module: "access",
      entityType: "Session",
      entityId: session.id,
      entityReference: user.email,
      outcome: AuditOutcome.SUCCESS,
      ipAddress,
      userAgent: request.headers.get("user-agent")?.slice(0, 500),
    });

    return NextResponse.json({
      data: {
        user: { id: user.id, fullName: user.fullName, email: user.email },
        company: { id: membership.company.id, name: membership.company.name },
        forcePasswordChange: user.forcePasswordChange,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
