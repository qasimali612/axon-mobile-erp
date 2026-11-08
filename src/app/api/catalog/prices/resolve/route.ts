import { NextResponse } from "next/server";
import { ApiError, apiError } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";
import { resolveSalesPriceList } from "@/lib/catalog/pricing";

/** Server-authoritative price lookup used by POS and invoice entry. */
export async function GET(request: Request) {
  try {
    const context = await requirePermission("catalog.pricelist.view");
    const params = new URL(request.url).searchParams;
    const customerId = idSchema.parse(params.get("customerId"));
    const variantId = idSchema.parse(params.get("variantId"));
    const explicitListId = params.get("priceListId");
    const onDate = params.get("date") ? new Date(`${params.get("date")}T00:00:00.000Z`) : new Date();
    if (Number.isNaN(onDate.getTime())) throw new ApiError(422, "INVALID_DATE", "Use the YYYY-MM-DD format for the price date.");

    const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId: context.company.id, status: "ACTIVE" }, select: { id: true, priceListId: true } });
    if (!customer) throw new ApiError(404, "CUSTOMER_NOT_FOUND", "The selected active customer was not found.");
    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, companyId: context.company.id, isActive: true },
      select: { id: true, sku: true, name: true, retailPrice: true, wholesalePrice: true, minimumSellingPrice: true, product: { select: { status: true } } },
    });
    if (!variant) throw new ApiError(404, "VARIANT_NOT_FOUND", "The selected active product variant was not found.");
    if (variant.product.status !== "ACTIVE") throw new ApiError(409, "PRODUCT_INACTIVE", "The product variant belongs to an inactive product.");

    const list = await resolveSalesPriceList(prisma, {
      companyId: context.company.id,
      customerId,
      priceListId: explicitListId ? idSchema.parse(explicitListId) : null,
      onDate,
    });
    const item = list ? await prisma.priceListItem.findUnique({ where: { priceListId_variantId: { priceListId: list.id, variantId } } }) : null;
    const price = item?.price ?? variant.retailPrice;
    const minimumPrice = item?.minimumPrice ?? variant.minimumSellingPrice;
    return NextResponse.json(jsonSafe({
      data: {
        priceListId: list?.id ?? null,
        priceListCode: list?.code ?? null,
        priceListName: list?.name ?? null,
        source: item ? "PRICE_LIST" : "VARIANT",
        variantId,
        sku: variant.sku,
        price,
        minimumPrice,
        retailPrice: variant.retailPrice,
        wholesalePrice: variant.wholesalePrice,
      },
    }));
  } catch (error) { return apiError(error); }
}
