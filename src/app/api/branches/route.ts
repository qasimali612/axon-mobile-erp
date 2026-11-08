import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { branchSchema } from "@/lib/validation";

export async function GET() {
  try {
    const context = await requirePermission("organization.branch.view");
    const data = await prisma.branch.findMany({
      where: { companyId: context.company.id, archivedAt: null },
      include: { _count: { select: { warehouses: true } } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
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
    const input = branchSchema.parse(await request.json());
    const branch = await prisma.$transaction(async (tx) => {
      const created = await tx.branch.create({
        data: {
          companyId: context.company.id,
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
          branchId: created.id,
          action: "BRANCH_CREATED",
          module: "organization",
          entityType: "Branch",
          entityId: created.id,
          entityReference: created.code,
          newValues: input,
        },
        tx,
      );
      return created;
    });
    return NextResponse.json({ data: branch }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(new ApiError(409, "DUPLICATE_BRANCH", "Branch code or document prefix already exists."));
    }
    return apiError(error);
  }
}
