"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/utils";

interface MonthlyTrendItem {
  month: string;
  sales: number;
  purchases: number;
  expenses: number;
  profit: number;
}

interface WarehouseStockItem {
  warehouse: string;
  value: number;
  quantity: number;
}

interface BrandSalesItem {
  brand: string;
  sales: number;
  units: number;
}

export function SalesPurchaseTrendChart({
  data,
  currencyCode,
}: {
  data: MonthlyTrendItem[];
  currencyCode: string;
}) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} />
          <YAxis
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(value: any, name: any) => [
              formatMoney(value.toString(), currencyCode),
              name === "sales" ? "Sales Invoices" : "Goods Receipts",
            ]}
            contentStyle={{
              borderRadius: 12,
              borderColor: "#e2e8f0",
              fontSize: 12,
              boxShadow: "0 10px 30px rgba(15,23,42,.08)",
            }}
          />
          <Legend
            iconType="circle"
            formatter={(val) => (val === "sales" ? "Posted Sales" : "Posted Purchases")}
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          />
          <Bar dataKey="sales" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={32} />
          <Bar dataKey="purchases" fill="#93c5fd" radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProfitTrendChart({
  data,
  currencyCode,
}: {
  data: MonthlyTrendItem[];
  currencyCode: string;
}) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} />
          <YAxis
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(value: any, name: any) => [
              formatMoney(value.toString(), currencyCode),
              name === "profit" ? "Net Operating Profit" : "Operating Expenses",
            ]}
            contentStyle={{
              borderRadius: 12,
              borderColor: "#e2e8f0",
              fontSize: 12,
              boxShadow: "0 10px 30px rgba(15,23,42,.08)",
            }}
          />
          <Legend
            iconType="circle"
            formatter={(val) => (val === "profit" ? "Net Profit" : "Operating Expenses")}
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          />
          <Line
            type="monotone"
            dataKey="profit"
            stroke="#10b981"
            strokeWidth={2.5}
            dot={{ r: 4, fill: "#10b981" }}
          />
          <Line
            type="monotone"
            dataKey="expenses"
            stroke="#f43f5e"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={{ r: 3, fill: "#f43f5e" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WarehouseStockBarChart({
  data,
  currencyCode,
}: {
  data: WarehouseStockItem[];
  currencyCode: string;
}) {
  const colors = ["#2563eb", "#0ea5e9", "#10b981", "#8b5cf6", "#f59e0b"];

  return (
    <div className="h-[210px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 2, right: 12, bottom: 2, left: 8 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="warehouse"
            width={100}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#64748b" }}
          />
          <Tooltip
            formatter={(value: any, name: any) => [
              formatMoney(value.toString(), currencyCode),
              "Inventory Valuation",
            ]}
            contentStyle={{
              borderRadius: 12,
              borderColor: "#e2e8f0",
              fontSize: 12,
              boxShadow: "0 10px 30px rgba(15,23,42,.08)",
            }}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={16}>
            {data.map((_, index) => (
              <Cell key={index} fill={colors[index % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

