import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { incentivePlanSchema } from "@/lib/finance/incentive-validation";
import { saveIncentivePlan } from "@/lib/finance/incentives";
import { jsonSafe } from "@/lib/serializers";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("INCENTIVE_PLAN_MANAGE");
    const id = (await params).id;
    const input = incentivePlanSchema.parse(await request.json());
    const plan = await saveIncentivePlan(
      { companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode },
      { ...input, rate: input.rate || null, fixedAmount: input.fixedAmount || null, maximumIncentive: input.maximumIncentive || null },
      id,
    );
    return NextResponse.json(jsonSafe({ data: plan }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(new ApiError(409, "DUPLICATE_PLAN_CODE", "An incentive plan with this code already exists."));
    return apiError(error);
  }
}
