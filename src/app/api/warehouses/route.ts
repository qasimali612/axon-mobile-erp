import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { warehouseSchema } from "@/lib/validation";

export async function GET() {
  try {
    const context = await requirePermission("organization.warehouse.view");
    const data = await prisma.warehouse.findMany({
      where: { companyId: context.company.id, archivedAt: null },
      include: { branch: true, _count: { select: { locations: true } } },
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
    const context = await requirePermission("organization.warehouse.create");
    const input = warehouseSchema.parse(await request.json());
    const branch = await prisma.branch.findFirst({ where: { id: input.branchId, companyId: context.company.id, isActive: true } });
    if (!branch) throw new ApiError(422, "INVALID_BRANCH", "Select an active branch in this company.");

    const warehouse = await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.warehouse.updateMany({ where: { companyId: context.company.id, isDefault: true }, data: { isDefault: false } });
      }
      const created = await tx.warehouse.create({
        data: {
          companyId: context.company.id,
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
          warehouseId: created.id,
          action: "WAREHOUSE_CREATED",
          module: "organization",
          entityType: "Warehouse",
          entityId: created.id,
          entityReference: created.code,
          newValues: input,
        },
        tx,
      );
      return created;
    });
    return NextResponse.json({ data: warehouse }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(new ApiError(409, "DUPLICATE_WAREHOUSE", "Warehouse code already exists."));
    }
    return apiError(error);
  }
}
