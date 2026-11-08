import { NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { generateDepreciation } from "@/lib/finance/assets";
import { depreciationGenerateSchema } from "@/lib/finance/asset-validation";
import { jsonSafe } from "@/lib/serializers";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("ASSET_CREATE");
    const input = depreciationGenerateSchema.parse(await request.json());
    const result = await generateDepreciation({ companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode }, input);
    return NextResponse.json(jsonSafe({ data: result }));
  } catch (error) { return apiError(error); }
}
