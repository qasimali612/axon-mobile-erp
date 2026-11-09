import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { rebateSettlementSchema } from "@/lib/finance/rebate-validation";
import { accrueRebate, approveRebate, rejectRebate, settleRebate } from "@/lib/finance/rebates";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

type RouteContext = { params: Promise<{ id: string; action: string }> };

const accrualSchema = z.object({ postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const rejectSchema = z.object({ reason: z.string().trim().min(2, "Provide a reason for rejection.") });

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const { id, action } = await params;
    const body = await request.json().catch(() => ({}));
    const actorFor = (context: { company: { id: string; currencyCode: string }; user: { id: string } }) => ({
      companyId: context.company.id,
      userId: context.user.id,
      currencyCode: context.company.currencyCode,
    });

    if (action === "approve") {
      const context = await requirePermission("REBATE_APPROVE");
      return NextResponse.json(jsonSafe({ data: await approveRebate(actorFor(context), id) }));
    }
    if (action === "reject") {
      const context = await requirePermission("REBATE_APPROVE");
      const input = rejectSchema.parse(body);
      return NextResponse.json(jsonSafe({ data: await rejectRebate(actorFor(context), id, input.reason) }));
    }
    if (action === "accrue") {
      const context = await requirePermission("REBATE_APPROVE");
      const input = accrualSchema.parse(body);
      return NextResponse.json(jsonSafe({ data: await accrueRebate(actorFor(context), id, input) }));
    }
    if (action === "settle") {
      const context = await requirePermission("REBATE_VIEW");
      const calculation = await prisma.rebateCalculation.findFirst({
        where: { id, companyId: context.company.id },
        select: { program: { select: { direction: true } } },
      });
      if (!calculation) throw new ApiError(404, "REBATE_CALCULATION_NOT_FOUND", "Rebate calculation was not found.");
      const permission = calculation.program.direction === "RECEIVABLE" ? "REBATE_RECEIVE" : "REBATE_PAY";
      await requirePermission(permission);
      const input = rebateSettlementSchema.parse(body);
      return NextResponse.json(jsonSafe({ data: await settleRebate(actorFor(context), id, input) }));
    }
    throw new ApiError(404, "NOT_FOUND", "Unknown rebate action.");
  } catch (error) {
    return apiError(error);
  }
}
