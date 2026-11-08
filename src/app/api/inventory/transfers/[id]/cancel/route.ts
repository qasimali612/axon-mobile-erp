import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { cancelStockTransfer } from "@/lib/operations/stock-transfer";
import { requireStockTransferScope } from "@/lib/operations/stock-transfer-auth";
import { stockTransferCancellationSchema } from "@/lib/operations/validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const base = await requireAuth();
    const id = idSchema.parse((await params).id);
    const body = stockTransferCancellationSchema.parse(await request.json());
    const record = await prisma.stockTransfer.findFirst({ where: { id, companyId: base.company.id }, select: { status: true, preparedById: true, sourceBranchId: true, sourceWarehouseId: true, destinationBranchId: true, destinationWarehouseId: true } });
    if (!record) throw new ApiError(404, "TRANSFER_NOT_FOUND", "Stock transfer was not found.");
    const permission = record.status === "DRAFT" && record.preparedById === base.user.id
      ? "inventory.transfer.create"
      : "inventory.transfer.approve";
    const context = await requireStockTransferScope(permission, record, "both");
    const data = await cancelStockTransfer({ companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode }, id, body.reason);
    return NextResponse.json(jsonSafe({ data }));
  } catch (error) { return apiError(error); }
}
