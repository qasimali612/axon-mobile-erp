import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { createAssetCategory } from "@/lib/finance/assets";
import { assetCategorySchema } from "@/lib/finance/asset-validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET() {
  try {
    const context = await requirePermission("ASSET_VIEW");
    const data = await prisma.assetCategory.findMany({
      where: { companyId: context.company.id },
      include: { _count: { select: { assets: true } }, assetAccount: { select: { code: true, name: true } }, accumulatedAccount: { select: { code: true, name: true } }, expenseAccount: { select: { code: true, name: true } }, disposalAccount: { select: { code: true, name: true } } },
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
    });
    const accounts = await prisma.account.findMany({ where: { companyId: context.company.id, isActive: true }, select: { id: true, code: true, name: true, accountClass: true }, orderBy: { code: "asc" } });
    return NextResponse.json(jsonSafe({ data, lookups: { accounts } }));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("ASSET_CATEGORY_MANAGE");
    const input = assetCategorySchema.parse(await request.json());
    const created = await createAssetCategory({ companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode }, { ...input, defaultRate: input.defaultRate || null });
    return NextResponse.json(jsonSafe({ data: created }), { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(new ApiError(409, "DUPLICATE_ASSET_CATEGORY", "An asset category with this code already exists in this company."));
    return apiError(error);
  }
}
