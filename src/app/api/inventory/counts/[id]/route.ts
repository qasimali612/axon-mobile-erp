import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { recordStockCount, stockCountInclude } from "@/lib/operations/stock-count";
import { stockCountRecordSchema } from "@/lib/operations/validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";
type RouteContext = { params: Promise<{ id: string }> };
async function scope(id:string){const base=await requireAuth();const row=await prisma.stockCount.findFirst({where:{id,companyId:base.company.id},select:{branchId:true,warehouseId:true}});if(!row)throw new ApiError(404,"STOCK_COUNT_NOT_FOUND","Stock count was not found.");return row;}
export async function GET(_request:Request,{params}:RouteContext){try{const id=idSchema.parse((await params).id);const row=await scope(id);const context=await requirePermission("inventory.stock.view",row);const data=await prisma.stockCount.findFirst({where:{id,companyId:context.company.id},include:stockCountInclude});return NextResponse.json(jsonSafe({data}));}catch(error){return apiError(error);}}
export async function PATCH(request:Request,{params}:RouteContext){try{assertSameOrigin(request);const id=idSchema.parse((await params).id);const row=await scope(id);const context=await requirePermission("inventory.stocktake.manage",row);const body=stockCountRecordSchema.parse(await request.json());const data=await recordStockCount({companyId:context.company.id,userId:context.user.id,currencyCode:context.company.currencyCode},id,body);return NextResponse.json(jsonSafe({data}));}catch(error){return apiError(error);}}
