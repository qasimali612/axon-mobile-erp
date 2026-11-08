import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Building2,
  CheckCircle2,
  Clock,
  Layers,
  PackageSearch,
  Scale,
  ShieldAlert,
  Smartphone,
  TrendingDown,
  Warehouse,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

export const metadata = { title: "Inventory & Stock Dashboard" };

export default async function InventoryDashboardPage() {
  const context = await requirePagePermission("inventory.stock.view");
  const companyId = context.company.id;
  const currency = context.company.currencyCode;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [
    stockAggregation,
    unitsByStatus,
    reservationsAgg,
    stockBalances,
    movementsThisMonth,
    warehouses,
  ] = await Promise.all([
    prisma.stockBalance.aggregate({
      where: { companyId },
      _sum: { quantity: true, inventoryValue: true },
    }),
    prisma.physicalStockUnit.groupBy({
      by: ["status"],
      where: { companyId },
      _count: true,
    }),
    prisma.inventoryReservation.aggregate({
      where: { companyId, releasedAt: null },
      _sum: { quantity: true },
    }),
    prisma.stockBalance.findMany({
      where: { companyId, quantity: { gt: 0 } },
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            productType: true,
            trackingMethod: true,
            reorderLevel: true,
            category: { select: { name: true } },
            brand: { select: { name: true } },
          },
        },
        variant: { select: { sku: true, name: true, color: true } },
        warehouse: { select: { id: true, code: true, name: true } },
      },
      orderBy: { inventoryValue: "desc" },
    }),
    prisma.inventoryMovement.groupBy({
      by: ["movementType"],
      where: { companyId, postingDate: { gte: monthStart } },
      _count: true,
      _sum: { quantity: true, totalCost: true },
    }),
    prisma.warehouse.findMany({
      where: { companyId, isActive: true },
      include: {
        _count: { select: { stockBalances: true, locations: true } },
      },
    }),
  ]);

  const totalQty = Number(stockAggregation._sum?.quantity || 0);
  const totalValuation = stockAggregation._sum?.inventoryValue?.toString() || "0";
  const reservedQty = Number(reservationsAgg._sum?.quantity || 0);

  const inStockPhones = unitsByStatus.find((u) => u.status === "IN_STOCK")?._count || 0;
  const soldPhones = unitsByStatus.find((u) => u.status === "SOLD")?._count || 0;
  const reservedPhones = unitsByStatus.find((u) => u.status === "RESERVED")?._count || 0;
  const quarantinedPhones = unitsByStatus.find((u) => u.status === "QUARANTINED")?._count || 0;
  const totalPhysicalDevices = inStockPhones + soldPhones + reservedPhones + quarantinedPhones;

  // Low stock products
  const lowStockItems = stockBalances.filter(
    (b) => Number(b.quantity) <= Number(b.product.reorderLevel) && Number(b.product.reorderLevel) > 0
  );

  // Group valuation by brand
  const brandValuationMap = new Map<string, { brand: string; value: number; count: number }>();
  for (const b of stockBalances) {
    const brandName = b.product.brand?.name || "Other";
    const existing = brandValuationMap.get(brandName) || { brand: brandName, value: 0, count: 0 };
    existing.value += Number(b.inventoryValue);
    existing.count += Number(b.quantity);
    brandValuationMap.set(brandName, existing);
  }
  const topBrands = Array.from(brandValuationMap.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const metrics = [
    {
      label: "Total Inventory Valuation",
      value: formatMoney(totalValuation, currency),
      detail: `${totalQty.toFixed(0)} total items in stock`,
      icon: Boxes,
      href: "/inventory",
    },
    {
      label: "Available Physical Phones",
      value: String(inStockPhones),
      detail: `${soldPhones} sold · ${reservedPhones} reserved · ${quarantinedPhones} quarantine`,
      icon: Smartphone,
      href: "/inventory/imei",
    },
    {
      label: "Reserved Stock Quantity",
      value: String(reservedQty),
      detail: "Committed to active orders & transfers",
      icon: Clock,
      href: "/inventory",
    },
    {
      label: "Low Stock Alerts",
      value: String(lowStockItems.length),
      detail: "Items at or below reorder threshold",
      icon: AlertTriangle,
      tone: lowStockItems.length ? "text-amber-600 bg-amber-50" : "text-emerald-600 bg-emerald-50",
      href: "#low-stock",
    },
  ];

  return (
    <div className="mx-auto max-w-[1520px]">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="kicker">Authoritative Stock Ledger</span>
            <Badge tone="green">
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live Balance Authority
            </Badge>
          </div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">Inventory & Stock Dashboard</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Real-time stock valuation, physical serialized phone registry breakdown, warehouse distributions, and low-stock reorder alerts.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/inventory">
            <Button variant="outline">
              <Boxes className="h-4 w-4" />
              Stock Overview
            </Button>
          </Link>
          <Link href="/inventory/transfers">
            <Button variant="outline">
              Stock Transfers
            </Button>
          </Link>
          <Link href="/inventory/imei">
            <Button>
              IMEI Registry
              <ArrowRight className="h-4 w-4" />
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
              <span className={`grid h-10 w-10 place-items-center rounded-xl ${m.tone || "bg-blue-50 text-blue-700"}`}>
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

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {/* Serialized Device Custody breakdown */}
        <section className="surface p-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Phone Custody Lifecycle</h2>
              <p className="text-[11px] text-slate-400">{totalPhysicalDevices} total tracked devices</p>
            </div>
            <Link href="/inventory/imei" className="text-xs font-semibold text-blue-600 hover:underline">
              IMEI Registry
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {[
              { label: "Available in Warehouse Stock", count: inStockPhones, tone: "text-emerald-700 bg-emerald-50", badge: "IN_STOCK" },
              { label: "Delivered & Sold to Customers", count: soldPhones, tone: "text-blue-700 bg-blue-50", badge: "SOLD" },
              { label: "Reserved for Pending Orders", count: reservedPhones, tone: "text-amber-700 bg-amber-50", badge: "RESERVED" },
              { label: "Damaged / Quarantine Stock", count: quarantinedPhones, tone: "text-rose-700 bg-rose-50", badge: "QUARANTINE" },
            ].map((st) => (
              <div key={st.label} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
                <div>
                  <span className="text-xs font-bold text-slate-800">{st.label}</span>
                  <span className="block text-[10px] text-slate-400">Status: {st.badge}</span>
                </div>
                <span className={`rounded-lg px-2.5 py-1 text-xs font-mono font-bold ${st.tone}`}>
                  {st.count} devices
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Stock Valuation by Brand */}
        <section className="surface p-6 xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Stock Valuation by Brand</h2>
              <p className="text-[11px] text-slate-400">Inventory capital allocation across manufacturers</p>
            </div>
            <Link href="/catalog/products" className="text-xs font-semibold text-blue-600 hover:underline">
              View Catalog
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topBrands.map((b) => (
              <div key={b.brand} className="surface-muted p-4">
                <span className="text-xs font-bold text-slate-800">{b.brand}</span>
                <span className="mt-1 block font-mono text-base font-black text-slate-950">
                  {formatMoney(b.value, currency)}
                </span>
                <span className="mt-0.5 block text-[11px] text-slate-400">{b.count} units in stock</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Low Stock Alerts Section */}
      <section id="low-stock" className="surface mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded bg-amber-50 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Low Stock & Reorder Alerts</h2>
              <p className="text-[11px] text-slate-400">Products currently at or below their reorder threshold</p>
            </div>
          </div>
          <Link href="/goods-receipts/new" className="text-xs font-semibold text-blue-600 hover:underline">
            Create Purchase Receipt
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="table-head">
              <tr>
                <th className="px-5 py-3">Product / SKU</th>
                <th className="px-4 py-3">Category / Brand</th>
                <th className="px-4 py-3">Warehouse</th>
                <th className="px-4 py-3 text-right">Current Stock</th>
                <th className="px-4 py-3 text-right">Reorder Level</th>
                <th className="px-5 py-3 text-right">Deficit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!lowStockItems.length ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-slate-400">
                    All inventory levels are healthy! No items currently below reorder levels.
                  </td>
                </tr>
              ) : (
                lowStockItems.map((item) => {
                  const qty = Number(item.quantity);
                  const reorder = Number(item.product.reorderLevel);
                  const deficit = Math.max(0, reorder - qty);

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3.5">
                        <span className="font-semibold text-slate-900">{item.product.name}</span>
                        <span className="block font-mono text-[10px] text-slate-400">
                          {item.product.sku} · {item.variant.name}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">
                        {item.product.brand?.name || "—"} · {item.product.category.name}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{item.warehouse.name}</td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-amber-600">
                        {qty.toFixed(0)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-slate-500">{reorder.toFixed(0)}</td>
                      <td className="px-5 py-3.5 text-right font-mono font-bold text-rose-600">
                        -{deficit.toFixed(0)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top 10 Highest Value Products in Stock */}
      <section className="surface mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Highest Valuation Inventory Positions</h2>
            <p className="text-[11px] text-slate-400">Top stock lines representing the highest capital investment</p>
          </div>
          <Link href="/inventory" className="text-xs font-semibold text-blue-600 hover:underline">
            View full stock ledger
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="table-head">
              <tr>
                <th className="px-5 py-3">Product Name</th>
                <th className="px-4 py-3">Variant / Color</th>
                <th className="px-4 py-3">Warehouse</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3 text-right">Average Unit Cost</th>
                <th className="px-5 py-3 text-right">Total Valuation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stockBalances.slice(0, 10).map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/50">
                  <td className="px-5 py-3.5">
                    <span className="font-semibold text-slate-900">{b.product.name}</span>
                    <span className="block font-mono text-[10px] text-slate-400">{b.product.sku}</span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-600">
                    {b.variant.name} {b.variant.color ? `· ${b.variant.color}` : ""}
                  </td>
                  <td className="px-4 py-3.5 text-slate-600">{b.warehouse.name}</td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900">
                    {Number(b.quantity).toFixed(0)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-600">
                    {formatMoney(
                      Number(b.quantity) > 0 ? Number(b.inventoryValue) / Number(b.quantity) : 0,
                      currency
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono font-bold text-emerald-700">
                    {formatMoney(b.inventoryValue.toString(), currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
