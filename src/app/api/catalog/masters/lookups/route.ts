import { NextResponse } from "next/server";
import { ApiError, apiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

/** Lookup feed for price list and payment method maintenance screens. */
export async function GET() {
  try {
    const context = await requireAuth();
    const canPrice = context.permissions.includes("catalog.pricelist.view") || context.permissions.includes("catalog.pricelist.create") || context.permissions.includes("catalog.pricelist.edit");
    const canPay = context.permissions.includes("finance.paymentmethod.view") || context.permissions.includes("finance.paymentmethod.manage");
    if (!canPrice && !canPay) throw new ApiError(403, "FORBIDDEN", "Pricing and payment master access is not granted.");
    const [variants, cashAccounts, bankAccounts, customers] = await Promise.all([
      canPrice ? prisma.productVariant.findMany({
        where: { companyId: context.company.id, isActive: true, product: { status: "ACTIVE" } },
        select: { id: true, sku: true, name: true, retailPrice: true, minimumSellingPrice: true, product: { select: { name: true } } },
        orderBy: { sku: "asc" },
        take: 2_000,
      }) : Promise.resolve([]),
      canPay ? prisma.account.findMany({ where: { companyId: context.company.id, accountType: "CASH", isActive: true }, select: { id: true, code: true, name: true, branchId: true, currencyCode: true }, orderBy: { code: "asc" } }) : Promise.resolve([]),
      canPay ? prisma.bankAccount.findMany({ where: { companyId: context.company.id, isActive: true }, select: { id: true, code: true, bankName: true, accountTitle: true, currencyCode: true, branchId: true }, orderBy: { code: "asc" } }) : Promise.resolve([]),
      canPrice ? prisma.customer.findMany({ where: { companyId: context.company.id, status: "ACTIVE" }, select: { id: true, code: true, name: true, priceListId: true }, orderBy: { name: "asc" }, take: 2_000 }) : Promise.resolve([]),
    ]);
    return NextResponse.json(jsonSafe({ data: { variants, cashAccounts, bankAccounts, customers } }));
  } catch (error) { return apiError(error); }
}
