import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { budgetVariance } from "@/lib/finance/budgets";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const id = idSchema.parse((await params).id);
    const context = await requirePermission("BUDGET_VIEW");
    const variance = await budgetVariance({ companyId: context.company.id, userId: context.user.id }, id);
    return NextResponse.json(jsonSafe({ data: variance }));
  } catch (error) { return apiError(error); }
}
