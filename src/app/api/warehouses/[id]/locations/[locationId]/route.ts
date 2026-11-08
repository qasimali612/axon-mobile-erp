import { NextResponse } from "next/server";
import { LocationType, Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requireAuth, requirePermission } from "@/lib/auth";
import { warehouseLocationSchema } from "@/lib/catalog/master-validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";
type RouteContext = { params: Promise<{ id: string; locationId: string }> };
const parentType: Partial<Record<LocationType, LocationType>> = { RACK: LocationType.ZONE, SHELF: LocationType.RACK, BIN: LocationType.SHELF };
export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request); const route = await params; const warehouseId = idSchema.parse(route.id); const locationId = idSchema.parse(route.locationId); const raw = await request.json(); const base = await requireAuth(); const warehouse = await prisma.warehouse.findFirst({ where: { id: warehouseId, companyId: base.company.id, archivedAt: null }, select: { id: true, code: true, branchId: true } }); if (!warehouse) throw new ApiError(404, "WAREHOUSE_NOT_FOUND", "Warehouse was not found.");
    const context = await requirePermission(raw?.isActive === false ? "organization.warehouse.archive" : "organization.warehouse.edit", { branchId: warehouse.branchId, warehouseId }); const input = warehouseLocationSchema.parse(raw);
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.warehouseLocation.findFirst({ where: { id: locationId, warehouseId }, include: { _count: { select: { children: { where: { isActive: true } }, currentStockUnits: true } } } }); if (!existing) throw new ApiError(404, "LOCATION_NOT_FOUND", "Warehouse location was not found.");
      if (input.parentId === locationId) throw new ApiError(422, "LOCATION_CYCLE", "A location cannot be its own parent.");
      if (input.type === LocationType.ZONE && input.parentId) throw new ApiError(422, "ZONE_PARENT_FORBIDDEN", "A zone cannot have a parent.");
      if (input.type !== LocationType.ZONE) { if (!input.parentId) throw new ApiError(422, "INVALID_LOCATION_PARENT", `${input.type} requires an active ${parentType[input.type]} parent.`); const parent = await tx.warehouseLocation.findFirst({ where: { id: input.parentId, warehouseId, isActive: true } }); if (!parent || parent.type !== parentType[input.type]) throw new ApiError(422, "INVALID_LOCATION_PARENT", `${input.type} requires an active ${parentType[input.type]} parent.`); }
      if ((input.type !== existing.type || input.parentId !== existing.parentId) && existing._count.children) throw new ApiError(409, "LOCATION_HAS_CHILDREN", "Move or archive child locations before changing this location's type or parent.");
      if (!input.isActive && (existing._count.children || existing._count.currentStockUnits)) throw new ApiError(409, "LOCATION_IN_USE", "A location with active children or current serialized stock cannot be deactivated.");
      if (input.barcode) { const duplicate = await tx.warehouseLocation.findFirst({ where: { id: { not: locationId }, barcode: input.barcode, warehouse: { companyId: context.company.id } }, select: { id: true } }); if (duplicate) throw new ApiError(409, "DUPLICATE_LOCATION_BARCODE", "Location barcode already exists in this company."); }
      const row = await tx.warehouseLocation.update({ where: { id: locationId }, data: { parentId: input.parentId || null, code: input.code, name: input.name, type: input.type, barcode: input.barcode || null, sequence: input.sequence, isQuarantine: input.isQuarantine, isActive: input.isActive } });
      await appendAudit({ companyId: context.company.id, actorId: context.user.id, branchId: warehouse.branchId, warehouseId, action: "WAREHOUSE_LOCATION_UPDATED", module: "organization", entityType: "WarehouseLocation", entityId: row.id, entityReference: `${warehouse.code}/${row.code}`, previousValues: existing, newValues: input }, tx); return row;
    });
    return NextResponse.json(jsonSafe({ data: updated }));
  } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(new ApiError(409, "DUPLICATE_LOCATION", "Location code already exists in this warehouse.")); return apiError(error); }
}
