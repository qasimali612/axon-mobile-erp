import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { postStockTransfer } from "@/lib/operations/stock-transfer";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const base = await requireAuth();
    const id = idSchema.parse((await params).id);
    const record = await prisma.stockTransfer.findFirst({ where: { id, companyId: base.company.id }, select: { sourceBranchId: true, sourceWarehouseId: true, destinationBranchId: true, destinationWarehouseId: true } });
    if (!record) throw new ApiError(404, "TRANSFER_NOT_FOUND", "Stock transfer was not found.");
    const context = await requirePermission("inventory.transfer.dispatch", { branchId: record.sourceBranchId, warehouseId: record.sourceWarehouseId });
    await requirePermission("inventory.transfer.receive", { branchId: record.destinationBranchId, warehouseId: record.destinationWarehouseId });
    const data = await postStockTransfer({ companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode }, id);
    return NextResponse.json(jsonSafe({ data }));
  } catch (error) { return apiError(error); }
}
