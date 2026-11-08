import { NextResponse } from "next/server";
import { apiError, ApiError, assertSameOrigin } from "@/lib/api";
import { requireAuth, requirePermission } from "@/lib/auth";
import { reverseJournal } from "@/lib/finance/posting";
import { journalReversalSchema } from "@/lib/finance/validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const input = journalReversalSchema.parse(await request.json());
    const baseContext = await requireAuth();
    const id = idSchema.parse((await params).id);
    const record = await prisma.journalEntry.findFirst({ where: { id, companyId: baseContext.company.id }, select: { branchId: true } });
    if (!record) throw new ApiError(404, "JOURNAL_NOT_FOUND", "Journal voucher was not found.");
    const context = await requirePermission("JOURNAL_REVERSE", { branchId: record.branchId });
    const journal = await reverseJournal(
      { companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode },
      id,
      input,
    );
    return NextResponse.json(jsonSafe({ data: journal }));
  } catch (error) {
    return apiError(error);
  }
}
