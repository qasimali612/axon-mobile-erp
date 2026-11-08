import { NextResponse } from "next/server";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { approvePurchaseOrder } from "@/lib/operations/purchase";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const base = await requireAuth();
    const id = idSchema.parse((await params).id);
    const record = await prisma.purchaseOrder.findFirst({ where: { id, companyId: base.company.id }, select: { branchId: true, warehouseId: true } });
    if (!record) throw new ApiError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order was not found.");
    const context = await requirePermission("PURCHASE_ORDER_APPROVE", record);
    const data = await approvePurchaseOrder({ companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode, permissions: context.permissions }, id);
    return NextResponse.json(jsonSafe({ data }));
  } catch (error) { return apiError(error); }
}
