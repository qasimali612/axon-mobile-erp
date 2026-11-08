import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { transferInclude, updateStockTransferDraft } from "@/lib/operations/stock-transfer";
import { requireStockTransferScope } from "@/lib/operations/stock-transfer-auth";
import { stockTransferDraftSchema } from "@/lib/operations/validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

async function findTransfer(id: string) {
  const base = await requireAuth();
  const transfer = await prisma.stockTransfer.findFirst({
    where: { id, companyId: base.company.id },
    select: {
      id: true,
      sourceBranchId: true,
      sourceWarehouseId: true,
      destinationBranchId: true,
      destinationWarehouseId: true,
    },
  });
  if (!transfer) throw new ApiError(404, "TRANSFER_NOT_FOUND", "Stock transfer was not found.");
  return transfer;
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const id = idSchema.parse((await params).id);
    const transfer = await findTransfer(id);
    const context = await requireStockTransferScope("inventory.transfer.view", transfer, "either");
    const [data, movements] = await Promise.all([
      prisma.stockTransfer.findFirst({
        where: { id, companyId: context.company.id },
        include: transferInclude,
      }),
      prisma.inventoryMovement.findMany({
        where: { companyId: context.company.id, sourceDocumentType: "StockTransfer", sourceDocumentId: id },
        include: {
          branch: { select: { code: true, name: true } },
          warehouse: { select: { code: true, name: true } },
          product: { select: { sku: true, name: true } },
          variant: { select: { sku: true, name: true } },
          stockUnit: { include: { identifiers: { orderBy: [{ isPrimary: "desc" }, { slot: "asc" }] } } },
        },
        orderBy: [{ lineReference: "asc" }, { movementType: "asc" }, { postedAt: "asc" }],
      }),
    ]);
    return NextResponse.json(jsonSafe({ data: data ? { ...data, movements } : null }));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const id = idSchema.parse((await params).id);
    const current = await findTransfer(id);
    await requireStockTransferScope("inventory.transfer.create", current, "both");
    const body = stockTransferDraftSchema.parse(await request.json());
    const context = await requireStockTransferScope("inventory.transfer.create", body, "both");
    const data = await updateStockTransferDraft(
      { companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode },
      id,
      body,
    );
    return NextResponse.json(jsonSafe({ data }));
  } catch (error) {
    return apiError(error);
  }
}
