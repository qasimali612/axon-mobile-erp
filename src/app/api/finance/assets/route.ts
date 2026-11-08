import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { permittedBranchIds, requirePermission } from "@/lib/auth";
import { createFixedAssetDraft } from "@/lib/finance/assets";
import { fixedAssetSchema } from "@/lib/finance/asset-validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    const context = await requirePermission("ASSET_VIEW");
    const branches = permittedBranchIds(context, "ASSET_VIEW");
    const params = new URL(request.url).searchParams;
    const status = params.get("status") || undefined;
    const search = params.get("search")?.trim() || undefined;
    const data = await prisma.fixedAsset.findMany({
      where: {
        companyId: context.company.id,
        ...(branches ? { branchId: { in: branches } } : {}),
        ...(status ? { status: status as never } : {}),
        ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" as const } }, { name: { contains: search, mode: "insensitive" as const } }, { serialNumber: { contains: search, mode: "insensitive" as const } }] } : {}),
      },
      include: {
        category: { select: { code: true, name: true } },
        branch: { select: { code: true, name: true } },
        custodian: { select: { fullName: true } },
        disposal: { select: { id: true, disposalDate: true, gainOrLoss: true } },
        schedules: { where: { status: "PLANNED" }, select: { id: true, periodDate: true, depreciationAmount: true } },
      },
      orderBy: [{ status: "asc" }, { code: "asc" }],
      take: 500,
    });
    const [categories, branchesList, members, accounts] = await Promise.all([
      prisma.assetCategory.findMany({ where: { companyId: context.company.id, isActive: true }, select: { id: true, code: true, name: true, depreciable: true, defaultMethod: true, defaultUsefulLifeMonths: true, defaultRate: true }, orderBy: { code: "asc" } }),
      prisma.branch.findMany({ where: { companyId: context.company.id, isActive: true, ...(branches ? { id: { in: branches } } : {}) }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
      prisma.companyMembership.findMany({ where: { companyId: context.company.id, status: "ACTIVE", user: { status: "ACTIVE" } }, select: { user: { select: { id: true, fullName: true } } }, orderBy: { user: { fullName: "asc" } } }),
      prisma.account.findMany({ where: { companyId: context.company.id, isActive: true }, select: { id: true, code: true, name: true, accountClass: true, accountType: true }, orderBy: { code: "asc" } }),
    ]);
    const suppliers = await prisma.supplier.findMany({ where: { companyId: context.company.id, status: "ACTIVE" }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" }, take: 500 });
    return NextResponse.json(jsonSafe({ data, lookups: { categories, branches: branchesList, users: members.map((membership) => membership.user), accounts, suppliers } }));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("ASSET_CREATE");
    const input = fixedAssetSchema.parse(await request.json());
    await requirePermission("ASSET_CREATE", { branchId: input.branchId });
    const created = await createFixedAssetDraft(
      { companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode },
      { ...input, depreciationStartDate: input.depreciationStartDate || null, depreciationRate: input.depreciationRate || null },
    );
    return NextResponse.json(jsonSafe({ data: created }), { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(new ApiError(409, "DUPLICATE_ASSET_CODE", "A fixed asset with this code already exists in this company."));
    return apiError(error);
  }
}
