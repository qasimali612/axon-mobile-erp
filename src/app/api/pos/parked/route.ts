import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    const base = await requireAuth();
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId");

    const drafts = await prisma.salesInvoice.findMany({
      where: {
        companyId: base.company.id,
        status: "DRAFT",
        ...(branchId ? { branchId } : {}),
      },
      include: {
        customer: { select: { id: true, code: true, name: true, paymentTermsDays: true, creditLimit: true } },
        salesperson: { select: { id: true, fullName: true } },
        lines: {
          include: {
            product: true,
            variant: true,
            units: { include: { stockUnit: { include: { identifiers: true } } } },
          },
          orderBy: { lineNumber: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    return NextResponse.json(jsonSafe({ data: drafts }));
  } catch (error) {
    return apiError(error);
  }
}

