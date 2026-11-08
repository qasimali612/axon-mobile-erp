import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { brandMasterSchema, categoryMasterSchema, unitMasterSchema } from "@/lib/catalog/master-validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

type MasterType = "category" | "brand" | "unit";
function masterType(value: string | null): MasterType { if (value === "category" || value === "brand" || value === "unit") return value; throw new ApiError(422, "INVALID_MASTER_TYPE", "Master type must be category, brand, or unit."); }
export async function GET(request: Request) {
  try {
    const context = await requirePermission("catalog.product.view");
    const type = masterType(new URL(request.url).searchParams.get("type"));
    const data = type === "category"
      ? await prisma.productCategory.findMany({ where: { companyId: context.company.id }, include: { parent: { select: { id: true, code: true, name: true } }, _count: { select: { products: true, children: true } } }, orderBy: [{ isActive: "desc" }, { code: "asc" }] })
      : type === "brand"
        ? await prisma.brand.findMany({ where: { companyId: context.company.id }, include: { _count: { select: { products: true } } }, orderBy: [{ isActive: "desc" }, { code: "asc" }] })
        : await prisma.unitOfMeasure.findMany({ where: { companyId: context.company.id }, include: { _count: { select: { products: true } } }, orderBy: [{ isActive: "desc" }, { code: "asc" }] });
    return NextResponse.json(jsonSafe({ data }));
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("catalog.product.create");
    const type = masterType(new URL(request.url).searchParams.get("type"));
    const raw = await request.json();
    const created = await prisma.$transaction(async (tx) => {
      let row: { id: string; code: string; name: string };
      if (type === "category") {
        const input = categoryMasterSchema.parse(raw);
        if (input.parentId) {
          const parent = await tx.productCategory.findFirst({ where: { id: input.parentId, companyId: context.company.id, isActive: true } });
          if (!parent) throw new ApiError(422, "INVALID_CATEGORY_PARENT", "Select an active parent category in this company.");
        }
        row = await tx.productCategory.create({ data: { companyId: context.company.id, code: input.code, name: input.name, parentId: input.parentId || null, description: input.description || null, isActive: input.isActive } });
      } else if (type === "brand") {
        const input = brandMasterSchema.parse(raw);
        row = await tx.brand.create({ data: { companyId: context.company.id, code: input.code, name: input.name, logoUrl: input.logoUrl || null, isActive: input.isActive } });
      } else {
        const input = unitMasterSchema.parse(raw);
        row = await tx.unitOfMeasure.create({ data: { companyId: context.company.id, code: input.code, name: input.name, decimalPlaces: input.decimalPlaces, isActive: input.isActive } });
      }
      await appendAudit({ companyId: context.company.id, actorId: context.user.id, branchId: context.activeBranchId, action: `CATALOG_${type.toUpperCase()}_CREATED`, module: "catalog", entityType: type === "category" ? "ProductCategory" : type === "brand" ? "Brand" : "UnitOfMeasure", entityId: row.id, entityReference: row.code, newValues: raw }, tx);
      return row;
    });
    return NextResponse.json(jsonSafe({ data: created }), { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(new ApiError(409, "DUPLICATE_MASTER", "Code or name already exists in this company."));
    return apiError(error);
  }
}
