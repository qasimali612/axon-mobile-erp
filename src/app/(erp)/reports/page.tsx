import Link from "next/link";
import {
  ArrowRight,
  BadgeDollarSign,
  Banknote,
  Barcode,
  Boxes,
  Building2,
  FileBarChart2,
  FileSpreadsheet,
  History,
  Landmark,
  Layers,
  PiggyBank,
  Printer,
  Receipt,
  Search,
  ShieldAlert,
  Smartphone,
  Tags,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requirePagePermission } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const REPORT_CATEGORIES = [
  {
    id: "inventory",
    title: "Inventory & Stock Reports",
    icon: Boxes,
    tone: "text-blue-700 bg-blue-50 border-blue-200",
    reports: [
      { key: "inventory", label: "Stock on Hand by Warehouse", desc: "Current balances, reservations, and available units per location." },
      { key: "stock-by-brand", label: "Stock on Hand by Brand", desc: "Consolidated stock quantities and valuation grouped by phone brand." },
      { key: "stock-by-model", label: "Stock on Hand by Model / SKU", desc: "Variant-level breakdown with storage, color, and average unit cost." },
      { key: "stock-aging", label: "Inventory Aging Analysis", desc: "Stock aging buckets (0-30, 31-60, 61-90, 90+ days) and capital at risk." },
      { key: "stock-ledger-rollforward", label: "Stock Ledger Roll-Forward", desc: "Opening stock, inward receipts, outward sales, and closing balances." },
      { key: "negative-stock-exceptions", label: "Negative Stock Exceptions", desc: "Audit report of any warehouse discrepancy or negative balance." },
      { key: "movements", label: "Inventory Movement Ledger", desc: "Append-only movement transactions with source document references." },
      { key: "reorder", label: "Reorder & Low Stock Alerts", desc: "Stock falling below minimum thresholds with preferred supplier quotes." },
    ],
  },
  {
    id: "imei",
    title: "IMEI & Serialized Devices",
    icon: Smartphone,
    tone: "text-emerald-700 bg-emerald-50 border-emerald-200",
    reports: [
      { key: "devices", label: "Physical Unit & Identifier Register", desc: "All physical handsets with dual IMEI slots and custody status." },
      { key: "available-imei", label: "Available In-Stock IMEIs", desc: "All handsets currently available for wholesale or retail sale." },
      { key: "sold-imei", label: "Sold IMEI History", desc: "Historical record of sold devices with customer invoice references." },
      { key: "duplicate-imei-exceptions", label: "Duplicate IMEI Exception Report", desc: "Security audit to identify any duplicate IMEI entry across branches." },
      { key: "imei-reconciliation", label: "Physical IMEI vs Balance Reconciliation", desc: "Mathematical check verifying physical handset count equals stock balance." },
    ],
  },
  {
    id: "sales",
    title: "Sales & Gross Margin Analytics",
    icon: TrendingUp,
    tone: "text-purple-700 bg-purple-50 border-purple-200",
    reports: [
      { key: "sales", label: "Sales Transaction Register", desc: "All posted invoices with customer, salesperson, and line totals." },
      { key: "sales-by-brand", label: "Sales & Margin by Brand", desc: "Revenue, units sold, COGS, and gross margin percentage by brand." },
      { key: "sales-by-model", label: "Sales & Margin by Phone Model", desc: "Highest volume phone models with average realized selling prices." },
      { key: "salesperson-performance", label: "Salesperson Performance", desc: "Target achievement, invoice count, and gross profit per sales lead." },
      { key: "profitability", label: "Profitability by Line", desc: "Detailed gross profit and margin percentage per sold phone." },
      { key: "fast-moving-stock", label: "Fast-Moving Products", desc: "Top turnover handsets ranked by sales velocity in selected period." },
      { key: "slow-moving-stock", label: "Slow-Moving Products", desc: "Phones with lowest movement to identify stagnant capital." },
      { key: "sales-returns", label: "Sales Returns Register", desc: "Customer returns with resalable vs damaged disposition states." },
    ],
  },
  {
    id: "purchases",
    title: "Procurement & Landed Cost",
    icon: Truck,
    tone: "text-amber-700 bg-amber-50 border-amber-200",
    reports: [
      { key: "goods-receipts", label: "Goods Receipts (GRN) Register", desc: "All received shipments with scanned IMEIs, inspection, and landed cost." },
      { key: "purchase-orders", label: "Purchase Order Register", desc: "Open, approved, and fulfilled purchase orders with delivery tracking." },
      { key: "supplier-purchase-volume", label: "Supplier Purchase Volume", desc: "Total spend, orders, and units received per vendor/distributor." },
      { key: "purchase-price-trends", label: "Purchase Price Trends", desc: "Unit purchase price history and landed cost tracking over time." },
      { key: "purchase-returns", label: "Purchase Returns & Debit Notes", desc: "Goods returned to suppliers with credit note references." },
    ],
  },
];

