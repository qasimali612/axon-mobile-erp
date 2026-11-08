import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requireCompanyPermission } from "@/lib/auth";
import { reopenPeriod } from "@/lib/finance/periods";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext={params:Promise<{id:string}>};
const schema=z.object({reason:z.string().trim().min(10).max(1000)});
export async function POST(request:Request,{params}:RouteContext){try{assertSameOrigin(request);const context=await requireCompanyPermission("PERIOD_REOPEN");const id=idSchema.parse((await params).id);const {reason}=schema.parse(await request.json());const data=await reopenPeriod({companyId:context.company.id,userId:context.user.id},id,reason);return NextResponse.json(jsonSafe({data}));}catch(error){return apiError(error);}}
