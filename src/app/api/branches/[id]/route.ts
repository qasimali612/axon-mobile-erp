import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { branchSchema, idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("organization.branch.edit");
    const id = idSchema.parse((await params).id);
    const input = branchSchema.parse(await request.json());
    const existing = await prisma.branch.findFirst({ where: { id, companyId: context.company.id, archivedAt: null } });
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Branch not found.");

    const updated = await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.update({
        where: { id },
        data: {
          code: input.code,
          name: input.name,
          type: input.type,
          documentPrefix: input.documentPrefix,
          city: input.city || null,
          province: input.province || null,
          phone: input.phone || null,
          email: input.email || null,
          isActive: input.isActive,
        },
      });
      await appendAudit(
        {
          companyId: context.company.id,
          actorId: context.user.id,
          branchId: id,
          action: "BRANCH_UPDATED",
          module: "organization",
          entityType: "Branch",
          entityId: id,
          entityReference: branch.code,
          previousValues: { code: existing.code, name: existing.name, type: existing.type, isActive: existing.isActive },
          newValues: input,
        },
        tx,
      );
      return branch;
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(new ApiError(409, "DUPLICATE_BRANCH", "Branch code or document prefix already exists."));
    }
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("organization.branch.archive");
    const id = idSchema.parse((await params).id);
    const input = z.object({ reason: z.string().trim().min(5).max(500) }).parse(await request.json());
    const branch = await prisma.branch.findFirst({
      where: { id, companyId: context.company.id, archivedAt: null },
      include: { warehouses: { where: { isActive: true } } },
    });
    if (!branch) throw new ApiError(404, "NOT_FOUND", "Branch not found.");
    if (branch.warehouses.length) {
      throw new ApiError(409, "ACTIVE_WAREHOUSES", "Archive or move active warehouses before archiving this branch.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.branch.update({ where: { id }, data: { isActive: false, archivedAt: new Date() } });
      await appendAudit(
        {
          companyId: context.company.id,
          actorId: context.user.id,
          branchId: id,
          action: "BRANCH_ARCHIVED",
          module: "organization",
          entityType: "Branch",
          entityId: id,
          entityReference: branch.code,
          reason: input.reason,
          previousValues: { isActive: branch.isActive },
          newValues: { isActive: false, archived: true },
        },
        tx,
      );
    });
    return NextResponse.json({ data: { archived: true } });
  } catch (error) {
    return apiError(error);
  }
}
