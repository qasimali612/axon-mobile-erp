"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Bar, BarChart, XAxis, YAxis } from "recharts";
import { titleCase } from "@/lib/utils";

const colors: Record<string, string> = {
  IMEI: "#2563eb",
  SERIAL: "#60a5fa",
  BATCH: "#d68b2d",
  QUANTITY: "#81938b",
};

export function TrackingChart({ data, total }: { data: Array<{ name: string; value: number }>; total: number }) {
  return (
    <div className="relative h-[210px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={62} outerRadius={86} paddingAngle={3} stroke="none">
            {data.map((item) => <Cell key={item.name} fill={colors[item.name] || "#94a3b8"} />)}
          </Pie>
          <Tooltip formatter={(value) => [`${value} products`, "Catalog"]} contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", fontSize: 12, boxShadow: "0 10px 30px rgba(15,23,42,.08)" }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><p className="text-3xl font-bold tracking-tight text-slate-900">{total}</p><p className="text-[10px] uppercase tracking-wider text-slate-400">Products</p></div></div>
    </div>
  );
}

export function BrandChart({ data }: { data: Array<{ name: string; products: number }> }) {
  return (
    <div className="h-[210px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 2, right: 12, bottom: 2, left: 8 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={70} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
          <Tooltip cursor={{ fill: "#f8fafc" }} formatter={(value) => [`${value} products`, "Catalog"]} contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", fontSize: 12 }} />
          <Bar dataKey="products" fill="#2d8d69" radius={[0, 6, 6, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrackingLegend({ data }: { data: Array<{ name: string; value: number }> }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-3">
      {data.map((item) => <div key={item.name} className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs text-slate-500"><span className="h-2 w-2 rounded-full" style={{ background: colors[item.name] || "#94a3b8" }} />{titleCase(item.name)}</span><span className="text-xs font-bold text-slate-800">{item.value}</span></div>)}
    </div>
  );
}
