import { NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { prepareReconciliation } from "@/lib/finance/banking";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const id = idSchema.parse((await params).id);
    const context = await requirePermission("BANK_RECONCILIATION_PREPARE");
    const result = await prepareReconciliation({ companyId: context.company.id, userId: context.user.id, activeBranchId: context.activeBranchId }, id);
    return NextResponse.json(jsonSafe({ data: result }));
  } catch (error) { return apiError(error); }
}
