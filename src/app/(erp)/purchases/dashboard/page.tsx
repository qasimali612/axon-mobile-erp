import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, ClipboardCheck, PackageOpen, ShoppingCart, Truck } from "lucide-react";
import { OperationalDocumentStatus, Prisma } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { permittedDocumentScopes, requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

const statusValues = new Set(Object.values(OperationalDocumentStatus));
type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: Promise<SearchParams> };

function value(params: SearchParams, key: string) {
  const raw = params[key];
  return Array.isArray(raw) ? raw[0] || "" : raw || "";
}

function dateValue(raw: string, end = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function numberValue(value: Prisma.Decimal | null | undefined) {
  return Number(value?.toString() || 0);
}

export default async function ProcurementDashboardPage({ searchParams }: PageProps) {
  const context = await requirePagePermission("purchase.view");
  const params = await searchParams;
  const companyId = context.company.id;
  const scopes = permittedDocumentScopes(context, "purchase.view");
  const branchId = value(params, "branchId");
  const warehouseId = value(params, "warehouseId");
  const supplierId = value(params, "supplierId");
  const buyerId = value(params, "buyerId");
  const productId = value(params, "productId");
  const model = value(params, "model").trim();
  const color = value(params, "color").trim();
  const statusRaw = value(params, "status");
  const status = statusValues.has(statusRaw as OperationalDocumentStatus) ? statusRaw as OperationalDocumentStatus : undefined;
  const fromRaw = value(params, "from");
  const toRaw = value(params, "to");
  const from = dateValue(fromRaw);
  const to = dateValue(toRaw, true);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const lineFilter: Prisma.PurchaseOrderLineWhereInput = {
    ...(productId ? { productId } : {}),
    ...(model ? { product: { model: { contains: model, mode: "insensitive" } } } : {}),
    ...(color ? { variant: { color: { contains: color, mode: "insensitive" } } } : {}),
  };
  const hasLineFilter = Boolean(productId || model || color);
  const where: Prisma.PurchaseOrderWhereInput = {
    companyId,
    ...(branchId ? { branchId } : {}),
    ...(warehouseId ? { warehouseId } : {}),
    ...(supplierId ? { supplierId } : {}),
    ...(buyerId ? { preparedById: buyerId } : {}),
    ...(status ? { status } : {}),
    ...((from || to) ? { orderDate: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
    ...(hasLineFilter ? { lines: { some: lineFilter } } : {}),
    AND: scopes ? [{ OR: scopes }] : [],
  };
  const activeWhere: Prisma.PurchaseOrderWhereInput = status
    ? where
    : { ...where, status: { notIn: [OperationalDocumentStatus.CANCELLED, OperationalDocumentStatus.REJECTED] } };

  const receiptLineFilter: Prisma.PurchaseReceiptLineWhereInput = {
    ...(productId ? { productId } : {}),
    ...(model ? { product: { model: { contains: model, mode: "insensitive" } } } : {}),
    ...(color ? { variant: { color: { contains: color, mode: "insensitive" } } } : {}),
  };
  const receiptWhere: Prisma.PurchaseReceiptWhereInput = {
    companyId,
    status: OperationalDocumentStatus.POSTED,
    reversalOfId: null,
    receiptDate: { gte: monthStart },
    ...(branchId ? { branchId } : {}),
    ...(warehouseId ? { warehouseId } : {}),
    ...(supplierId ? { supplierId } : {}),
    ...(hasLineFilter ? { lines: { some: receiptLineFilter } } : {}),
    AND: scopes ? [{ OR: scopes }] : [],
  };

  const [
    branches,
    warehouses,
    suppliers,
    products,
    buyerRows,
    orderTotals,
    statusGroups,
    quantityTotals,
    monthlyReceipts,
    overdueCount,
    recentOrders,
    expectedOrders,
    supplierGroups,
  ] = await Promise.all([
    prisma.branch.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ where: { companyId, isActive: true }, select: { id: true, branchId: true, code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { companyId, status: "ACTIVE" }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
    prisma.product.findMany({ where: { companyId, status: "ACTIVE" }, select: { id: true, sku: true, name: true, model: true }, orderBy: { name: "asc" }, take: 500 }),
    prisma.purchaseOrder.findMany({ where: { companyId, AND: scopes ? [{ OR: scopes }] : [] }, distinct: ["preparedById"], select: { preparedBy: { select: { id: true, fullName: true } } }, orderBy: { preparedById: "asc" } }),
    prisma.purchaseOrder.aggregate({ where: activeWhere, _count: true, _sum: { grandTotal: true, subtotal: true, taxTotal: true } }),
    prisma.purchaseOrder.groupBy({ by: ["status"], where, _count: true, _sum: { grandTotal: true } }),
    prisma.purchaseOrderLine.aggregate({ where: { order: activeWhere }, _sum: { orderedQuantity: true, receivedQuantity: true } }),
    prisma.purchaseReceipt.aggregate({ where: receiptWhere, _count: true, _sum: { grandTotal: true } }),
    prisma.purchaseOrder.count({ where: { ...activeWhere, expectedDate: { lt: today }, status: { in: [OperationalDocumentStatus.APPROVED, OperationalDocumentStatus.PARTIALLY_RECEIVED] } } }),
    prisma.purchaseOrder.findMany({ where, include: { supplier: { select: { code: true, name: true } }, branch: { select: { code: true, name: true } }, warehouse: { select: { code: true, name: true } }, preparedBy: { select: { fullName: true } }, lines: { select: { orderedQuantity: true, receivedQuantity: true } } }, orderBy: [{ orderDate: "desc" }, { orderNumber: "desc" }], take: 10 }),
    prisma.purchaseOrder.findMany({ where: { ...activeWhere, expectedDate: { not: null }, status: { in: [OperationalDocumentStatus.APPROVED, OperationalDocumentStatus.PARTIALLY_RECEIVED] } }, include: { supplier: { select: { name: true } }, warehouse: { select: { code: true } }, lines: { select: { orderedQuantity: true, receivedQuantity: true } } }, orderBy: [{ expectedDate: "asc" }, { orderNumber: "asc" }], take: 8 }),
    prisma.purchaseOrder.groupBy({ by: ["supplierId"], where: activeWhere, _count: true, _sum: { grandTotal: true }, orderBy: { _sum: { grandTotal: "desc" } }, take: 8 }),
  ]);

  const supplierNames = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const ordered = numberValue(quantityTotals._sum?.orderedQuantity);
  const received = numberValue(quantityTotals._sum?.receivedQuantity);
  const pending = Math.max(ordered - received, 0);
  const approvedCount = statusGroups.filter((item) => ["APPROVED", "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "CLOSED"].includes(item.status)).reduce((sum, item) => sum + item._count, 0);
  const maxStatusCount = Math.max(1, ...statusGroups.map((item) => item._count));
  const maxSupplierSpend = Math.max(1, ...supplierGroups.map((item) => numberValue(item._sum.grandTotal)));
  const filterActive = Boolean(branchId || warehouseId || supplierId || buyerId || productId || model || color || status || from || to);

  const cards = [
    { label: "Total purchase value", value: formatMoney(orderTotals._sum.grandTotal?.toString() || "0", context.company.currencyCode), detail: `${orderTotals._count} non-rejected orders`, icon: ShoppingCart, href: "/purchases" },
    { label: "Approved purchase orders", value: String(approvedCount), detail: `${ordered.toLocaleString()} units ordered`, icon: ClipboardCheck, href: "/purchases?status=APPROVED" },
    { label: "Posted purchases this month", value: formatMoney(monthlyReceipts._sum.grandTotal?.toString() || "0", context.company.currencyCode), detail: `${monthlyReceipts._count} posted receipts`, icon: PackageOpen, href: "/goods-receipts?status=POSTED" },
    { label: "Pending deliveries", value: pending.toLocaleString(), detail: `${overdueCount} orders overdue`, icon: overdueCount ? AlertTriangle : Truck, href: "/purchases?status=PARTIALLY_RECEIVED" },
  ];

  return <div className="mx-auto max-w-[1600px] space-y-5">
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><span className="kicker">Procure-to-pay command center</span><h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-[30px]">Procurement dashboard</h1><p className="mt-1.5 text-sm text-slate-500">Live purchase commitments, fulfillment, expected deliveries, and supplier concentration from authoritative documents.</p></div><div className="flex flex-wrap gap-2"><Link href="/goods-receipts/new" className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700"><Truck className="h-4 w-4"/>Receive goods</Link><Link href="/purchases/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white"><ShoppingCart className="h-4 w-4"/>New purchase order</Link></div></div>

    <form className="surface p-4" method="get"><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6"><label><span className="label">From</span><input name="from" type="date" defaultValue={fromRaw} className="input"/></label><label><span className="label">To</span><input name="to" type="date" defaultValue={toRaw} className="input"/></label><label><span className="label">Branch</span><select name="branchId" defaultValue={branchId} className="input"><option value="">All branches</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><label><span className="label">Warehouse</span><select name="warehouseId" defaultValue={warehouseId} className="input"><option value="">All warehouses</option>{warehouses.filter((item) => !branchId || item.branchId === branchId).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><label><span className="label">Supplier</span><select name="supplierId" defaultValue={supplierId} className="input"><option value="">All suppliers</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><label><span className="label">Buyer / preparer</span><select name="buyerId" defaultValue={buyerId} className="input"><option value="">All buyers</option>{buyerRows.map((item) => <option key={item.preparedBy.id} value={item.preparedBy.id}>{item.preparedBy.fullName}</option>)}</select></label><label><span className="label">Product</span><select name="productId" defaultValue={productId} className="input"><option value="">All products</option>{products.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select></label><label><span className="label">Model contains</span><input name="model" defaultValue={model} placeholder="e.g. A55" className="input"/></label><label><span className="label">Color contains</span><input name="color" defaultValue={color} placeholder="e.g. Black" className="input"/></label><label><span className="label">Status</span><select name="status" defaultValue={statusRaw} className="input"><option value="">All statuses</option>{Object.values(OperationalDocumentStatus).map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label><div className="flex items-end gap-2 md:col-span-2"><button className="h-10 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white">Apply filters</button>{filterActive && <Link href="/purchases/dashboard" className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600">Reset</Link>}</div></div></form>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <Link key={card.label} href={card.href} className="surface group p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-float"><div className="flex items-start justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><card.icon className="h-[18px] w-[18px]"/></span><ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-blue-600"/></div><p className="mt-4 text-2xl font-black tracking-tight text-slate-950">{card.value}</p><p className="mt-1 text-xs font-bold text-slate-700">{card.label}</p><p className="mt-1 text-[11px] text-slate-400">{card.detail}</p></Link>)}</div>

    <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]"><section className="surface overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-bold text-slate-900">Recent purchase orders</h2><p className="mt-1 text-[11px] text-slate-400">Latest documents matching the current dashboard filters.</p></div><Link href="/purchases" className="text-xs font-bold text-blue-700">Open register</Link></div><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">PO / date</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Fulfillment</th><th className="px-5 py-3 text-right">Total</th></tr></thead><tbody className="divide-y divide-slate-100">{recentOrders.length ? recentOrders.map((order) => { const orderQty = order.lines.reduce((sum, line) => sum + Number(line.orderedQuantity), 0); const receivedQty = order.lines.reduce((sum, line) => sum + Number(line.receivedQuantity), 0); const fulfillment = orderQty ? Math.min(100, Math.round(receivedQty / orderQty * 100)) : 0; return <tr key={order.id}><td className="px-5 py-3"><Link href={order.status === "DRAFT" ? `/purchases/${order.id}/edit` : `/purchases/${order.id}/print`} className="font-bold text-blue-700">{order.orderNumber}</Link><span className="block text-[10px] text-slate-400">{formatDate(order.orderDate)}</span></td><td className="px-4 py-3"><b>{order.supplier.name}</b><span className="block text-[10px] text-slate-400">{order.supplier.code}</span></td><td className="px-4 py-3">{order.warehouse.code}<span className="block text-[10px] text-slate-400">{order.branch.name}</span></td><td className="px-4 py-3"><Badge tone={["CANCELLED", "REJECTED"].includes(order.status) ? "red" : ["FULLY_RECEIVED", "CLOSED"].includes(order.status) ? "green" : "amber"}>{titleCase(order.status)}</Badge></td><td className="px-4 py-3"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-blue-600" style={{ width: `${fulfillment}%` }}/></div><span className="mt-1 block text-[10px] text-slate-400">{receivedQty}/{orderQty} · {fulfillment}%</span></td><td className="px-5 py-3 text-right font-bold">{formatMoney(order.grandTotal.toString(), context.company.currencyCode)}</td></tr>; }) : <tr><td colSpan={6} className="py-16 text-center text-slate-400">No purchase orders match these filters.</td></tr>}</tbody></table></div></section>

    <section className="surface overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold text-slate-900">Workflow distribution</h2><p className="mt-1 text-[11px] text-slate-400">Filtered document count and value.</p></div><div className="space-y-4 p-5">{statusGroups.length ? statusGroups.map((item) => <div key={item.status}><div className="mb-1.5 flex justify-between text-xs"><span className="font-semibold text-slate-700">{titleCase(item.status)}</span><span className="text-slate-500">{item._count} · {formatMoney(item._sum.grandTotal?.toString() || "0", context.company.currencyCode)}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(3, item._count / maxStatusCount * 100)}%` }}/></div></div>) : <p className="py-10 text-center text-xs text-slate-400">No status data.</p>}</div></section></div>

    <div className="grid gap-5 xl:grid-cols-2"><section className="surface overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-bold text-slate-900">Expected deliveries</h2><p className="mt-1 text-[11px] text-slate-400">Open approved orders sorted by expected date.</p></div><CalendarClock className="h-5 w-5 text-blue-600"/></div><div className="divide-y divide-slate-100">{expectedOrders.length ? expectedOrders.map((order) => { const orderQty = order.lines.reduce((sum, line) => sum + Number(line.orderedQuantity), 0); const receivedQty = order.lines.reduce((sum, line) => sum + Number(line.receivedQuantity), 0); const overdue = Boolean(order.expectedDate && order.expectedDate < today); return <div key={order.id} className="flex items-center gap-3 px-5 py-3.5"><span className={`grid h-9 w-9 place-items-center rounded-lg ${overdue ? "bg-rose-50 text-rose-700" : "bg-blue-50 text-blue-700"}`}>{overdue ? <AlertTriangle className="h-4 w-4"/> : <Truck className="h-4 w-4"/>}</span><span className="min-w-0 flex-1"><Link href={`/purchases/${order.id}/print`} className="font-bold text-blue-700">{order.orderNumber}</Link><span className="block truncate text-[10px] text-slate-400">{order.supplier.name} · {order.warehouse.code} · {receivedQty}/{orderQty} received</span></span><span className={`text-right text-xs font-bold ${overdue ? "text-rose-700" : "text-slate-700"}`}>{formatDate(order.expectedDate!)}<span className="block text-[9px] font-medium uppercase">{overdue ? "Overdue" : "Expected"}</span></span></div>; }) : <p className="py-14 text-center text-xs text-slate-400">No open expected deliveries.</p>}</div></section>

    <section className="surface overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold text-slate-900">Supplier purchase summary</h2><p className="mt-1 text-[11px] text-slate-400">Top suppliers by filtered PO value.</p></div><div className="space-y-4 p-5">{supplierGroups.length ? supplierGroups.map((item) => { const supplier = supplierNames.get(item.supplierId); const spend = numberValue(item._sum.grandTotal); return <div key={item.supplierId}><div className="mb-1.5 flex items-end justify-between gap-3"><span className="min-w-0"><b className="block truncate text-xs text-slate-800">{supplier?.name || "Unknown supplier"}</b><span className="text-[10px] text-slate-400">{supplier?.code || "—"} · {item._count} orders</span></span><b className="text-xs text-slate-800">{formatMoney(String(spend), context.company.currencyCode)}</b></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(3, spend / maxSupplierSpend * 100)}%` }}/></div></div>; }) : <p className="py-10 text-center text-xs text-slate-400">No supplier spend in this filter.</p>}</div></section></div>
  </div>;
}
