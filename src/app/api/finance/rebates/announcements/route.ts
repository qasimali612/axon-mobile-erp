import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { priceAnnouncementSchema } from "@/lib/finance/rebate-validation";
import { saveRebateProgram } from "@/lib/finance/rebates";
import { jsonSafe } from "@/lib/serializers";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("REBATE_MANAGE");
    const rawBody = await request.json();
    const input = priceAnnouncementSchema.parse(rawBody);

    const programCode = `ANN-${input.announcementNumber.replace(/[^A-Za-z0-9_-]/g, "")}`.toUpperCase().slice(0, 30);

    const program = await saveRebateProgram(
      { companyId: context.company.id, userId: context.user.id, currencyCode: context.company.currencyCode },
      {
        code: programCode,
        name: input.title,
        direction: "RECEIVABLE",
        supplierId: input.supplierId,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
        calculationMethod: "PRICE_PROTECTION",
        primaryAccountId: input.primaryAccountId,
        settlementAccountId: input.settlementAccountId,
        accountingTreatment: "INCOME",
        isActive: true,
        rules: {
          announcementNumber: input.announcementNumber,
          title: input.title,
          announcementDate: input.announcementDate,
          submissionDeadline: input.submissionDeadline ?? null,
          purchaseDateFrom: input.purchaseDateFrom ?? null,
          purchaseDateTo: input.purchaseDateTo ?? null,
          applicableBranches: input.applicableBranches ?? [],
          applicableWarehouses: input.applicableWarehouses ?? [],
          supportingDocRef: input.supportingDocRef ?? null,
          remarks: input.remarks ?? null,
          items: input.items,
        },
      }
    );

    return NextResponse.json(jsonSafe({ data: program }), { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(new ApiError(409, "DUPLICATE_ANNOUNCEMENT_CODE", "A price announcement with this number already exists."));
    }
    return apiError(error);
  }
}

