import { NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { rebateCalculationSchema } from "@/lib/finance/rebate-validation";
import { calculateRebate } from "@/lib/finance/rebates";
import { jsonSafe } from "@/lib/serializers";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("REBATE_MANAGE");
    const id = (await params).id;
    const input = rebateCalculationSchema.parse(await request.json());
    const calculation = await calculateRebate(
      { companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode },
      id,
      input,
    );
    return NextResponse.json(jsonSafe({ data: calculation }), { status: 201 });
  } catch (error) { return apiError(error); }
}
