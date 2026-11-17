"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Building2,
  Calendar,
  Download,
  Landmark,
  Percent,
  Printer,
  Scale,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/utils";

type BranchMetricsData = {
  branchId: string;
  code: string;
  name: string;
  city?: string | null;
  type: string;
  isHeadOffice: boolean;

  salesInvoiceCount: number;
  grossSales: string;
  salesDiscounts: string;
  salesReturns: string;
  netSales: string;
  costOfGoodsSold: string;
  grossProfit: string;
  grossProfitMarginPercent: number;

  purchaseCount: number;
  grossPurchases: string;
  purchaseReturns: string;
  netPurchases: string;

  operatingExpenses: string;
  netProfit: string;

  inventoryValuation: string;
  totalQuantity: number;
  availableHandsets: number;
  quarantinedUnits: number;

  cashOnHand: string;
  bankBalance: string;
  tradeReceivables: string;
  tradePayables: string;
};

type Props = {
  branches: BranchMetricsData[];
  companyTotal: {
    grossSales: string;
    netSales: string;
    costOfGoodsSold: string;
    grossProfit: string;
    operatingExpenses: string;
    netProfit: string;
    netPurchases: string;
    inventoryValuation: string;
    totalQuantity: number;
    availableHandsets: number;
    cashOnHand: string;
    bankBalance: string;
    tradeReceivables: string;
    tradePayables: string;
  };
  period: { from: string; to: string };
  currency: string;
  canExport: boolean;
};

