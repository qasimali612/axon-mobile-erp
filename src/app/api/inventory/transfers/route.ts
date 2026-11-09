import { NextResponse } from "next/server";
import { OperationalDocumentStatus, Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin, parsePagination } from "@/lib/api";
import { permittedDocumentScopes, requirePermission } from "@/lib/auth";
import { shouldAutoPost } from "@/lib/operating-mode";
import {
  approveStockTransfer,
  createStockTransferDraft,
  postStockTransfer,
  submitStockTransfer,
} from "@/lib/operations/stock-transfer";
import { requireStockTransferScope } from "@/lib/operations/stock-transfer-auth";
import { stockTransferDraftSchema } from "@/lib/operations/validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

function dateBoundary(value: string | null, end = false) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(400, "INVALID_DATE", "Date filters must use YYYY-MM-DD.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, "INVALID_DATE", "A transfer date filter is invalid.");
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

export async function GET(request: Request) {
  try {
    const context = await requirePermission("inventory.transfer.view");
    const { page, pageSize, skip, params } = parsePagination(request.url);
    const scopes = permittedDocumentScopes(context, "inventory.transfer.view");
    const scopedSides = scopes?.flatMap((scope) => [
      {
        ...(scope.branchId ? { sourceBranchId: scope.branchId } : {}),
        ...(scope.warehouseId ? { sourceWarehouseId: scope.warehouseId } : {}),
      },
      {
        ...(scope.branchId ? { destinationBranchId: scope.branchId } : {}),
        ...(scope.warehouseId ? { destinationWarehouseId: scope.warehouseId } : {}),
      },
    ]);
    const statusValue = params.get("status");
    const supportedStatuses: OperationalDocumentStatus[] = [
      OperationalDocumentStatus.DRAFT,
      OperationalDocumentStatus.SUBMITTED,
      OperationalDocumentStatus.APPROVED,
      OperationalDocumentStatus.POSTED,
      OperationalDocumentStatus.CANCELLED,
      OperationalDocumentStatus.REVERSED,
    ];
    const status = statusValue && supportedStatuses.includes(statusValue as OperationalDocumentStatus)
      ? statusValue as OperationalDocumentStatus
      : undefined;
    const search = params.get("search")?.trim();
    const warehouseId = params.get("warehouseId") || undefined;
    const branchId = params.get("branchId") || undefined;
    const from = dateBoundary(params.get("from"));
    const to = dateBoundary(params.get("to"), true);
    const andFilters: Prisma.StockTransferWhereInput[] = [];
    if (scopedSides) andFilters.push({ OR: scopedSides });
    if (warehouseId) andFilters.push({ OR: [{ sourceWarehouseId: warehouseId }, { destinationWarehouseId: warehouseId }] });
    if (branchId) andFilters.push({ OR: [{ sourceBranchId: branchId }, { destinationBranchId: branchId }] });
    if (search) andFilters.push({ OR: [
      { transferNumber: { contains: search, mode: "insensitive" } },
      { reference: { contains: search, mode: "insensitive" } },
      { reason: { contains: search, mode: "insensitive" } },
      { sourceWarehouse: { name: { contains: search, mode: "insensitive" } } },
      { destinationWarehouse: { name: { contains: search, mode: "insensitive" } } },
      { lines: { some: { OR: [
        { product: { name: { contains: search, mode: "insensitive" } } },
        { product: { sku: { contains: search, mode: "insensitive" } } },
        { variant: { sku: { contains: search, mode: "insensitive" } } },
        { units: { some: { stockUnit: { identifiers: { some: { normalizedValue: { contains: search, mode: "insensitive" } } } } } } },
      ] } } },
    ] });
    const where: Prisma.StockTransferWhereInput = {
      companyId: context.company.id,
      ...(status ? { status } : {}),
      ...((from || to) ? { transferDate: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
      AND: andFilters,
    };
    const [items, total, statuses] = await Promise.all([
      prisma.stockTransfer.findMany({
        where,
        include: {
          sourceBranch: { select: { code: true, name: true } },
          sourceWarehouse: { select: { code: true, name: true } },
          destinationBranch: { select: { code: true, name: true } },
          destinationWarehouse: { select: { code: true, name: true } },
          preparedBy: { select: { fullName: true } },
          postedBy: { select: { fullName: true } },
          reversalOf: { select: { id: true, transferNumber: true } },
          reversal: { select: { id: true, transferNumber: true } },
          lines: { select: { quantity: true, totalCost: true, trackingMethod: true } },
          _count: { select: { lines: true } },
        },
        orderBy: [{ transferDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.stockTransfer.count({ where }),
      prisma.stockTransfer.groupBy({ by: ["status"], where, _count: true }),
    ]);
    const data = items.map((item) => ({
      ...item,
      totalQuantity: item.lines.reduce((sum, line) => sum.plus(line.quantity), new Prisma.Decimal(0)),
      totalCost: item.lines.reduce((sum, line) => sum.plus(line.totalCost), new Prisma.Decimal(0)),
      serializedQuantity: item.lines
        .filter((line) => line.trackingMethod === "IMEI" || line.trackingMethod === "SERIAL")
        .reduce((sum, line) => sum.plus(line.quantity), new Prisma.Decimal(0)),
    }));
    return NextResponse.json(jsonSafe({
      data,
      pagination: { page, pageSize, total },
      summary: { statuses: Object.fromEntries(statuses.map((item) => [item.status, item._count])) },
    }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = stockTransferDraftSchema.parse(await request.json());
    const context = await requireStockTransferScope("inventory.transfer.create", body, "both");
    const actor = { companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode };
    const record = await createStockTransferDraft(actor, body);

    const willAutoPost = await shouldAutoPost(prisma, context.company.id, body.autoPost);
    if (willAutoPost) {
      try {
        await submitStockTransfer(actor, record.id);
        await approveStockTransfer(actor, record.id);
        const posted = await postStockTransfer(actor, record.id);
        return NextResponse.json(jsonSafe({ data: posted }), { status: 201 });
      } catch (autoErr) {
        console.warn("Stock transfer auto-post deferred to draft:", autoErr);
        return NextResponse.json(
          jsonSafe({
            data: record,
            warning:
              "Transfer created as draft. Direct dispatch was deferred: " +
              (autoErr instanceof Error ? autoErr.message : String(autoErr)),
          }),
          { status: 201 }
        );
      }
    }

    return NextResponse.json(jsonSafe({ data: record }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
