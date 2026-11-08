import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

const updateSchema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  cadence: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).optional(),
  recipients: z.string().trim().min(3).max(400).optional(),
  isActive: z.boolean().optional(),
  filters: z.record(z.string(), z.string().max(200)).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("report.export");
    const { id } = await params;
    const input = updateSchema.parse(await request.json());
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.reportSchedule.findFirst({ where: { id, companyId: context.company.id } });
      if (!existing) throw new ApiError(404, "SCHEDULE_NOT_FOUND", "The report schedule was not found.");
      const row = await tx.reportSchedule.update({ where: { id }, data: { ...input } });
      await appendAudit({
        companyId: context.company.id,
        actorId: context.user.id,
        action: "REPORT_SCHEDULE_UPDATED",
        module: "reports",
        entityType: "ReportSchedule",
        entityId: row.id,
        entityReference: row.name,
        previousValues: { cadence: existing.cadence, recipients: existing.recipients, isActive: existing.isActive },
        newValues: { cadence: row.cadence, recipients: row.recipients, isActive: row.isActive },
      }, tx);
      return row;
    });
    return NextResponse.json(jsonSafe({ data: updated }));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("report.export");
    const { id } = await params;
    await prisma.$transaction(async (tx) => {
      const row = await tx.reportSchedule.findFirst({ where: { id, companyId: context.company.id } });
      if (!row) throw new ApiError(404, "SCHEDULE_NOT_FOUND", "The report schedule was not found.");
      await tx.reportSchedule.delete({ where: { id } });
      await appendAudit({ companyId: context.company.id, actorId: context.user.id, action: "REPORT_SCHEDULE_DELETED", module: "reports", entityType: "ReportSchedule", entityId: row.id, entityReference: row.name }, tx);
    });
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    return apiError(error);
  }
}
