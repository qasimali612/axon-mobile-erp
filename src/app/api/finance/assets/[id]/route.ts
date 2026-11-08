import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { updateFixedAssetDraft } from "@/lib/finance/assets";
import { fixedAssetSchema } from "@/lib/finance/asset-validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const id = idSchema.parse((await params).id);
    const context = await requirePermission("ASSET_VIEW");
    const asset = await prisma.fixedAsset.findFirst({
      where: { id, companyId: context.company.id },
      include: {
        category: true, branch: { select: { code: true, name: true } }, department: { select: { code: true, name: true } },
        custodian: { select: { fullName: true } }, supplier: { select: { code: true, name: true } },
        disposal: { include: { journalEntry: { select: { id: true, voucherNumber: true } } } },
        schedules: { orderBy: { periodDate: "desc" }, include: { journalEntry: { select: { id: true, voucherNumber: true, status: true } } } },
        transactions: { orderBy: { transactionDate: "desc" }, include: { journalEntry: { select: { id: true, voucherNumber: true } }, createdBy: { select: { fullName: true } } } },
      },
    });
    if (!asset) throw new ApiError(404, "FIXED_ASSET_NOT_FOUND", "Fixed asset was not found.");
    return NextResponse.json(jsonSafe({ data: asset }));
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const id = idSchema.parse((await params).id);
    const context = await requirePermission("ASSET_CREATE");
    const input = fixedAssetSchema.parse(await request.json());
    const updated = await updateFixedAssetDraft(
      { companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode },
      id,
      { ...input, depreciationStartDate: input.depreciationStartDate || null, depreciationRate: input.depreciationRate || null },
    );
    return NextResponse.json(jsonSafe({ data: updated }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(new ApiError(409, "DUPLICATE_ASSET_CODE", "A fixed asset with this code already exists in this company."));
    return apiError(error);
  }
}
