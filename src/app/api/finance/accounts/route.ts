import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { permittedBranchIds, requireCompanyPermission, requirePermission } from "@/lib/auth";
import { accountCreateSchema } from "@/lib/finance/account-validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET() {
  try {
    const context = await requirePermission("COA_VIEW");
    const allowedBranches = permittedBranchIds(context, "COA_VIEW");
    const accounts = await prisma.account.findMany({
      where: {
        companyId: context.company.id,
        ...(allowedBranches ? { OR: [{ branchId: null }, { branchId: { in: allowedBranches } }] } : {}),
      },
      include: {
        group: { select: { code: true, name: true } },
        parent: { select: { code: true, name: true } },
        branch: { select: { code: true, name: true } },
        _count: { select: { journalLines: true } },
      },
      orderBy: { code: "asc" },
    });
    return NextResponse.json(jsonSafe({ data: accounts }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requireCompanyPermission("COA_CREATE");
    const input = accountCreateSchema.parse(await request.json());
    const [group, parent, branch, costCenter] = await Promise.all([
      input.groupId ? prisma.accountGroup.findFirst({ where: { id: input.groupId, companyId: context.company.id } }) : null,
      input.parentId ? prisma.account.findFirst({ where: { id: input.parentId, companyId: context.company.id } }) : null,
      input.branchId ? prisma.branch.findFirst({ where: { id: input.branchId, companyId: context.company.id, isActive: true } }) : null,
      input.costCenterId ? prisma.costCenter.findFirst({ where: { id: input.costCenterId, companyId: context.company.id, isActive: true } }) : null,
    ]);
    if (input.groupId && !group) throw new ApiError(422, "INVALID_GROUP", "Account group was not found.");
    if (group && group.accountClass !== input.accountClass) throw new ApiError(422, "CLASS_MISMATCH", "Account and group classes must match.");
    if (input.parentId && !parent) throw new ApiError(422, "INVALID_PARENT", "Parent account was not found.");
    if (parent && parent.accountClass !== input.accountClass) throw new ApiError(422, "CLASS_MISMATCH", "Account and parent classes must match.");
    if (input.branchId && !branch) throw new ApiError(422, "INVALID_BRANCH", "Branch was not found.");
    if (input.costCenterId && !costCenter) throw new ApiError(422, "INVALID_COST_CENTER", "Cost center was not found.");

    const account = await prisma.$transaction(async (tx) => {
      const created = await tx.account.create({
        data: {
          companyId: context.company.id,
          ...input,
          groupId: input.groupId || null,
          parentId: input.parentId || null,
          branchId: input.branchId || null,
          costCenterId: input.costCenterId || null,
          currencyCode: input.currencyCode || null,
          description: input.description || null,
          accountType: input.accountType.trim().toUpperCase().replaceAll(/[ -]+/g, "_"),
        },
      });
      await appendAudit({
        companyId: context.company.id,
        actorId: context.user.id,
        branchId: input.branchId || null,
        action: "ACCOUNT_CREATED",
        module: "finance",
        entityType: "Account",
        entityId: created.id,
        entityReference: created.code,
        newValues: { code: created.code, name: created.name, accountClass: created.accountClass, accountType: created.accountType },
      }, tx);
      return created;
    });
    return NextResponse.json(jsonSafe({ data: account }), { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(new ApiError(409, "ACCOUNT_CODE_EXISTS", "This account code already exists in the company."));
    }
    return apiError(error);
  }
}
