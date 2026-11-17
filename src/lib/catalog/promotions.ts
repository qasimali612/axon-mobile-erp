import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface PromotionRule {
  id: string;
  code: string;
  name: string;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  isActive: boolean;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  minInvoiceValue: number;
  maxDiscountAmount: number | null;
  applicableCategories: string[];
  applicableBranches: string[];
}

export async function getActivePromotions(
  companyId: string,
  onDate = new Date(),
  branchId?: string
): Promise<PromotionRule[]> {
  const promoLists = await prisma.priceList.findMany({
    where: {
      companyId,
      priceLevel: "PROMOTIONAL",
      isActive: true,
      OR: [
        {
          AND: [
            { effectiveFrom: { lte: onDate } },
            { effectiveTo: { gte: onDate } },
          ],
        },
        {
          effectiveFrom: null,
          effectiveTo: null,
        },
      ],
    },
  });

  const list: PromotionRule[] = [];
  for (const p of promoLists) {
    try {
      const meta = p.notes && p.notes.startsWith("{") ? JSON.parse(p.notes) : {};
      if (branchId && meta.applicableBranches && meta.applicableBranches.length > 0) {
        if (!meta.applicableBranches.includes(branchId)) continue;
      }
      list.push({
        id: p.id,
        code: p.code,
        name: p.name,
        effectiveFrom: p.effectiveFrom,
        effectiveTo: p.effectiveTo,
        isActive: p.isActive,
        discountType: meta.discountType || "PERCENTAGE",
        discountValue: Number(meta.discountValue || 0),
        minInvoiceValue: Number(meta.minInvoiceValue || 0),
        maxDiscountAmount: meta.maxDiscountAmount ? Number(meta.maxDiscountAmount) : null,
        applicableCategories: meta.applicableCategories || [],
        applicableBranches: meta.applicableBranches || [],
      });
    } catch {
      // ignore parse errors
    }
  }

  return list;
}

export function evaluatePromotionDiscount(
  promo: PromotionRule,
  subtotal: number
): { discountAmount: number; isEligible: boolean; reason?: string } {
  if (subtotal < promo.minInvoiceValue) {
    return {
      discountAmount: 0,
      isEligible: false,
      reason: `Invoice subtotal (Rs. ${subtotal.toLocaleString()}) does not meet the minimum Rs. ${promo.minInvoiceValue.toLocaleString()} requirement.`,
    };
  }

  let calcDiscount = 0;
  if (promo.discountType === "PERCENTAGE") {
    calcDiscount = (subtotal * promo.discountValue) / 100;
  } else {
    calcDiscount = promo.discountValue;
  }

  if (promo.maxDiscountAmount && calcDiscount > promo.maxDiscountAmount) {
    calcDiscount = promo.maxDiscountAmount;
  }

  calcDiscount = Math.min(calcDiscount, subtotal);

  return {
    discountAmount: Math.round(calcDiscount * 100) / 100,
    isEligible: true,
  };
}

