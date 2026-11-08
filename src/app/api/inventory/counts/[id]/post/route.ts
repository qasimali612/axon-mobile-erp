import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { postStockCount } from "@/lib/operations/stock-count";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";
type RouteContext={params:Promise<{id:string}>};
export async function POST(request:Request,{params}:RouteContext){try{assertSameOrigin(request);const base=await requireAuth();const id=idSchema.parse((await params).id);const row=await prisma.stockCount.findFirst({where:{id,companyId:base.company.id},select:{branchId:true,warehouseId:true}});if(!row)throw new ApiError(404,"STOCK_COUNT_NOT_FOUND","Stock count was not found.");const context=await requirePermission("inventory.stocktake.post",row);const data=await postStockCount({companyId:context.company.id,userId:context.user.id,currencyCode:context.company.currencyCode},id);return NextResponse.json(jsonSafe({data}));}catch(error){return apiError(error);}}
