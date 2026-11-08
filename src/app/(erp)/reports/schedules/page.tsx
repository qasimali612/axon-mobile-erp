import { ScheduleWorkspace } from "@/components/reports/schedule-workspace";
import { requirePagePermission } from "@/lib/auth";

export const metadata = { title: "Report schedules" };

export default async function ReportSchedulesPage() {
  const context = await requirePagePermission("report.export");
  return (
    <div className="mx-auto max-w-[1380px]">
      <ScheduleWorkspace canManage={context.permissions.includes("report.export")} />
    </div>
  );
}
