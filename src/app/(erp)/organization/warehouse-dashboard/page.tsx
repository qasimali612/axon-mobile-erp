import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowRight,
  Boxes,
  Building2,
  CheckCircle2,
  CircleOff,
  Clock,
  Layers,
  MapPin,
  PackageOpen,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

export const metadata = { title: "Warehouse Operations Dashboard" };

export default async function WarehouseDashboardPage() {
  const context = await requirePagePermission("organization.warehouse.view");
  const companyId = context.company.id;
  const currency = context.company.currencyCode;

  const [
    warehouses,
    locationStats,
    inTransitTransfers,
    pendingReceipts,
    physicalUnitsByWarehouse,
  ] = await Promise.all([
    prisma.warehouse.findMany({
      where: { companyId },
      include: {
        branch: { select: { id: true, code: true, name: true } },
        _count: { select: { locations: true, physicalStockUnits: true, stockBalances: true } },
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
    prisma.warehouseLocation.groupBy({
      by: ["type"],
      where: { warehouse: { companyId } },
      _count: true,
    }),
    prisma.stockTransfer.findMany({
      where: {
        companyId,
        status: { in: ["SUBMITTED", "APPROVED"] },
      },
      include: {
        sourceWarehouse: { select: { code: true, name: true } },
        destinationWarehouse: { select: { code: true, name: true } },
        lines: { select: { quantity: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.purchaseReceipt.findMany({
      where: {
        companyId,
        status: { in: ["SUBMITTED"] },
      },
      include: {
        supplier: { select: { name: true } },
        warehouse: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.physicalStockUnit.groupBy({
      by: ["currentWarehouseId", "status"],
      where: { companyId },
      _count: true,
    }),
  ]);

  const activeWarehouses = warehouses.filter((w) => w.isActive);
  const totalBins = locationStats.find((l) => l.type === "BIN")?._count || 0;
  const totalRacks = locationStats.find((l) => l.type === "RACK")?._count || 0;
  const totalZones = locationStats.find((l) => l.type === "ZONE")?._count || 0;
  const totalLocations = warehouses.reduce((sum, w) => sum + (w._count?.locations || 0), 0);

  const metrics = [
    {
      label: "Active Warehouses",
      value: String(activeWarehouses.length),
      detail: `${warehouses.length} registered facilities`,
      icon: WarehouseIcon,
      href: "/organization?tab=warehouses",
    },
    {
      label: "Storage Bins & Locations",
      value: String(totalLocations),
      detail: `${totalBins} bins · ${totalRacks} racks · ${totalZones} zones`,
      icon: MapPin,
      href: "/organization/locations",
    },
    {
      label: "Transfers Awaiting Action",
      value: String(inTransitTransfers.length),
      detail: "Inter-warehouse stock movements",
      icon: ArrowLeftRight,
      href: "/inventory/transfers",
    },
    {
      label: "Receipts Awaiting Inspection",
      value: String(pendingReceipts.length),
      detail: "Inbound vendor shipments",
      icon: PackageOpen,
      href: "/goods-receipts",
    },
  ];

  return (
    <div className="mx-auto max-w-[1520px]">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="kicker">Logistics Command Center</span>
            <Badge tone="green">
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Facilities Online
            </Badge>
          </div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">Warehouse Operations Dashboard</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Multi-branch warehouse locations, physical bin hierarchy, in-transit transfers, and incoming receipt inspections.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/organization/locations">
            <Button variant="outline">
              <MapPin className="h-4 w-4" />
              Manage Bins
            </Button>
          </Link>
          <Link href="/inventory/transfers">
            <Button>
              <ArrowLeftRight className="h-4 w-4" />
              Stock Transfers
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
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

      {/* Facility Grid */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {warehouses.map((wh) => {
          const whUnits = physicalUnitsByWarehouse
            .filter((u) => u.currentWarehouseId === wh.id && u.status === "IN_STOCK")
            .reduce((sum, u) => sum + u._count, 0);

          return (
            <article key={wh.id} className="surface p-5">
              <div className="flex items-start justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700">
                  <WarehouseIcon className="h-5 w-5" />
                </span>
                <div className="flex items-center gap-1.5">
                  {wh.isDefault ? <Badge tone="blue">Default Facility</Badge> : null}
                  <Badge tone={wh.isActive ? "green" : "amber"}>{wh.isActive ? "Active" : "Inactive"}</Badge>
                </div>
              </div>
              <div className="mt-4">
                <h3 className="font-bold text-slate-900">{wh.name}</h3>
                <p className="text-[11px] text-slate-400">
                  {wh.code} · {wh.branch.name} ({wh.branch.code}) · {titleCase(wh.type)}
                </p>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="surface-muted p-3">
                  <p className="text-[9px] uppercase font-bold text-slate-400">Storage Bins</p>
                  <p className="mt-1 font-mono text-sm font-bold text-slate-800">{wh._count.locations}</p>
                </div>
                <div className="surface-muted p-3">
                  <p className="text-[9px] uppercase font-bold text-slate-400">Physical Devices</p>
                  <p className="mt-1 font-mono text-sm font-bold text-slate-800">{whUnits}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  {wh.allowReceiving ? (
                    <span className="flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Receiving
                    </span>
                  ) : (
                    <span className="text-slate-400">No receiving</span>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  {wh.allowDispatch ? (
                    <span className="flex items-center gap-1 text-blue-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Dispatch
                    </span>
                  ) : (
                    <span className="text-slate-400">No dispatch</span>
                  )}
                </span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {/* Active In-Transit Stock Transfers */}
        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Inter-Warehouse Transfers</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">Active dispatches and pending transfers</p>
            </div>
            <Link href="/inventory/transfers" className="text-xs font-semibold text-blue-600 hover:underline">
              View register
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {!inTransitTransfers.length ? (
              <p className="p-8 text-center text-xs text-slate-400">No transfers currently in transit.</p>
            ) : (
              inTransitTransfers.map((t) => {
                const totalUnits = t.lines.reduce((sum, l) => sum + Number(l.quantity), 0);
                return (
                  <div key={t.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/50">
                    <div>
                      <span className="font-mono text-xs font-bold text-slate-900">{t.transferNumber}</span>
                      <span className="block text-[11px] text-slate-500">
                        {t.sourceWarehouse.code} → {t.destinationWarehouse.code}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-xs font-bold text-slate-800">{totalUnits} units</span>
                      <div className="mt-1">
                        <Badge tone="amber">{titleCase(t.status)}</Badge>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Incoming Shipments Awaiting Inspection */}
        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Inbound Vendor Deliveries</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">Purchase receipts awaiting quality check & posting</p>
            </div>
            <Link href="/goods-receipts" className="text-xs font-semibold text-blue-600 hover:underline">
              Goods receipts
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {!pendingReceipts.length ? (
              <p className="p-8 text-center text-xs text-slate-400">No pending supplier shipments awaiting check.</p>
            ) : (
              pendingReceipts.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/50">
                  <div>
                    <span className="font-mono text-xs font-bold text-slate-900">{r.receiptNumber}</span>
                    <span className="block text-[11px] text-slate-500">
                      {r.supplier.name} → {r.warehouse.name}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-xs font-bold text-slate-800">
                      {formatMoney(r.grandTotal.toString(), currency)}
                    </span>
                    <div className="mt-1">
                      <Badge tone="amber">Pending QC</Badge>
                    </div>
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

