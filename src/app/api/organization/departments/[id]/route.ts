import { NextResponse } from "next/server";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { departmentSchema, idSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("organization.branch.edit");
    const { id } = await params;
    idSchema.parse(id);
    const input = departmentSchema.parse(await request.json());

    const existing = await prisma.department.findUnique({
      where: { id },
    });
    if (!existing || existing.companyId !== context.company.id) {
      throw new ApiError(404, "NOT_FOUND", "Department not found.");
    }

    if (input.branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: input.branchId, companyId: context.company.id },
      });
      if (!branch) {
        throw new ApiError(400, "INVALID_BRANCH", "Specified branch not found.");
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.department.update({
        where: { id },
        data: {
          code: input.code,
          name: input.name,
          branchId: input.branchId || null,
          isActive: input.isActive,
        },
      });
      await appendAudit(
        {
          companyId: context.company.id,
          actorId: context.user.id,
          branchId: record.branchId || undefined,
          action: "DEPARTMENT_UPDATED",
          module: "organization",
          entityType: "Department",
          entityId: record.id,
          entityReference: record.code,
          previousValues: { code: existing.code, name: existing.name },
          newValues: input,
        },
        tx,
      );
      return record;
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("organization.branch.archive");
    const { id } = await params;
    idSchema.parse(id);

    const existing = await prisma.department.findUnique({
      where: { id },
      include: {
        _count: { select: { journalLines: true, assets: true, budgets: true } },
      },
    });
    if (!existing || existing.companyId !== context.company.id) {
      throw new ApiError(404, "NOT_FOUND", "Department not found.");
    }

    if (existing._count.journalLines > 0 || existing._count.assets > 0 || existing._count.budgets > 0) {
      // If referenced in historical transactions, toggle active status instead of hard delete
      const updated = await prisma.department.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({ data: updated, message: "Department has transaction references; deactivated instead." });
    }

    await prisma.$transaction(async (tx) => {
      await tx.department.delete({ where: { id } });
      await appendAudit(
        {
          companyId: context.company.id,
          actorId: context.user.id,
          branchId: existing.branchId || undefined,
          action: "DEPARTMENT_DELETED",
          module: "organization",
          entityType: "Department",
          entityId: existing.id,
          entityReference: existing.code,
          previousValues: { code: existing.code, name: existing.name },
        },
        tx,
      );
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
