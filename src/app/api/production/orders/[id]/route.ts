import { NextResponse } from "next/server";
import { ApiError, apiError } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const context = await requirePermission("production.view");
    const { id } = await params;
    idSchema.parse(id);

    const order = await prisma.productionOrder.findFirst({
      where: { id, companyId: context.company.id },
      include: {
        product: { select: { id: true, sku: true, name: true, model: true } },
        variant: { select: { id: true, sku: true, name: true, color: true } },
        branch: { select: { id: true, code: true, name: true } },
        sourceWarehouse: { select: { id: true, code: true, name: true } },
        targetWarehouse: { select: { id: true, code: true, name: true } },
        bom: {
          include: {
            items: {
              include: {
                componentProduct: { select: { id: true, sku: true, name: true } },
                componentVariant: { select: { id: true, sku: true, name: true } },
              },
            },
          },
        },
        materialsIssued: {
          include: {
            product: { select: { sku: true, name: true } },
            variant: { select: { sku: true, name: true } },
            warehouse: { select: { code: true, name: true } },
          },
        },
        unitsProduced: {
          include: {
            physicalStockUnit: {
              include: {
                identifiers: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!order) {
      throw new ApiError(404, "ORDER_NOT_FOUND", "Production order not found.");
    }

    return NextResponse.json(jsonSafe({ data: order }));
  } catch (error) {
    return apiError(error);
  }
}

