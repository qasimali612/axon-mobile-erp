import { Suspense } from "react";
import { OrganizationManager } from "@/components/organization/organization-manager";
import { PageHeader } from "@/components/ui/page-header";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Organization" };

export default async function OrganizationPage() {
  const context = await requirePagePermission("organization.branch.view");
  const companyId = context.company.id;
  const [company, branches, warehouses, departments] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
    prisma.branch.findMany({
      where: { companyId, archivedAt: null },
      include: { _count: { select: { warehouses: true } } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    prisma.warehouse.findMany({
      where: { companyId, archivedAt: null },
      include: { branch: { select: { id: true, code: true, name: true } }, _count: { select: { locations: true } } },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
    prisma.department.findMany({
      where: { companyId },
      include: {
        branch: { select: { id: true, code: true, name: true } },
        _count: { select: { journalLines: true, assets: true, budgets: true } },
      },
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
    }),
  ]);

  return (
    <div className="mx-auto max-w-[1520px]">
      <PageHeader
        kicker="Company structure"
        title="Organization & locations"
        description="Control company policy, branch numbering, warehouse responsibilities, departments, and physical storage hierarchy."
      />
      <Suspense fallback={<div className="surface h-96 animate-pulse bg-slate-50" />}>
        <OrganizationManager
          initialCompany={company}
          initialBranches={branches}
          initialWarehouses={warehouses}
          initialDepartments={departments}
          permissions={context.permissions}
        />
      </Suspense>
    </div>
  );
}
