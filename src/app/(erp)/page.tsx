import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeDollarSign,
  Boxes,
  Building2,
  CheckCircle2,
  CircleDot,
  Clock,
  Database,
  DollarSign,
  Fingerprint,
  Landmark,
  PackageCheck,
  Receipt,
  ReceiptText,
  Scale,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { BrandChart, TrackingChart, TrackingLegend } from "@/components/dashboard/catalog-charts";
import {
  ProfitTrendChart,
  SalesPurchaseTrendChart,
  WarehouseStockBarChart,
} from "@/components/dashboard/executive-charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

export default async function DashboardPage() {
  const context = await requirePagePermission("dashboard.view");
  const companyId = context.company.id;
  const currencyCode = context.company.currencyCode;

  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // 6 months ago for trend analysis
  const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

  const [
    stock,
    physicalUnits,
    totalImeis,
    salesToday,
    salesMonth,
    purchasesToday,
    purchasesMonth,
    submittedReceipts,
    submittedSales,
    submittedPayments,
    submittedJournals,
    submittedTransfers,
    submittedAdjustments,
    postedJournals,
    tracking,
    brands,
    recentAudit,
    customersCount,
    suppliersCount,
    warehouses,
    cashAccounts,
    bankAccounts,
    monthlySales,
    monthlyPurchases,
    monthlyExpenses,
  ] = await Promise.all([
    // Inventory on-hand
    prisma.stockBalance.aggregate({
      where: { companyId },
      _sum: { quantity: true, inventoryValue: true },
    }),

    // Physical handset units by status
    prisma.physicalStockUnit.groupBy({
      by: ["status"],
      where: { companyId },
      _count: true,
    }),

    // Total device identifiers (IMEI 1 & IMEI 2)
    prisma.deviceIdentifier.count({ where: { companyId } }),

    // Sales Today
    prisma.salesInvoice.aggregate({
      where: { companyId, status: "POSTED", reversalOfId: null, invoiceDate: { gte: todayStart } },
      _count: true,
      _sum: { grandTotal: true, costTotal: true },
    }),

    // Sales This Month
    prisma.salesInvoice.aggregate({
      where: { companyId, status: "POSTED", reversalOfId: null, invoiceDate: { gte: monthStart } },
      _count: true,
      _sum: { grandTotal: true, costTotal: true },
    }),

    // Purchases Today
    prisma.purchaseReceipt.aggregate({
      where: { companyId, status: "POSTED", reversalOfId: null, receiptDate: { gte: todayStart } },
      _count: true,
      _sum: { grandTotal: true },
    }),

    // Purchases This Month
    prisma.purchaseReceipt.aggregate({
      where: { companyId, status: "POSTED", reversalOfId: null, receiptDate: { gte: monthStart } },
      _count: true,
      _sum: { grandTotal: true },
    }),

    // Workflow approvals pending
    prisma.purchaseReceipt.count({ where: { companyId, status: "SUBMITTED" } }),
    prisma.salesInvoice.count({ where: { companyId, status: "SUBMITTED" } }),
    prisma.payment.count({ where: { companyId, status: "SUBMITTED" } }),
    prisma.journalEntry.count({ where: { companyId, status: "SUBMITTED" } }),
    prisma.stockTransfer.count({ where: { companyId, status: "SUBMITTED" } }),
    prisma.stockAdjustment.count({ where: { companyId, status: "SUBMITTED" } }),

    // General ledger total posted
    prisma.journalEntry.count({ where: { companyId, status: "POSTED" } }),

    // Tracking methods
    prisma.product.groupBy({
      by: ["trackingMethod"],
      where: { companyId, status: "ACTIVE" },
      _count: true,
    }),

    // Top brands
    prisma.brand.findMany({
      where: { companyId, isActive: true },
      select: { name: true, _count: { select: { products: true } } },
      orderBy: { products: { _count: "desc" } },
      take: 6,
    }),

    // Recent audit trail
    prisma.auditLog.findMany({
      where: { companyId },
      include: { actor: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),

    // Customer & Supplier counts
    prisma.customer.count({ where: { companyId, status: "ACTIVE" } }),
    prisma.supplier.count({ where: { companyId, status: "ACTIVE" } }),

    // Warehouses with stock balance
    prisma.warehouse.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        stockBalances: { select: { quantity: true, inventoryValue: true } },
      },
    }),

    // Cash Accounts
    prisma.account.findMany({
      where: { companyId, accountType: "CASH", isActive: true },
      select: { id: true, code: true, name: true },
    }),

    // Bank Accounts
    prisma.bankAccount.findMany({
      where: { companyId, isActive: true },
      select: { id: true, accountTitle: true, bankName: true },
    }),

    // Monthly posted sales for trend
    prisma.salesInvoice.findMany({
      where: { companyId, status: "POSTED", reversalOfId: null, invoiceDate: { gte: sixMonthsAgo } },
      select: { invoiceDate: true, grandTotal: true, costTotal: true },
    }),

    // Monthly posted purchases for trend
    prisma.purchaseReceipt.findMany({
      where: { companyId, status: "POSTED", reversalOfId: null, receiptDate: { gte: sixMonthsAgo } },
      select: { receiptDate: true, grandTotal: true },
    }),

    // Monthly operating expenses for trend
    prisma.journalEntry.findMany({
      where: {
        companyId,
        status: "POSTED",
        postingDate: { gte: sixMonthsAgo },
      },
      select: {
        postingDate: true,
        lines: {
          where: {
            account: { accountClass: "EXPENSE" },
            baseDebit: { gt: 0 },
          },
          select: { baseDebit: true },
        },
      },
    }),
  ]);

  // Calculations
  const trackingData = tracking.map((item) => ({ name: item.trackingMethod, value: item._count }));
  const brandData = brands.map((item) => ({ name: item.name, products: item._count.products }));
  const activeProducts = trackingData.reduce((sum, item) => sum + item.value, 0);

  const availableUnits = physicalUnits
    .filter((item) => ["IN_STOCK", "RESERVED"].includes(item.status))
    .reduce((sum, item) => sum + item._count, 0);

  const totalHandsets = physicalUnits.reduce((sum, item) => sum + item._count, 0);

  const pendingApprovalsTotal =
    submittedReceipts +
    submittedSales +
    submittedPayments +
    submittedJournals +
    submittedTransfers +
    submittedAdjustments;

  // Monthly Earnings & Profit
  const monthSalesTotal = Number(salesMonth._sum.grandTotal || 0);
  const monthCogsTotal = Number(salesMonth._sum.costTotal || 0);
  const grossProfitMonth = monthSalesTotal - monthCogsTotal;

  const currentMonthExpenses = monthlyExpenses
    .filter((j) => j.postingDate >= monthStart)
    .reduce((sum, j) => sum + j.lines.reduce((lSum, l) => lSum + Number(l.baseDebit), 0), 0);

  const netProfitMonth = grossProfitMonth - currentMonthExpenses;

  // Monthly trend grouping (last 6 months)
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const trendBuckets: Record<string, { sales: number; purchases: number; expenses: number; cogs: number }> = {};

  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${monthNames[d.getUTCMonth()]} ${d.getUTCFullYear().toString().slice(2)}`;
    trendBuckets[key] = { sales: 0, purchases: 0, expenses: 0, cogs: 0 };
  }

  for (const inv of monthlySales) {
    const d = inv.invoiceDate;
    const key = `${monthNames[d.getUTCMonth()]} ${d.getUTCFullYear().toString().slice(2)}`;
    if (trendBuckets[key]) {
      trendBuckets[key].sales += Number(inv.grandTotal);
      trendBuckets[key].cogs += Number(inv.costTotal);
    }
  }

  for (const gr of monthlyPurchases) {
    const d = gr.receiptDate;
    const key = `${monthNames[d.getUTCMonth()]} ${d.getUTCFullYear().toString().slice(2)}`;
    if (trendBuckets[key]) {
      trendBuckets[key].purchases += Number(gr.grandTotal);
    }
  }

  for (const j of monthlyExpenses) {
    const d = j.postingDate;
    const key = `${monthNames[d.getUTCMonth()]} ${d.getUTCFullYear().toString().slice(2)}`;
    if (trendBuckets[key]) {
      const expSum = j.lines.reduce((sum, l) => sum + Number(l.baseDebit), 0);
      trendBuckets[key].expenses += expSum;
    }
  }

  const trendData = Object.entries(trendBuckets).map(([month, data]) => ({
    month,
    sales: data.sales,
    purchases: data.purchases,
    expenses: data.expenses,
    profit: data.sales - data.cogs - data.expenses,
  }));

  // Warehouse breakdown
  const warehouseData = warehouses.map((w) => {
    const val = w.stockBalances.reduce((sum, b) => sum + Number(b.inventoryValue), 0);
    const qty = w.stockBalances.reduce((sum, b) => sum + Number(b.quantity), 0);
    return {
      warehouse: w.name,
      value: val,
      quantity: qty,
    };
  });

  const hour = Number(
    new Intl.DateTimeFormat("en", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: context.company.timeZone,
    }).format(now)
  );
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto max-w-[1520px] space-y-7">
      {/* Executive Command Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="kicker">Executive Intelligence Center</span>
            <Badge tone="green">
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Ledger Connected
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            {greeting}, {context.user.fullName.split(" ")[0]}.
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Real-time business performance for {context.company.name} across sales, inventory, IMEIs, purchasing, and finance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {context.permissions.includes("SALES_INVOICE_CREATE") && (
            <Link href="/pos">
              <Button variant="outline">
                <ShoppingCart className="mr-1.5 h-4 w-4" />
                POS Counter
              </Button>
            </Link>
          )}
          {context.permissions.includes("PURCHASE_RECEIPT_CREATE") && (
            <Link href="/goods-receipts/new">
              <Button variant="outline">
                <Truck className="mr-1.5 h-4 w-4" />
                Receive Stock
              </Button>
            </Link>
          )}
          <Link href="/approvals">
            <Button variant={pendingApprovalsTotal ? "primary" : "outline"}>
              <Clock className="mr-1.5 h-4 w-4" />
              Approvals ({pendingApprovalsTotal})
            </Button>
          </Link>
        </div>
      </div>

      {/* Primary KPI Grid: Sales & Procurement */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
          Trading & Revenue Operations
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Link
            href="/sales"
            className="surface group p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-float"
          >
            <div className="flex items-start justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
                <ShoppingCart className="h-[18px] w-[18px]" />
              </span>
              <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-blue-600 transition" />
            </div>
            <p className="mt-4 text-2xl font-bold tracking-tight text-slate-950">
              {formatMoney(salesMonth._sum.grandTotal?.toString() || "0", currencyCode)}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-700">Sales This Month</p>
            <p className="mt-1 text-[11px] text-slate-400">
              Today: {formatMoney(salesToday._sum.grandTotal?.toString() || "0", currencyCode)} ({salesToday._count} inv)
            </p>
          </Link>

          <Link
            href="/purchases"
            className="surface group p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-float"
          >
            <div className="flex items-start justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                <ReceiptText className="h-[18px] w-[18px]" />
              </span>
              <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-600 transition" />
            </div>
            <p className="mt-4 text-2xl font-bold tracking-tight text-slate-950">
              {formatMoney(purchasesMonth._sum.grandTotal?.toString() || "0", currencyCode)}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-700">Purchases This Month</p>
            <p className="mt-1 text-[11px] text-slate-400">
              Today: {formatMoney(purchasesToday._sum.grandTotal?.toString() || "0", currencyCode)} ({purchasesToday._count} rcv)
            </p>
          </Link>

          <Link
            href="/finance/reports"
            className="surface group p-5 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-float"
          >
            <div className="flex items-start justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <TrendingUp className="h-[18px] w-[18px]" />
              </span>
              <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-emerald-600 transition" />
            </div>
            <p className="mt-4 text-2xl font-bold tracking-tight text-emerald-600">
              {formatMoney(grossProfitMonth.toString(), currencyCode)}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-700">Gross Profit (Month)</p>
            <p className="mt-1 text-[11px] text-slate-400">
              COGS {formatMoney(monthCogsTotal.toString(), currencyCode)}
            </p>
          </Link>

          <Link
            href="/finance/expenses"
            className="surface group p-5 transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-float"
          >
            <div className="flex items-start justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-50 text-rose-700">
                <BadgeDollarSign className="h-[18px] w-[18px]" />
              </span>
              <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-rose-600 transition" />
            </div>
            <p className="mt-4 text-2xl font-bold tracking-tight text-slate-950">
              {formatMoney(currentMonthExpenses.toString(), currencyCode)}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-700">Operating Expenses (Month)</p>
            <p className="mt-1 text-[11px] font-medium text-emerald-600">
              Net Profit: {formatMoney(netProfitMonth.toString(), currencyCode)}
            </p>
          </Link>
        </div>
      </div>

      {/* Secondary KPI Grid: Inventory, IMEIs & Parties */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
          Inventory, Serialized Stock & Master Scope
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Link
            href="/inventory"
            className="surface group p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-float"
          >
            <div className="flex items-start justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700">
                <Boxes className="h-[18px] w-[18px]" />
              </span>
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-blue-600 transition" />
            </div>
            <p className="mt-4 text-2xl font-bold tracking-tight text-slate-950">
              {formatMoney(stock._sum.inventoryValue?.toString() || "0", currencyCode)}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-700">Total Stock Valuation</p>
            <p className="mt-1 text-[11px] text-slate-400">
              Total quantity: {stock._sum.quantity?.toFixed(2) || "0.00"} units
            </p>
          </Link>

          <Link
            href="/inventory/imei"
            className="surface group p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-float"
          >
            <div className="flex items-start justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700">
                <Smartphone className="h-[18px] w-[18px]" />
              </span>
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-sky-600 transition" />
            </div>
            <p className="mt-4 text-2xl font-bold tracking-tight text-slate-950">
              {availableUnits}{" "}
              <span className="text-sm font-normal text-slate-500">/ {totalHandsets}</span>
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-700">Physical Handsets Available</p>
            <p className="mt-1 text-[11px] text-slate-400">
              {totalImeis} verified IMEI identifiers in registry
            </p>
          </Link>

          <Link
            href="/parties?tab=customers"
            className="surface group p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-float"
          >
            <div className="flex items-start justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-700">
                <Users className="h-[18px] w-[18px]" />
              </span>
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-teal-600 transition" />
            </div>
            <p className="mt-4 text-2xl font-bold tracking-tight text-slate-950">
              {customersCount}{" "}
              <span className="text-xs font-normal text-slate-500">customers</span> · {suppliersCount}{" "}
              <span className="text-xs font-normal text-slate-500">suppliers</span>
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-700">Commercial Parties</p>
            <p className="mt-1 text-[11px] text-slate-400">Retail, wholesale & distributors</p>
          </Link>

          <Link
            href="/approvals"
            className="surface group p-5 transition hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-float"
          >
            <div className="flex items-start justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700">
                <Clock className="h-[18px] w-[18px]" />
              </span>
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-amber-600 transition" />
            </div>
            <p className="mt-4 text-2xl font-bold tracking-tight text-amber-600">
              {pendingApprovalsTotal}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-700">Pending Authorization</p>
            <p className="mt-1 text-[11px] text-slate-400">
              {submittedSales} sales · {submittedReceipts} receipts · {submittedPayments} payments
            </p>
          </Link>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="surface overflow-hidden p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Trading Performance Trend</h2>
              <p className="mt-1 text-[11px] text-slate-400">
                Monthly posted sales invoices vs purchase receipts over the past 6 months.
              </p>
            </div>
            <Link href="/reports/operations?report=sales" className="text-xs font-semibold text-blue-700 hover:underline">
              View sales report
            </Link>
          </div>
          <div className="mt-4">
            <SalesPurchaseTrendChart data={trendData} currencyCode={currencyCode} />
          </div>
        </section>

        <section className="surface overflow-hidden p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Earnings & Operating Profit</h2>
              <p className="mt-1 text-[11px] text-slate-400">
                Net profit trajectory after deducting COGS and operating expenses.
              </p>
            </div>
            <Link href="/finance/reports" className="text-xs font-semibold text-blue-700 hover:underline">
              Profit & Loss
            </Link>
          </div>
          <div className="mt-4">
            <ProfitTrendChart data={trendData} currencyCode={currencyCode} />
          </div>
        </section>
      </div>

      {/* Warehouse Stock Valuation & Catalog Tracking Policy */}
      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <section className="surface overflow-hidden p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Warehouse Inventory Distribution</h2>
              <p className="mt-1 text-[11px] text-slate-400">
                Physical stock valuation across authorized company warehouses and stores.
              </p>
            </div>
            <Link href="/organization/warehouse-dashboard" className="text-xs font-semibold text-blue-700 hover:underline">
              Warehouse Hub
            </Link>
          </div>
          <div className="mt-4">
            <WarehouseStockBarChart data={warehouseData} currencyCode={currencyCode} />
          </div>
        </section>

        <section className="surface overflow-hidden p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Tracking Policy & Brands</h2>
              <p className="mt-1 text-[11px] text-slate-400">IMEI vs Quantity-based products.</p>
            </div>
            <Link href="/catalog/products" className="text-xs font-semibold text-blue-700 hover:underline">
              Catalog
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <TrackingChart data={trackingData} total={activeProducts} />
              <div className="mt-2">
                <TrackingLegend data={trackingData} />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">Products by Brand</p>
              <BrandChart data={brandData} />
            </div>
          </div>
        </section>
      </div>

      {/* Governance & Audit Ledger */}
      <div className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
        <section className="surface p-6">
          <h2 className="text-sm font-bold text-slate-900">Enforced System Invariants</h2>
          <div className="mt-4 space-y-3">
            {[
              {
                icon: Fingerprint,
                label: "1 Physical Handset = 1 Inventory Stock Unit",
                detail: "Dual-SIM phones register IMEI1 and IMEI2 without inflating stock quantity.",
              },
              {
                icon: Database,
                label: "Double-Entry Balance Enforced on Commit",
                detail: `${postedJournals} posted vouchers maintain Σ Debit = Σ Credit with zero variance.`,
              },
              {
                icon: ShieldCheck,
                label: "Configurable Operating Mode & Maker-Checker",
                detail: "Enforces separation of preparer and approver across all operational vouchers.",
              },
            ].map((item) => (
              <div key={item.label} className="flex gap-3 rounded-xl border border-slate-100 p-3.5 bg-slate-50/50">
                <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                <div>
                  <p className="text-xs font-bold text-slate-900">{item.label}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recent Immutable Audit Activity</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">Append-only log of critical system operations.</p>
            </div>
            {context.permissions.includes("audit.view") && (
              <Link href="/audit" className="text-xs font-semibold text-blue-700 hover:underline">
                View audit trail
              </Link>
            )}
          </div>
          <div className="divide-y divide-slate-100">
            {recentAudit.map((event) => (
              <div key={event.id} className="flex items-center gap-3 px-6 py-3.5 hover:bg-slate-50/50">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600">
                  <CircleDot className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-800">
                    {titleCase(event.action)}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                    {event.actor?.fullName || "System"} · {event.entityReference || event.entityType}
                  </span>
                </span>
                <span className="text-[10px] font-medium text-slate-400">
                  {formatDate(event.createdAt, true)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
