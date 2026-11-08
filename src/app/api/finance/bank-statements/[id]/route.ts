import { NextResponse } from "next/server";
import { ApiError, apiError } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const id = idSchema.parse((await params).id);
    const context = await requirePermission("BANK_LEDGER_VIEW");
    const statement = await prisma.bankStatement.findFirst({
      where: { id, companyId: context.company.id },
      include: {
        bankAccount: { select: { id: true, code: true, bankName: true, accountTitle: true, currencyCode: true, branchId: true } },
        reconciliation: true,
        lines: {
          orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
          include: { matchedJournalLine: { select: { id: true, entryId: true, baseDebit: true, baseCredit: true, description: true, entry: { select: { voucherNumber: true, postingDate: true, status: true } } } } },
        },
      },
    });
    if (!statement) throw new ApiError(404, "BANK_STATEMENT_NOT_FOUND", "Bank statement was not found.");
    const candidates = await prisma.bankTransaction.findMany({
      where: { companyId: context.company.id, bankAccountId: statement.bankAccountId, transactionDate: { gte: statement.periodStart, lte: statement.periodEnd }, journalEntry: { status: { in: ["POSTED", "REVERSED"] } } },
      select: { id: true, journalLineId: true, transactionDate: true, bankReference: true, description: true, deposit: true, withdrawal: true, reconciliationStatus: true, journalEntry: { select: { id: true, voucherNumber: true } } },
      orderBy: [{ transactionDate: "asc" }],
      take: 1_000,
    });
    return NextResponse.json(jsonSafe({ data: { ...statement, candidates } }));
  } catch (error) { return apiError(error); }
}
