import { NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { companySchema } from "@/lib/validation";

export async function GET() {
  try {
    const context = await requirePermission("organization.company.view");
    const company = await prisma.company.findUniqueOrThrow({ where: { id: context.company.id } });
    return NextResponse.json({ data: company });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("organization.company.edit");
    const input = companySchema.parse(await request.json());
    const previous = await prisma.company.findUniqueOrThrow({ where: { id: context.company.id } });
    const company = await prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id: context.company.id },
        data: {
          name: input.name,
          legalName: input.legalName || null,
          registrationNumber: input.registrationNumber || null,
          taxRegistrationNumber: input.taxRegistrationNumber || null,
          addressLine1: input.addressLine1 || null,
          addressLine2: input.addressLine2 || null,
          countryCode: input.countryCode,
          province: input.province || null,
          city: input.city || null,
          postalCode: input.postalCode || null,
          phone: input.phone || null,
          email: input.email || null,
          currencyCode: input.currencyCode,
          timeZone: input.timeZone,
          fiscalYearStartMonth: input.fiscalYearStartMonth,
          decimalPrecision: input.decimalPrecision,
          inventoryCostingMethod: input.inventoryCostingMethod,
          allowNegativeStock: input.allowNegativeStock,
        },
      });
      await appendAudit(
        {
          companyId: context.company.id,
          actorId: context.user.id,
          action: "COMPANY_SETTINGS_UPDATED",
          module: "organization",
          entityType: "Company",
          entityId: context.company.id,
          entityReference: previous.code,
          previousValues: {
            name: previous.name,
            currencyCode: previous.currencyCode,
            timeZone: previous.timeZone,
            fiscalYearStartMonth: previous.fiscalYearStartMonth,
            inventoryCostingMethod: previous.inventoryCostingMethod,
            allowNegativeStock: previous.allowNegativeStock,
          },
          newValues: input,
        },
        tx,
      );
      return updated;
    });
    return NextResponse.json({ data: company });
  } catch (error) {
    return apiError(error);
  }
}
