import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { idSchema, warehouseSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("organization.warehouse.edit");
    const id = idSchema.parse((await params).id);
    const input = warehouseSchema.parse(await request.json());
    const [existing, branch] = await Promise.all([
      prisma.warehouse.findFirst({ where: { id, companyId: context.company.id, archivedAt: null } }),
      prisma.branch.findFirst({ where: { id: input.branchId, companyId: context.company.id, isActive: true } }),
    ]);
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Warehouse not found.");
    if (!branch) throw new ApiError(422, "INVALID_BRANCH", "Select an active branch.");

    const updated = await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.warehouse.updateMany({ where: { companyId: context.company.id, isDefault: true, id: { not: id } }, data: { isDefault: false } });
      }
      const warehouse = await tx.warehouse.update({
        where: { id },
        data: {
          branchId: input.branchId,
          code: input.code,
          name: input.name,
          type: input.type,
          city: input.city || null,
          phone: input.phone || null,
          allowReceiving: input.allowReceiving,
          allowDispatch: input.allowDispatch,
          isDefault: input.isDefault,
          isActive: input.isActive,
        },
        include: { branch: true },
      });
      await appendAudit(
        {
          companyId: context.company.id,
          actorId: context.user.id,
          branchId: input.branchId,
          warehouseId: id,
          action: "WAREHOUSE_UPDATED",
          module: "organization",
          entityType: "Warehouse",
          entityId: id,
          entityReference: warehouse.code,
          previousValues: { code: existing.code, name: existing.name, branchId: existing.branchId, type: existing.type, isActive: existing.isActive },
          newValues: input,
        },
        tx,
      );
      return warehouse;
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(new ApiError(409, "DUPLICATE_WAREHOUSE", "Warehouse code already exists."));
    }
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("organization.warehouse.archive");
    const id = idSchema.parse((await params).id);
    const input = z.object({ reason: z.string().trim().min(5).max(500) }).parse(await request.json());
    const warehouse = await prisma.warehouse.findFirst({ where: { id, companyId: context.company.id, archivedAt: null } });
    if (!warehouse) throw new ApiError(404, "NOT_FOUND", "Warehouse not found.");
    if (warehouse.isDefault) throw new ApiError(409, "DEFAULT_WAREHOUSE", "Choose another default warehouse before archiving this one.");

    await prisma.$transaction(async (tx) => {
      await tx.warehouse.update({ where: { id }, data: { isActive: false, archivedAt: new Date() } });
      await appendAudit(
        {
          companyId: context.company.id,
          actorId: context.user.id,
          branchId: warehouse.branchId,
          warehouseId: id,
          action: "WAREHOUSE_ARCHIVED",
          module: "organization",
          entityType: "Warehouse",
          entityId: id,
          entityReference: warehouse.code,
          reason: input.reason,
          previousValues: { isActive: warehouse.isActive },
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
