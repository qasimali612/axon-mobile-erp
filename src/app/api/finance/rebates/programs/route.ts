import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { rebateProgramSchema } from "@/lib/finance/rebate-validation";
import { saveRebateProgram } from "@/lib/finance/rebates";
import { jsonSafe } from "@/lib/serializers";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("REBATE_MANAGE");
    const input = rebateProgramSchema.parse(await request.json());
    const program = await saveRebateProgram(
      { companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode },
      { ...input, rate: input.rate || null, fixedAmount: input.fixedAmount || null },
    );
    return NextResponse.json(jsonSafe({ data: program }), { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(new ApiError(409, "DUPLICATE_PROGRAM_CODE", "A rebate program with this code already exists."));
    return apiError(error);
  }
}
