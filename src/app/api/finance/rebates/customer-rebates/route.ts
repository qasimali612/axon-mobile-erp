import { NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { customerPriceProtectionSchema } from "@/lib/finance/rebate-validation";
import { calculateRebate, saveRebateProgram } from "@/lib/finance/rebates";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("REBATE_MANAGE");
    const actor = {
      companyId: context.company.id,
      userId: context.user.id,
      currencyCode: context.company.currencyCode,
    };
    const body = await request.json();
    const input = customerPriceProtectionSchema.parse(body);

    // Verify program exists or create a payable price protection program for this customer
    let program = await prisma.rebateProgram.findFirst({
      where: { id: input.programId, companyId: actor.companyId },
    });

    if (!program) {
      // Find default expense and liability accounts for customer rebate
      const [expenseAccount, payableAccount] = await Promise.all([
        prisma.account.findFirst({
          where: { companyId: actor.companyId, accountClass: "EXPENSE", isActive: true },
          orderBy: { code: "asc" },
        }),
        prisma.account.findFirst({
          where: { companyId: actor.companyId, accountClass: "LIABILITY", isActive: true },
          orderBy: { code: "asc" },
        }),
      ]);

      if (!expenseAccount || !payableAccount) {
        return NextResponse.json(
          { error: { message: "Active Expense and Liability accounts must exist for Customer Price Protection." } },
          { status: 422 }
        );
      }

      const randomSuffix = Date.now().toString().slice(-4);
      program = await saveRebateProgram(actor, {
        code: `CRP-${randomSuffix}`,
        name: `Customer Rate Protection · ${input.claimDate}`,
        direction: "PAYABLE",
        customerId: input.customerId,
        effectiveFrom: input.claimDate,
        effectiveTo: input.claimDate,
        calculationMethod: "PRICE_PROTECTION",
        primaryAccountId: expenseAccount.id,
        settlementAccountId: payableAccount.id,
        accountingTreatment: "COST_REDUCTION",
        isActive: true,
      });
    }

    // Convert items into RebateItem format
    const rebateItems = input.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      variantName: item.variantName,
      sku: item.sku,
      currentStock: item.soldQuantity,
      eligibleQuantity: item.eligibleQuantity,
      claimedQuantity: item.eligibleQuantity,
      oldPrice: item.oldPrice,
      newPrice: item.newPrice,
      priceDropPerUnit: item.rebatePerUnit,
      claimAmount: item.totalRebate,
      claimedUnitIds: item.claimedUnitIds || [],
      salesInvoiceId: input.salesInvoiceId ?? null,
      settlementType: input.settlementType,
    }));

    const calculation = await calculateRebate(actor, program.id, {
      periodStart: input.claimDate,
      periodEnd: input.claimDate,
      items: rebateItems,
      title: input.reference ? `Customer Price Protection (${input.reference})` : undefined,
      remarks: input.remarks ?? undefined,
      submitImmediately: true,
    });

    return NextResponse.json(jsonSafe({ data: calculation }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

