import { NextResponse } from "next/server";
import { OperationalDocumentStatus } from "@prisma/client";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { isSingleUserMode } from "@/lib/operating-mode";
import { approveSalesInvoice, postSalesInvoice, submitSalesInvoice } from "@/lib/operations/sales";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("SALES_INVOICE_POST");
    const body = (await request.json().catch(() => ({}))) as { invoiceIds?: string[] };

    const singleUser = await isSingleUserMode(prisma, context.company.id);
    const actor = {
      companyId: context.company.id,
      userId: context.user.id,
      currencyCode: context.company.currencyCode,
      permissions: context.permissions,
      overrideReason: "Single-user auto-post execution",
    };

    const targetInvoices = await prisma.salesInvoice.findMany({
      where: {
        companyId: context.company.id,
        status: { in: [OperationalDocumentStatus.DRAFT, OperationalDocumentStatus.SUBMITTED, OperationalDocumentStatus.APPROVED] },
        ...(body.invoiceIds && body.invoiceIds.length > 0 ? { id: { in: body.invoiceIds } } : {}),
      },
      select: { id: true, invoiceNumber: true, status: true },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    const results: Array<{ id: string; invoiceNumber: string; success: boolean; error?: string }> = [];

    for (const inv of targetInvoices) {
      try {
        await postSalesInvoice(actor, inv.id);
        results.push({ id: inv.id, invoiceNumber: inv.invoiceNumber, success: true });
      } catch (err) {
        results.push({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const postedCount = results.filter((r) => r.success).length;
    return NextResponse.json(
      jsonSafe({
        data: {
          totalProcessed: targetInvoices.length,
          postedCount,
          failedCount: targetInvoices.length - postedCount,
          singleUser,
          results,
        },
      })
    );
  } catch (error) {
    return apiError(error);
  }
}

