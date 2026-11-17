import { NextResponse } from "next/server";
import { z } from "zod";
import { OperationalDocumentStatus, PaymentDirection, StockReturnType } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { createPaymentDraft, postPayment } from "@/lib/operations/payments";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

const refundInputSchema = z.object({
  refundMethod: z.enum(["CASH", "BANK"]),
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/, "Amount must be a positive number"),
  cashAccountId: z.string().uuid().optional().nullable(),
  bankAccountId: z.string().uuid().optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const json = await request.json();
    const input = refundInputSchema.parse(json);

    const stockReturn = await prisma.stockReturn.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, code: true, name: true } },
        supplier: { select: { id: true, code: true, name: true } },
        branch: { select: { id: true, code: true, name: true } },
      },
    });

    if (!stockReturn) {
      throw new ApiError(404, "RETURN_NOT_FOUND", "Return document not found.");
    }
    if (stockReturn.status !== OperationalDocumentStatus.POSTED) {
      throw new ApiError(409, "RETURN_NOT_POSTED", "Only posted returns can have refunds issued.");
    }

    const isSalesReturn = stockReturn.returnType === StockReturnType.SALES_RETURN;
    const requiredPerm = isSalesReturn ? "PAYMENT_CREATE" : "PAYMENT_CREATE";
    const context = await requirePermission(requiredPerm, { branchId: stockReturn.branchId });

    const refundAmount = parseFloat(input.amount);
    if (!(refundAmount > 0)) {
      throw new ApiError(422, "INVALID_AMOUNT", "Refund amount must be greater than zero.");
    }
    if (refundAmount > Number(stockReturn.grandTotal)) {
      throw new ApiError(
        422,
        "AMOUNT_EXCEEDS_RETURN",
        `Refund amount (Rs. ${refundAmount.toLocaleString()}) cannot exceed return total (Rs. ${Number(stockReturn.grandTotal).toLocaleString()}).`
      );
    }

    // Resolve settlement cash or bank account
    let cashAccountId = input.cashAccountId;
    let bankAccountId = input.bankAccountId;

    if (input.refundMethod === "CASH" && !cashAccountId) {
      const defaultCash = await prisma.account.findFirst({
        where: {
          companyId: context.company.id,
          accountType: "CASH",
          isActive: true,
          OR: [{ branchId: stockReturn.branchId }, { branchId: null }],
        },
        select: { id: true },
      });
      cashAccountId = defaultCash?.id || null;
      if (!cashAccountId) {
        throw new ApiError(400, "CASH_ACCOUNT_REQUIRED", "No active cash account found for this branch.");
      }
    } else if (input.refundMethod === "BANK" && !bankAccountId) {
      const defaultBank = await prisma.bankAccount.findFirst({
        where: {
          companyId: context.company.id,
          branchId: stockReturn.branchId,
          isActive: true,
        },
        select: { id: true },
      });
      bankAccountId = defaultBank?.id || null;
      if (!bankAccountId) {
        throw new ApiError(400, "BANK_ACCOUNT_REQUIRED", "No active bank account found for this branch.");
      }
    }

    const actor = {
      companyId: context.company.id,
      userId: context.user.id,
      currencyCode: stockReturn.currencyCode || context.company.currencyCode,
      permissions: context.permissions,
    };

    const direction = isSalesReturn
      ? PaymentDirection.CUSTOMER_REFUND
      : PaymentDirection.SUPPLIER_REFUND;

    const paymentDate = new Date().toISOString().slice(0, 10);
    const payment = await createPaymentDraft(actor, {
      branchId: stockReturn.branchId,
      paymentDate,
      direction,
      currencyCode: stockReturn.currencyCode || context.company.currencyCode,
      customerId: stockReturn.customerId,
      supplierId: stockReturn.supplierId,
      amount: input.amount,
      cashAccountId: input.refundMethod === "CASH" ? cashAccountId : undefined,
      bankAccountId: input.refundMethod === "BANK" ? bankAccountId : undefined,
      reference: input.reference || `Refund on ${stockReturn.returnNumber}`,
      notes: input.notes || `Disbursement for return note ${stockReturn.returnNumber}`,
      idempotencyKey: `REFUND:${stockReturn.id}:${crypto.randomUUID()}`,
      allocations: [],
    });

    // Directly post the refund payment voucher
    const postedPayment = await postPayment(actor, payment.id);

    return NextResponse.json(
      jsonSafe({
        data: {
          stockReturnId: stockReturn.id,
          returnNumber: stockReturn.returnNumber,
          payment: postedPayment,
          refundAmount,
          refundMethod: input.refundMethod,
          status: "REFUNDED",
        },
      }),
      { status: 201 }
    );
  } catch (error) {
    return apiError(error);
  }
}
