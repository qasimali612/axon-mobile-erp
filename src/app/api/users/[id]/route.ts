import { NextResponse } from "next/server";
import { MembershipStatus } from "@prisma/client";
import { z } from "zod";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };
const schema = z.object({
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  roleId: z.string().uuid(),
  branchId: z.string().uuid().optional().nullable().or(z.literal("")),
  warehouseId: z.string().uuid().optional().nullable().or(z.literal("")),
});

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("access.user.edit");
    if (!context.permissions.includes("access.user.assign_role")) {
      throw new ApiError(403, "ROLE_ASSIGNMENT_FORBIDDEN", "Role assignment permission is required.");
    }
    const userId = idSchema.parse((await params).id);
    const input = schema.parse(await request.json());
    const membership = await prisma.companyMembership.findFirst({
      where: { companyId: context.company.id, userId, status: { not: MembershipStatus.ENDED } },
      include: { user: true, userRoles: { include: { role: true } } },
    });
    if (!membership) throw new ApiError(404, "NOT_FOUND", "Company user not found.");
    if (userId === context.user.id && input.status === "SUSPENDED") {
      throw new ApiError(409, "SELF_SUSPENSION", "You cannot suspend your own membership.");
    }
    if (membership.isOwner && input.status === "SUSPENDED") {
      throw new ApiError(409, "OWNER_PROTECTED", "Transfer company ownership before suspending the owner.");
    }

    const [role, branch, warehouse] = await Promise.all([
      prisma.role.findFirst({ where: { id: input.roleId, companyId: context.company.id, isActive: true } }),
      input.branchId ? prisma.branch.findFirst({ where: { id: input.branchId, companyId: context.company.id, isActive: true } }) : Promise.resolve(null),
      input.warehouseId ? prisma.warehouse.findFirst({ where: { id: input.warehouseId, companyId: context.company.id, isActive: true } }) : Promise.resolve(null),
    ]);
    if (!role) throw new ApiError(422, "INVALID_ROLE", "Select an active role.");
    if (input.branchId && !branch) throw new ApiError(422, "INVALID_BRANCH", "Selected branch is invalid.");
    if (input.warehouseId && !warehouse) throw new ApiError(422, "INVALID_WAREHOUSE", "Selected warehouse is invalid.");
    if (warehouse && input.branchId && warehouse.branchId !== input.branchId) throw new ApiError(422, "SCOPE_MISMATCH", "Warehouse does not belong to that branch.");

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { fullName: input.fullName, phone: input.phone || null } });
      await tx.companyMembership.update({
        where: { id: membership.id },
        data: { status: input.status === "ACTIVE" ? MembershipStatus.ACTIVE : MembershipStatus.SUSPENDED },
      });
      await tx.userRole.deleteMany({ where: { membershipId: membership.id } });
      await tx.userRole.create({
        data: {
          membershipId: membership.id,
          roleId: role.id,
          branchId: input.branchId || null,
          warehouseId: input.warehouseId || null,
        },
      });
      if (input.status === "SUSPENDED") {
        await tx.session.updateMany({ where: { userId, activeCompanyId: context.company.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await appendAudit(
        {
          companyId: context.company.id,
          actorId: context.user.id,
          branchId: input.branchId || null,
          warehouseId: input.warehouseId || null,
          action: "USER_UPDATED",
          module: "access",
          entityType: "User",
          entityId: userId,
          entityReference: membership.user.email,
          previousValues: {
            fullName: membership.user.fullName,
            membershipStatus: membership.status,
            roles: membership.userRoles.map((assignment) => assignment.role.code),
          },
          newValues: {
            fullName: input.fullName,
            membershipStatus: input.status,
            role: role.code,
            branchId: input.branchId || null,
            warehouseId: input.warehouseId || null,
          },
        },
        tx,
      );
    });

    return NextResponse.json({ data: { updated: true } });
  } catch (error) {
    return apiError(error);
  }
}
