import { requirePagePermission } from "@/lib/auth";
import { BackupWorkspace } from "@/components/settings/backup-workspace";

export const metadata = {
  title: "Database Backup & Recovery Studio · Axon ERP",
  description: "Create, download, and restore complete verified database snapshots",
};

export default async function BackupPage() {
  const context = await requirePagePermission("backup.manage");
  const canRestore = context.permissions.includes("backup.restore");

  return (
    <BackupWorkspace
      canRestore={canRestore}
      companyCode={context.company.code}
    />
  );
}

