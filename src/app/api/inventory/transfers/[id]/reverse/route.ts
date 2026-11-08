import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { reverseStockTransfer } from "@/lib/operations/stock-transfer";
import { requireStockTransferScope } from "@/lib/operations/stock-transfer-auth";
import { operationReversalSchema } from "@/lib/operations/validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const base = await requireAuth();
    const id = idSchema.parse((await params).id);
    const body = operationReversalSchema.parse(await request.json());
    const record = await prisma.stockTransfer.findFirst({ where: { id, companyId: base.company.id }, select: { sourceBranchId: true, sourceWarehouseId: true, destinationBranchId: true, destinationWarehouseId: true } });
    if (!record) throw new ApiError(404, "TRANSFER_NOT_FOUND", "Stock transfer was not found.");
    await requireStockTransferScope("inventory.transfer.approve", record, "both");
    const context = await requirePermission("inventory.transfer.dispatch", { branchId: record.destinationBranchId, warehouseId: record.destinationWarehouseId });
    await requirePermission("inventory.transfer.receive", { branchId: record.sourceBranchId, warehouseId: record.sourceWarehouseId });
    const data = await reverseStockTransfer({ companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode }, id, body);
    return NextResponse.json(jsonSafe({ data }), { status: 201 });
  } catch (error) { return apiError(error); }
}
