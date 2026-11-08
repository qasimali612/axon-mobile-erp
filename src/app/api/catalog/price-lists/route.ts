import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { priceListMasterSchema } from "@/lib/catalog/pricing-validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET() {
  try {
    const context = await requirePermission("catalog.pricelist.view");
    const data = await prisma.priceList.findMany({
      where: { companyId: context.company.id },
      include: {
        _count: { select: { items: true, customers: true, salesInvoices: true } },
      },
      orderBy: [{ isDefault: "desc" }, { isActive: "desc" }, { code: "asc" }],
    });
    return NextResponse.json(jsonSafe({ data }));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("catalog.pricelist.create");
    const input = priceListMasterSchema.parse(await request.json());
    const created = await prisma.$transaction(async (tx) => {
      const variantIds = [...new Set((input.items || []).map((item) => item.variantId))];
      if (variantIds.length) {
        const variants = await tx.productVariant.findMany({ where: { id: { in: variantIds }, companyId: context.company.id, isActive: true }, select: { id: true } });
        if (variants.length !== variantIds.length) throw new ApiError(422, "INVALID_PRICE_LIST_VARIANT", "Every price list line must reference an active variant in this company.");
      }
      if (input.isDefault) await tx.priceList.updateMany({ where: { companyId: context.company.id, isDefault: true }, data: { isDefault: false } });
      const list = await tx.priceList.create({
        data: {
          companyId: context.company.id,
          code: input.code,
          name: input.name,
          priceLevel: input.priceLevel,
          currencyCode: input.currencyCode,
          isDefault: input.isDefault,
          isActive: input.isActive,
          effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
          effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
          notes: input.notes || null,
          items: {
            create: (input.items || []).map((item) => ({
              variantId: item.variantId,
              price: new Prisma.Decimal(item.price),
              minimumPrice: item.minimumPrice ? new Prisma.Decimal(item.minimumPrice) : null,
            })),
          },
        },
        include: { _count: { select: { items: true, customers: true, salesInvoices: true } } },
      });
      await appendAudit({ companyId: context.company.id, actorId: context.user.id, branchId: context.activeBranchId, action: "PRICE_LIST_CREATED", module: "catalog", entityType: "PriceList", entityId: list.id, entityReference: list.code, newValues: { code: list.code, name: list.name, priceLevel: list.priceLevel, isDefault: list.isDefault, items: (input.items || []).length } }, tx);
      return list;
    });
    return NextResponse.json(jsonSafe({ data: created }), { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(new ApiError(409, "DUPLICATE_PRICE_LIST", "A price list with this code or name already exists in this company."));
    return apiError(error);
  }
}
