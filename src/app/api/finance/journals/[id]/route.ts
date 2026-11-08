import { NextResponse } from "next/server";
import { apiError, ApiError } from "@/lib/api";
import { assertPermittedBranch, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";
import { idSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const context = await requirePermission("GL_VIEW");
    const id = idSchema.parse((await params).id);
    const journal = await prisma.journalEntry.findFirst({
      where: { id, companyId: context.company.id },
      include: {
        company: { select: { code: true, name: true, currencyCode: true } },
        branch: { select: { code: true, name: true } },
        period: { include: { fiscalYear: { select: { code: true, name: true } } } },
        preparedBy: { select: { id: true, fullName: true, email: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
        postedBy: { select: { id: true, fullName: true, email: true } },
        reversedBy: { select: { id: true, fullName: true, email: true } },
        reversalOf: { select: { id: true, voucherNumber: true } },
        reversals: { select: { id: true, voucherNumber: true, status: true } },
        lines: {
          include: {
            account: { select: { code: true, name: true, accountClass: true } },
            customer: { select: { code: true, name: true } },
            supplier: { select: { code: true, name: true } },
            bankAccount: { select: { code: true, bankName: true, accountNumberLast4: true } },
            salesperson: { select: { id: true, fullName: true } },
            costCenter: { select: { code: true, name: true } },
            department: { select: { code: true, name: true } },
          },
          orderBy: { lineNumber: "asc" },
        },
      },
    });
    if (!journal) throw new ApiError(404, "JOURNAL_NOT_FOUND", "Journal voucher was not found.");
    assertPermittedBranch(context, "GL_VIEW", journal.branchId);
    return NextResponse.json(jsonSafe({ data: journal }));
  } catch (error) {
    return apiError(error);
  }
}
