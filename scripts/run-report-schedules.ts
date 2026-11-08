/**
 * Due-report runner for the host scheduler (Windows Task Scheduler or cron).
 *
 * The application deliberately keeps no in-process timer: this script decides what is due, calls the
 * same audited CSV endpoint a person would use, writes a dated file into ./exports and records the
 * run on the schedule. Run it hourly; cadence decides which schedules actually execute.
 *
 *   npm run reports:run-schedules
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.REPORT_SCHEDULE_BASE_URL || process.env.OPERATIONS_TEST_BASE_URL || "http://127.0.0.1:3000";
const exportDir = process.env.REPORT_EXPORT_DIR || "./exports";

const CADENCE_HOURS: Record<string, number> = { DAILY: 24, WEEKLY: 24 * 7, MONTHLY: 24 * 30 };

function isDue(lastRunAt: Date | null, cadence: string, now: Date) {
  if (!lastRunAt) return true;
  const hours = CADENCE_HOURS[cadence] ?? 24;
  return now.getTime() - lastRunAt.getTime() >= hours * 3_600_000;
}

async function main() {
  mkdirSync(exportDir, { recursive: true });
  const schedules = await prisma.reportSchedule.findMany({ where: { isActive: true }, include: { createdBy: { select: { id: true, email: true } } } });
  const now = new Date();
  let ran = 0;
  let skipped = 0;

  for (const schedule of schedules) {
    if (!isDue(schedule.lastRunAt, schedule.cadence, now)) { skipped += 1; continue; }
    const token = randomBytes(32).toString("base64url");
    const userAgent = `Axon-ScheduleRunner/${schedule.name}`;
    const session = await prisma.session.create({
      data: {
        tokenHash: createHash("sha256").update(token).digest("hex"),
        userId: schedule.createdById,
        activeCompanyId: schedule.companyId,
        ipAddress: "127.0.0.1",
        userAgent,
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    try {
      const query = new URLSearchParams({ report: schedule.reportKey, format: "csv", limit: "1000" });
      for (const [key, value] of Object.entries((schedule.filters ?? {}) as Record<string, string>)) if (value) query.set(key, value);
      const response = await fetch(`${baseUrl}/api/reports/operations?${query.toString()}`, { headers: { Cookie: `axon_session=${token}`, "User-Agent": userAgent } });
      if (!response.ok) {
        await prisma.reportSchedule.update({ where: { id: schedule.id }, data: { lastRunAt: now, lastRunStatus: "FAILED", lastRunRows: null } });
        console.error(`✗ ${schedule.name}: HTTP ${response.status}`);
        continue;
      }
      // Keep the raw bytes: decoding to text first would strip the UTF-8 BOM the report endpoint adds.
      const payload = Buffer.from(await response.arrayBuffer());
      const rows = Math.max(0, payload.toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0).length - 2);
      const safeName = schedule.name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || schedule.reportKey;
      const fileName = `${safeName}-${now.toISOString().slice(0, 10)}.csv`;
      writeFileSync(join(exportDir, fileName), payload);
      await prisma.reportSchedule.update({ where: { id: schedule.id }, data: { lastRunAt: now, lastRunStatus: "SUCCEEDED", lastRunRows: rows } });
      console.log(`✓ ${schedule.name} → ${join(exportDir, fileName)} (${rows} rows, ${schedule.recipients})`);
      ran += 1;
    } finally {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    }
  }

  console.log(`Report schedules: ${ran} ran, ${skipped} not due, ${schedules.length} active.`);
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
