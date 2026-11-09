import { NextResponse } from "next/server";
import { OperationalDocumentStatus, PaymentDirection, Prisma, PurchaseReceiptType, QualityInspectionResult } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin, parsePagination } from "@/lib/api";
import { permittedDocumentScopes, requirePermission } from "@/lib/auth";
import { shouldAutoPost } from "@/lib/operating-mode";
import {
  approvePurchaseReceipt,
  createPurchaseReceiptDraft,
  postPurchaseReceipt,
  submitPurchaseReceipt,
} from "@/lib/operations/purchase";
import { purchaseReceiptDraftSchema } from "@/lib/operations/validation";
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
    const typeValue = params.get("type");
    const receiptType = typeValue && Object.values(PurchaseReceiptType).includes(typeValue as PurchaseReceiptType)
      ? typeValue as PurchaseReceiptType
      : undefined;
    const inspectionValue = params.get("inspectionStatus");
    const inspectionStatus = inspectionValue && Object.values(QualityInspectionResult).includes(inspectionValue as QualityInspectionResult)
      ? inspectionValue as QualityInspectionResult
      : undefined;
    const search = params.get("search")?.trim();
    const branchId = params.get("branchId") || undefined;
    const warehouseId = params.get("warehouseId") || undefined;
    const supplierId = params.get("supplierId") || undefined;
    const purchaseOrderId = params.get("purchaseOrderId") || undefined;
    const receiverId = params.get("receiverId") || undefined;
    const productId = params.get("productId") || undefined;
    const model = params.get("model")?.trim();
    const color = params.get("color")?.trim();
    const from = dateBoundary(params.get("from"));
    const to = dateBoundary(params.get("to"), true);

    const lineFilter: Prisma.PurchaseReceiptLineWhereInput = {
      ...(productId ? { productId } : {}),
      ...(model ? { product: { model: { contains: model, mode: "insensitive" } } } : {}),
      ...(color ? { variant: { color: { contains: color, mode: "insensitive" } } } : {}),
      ...(inspectionStatus ? { inspectionStatus } : {}),
    };
    const hasLineFilter = Boolean(productId || model || color || inspectionStatus);
    const andFilters: Prisma.PurchaseReceiptWhereInput[] = [];
    if (allowedScopes) andFilters.push({ OR: allowedScopes });
    if (search) andFilters.push({ OR: [
      { receiptNumber: { contains: search, mode: "insensitive" } },
      { supplierInvoiceNumber: { contains: search, mode: "insensitive" } },
      { supplierDeliveryNote: { contains: search, mode: "insensitive" } },
      { purchaseOrder: { orderNumber: { contains: search, mode: "insensitive" } } },
      { supplier: { name: { contains: search, mode: "insensitive" } } },
      { lines: { some: { OR: [
        { description: { contains: search, mode: "insensitive" } },
        { product: { name: { contains: search, mode: "insensitive" } } },
        { product: { sku: { contains: search, mode: "insensitive" } } },
        { variant: { sku: { contains: search, mode: "insensitive" } } },
      ] } } },
    ] });
    const where: Prisma.PurchaseReceiptWhereInput = {
      companyId: context.company.id,
      ...(status ? { status } : {}),
      ...(receiptType ? { receiptType } : {}),
      ...(branchId ? { branchId } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(purchaseOrderId ? { purchaseOrderId } : {}),
      ...(receiverId ? { receivedById: receiverId } : {}),
      ...((from || to) ? { receiptDate: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
      ...(hasLineFilter ? { lines: { some: lineFilter } } : {}),
      AND: andFilters,
    };

    const direction: Prisma.SortOrder = params.get("sortDir") === "asc" ? "asc" : "desc";
    const sortOptions: Record<string, Prisma.PurchaseReceiptOrderByWithRelationInput> = {
      receiptDate: { receiptDate: direction },
      receiptNumber: { receiptNumber: direction },
      dueDate: { dueDate: direction },
      amount: { grandTotal: direction },
      status: { status: direction },
      supplier: { supplier: { name: direction } },
    };
    const orderBy = sortOptions[params.get("sort") || "receiptDate"] || sortOptions.receiptDate;

    const [items, total, totals, quantityTotals, statuses] = await Promise.all([
      prisma.purchaseReceipt.findMany({
        where,
        include: {
          branch: { select: { code: true, name: true } },
          warehouse: { select: { code: true, name: true } },
          supplier: { select: { code: true, name: true } },
          purchaseOrder: { select: { id: true, orderNumber: true } },
          receivedBy: { select: { fullName: true } },
          preparedBy: { select: { fullName: true } },
          approvedBy: { select: { fullName: true } },
          postedBy: { select: { fullName: true } },
          journalEntry: { select: { id: true, voucherNumber: true } },
          lines: { select: { quantity: true, acceptedQuantity: true, rejectedQuantity: true, inspectionStatus: true } },
          allocations: { where: { payment: { status: OperationalDocumentStatus.POSTED } }, select: { amount: true, payment: { select: { direction: true } } } },
          _count: { select: { lines: true } },
        },
        orderBy: [orderBy, { receiptNumber: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.purchaseReceipt.count({ where }),
      prisma.purchaseReceipt.aggregate({ where, _sum: { subtotal: true, discountTotal: true, taxTotal: true, freightTotal: true, otherCharges: true, grandTotal: true } }),
      prisma.purchaseReceiptLine.aggregate({ where: { receipt: where }, _sum: { quantity: true, acceptedQuantity: true, rejectedQuantity: true } }),
      prisma.purchaseReceipt.groupBy({ by: ["status"], where, _count: true, _sum: { grandTotal: true } }),
    ]);
    const rows = items.map((receipt) => {
      const settledAmount = receipt.allocations.reduce((sum, allocation) => {
        if (allocation.payment.direction === PaymentDirection.SUPPLIER_PAYMENT) return sum.plus(allocation.amount);
        if (allocation.payment.direction === PaymentDirection.SUPPLIER_REFUND) return sum.minus(allocation.amount);
        return sum;
      }, new Prisma.Decimal(0));
      return {
        ...receipt,
        settledAmount,
        outstandingAmount: Prisma.Decimal.max(receipt.grandTotal.minus(settledAmount), 0),
      };
    });
    return NextResponse.json(jsonSafe({
      data: rows,
      pagination: { page, pageSize, total },
      summary: {
        subtotal: totals._sum.subtotal || 0,
        discountTotal: totals._sum.discountTotal || 0,
        taxTotal: totals._sum.taxTotal || 0,
        freightTotal: totals._sum.freightTotal || 0,
        otherCharges: totals._sum.otherCharges || 0,
        grandTotal: totals._sum.grandTotal || 0,
        quantity: quantityTotals._sum?.quantity || 0,
        acceptedQuantity: quantityTotals._sum?.acceptedQuantity || 0,
        rejectedQuantity: quantityTotals._sum?.rejectedQuantity || 0,
        statuses: Object.fromEntries(statuses.map((item) => [item.status, { count: item._count, value: item._sum.grandTotal || 0 }])),
      },
    }));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = purchaseReceiptDraftSchema.parse(await request.json());
    const context = await requirePermission("PURCHASE_RECEIPT_CREATE", { branchId: body.branchId, warehouseId: body.warehouseId });
    const actor = { companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode, permissions: context.permissions };
    const receipt = await createPurchaseReceiptDraft(
      actor,
      body,
      {
        allowTaxOverride: context.permissions.includes("PURCHASE_TAX_OVERRIDE"),
        allowDirectReceipt: context.permissions.includes("PURCHASE_DIRECT_RECEIPT_CREATE"),
        allowOverReceipt: context.permissions.includes("PURCHASE_OVER_RECEIPT"),
      },
    );

    const willAutoPost = await shouldAutoPost(prisma, context.company.id, body.autoPost);
    if (willAutoPost && !receipt.requiresInspection) {
      try {
        await submitPurchaseReceipt(actor, receipt.id);
        await approvePurchaseReceipt(actor, receipt.id);
        const posted = await postPurchaseReceipt(actor, receipt.id);
        return NextResponse.json(jsonSafe({ data: posted }), { status: 201 });
      } catch (autoErr) {
        console.warn("Goods receipt auto-post deferred to draft:", autoErr);
        return NextResponse.json(
          jsonSafe({
            data: receipt,
            warning:
              "Goods receipt created as draft. Direct posting was deferred: " +
              (autoErr instanceof Error ? autoErr.message : String(autoErr)),
          }),
          { status: 201 }
        );
      }
    }

    return NextResponse.json(jsonSafe({ data: receipt }), { status: 201 });
  } catch (error) { return apiError(error); }
}
