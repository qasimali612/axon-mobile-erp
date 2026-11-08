import { NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { departmentSchema } from "@/lib/validation";

export async function GET() {
  try {
    const context = await requirePermission("organization.branch.view");
    const data = await prisma.department.findMany({
      where: { companyId: context.company.id },
      include: {
        branch: { select: { id: true, code: true, name: true } },
        _count: { select: { journalLines: true, assets: true, budgets: true } },
      },
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
    });
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("organization.branch.create");
    const input = departmentSchema.parse(await request.json());

    if (input.branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: input.branchId, companyId: context.company.id },
      });
      if (!branch) {
        return NextResponse.json({ error: { message: "Specified branch not found." } }, { status: 400 });
      }
    }

    const department = await prisma.$transaction(async (tx) => {
      const created = await tx.department.create({
        data: {
          companyId: context.company.id,
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
          branchId: created.branchId || undefined,
          action: "DEPARTMENT_CREATED",
          module: "organization",
          entityType: "Department",
          entityId: created.id,
          entityReference: created.code,
          newValues: input,
        },
        tx,
      );
      return created;
    });

    return NextResponse.json({ data: department }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

