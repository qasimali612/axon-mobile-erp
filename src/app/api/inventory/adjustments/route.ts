import { NextResponse } from "next/server";
import { OperationalDocumentStatus, Prisma } from "@prisma/client";
import { apiError, assertSameOrigin, parsePagination } from "@/lib/api";
import { permittedDocumentScopes, requirePermission } from "@/lib/auth";
import { createStockAdjustmentDraft } from "@/lib/operations/stock-adjustment";
import { stockAdjustmentDraftSchema } from "@/lib/operations/validation";
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
    const where: Prisma.StockAdjustmentWhereInput = {
      companyId: context.company.id,
      ...(status ? { status } : {}),
      ...(scopes ? { AND: [{ OR: scopes }] } : {}),
      ...(search ? { OR: [
        { adjustmentNumber: { contains: search, mode: "insensitive" } },
        { reasonCode: { contains: search, mode: "insensitive" } },
        { reason: { contains: search, mode: "insensitive" } },
        { warehouse: { name: { contains: search, mode: "insensitive" } } },
        { lines: { some: { OR: [
          { product: { name: { contains: search, mode: "insensitive" } } },
          { product: { sku: { contains: search, mode: "insensitive" } } },
          { variant: { sku: { contains: search, mode: "insensitive" } } },
          { units: { some: { stockUnit: { identifiers: { some: { normalizedValue: { contains: search.replace(/[\s-]/g, ""), mode: "insensitive" } } } } } } },
        ] } } },
      ] } : {}),
    };
    const [items, total, statuses] = await Promise.all([
      prisma.stockAdjustment.findMany({
        where,
        include: {
          branch: { select: { code: true, name: true } },
          warehouse: { select: { code: true, name: true } },
          preparedBy: { select: { fullName: true } },
          postedBy: { select: { fullName: true } },
          stockCount: { select: { id: true, countNumber: true } },
          reversalOf: { select: { id: true, adjustmentNumber: true } },
          reversal: { select: { id: true, adjustmentNumber: true } },
          journalEntry: { select: { id: true, voucherNumber: true, status: true } },
          _count: { select: { lines: true } },
        },
        orderBy: [{ adjustmentDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.stockAdjustment.count({ where }),
      prisma.stockAdjustment.groupBy({ by: ["status"], where, _count: true }),
    ]);
    return NextResponse.json(jsonSafe({ data: items, pagination: { page, pageSize, total }, summary: { statuses: Object.fromEntries(statuses.map((item) => [item.status, item._count])) } }));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = stockAdjustmentDraftSchema.parse(await request.json());
    const context = await requirePermission("inventory.stock.adjust", { branchId: body.branchId, warehouseId: body.warehouseId });
    const data = await createStockAdjustmentDraft({ companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode }, body);
    return NextResponse.json(jsonSafe({ data }), { status: 201 });
  } catch (error) { return apiError(error); }
}
