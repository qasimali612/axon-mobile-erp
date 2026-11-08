import { NextResponse } from "next/server";
import { LocationType, Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requireAuth, requirePermission } from "@/lib/auth";
import { warehouseLocationSchema } from "@/lib/catalog/master-validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";
type RouteContext = { params: Promise<{ id: string }> };
const parentType: Partial<Record<LocationType, LocationType>> = { RACK: LocationType.ZONE, SHELF: LocationType.RACK, BIN: LocationType.SHELF };
async function warehouseScope(id: string) { const base = await requireAuth(); const warehouse = await prisma.warehouse.findFirst({ where: { id, companyId: base.company.id, archivedAt: null }, select: { id: true, branchId: true, companyId: true, code: true, name: true } }); if (!warehouse) throw new ApiError(404, "WAREHOUSE_NOT_FOUND", "Warehouse was not found."); return warehouse; }
export async function GET(_request: Request, { params }: RouteContext) {
  try { const id = idSchema.parse((await params).id); const warehouse = await warehouseScope(id); await requirePermission("organization.warehouse.view", { branchId: warehouse.branchId, warehouseId: id }); const data = await prisma.warehouseLocation.findMany({ where: { warehouseId: id }, include: { parent: { select: { id: true, code: true, name: true, type: true } }, _count: { select: { children: true, currentStockUnits: true } } }, orderBy: [{ sequence: "asc" }, { code: "asc" }] }); return NextResponse.json(jsonSafe({ data, meta: { warehouse } })); } catch (error) { return apiError(error); }
}
export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request); const id = idSchema.parse((await params).id); const warehouse = await warehouseScope(id); const context = await requirePermission("organization.warehouse.edit", { branchId: warehouse.branchId, warehouseId: id }); const input = warehouseLocationSchema.parse(await request.json());
    const created = await prisma.$transaction(async (tx) => {
      if (input.type === LocationType.ZONE && input.parentId) throw new ApiError(422, "ZONE_PARENT_FORBIDDEN", "A zone is a top-level location and cannot have a parent.");
      if (input.type !== LocationType.ZONE) { if (!input.parentId) throw new ApiError(422, "INVALID_LOCATION_PARENT", `${input.type} requires an active ${parentType[input.type]} parent in the same warehouse.`); const parent = await tx.warehouseLocation.findFirst({ where: { id: input.parentId, warehouseId: id, isActive: true } }); if (!parent || parent.type !== parentType[input.type]) throw new ApiError(422, "INVALID_LOCATION_PARENT", `${input.type} requires an active ${parentType[input.type]} parent in the same warehouse.`); }
      if (input.barcode) { const duplicate = await tx.warehouseLocation.findFirst({ where: { barcode: input.barcode, warehouse: { companyId: context.company.id } }, select: { id: true } }); if (duplicate) throw new ApiError(409, "DUPLICATE_LOCATION_BARCODE", "Location barcode already exists in this company."); }
      const row = await tx.warehouseLocation.create({ data: { warehouseId: id, parentId: input.parentId || null, code: input.code, name: input.name, type: input.type, barcode: input.barcode || null, sequence: input.sequence, isQuarantine: input.isQuarantine, isActive: input.isActive } });
      await appendAudit({ companyId: context.company.id, actorId: context.user.id, branchId: warehouse.branchId, warehouseId: id, action: "WAREHOUSE_LOCATION_CREATED", module: "organization", entityType: "WarehouseLocation", entityId: row.id, entityReference: `${warehouse.code}/${row.code}`, newValues: input }, tx); return row;
    });
    return NextResponse.json(jsonSafe({ data: created }), { status: 201 });
  } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(new ApiError(409, "DUPLICATE_LOCATION", "Location code already exists in this warehouse.")); return apiError(error); }
}
