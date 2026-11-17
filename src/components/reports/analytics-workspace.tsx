"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Award,
  BarChart3,
  Boxes,
  Calendar,
  Flame,
  LineChart,
  Percent,
  Search,
  ShieldAlert,
  Smartphone,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/utils";

type ProductRank = {
  productId: string;
  productName: string;
  brandName: string;
  sku: string;
  unitsSold: number;
  revenue: string;
  cost: string;
  grossProfit: string;
  marginPercent: number;
};

type BrandRank = {
  brandId: string;
  brandName: string;
  unitsSold: number;
  revenue: string;
  cost: string;
  grossProfit: string;
  marginPercent: number;
};

type SalespersonRank = {
  salespersonId: string;
  fullName: string;
  invoiceCount: number;
  unitsSold: number;
  revenue: string;
  cost: string;
  grossProfit: string;
  marginPercent: number;
};

type BranchRank = {
  branchId: string;
  code: string;
  name: string;
  invoiceCount: number;
  unitsSold: number;
  revenue: string;
  cost: string;
  grossProfit: string;
  marginPercent: number;
};

type SlowMovingItem = {
  productId: string;
  productName: string;
  brandName: string;
  stockQuantity: number;
  inventoryValue: string;
  unitsSold: number;
};

type Props = {
  data: {
    top10ProductsByVolume: ProductRank[];
    top10ProductsByRevenue: ProductRank[];
    topBrands: BrandRank[];
    salespersonLeaderboard: SalespersonRank[];
    branchRanking: BranchRank[];
    highMarginProducts: ProductRank[];
    lowMarginProducts: ProductRank[];
    slowMovingProducts: SlowMovingItem[];
    totalLinesAnalyzed: number;
  };
  currency: string;
};

