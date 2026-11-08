import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const context = await requireAuth();
    const { id } = await params;
    await prisma.$transaction(async (tx) => {
      const row = await tx.savedView.findFirst({ where: { id, companyId: context.company.id, userId: context.user.id } });
      if (!row) throw new ApiError(404, "VIEW_NOT_FOUND", "The saved view was not found.");
      await tx.savedView.delete({ where: { id } });
      await appendAudit({
        companyId: context.company.id,
        actorId: context.user.id,
        action: "SAVED_VIEW_DELETED",
        module: "reports",
        entityType: "SavedView",
        entityId: row.id,
        entityReference: `${row.module}/${row.name}`,
      }, tx);
    });
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    return apiError(error);
  }
}
