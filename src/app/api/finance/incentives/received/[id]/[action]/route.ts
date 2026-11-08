import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { receivedIncentivePaymentSchema } from "@/lib/finance/incentive-validation";
import { approveReceivedIncentive, receiveIncentive } from "@/lib/finance/incentives";
import { jsonSafe } from "@/lib/serializers";

type RouteContext = { params: Promise<{ id: string; action: string }> };

const approvalSchema = z.object({ branchId: z.string().uuid(), postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const { id, action } = await params;
    const body = await request.json().catch(() => ({}));
    if (action === "approve") {
      const context = await requirePermission("INCENTIVE_RECEIVABLE_APPROVE");
      const input = approvalSchema.parse(body);
      const result = await approveReceivedIncentive(
        { companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode },
        id,
        input,
      );
      return NextResponse.json(jsonSafe({ data: result }));
    }
    if (action === "receive") {
      const context = await requirePermission("INCENTIVE_RECEIVE");
      const input = receivedIncentivePaymentSchema.parse(body);
      const result = await receiveIncentive(
        { companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode },
        id,
        input,
      );
      return NextResponse.json(jsonSafe({ data: result }));
    }
    throw new ApiError(404, "NOT_FOUND", "Unknown supplier incentive action.");
  } catch (error) { return apiError(error); }
}
