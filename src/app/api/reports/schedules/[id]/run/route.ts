import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Runs a schedule now: executes the audited operational CSV endpoint with the caller's own session,
 * records the run, and streams the file back so the operator can inspect exactly what the schedule
 * would deliver. Recipients are recorded on the definition; distribution is handled by the host's
 * mail relay or the exports folder (see docs/OUTPUT-AND-SCHEDULES.md).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("report.export");
    const { id } = await params;
    const schedule = await prisma.reportSchedule.findFirst({ where: { id, companyId: context.company.id } });
    if (!schedule) throw new ApiError(404, "SCHEDULE_NOT_FOUND", "The report schedule was not found.");
    if (!schedule.isActive) throw new ApiError(409, "SCHEDULE_INACTIVE", "This schedule is inactive.");

    const origin = new URL(request.url).origin;
    const query = new URLSearchParams({ report: schedule.reportKey, format: "csv", limit: "1000" });
    for (const [key, value] of Object.entries((schedule.filters ?? {}) as Record<string, string>)) {
      if (value) query.set(key, value);
    }
    const cookie = request.headers.get("cookie") || "";
    const response = await fetch(`${origin}/api/reports/operations?${query.toString()}`, { headers: { Cookie: cookie, "User-Agent": `Axon-ScheduleRunner/${schedule.name}` }, cache: "no-store" });
    if (!response.ok) {
      await prisma.reportSchedule.update({ where: { id }, data: { lastRunAt: new Date(), lastRunStatus: "FAILED", lastRunRows: null } });
      throw new ApiError(502, "SCHEDULE_RUN_FAILED", "The report could not be generated for this schedule.");
    }
    // Copy the bytes, not the decoded text: decoding drops the UTF-8 BOM that spreadsheet tools need.
    const buffer = Buffer.from(await response.arrayBuffer());
    const csv = buffer.toString("utf8").replace(/^\uFEFF/, "");
    const rows = Math.max(0, csv.split(/\r?\n/).filter((line) => line.trim().length > 0).length - 2);
    await prisma.$transaction(async (tx) => {
      await tx.reportSchedule.update({ where: { id }, data: { lastRunAt: new Date(), lastRunStatus: "SUCCEEDED", lastRunRows: rows } });
      await appendAudit({
        companyId: context.company.id,
        actorId: context.user.id,
        action: "REPORT_SCHEDULE_RUN",
        module: "reports",
        entityType: "ReportSchedule",
        entityId: schedule.id,
        entityReference: schedule.name,
        metadata: { reportKey: schedule.reportKey, rows },
      }, tx);
    });
    return new Response(buffer, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${(schedule.name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || schedule.reportKey)}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
