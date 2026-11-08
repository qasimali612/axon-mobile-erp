import Link from "next/link";
import { AlertTriangle, ArrowRight, Banknote, BadgeCheck, CircleDollarSign, FileClock, ReceiptText, RotateCcw, ShoppingCart, WalletCards } from "lucide-react";
import { OperationalDocumentStatus, PaymentDirection, Prisma, StockReturnType } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { permittedDocumentScopes, requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

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

function decimalNumber(value: Prisma.Decimal | null | undefined) {
  return Number(value?.toString() || 0);
}

function settledAmount(rows: Array<{ amount: Prisma.Decimal; payment: { direction: PaymentDirection } }>) {
  return rows.reduce((sum, row) => row.payment.direction === PaymentDirection.CUSTOMER_RECEIPT ? sum.plus(row.amount) : sum.minus(row.amount), new Prisma.Decimal(0));
}

export default async function SalesDashboardPage({ searchParams }: PageProps) {
  const context = await requirePagePermission("sales.view");
  const params = await searchParams;
  const companyId = context.company.id;
  const scopes = permittedDocumentScopes(context, "sales.view");
  const branchId = value(params, "branchId");
  const warehouseId = value(params, "warehouseId");
  const customerId = value(params, "customerId");
  const salespersonId = value(params, "salespersonId");
  const productId = value(params, "productId");
  const model = value(params, "model").trim();
  const color = value(params, "color").trim();
  const fromRaw = value(params, "from");
  const toRaw = value(params, "to");
  const from = dateValue(fromRaw);
  const to = dateValue(toRaw, true);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(today); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const lineFilter: Prisma.SalesInvoiceLineWhereInput = {
    ...(productId ? { productId } : {}),
    ...(model ? { product: { model: { contains: model, mode: "insensitive" } } } : {}),
    ...(color ? { variant: { color: { contains: color, mode: "insensitive" } } } : {}),
  };
  const hasLineFilter = Boolean(productId || model || color);
  const dimensionWhere: Prisma.SalesInvoiceWhereInput = {
    companyId,
    ...(branchId ? { branchId } : {}),
    ...(warehouseId ? { warehouseId } : {}),
    ...(customerId ? { customerId } : {}),
    ...(salespersonId ? { salespersonId } : {}),
    ...(hasLineFilter ? { lines: { some: lineFilter } } : {}),
    AND: scopes ? [{ OR: scopes }] : [],
  };
  const where: Prisma.SalesInvoiceWhereInput = {
    ...dimensionWhere,
    ...((from || to) ? { invoiceDate: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
  };
  const postedWhere: Prisma.SalesInvoiceWhereInput = { ...where, status: OperationalDocumentStatus.POSTED, reversalOfId: null };

  const returnLineFilter: Prisma.StockReturnLineWhereInput = {
    ...(productId ? { productId } : {}),
    ...(model ? { product: { model: { contains: model, mode: "insensitive" } } } : {}),
    ...(color ? { variant: { color: { contains: color, mode: "insensitive" } } } : {}),
  };
  const returnWhere: Prisma.StockReturnWhereInput = {
    companyId,
    returnType: StockReturnType.SALES_RETURN,
    status: OperationalDocumentStatus.POSTED,
    ...(branchId ? { branchId } : {}),
    ...(warehouseId ? { warehouseId } : {}),
    ...(customerId ? { customerId } : {}),
    ...((from || to) ? { returnDate: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
    ...(hasLineFilter ? { lines: { some: returnLineFilter } } : {}),
    AND: scopes ? [{ OR: scopes }] : [],
  };

  const [
    branches,
    warehouses,
    customers,
    products,
    salespersonRows,
    todaySales,
    monthSales,
    draftCount,
    postedTotals,
    returnTotals,
    financialInvoices,
    recentInvoices,
    branchGroups,
    customerGroups,
    productGroups,
  ] = await Promise.all([
    prisma.branch.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ where: { companyId, isActive: true }, select: { id: true, branchId: true, code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.customer.findMany({ where: { companyId, status: "ACTIVE" }, select: { id: true, code: true, name: true, phone: true }, orderBy: { name: "asc" }, take: 500 }),
    prisma.product.findMany({ where: { companyId, status: "ACTIVE" }, select: { id: true, sku: true, name: true, model: true }, orderBy: { name: "asc" }, take: 500 }),
    prisma.salesInvoice.findMany({ where: { companyId, salespersonId: { not: null }, AND: scopes ? [{ OR: scopes }] : [] }, distinct: ["salespersonId"], select: { salesperson: { select: { id: true, fullName: true } } }, orderBy: { salespersonId: "asc" } }),
    prisma.salesInvoice.aggregate({ where: { ...dimensionWhere, status: OperationalDocumentStatus.POSTED, reversalOfId: null, invoiceDate: { gte: today, lt: tomorrow } }, _count: true, _sum: { grandTotal: true } }),
    prisma.salesInvoice.aggregate({ where: { ...dimensionWhere, status: OperationalDocumentStatus.POSTED, reversalOfId: null, invoiceDate: { gte: monthStart } }, _count: true, _sum: { grandTotal: true } }),
    prisma.salesInvoice.count({ where: { ...where, status: OperationalDocumentStatus.DRAFT } }),
    prisma.salesInvoice.aggregate({ where: postedWhere, _count: true, _sum: { subtotal: true, discountTotal: true, taxTotal: true, grandTotal: true, costTotal: true } }),
    prisma.stockReturn.aggregate({ where: returnWhere, _count: true, _sum: { grandTotal: true, costTotal: true } }),
    prisma.salesInvoice.findMany({ where: postedWhere, select: { id: true, grandTotal: true, dueDate: true, allocations: { where: { payment: { status: OperationalDocumentStatus.POSTED } }, select: { amount: true, payment: { select: { direction: true } } } } } }),
    prisma.salesInvoice.findMany({ where, include: { customer: { select: { code: true, name: true } }, branch: { select: { code: true, name: true } }, warehouse: { select: { code: true, name: true } }, salesperson: { select: { fullName: true } }, lines: { select: { quantity: true } }, allocations: { where: { payment: { status: OperationalDocumentStatus.POSTED } }, select: { amount: true, payment: { select: { direction: true } } } } }, orderBy: [{ invoiceDate: "desc" }, { invoiceNumber: "desc" }], take: 10 }),
    prisma.salesInvoice.groupBy({ by: ["branchId"], where: postedWhere, _count: true, _sum: { grandTotal: true }, orderBy: { _sum: { grandTotal: "desc" } } }),
    prisma.salesInvoice.groupBy({ by: ["customerId"], where: postedWhere, _count: true, _sum: { grandTotal: true }, orderBy: { _sum: { grandTotal: "desc" } }, take: 8 }),
    prisma.salesInvoiceLine.groupBy({ by: ["productId"], where: { invoice: postedWhere }, _sum: { quantity: true, lineTotal: true } }),
  ]);

  const customerNames = new Map(customers.map((item) => [item.id, item]));
  const productNames = new Map(products.map((item) => [item.id, item]));
  const branchNames = new Map(branches.map((item) => [item.id, item]));
  let outstandingTotal = new Prisma.Decimal(0);
  let partiallyPaid = 0;
  let overdue = 0;
  let unpaid = 0;
  for (const invoice of financialInvoices) {
    const paid = settledAmount(invoice.allocations);
    const outstanding = Prisma.Decimal.max(invoice.grandTotal.minus(paid), 0);
    outstandingTotal = outstandingTotal.plus(outstanding);
    if (outstanding.gt(0) && paid.gt(0)) partiallyPaid += 1;
    if (outstanding.gt(0) && invoice.dueDate && invoice.dueDate < today) overdue += 1;
    if (outstanding.gt(0) && paid.lte(0)) unpaid += 1;
  }
  const pendingPayments = partiallyPaid + unpaid;
  const grossProfit = new Prisma.Decimal(postedTotals._sum.grandTotal || 0).minus(postedTotals._sum.costTotal || 0).minus(returnTotals._sum.grandTotal || 0).plus(returnTotals._sum.costTotal || 0);
  const returnValue = decimalNumber(returnTotals._sum.grandTotal);
  const maxBranch = Math.max(1, ...branchGroups.map((item) => decimalNumber(item._sum.grandTotal)));
  const maxCustomer = Math.max(1, ...customerGroups.map((item) => decimalNumber(item._sum.grandTotal)));
  const productSummaries = productGroups.map((item) => ({ ...item, product: productNames.get(item.productId) })).sort((a, b) => decimalNumber(b._sum.lineTotal) - decimalNumber(a._sum.lineTotal));
  const modelMap = new Map<string, { quantity: number; value: number }>();
  for (const item of productGroups) {
    const modelName = productNames.get(item.productId)?.model || "Unspecified model";
    const current = modelMap.get(modelName) || { quantity: 0, value: 0 };
    current.quantity += decimalNumber(item._sum.quantity);
    current.value += decimalNumber(item._sum.lineTotal);
    modelMap.set(modelName, current);
  }
  const modelSummaries = [...modelMap.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 8);
  const maxProduct = Math.max(1, ...productSummaries.map((item) => decimalNumber(item._sum.lineTotal)));
  const maxModel = Math.max(1, ...modelSummaries.map((item) => item[1].value));
  const filterActive = Boolean(branchId || warehouseId || customerId || salespersonId || productId || model || color || from || to);

  const cards = [
    { label: "Total sales today", value: formatMoney(todaySales._sum.grandTotal?.toString() || "0", context.company.currencyCode), detail: `${todaySales._count} posted invoices`, icon: ShoppingCart, href: "/sales?status=POSTED" },
    { label: "Sales this month", value: formatMoney(monthSales._sum.grandTotal?.toString() || "0", context.company.currencyCode), detail: `${monthSales._count} posted invoices`, icon: WalletCards, href: "/sales?status=POSTED" },
    { label: "Draft invoices", value: String(draftCount), detail: "No stock effect", icon: ReceiptText, href: "/sales?status=DRAFT" },
    { label: "Posted invoices", value: String(postedTotals._count), detail: `Gross profit ${formatMoney(grossProfit.toString(), context.company.currencyCode)}`, icon: BadgeCheck, href: "/sales?status=POSTED" },
    { label: "Pending payments", value: formatMoney(outstandingTotal.toString(), context.company.currencyCode), detail: `${pendingPayments} open invoices`, icon: CircleDollarSign, href: "/sales?paymentStatus=UNPAID" },
    { label: "Sales returns", value: formatMoney(String(returnValue), context.company.currencyCode), detail: `${returnTotals._count} posted returns`, icon: RotateCcw, href: "/returns?type=SALES_RETURN" },
    { label: "Partially paid", value: String(partiallyPaid), detail: "Posted allocations below total", icon: Banknote, href: "/sales?paymentStatus=PARTIAL" },
    { label: "Overdue invoices", value: String(overdue), detail: "Open amount past due date", icon: overdue ? AlertTriangle : FileClock, href: "/sales?paymentStatus=OVERDUE" },
  ];

  return <div className="mx-auto max-w-[1600px] space-y-5">
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><span className="kicker">Order-to-cash command center</span><h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-[30px]">Sales dashboard</h1><p className="mt-1.5 text-sm text-slate-500">Posted revenue, actual-cost margin, payment exposure, returns, and product performance from live operational records.</p></div><div className="flex gap-2"><Link href="/finance/payments" className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700"><Banknote className="h-4 w-4"/>Record payment</Link><Link href="/pos" className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white"><ShoppingCart className="h-4 w-4"/>New sales invoice</Link></div></div>

    <form className="surface p-4" method="get"><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6"><label><span className="label">From</span><input name="from" type="date" defaultValue={fromRaw} className="input"/></label><label><span className="label">To</span><input name="to" type="date" defaultValue={toRaw} className="input"/></label><label><span className="label">Branch</span><select name="branchId" defaultValue={branchId} className="input"><option value="">All branches</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><label><span className="label">Warehouse</span><select name="warehouseId" defaultValue={warehouseId} className="input"><option value="">All warehouses</option>{warehouses.filter((item) => !branchId || item.branchId === branchId).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><label><span className="label">Customer</span><select name="customerId" defaultValue={customerId} className="input"><option value="">All customers</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><label><span className="label">Salesperson</span><select name="salespersonId" defaultValue={salespersonId} className="input"><option value="">All salespeople</option>{salespersonRows.map((item) => item.salesperson && <option key={item.salesperson.id} value={item.salesperson.id}>{item.salesperson.fullName}</option>)}</select></label><label><span className="label">Product</span><select name="productId" defaultValue={productId} className="input"><option value="">All products</option>{products.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select></label><label><span className="label">Model contains</span><input name="model" defaultValue={model} placeholder="e.g. iPhone 16" className="input"/></label><label><span className="label">Color contains</span><input name="color" defaultValue={color} placeholder="e.g. Black" className="input"/></label><div className="flex items-end gap-2 md:col-span-2"><button className="h-10 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white">Apply filters</button>{filterActive && <Link href="/sales/dashboard" className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600">Reset</Link>}</div></div></form>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map((card) => <Link key={card.label} href={card.href} className="surface group p-4 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-float"><div className="flex items-start justify-between"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-700"><card.icon className="h-4 w-4"/></span><ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-blue-600"/></div><p className="mt-3 text-xl font-black tracking-tight text-slate-950">{card.value}</p><p className="mt-1 text-xs font-bold text-slate-700">{card.label}</p><p className="mt-1 text-[10px] text-slate-400">{card.detail}</p></Link>)}</div>

    <section className="surface overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-bold text-slate-900">Recent sales invoices</h2><p className="mt-1 text-[11px] text-slate-400">Latest documents matching the current dashboard filters.</p></div><Link href="/sales" className="text-xs font-bold text-blue-700">Open register</Link></div><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Invoice / date</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Salesperson</th><th className="px-4 py-3">Document</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3 text-center">Quantity</th><th className="px-5 py-3 text-right">Total / outstanding</th></tr></thead><tbody className="divide-y divide-slate-100">{recentInvoices.length ? recentInvoices.map((invoice) => { const paid = settledAmount(invoice.allocations); const outstanding = Prisma.Decimal.max(invoice.grandTotal.minus(paid), 0); const paymentState = outstanding.lte(0) ? "PAID" : invoice.dueDate && invoice.dueDate < today ? "OVERDUE" : paid.gt(0) ? "PARTIAL" : "UNPAID"; const quantity = invoice.lines.reduce((sum, line) => sum + Number(line.quantity), 0); return <tr key={invoice.id}><td className="px-5 py-3"><Link href={invoice.status === "DRAFT" ? `/sales/${invoice.id}/edit` : `/sales/${invoice.id}/print`} className="font-bold text-blue-700">{invoice.invoiceNumber}</Link><span className="block text-[10px] text-slate-400">{formatDate(invoice.invoiceDate)}</span></td><td className="px-4 py-3"><b>{invoice.customer.name}</b><span className="block text-[10px] text-slate-400">{invoice.customer.code}</span></td><td className="px-4 py-3">{invoice.warehouse.code}<span className="block text-[10px] text-slate-400">{invoice.branch.name}</span></td><td className="px-4 py-3">{invoice.salesperson?.fullName || "—"}</td><td className="px-4 py-3"><Badge tone={invoice.status === "POSTED" ? "green" : ["SUBMITTED", "APPROVED"].includes(invoice.status) ? "amber" : "slate"}>{titleCase(invoice.status)}</Badge></td><td className="px-4 py-3"><Badge tone={paymentState === "PAID" ? "green" : paymentState === "OVERDUE" ? "red" : paymentState === "PARTIAL" ? "amber" : "slate"}>{titleCase(paymentState)}</Badge></td><td className="px-4 py-3 text-center font-bold">{quantity}</td><td className="px-5 py-3 text-right"><b>{formatMoney(invoice.grandTotal.toString(), context.company.currencyCode)}</b><span className="block text-[10px] text-slate-400">Due {formatMoney(outstanding.toString(), context.company.currencyCode)}</span></td></tr>; }) : <tr><td colSpan={8} className="py-16 text-center text-slate-400">No sales invoices match these filters.</td></tr>}</tbody></table></div></section>

    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4"><SummaryPanel title="Sales by branch" rows={branchGroups.map((item) => ({ key: item.branchId, label: branchNames.get(item.branchId)?.name || "Unknown branch", detail: `${item._count} invoices`, value: decimalNumber(item._sum.grandTotal) }))} maximum={maxBranch} currency={context.company.currencyCode}/><SummaryPanel title="Sales by product" rows={productSummaries.slice(0, 8).map((item) => ({ key: item.productId, label: item.product?.name || "Unknown product", detail: `${decimalNumber(item._sum.quantity)} units`, value: decimalNumber(item._sum.lineTotal) }))} maximum={maxProduct} currency={context.company.currencyCode}/><SummaryPanel title="Sales by model" rows={modelSummaries.map(([name, item]) => ({ key: name, label: name, detail: `${item.quantity} units`, value: item.value }))} maximum={maxModel} currency={context.company.currencyCode}/><SummaryPanel title="Sales by customer" rows={customerGroups.map((item) => ({ key: item.customerId, label: customerNames.get(item.customerId)?.name || "Unknown customer", detail: `${item._count} invoices`, value: decimalNumber(item._sum.grandTotal) }))} maximum={maxCustomer} currency={context.company.currencyCode}/></div>
  </div>;
}

function SummaryPanel({ title, rows, maximum, currency }: { title: string; rows: Array<{ key: string; label: string; detail: string; value: number }>; maximum: number; currency: string }) {
  return <section className="surface overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold text-slate-900">{title}</h2></div><div className="space-y-4 p-5">{rows.length ? rows.map((row) => <div key={row.key}><div className="mb-1.5 flex items-end justify-between gap-2"><span className="min-w-0"><b className="block truncate text-xs text-slate-800">{row.label}</b><span className="text-[10px] text-slate-400">{row.detail}</span></span><b className="shrink-0 text-[11px] text-slate-700">{formatMoney(String(row.value), currency)}</b></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(3, row.value / maximum * 100)}%` }}/></div></div>) : <p className="py-10 text-center text-xs text-slate-400">No posted sales in this filter.</p>}</div></section>;
}
