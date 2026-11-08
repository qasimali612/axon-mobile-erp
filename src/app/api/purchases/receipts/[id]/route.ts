import { NextResponse } from "next/server";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { updatePurchaseReceiptDraft } from "@/lib/operations/purchase";
import { purchaseReceiptDraftSchema } from "@/lib/operations/validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

async function scope(id: string) {
  const base = await requireAuth();
  const record = await prisma.purchaseReceipt.findFirst({
    where: { id, companyId: base.company.id },
    select: { branchId: true, warehouseId: true },
  });
  if (!record) throw new ApiError(404, "PURCHASE_RECEIPT_NOT_FOUND", "Purchase receipt was not found.");
  return record;
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const id = idSchema.parse((await params).id);
    const recordScope = await scope(id);
    const context = await requirePermission("purchase.view", recordScope);
    const [receipt, attachments, history, movements] = await Promise.all([
      prisma.purchaseReceipt.findFirst({
        where: { id, companyId: context.company.id },
        include: {
          branch: { select: { id: true, code: true, name: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          supplier: { select: { id: true, code: true, name: true } },
          purchaseOrder: { select: { id: true, orderNumber: true, status: true } },
          preparedBy: { select: { id: true, fullName: true } },
          receivedBy: { select: { id: true, fullName: true } },
          approvedBy: { select: { id: true, fullName: true } },
          postedBy: { select: { id: true, fullName: true } },
          reversedBy: { select: { id: true, fullName: true } },
          reversalOf: { select: { id: true, receiptNumber: true, status: true } },
          reversals: { select: { id: true, receiptNumber: true, status: true, postedAt: true }, orderBy: { createdAt: "desc" } },
          journalEntry: { select: { id: true, voucherNumber: true, status: true } },
          inspections: { include: { inspectedBy: { select: { fullName: true } } }, orderBy: { inspectedAt: "desc" } },
          allocations: { include: { payment: { select: { id: true, paymentNumber: true, paymentDate: true, direction: true, status: true, amount: true } } }, orderBy: { payment: { paymentDate: "desc" } } },
          stockReturns: { select: { id: true, returnNumber: true, returnDate: true, status: true, grandTotal: true }, orderBy: { returnDate: "desc" } },
          lines: {
            orderBy: { lineNumber: "asc" },
            include: {
              product: { select: { sku: true, name: true, model: true, trackingMethod: true, unit: { select: { code: true, name: true } } } },
              variant: { select: { sku: true, name: true, color: true, storageGb: true } },
              taxRule: { select: { code: true, name: true, rate: true } },
              orderLine: { select: { lineNumber: true, orderedQuantity: true, receivedQuantity: true } },
              units: { orderBy: { createdAt: "asc" } },
            },
          },
        },
      }),
      prisma.attachment.findMany({ where: { companyId: context.company.id, entityType: "PurchaseReceipt", entityId: id }, orderBy: { createdAt: "desc" } }),
      prisma.auditLog.findMany({ where: { companyId: context.company.id, entityType: "PurchaseReceipt", entityId: id }, select: { id: true, action: true, outcome: true, createdAt: true, previousValues: true, newValues: true, metadata: true, actor: { select: { id: true, fullName: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
      prisma.inventoryMovement.findMany({ where: { companyId: context.company.id, sourceDocumentType: "PurchaseReceipt", sourceDocumentId: id }, select: { id: true, movementType: true, postingDate: true, quantity: true, unitCost: true, totalCost: true, lineReference: true, stockUnitId: true, reversalOfId: true, sourceDocumentNumber: true }, orderBy: { postedAt: "asc" } }),
    ]);
    return NextResponse.json(jsonSafe({ data: { ...receipt, attachments, history, movements } }));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const id = idSchema.parse((await params).id);
    const body = purchaseReceiptDraftSchema.parse(await request.json());
    const recordScope = await scope(id);
    const context = await requirePermission("PURCHASE_RECEIPT_CREATE", recordScope);
    const data = await updatePurchaseReceiptDraft(
      { companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode },
      id,
      body,
      {
        allowTaxOverride: context.permissions.includes("PURCHASE_TAX_OVERRIDE"),
        allowDirectReceipt: context.permissions.includes("PURCHASE_DIRECT_RECEIPT_CREATE"),
        allowOverReceipt: context.permissions.includes("PURCHASE_OVER_RECEIPT"),
      },
    );
    return NextResponse.json(jsonSafe({ data }));
  } catch (error) {
    return apiError(error);
  }
}
