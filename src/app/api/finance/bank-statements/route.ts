import { NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { permittedBranchIds, requirePermission } from "@/lib/auth";
import { createBankStatement } from "@/lib/finance/banking";
import { bankStatementSchema } from "@/lib/finance/banking-validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    const context = await requirePermission("BANK_LEDGER_VIEW");
    const branches = permittedBranchIds(context, "BANK_LEDGER_VIEW");
    const bankAccountId = new URL(request.url).searchParams.get("bankAccountId") || undefined;
    const data = await prisma.bankStatement.findMany({
      where: { companyId: context.company.id, ...(bankAccountId ? { bankAccountId } : {}), ...(branches ? { bankAccount: { branchId: { in: branches } } } : {}) },
      include: {
        bankAccount: { select: { id: true, code: true, bankName: true, currencyCode: true } },
        reconciliation: { select: { id: true, status: true, bookBalance: true, statementBalance: true, adjustedBalance: true, completedAt: true } },
        _count: { select: { lines: true } },
      },
      orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
    const lineStats = data.length
      ? await prisma.bankStatementLine.groupBy({ by: ["statementId"], where: { statementId: { in: data.map((item) => item.id) } }, _count: { _all: true } })
      : [];
    const matchedStats = data.length
      ? await prisma.bankStatementLine.groupBy({ by: ["statementId"], where: { statementId: { in: data.map((item) => item.id) }, isMatched: true }, _count: { _all: true } })
      : [];
    const total = new Map(lineStats.map((row) => [row.statementId, row._count._all]));
    const matched = new Map(matchedStats.map((row) => [row.statementId, row._count._all]));
    return NextResponse.json(jsonSafe({ data: data.map((item) => ({ ...item, matchedLines: matched.get(item.id) ?? 0, totalLines: total.get(item.id) ?? 0 })) }));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("BANK_RECONCILIATION_PREPARE");
    const input = bankStatementSchema.parse(await request.json());
    const created = await createBankStatement({ companyId: context.company.id, userId: context.user.id, activeBranchId: context.activeBranchId }, input);
    return NextResponse.json(jsonSafe({ data: created }), { status: 201 });
  } catch (error) { return apiError(error); }
}
