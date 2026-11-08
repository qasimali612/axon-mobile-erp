import { NextResponse } from "next/server";
import { ApiError, apiError } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { stockAdjustmentInclude } from "@/lib/operations/stock-adjustment";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const base = await requireAuth();
    const id = idSchema.parse((await params).id);
    const scope = await prisma.stockAdjustment.findFirst({ where: { id, companyId: base.company.id }, select: { branchId: true, warehouseId: true } });
    if (!scope) throw new ApiError(404, "ADJUSTMENT_NOT_FOUND", "Stock adjustment was not found.");
    const context = await requirePermission("inventory.stock.view", scope);
    const [record, movements] = await Promise.all([
      prisma.stockAdjustment.findFirst({ where: { id, companyId: context.company.id }, include: stockAdjustmentInclude }),
      prisma.inventoryMovement.findMany({ where: { companyId: context.company.id, sourceDocumentType: "StockAdjustment", sourceDocumentId: id }, include: { product: { select: { sku: true, name: true } }, variant: { select: { sku: true, name: true } }, stockUnit: { include: { identifiers: true } }, warehouse: { select: { code: true, name: true } } }, orderBy: [{ lineReference: "asc" }, { postedAt: "asc" }] }),
    ]);
    return NextResponse.json(jsonSafe({ data: record ? { ...record, movements } : null }));
  } catch (error) { return apiError(error); }
}
