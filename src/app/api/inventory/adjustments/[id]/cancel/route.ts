import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { cancelStockAdjustment } from "@/lib/operations/stock-adjustment";
import { stockTransferCancellationSchema } from "@/lib/operations/validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";
type RouteContext = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: RouteContext) { try { assertSameOrigin(request); const base=await requireAuth(); const id=idSchema.parse((await params).id); const body=stockTransferCancellationSchema.parse(await request.json()); const row=await prisma.stockAdjustment.findFirst({where:{id,companyId:base.company.id},select:{status:true,preparedById:true,branchId:true,warehouseId:true}}); if(!row) throw new ApiError(404,"ADJUSTMENT_NOT_FOUND","Stock adjustment was not found."); const permission=row.status==="DRAFT"&&row.preparedById===base.user.id?"inventory.stock.adjust":"inventory.stock.approve_adjustment"; const context=await requirePermission(permission,row); const data=await cancelStockAdjustment({companyId:context.company.id,userId:context.user.id,currencyCode:context.company.currencyCode},id,body.reason); return NextResponse.json(jsonSafe({data})); } catch(error){return apiError(error);} }
