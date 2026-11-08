import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { updateAssetCategory } from "@/lib/finance/assets";
import { assetCategorySchema } from "@/lib/finance/asset-validation";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const id = idSchema.parse((await params).id);
    const context = await requirePermission("ASSET_CATEGORY_MANAGE");
    const input = assetCategorySchema.parse(await request.json());
    const updated = await updateAssetCategory({ companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode }, id, { ...input, defaultRate: input.defaultRate || null });
    return NextResponse.json(jsonSafe({ data: updated }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(new ApiError(409, "DUPLICATE_ASSET_CATEGORY", "An asset category with this code already exists in this company."));
    return apiError(error);
  }
}
