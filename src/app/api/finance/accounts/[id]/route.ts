import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requireCompanyPermission } from "@/lib/auth";
import { accountUpdateSchema } from "@/lib/finance/account-validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const context = await requireCompanyPermission("COA_EDIT");
    const id = idSchema.parse((await params).id);
    const input = accountUpdateSchema.parse(await request.json());
    const existing = await prisma.account.findFirst({
      where: { id, companyId: context.company.id },
      include: {
        _count: {
          select: {
            journalLines: true,
            bankAccounts: true,
            fixedAssetCostMappings: true,
            fixedAssetAccumMappings: true,
            fixedAssetExpenseMappings: true,
            fixedAssetDisposalMappings: true,
          },
        },
      },
    });
    if (!existing) throw new ApiError(404, "ACCOUNT_NOT_FOUND", "Account was not found.");
    if (input.isActive === false) {
      const referencedByActiveConfiguration =
        existing._count.bankAccounts +
          existing._count.fixedAssetCostMappings +
          existing._count.fixedAssetAccumMappings +
          existing._count.fixedAssetExpenseMappings +
          existing._count.fixedAssetDisposalMappings >
        0;
      if (referencedByActiveConfiguration) {
        throw new ApiError(409, "ACCOUNT_IN_USE", "Remove active bank or fixed-asset mappings before deactivating this account.");
      }
    }
    const [group, branch, costCenter] = await Promise.all([
      input.groupId ? prisma.accountGroup.findFirst({ where: { id: input.groupId, companyId: context.company.id } }) : null,
      input.branchId ? prisma.branch.findFirst({ where: { id: input.branchId, companyId: context.company.id, isActive: true } }) : null,
      input.costCenterId ? prisma.costCenter.findFirst({ where: { id: input.costCenterId, companyId: context.company.id, isActive: true } }) : null,
    ]);
    if (input.groupId && (!group || group.accountClass !== existing.accountClass)) {
      throw new ApiError(422, "INVALID_GROUP", "Group must exist and use the same account class.");
    }
    if (input.branchId && !branch) throw new ApiError(422, "INVALID_BRANCH", "Branch was not found.");
    if (input.costCenterId && !costCenter) throw new ApiError(422, "INVALID_COST_CENTER", "Cost center was not found.");
    if (input.parentId) {
      if (input.parentId === id) throw new ApiError(422, "ACCOUNT_CYCLE", "An account cannot be its own parent.");
      let cursor: string | null = input.parentId;
      let depth = 0;
      while (cursor && depth < 50) {
        const parent: { id: string; parentId: string | null; accountClass: typeof existing.accountClass } | null = await prisma.account.findFirst({
          where: { id: cursor, companyId: context.company.id },
          select: { id: true, parentId: true, accountClass: true },
        });
        if (!parent || parent.accountClass !== existing.accountClass) throw new ApiError(422, "INVALID_PARENT", "Parent account must exist in the same class.");
        if (parent.parentId === id) throw new ApiError(422, "ACCOUNT_CYCLE", "The selected parent would create a hierarchy cycle.");
        cursor = parent.parentId;
        depth += 1;
      }
      if (depth >= 50) throw new ApiError(422, "ACCOUNT_DEPTH", "Account hierarchy exceeds the supported depth.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const account = await tx.account.update({
        where: { id },
        data: {
          ...input,
          ...(input.groupId !== undefined ? { groupId: input.groupId || null } : {}),
          ...(input.parentId !== undefined ? { parentId: input.parentId || null } : {}),
          ...(input.branchId !== undefined ? { branchId: input.branchId || null } : {}),
          ...(input.costCenterId !== undefined ? { costCenterId: input.costCenterId || null } : {}),
          ...(input.currencyCode !== undefined ? { currencyCode: input.currencyCode || null } : {}),
          ...(input.description !== undefined ? { description: input.description || null } : {}),
          ...(input.accountType ? { accountType: input.accountType.trim().toUpperCase().replaceAll(/[ -]+/g, "_") } : {}),
          ...(input.isActive === false ? { archivedAt: new Date() } : input.isActive === true ? { archivedAt: null } : {}),
        },
      });
      await appendAudit({
        companyId: context.company.id,
        actorId: context.user.id,
        branchId: account.branchId,
        action: input.isActive === false ? "ACCOUNT_DEACTIVATED" : input.isActive === true ? "ACCOUNT_REACTIVATED" : "ACCOUNT_UPDATED",
        module: "finance",
        entityType: "Account",
        entityId: account.id,
        entityReference: account.code,
        previousValues: { name: existing.name, isActive: existing.isActive, parentId: existing.parentId, groupId: existing.groupId },
        newValues: { name: account.name, isActive: account.isActive, parentId: account.parentId, groupId: account.groupId },
      }, tx);
      return account;
    });
    return NextResponse.json(jsonSafe({ data: updated }));
  } catch (error) {
    return apiError(error);
  }
}