export function BusinessAnalyticsWorkspace({ data, currency }: Props) {
  const [activeTab, setActiveTab] = useState<
    "products" | "brands" | "salespersons" | "margins" | "inventory"
  >("products");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="kicker">Strategic Executive Analytics</span>
            <Badge tone="purple">Business Intelligence Engine</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Business Intelligence & Analytics
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Real-time commercial performance insights: sales velocity, brand dominance, margins,
            salesperson achievement, and inventory aging.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/reports">
            <Button variant="outline">Reports Catalog</Button>
          </Link>
          <Link href="/reports/branch-comparison">
            <Button variant="outline">Branch Comparison</Button>
          </Link>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab("products")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
            activeTab === "products"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <Smartphone className="h-3.5 w-3.5" />
          Top Products ({data.top10ProductsByRevenue.length})
        </button>

        <button
          onClick={() => setActiveTab("brands")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
            activeTab === "brands"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <Trophy className="h-3.5 w-3.5" />
          Brand Dominance ({data.topBrands.length})
        </button>

        <button
          onClick={() => setActiveTab("salespersons")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
            activeTab === "salespersons"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <Award className="h-3.5 w-3.5" />
          Salesperson Leaderboard ({data.salespersonLeaderboard.length})
        </button>

        <button
          onClick={() => setActiveTab("margins")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
            activeTab === "margins"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <Percent className="h-3.5 w-3.5" />
          High vs Low Margins
        </button>

        <button
          onClick={() => setActiveTab("inventory")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
            activeTab === "inventory"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <Boxes className="h-3.5 w-3.5" />
          Stagnant & Slow Moving ({data.slowMovingProducts.length})
        </button>
      </div>

      {/* Tab 1: Top Products */}
      {activeTab === "products" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* By Revenue */}
          <section className="surface overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Top 10 Selling Products by Revenue
                </h3>
                <p className="text-[11px] text-slate-500">Highest gross sales value generated</p>
              </div>
              <Badge tone="blue">Top Revenue</Badge>
            </div>

            <div className="divide-y divide-slate-100">
              {data.top10ProductsByRevenue.length ? (
                data.top10ProductsByRevenue.map((p, idx) => (
                  <div key={p.productId} className="flex items-center justify-between p-3.5 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-bold text-slate-900">{p.productName}</p>
                        <p className="text-[10px] text-slate-400">
                          {p.brandName} · {p.unitsSold} unit{p.unitsSold > 1 ? "s" : ""} sold
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-slate-900">{formatMoney(p.revenue, currency)}</p>
                      <p className="text-[10px] text-emerald-600 font-medium">
                        GP: {formatMoney(p.grossProfit, currency)} ({p.marginPercent}%)
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-xs text-slate-400">No sales transactions recorded.</div>
              )}
            </div>
          </section>

          {/* By Volume */}
          <section className="surface overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Top 10 Selling Products by Volume (Units)
                </h3>
                <p className="text-[11px] text-slate-500">Fastest moving handsets by quantity sold</p>
              </div>
              <Badge tone="green">High Velocity</Badge>
            </div>

            <div className="divide-y divide-slate-100">
              {data.top10ProductsByVolume.length ? (
                data.top10ProductsByVolume.map((p, idx) => (
                  <div key={p.productId} className="flex items-center justify-between p-3.5 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-50 text-[10px] font-bold text-emerald-700">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-bold text-slate-900">{p.productName}</p>
                        <p className="text-[10px] text-slate-400">{p.brandName}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-slate-900">{p.unitsSold} units</p>
                      <p className="text-[10px] text-slate-500 font-medium">{formatMoney(p.revenue, currency)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-xs text-slate-400">No sales transactions recorded.</div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Tab 2: Brand Dominance */}
      {activeTab === "brands" && (
        <section className="surface overflow-hidden">
          <div className="border-b border-slate-100 p-4">
            <h2 className="text-sm font-bold text-slate-900">Brand Market Share & Margin Performance</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Breakdown of total handset sales volume, gross revenue, COGS, and margin contribution by phone brand.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Rank & Brand</th>
                  <th className="px-4 py-3 text-right">Units Sold</th>
                  <th className="px-4 py-3 text-right">Gross Revenue</th>
                  <th className="px-4 py-3 text-right">Cost of Sales (COGS)</th>
                  <th className="px-4 py-3 text-right">Gross Profit</th>
                  <th className="px-5 py-3 text-right">Gross Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.topBrands.length ? (
                  data.topBrands.map((b, idx) => (
                    <tr key={b.brandId} className="hover:bg-slate-50/70 transition">
                      <td className="px-5 py-3 font-semibold text-slate-900 flex items-center gap-3">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                          {idx + 1}
                        </span>
                        <span>{b.brandName}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                        {b.unitsSold}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                        {formatMoney(b.revenue, currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-500">
                        {formatMoney(b.cost, currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                        {formatMoney(b.grossProfit, currency)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-bold">
                        <span
                          className={`rounded px-1.5 py-0.5 ${
                            b.marginPercent >= 5
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {b.marginPercent}%
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-xs text-slate-400">
                      No brand data found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Tab 3: Salesperson Leaderboard */}
      {activeTab === "salespersons" && (
        <section className="surface overflow-hidden">
          <div className="border-b border-slate-100 p-4">
            <h2 className="text-sm font-bold text-slate-900">Salesperson Productivity Leaderboard</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ranked by total invoiced sales volume, average margin generated, and handset units converted.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Rank & Salesperson</th>
                  <th className="px-4 py-3 text-right">Invoices Closed</th>
                  <th className="px-4 py-3 text-right">Units Sold</th>
                  <th className="px-4 py-3 text-right">Invoiced Revenue</th>
                  <th className="px-4 py-3 text-right">Gross Profit Generated</th>
                  <th className="px-5 py-3 text-right">Realized Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.salespersonLeaderboard.length ? (
                  data.salespersonLeaderboard.map((sp, idx) => (
                    <tr key={sp.salespersonId} className="hover:bg-slate-50/70 transition">
                      <td className="px-5 py-3 font-semibold text-slate-900 flex items-center gap-3">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-blue-50 text-[10px] font-bold text-blue-700">
                          {idx + 1}
                        </span>
                        <span>{sp.fullName}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-slate-700">
                        {sp.invoiceCount}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                        {sp.unitsSold}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-blue-900">
                        {formatMoney(sp.revenue, currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                        {formatMoney(sp.grossProfit, currency)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-bold">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                          {sp.marginPercent}%
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-xs text-slate-400">
                      No salesperson transactions recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Tab 4: Margins */}
      {activeTab === "margins" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* High Margin */}
          <section className="surface overflow-hidden">
            <div className="border-b border-slate-100 bg-emerald-50/40 p-4 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                  Highest Margin Products (Premium Earnings)
                </h3>
                <p className="text-[11px] text-emerald-700">Products yielding highest % gross margin</p>
              </div>
              <Badge tone="green">High Margin</Badge>
            </div>

            <div className="divide-y divide-slate-100">
              {data.highMarginProducts.length ? (
                data.highMarginProducts.map((p) => (
                  <div key={p.productId} className="flex items-center justify-between p-3.5 text-xs">
                    <div>
                      <p className="font-bold text-slate-900">{p.productName}</p>
                      <p className="text-[10px] text-slate-400">
                        {p.brandName} · Rev: {formatMoney(p.revenue, currency)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 font-mono">
                        {p.marginPercent}%
                      </span>
                      <p className="text-[10px] text-emerald-700 mt-0.5 font-medium">
                        +{formatMoney(p.grossProfit, currency)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-xs text-slate-400">No sold items recorded.</div>
              )}
            </div>
          </section>

          {/* Low Margin */}
          <section className="surface overflow-hidden">
            <div className="border-b border-slate-100 bg-rose-50/40 p-4 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-rose-900">
                  Lowest Margin Products (High Volume / Thin Margin)
                </h3>
                <p className="text-[11px] text-rose-700">Phones selling near cost price</p>
              </div>
              <Badge tone="red">Thin Margin</Badge>
            </div>

            <div className="divide-y divide-slate-100">
              {data.lowMarginProducts.length ? (
                data.lowMarginProducts.map((p) => (
                  <div key={p.productId} className="flex items-center justify-between p-3.5 text-xs">
                    <div>
                      <p className="font-bold text-slate-900">{p.productName}</p>
                      <p className="text-[10px] text-slate-400">
                        {p.brandName} · Rev: {formatMoney(p.revenue, currency)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800 font-mono">
                        {p.marginPercent}%
                      </span>
                      <p className="text-[10px] text-slate-500 mt-0.5 font-medium">
                        +{formatMoney(p.grossProfit, currency)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-xs text-slate-400">No sold items recorded.</div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Tab 5: Slow Moving Inventory */}
      {activeTab === "inventory" && (
        <section className="surface overflow-hidden">
          <div className="border-b border-slate-100 p-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Slow-Moving & Stagnant Stock Analysis</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                In-stock inventory with zero or lowest sales activity, identifying tied-up capital.
              </p>
            </div>
            <Badge tone="amber">Capital Risk</Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Product & Brand</th>
                  <th className="px-4 py-3 text-right">In-Stock Quantity</th>
                  <th className="px-4 py-3 text-right">Tied-Up Valuation</th>
                  <th className="px-4 py-3 text-right">Units Sold (Historical)</th>
                  <th className="px-5 py-3 text-right">Movement Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.slowMovingProducts.length ? (
                  data.slowMovingProducts.map((p) => (
                    <tr key={p.productId} className="hover:bg-slate-50/70 transition">
                      <td className="px-5 py-3">
                        <p className="font-bold text-slate-900">{p.productName}</p>
                        <p className="text-[10px] text-slate-400">{p.brandName}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                        {p.stockQuantity} units
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-rose-700">
                        {formatMoney(p.inventoryValue, currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-500">
                        {p.unitsSold}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            p.unitsSold === 0
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {p.unitsSold === 0 ? "Zero Movement" : "Slow Turnover"}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-xs text-slate-400">
                      No stock balances found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Mandatory Footer */}
      <footer className="mt-12 border-t border-slate-200 pt-6 text-center text-xs text-slate-500">
        <p className="font-semibold text-slate-700">Axon Mobile ERP · Business Intelligence & Analytics</p>
        <p className="mt-1">© 2026 Copyright Reserved · Qasim Ali · 0315-5049489</p>
      </footer>
    </div>
  );
}

