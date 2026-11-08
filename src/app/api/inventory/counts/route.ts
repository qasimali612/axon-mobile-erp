import { NextResponse } from "next/server";
import { OperationalDocumentStatus, Prisma } from "@prisma/client";
import { apiError, assertSameOrigin, parsePagination } from "@/lib/api";
import { permittedDocumentScopes, requirePermission } from "@/lib/auth";
import { createStockCount } from "@/lib/operations/stock-count";
import { stockCountCreateSchema } from "@/lib/operations/validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    const context = await requirePermission("inventory.stock.view");
    const { page, pageSize, skip, params } = parsePagination(request.url);
    const scopes = permittedDocumentScopes(context, "inventory.stock.view");
    const statusValue = params.get("status");
    const status = statusValue && Object.values(OperationalDocumentStatus).includes(statusValue as OperationalDocumentStatus) ? statusValue as OperationalDocumentStatus : undefined;
    const search = params.get("search")?.trim();
    const where: Prisma.StockCountWhereInput = {
      companyId: context.company.id,
      ...(status ? { status } : {}),
      ...(scopes ? { AND: [{ OR: scopes }] } : {}),
      ...(search ? { OR: [
        { countNumber: { contains: search, mode: "insensitive" } },
        { reason: { contains: search, mode: "insensitive" } },
        { warehouse: { name: { contains: search, mode: "insensitive" } } },
        { lines: { some: { OR: [
          { product: { name: { contains: search, mode: "insensitive" } } },
          { product: { sku: { contains: search, mode: "insensitive" } } },
          { variant: { sku: { contains: search, mode: "insensitive" } } },
        ] } } },
      ] } : {}),
    };
    const [items, total, statuses] = await Promise.all([
      prisma.stockCount.findMany({
        where,
        include: {
          branch: { select: { code: true, name: true } },
          warehouse: { select: { code: true, name: true } },
          preparedBy: { select: { fullName: true } },
          submittedBy: { select: { fullName: true } },
          postedBy: { select: { fullName: true } },
          adjustment: { select: { id: true, adjustmentNumber: true, netValue: true } },
          lines: { select: { varianceQuantity: true, totalVariance: true } },
          _count: { select: { lines: true } },
        },
        orderBy: [{ countDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.stockCount.count({ where }),
      prisma.stockCount.groupBy({ by: ["status"], where, _count: true }),
    ]);
    const data = items.map((item) => ({
      ...item,
      varianceLines: item.lines.filter((line) => !line.varianceQuantity.isZero()).length,
      totalVariance: item.lines.reduce((sum, line) => sum.plus(line.totalVariance), new Prisma.Decimal(0)),
    }));
    return NextResponse.json(jsonSafe({ data, pagination: { page, pageSize, total }, summary: { statuses: Object.fromEntries(statuses.map((item) => [item.status, item._count])) } }));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = stockCountCreateSchema.parse(await request.json());
    const context = await requirePermission("inventory.stocktake.manage", { branchId: body.branchId, warehouseId: body.warehouseId });
    const data = await createStockCount({ companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode }, body);
    return NextResponse.json(jsonSafe({ data }), { status: 201 });
  } catch (error) { return apiError(error); }
}
