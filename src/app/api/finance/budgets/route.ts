import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { budgetSchema } from "@/lib/finance/budget-validation";
import { createBudgetDraft } from "@/lib/finance/budgets";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET() {
  try {
    const context = await requirePermission("BUDGET_VIEW");
    const companyId = context.company.id;
    const [budgets, fiscalYears, accounts, periods, branches, departments, costCenters] = await Promise.all([
      prisma.budget.findMany({
        where: { companyId },
        include: {
          fiscalYear: { select: { code: true, name: true } },
          branch: { select: { code: true, name: true } },
          department: { select: { code: true, name: true } },
          costCenter: { select: { code: true, name: true } },
          createdBy: { select: { fullName: true } },
          approvedBy: { select: { fullName: true } },
          lines: { include: { account: { select: { code: true, name: true, accountClass: true } }, period: { select: { id: true, name: true, number: true } } } },
        },
        orderBy: [{ code: "asc" }, { version: "desc" }],
      }),
      prisma.fiscalYear.findMany({ where: { companyId }, select: { id: true, code: true, name: true, isCurrent: true }, orderBy: { startDate: "desc" } }),
      prisma.account.findMany({ where: { companyId, isActive: true, allowManualJournal: true }, select: { id: true, code: true, name: true, accountClass: true }, orderBy: { code: "asc" } }),
      prisma.accountingPeriod.findMany({ where: { companyId }, select: { id: true, name: true, number: true, fiscalYearId: true, status: true }, orderBy: [{ fiscalYear: { startDate: "desc" } }, { number: "asc" }] }),
      prisma.branch.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
      prisma.department.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
      prisma.costCenter.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    ]);
    return NextResponse.json(jsonSafe({ data: budgets, lookups: { fiscalYears, accounts, periods, branches, departments, costCenters } }));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("BUDGET_CREATE");
    const input = budgetSchema.parse(await request.json());
    const created = await createBudgetDraft({ companyId: context.company.id, userId: context.user.id }, input);
    return NextResponse.json(jsonSafe({ data: created }), { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(new ApiError(409, "DUPLICATE_BUDGET_VERSION", "This budget code and version already exists."));
    return apiError(error);
  }
}
