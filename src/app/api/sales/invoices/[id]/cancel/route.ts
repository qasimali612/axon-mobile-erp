import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { cancelSalesInvoiceDraft } from "@/lib/operations/sales";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };
const reasonSchema = z.object({ reason: z.string().trim().min(10).max(1000) });

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const base = await requireAuth();
    const id = idSchema.parse((await params).id);
    const { reason } = reasonSchema.parse(await request.json());
    const record = await prisma.salesInvoice.findFirst({ where: { id, companyId: base.company.id }, select: { branchId: true, warehouseId: true } });
    if (!record) throw new ApiError(404, "SALES_INVOICE_NOT_FOUND", "Sales invoice was not found.");
    const context = await requirePermission("SALES_INVOICE_CREATE", record);
    const data = await cancelSalesInvoiceDraft({ companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode }, id, reason);
    return NextResponse.json(jsonSafe({ data }));
  } catch (error) {
    return apiError(error);
  }
}
