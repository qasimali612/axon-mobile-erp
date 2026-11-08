import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { receivedIncentiveSchema } from "@/lib/finance/incentive-validation";
import { createReceivedIncentive } from "@/lib/finance/incentives";
import { jsonSafe } from "@/lib/serializers";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("INCENTIVE_RECEIVABLE_CREATE");
    const input = receivedIncentiveSchema.parse(await request.json());
    const claim = await createReceivedIncentive(
      { companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode },
      { ...input, expectedReceiptDate: input.expectedReceiptDate || null },
    );
    return NextResponse.json(jsonSafe({ data: claim }), { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) return apiError(error);
    return apiError(error);
  }
}
