import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { updateBankAccount } from "@/lib/finance/banking";
import { bankAccountSchema } from "@/lib/finance/banking-validation";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const id = idSchema.parse((await params).id);
    const context = await requirePermission("BANK_LEDGER_VIEW");
    const data = await prisma.bankAccount.findFirst({
      where: { id, companyId: context.company.id },
      include: {
        branch: { select: { code: true, name: true } },
        glAccount: { select: { id: true, code: true, name: true } },
        statements: { include: { reconciliation: true, _count: { select: { lines: true } } }, orderBy: { periodEnd: "desc" }, take: 24 },
      },
    });
    if (!data) throw new ApiError(404, "BANK_ACCOUNT_NOT_FOUND", "Bank account was not found.");
    return NextResponse.json(jsonSafe({ data }));
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const id = idSchema.parse((await params).id);
    const context = await requirePermission("BANK_ACCOUNT_MANAGE");
    const input = bankAccountSchema.parse(await request.json());
    await requirePermission("BANK_ACCOUNT_MANAGE", { branchId: input.branchId });
    const updated = await updateBankAccount({ companyId: context.company.id, userId: context.user.id, activeBranchId: context.activeBranchId }, id, input);
    return NextResponse.json(jsonSafe({ data: updated }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(new ApiError(409, "DUPLICATE_BANK_ACCOUNT", "A bank account with this code already exists in this company."));
    if (error instanceof Error && /cannot be deactivated|unreconciled|open reconciliation|active payment method/.test(error.message)) return apiError(new ApiError(409, "BANK_ACCOUNT_IN_USE", error.message));
    return apiError(error);
  }
}
