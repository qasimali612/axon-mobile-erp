import { NextResponse } from "next/server";
import { OperationalDocumentStatus, Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin, parsePagination } from "@/lib/api";
import { permittedDocumentScopes, requirePermission } from "@/lib/auth";
import { createPurchaseOrderDraft } from "@/lib/operations/purchase";
import { purchaseOrderDraftSchema } from "@/lib/operations/validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

function dateBoundary(value: string | null, end = false) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(400, "INVALID_DATE", "Date filters must use YYYY-MM-DD.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, "INVALID_DATE", "A date filter is invalid.");
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

export async function GET(request: Request) {
  try {
    const context = await requirePermission("purchase.view");
    const { page, pageSize, skip, params } = parsePagination(request.url);
    const allowedScopes = permittedDocumentScopes(context, "purchase.view");
    const statusValue = params.get("status");
    const status = statusValue && Object.values(OperationalDocumentStatus).includes(statusValue as OperationalDocumentStatus)
      ? statusValue as OperationalDocumentStatus
      : undefined;
    const search = params.get("search")?.trim();
    const branchId = params.get("branchId") || undefined;
    const warehouseId = params.get("warehouseId") || undefined;
    const supplierId = params.get("supplierId") || undefined;
    const buyerId = params.get("buyerId") || undefined;
    const productId = params.get("productId") || undefined;
    const model = params.get("model")?.trim();
    const color = params.get("color")?.trim();
    const from = dateBoundary(params.get("from"));
    const to = dateBoundary(params.get("to"), true);
    const expectedFrom = dateBoundary(params.get("expectedFrom"));
    const expectedTo = dateBoundary(params.get("expectedTo"), true);

    const lineFilter: Prisma.PurchaseOrderLineWhereInput = {
      ...(productId ? { productId } : {}),
      ...(model ? { product: { model: { contains: model, mode: "insensitive" } } } : {}),
      ...(color ? { variant: { color: { contains: color, mode: "insensitive" } } } : {}),
    };
    const hasLineFilter = Boolean(productId || model || color);
    const andFilters: Prisma.PurchaseOrderWhereInput[] = [];
    if (allowedScopes) andFilters.push({ OR: allowedScopes });
    if (search) andFilters.push({ OR: [
      { orderNumber: { contains: search, mode: "insensitive" } },
      { supplierReference: { contains: search, mode: "insensitive" } },
      { supplier: { name: { contains: search, mode: "insensitive" } } },
      { lines: { some: { OR: [
        { description: { contains: search, mode: "insensitive" } },
        { product: { name: { contains: search, mode: "insensitive" } } },
        { product: { sku: { contains: search, mode: "insensitive" } } },
        { product: { model: { contains: search, mode: "insensitive" } } },
        { variant: { sku: { contains: search, mode: "insensitive" } } },
      ] } } },
    ] });
    const where: Prisma.PurchaseOrderWhereInput = {
      companyId: context.company.id,
      ...(status ? { status } : {}),
      ...(branchId ? { branchId } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(buyerId ? { preparedById: buyerId } : {}),
      ...((from || to) ? { orderDate: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
      ...((expectedFrom || expectedTo) ? { expectedDate: { ...(expectedFrom ? { gte: expectedFrom } : {}), ...(expectedTo ? { lt: expectedTo } : {}) } } : {}),
      ...(hasLineFilter ? { lines: { some: lineFilter } } : {}),
      AND: andFilters,
    };

    const direction: Prisma.SortOrder = params.get("sortDir") === "asc" ? "asc" : "desc";
    const sortOptions: Record<string, Prisma.PurchaseOrderOrderByWithRelationInput> = {
      orderDate: { orderDate: direction },
      expectedDate: { expectedDate: direction },
      orderNumber: { orderNumber: direction },
      amount: { grandTotal: direction },
      status: { status: direction },
      supplier: { supplier: { name: direction } },
    };
    const orderBy = sortOptions[params.get("sort") || "orderDate"] || sortOptions.orderDate;

    const [items, total, totals, quantityTotals, statuses] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: {
          branch: { select: { code: true, name: true } },
          warehouse: { select: { code: true, name: true } },
          supplier: { select: { code: true, name: true } },
          preparedBy: { select: { fullName: true } },
          approvedBy: { select: { fullName: true } },
          lines: { select: { orderedQuantity: true, receivedQuantity: true } },
          _count: { select: { lines: true, receipts: true } },
        },
        orderBy: [orderBy, { orderNumber: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.purchaseOrder.count({ where }),
      prisma.purchaseOrder.aggregate({ where, _sum: { subtotal: true, discountTotal: true, taxTotal: true, grandTotal: true } }),
      prisma.purchaseOrderLine.aggregate({ where: { order: where }, _sum: { orderedQuantity: true, receivedQuantity: true } }),
      prisma.purchaseOrder.groupBy({ by: ["status"], where, _count: true, _sum: { grandTotal: true } }),
    ]);
    return NextResponse.json(jsonSafe({
      data: items,
      pagination: { page, pageSize, total },
      summary: {
        subtotal: totals._sum.subtotal || 0,
        discountTotal: totals._sum.discountTotal || 0,
        taxTotal: totals._sum.taxTotal || 0,
        grandTotal: totals._sum.grandTotal || 0,
        orderedQuantity: quantityTotals._sum?.orderedQuantity || 0,
        receivedQuantity: quantityTotals._sum?.receivedQuantity || 0,
        statuses: Object.fromEntries(statuses.map((item) => [item.status, { count: item._count, value: item._sum.grandTotal || 0 }])),
      },
    }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = purchaseOrderDraftSchema.parse(await request.json());
    const context = await requirePermission("PURCHASE_ORDER_CREATE", { branchId: body.branchId, warehouseId: body.warehouseId });
    const order = await createPurchaseOrderDraft(
      { companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode },
      body,
      { allowTaxOverride: context.permissions.includes("PURCHASE_TAX_OVERRIDE") },
    );
    return NextResponse.json(jsonSafe({ data: order }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
