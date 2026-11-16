import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { cancelPayment } from "@/lib/operations/payments";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

const cancelSchema = z.object({
  reason: z.string().optional(),
});

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const base = await requireAuth();
    const id = idSchema.parse((await params).id);
    const record = await prisma.payment.findFirst({
      where: { id, companyId: base.company.id },
      select: { branchId: true },
    });
    if (!record) throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment was not found.");

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = cancelSchema.parse(body);

    const context = await requirePermission("PAYMENT_CANCEL", record);

    const data = await cancelPayment(
      {
        companyId: context.company.id,
        userId: context.user.id,
        currencyCode: context.company.currencyCode,
        permissions: context.permissions,
      },
      id,
      parsed.reason,
    );
    return NextResponse.json(jsonSafe({ data }));
  } catch (error) {
    return apiError(error);
  }
}
