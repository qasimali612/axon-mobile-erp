import { Suspense } from "react";
import { UserManager } from "@/components/access/user-manager";
import { PageHeader } from "@/components/ui/page-header";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const context = await requirePagePermission("access.user.view");
  const companyId = context.company.id;
  const [memberships, roles, branches, warehouses] = await Promise.all([
    prisma.companyMembership.findMany({
      where: { companyId, status: { not: "ENDED" } },
      include: { user: true, userRoles: { include: { role: true, branch: true, warehouse: true }, orderBy: { createdAt: "asc" } } },
      orderBy: { user: { fullName: "asc" } },
    }),
    prisma.role.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, name: true, isSystem: true }, orderBy: { name: "asc" } }),
    prisma.branch.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ where: { companyId, isActive: true }, select: { id: true, branchId: true, code: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-[1520px]">
      <PageHeader
        kicker="Identity & scope"
        title="Users"
        description="Provision people with explicit roles and company, branch, or warehouse scope. Sensitive changes revoke sessions and create audit events."
      />
      <Suspense fallback={<div className="surface h-96 animate-pulse bg-slate-50" />}>
        <UserManager
          initialMemberships={memberships}
          roles={roles}
          branches={branches}
          warehouses={warehouses}
          permissions={context.permissions}
          currentUserId={context.user.id}
        />
      </Suspense>
    </div>
  );
}
