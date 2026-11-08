import { NextResponse } from "next/server";
import { apiError, assertSameOrigin, parsePagination } from "@/lib/api";
import { permittedBranchIds, requirePermission } from "@/lib/auth";
import { createProductionOrder } from "@/lib/operations/production";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    const context = await requirePermission("production.view");
    const { page, pageSize, skip, params } = parsePagination(request.url);
    const branches = permittedBranchIds(context, "production.view");
    const status = params.get("status")?.trim();
    const search = params.get("search")?.trim();

    const where = {
      companyId: context.company.id,
      AND: [
        ...(branches ? [{ branchId: { in: branches } }] : []),
        ...(status ? [{ status }] : []),
        ...(search
          ? [
              {
                OR: [
                  { orderNumber: { contains: search, mode: "insensitive" as const } },
                  { product: { name: { contains: search, mode: "insensitive" as const } } },
                  { product: { sku: { contains: search, mode: "insensitive" as const } } },
                ],
              },
            ]
          : []),
      ],
    };

    const [items, total] = await Promise.all([
      prisma.productionOrder.findMany({
        where,
        include: {
          product: { select: { id: true, sku: true, name: true, model: true } },
          variant: { select: { id: true, sku: true, name: true, color: true } },
          branch: { select: { id: true, code: true, name: true } },
          sourceWarehouse: { select: { id: true, code: true, name: true } },
          targetWarehouse: { select: { id: true, code: true, name: true } },
          bom: { select: { id: true, code: true, name: true } },
          _count: { select: { materialsIssued: true, unitsProduced: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.productionOrder.count({ where }),
    ]);

    return NextResponse.json(
      jsonSafe({
        data: items,
        pagination: { page, pageSize, total },
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("production.order.create");
    const body = await request.json();
    const order = await createProductionOrder(context.company.id, context.user.id, body);
    return NextResponse.json(jsonSafe({ data: order }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

