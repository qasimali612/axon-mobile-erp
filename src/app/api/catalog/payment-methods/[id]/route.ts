import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { paymentMethodMasterSchema } from "@/lib/catalog/pricing-validation";
import { validateSettlement } from "@/lib/catalog/payment-methods";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const id = idSchema.parse((await params).id);
    const context = await requirePermission("finance.paymentmethod.manage");
    const input = paymentMethodMasterSchema.parse(await request.json());
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.paymentMethod.findFirst({ where: { id, companyId: context.company.id } });
      if (!current) throw new ApiError(404, "PAYMENT_METHOD_NOT_FOUND", "Payment method was not found.");
      const settlement = await validateSettlement(tx, context.company.id, input);
      if (current.methodType !== input.methodType && (settlement.bankAccountId !== current.bankAccountId || settlement.cashAccountId !== current.cashAccountId)) {
        const used = await tx.payment.count({ where: { paymentMethodId: id } });
        if (used) throw new ApiError(409, "PAYMENT_METHOD_SETTLEMENT_LOCKED", "The settlement account cannot change once payments use this method.");
      }
      const method = await tx.paymentMethod.update({
        where: { id },
        data: {
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
      await appendAudit({
        companyId: context.company.id,
        actorId: context.user.id,
        branchId: context.activeBranchId,
        action: "PAYMENT_METHOD_UPDATED",
        module: "finance",
        entityType: "PaymentMethod",
        entityId: method.id,
        entityReference: method.code,
        newValues: { code: method.code, name: method.name, methodType: method.methodType, requiresReference: method.requiresReference, isActive: method.isActive },
        previousValues: { code: current.code, name: current.name, methodType: current.methodType, isActive: current.isActive },
      }, tx);
      return method;
    });
    return NextResponse.json(jsonSafe({ data: updated }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(new ApiError(409, "DUPLICATE_PAYMENT_METHOD", "A payment method with this code or name already exists in this company."));
    if (error instanceof Error && /cannot be deactivated|must stay active|never deleted|cannot change/.test(error.message)) return apiError(new ApiError(409, "PAYMENT_METHOD_IN_USE", error.message));
    return apiError(error);
  }
}
