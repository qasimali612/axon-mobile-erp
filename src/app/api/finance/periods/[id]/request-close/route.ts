import { NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requireCompanyPermission } from "@/lib/auth";
import { requestPeriodClose } from "@/lib/finance/periods";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext={params:Promise<{id:string}>};
export async function POST(request:Request,{params}:RouteContext){try{assertSameOrigin(request);const context=await requireCompanyPermission("PERIOD_CLOSE_REQUEST");const id=idSchema.parse((await params).id);const data=await requestPeriodClose({companyId:context.company.id,userId:context.user.id},id);return NextResponse.json(jsonSafe({data}));}catch(error){return apiError(error);}}
