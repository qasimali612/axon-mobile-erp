import { NextResponse } from "next/server";
import { MembershipStatus, Prisma, UserStatus } from "@prisma/client";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { hashPassword, requirePermission } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { checkPasswordPolicy } from "@/lib/password-policy";
import { prisma } from "@/lib/prisma";
import { userCreateSchema } from "@/lib/validation";

export async function GET() {
  try {
    const context = await requirePermission("access.user.view");
    const memberships = await prisma.companyMembership.findMany({
      where: { companyId: context.company.id, status: { not: MembershipStatus.ENDED } },
      include: {
        user: true,
        userRoles: {
          include: { role: true, branch: true, warehouse: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { user: { fullName: "asc" } },
    });
    return NextResponse.json({ data: memberships });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("access.user.create");
    if (!context.permissions.includes("access.user.assign_role")) {
      throw new ApiError(403, "ROLE_ASSIGNMENT_FORBIDDEN", "Role assignment permission is required.");
    }
    const input = userCreateSchema.parse(await request.json());
    const passwordPolicy = checkPasswordPolicy(input.temporaryPassword);
    if (!passwordPolicy.valid) throw new ApiError(422, "WEAK_PASSWORD", passwordPolicy.errors.join(" "));

    const [role, branch, warehouse] = await Promise.all([
      prisma.role.findFirst({ where: { id: input.roleId, companyId: context.company.id, isActive: true } }),
      input.branchId ? prisma.branch.findFirst({ where: { id: input.branchId, companyId: context.company.id, isActive: true } }) : Promise.resolve(null),
      input.warehouseId ? prisma.warehouse.findFirst({ where: { id: input.warehouseId, companyId: context.company.id, isActive: true } }) : Promise.resolve(null),
    ]);
    if (!role) throw new ApiError(422, "INVALID_ROLE", "Select an active role.");
    if (input.branchId && !branch) throw new ApiError(422, "INVALID_BRANCH", "Selected branch is not available.");
    if (input.warehouseId && !warehouse) throw new ApiError(422, "INVALID_WAREHOUSE", "Selected warehouse is not available.");
    if (warehouse && input.branchId && warehouse.branchId !== input.branchId) {
      throw new ApiError(422, "SCOPE_MISMATCH", "Warehouse does not belong to the selected branch.");
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          fullName: input.fullName,
          email: input.email,
          phone: input.phone || null,
          passwordHash: await hashPassword(input.temporaryPassword),
          status: UserStatus.ACTIVE,
          forcePasswordChange: true,
        },
      });
      const membership = await tx.companyMembership.create({
        data: {
          companyId: context.company.id,
          userId: user.id,
          status: MembershipStatus.ACTIVE,
          isOwner: false,
        },
      });
      await tx.userRole.create({
        data: {
          membershipId: membership.id,
          roleId: role.id,
          branchId: input.branchId || null,
          warehouseId: input.warehouseId || null,
        },
      });
      await appendAudit(
        {
          companyId: context.company.id,
          actorId: context.user.id,
          branchId: input.branchId || context.activeBranchId,
          warehouseId: input.warehouseId || context.activeWarehouseId,
          action: "USER_CREATED",
          module: "access",
          entityType: "User",
          entityId: user.id,
          entityReference: user.email,
          newValues: {
            fullName: user.fullName,
            email: user.email,
            role: role.code,
            branchId: input.branchId || null,
            warehouseId: input.warehouseId || null,
            forcePasswordChange: true,
          },
        },
        tx,
      );
      return { user, membership, role };
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(new ApiError(409, "DUPLICATE_USER", "A user with this email already exists."));
    }
    return apiError(error);
  }
}
