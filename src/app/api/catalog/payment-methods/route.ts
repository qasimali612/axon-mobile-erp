import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { paymentMethodMasterSchema } from "@/lib/catalog/pricing-validation";
import { validateSettlement } from "@/lib/catalog/payment-methods";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET() {
  try {
    const context = await requirePermission("finance.paymentmethod.view");
    const data = await prisma.paymentMethod.findMany({
      where: { companyId: context.company.id },
      include: {
        cashAccount: { select: { id: true, code: true, name: true, branchId: true } },
        bankAccount: { select: { id: true, code: true, bankName: true, accountTitle: true, currencyCode: true, branchId: true } },
        _count: { select: { payments: true } },
      },
      orderBy: [{ isActive: "desc" }, { sequence: "asc" }, { code: "asc" }],
    });
    return NextResponse.json(jsonSafe({ data }));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("finance.paymentmethod.manage");
    const input = paymentMethodMasterSchema.parse(await request.json());
    const created = await prisma.$transaction(async (tx) => {
      const settlement = await validateSettlement(tx, context.company.id, input);
      const method = await tx.paymentMethod.create({
        data: {
          companyId: context.company.id,
          code: input.code,
          name: input.name,
          methodType: input.methodType,
          cashAccountId: settlement.cashAccountId,
          bankAccountId: settlement.bankAccountId,
          requiresReference: input.requiresReference,
          sequence: input.sequence,
          isActive: input.isActive,
          notes: input.notes || null,
        },
      });
      await appendAudit({ companyId: context.company.id, actorId: context.user.id, branchId: context.activeBranchId, action: "PAYMENT_METHOD_CREATED", module: "finance", entityType: "PaymentMethod", entityId: method.id, entityReference: method.code, newValues: { code: method.code, name: method.name, methodType: method.methodType, requiresReference: method.requiresReference, isActive: method.isActive } }, tx);
      return method;
    });
    return NextResponse.json(jsonSafe({ data: created }), { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(new ApiError(409, "DUPLICATE_PAYMENT_METHOD", "A payment method with this code or name already exists in this company."));
    return apiError(error);
  }
}
