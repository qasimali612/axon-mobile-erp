import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { approveJournal, postJournal, submitJournal } from "@/lib/finance/posting";
import { prisma } from "@/lib/prisma";

const actionSchema = z.object({
  action: z.enum(["submit", "approve", "post", "cancel"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const context = await requireAuth();
    const { id } = await params;
    const json = await request.json();
    const { action } = actionSchema.parse(json);

    const actor = {
      companyId: context.company.id,
      userId: context.user.id,
      currencyCode: context.company.currencyCode,
      permissions: context.permissions,
    };

    let result;
    if (action === "submit") {
      if (!context.permissions.includes("expense.manage") && !context.permissions.includes("GL_CREATE")) {
        throw new ApiError(403, "FORBIDDEN", "Permission to submit expenses is not granted.");
      }
      result = await submitJournal(actor, id);
    } else if (action === "approve") {
      if (!context.permissions.includes("expense.approve") && !context.permissions.includes("GL_APPROVE")) {
        throw new ApiError(403, "FORBIDDEN", "Permission to approve expenses is not granted.");
      }
      result = await approveJournal(actor, id);
    } else if (action === "post") {
      if (!context.permissions.includes("expense.approve") && !context.permissions.includes("GL_POST")) {
        throw new ApiError(403, "FORBIDDEN", "Permission to post expenses is not granted.");
      }
      result = await postJournal(actor, id);
    } else if (action === "cancel") {
      // Only draft or submitted expenses can be cancelled
      const existing = await prisma.journalEntry.findFirst({
        where: { id, companyId: context.company.id },
      });
      if (!existing) throw new ApiError(404, "NOT_FOUND", "Expense voucher not found.");
      if (existing.status === "POSTED") {
        throw new ApiError(409, "ALREADY_POSTED", "Posted expense vouchers cannot be cancelled directly. Use journal reversal.");
      }
      result = await prisma.journalEntry.update({
        where: { id },
        data: { status: "REJECTED" },
      });
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    return apiError(error);
  }
}