export function BranchComparisonWorkspace({
  branches,
  companyTotal,
  period,
  currency,
  canExport,
}: Props) {
  const [dateFilter, setDateFilter] = useState({
    from: period.from.slice(0, 10),
    to: period.to.slice(0, 10),
  });

  const printUrl = `/reports/branch-comparison/print?from=${dateFilter.from}&to=${dateFilter.to}`;

  const exportCsv = () => {
    const headers = [
      "Metric / Operational KPI",
      ...branches.map((b) => `${b.code} - ${b.name}`),
      "Company Total",
    ];

    const rows = [
      ["Sales Invoices Count", ...branches.map((b) => b.salesInvoiceCount), ""],
      ["Gross Sales (PKR)", ...branches.map((b) => b.grossSales), companyTotal.grossSales],
      ["Sales Discounts (PKR)", ...branches.map((b) => b.salesDiscounts), ""],
      ["Sales Returns (PKR)", ...branches.map((b) => b.salesReturns), ""],
      ["Net Sales (PKR)", ...branches.map((b) => b.netSales), companyTotal.netSales],
      ["Cost of Goods Sold (PKR)", ...branches.map((b) => b.costOfGoodsSold), companyTotal.costOfGoodsSold],
      ["Gross Profit (PKR)", ...branches.map((b) => b.grossProfit), companyTotal.grossProfit],
      ["Gross Margin %", ...branches.map((b) => `${b.grossProfitMarginPercent}%`), ""],
      ["Operating Expenses (PKR)", ...branches.map((b) => b.operatingExpenses), companyTotal.operatingExpenses],
      ["Net Operating Profit (PKR)", ...branches.map((b) => b.netProfit), companyTotal.netProfit],
      ["Purchases / Inward Spend (PKR)", ...branches.map((b) => b.netPurchases), companyTotal.netPurchases],
      ["Current Stock Valuation (PKR)", ...branches.map((b) => b.inventoryValuation), companyTotal.inventoryValuation],
      ["Stock Total Quantity", ...branches.map((b) => b.totalQuantity), companyTotal.totalQuantity],
      ["Available Handsets In-Stock", ...branches.map((b) => b.availableHandsets), companyTotal.availableHandsets],
      ["Quarantined / Defective Handsets", ...branches.map((b) => b.quarantinedUnits), ""],
      ["Cash on Hand (PKR)", ...branches.map((b) => b.cashOnHand), companyTotal.cashOnHand],
      ["Bank Balances (PKR)", ...branches.map((b) => b.bankBalance), companyTotal.bankBalance],
      ["Accounts Receivable (PKR)", ...branches.map((b) => b.tradeReceivables), companyTotal.tradeReceivables],
      ["Accounts Payable (PKR)", ...branches.map((b) => b.tradePayables), companyTotal.tradePayables],
    ];

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Branch_Comparison_${dateFilter.from}_${dateFilter.to}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="kicker">Operational & Financial Intelligence</span>
            <Badge tone="blue">Multi-Branch Side-by-Side</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Branch Performance Comparison
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Authoritative performance comparison between Hazro Central (HZR) and Islamabad (ISB)
            across revenue, margins, procurement, inventory, and branch working capital.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href={printUrl} target="_blank">
            <Button variant="outline">
              <Printer className="mr-1.5 h-4 w-4" />
              Print Report
            </Button>
          </Link>

          {canExport && (
            <Button variant="outline" onClick={exportCsv}>
              <Download className="mr-1.5 h-4 w-4" />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {/* Date Filter Bar */}
      <form method="get" className="surface p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <Calendar className="h-4 w-4 text-slate-400" />
          <span>Reporting Period:</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            name="from"
            defaultValue={dateFilter.from}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-500"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            name="to"
            defaultValue={dateFilter.to}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-500"
          />
        </div>
        <Button type="submit" variant="primary" className="h-9 text-xs">
          Update Comparison
        </Button>
      </form>

      {/* Branch KPI Summary Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {branches.map((b) => (
          <div key={b.branchId} className="surface overflow-hidden p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700 font-bold text-sm">
                  {b.code}
                </span>
                <div>
                  <h2 className="text-base font-bold text-slate-900">{b.name}</h2>
                  <p className="text-xs text-slate-500">
                    {b.city || "Pakistan"} · {b.type.replace(/_/g, " ")} {b.isHeadOffice ? "(HQ)" : ""}
                  </p>
                </div>
              </div>
              <Badge tone={b.grossProfitMarginPercent >= 5 ? "green" : "slate"}>
                {b.grossProfitMarginPercent}% Margin
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-slate-500 font-medium">Net Sales</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {formatMoney(b.netSales, currency)}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">{b.salesInvoiceCount} invoices</p>
              </div>

              <div className="rounded-lg bg-emerald-50/50 p-3">
                <p className="text-emerald-700 font-medium">Gross Profit</p>
                <p className="mt-1 text-lg font-bold text-emerald-700">
                  {formatMoney(b.grossProfit, currency)}
                </p>
                <p className="text-[10px] text-emerald-600 mt-0.5">COGS: {formatMoney(b.costOfGoodsSold, currency)}</p>
              </div>

              <div className="rounded-lg bg-rose-50/40 p-3">
                <p className="text-rose-700 font-medium">Operating Expenses</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {formatMoney(b.operatingExpenses, currency)}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Direct Branch OPEX</p>
              </div>

              <div className="rounded-lg bg-blue-50/40 p-3">
                <p className="text-blue-700 font-medium">Net Profit</p>
                <p className="mt-1 text-lg font-bold text-blue-700">
                  {formatMoney(b.netProfit, currency)}
                </p>
                <p className="text-[10px] text-blue-600 mt-0.5">Branch contribution</p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <p className="text-[11px] text-slate-500">Stock Value</p>
                <p className="font-bold text-slate-900 mt-0.5">{formatMoney(b.inventoryValuation, currency)}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Cash on Hand</p>
                <p className="font-bold text-slate-900 mt-0.5">{formatMoney(b.cashOnHand, currency)}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Available Phones</p>
                <p className="font-bold text-slate-900 mt-0.5">{b.availableHandsets} units</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Comprehensive Side-by-Side Comparison Table */}
      <section className="surface overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <h2 className="text-sm font-bold text-slate-900">Side-by-Side Operational & Financial Metric Matrix</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Full audit breakdown showing exact branch attribution vs consolidated company totals.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Performance Dimension</th>
                {branches.map((b) => (
                  <th key={b.branchId} className="px-5 py-3 text-right">
                    {b.code} ({b.name})
                  </th>
                ))}
                <th className="px-5 py-3 text-right text-slate-900 font-bold bg-slate-100/60">
                  Company Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Category: Sales Operations */}
              <tr className="bg-slate-50/50 font-bold text-slate-700">
                <td colSpan={branches.length + 2} className="px-5 py-2 uppercase text-[10px] tracking-wider text-blue-700">
                  1. Sales & Revenue Operations
                </td>
              </tr>
              <tr>
                <td className="px-5 py-2.5 font-medium text-slate-700">Sales Invoices Posted</td>
                {branches.map((b) => (
                  <td key={b.branchId} className="px-5 py-2.5 text-right font-mono">
                    {b.salesInvoiceCount}
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right font-mono font-bold bg-slate-50/40">
                  {branches.reduce((sum, b) => sum + b.salesInvoiceCount, 0)}
                </td>
              </tr>
              <tr>
                <td className="px-5 py-2.5 font-medium text-slate-700">Gross Sales Revenue</td>
                {branches.map((b) => (
                  <td key={b.branchId} className="px-5 py-2.5 text-right font-mono">
                    {formatMoney(b.grossSales, currency)}
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right font-mono font-bold bg-slate-50/40">
                  {formatMoney(companyTotal.grossSales, currency)}
                </td>
              </tr>
              <tr>
                <td className="px-5 py-2.5 font-medium text-slate-700">Sales Returns & Refunds</td>
                {branches.map((b) => (
                  <td key={b.branchId} className="px-5 py-2.5 text-right font-mono text-rose-600">
                    -{formatMoney(b.salesReturns, currency)}
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right font-mono font-bold text-rose-600 bg-slate-50/40">
                  -{formatMoney(branches.reduce((sum, b) => Number(b.salesReturns) + sum, 0).toFixed(2), currency)}
                </td>
              </tr>
              <tr className="bg-blue-50/20 font-semibold">
                <td className="px-5 py-2.5 text-blue-900">Net Sales</td>
                {branches.map((b) => (
                  <td key={b.branchId} className="px-5 py-2.5 text-right font-mono text-blue-900 font-bold">
                    {formatMoney(b.netSales, currency)}
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right font-mono font-bold text-blue-900 bg-blue-50/40">
                  {formatMoney(companyTotal.netSales, currency)}
                </td>
              </tr>

              {/* Category: Cost & Profitability */}
              <tr className="bg-slate-50/50 font-bold text-slate-700">
                <td colSpan={branches.length + 2} className="px-5 py-2 uppercase text-[10px] tracking-wider text-emerald-700">
                  2. Cost of Sales & Profit Margins
                </td>
              </tr>
              <tr>
                <td className="px-5 py-2.5 font-medium text-slate-700">Cost of Goods Sold (COGS)</td>
                {branches.map((b) => (
                  <td key={b.branchId} className="px-5 py-2.5 text-right font-mono text-slate-600">
                    {formatMoney(b.costOfGoodsSold, currency)}
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right font-mono font-bold bg-slate-50/40">
                  {formatMoney(companyTotal.costOfGoodsSold, currency)}
                </td>
              </tr>
              <tr className="font-semibold text-emerald-700">
                <td className="px-5 py-2.5">Gross Profit</td>
                {branches.map((b) => (
                  <td key={b.branchId} className="px-5 py-2.5 text-right font-mono font-bold">
                    {formatMoney(b.grossProfit, currency)}
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right font-mono font-bold bg-slate-50/40">
                  {formatMoney(companyTotal.grossProfit, currency)}
                </td>
              </tr>
              <tr>
                <td className="px-5 py-2.5 font-medium text-slate-700">Gross Margin %</td>
                {branches.map((b) => (
                  <td key={b.branchId} className="px-5 py-2.5 text-right font-mono font-semibold">
                    {b.grossProfitMarginPercent}%
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right font-mono font-bold bg-slate-50/40">
                  {Number(companyTotal.netSales) > 0
                    ? `${(
                        (Number(companyTotal.grossProfit) / Number(companyTotal.netSales)) *
                        100
                      ).toFixed(2)}%`
                    : "0.00%"}
                </td>
              </tr>

              {/* Category: Operating Expenses & Net Contribution */}
              <tr className="bg-slate-50/50 font-bold text-slate-700">
                <td colSpan={branches.length + 2} className="px-5 py-2 uppercase text-[10px] tracking-wider text-rose-700">
                  3. Operating Expenses & Net Earnings
                </td>
              </tr>
              <tr>
                <td className="px-5 py-2.5 font-medium text-slate-700">Branch Operating Expenses</td>
                {branches.map((b) => (
                  <td key={b.branchId} className="px-5 py-2.5 text-right font-mono text-rose-600">
                    {formatMoney(b.operatingExpenses, currency)}
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right font-mono font-bold text-rose-600 bg-slate-50/40">
                  {formatMoney(companyTotal.operatingExpenses, currency)}
                </td>
              </tr>
              <tr className="bg-emerald-50/30 font-bold">
                <td className="px-5 py-2.5 text-emerald-900">Net Operating Profit</td>
                {branches.map((b) => (
                  <td key={b.branchId} className="px-5 py-2.5 text-right font-mono text-emerald-700 font-bold">
                    {formatMoney(b.netProfit, currency)}
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right font-mono font-bold text-emerald-900 bg-emerald-50/60">
                  {formatMoney(companyTotal.netProfit, currency)}
                </td>
              </tr>

              {/* Category: Inventory & Warehouses */}
              <tr className="bg-slate-50/50 font-bold text-slate-700">
                <td colSpan={branches.length + 2} className="px-5 py-2 uppercase text-[10px] tracking-wider text-amber-700">
                  4. Inventory & Warehouses
                </td>
              </tr>
              <tr>
                <td className="px-5 py-2.5 font-medium text-slate-700">Inventory Valuation</td>
                {branches.map((b) => (
                  <td key={b.branchId} className="px-5 py-2.5 text-right font-mono">
                    {formatMoney(b.inventoryValuation, currency)}
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right font-mono font-bold bg-slate-50/40">
                  {formatMoney(companyTotal.inventoryValuation, currency)}
                </td>
              </tr>
              <tr>
                <td className="px-5 py-2.5 font-medium text-slate-700">Total Quantity on Hand</td>
                {branches.map((b) => (
                  <td key={b.branchId} className="px-5 py-2.5 text-right font-mono">
                    {b.totalQuantity.toFixed(2)}
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right font-mono font-bold bg-slate-50/40">
                  {companyTotal.totalQuantity.toFixed(2)}
                </td>
              </tr>
              <tr>
                <td className="px-5 py-2.5 font-medium text-slate-700">Available Handsets (In Stock)</td>
                {branches.map((b) => (
                  <td key={b.branchId} className="px-5 py-2.5 text-right font-mono">
                    {b.availableHandsets}
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right font-mono font-bold bg-slate-50/40">
                  {companyTotal.availableHandsets}
                </td>
              </tr>
              <tr>
                <td className="px-5 py-2.5 font-medium text-slate-700">Quarantined / Defective Units</td>
                {branches.map((b) => (
                  <td key={b.branchId} className="px-5 py-2.5 text-right font-mono text-amber-600">
                    {b.quarantinedUnits}
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right font-mono font-bold text-amber-600 bg-slate-50/40">
                  {branches.reduce((sum, b) => sum + b.quarantinedUnits, 0)}
                </td>
              </tr>

              {/* Category: Treasury & Working Capital */}
              <tr className="bg-slate-50/50 font-bold text-slate-700">
                <td colSpan={branches.length + 2} className="px-5 py-2 uppercase text-[10px] tracking-wider text-indigo-700">
                  5. Treasury, Receivables & Payables
                </td>
              </tr>
              <tr>
                <td className="px-5 py-2.5 font-medium text-slate-700">Cash on Hand (GL 1000)</td>
                {branches.map((b) => (
                  <td key={b.branchId} className="px-5 py-2.5 text-right font-mono">
                    {formatMoney(b.cashOnHand, currency)}
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right font-mono font-bold bg-slate-50/40">
                  {formatMoney(companyTotal.cashOnHand, currency)}
                </td>
              </tr>
              <tr>
                <td className="px-5 py-2.5 font-medium text-slate-700">Bank Accounts (GL 1010)</td>
                {branches.map((b) => (
                  <td key={b.branchId} className="px-5 py-2.5 text-right font-mono">
                    {formatMoney(b.bankBalance, currency)}
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right font-mono font-bold bg-slate-50/40">
                  {formatMoney(companyTotal.bankBalance, currency)}
                </td>
              </tr>
              <tr>
                <td className="px-5 py-2.5 font-medium text-slate-700">Trade Receivables (GL 1100)</td>
                {branches.map((b) => (
                  <td key={b.branchId} className="px-5 py-2.5 text-right font-mono">
                    {formatMoney(b.tradeReceivables, currency)}
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right font-mono font-bold bg-slate-50/40">
                  {formatMoney(companyTotal.tradeReceivables, currency)}
                </td>
              </tr>
              <tr>
                <td className="px-5 py-2.5 font-medium text-slate-700">Trade Payables (GL 2000)</td>
                {branches.map((b) => (
                  <td key={b.branchId} className="px-5 py-2.5 text-right font-mono">
                    {formatMoney(b.tradePayables, currency)}
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right font-mono font-bold bg-slate-50/40">
                  {formatMoney(companyTotal.tradePayables, currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Mandatory Footer */}
      <footer className="mt-12 border-t border-slate-200 pt-6 text-center text-xs text-slate-500">
        <p className="font-semibold text-slate-700">Axon Mobile ERP · Branch Performance Intelligence</p>
        <p className="mt-1">© 2026 Copyright Reserved · Qasim Ali · 0315-5049489</p>
      </footer>
    </div>
  );
}
