import { NextResponse } from "next/server";
import { IdentifierType, Prisma, TrackingMethod } from "@prisma/client";
import { ApiError, apiError } from "@/lib/api";
import { permittedDocumentScopes, requirePermission, type OperationalDocumentScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

function scopeWhere(scopes: OperationalDocumentScope[] | null): Prisma.PhysicalStockUnitWhereInput | null {
  if (!scopes) return null;
  return {
    OR: scopes.flatMap((scope) => [
      {
        ...(scope.branchId ? { currentBranchId: scope.branchId } : {}),
        ...(scope.warehouseId ? { currentWarehouseId: scope.warehouseId } : {}),
      },
      {
        movements: {
          some: {
            ...(scope.branchId ? { branchId: scope.branchId } : {}),
            ...(scope.warehouseId ? { warehouseId: scope.warehouseId } : {}),
          },
        },
      },
    ]),
  };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const cleanId = id.trim();
    const normalized = cleanId.replace(/[\s-]/g, "");
    const context = await requirePermission("inventory.device.view");
    const scoped = scopeWhere(permittedDocumentScopes(context, "inventory.device.view"));

    const device = await prisma.physicalStockUnit.findFirst({
      where: {
        companyId: context.company.id,
        product: { trackingMethod: TrackingMethod.IMEI },
        OR: [
          { id: cleanId },
          { identifiers: { some: { normalizedValue: normalized } } },
          { identifiers: { some: { value: { equals: cleanId, mode: "insensitive" } } } },
        ],
        ...(scoped ? { AND: [scoped] } : {}),
      },
      include: {
        product: { include: { brand: true, category: true, unit: true } },
        variant: true,
        currentBranch: { select: { id: true, code: true, name: true } },
        currentWarehouse: { select: { id: true, code: true, name: true } },
        currentLocation: { select: { id: true, code: true, name: true, type: true } },
        identifiers: { orderBy: [{ type: "asc" }, { slot: "asc" }, { isPrimary: "desc" }] },
        receiptUnits: {
          include: {
            receiptLine: {
              include: {
                receipt: {
                  include: {
                    supplier: { select: { id: true, code: true, name: true, phone: true, taxNumber: true } },
                    purchaseOrder: { select: { id: true, orderNumber: true, status: true, orderDate: true } },
                    branch: { select: { code: true, name: true } },
                    warehouse: { select: { code: true, name: true } },
                  },
                },
              },
            },
          },
        },
        salesUnits: {
          include: {
            invoiceLine: {
              include: {
                invoice: {
                  include: {
                    customer: { select: { id: true, code: true, name: true, phone: true, taxNumber: true } },
                    salesperson: { select: { id: true, fullName: true, email: true } },
                    branch: { select: { code: true, name: true } },
                    warehouse: { select: { code: true, name: true } },
                  },
                },
              },
            },
          },
        },
        returnUnits: {
          include: {
            returnLine: {
              include: {
                stockReturn: {
                  include: {
                    customer: { select: { id: true, code: true, name: true } },
                    supplier: { select: { id: true, code: true, name: true } },
                    branch: { select: { code: true, name: true } },
                    warehouse: { select: { code: true, name: true } },
                  },
                },
              },
            },
          },
        },
        movements: {
          include: {
            branch: { select: { code: true, name: true } },
            warehouse: { select: { code: true, name: true } },
            location: { select: { code: true, name: true } },
            journalEntry: { select: { id: true, voucherNumber: true, status: true } },
            createdBy: { select: { id: true, fullName: true } },
            reversalOf: { select: { id: true, sourceDocumentNumber: true } },
          },
          orderBy: [{ postingDate: "desc" }, { postedAt: "desc" }],
        },
        reservations: {
          where: { releasedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          include: { warehouse: { select: { code: true, name: true } }, createdBy: { select: { fullName: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!device) throw new ApiError(404, "IMEI_DEVICE_NOT_FOUND", "The IMEI-tracked physical device was not found in your permitted inventory scope.");

    const canViewCost = context.permissions.includes("catalog.cost.view");
    const data = {
      ...device,
      acquisitionCost: canViewCost ? device.acquisitionCost : null,
      movements: device.movements.map((movement) => ({
        ...movement,
        unitCost: canViewCost ? movement.unitCost : null,
        totalCost: canViewCost ? movement.totalCost : null,
      })),
      canViewCost,
    };
    return NextResponse.json(jsonSafe({ data }));
  } catch (error) {
    return apiError(error);
  }
}
