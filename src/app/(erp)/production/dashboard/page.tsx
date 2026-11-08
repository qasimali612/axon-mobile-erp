import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock,
  Cpu,
  Factory,
  Layers,
  Smartphone,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

export const metadata = { title: "Production & Assembly Dashboard" };

export default async function ProductionDashboardPage() {
  const context = await requirePagePermission("production.view");
  const companyId = context.company.id;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [
    totalOrders,
    inProgressOrders,
    completedOrders,
    unitsProducedThisMonth,
    materialIssues,
    qcStats,
    recentOrders,
    topBoms,
  ] = await Promise.all([
    prisma.productionOrder.count({ where: { companyId } }),
    prisma.productionOrder.count({ where: { companyId, status: "IN_PROGRESS" } }),
    prisma.productionOrder.count({ where: { companyId, status: "COMPLETED" } }),
    prisma.productionOrderUnit.count({
      where: { productionOrder: { companyId }, createdAt: { gte: monthStart } },
    }),
    prisma.productionMaterialIssue.aggregate({
      where: { productionOrder: { companyId } },
      _sum: { totalCost: true, quantity: true },
    }),
    prisma.productionOrderUnit.groupBy({
      by: ["qcResult"],
      where: { productionOrder: { companyId } },
      _count: true,
    }),
    prisma.productionOrder.findMany({
      where: { companyId },
      include: {
        product: { select: { sku: true, name: true } },
        variant: { select: { sku: true, name: true, color: true } },
        bom: { select: { code: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.bom.findMany({
      where: { companyId, isActive: true },
      include: {
        product: { select: { sku: true, name: true } },
        variant: { select: { sku: true, name: true } },
        _count: { select: { productionOrders: true } },
      },
      orderBy: { productionOrders: { _count: "desc" } },
      take: 5,
    }),
  ]);

  const passedCount = qcStats.find((s) => s.qcResult === "PASS")?._count || 0;
  const totalQC = qcStats.reduce((sum, s) => sum + s._count, 0);
  const yieldRate = totalQC > 0 ? Math.round((passedCount / totalQC) * 100) : 100;

  const metrics = [
    {
      label: "Active In-Progress Orders",
      value: String(inProgressOrders),
      detail: `${totalOrders} lifetime production orders`,
      icon: Factory,
      href: "/production?status=IN_PROGRESS",
    },
    {
      label: "Assembled Phones (This Month)",
      value: String(unitsProducedThisMonth),
      detail: "Serialized with IMEI 1/2 and QC verified",
      icon: Smartphone,
      href: "/production",
    },
    {
      label: "Material Consumption Value",
      value: formatMoney(materialIssues._sum.totalCost?.toString() || "0", context.company.currencyCode),
      detail: `${Number(materialIssues._sum.quantity || 0)} CKD/SKD parts issued`,
      icon: Boxes,
      href: "/production",
    },
    {
      label: "Quality Control Yield",
      value: `${yieldRate}%`,
      detail: `${passedCount} of ${totalQC} units passed inspection`,
      icon: CheckCircle2,
      href: "/production",
    },
  ];

  return (
    <div className="mx-auto max-w-[1520px]">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="kicker">Manufacturing Operations</span>
            <Badge tone="green">
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live Assembly
            </Badge>
          </div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">Production & Assembly Dashboard</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Real-time smartphone assembly metrics, CKD/SKD material absorption, quality inspection yield, and device serialization.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/production/boms">
            <Button variant="outline">
              <Layers className="h-4 w-4" />
              Bills of Materials
            </Button>
          </Link>
          <Link href="/production">
            <Button>
              Production Orders
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <Link
            key={m.label}
            href={m.href}
            className="surface group p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-float"
          >
            <div className="flex items-start justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
                <m.icon className="h-[18px] w-[18px]" />
              </span>
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-blue-600" />
            </div>
            <p className="mt-5 text-2xl font-bold tracking-tight text-slate-950">{m.value}</p>
            <p className="mt-1 text-xs font-semibold text-slate-700">{m.label}</p>
            <p className="mt-1 text-[11px] text-slate-400">{m.detail}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {/* Recent Production Orders */}
        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recent Production Orders</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">Order execution and batch progress</p>
            </div>
            <Link href="/production" className="text-xs font-semibold text-blue-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {!recentOrders.length ? (
              <p className="p-8 text-center text-xs text-slate-400">No production orders yet.</p>
            ) : (
              recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/50">
                  <div>
                    <span className="font-mono text-xs font-bold text-slate-900">{order.orderNumber}</span>
                    <span className="block text-[11px] text-slate-500">
                      {order.product.name} ({order.variant.name})
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-xs font-bold text-slate-800">
                      {Number(order.completedQuantity)} / {Number(order.plannedQuantity)} units
                    </span>
                    <div className="mt-1">
                      <Badge tone={order.status === "COMPLETED" ? "green" : order.status === "IN_PROGRESS" ? "blue" : "amber"}>
                        {titleCase(order.status)}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Most Utilized Assembly BOMs */}
        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Top Assembly BOMs</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">Bills of materials by production orders scheduled</p>
            </div>
            <Link href="/production/boms" className="text-xs font-semibold text-blue-600 hover:underline">
              Manage BOMs
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {!topBoms.length ? (
              <p className="p-8 text-center text-xs text-slate-400">No active BOMs found.</p>
            ) : (
              topBoms.map((bom) => (
                <div key={bom.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-700">
                      <Layers className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="font-semibold text-xs text-slate-900">{bom.name}</p>
                      <p className="font-mono text-[10px] text-slate-400">{bom.code}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-slate-800">{bom._count.productionOrders} orders</span>
                    <span className="block text-[10px] text-slate-400">{bom.product.name}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

