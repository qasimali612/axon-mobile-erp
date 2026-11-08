import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { reverseStockAdjustment } from "@/lib/operations/stock-adjustment";
import { operationReversalSchema } from "@/lib/operations/validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";
type RouteContext = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: RouteContext) { try { assertSameOrigin(request); const base=await requireAuth(); const id=idSchema.parse((await params).id); const body=operationReversalSchema.parse(await request.json()); const row=await prisma.stockAdjustment.findFirst({where:{id,companyId:base.company.id},select:{branchId:true,warehouseId:true}}); if(!row) throw new ApiError(404,"ADJUSTMENT_NOT_FOUND","Stock adjustment was not found."); const context=await requirePermission("inventory.stock.approve_adjustment",row); const data=await reverseStockAdjustment({companyId:context.company.id,userId:context.user.id,currencyCode:context.company.currencyCode},id,body); return NextResponse.json(jsonSafe({data}),{status:201}); } catch(error){return apiError(error);} }
