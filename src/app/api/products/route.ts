import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { apiError, ApiError, assertSameOrigin, parsePagination } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { productSchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const context = await requirePermission("catalog.product.view");
    const { page, pageSize, skip, params } = parsePagination(request.url);
    const search = params.get("search")?.trim();
    const tracking = params.get("tracking");
    const status = params.get("status") || "ACTIVE";
    const categoryId = params.get("categoryId");
    const brandId = params.get("brandId");

    const where: Prisma.ProductWhereInput = {
      companyId: context.company.id,
      ...(status !== "ALL" ? { status: status as Prisma.EnumProductStatusFilter } : {}),
      ...(tracking ? { trackingMethod: tracking as Prisma.EnumTrackingMethodFilter } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(brandId ? { brandId } : {}),
      ...(search
        ? {
            OR: [
              { sku: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
              { model: { contains: search, mode: "insensitive" } },
              { variants: { some: { sku: { contains: search, mode: "insensitive" } } } },
              { barcodes: { some: { barcode: { contains: search } } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          brand: true,
          category: true,
          unit: true,
          variants: { orderBy: { createdAt: "asc" } },
          barcodes: true,
        },
        orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
        skip,
        take: pageSize,
      }),
      prisma.product.count({ where }),
    ]);

    return NextResponse.json(jsonSafe({ data: items, meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) } }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("catalog.product.create");
    const input = productSchema.parse(await request.json());

    const [category, brand, unit] = await Promise.all([
      prisma.productCategory.findFirst({ where: { id: input.categoryId, companyId: context.company.id, isActive: true } }),
      input.brandId
        ? prisma.brand.findFirst({ where: { id: input.brandId, companyId: context.company.id, isActive: true } })
        : Promise.resolve(null),
      prisma.unitOfMeasure.findFirst({ where: { id: input.unitId, companyId: context.company.id, isActive: true } }),
    ]);
    if (!category || !unit || (input.brandId && !brand)) {
      throw new ApiError(422, "INVALID_REFERENCE", "Category, brand, or unit is not available in this company.");
    }

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          companyId: context.company.id,
          categoryId: input.categoryId,
          brandId: input.brandId || null,
          unitId: input.unitId,
          createdById: context.user.id,
          sku: input.sku,
          name: input.name,
          model: input.model || null,
          modelCode: input.modelCode || null,
          productType: input.productType,
          trackingMethod: input.trackingMethod,
          costingMethod: input.costingMethod,
          standardPurchasePrice: input.standardPurchasePrice,
          reorderLevel: input.reorderLevel,
          maxStockLevel: input.maxStockLevel ?? "0",
          preferredSupplierId: input.preferredSupplierId || null,
          description: input.description || null,
          variants: {
            create: {
              companyId: context.company.id,
              sku: input.variant.sku,
              name: input.variant.name,
              color: input.variant.color || null,
              ramGb: input.variant.ramGb || null,
              storageGb: input.variant.storageGb || null,
              networkType: input.variant.networkType || null,
              simConfiguration: input.variant.simConfiguration || null,
              regionVariant: input.variant.regionVariant || null,
              purchasePrice: input.variant.purchasePrice,
              wholesalePrice: input.variant.wholesalePrice,
              retailPrice: input.variant.retailPrice,
              minimumSellingPrice: input.variant.minimumSellingPrice,
            },
          },
        },
        include: { variants: true, brand: true, category: true, unit: true },
      });

      if (input.variant.barcode) {
        await tx.productBarcode.create({
          data: {
            companyId: context.company.id,
            productId: created.id,
            variantId: created.variants[0].id,
            barcode: input.variant.barcode,
            isPrimary: true,
            type: input.variant.barcode.length === 13 ? "EAN13" : "CODE128",
          },
        });
      }

      await appendAudit(
        {
          companyId: context.company.id,
          actorId: context.user.id,
          branchId: context.activeBranchId,
          warehouseId: context.activeWarehouseId,
          action: "PRODUCT_CREATED",
          module: "catalog",
          entityType: "Product",
          entityId: created.id,
          entityReference: created.sku,
          newValues: input,
          ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
          userAgent: request.headers.get("user-agent")?.slice(0, 500),
        },
        tx,
      );
      return created;
    });

    return NextResponse.json(jsonSafe({ data: product }), { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(new ApiError(409, "DUPLICATE_IDENTIFIER", "SKU or barcode already exists in this company.", error.meta));
    }
    return apiError(error);
  }
}
