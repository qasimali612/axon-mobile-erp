import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { permittedBranchIds, requirePermission } from "@/lib/auth";
import { createBankAccount } from "@/lib/finance/banking";
import { bankAccountSchema } from "@/lib/finance/banking-validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET() {
  try {
    const context = await requirePermission("BANK_LEDGER_VIEW");
    const branches = permittedBranchIds(context, "BANK_LEDGER_VIEW");
    const data = await prisma.bankAccount.findMany({
      where: { companyId: context.company.id, ...(branches ? { branchId: { in: branches } } : {}) },
      include: {
        branch: { select: { code: true, name: true } },
        glAccount: { select: { id: true, code: true, name: true, isActive: true } },
        _count: { select: { transactions: true, statements: true, reconciliations: true } },
      },
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
    });
    const [assetAccounts, branchesList] = await Promise.all([
      prisma.account.findMany({ where: { companyId: context.company.id, accountClass: "ASSET", isActive: true }, select: { id: true, code: true, name: true, accountType: true }, orderBy: { code: "asc" } }),
      prisma.branch.findMany({ where: { companyId: context.company.id, isActive: true, ...(branches ? { id: { in: branches } } : {}) }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    ]);
    return NextResponse.json(jsonSafe({ data, lookups: { assetAccounts, branches: branchesList } }));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("BANK_ACCOUNT_MANAGE", { branchId: undefined });
    const input = bankAccountSchema.parse(await request.json());
    await requirePermission("BANK_ACCOUNT_MANAGE", { branchId: input.branchId });
    const created = await createBankAccount({ companyId: context.company.id, userId: context.user.id, activeBranchId: context.activeBranchId }, input);
    return NextResponse.json(jsonSafe({ data: created }), { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(new ApiError(409, "DUPLICATE_BANK_ACCOUNT", "A bank account with this code already exists in this company."));
    return apiError(error);
  }
}
