import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { REPORT_KEYS } from "@/lib/reports/keys";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

const scheduleSchema = z.object({
  name: z.string().trim().min(3).max(120),
  reportKey: z.enum(REPORT_KEYS),
  filters: z.record(z.string(), z.string().max(200)).default({}),
  cadence: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  recipients: z.string().trim().min(3).max(400),
  isActive: z.boolean().default(true),
});

export async function GET() {
  try {
    const context = await requirePermission("report.export");
    const data = await prisma.reportSchedule.findMany({ where: { companyId: context.company.id }, orderBy: [{ isActive: "desc" }, { name: "asc" }] });
    return NextResponse.json(jsonSafe({ data }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("report.export");
    const input = scheduleSchema.parse(await request.json());
    const created = await prisma.$transaction(async (tx) => {
      const existing = await tx.reportSchedule.findUnique({ where: { companyId_name: { companyId: context.company.id, name: input.name } }, select: { id: true } });
      if (existing) throw new ApiError(409, "SCHEDULE_NAME_TAKEN", "A schedule with this name already exists.");
      const row = await tx.reportSchedule.create({
        data: { companyId: context.company.id, createdById: context.user.id, name: input.name, reportKey: input.reportKey, filters: input.filters, cadence: input.cadence, recipients: input.recipients, isActive: input.isActive },
      });
      await appendAudit({
        companyId: context.company.id,
        actorId: context.user.id,
        action: "REPORT_SCHEDULE_CREATED",
        module: "reports",
        entityType: "ReportSchedule",
        entityId: row.id,
        entityReference: row.name,
        newValues: { reportKey: row.reportKey, cadence: row.cadence, recipients: row.recipients },
      }, tx);
      return row;
    });
    return NextResponse.json(jsonSafe({ data: created }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
