import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { PERMISSION_KEYS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { roleCreateSchema } from "@/lib/validation";

export async function GET() {
  try {
    const context = await requirePermission("access.role.view");
    const [roles, permissions] = await Promise.all([
      prisma.role.findMany({
        where: { companyId: context.company.id },
        include: {
          permissions: { include: { permission: true } },
          _count: { select: { userRoles: true } },
        },
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      }),
      prisma.permission.findMany({ orderBy: [{ module: "asc" }, { action: "asc" }] }),
    ]);
    return NextResponse.json({ data: { roles, permissions } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("access.role.create");
    const input = roleCreateSchema.parse(await request.json());
    const unknown = input.permissionKeys.filter((key) => !PERMISSION_KEYS.has(key));
    if (unknown.length) throw new ApiError(422, "UNKNOWN_PERMISSION", "One or more permissions are invalid.", unknown);

    const permissions = await prisma.permission.findMany({ where: { key: { in: input.permissionKeys } } });
    const role = await prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          companyId: context.company.id,
          code: input.code,
          name: input.name,
          description: input.description || null,
          isSystem: false,
          permissions: {
            create: permissions.map((permission) => ({ permissionId: permission.id })),
          },
        },
        include: { permissions: { include: { permission: true } } },
      });
      await appendAudit(
        {
          companyId: context.company.id,
          actorId: context.user.id,
          action: "ROLE_CREATED",
          module: "access",
          entityType: "Role",
          entityId: created.id,
          entityReference: created.code,
          newValues: input,
        },
        tx,
      );
      return created;
    });
    return NextResponse.json({ data: role }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(new ApiError(409, "DUPLICATE_ROLE", "Role code already exists."));
    }
    return apiError(error);
  }
}
