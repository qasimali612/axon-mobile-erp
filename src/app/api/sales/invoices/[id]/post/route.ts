import { NextResponse } from "next/server";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { postSalesInvoice } from "@/lib/operations/sales";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";
type RouteContext = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: RouteContext) { try { assertSameOrigin(request); const base = await requireAuth(); const id = idSchema.parse((await params).id); const record = await prisma.salesInvoice.findFirst({ where: { id, companyId: base.company.id }, select: { branchId: true, warehouseId: true } }); if (!record) throw new ApiError(404, "SALES_INVOICE_NOT_FOUND", "Sales invoice was not found."); const context = await requirePermission("SALES_INVOICE_POST", record); const data = await postSalesInvoice({ companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode, permissions: context.permissions }, id); return NextResponse.json(jsonSafe({ data })); } catch (error) { return apiError(error); } }
