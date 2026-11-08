import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { PERMISSION_KEYS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };
const schema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  permissionKeys: z.array(z.string().max(120)).max(200),
  isActive: z.boolean(),
});

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("access.role.edit");
    const id = idSchema.parse((await params).id);
    const input = schema.parse(await request.json());
    const role = await prisma.role.findFirst({
      where: { id, companyId: context.company.id },
      include: { permissions: { include: { permission: true } }, _count: { select: { userRoles: true } } },
    });
    if (!role) throw new ApiError(404, "NOT_FOUND", "Role not found.");
    if (role.isSystem) throw new ApiError(409, "SYSTEM_ROLE_PROTECTED", "System roles are policy-managed and cannot be edited here. Clone one to customize it.");
    if (!input.isActive && role._count.userRoles > 0) throw new ApiError(409, "ROLE_IN_USE", "Reassign users before disabling this role.");
    const unknown = input.permissionKeys.filter((key) => !PERMISSION_KEYS.has(key));
    if (unknown.length) throw new ApiError(422, "UNKNOWN_PERMISSION", "One or more permission keys are invalid.");

    const permissions = await prisma.permission.findMany({ where: { key: { in: input.permissionKeys } } });
    await prisma.$transaction(async (tx) => {
      await tx.role.update({ where: { id }, data: { name: input.name, description: input.description || null, isActive: input.isActive } });
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({ roleId: id, permissionId: permission.id })),
      });
      await appendAudit(
        {
          companyId: context.company.id,
          actorId: context.user.id,
          action: "ROLE_UPDATED",
          module: "access",
          entityType: "Role",
          entityId: id,
          entityReference: role.code,
          previousValues: { name: role.name, permissionKeys: role.permissions.map((grant) => grant.permission.key), isActive: role.isActive },
          newValues: input,
        },
        tx,
      );
    });
    return NextResponse.json({ data: { updated: true } });
  } catch (error) {
    return apiError(error);
  }
}
