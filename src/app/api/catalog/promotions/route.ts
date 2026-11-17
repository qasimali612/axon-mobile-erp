import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

const promotionInputSchema = z.object({
  name: z.string().min(3).max(120),
  code: z.string().min(3).max(30),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  discountType: z.enum(["PERCENTAGE", "FIXED"]),
  discountValue: z.number().positive(),
  minInvoiceValue: z.number().nonnegative().optional().default(0),
  maxDiscountAmount: z.number().positive().optional().nullable(),
  applicableCategories: z.array(z.string()).optional().default([]),
  applicableBranches: z.array(z.string()).optional().default([]),
  isActive: z.boolean().optional().default(true),
  notes: z.string().max(500).optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const context = await requirePermission("catalog.pricelist.view");
    const companyId = context.company.id;

    // Fetch promotional price lists
    const promoLists = await prisma.priceList.findMany({
      where: {
        companyId,
        priceLevel: "PROMOTIONAL",
      },
      include: {
        items: {
          include: {
            variant: {
              select: { id: true, sku: true, name: true, retailPrice: true, product: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const promotions = promoLists.map((p) => {
      let meta: any = {};
      try {
        if (p.notes && p.notes.startsWith("{")) {
          meta = JSON.parse(p.notes);
        }
      } catch {
        meta = {};
      }
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        priceLevel: p.priceLevel,
        currencyCode: p.currencyCode,
        effectiveFrom: p.effectiveFrom,
        effectiveTo: p.effectiveTo,
        isActive: p.isActive,
        discountType: meta.discountType || "PERCENTAGE",
        discountValue: meta.discountValue || 0,
        minInvoiceValue: meta.minInvoiceValue || 0,
        maxDiscountAmount: meta.maxDiscountAmount || null,
        applicableCategories: meta.applicableCategories || [],
        applicableBranches: meta.applicableBranches || [],
        notes: meta.notes || p.notes,
        itemCount: p.items.length,
        items: p.items,
      };
    });

    return NextResponse.json(jsonSafe({ data: promotions }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("catalog.pricelist.create");
    const json = await request.json();
    const input = promotionInputSchema.parse(json);

    const fromDate = new Date(`${input.startDate}T00:00:00.000Z`);
    const toDate = new Date(`${input.endDate}T23:59:59.999Z`);
    if (toDate < fromDate) {
      throw new ApiError(422, "INVALID_DATE_RANGE", "End date cannot be prior to start date.");
    }

    const promoMetadata = {
      discountType: input.discountType,
      discountValue: input.discountValue,
      minInvoiceValue: input.minInvoiceValue,
      maxDiscountAmount: input.maxDiscountAmount,
      applicableCategories: input.applicableCategories,
      applicableBranches: input.applicableBranches,
      notes: input.notes,
    };

    const promo = await prisma.priceList.create({
      data: {
        companyId: context.company.id,
        code: input.code.toUpperCase(),
        name: input.name,
        priceLevel: "PROMOTIONAL",
        currencyCode: context.company.currencyCode,
        effectiveFrom: fromDate,
        effectiveTo: toDate,
        isDefault: false,
        isActive: input.isActive,
        notes: JSON.stringify(promoMetadata),
      },
    });

    await appendAudit(
      {
        companyId: context.company.id,
        actorId: context.user.id,
        branchId: context.activeBranchId,
        action: "PROMOTION_CREATED",
        module: "catalog",
        entityType: "PriceList",
        entityId: promo.id,
        entityReference: promo.code,
        newValues: {
          code: promo.code,
          name: promo.name,
          discountType: input.discountType,
          discountValue: input.discountValue,
        },
      },
      prisma
    );

    return NextResponse.json(jsonSafe({ data: promo }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

