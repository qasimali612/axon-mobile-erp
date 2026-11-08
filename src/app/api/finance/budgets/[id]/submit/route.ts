import { NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { submitBudget as runAction } from "@/lib/finance/budgets";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const id = idSchema.parse((await params).id);
    const context = await requirePermission("BUDGET_CREATE");
    const result = await runAction({ companyId: context.company.id, userId: context.user.id }, id);
    return NextResponse.json(jsonSafe({ data: result }));
  } catch (error) { return apiError(error); }
}
