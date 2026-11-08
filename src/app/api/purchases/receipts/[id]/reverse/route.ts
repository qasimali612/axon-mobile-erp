import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { reversePostedPurchaseReceipt } from "@/lib/operations/reversals";
import { parseOperationDate } from "@/lib/operations/validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };
const reversalSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
  postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const base = await requireAuth();
    const id = idSchema.parse((await params).id);
    const body = reversalSchema.parse(await request.json());
    const record = await prisma.purchaseReceipt.findFirst({
      where: { id, companyId: base.company.id },
      select: { branchId: true, warehouseId: true },
    });
    if (!record) throw new ApiError(404, "PURCHASE_RECEIPT_NOT_FOUND", "Goods receipt was not found.");
    const context = await requirePermission("PURCHASE_RECEIPT_REVERSE", record);
    const data = await reversePostedPurchaseReceipt(
      { companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode },
      id,
      { reason: body.reason, postingDate: parseOperationDate(body.postingDate, "Reversal date") },
    );
    return NextResponse.json(jsonSafe({ data }));
  } catch (error) {
    return apiError(error);
  }
}
