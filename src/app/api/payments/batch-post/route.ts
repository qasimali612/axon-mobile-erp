import { NextResponse } from "next/server";
import { OperationalDocumentStatus } from "@prisma/client";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { postPayment } from "@/lib/operations/payments";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("PAYMENT_POST");
    const body = (await request.json().catch(() => ({}))) as { paymentIds?: string[] };

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
      select: { id: true, paymentNumber: true, amount: true, direction: true, status: true },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    const results: Array<{ id: string; paymentNumber: string; amount: string; direction: string; success: boolean; error?: string }> = [];

    for (const p of targetPayments) {
      try {
        await postPayment(actor, p.id);
        results.push({ id: p.id, paymentNumber: p.paymentNumber, amount: p.amount.toString(), direction: p.direction, success: true });
      } catch (err) {
        results.push({
          id: p.id,
          paymentNumber: p.paymentNumber,
          amount: p.amount.toString(),
          direction: p.direction,
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
          results,
        },
      })
    );
  } catch (error) {
    return apiError(error);
  }
}
