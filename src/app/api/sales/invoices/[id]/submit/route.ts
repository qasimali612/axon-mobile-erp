import { NextResponse } from "next/server";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { postSalesInvoice } from "@/lib/operations/sales";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * @deprecated Approval workflows have been eliminated for Sales Invoices.
 * This endpoint automatically delegates to direct posting via `postSalesInvoice`.
 */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const base = await requireAuth();
    const id = idSchema.parse((await params).id);
    const record = await prisma.salesInvoice.findFirst({
      where: { id, companyId: base.company.id },
      select: { branchId: true, warehouseId: true },
    });
    if (!record) throw new ApiError(404, "SALES_INVOICE_NOT_FOUND", "Sales invoice was not found.");
    const context = await requirePermission("SALES_INVOICE_POST", record);

    const body = (await request.clone().json().catch(() => null)) as { reason?: string } | null;
    const overrideReason = typeof body?.reason === "string" ? body.reason.trim() : undefined;

    const data = await postSalesInvoice(
      {
        companyId: context.company.id,
        userId: context.user.id,
        currencyCode: context.company.currencyCode,
        permissions: context.permissions,
        overrideReason,
      },
      id,
    );
    return NextResponse.json(
      jsonSafe({
        data,
        warning: "Submit/Approve workflow is deprecated for sales invoices; document was posted directly.",
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
