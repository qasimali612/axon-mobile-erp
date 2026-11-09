import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { evaluateStockEligibility, evaluateCustomerRebateEligibility } from "@/lib/finance/rebate-eligibility";
import { jsonSafe } from "@/lib/serializers";

const querySchema = z.object({
  type: z.enum(["STOCK", "CUSTOMER"]).default("STOCK"),
  variantIds: z.array(z.string().uuid()).optional(),
  supplierId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  warehouseId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("REBATE_VIEW");
    const body = await request.json().catch(() => ({}));
    const input = querySchema.parse(body);

    if (input.type === "CUSTOMER") {
      if (!input.customerId) {
        return NextResponse.json({ error: { message: "customerId is required for customer eligibility check." } }, { status: 400 });
      }
      const data = await evaluateCustomerRebateEligibility({
        companyId: context.company.id,
        customerId: input.customerId,
        variantIds: input.variantIds,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      });
      return NextResponse.json(jsonSafe({ data }));
    }

    const data = await evaluateStockEligibility({
      companyId: context.company.id,
      variantIds: input.variantIds,
      supplierId: input.supplierId,
      warehouseId: input.warehouseId,
      branchId: input.branchId,
      purchaseFrom: input.dateFrom,
      purchaseTo: input.dateTo,
    });

    return NextResponse.json(jsonSafe({ data }));
  } catch (error) {
    return apiError(error);
  }
}

