import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { brandMasterSchema, categoryMasterSchema, unitMasterSchema } from "@/lib/catalog/master-validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";
type MasterType = "category" | "brand" | "unit";
type RouteContext = { params: Promise<{ type: string; id: string }> };
function masterType(value: string): MasterType { if (value === "category" || value === "brand" || value === "unit") return value; throw new ApiError(404, "MASTER_NOT_FOUND", "Catalog master type was not found."); }
async function assertCategoryParent(tx: Prisma.TransactionClient, companyId: string, id: string, parentId: string | null) {
  let cursor = parentId; const visited = new Set<string>();
  while (cursor) {
    if (cursor === id || visited.has(cursor)) throw new ApiError(422, "CATEGORY_CYCLE", "A category cannot be its own ancestor.");
    visited.add(cursor);
    const parent = await tx.productCategory.findFirst({ where: { id: cursor, companyId }, select: { parentId: true, isActive: true } });
    if (!parent || !parent.isActive) throw new ApiError(422, "INVALID_CATEGORY_PARENT", "Select an active parent category in this company.");
    cursor = parent.parentId;
  }
}
export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const route = await params; const type = masterType(route.type); const id = idSchema.parse(route.id); const raw = await request.json();
    const active = typeof raw?.isActive === "boolean" ? raw.isActive : true;
    const context = await requirePermission(active ? "catalog.product.edit" : "catalog.product.archive");
    const updated = await prisma.$transaction(async (tx) => {
      let row: { id: string; code: string; name: string; isActive: boolean };
      if (type === "category") {
        const existing = await tx.productCategory.findFirst({ where: { id, companyId: context.company.id }, include: { _count: { select: { products: { where: { status: "ACTIVE" } }, children: { where: { isActive: true } } } } } });
        if (!existing) throw new ApiError(404, "CATEGORY_NOT_FOUND", "Category was not found.");
        const input = categoryMasterSchema.parse(raw); await assertCategoryParent(tx, context.company.id, id, input.parentId || null);
        if (!input.isActive && (existing._count.products || existing._count.children)) throw new ApiError(409, "CATEGORY_IN_USE", "Archive active products and child categories before deactivating this category.");
        row = await tx.productCategory.update({ where: { id }, data: { code: input.code, name: input.name, parentId: input.parentId || null, description: input.description || null, isActive: input.isActive } });
      } else if (type === "brand") {
        const existing = await tx.brand.findFirst({ where: { id, companyId: context.company.id }, include: { _count: { select: { products: { where: { status: "ACTIVE" } } } } } });
        if (!existing) throw new ApiError(404, "BRAND_NOT_FOUND", "Brand was not found."); const input = brandMasterSchema.parse(raw);
        if (!input.isActive && existing._count.products) throw new ApiError(409, "BRAND_IN_USE", "Archive or reassign active products before deactivating this brand.");
        row = await tx.brand.update({ where: { id }, data: { code: input.code, name: input.name, logoUrl: input.logoUrl || null, isActive: input.isActive } });
      } else {
        const existing = await tx.unitOfMeasure.findFirst({ where: { id, companyId: context.company.id }, include: { _count: { select: { products: { where: { status: "ACTIVE" } } } } } });
        if (!existing) throw new ApiError(404, "UNIT_NOT_FOUND", "Unit of measure was not found."); const input = unitMasterSchema.parse(raw);
        if (!input.isActive && existing._count.products) throw new ApiError(409, "UNIT_IN_USE", "Archive or reassign active products before deactivating this unit.");
        if (input.decimalPlaces !== existing.decimalPlaces && existing._count.products) throw new ApiError(409, "UNIT_PRECISION_IN_USE", "Unit precision cannot change while products use this unit.");
        row = await tx.unitOfMeasure.update({ where: { id }, data: { code: input.code, name: input.name, decimalPlaces: input.decimalPlaces, isActive: input.isActive } });
      }
      await appendAudit({ companyId: context.company.id, actorId: context.user.id, branchId: context.activeBranchId, action: `CATALOG_${type.toUpperCase()}_UPDATED`, module: "catalog", entityType: type === "category" ? "ProductCategory" : type === "brand" ? "Brand" : "UnitOfMeasure", entityId: id, entityReference: row.code, newValues: raw }, tx);
      return row;
    });
    return NextResponse.json(jsonSafe({ data: updated }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(new ApiError(409, "DUPLICATE_MASTER", "Code or name already exists in this company."));
    return apiError(error);
  }
}
