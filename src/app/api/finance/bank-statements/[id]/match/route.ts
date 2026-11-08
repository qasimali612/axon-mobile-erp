import { NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { matchStatementLine } from "@/lib/finance/banking";
import { statementMatchSchema } from "@/lib/finance/banking-validation";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const id = idSchema.parse((await params).id);
    const context = await requirePermission("BANK_RECONCILIATION_PREPARE");
    const input = statementMatchSchema.parse(await request.json());
    const result = await matchStatementLine({ companyId: context.company.id, userId: context.user.id, activeBranchId: context.activeBranchId }, id, input);
    return NextResponse.json(jsonSafe({ data: result }));
  } catch (error) { return apiError(error); }
}
