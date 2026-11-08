import { NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { capitalizeFixedAsset } from "@/lib/finance/assets";
import { capitalizationSchema } from "@/lib/finance/asset-validation";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const id = idSchema.parse((await params).id);
    const context = await requirePermission("ASSET_CREATE");
    const input = capitalizationSchema.parse(await request.json());
    const result = await capitalizeFixedAsset({ companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode }, id, input);
    return NextResponse.json(jsonSafe({ data: { asset: result.asset, journal: { id: result.journal.id, voucherNumber: result.journal.voucherNumber } } }));
  } catch (error) { return apiError(error); }
}
