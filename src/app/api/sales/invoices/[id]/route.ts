import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { updateSalesInvoiceDraft } from "@/lib/operations/sales";
import { salesInvoiceDraftSchema } from "@/lib/operations/validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

async function scope(id: string) {
  const base = await requireAuth();
  const record = await prisma.salesInvoice.findFirst({
    where: { id, companyId: base.company.id },
    select: { branchId: true, warehouseId: true },
  });
  if (!record) throw new ApiError(404, "SALES_INVOICE_NOT_FOUND", "Sales invoice was not found.");
  return record;
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const id = idSchema.parse((await params).id);
    const recordScope = await scope(id);
    const context = await requirePermission("sales.view", recordScope);
    const [invoice, attachments, history, movements] = await Promise.all([
      prisma.salesInvoice.findFirst({
        where: { id, companyId: context.company.id },
        include: {
          branch: { select: { id: true, code: true, name: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          customer: { select: { id: true, code: true, name: true, phone: true, email: true, creditLimit: true, paymentTermsDays: true } },
          salesperson: { select: { id: true, fullName: true } },
          preparedBy: { select: { id: true, fullName: true } },
          approvedBy: { select: { id: true, fullName: true } },
          postedBy: { select: { id: true, fullName: true } },
          reversedBy: { select: { id: true, fullName: true } },
          reversalOf: { select: { id: true, invoiceNumber: true, status: true } },
          reversals: { select: { id: true, invoiceNumber: true, status: true, postedAt: true }, orderBy: { createdAt: "desc" } },
          journalEntry: { select: { id: true, voucherNumber: true, postingDate: true, status: true } },
          lines: {
            orderBy: { lineNumber: "asc" },
            include: {
              product: { select: { id: true, sku: true, name: true, model: true, trackingMethod: true, unit: { select: { code: true, name: true } } } },
              variant: { select: { id: true, sku: true, name: true, color: true, storageGb: true, retailPrice: true, minimumSellingPrice: true } },
              taxRule: { select: { id: true, code: true, name: true, rate: true } },
              units: { include: { stockUnit: { include: { identifiers: { orderBy: [{ type: "asc" }, { slot: "asc" }] } } } } },
              returnLines: { select: { id: true, quantity: true, lineTotal: true, stockReturn: { select: { id: true, returnNumber: true, returnDate: true, status: true } } } },
            },
          },
          allocations: { include: { payment: { select: { id: true, paymentNumber: true, paymentDate: true, direction: true, status: true, amount: true } } }, orderBy: { payment: { paymentDate: "desc" } } },
          stockReturns: { select: { id: true, returnNumber: true, returnDate: true, status: true, grandTotal: true }, orderBy: { returnDate: "desc" } },
        },
      }),
      prisma.attachment.findMany({ where: { companyId: context.company.id, entityType: "SalesInvoice", entityId: id }, orderBy: { createdAt: "desc" } }),
      prisma.auditLog.findMany({ where: { companyId: context.company.id, entityType: "SalesInvoice", entityId: id }, select: { id: true, action: true, outcome: true, createdAt: true, previousValues: true, newValues: true, metadata: true, actor: { select: { id: true, fullName: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
      prisma.inventoryMovement.findMany({ where: { companyId: context.company.id, sourceDocumentType: "SalesInvoice", sourceDocumentId: id }, select: { id: true, movementType: true, postingDate: true, quantity: true, unitCost: true, totalCost: true, lineReference: true, stockUnitId: true, sourceDocumentNumber: true }, orderBy: { postedAt: "asc" } }),
    ]);
    if (!invoice) throw new ApiError(404, "SALES_INVOICE_NOT_FOUND", "Sales invoice was not found.");
    return NextResponse.json(jsonSafe({ data: { ...invoice, attachments, history, movements } }));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const id = idSchema.parse((await params).id);
    const body = salesInvoiceDraftSchema.parse(await request.json());
    const recordScope = await scope(id);
    const context = await requirePermission("SALES_INVOICE_CREATE", recordScope);
    const data = await updateSalesInvoiceDraft(
      { companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode },
      id,
      body,
    );
    return NextResponse.json(jsonSafe({ data }));
  } catch (error) {
    return apiError(error);
  }
}
