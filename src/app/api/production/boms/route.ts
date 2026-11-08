import { NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { createBom } from "@/lib/operations/production";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET() {
  try {
    const context = await requirePermission("production.view");
    const boms = await prisma.bom.findMany({
      where: { companyId: context.company.id },
      include: {
        product: { select: { id: true, sku: true, name: true, model: true } },
        variant: { select: { id: true, sku: true, name: true, color: true, storageGb: true } },
        items: {
          include: {
            componentProduct: { select: { id: true, sku: true, name: true } },
            componentVariant: { select: { id: true, sku: true, name: true } },
          },
        },
        _count: { select: { productionOrders: true } },
      },
      orderBy: { code: "asc" },
    });
    return NextResponse.json(jsonSafe({ data: boms }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("production.bom.manage");
    const body = await request.json();
    const bom = await createBom(context.company.id, context.user.id, body);
    return NextResponse.json(jsonSafe({ data: bom }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