export default async function ReportsHubPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await requirePagePermission("dashboard.view");
  const params = await searchParams;
  const from = (Array.isArray(params.from) ? params.from[0] : params.from) ?? "";
  const to = (Array.isArray(params.to) ? params.to[0] : params.to) ?? "";
  const query = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      {/* Header */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="kicker">Enterprise Business Intelligence</span>
            <Badge tone="green">Real-Time Posted Ledger</Badge>
          </div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">
            Reports & Analytics Hub
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm text-slate-500">
            Real-time, filterable, drill-down business reports across Inventory, IMEI, Purchases, Sales, Returns, Cash, Banking, and General Ledger.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/reports/schedules"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            <History className="h-3.5 w-3.5" /> Automated Schedules
          </Link>
          <Link
            href="/finance/reports"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-xs font-bold text-white hover:bg-blue-700 shadow-sm"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Financial Statements
          </Link>
        </div>
      </header>

      {/* Global Filter Bar */}
      <form method="get" className="surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="field-label flex-1">
            From Date (Operational & Sales)
            <input type="date" name="from" defaultValue={from} className="field-input text-xs" />
          </label>
          <label className="field-label flex-1">
            To Date (Operational & Sales)
            <input type="date" name="to" defaultValue={to} className="field-input text-xs" />
          </label>
          <div>
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-5 text-xs font-bold text-white hover:bg-blue-700"
            >
              Apply Filter
            </button>
          </div>
        </div>
      </form>

      {/* Quick Access: Core Financial Statements */}
      <section className="surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Core Financial Statements & Ledgers</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Double-entry reconciled statements generated from posted journal lines.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/finance/reports"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Statements (P&L / BS / Cash Flow)
            </Link>
            <Link
              href="/finance/reports/cash-in-hand"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Banknote className="h-3.5 w-3.5" /> Cash in Hand Report
            </Link>
            <Link
              href="/finance/reports/trial-balance"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <FileBarChart2 className="h-3.5 w-3.5" /> Trial Balance
            </Link>
            <Link
              href="/finance/subledgers"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Users className="h-3.5 w-3.5" /> Party Subledgers (AR/AP)
            </Link>
            <Link
              href="/finance/banking"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Landmark className="h-3.5 w-3.5" /> Bank Reconciliation
            </Link>
          </div>
        </div>
      </section>

      {/* 4 Core Reporting Modules Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {REPORT_CATEGORIES.map((cat) => (
          <section key={cat.id} className="surface overflow-hidden flex flex-col justify-between">
            <div className="border-b border-slate-100 p-5 bg-slate-50/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`grid h-9 w-9 place-items-center rounded-xl border ${cat.tone}`}>
                  <cat.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{cat.title}</h3>
                  <span className="text-[11px] text-slate-400">{cat.reports.length} report views</span>
                </div>
              </div>
            </div>

            <div className="divide-y divide-slate-100 flex-1">
              {cat.reports.map((rep) => (
                <div
                  key={rep.key}
                  className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900">{rep.label}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-1">{rep.desc}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Link
                      href={`/reports/operations?report=${rep.key}${query ? `&${query}` : ""}`}
                      className="inline-flex h-7 items-center gap-1 rounded-lg bg-blue-50 px-2.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
                    >
                      Open <ArrowRight className="h-3 w-3" />
                    </Link>
                    <Link
                      href={`/reports/operations?report=${rep.key}${query ? `&${query}` : ""}&print=1`}
                      target="_blank"
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                      title="Print Report"
                    >
                      <Printer className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Finance Registers & Administration Section */}
      <section className="surface overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <h2 className="text-sm font-bold text-slate-900">Treasury, Asset & Incentive Registers</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Dedicated registers with audited CSV export and print layouts.
          </p>
        </div>
        <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              title: "Fixed Asset Register",
              desc: "Cost, depreciation, and net book value.",
              href: "/finance/assets",
              printHref: "/finance/assets/print",
              icon: Building2,
            },
            {
              title: "Vendor Incentives",
              desc: "Brand targets, accruals, and settlements.",
              href: "/finance/incentives",
              printHref: "/finance/incentives/print",
              icon: BadgeDollarSign,
            },
            {
              title: "Vendor & Dealer Rebates",
              desc: "Supplier claims and customer payables.",
              href: "/finance/rebates",
              printHref: "/finance/rebates/print",
              icon: Tags,
            },
            {
              title: "Budget vs Actuals",
              desc: "Annual & department budgets with variance.",
              href: "/finance/budgets",
              printHref: null,
              icon: FileBarChart2,
            },
          ].map((item) => (
            <div key={item.title} className="bg-white p-5 flex flex-col justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
                  <item.icon className="h-4 w-4" />
                </span>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">{item.title}</h4>
                  <p className="mt-0.5 text-[11px] text-slate-500">{item.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={item.href}
                  className="inline-flex h-7 items-center gap-1 rounded-lg bg-slate-900 px-2.5 text-[11px] font-bold text-white hover:bg-slate-800"
                >
                  Open <ArrowRight className="h-3 w-3" />
                </Link>
                {item.printHref && (
                  <Link
                    href={item.printHref}
                    target="_blank"
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                  >
                    <Printer className="h-3 w-3" /> Print
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
