import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { permittedBranchIds, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    const context = await requirePermission("BANK_LEDGER_VIEW");
    const branches = permittedBranchIds(context, "BANK_LEDGER_VIEW");
    const params = new URL(request.url).searchParams;
    const bankAccountId = params.get("bankAccountId") || undefined;
    const status = params.get("status") || undefined;
    const data = await prisma.bankTransaction.findMany({
      where: {
        companyId: context.company.id,
        ...(bankAccountId ? { bankAccountId } : {}),
        ...(status === "RECONCILED" || status === "UNRECONCILED" ? { reconciliationStatus: status } : {}),
        ...(branches ? { bankAccount: { branchId: { in: branches } } } : {}),
        journalEntry: { status: { in: ["POSTED", "REVERSED"] } },
      },
      include: { bankAccount: { select: { code: true, bankName: true, currencyCode: true } }, journalEntry: { select: { id: true, voucherNumber: true } } },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
    return NextResponse.json(jsonSafe({ data }));
  } catch (error) { return apiError(error); }
}
