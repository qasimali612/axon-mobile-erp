import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { incentiveAdjustmentSchema, incentiveAccrualSchema, incentiveReversalSchema } from "@/lib/finance/incentive-validation";
import { accrueIncentive, adjustIncentive, approveIncentive, reverseIncentiveAccrual } from "@/lib/finance/incentives";
import { jsonSafe } from "@/lib/serializers";

type RouteContext = { params: Promise<{ id: string; action: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const { id, action } = await params;
    const body = await request.json().catch(() => ({}));
    const actorFor = (context: Awaited<ReturnType<typeof requirePermission>>) => ({ companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode });

    if (action === "adjust") {
      const context = await requirePermission("INCENTIVE_CALCULATE");
      const input = incentiveAdjustmentSchema.parse(body);
      return NextResponse.json(jsonSafe({ data: await adjustIncentive(actorFor(context), id, input) }));
    }
    if (action === "approve") {
      const context = await requirePermission("INCENTIVE_APPROVE");
      return NextResponse.json(jsonSafe({ data: await approveIncentive(actorFor(context), id) }));
    }
    if (action === "accrue") {
      const context = await requirePermission("INCENTIVE_APPROVE");
      const input = incentiveAccrualSchema.parse(body);
      return NextResponse.json(jsonSafe({ data: await accrueIncentive(actorFor(context), id, input) }));
    }
    if (action === "reverse") {
      const context = await requirePermission("INCENTIVE_APPROVE");
      const input = incentiveReversalSchema.parse(body);
      return NextResponse.json(jsonSafe({ data: await reverseIncentiveAccrual(actorFor(context), id, input) }));
    }
    throw new ApiError(404, "NOT_FOUND", "Unknown incentive calculation action.");
  } catch (error) { return apiError(error); }
}
