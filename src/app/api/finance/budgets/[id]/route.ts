import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { budgetSchema } from "@/lib/finance/budget-validation";
import { budgetVariance, updateBudgetDraft } from "@/lib/finance/budgets";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const id = idSchema.parse((await params).id);
    const context = await requirePermission("BUDGET_VIEW");
    const budget = await prisma.budget.findFirst({
      where: { id, companyId: context.company.id },
      include: {
        fiscalYear: { select: { code: true, name: true } },
        branch: { select: { code: true, name: true } },
        department: { select: { code: true, name: true } },
        costCenter: { select: { code: true, name: true } },
        createdBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
        lines: { include: { account: { select: { code: true, name: true, accountClass: true } }, period: { select: { id: true, name: true, number: true } } } },
      },
    });
    if (!budget) throw new ApiError(404, "BUDGET_NOT_FOUND", "Budget was not found.");
    const variance = await budgetVariance({ companyId: context.company.id, userId: context.user.id }, id);
    return NextResponse.json(jsonSafe({ data: budget, variance }));
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const id = idSchema.parse((await params).id);
    const context = await requirePermission("BUDGET_CREATE");
    const input = budgetSchema.parse(await request.json());
    const updated = await updateBudgetDraft({ companyId: context.company.id, userId: context.user.id }, id, input);
    return NextResponse.json(jsonSafe({ data: updated }));
  } catch (error) { return apiError(error); }
}
