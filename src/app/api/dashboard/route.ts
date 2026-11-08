import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export async function GET() {
  try {
    const context = await requirePermission("dashboard.view");
    const companyId = context.company.id;
    const [
      activeProducts,
      activeVariants,
      branches,
      warehouses,
      activeUsers,
      customRoles,
      trackingGroups,
      brands,
      recentAudit,
    ] = await Promise.all([
      prisma.product.count({ where: { companyId, status: "ACTIVE" } }),
      prisma.productVariant.count({ where: { companyId, isActive: true } }),
      prisma.branch.count({ where: { companyId, isActive: true } }),
      prisma.warehouse.count({ where: { companyId, isActive: true } }),
      prisma.companyMembership.count({ where: { companyId, status: "ACTIVE" } }),
      prisma.role.count({ where: { companyId, isActive: true, isSystem: false } }),
      prisma.product.groupBy({ by: ["trackingMethod"], where: { companyId, status: "ACTIVE" }, _count: true }),
      prisma.brand.findMany({
        where: { companyId, isActive: true },
        select: { name: true, _count: { select: { products: true } } },
        orderBy: { products: { _count: "desc" } },
        take: 6,
      }),
      prisma.auditLog.findMany({
        where: { companyId },
        include: { actor: { select: { fullName: true } } },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
    ]);

    return NextResponse.json(
      jsonSafe({
        data: {
          metrics: { activeProducts, activeVariants, branches, warehouses, activeUsers, customRoles },
          trackingGroups: trackingGroups.map((group) => ({ name: group.trackingMethod, value: group._count })),
          brands: brands.map((brand) => ({ name: brand.name, products: brand._count.products })),
          recentAudit,
          phase: { current: 1, completed: 1, total: 6 },
        },
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
