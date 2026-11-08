import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { submitStockAdjustment } from "@/lib/operations/stock-adjustment";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";
type RouteContext = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: RouteContext) { try { assertSameOrigin(request); const base=await requireAuth(); const id=idSchema.parse((await params).id); const row=await prisma.stockAdjustment.findFirst({where:{id,companyId:base.company.id},select:{branchId:true,warehouseId:true}}); if(!row) throw new ApiError(404,"ADJUSTMENT_NOT_FOUND","Stock adjustment was not found."); const context=await requirePermission("inventory.stock.adjust",row); const data=await submitStockAdjustment({companyId:context.company.id,userId:context.user.id,currencyCode:context.company.currencyCode},id); return NextResponse.json(jsonSafe({data})); } catch(error){return apiError(error);} }
