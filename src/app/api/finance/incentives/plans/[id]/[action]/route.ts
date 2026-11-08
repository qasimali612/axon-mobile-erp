import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { incentiveCalculationSchema } from "@/lib/finance/incentive-validation";
import { calculateIncentives } from "@/lib/finance/incentives";
import { jsonSafe } from "@/lib/serializers";

type RouteContext = { params: Promise<{ id: string; action: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const { id, action } = await params;
    if (action !== "calculate") throw new ApiError(404, "NOT_FOUND", "Unknown incentive plan action.");
    const context = await requirePermission("INCENTIVE_CALCULATE");
    const input = incentiveCalculationSchema.parse(await request.json());
    const result = await calculateIncentives(
      { companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode },
      id,
      input,
    );
    return NextResponse.json(jsonSafe({ data: result }));
  } catch (error) { return apiError(error); }
}
