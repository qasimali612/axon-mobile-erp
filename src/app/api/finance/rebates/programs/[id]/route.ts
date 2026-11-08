import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { rebateProgramSchema } from "@/lib/finance/rebate-validation";
import { saveRebateProgram } from "@/lib/finance/rebates";
import { jsonSafe } from "@/lib/serializers";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("REBATE_MANAGE");
    const id = (await params).id;
    const input = rebateProgramSchema.parse(await request.json());
    const program = await saveRebateProgram(
      { companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode },
      { ...input, rate: input.rate || null, fixedAmount: input.fixedAmount || null },
      id,
    );
    return NextResponse.json(jsonSafe({ data: program }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(new ApiError(409, "DUPLICATE_PROGRAM_CODE", "A rebate program with this code already exists."));
    return apiError(error);
  }
}
