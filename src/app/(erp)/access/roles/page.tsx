import { RoleManager } from "@/components/access/role-manager";
import { PageHeader } from "@/components/ui/page-header";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  const context = await requirePagePermission("access.role.view");
  const [roles, permissionCatalog] = await Promise.all([
    prisma.role.findMany({
      where: { companyId: context.company.id },
      include: { permissions: { include: { permission: true } }, _count: { select: { userRoles: true } } },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    }),
    prisma.permission.findMany({ orderBy: [{ module: "asc" }, { action: "asc" }] }),
  ]);

  return (
    <div className="mx-auto max-w-[1520px]">
      <PageHeader
        kicker="Authorization policy"
        title="Roles & permissions"
        description="Review 80 server-enforced actions and create least-privilege custom roles. System role baselines remain protected."
      />
      <RoleManager initialRoles={roles} permissionCatalog={permissionCatalog} permissions={context.permissions} />
    </div>
  );
}
