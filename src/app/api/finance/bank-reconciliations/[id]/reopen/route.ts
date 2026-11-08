import { NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { reopenReconciliation } from "@/lib/finance/banking";
import { reconciliationReopenSchema } from "@/lib/finance/banking-validation";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const id = idSchema.parse((await params).id);
    const context = await requirePermission("BANK_RECONCILIATION_APPROVE");
    const body = reconciliationReopenSchema.parse(await request.json());
    const reopened = await reopenReconciliation({ companyId: context.company.id, userId: context.user.id, activeBranchId: context.activeBranchId }, id, body.reason);
    return NextResponse.json(jsonSafe({ data: reopened }));
  } catch (error) { return apiError(error); }
}
