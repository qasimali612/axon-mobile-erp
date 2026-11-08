import { NextResponse } from "next/server";
import { StockReturnType } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { submitStockReturn } from "@/lib/operations/stock-return";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";
type RouteContext = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: RouteContext) { try { assertSameOrigin(request); const base = await requireAuth(); const id = idSchema.parse((await params).id); const record = await prisma.stockReturn.findFirst({ where: { id, companyId: base.company.id }, select: { branchId: true, warehouseId: true, returnType: true } }); if (!record) throw new ApiError(404, "RETURN_NOT_FOUND", "Return document was not found."); const permission = record.returnType === StockReturnType.SALES_RETURN ? "SALES_RETURN_CREATE" : "PURCHASE_RETURN_CREATE"; const context = await requirePermission(permission, record); const data = await submitStockReturn({ companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode }, id); return NextResponse.json(jsonSafe({ data })); } catch (error) { return apiError(error); } }
