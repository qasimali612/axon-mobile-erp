import { NextResponse } from "next/server";
import { z } from "zod";
import {
  InventoryMovementType,
  OperationalDocumentStatus,
  PaymentDirection,
  Prisma,
  StockReturnDisposition,
  StockReturnType,
  StockUnitStatus,
  TrackingMethod,
} from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { allocateOperationalNumber, postOperationalJournal, requirePostingAccount } from "@/lib/operations/accounting";
import { applyStockMovement, lockPhysicalStockUnit } from "@/lib/operations/inventory";
import { createPaymentDraft, postPayment } from "@/lib/operations/payments";
import { createStockReturnDraft, postStockReturn } from "@/lib/operations/stock-return";
import { createSalesInvoiceDraft, postSalesInvoice } from "@/lib/operations/sales";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

const exchangeInputSchema = z.object({
  branchId: z.string().uuid("Branch ID is required"),
  warehouseId: z.string().uuid("Warehouse ID is required"),
  sourceSalesInvoiceId: z.string().uuid("Source sales invoice is required"),
  returnedStockUnitId: z.string().uuid("Returned handset unit is required"),
  returnCondition: z.enum(["RESTOCK", "QUARANTINE"]).default("RESTOCK"),
  returnReason: z.string().min(3, "Return reason must be at least 3 characters").max(500),
  replacementVariantId: z.string().uuid("Replacement variant is required"),
  replacementStockUnitId: z.string().uuid("Replacement handset unit is required"),
  replacementPrice: z.string().regex(/^\d+(\.\d{1,4})?$/, "Valid replacement price required"),
  settlementMethod: z.enum(["CASH", "BANK", "CUSTOMER_CREDIT"]).default("CASH"),
  settlementAccountId: z.string().uuid().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const context = await requirePermission("sales.view");
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId") || undefined;

    // Fetch recent posted returns and invoices that represent exchanges
    const recentReturns = await prisma.stockReturn.findMany({
      where: {
        companyId: context.company.id,
        returnType: StockReturnType.SALES_RETURN,
        status: OperationalDocumentStatus.POSTED,
        ...(branchId ? { branchId } : {}),
        reason: { contains: "Exchange", mode: "insensitive" },
      },
      include: {
        customer: { select: { id: true, code: true, name: true, phone: true } },
        branch: { select: { id: true, code: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        lines: {
          include: {
            product: { select: { name: true, trackingMethod: true } },
            variant: { select: { name: true, sku: true } },
            units: {
              include: {
                stockUnit: {
                  include: { identifiers: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(jsonSafe({ data: recentReturns }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const json = await request.json();
    const input = exchangeInputSchema.parse(json);

    const context = await requirePermission("SALES_INVOICE_CREATE", {
      branchId: input.branchId,
      warehouseId: input.warehouseId,
    });
    const companyId = context.company.id;
    const actor = {
      companyId,
      userId: context.user.id,
      currencyCode: context.company.currencyCode,
      permissions: context.permissions,
    };

    // 1. Fetch source invoice and returned device
    const sourceInvoice = await prisma.salesInvoice.findFirst({
      where: { id: input.sourceSalesInvoiceId, companyId, status: OperationalDocumentStatus.POSTED },
      include: {
        customer: true,
        lines: {
          include: {
            product: true,
            variant: true,
            units: {
              include: {
                stockUnit: { include: { identifiers: true } },
              },
            },
          },
        },
      },
    });

    if (!sourceInvoice) {
      throw new ApiError(404, "SOURCE_INVOICE_NOT_FOUND", "Posted source invoice was not found.");
    }

    const sourceLine = sourceInvoice.lines.find((l) =>
      l.units.some((u) => u.stockUnitId === input.returnedStockUnitId)
    );
    if (!sourceLine) {
      throw new ApiError(422, "UNIT_NOT_ON_INVOICE", "The specified handset was not sold on this source invoice.");
    }

    const returnedUnit = await prisma.physicalStockUnit.findFirst({
      where: { id: input.returnedStockUnitId, companyId },
      include: { identifiers: true, variant: true, product: true },
    });
    if (!returnedUnit || returnedUnit.status !== StockUnitStatus.SOLD) {
      throw new ApiError(409, "UNIT_NOT_SOLD", "Returned handset is no longer in SOLD status and eligible for return.");
    }

    // 2. Fetch replacement handset and verify stock availability
    const replacementUnit = await prisma.physicalStockUnit.findFirst({
      where: {
        id: input.replacementStockUnitId,
        companyId,
        variantId: input.replacementVariantId,
        currentWarehouseId: input.warehouseId,
        status: StockUnitStatus.IN_STOCK,
      },
      include: { identifiers: true, variant: true, product: true },
    });
    if (!replacementUnit) {
      throw new ApiError(409, "REPLACEMENT_UNIT_UNAVAILABLE", "Replacement handset is not currently IN_STOCK in the selected warehouse.");
    }

    const returnCreditValue = Number(sourceLine.unitPrice);
    const replacementPriceNum = parseFloat(input.replacementPrice);
    const exchangeDiff = replacementPriceNum - returnCreditValue;

    // 3. Perform atomic exchange transaction
    const exchangeResult = await prisma.$transaction(async (tx) => {
      // Step A: Create and Post Stock Return for old handset
      const returnDraft = await createStockReturnDraft(actor, {
        returnType: StockReturnType.SALES_RETURN,
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        sourceDocumentId: sourceInvoice.id,
        returnDate: new Date().toISOString().slice(0, 10),
        currencyCode: sourceInvoice.currencyCode,
        reason: `[Exchange for ${replacementUnit.product.name} ${replacementUnit.variant.name}] ${input.returnReason}`,
        notes: input.notes || `Handset Exchange against invoice ${sourceInvoice.invoiceNumber}`,
        idempotencyKey: `EXC-RETURN:${crypto.randomUUID()}`,
        lines: [
          {
            sourceLineId: sourceLine.id,
            quantity: "1",
            disposition: input.returnCondition === "RESTOCK" ? StockReturnDisposition.RESTOCK : StockReturnDisposition.QUARANTINE,
            condition: input.returnCondition,
            notes: `Exchange trade-in: ${returnedUnit.product.name}`,
            stockUnitIds: [returnedUnit.id],
          },
        ],
      });

      const postedReturn = await postStockReturn(actor, returnDraft.id);

      // Step B: Create and Post Sales Invoice for replacement handset
      const salesDraft = await createSalesInvoiceDraft(actor, {
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        customerId: sourceInvoice.customerId,
        salespersonId: context.user.id,
        invoiceDate: new Date().toISOString().slice(0, 10),
        currencyCode: sourceInvoice.currencyCode,
        priceListId: null,
        notes: `Replacement handset exchange for trade-in return ${postedReturn.returnNumber}. Reason: ${input.returnReason}`,
        idempotencyKey: `EXC-SALE:${crypto.randomUUID()}`,
        lines: [
          {
            productId: replacementUnit.productId,
            variantId: replacementUnit.variantId,
            description: `Replacement Handset: ${replacementUnit.product.name} ${replacementUnit.variant.name}`,
            quantity: "1",
            unitPrice: input.replacementPrice,
            discountAmount: "0",
            taxRate: "0",
            taxRuleId: null,
            stockUnitIds: [replacementUnit.id],
          },
        ],
      });

      const postedSale = await postSalesInvoice(actor, salesDraft.id);

      // Step C: Handle differential settlement if Cash or Bank selected
      let settlementPayment = null;
      if (input.settlementMethod === "CASH" || input.settlementMethod === "BANK") {
        let cashAccountId = null;
        let bankAccountId = null;

        if (input.settlementMethod === "CASH") {
          const cashAcc = input.settlementAccountId
            ? await tx.account.findUnique({ where: { id: input.settlementAccountId } })
            : await tx.account.findFirst({
                where: { companyId, accountType: "CASH", isActive: true, OR: [{ branchId: input.branchId }, { branchId: null }] },
              });
          cashAccountId = cashAcc?.id || null;
        } else {
          const bankAcc = input.settlementAccountId
            ? await tx.bankAccount.findUnique({ where: { id: input.settlementAccountId } })
            : await tx.bankAccount.findFirst({
                where: { companyId, branchId: input.branchId, isActive: true },
              });
          bankAccountId = bankAcc?.id || null;
        }

        if (exchangeDiff > 0) {
          // Customer pays additional money: CUSTOMER_RECEIPT
          const receipt = await createPaymentDraft(actor, {
            branchId: input.branchId,
            paymentDate: new Date().toISOString().slice(0, 10),
            direction: PaymentDirection.CUSTOMER_RECEIPT,
            currencyCode: sourceInvoice.currencyCode,
            customerId: sourceInvoice.customerId,
            amount: exchangeDiff.toFixed(4),
            cashAccountId: cashAccountId || undefined,
            bankAccountId: bankAccountId || undefined,
            reference: `Exchange Diff on ${postedSale.invoiceNumber}`,
            notes: `Additional payment for handset exchange difference`,
            idempotencyKey: `EXC-PAY:${postedSale.id}`,
            allocations: [{ salesInvoiceId: postedSale.id, amount: exchangeDiff.toFixed(4) }],
          });
          settlementPayment = await postPayment(actor, receipt.id);
        } else if (exchangeDiff < 0) {
          // Customer gets a refund: CUSTOMER_REFUND
          const refundAmt = Math.abs(exchangeDiff).toFixed(4);
          const refund = await createPaymentDraft(actor, {
            branchId: input.branchId,
            paymentDate: new Date().toISOString().slice(0, 10),
            direction: PaymentDirection.CUSTOMER_REFUND,
            currencyCode: sourceInvoice.currencyCode,
            customerId: sourceInvoice.customerId,
            amount: refundAmt,
            cashAccountId: cashAccountId || undefined,
            bankAccountId: bankAccountId || undefined,
            reference: `Exchange Refund on ${postedReturn.returnNumber}`,
            notes: `Customer refund for handset exchange price difference`,
            idempotencyKey: `EXC-REFUND:${postedReturn.id}`,
            allocations: [],
          });
          settlementPayment = await postPayment(actor, refund.id);
        }
      }

      await appendAudit(
        {
          companyId,
          actorId: context.user.id,
          branchId: input.branchId,
          warehouseId: input.warehouseId,
          action: "HANDSET_EXCHANGE_COMPLETED",
          module: "sales",
          entityType: "SalesInvoice",
          entityId: postedSale.id,
          entityReference: postedSale.invoiceNumber,
          metadata: {
            returnedHandset: returnedUnit.identifiers.map((i) => i.value).join(" / "),
            replacementHandset: replacementUnit.identifiers.map((i) => i.value).join(" / "),
            returnCreditValue,
            replacementPrice: replacementPriceNum,
            exchangeDiff,
            settlementMethod: input.settlementMethod,
          },
        },
        tx
      );

      return {
        exchangeNumber: `EXC-${postedSale.invoiceNumber}`,
        sourceInvoiceId: sourceInvoice.id,
        sourceInvoiceNumber: sourceInvoice.invoiceNumber,
        stockReturnId: postedReturn.id,
        returnNumber: postedReturn.returnNumber,
        replacementInvoiceId: postedSale.id,
        replacementInvoiceNumber: postedSale.invoiceNumber,
        returnedUnit: {
          id: returnedUnit.id,
          product: returnedUnit.product.name,
          variant: returnedUnit.variant.name,
          imeis: returnedUnit.identifiers.map((i) => i.value),
          creditValue: returnCreditValue,
        },
        replacementUnit: {
          id: replacementUnit.id,
          product: replacementUnit.product.name,
          variant: replacementUnit.variant.name,
          imeis: replacementUnit.identifiers.map((i) => i.value),
          price: replacementPriceNum,
        },
        financials: {
          returnCreditValue,
          replacementPrice: replacementPriceNum,
          exchangeDifference: exchangeDiff,
          settlementMethod: input.settlementMethod,
          settlementPaymentId: settlementPayment?.id || null,
        },
      };
    });

    return NextResponse.json(jsonSafe({ data: exchangeResult }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
