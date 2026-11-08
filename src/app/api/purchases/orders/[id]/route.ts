import { NextResponse } from "next/server";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { updatePurchaseOrderDraft } from "@/lib/operations/purchase";
import { purchaseOrderDraftSchema } from "@/lib/operations/validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

async function scope(id: string) {
  const base = await requireAuth();
  const record = await prisma.purchaseOrder.findFirst({
    where: { id, companyId: base.company.id },
    select: { branchId: true, warehouseId: true },
  });
  if (!record) throw new ApiError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order was not found.");
  return record;
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const id = idSchema.parse((await params).id);
    const recordScope = await scope(id);
    const context = await requirePermission("purchase.view", recordScope);
    const [order, attachments, history] = await Promise.all([
      prisma.purchaseOrder.findFirst({
        where: { id, companyId: context.company.id },
        include: {
          branch: { select: { id: true, code: true, name: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          supplier: { select: { id: true, code: true, name: true, paymentTermsDays: true } },
          preparedBy: { select: { id: true, fullName: true } },
          approvedBy: { select: { id: true, fullName: true } },
          lines: {
            orderBy: { lineNumber: "asc" },
            include: {
              product: { select: { sku: true, name: true, model: true, trackingMethod: true, unit: { select: { code: true, name: true } } } },
              variant: { select: { sku: true, name: true, color: true, storageGb: true } },
              taxRule: { select: { code: true, name: true, rate: true } },
            },
          },
          receipts: { select: { id: true, receiptNumber: true, receiptDate: true, status: true, grandTotal: true }, orderBy: { receiptDate: "desc" } },
        },
      }),
      prisma.attachment.findMany({ where: { companyId: context.company.id, entityType: "PurchaseOrder", entityId: id }, orderBy: { createdAt: "desc" } }),
      prisma.auditLog.findMany({ where: { companyId: context.company.id, entityType: "PurchaseOrder", entityId: id }, select: { id: true, action: true, outcome: true, createdAt: true, previousValues: true, newValues: true, metadata: true, actor: { select: { id: true, fullName: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    ]);
    return NextResponse.json(jsonSafe({ data: { ...order, attachments, history } }));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const id = idSchema.parse((await params).id);
    const body = purchaseOrderDraftSchema.parse(await request.json());
    const recordScope = await scope(id);
    const context = await requirePermission("PURCHASE_ORDER_CREATE", recordScope);
    const data = await updatePurchaseOrderDraft(
      { companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode },
      id,
      body,
      { allowTaxOverride: context.permissions.includes("PURCHASE_TAX_OVERRIDE") },
    );
    return NextResponse.json(jsonSafe({ data }));
  } catch (error) {
    return apiError(error);
  }
}
