import "server-only";

import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { decimal } from "@/lib/finance/money";

type Tx = Prisma.TransactionClient;

export type PriceListWindow = { effectiveFrom: Date | null; effectiveTo: Date | null };

function withinWindow(list: PriceListWindow, onDate: Date) {
  const day = onDate.toISOString().slice(0, 10);
  const from = list.effectiveFrom ? list.effectiveFrom.toISOString().slice(0, 10) : null;
  const to = list.effectiveTo ? list.effectiveTo.toISOString().slice(0, 10) : null;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/** Loads a company price list and verifies it is active and inside its effective window. */
export async function requireUsablePriceList(tx: Tx, companyId: string, priceListId: string, onDate: Date) {
  const list = await tx.priceList.findFirst({ where: { id: priceListId, companyId } });
  if (!list) throw new ApiError(404, "PRICE_LIST_NOT_FOUND", "The selected price list was not found in this company.");
  if (!list.isActive) throw new ApiError(409, "PRICE_LIST_INACTIVE", "The selected price list is inactive.");
  if (!withinWindow(list, onDate)) throw new ApiError(409, "PRICE_LIST_OUT_OF_WINDOW", "The selected price list is not effective on the document date.");
  return list;
}

/**
 * Resolves the price list a sale should use: the explicit list, then the customer's assigned
 * list, then the company default list. Returns null when the company has no usable list.
 */
export async function resolveSalesPriceList(
  tx: Tx,
  input: { companyId: string; customerId: string; priceListId?: string | null; onDate: Date },
) {
  if (input.priceListId) return requireUsablePriceList(tx, input.companyId, input.priceListId, input.onDate);
  const customer = await tx.customer.findFirst({
    where: { id: input.customerId, companyId: input.companyId },
    select: { priceList: true },
  });
  if (customer?.priceList?.isActive && withinWindow(customer.priceList, input.onDate)) return customer.priceList;
  const fallback = await tx.priceList.findFirst({
    where: { companyId: input.companyId, isDefault: true, isActive: true },
  });
  if (fallback && withinWindow(fallback, input.onDate)) return fallback;
  return null;
}

export type PriceFloor = { price: Prisma.Decimal | null; minimumPrice: Prisma.Decimal | null; source: "PRICE_LIST" | "VARIANT"; listCode: string | null };

/** Builds the authoritative selling-price floor per variant for a document. */
export async function loadPriceFloors(
  tx: Tx,
  input: { companyId: string; priceListId: string | null; variantIds: string[] },
): Promise<Map<string, PriceFloor>> {
  const floors = new Map<string, PriceFloor>();
  if (!input.variantIds.length) return floors;
  if (input.priceListId) {
    const list = await tx.priceList.findFirst({ where: { id: input.priceListId, companyId: input.companyId }, select: { code: true } });
    const items = await tx.priceListItem.findMany({
      where: { priceListId: input.priceListId, variantId: { in: input.variantIds } },
      select: { variantId: true, price: true, minimumPrice: true },
    });
    for (const item of items) {
      floors.set(item.variantId, { price: item.price, minimumPrice: item.minimumPrice, source: "PRICE_LIST", listCode: list?.code ?? null });
    }
  }
  return floors;
}

export function effectiveUnitPrice(quantity: Prisma.Decimal | string, unitPrice: Prisma.Decimal | string, discountAmount: Prisma.Decimal | string) {
  const qty = decimal(quantity);
  return qty.times(decimal(unitPrice)).minus(decimal(discountAmount)).div(qty).toDecimalPlaces(4);
}
