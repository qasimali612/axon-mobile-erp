import { AuditLog } from "@/components/audit/audit-log";
import { PageHeader } from "@/components/ui/page-header";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export const metadata = { title: "Audit trail" };

export default async function AuditPage() {
  const context = await requirePagePermission("audit.view");
  const companyId = context.company.id;
  const [events, total, moduleRows] = await Promise.all([
    prisma.auditLog.findMany({
      where: { companyId },
      include: { actor: { select: { fullName: true, email: true } }, branch: { select: { code: true, name: true } }, warehouse: { select: { code: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.auditLog.count({ where: { companyId } }),
    prisma.auditLog.findMany({ where: { companyId }, distinct: ["module"], select: { module: true }, orderBy: { module: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-[1520px]">
      <PageHeader
        kicker="Security monitoring"
        title="Audit trail"
        description="Inspect immutable login, access, configuration, catalog, and operational events with before-and-after context."
      />
      <AuditLog
        initialEvents={jsonSafe(events)}
        initialTotal={total}
        modules={moduleRows.map((item) => item.module)}
        canExport={context.permissions.includes("audit.export")}
      />
    </div>
  );
}
