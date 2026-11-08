import { NextResponse } from "next/server";
import { OperationalDocumentStatus, PaymentDirection, Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin, parsePagination } from "@/lib/api";
import { permittedDocumentScopes, requirePermission } from "@/lib/auth";
import { createSalesInvoiceDraft } from "@/lib/operations/sales";
import { salesInvoiceDraftSchema } from "@/lib/operations/validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

const PAYMENT_FILTERS = new Set(["UNPAID", "PARTIAL", "PAID", "OVERDUE"]);

function dateBoundary(value: string | null, end = false) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(400, "INVALID_DATE", "Date filters must use YYYY-MM-DD.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, "INVALID_DATE", "A date filter is invalid.");
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function settlement(allocationRows: Array<{ amount: Prisma.Decimal; payment: { direction: PaymentDirection } }>) {
  return allocationRows.reduce((sum, allocation) => {
    const sign = allocation.payment.direction === PaymentDirection.CUSTOMER_RECEIPT ? 1 : -1;
    return sign === 1 ? sum.plus(allocation.amount) : sum.minus(allocation.amount);
  }, new Prisma.Decimal(0));
}

function invoicePaymentStatus(grandTotal: Prisma.Decimal, paid: Prisma.Decimal, dueDate: Date | null, today: Date) {
  const outstanding = Prisma.Decimal.max(grandTotal.minus(paid), 0);
  if (outstanding.lte(0)) return "PAID" as const;
  if (dueDate && dueDate < today) return "OVERDUE" as const;
  if (paid.gt(0)) return "PARTIAL" as const;
  return "UNPAID" as const;
}

export async function GET(request: Request) {
  try {
    const context = await requirePermission("sales.view");
    const { page, pageSize, skip, params } = parsePagination(request.url);
    const allowedScopes = permittedDocumentScopes(context, "sales.view");
    const statusValue = params.get("status");
    const status = statusValue && Object.values(OperationalDocumentStatus).includes(statusValue as OperationalDocumentStatus)
      ? statusValue as OperationalDocumentStatus
      : undefined;
    const paymentValue = params.get("paymentStatus")?.toUpperCase();
    const paymentStatus = paymentValue && PAYMENT_FILTERS.has(paymentValue) ? paymentValue : undefined;
    const search = params.get("search")?.trim();
    const branchId = params.get("branchId") || undefined;
    const warehouseId = params.get("warehouseId") || undefined;
    const customerId = params.get("customerId") || undefined;
    const salespersonId = params.get("salespersonId") || undefined;
    const productId = params.get("productId") || undefined;
    const model = params.get("model")?.trim();
    const color = params.get("color")?.trim();
    const from = dateBoundary(params.get("from"));
    const to = dateBoundary(params.get("to"), true);
    const dueFrom = dateBoundary(params.get("dueFrom"));
    const dueTo = dateBoundary(params.get("dueTo"), true);

    const lineFilter: Prisma.SalesInvoiceLineWhereInput = {
      ...(productId ? { productId } : {}),
      ...(model ? { product: { model: { contains: model, mode: "insensitive" } } } : {}),
      ...(color ? { variant: { color: { contains: color, mode: "insensitive" } } } : {}),
    };
    const hasLineFilter = Boolean(productId || model || color);
    const andFilters: Prisma.SalesInvoiceWhereInput[] = [];
    if (allowedScopes) andFilters.push({ OR: allowedScopes });
    if (search) andFilters.push({ OR: [
      { invoiceNumber: { contains: search, mode: "insensitive" } },
      { customer: { name: { contains: search, mode: "insensitive" } } },
      { customer: { phone: { contains: search, mode: "insensitive" } } },
      { lines: { some: { OR: [
        { description: { contains: search, mode: "insensitive" } },
        { product: { name: { contains: search, mode: "insensitive" } } },
        { product: { sku: { contains: search, mode: "insensitive" } } },
        { product: { model: { contains: search, mode: "insensitive" } } },
        { product: { barcodes: { some: { barcode: { contains: search, mode: "insensitive" } } } } },
        { variant: { sku: { contains: search, mode: "insensitive" } } },
        { units: { some: { stockUnit: { identifiers: { some: { value: { contains: search, mode: "insensitive" } } } } } } },
      ] } } },
    ] });
    const baseWhere: Prisma.SalesInvoiceWhereInput = {
      companyId: context.company.id,
      ...(status ? { status } : {}),
      ...(branchId ? { branchId } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(customerId ? { customerId } : {}),
      ...(salespersonId ? { salespersonId } : {}),
      ...((from || to) ? { invoiceDate: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
      ...((dueFrom || dueTo) ? { dueDate: { ...(dueFrom ? { gte: dueFrom } : {}), ...(dueTo ? { lt: dueTo } : {}) } } : {}),
      ...(hasLineFilter ? { lines: { some: lineFilter } } : {}),
      AND: andFilters,
    };

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const financialRows = await prisma.salesInvoice.findMany({
      where: baseWhere,
      select: {
        id: true,
        grandTotal: true,
        dueDate: true,
        status: true,
        allocations: {
          where: { payment: { status: OperationalDocumentStatus.POSTED } },
          select: { amount: true, payment: { select: { direction: true } } },
        },
      },
    });
    const financials = new Map(financialRows.map((invoice) => {
      const paid = settlement(invoice.allocations);
      const outstanding = Prisma.Decimal.max(invoice.grandTotal.minus(paid), 0);
      return [invoice.id, { paid, outstanding, paymentStatus: invoicePaymentStatus(invoice.grandTotal, paid, invoice.dueDate, today) }];
    }));
    const paymentMatchedIds = paymentStatus
      ? financialRows.filter((invoice) => financials.get(invoice.id)?.paymentStatus === paymentStatus).map((invoice) => invoice.id)
      : undefined;
    const where: Prisma.SalesInvoiceWhereInput = {
      ...baseWhere,
      ...(paymentMatchedIds ? { id: { in: paymentMatchedIds } } : {}),
    };

    const direction: Prisma.SortOrder = params.get("sortDir") === "asc" ? "asc" : "desc";
    const sortOptions: Record<string, Prisma.SalesInvoiceOrderByWithRelationInput> = {
      invoiceDate: { invoiceDate: direction },
      invoiceNumber: { invoiceNumber: direction },
      dueDate: { dueDate: direction },
      amount: { grandTotal: direction },
      status: { status: direction },
      customer: { customer: { name: direction } },
    };
    const orderBy = sortOptions[params.get("sort") || "invoiceDate"] || sortOptions.invoiceDate;

    const [rawItems, total, totals, quantityTotals, statuses] = await Promise.all([
      prisma.salesInvoice.findMany({
        where,
        include: {
          branch: { select: { code: true, name: true } },
          warehouse: { select: { code: true, name: true } },
          customer: { select: { code: true, name: true, phone: true } },
          salesperson: { select: { fullName: true } },
          preparedBy: { select: { fullName: true } },
          approvedBy: { select: { fullName: true } },
          postedBy: { select: { fullName: true } },
          journalEntry: { select: { id: true, voucherNumber: true } },
          lines: { select: { quantity: true } },
          allocations: { where: { payment: { status: OperationalDocumentStatus.POSTED } }, select: { amount: true, payment: { select: { direction: true } } } },
          _count: { select: { lines: true } },
        },
        orderBy: [orderBy, { invoiceNumber: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.salesInvoice.count({ where }),
      prisma.salesInvoice.aggregate({ where, _sum: { subtotal: true, discountTotal: true, taxTotal: true, grandTotal: true, costTotal: true } }),
      prisma.salesInvoiceLine.aggregate({ where: { invoice: where }, _sum: { quantity: true } }),
      prisma.salesInvoice.groupBy({ by: ["status"], where, _count: true, _sum: { grandTotal: true } }),
    ]);
    const items = rawItems.map((invoice) => {
      const paidAmount = settlement(invoice.allocations);
      const outstandingAmount = Prisma.Decimal.max(invoice.grandTotal.minus(paidAmount), 0);
      return {
        ...invoice,
        paidAmount,
        outstandingAmount,
        paymentStatus: invoicePaymentStatus(invoice.grandTotal, paidAmount, invoice.dueDate, today),
      };
    });
    const selectedFinancials = paymentMatchedIds
      ? paymentMatchedIds.map((id) => financials.get(id)).filter(Boolean)
      : [...financials.values()];
    const paidTotal = selectedFinancials.reduce((sum, item) => sum.plus(item!.paid), new Prisma.Decimal(0));
    const outstandingTotal = selectedFinancials.reduce((sum, item) => sum.plus(item!.outstanding), new Prisma.Decimal(0));
    const paymentStatuses = selectedFinancials.reduce<Record<string, number>>((acc, item) => {
      acc[item!.paymentStatus] = (acc[item!.paymentStatus] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json(jsonSafe({
      data: items,
      pagination: { page, pageSize, total },
      summary: {
        subtotal: totals._sum.subtotal || 0,
        discountTotal: totals._sum.discountTotal || 0,
        taxTotal: totals._sum.taxTotal || 0,
        grandTotal: totals._sum.grandTotal || 0,
        costTotal: totals._sum.costTotal || 0,
        quantity: quantityTotals._sum.quantity || 0,
        paidTotal,
        outstandingTotal,
        paymentStatuses,
        statuses: Object.fromEntries(statuses.map((item) => [item.status, { count: item._count, value: item._sum.grandTotal || 0 }])),
      },
    }));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = salesInvoiceDraftSchema.parse(await request.json());
    const context = await requirePermission("SALES_INVOICE_CREATE", { branchId: body.branchId, warehouseId: body.warehouseId });
    const invoice = await createSalesInvoiceDraft({ companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode }, body);
    return NextResponse.json(jsonSafe({ data: invoice }), { status: 201 });
  } catch (error) { return apiError(error); }
}
