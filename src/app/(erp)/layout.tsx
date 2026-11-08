import { redirect } from "next/navigation";
import { ErpShell } from "@/components/shell/erp-shell";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  const context = await getAuthContext();
  if (!context) redirect("/login");
  if (context.user.forcePasswordChange) redirect("/change-password");

  const companyWide = context.roles.some((role) => !role.branchId && !role.warehouseId);
  const branchIds = [...new Set(context.roles.flatMap((role) => (role.branchId ? [role.branchId] : [])))];
  const warehouseIds = [...new Set(context.roles.flatMap((role) => (role.warehouseId ? [role.warehouseId] : [])))];

  const [branches, notifications] = await Promise.all([
    prisma.branch.findMany({
      where: {
        companyId: context.company.id,
        isActive: true,
        ...(companyWide
          ? {}
          : {
              OR: [
                { id: { in: branchIds } },
                { warehouses: { some: { id: { in: warehouseIds } } } },
              ],
            }),
      },
      select: {
        id: true,
        code: true,
        name: true,
        warehouses: {
          where: {
            isActive: true,
            ...(companyWide || !warehouseIds.length ? {} : { id: { in: warehouseIds } }),
          },
          select: { id: true, code: true, name: true, type: true },
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.notification.findMany({
      where: { companyId: context.company.id, recipientId: context.user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <ErpShell
      context={context}
      branches={branches}
      notifications={notifications.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), readAt: item.readAt?.toISOString() || null }))}
    >
      {children}
    </ErpShell>
  );
}
