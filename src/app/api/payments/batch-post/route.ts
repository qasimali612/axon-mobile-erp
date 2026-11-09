import { NextResponse } from "next/server";
import { OperationalDocumentStatus } from "@prisma/client";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { isSingleUserMode } from "@/lib/operating-mode";
import { approvePayment, postPayment, submitPayment } from "@/lib/operations/payments";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("PAYMENT_POST");
    const body = (await request.json().catch(() => ({}))) as { paymentIds?: string[] };

    const singleUser = await isSingleUserMode(prisma, context.company.id);
    const actor = {
      companyId: context.company.id,
      userId: context.user.id,
      currencyCode: context.company.currencyCode,
      permissions: context.permissions,
    };

    const targetPayments = await prisma.payment.findMany({
      where: {
        companyId: context.company.id,
        status: { in: [OperationalDocumentStatus.DRAFT, OperationalDocumentStatus.SUBMITTED, OperationalDocumentStatus.APPROVED] },
        ...(body.paymentIds && body.paymentIds.length > 0 ? { id: { in: body.paymentIds } } : {}),
      },
      select: { id: true, paymentNumber: true, status: true },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    const results: Array<{ id: string; paymentNumber: string; success: boolean; error?: string }> = [];

    for (const p of targetPayments) {
      try {
        await postPayment(actor, p.id);
        results.push({ id: p.id, paymentNumber: p.paymentNumber, success: true });
      } catch (err) {
        results.push({
          id: p.id,
          paymentNumber: p.paymentNumber,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const postedCount = results.filter((r) => r.success).length;
    return NextResponse.json(
      jsonSafe({
        data: {
          totalProcessed: targetPayments.length,
          postedCount,
          failedCount: targetPayments.length - postedCount,
          singleUser,
          results,
        },
      })
    );
  } catch (error) {
    return apiError(error);
  }
}

