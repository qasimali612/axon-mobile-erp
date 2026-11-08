import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { priceListMasterSchema } from "@/lib/catalog/pricing-validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const id = idSchema.parse((await params).id);
    const context = await requirePermission("catalog.pricelist.view");
    const data = await prisma.priceList.findFirst({
      where: { id, companyId: context.company.id },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
          include: { variant: { select: { id: true, sku: true, name: true, retailPrice: true, minimumSellingPrice: true, isActive: true } } },
        },
        _count: { select: { customers: true, salesInvoices: true } },
      },
    });
    if (!data) throw new ApiError(404, "PRICE_LIST_NOT_FOUND", "Price list was not found.");
    return NextResponse.json(jsonSafe({ data }));
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const id = idSchema.parse((await params).id);
    const context = await requirePermission("catalog.pricelist.edit");
    const input = priceListMasterSchema.parse(await request.json());
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.priceList.findFirst({ where: { id, companyId: context.company.id } });
      if (!current) throw new ApiError(404, "PRICE_LIST_NOT_FOUND", "Price list was not found.");
      const variantIds = [...new Set((input.items || []).map((item) => item.variantId))];
      if (variantIds.length) {
        const variants = await tx.productVariant.findMany({ where: { id: { in: variantIds }, companyId: context.company.id, isActive: true }, select: { id: true } });
        if (variants.length !== variantIds.length) throw new ApiError(422, "INVALID_PRICE_LIST_VARIANT", "Every price list line must reference an active variant in this company.");
      }
      if (input.isDefault && !current.isDefault) await tx.priceList.updateMany({ where: { companyId: context.company.id, isDefault: true, id: { not: id } }, data: { isDefault: false } });
      if (input.items) {
        await tx.priceListItem.deleteMany({ where: { priceListId: id } });
        await tx.priceListItem.createMany({
          data: input.items.map((item) => ({
            priceListId: id,
            variantId: item.variantId,
            price: new Prisma.Decimal(item.price),
            minimumPrice: item.minimumPrice ? new Prisma.Decimal(item.minimumPrice) : null,
          })),
        });
      }
      const list = await tx.priceList.update({
        where: { id },
        data: {
          code: input.code,
          name: input.name,
          priceLevel: input.priceLevel,
          currencyCode: input.currencyCode,
          isDefault: input.isDefault,
          isActive: input.isActive,
          effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
          effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
          notes: input.notes || null,
        },
        include: { _count: { select: { items: true, customers: true, salesInvoices: true } } },
      });
      await appendAudit({
        companyId: context.company.id,
        actorId: context.user.id,
        branchId: context.activeBranchId,
        action: "PRICE_LIST_UPDATED",
        module: "catalog",
        entityType: "PriceList",
        entityId: list.id,
        entityReference: list.code,
        newValues: { code: list.code, name: list.name, priceLevel: list.priceLevel, isDefault: list.isDefault, isActive: list.isActive, itemCount: input.items ? input.items.length : undefined },
        previousValues: { code: current.code, name: current.name, isActive: current.isActive, isDefault: current.isDefault },
        metadata: { itemCount: input.items ? input.items.length : undefined },
      }, tx);
      return list;
    });
    return NextResponse.json(jsonSafe({ data: updated }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(new ApiError(409, "DUPLICATE_PRICE_LIST", "A price list with this code or name already exists in this company."));
    if (error instanceof Error && /cannot be deactivated|must stay active|never deleted|cannot change/.test(error.message)) return apiError(new ApiError(409, "PRICE_LIST_IN_USE", error.message));
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P0001") return apiError(new ApiError(409, "PRICE_LIST_IN_USE", error.message));
    return apiError(error);
  }
}
