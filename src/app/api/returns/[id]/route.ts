import { NextResponse } from "next/server";
import { StockReturnType } from "@prisma/client";
import { ApiError, apiError } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const base = await requireAuth(); const id = idSchema.parse((await params).id);
    const scope = await prisma.stockReturn.findFirst({ where: { id, companyId: base.company.id }, select: { branchId: true, warehouseId: true, returnType: true } });
    if (!scope) throw new ApiError(404, "RETURN_NOT_FOUND", "Return document was not found.");
    const permission = scope.returnType === StockReturnType.SALES_RETURN ? "sales.view" : "purchase.view"; const context = await requirePermission(permission, scope);
    const [record, history] = await Promise.all([
      prisma.stockReturn.findFirst({ where: { id, companyId: context.company.id }, include: { branch: true, warehouse: true, customer: true, supplier: true, salesInvoice: true, purchaseReceipt: true, preparedBy: { select: { id: true, fullName: true } }, approvedBy: { select: { id: true, fullName: true } }, postedBy: { select: { id: true, fullName: true } }, journalEntry: { select: { id: true, voucherNumber: true, status: true } }, lines: { include: { product: { include: { unit: true } }, variant: true, sourceSalesLine: true, sourceReceiptLine: true, units: { include: { stockUnit: { include: { identifiers: true } } } } }, orderBy: { lineNumber: "asc" } } } }),
      prisma.auditLog.findMany({ where: { companyId: context.company.id, entityType: "StockReturn", entityId: id }, select: { id: true, action: true, outcome: true, createdAt: true, metadata: true, actor: { select: { fullName: true } } }, orderBy: { createdAt: "desc" } }),
    ]);
    return NextResponse.json(jsonSafe({ data: { ...record, history } }));
  } catch (error) { return apiError(error); }
}
