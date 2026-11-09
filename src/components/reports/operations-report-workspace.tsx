"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Download,
  ExternalLink,
  FileBarChart2,
  Layers,
  Loader2,
  Package,
  Printer,
  RefreshCw,
  Search,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

export type ReportKey =
  | "purchase-orders"
  | "goods-receipts"
  | "purchase-returns"
  | "sales"
  | "sales-returns"
  | "inventory"
  | "devices"
  | "movements"
  | "profitability"
  | "reorder"
  | "stock-by-brand"
  | "stock-by-model"
  | "stock-aging"
  | "stock-ledger-rollforward"
  | "negative-stock-exceptions"
  | "imei-master-registry"
  | "available-imei"
  | "sold-imei"
  | "duplicate-imei-exceptions"
  | "imei-reconciliation"
  | "sales-by-brand"
  | "sales-by-model"
  | "salesperson-performance"
  | "fast-moving-stock"
  | "slow-moving-stock"
  | "supplier-purchase-volume"
  | "purchase-price-trends";

type CompanyLike = {
  name: string;
  legalName?: string | null;
  code?: string;
  taxRegistrationNumber?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  province?: string | null;
  phone?: string | null;
};

type Props = {
  company?: CompanyLike;
  currency: string;
  permissions: string[];
  initialReport?: string;
  initialFrom?: string;
  initialTo?: string;
};

const definitions: Array<{ key: ReportKey; label: string; permission: string; category: string }> = [
  // Operational Legacy
  { key: "inventory", label: "Stock Balances", permission: "report.inventory", category: "Inventory" },
  { key: "stock-by-brand", label: "Stock by Brand", permission: "report.inventory", category: "Inventory" },
  { key: "stock-by-model", label: "Stock by Model / SKU", permission: "report.inventory", category: "Inventory" },
  { key: "stock-aging", label: "Stock Aging", permission: "report.inventory", category: "Inventory" },
  { key: "stock-ledger-rollforward", label: "Stock Ledger Roll-Forward", permission: "report.inventory", category: "Inventory" },
  { key: "negative-stock-exceptions", label: "Negative Stock Exceptions", permission: "report.inventory", category: "Inventory" },
  { key: "movements", label: "Movement Ledger", permission: "report.inventory", category: "Inventory" },
  { key: "reorder", label: "Reorder Alerts", permission: "report.purchase", category: "Inventory" },

  // IMEI & Serialized
  { key: "devices", label: "Physical Handset Units", permission: "report.inventory", category: "IMEI" },
  { key: "imei-master-registry", label: "IMEI Master Registry", permission: "report.inventory", category: "IMEI" },
  { key: "available-imei", label: "Available IMEIs", permission: "report.inventory", category: "IMEI" },
  { key: "sold-imei", label: "Sold IMEIs", permission: "report.inventory", category: "IMEI" },
  { key: "duplicate-imei-exceptions", label: "Duplicate IMEI Exceptions", permission: "report.inventory", category: "IMEI" },
  { key: "imei-reconciliation", label: "IMEI vs Balance Reconciliation", permission: "report.inventory", category: "IMEI" },

  // Sales
  { key: "sales", label: "Sales Invoices", permission: "report.sales", category: "Sales" },
  { key: "sales-by-brand", label: "Sales & Margin by Brand", permission: "report.sales", category: "Sales" },
  { key: "sales-by-model", label: "Sales & Margin by Model", permission: "report.sales", category: "Sales" },
  { key: "salesperson-performance", label: "Salesperson Performance", permission: "report.sales", category: "Sales" },
  { key: "profitability", label: "Line Profitability", permission: "report.profitability", category: "Sales" },
  { key: "fast-moving-stock", label: "Fast-Moving Stock", permission: "report.sales", category: "Sales" },
  { key: "slow-moving-stock", label: "Slow-Moving Stock", permission: "report.sales", category: "Sales" },
  { key: "sales-returns", label: "Sales Returns", permission: "report.sales", category: "Sales" },

  // Purchases
  { key: "goods-receipts", label: "Goods Receipts (GRN)", permission: "report.purchase", category: "Purchases" },
  { key: "purchase-orders", label: "Purchase Orders", permission: "report.purchase", category: "Purchases" },
  { key: "supplier-purchase-volume", label: "Supplier Purchase Volume", permission: "report.purchase", category: "Purchases" },
  { key: "purchase-price-trends", label: "Purchase Price Trends", permission: "report.purchase", category: "Purchases" },
  { key: "purchase-returns", label: "Purchase Returns", permission: "report.purchase", category: "Purchases" },
];

const columns: Record<ReportKey, Array<{ key: string; label: string; money?: boolean; date?: boolean }>> = {
  "purchase-orders": [{ key: "documentNumber", label: "PO" }, { key: "date", label: "Date", date: true }, { key: "status", label: "Status" }, { key: "party", label: "Supplier" }, { key: "sku", label: "SKU" }, { key: "product", label: "Product / variant" }, { key: "orderedQuantity", label: "Ordered" }, { key: "receivedQuantity", label: "Received" }, { key: "outstandingQuantity", label: "Outstanding" }, { key: "unitCost", label: "Unit cost", money: true }, { key: "lineTotal", label: "Line total", money: true }],
  "goods-receipts": [{ key: "documentNumber", label: "GRN" }, { key: "date", label: "Date", date: true }, { key: "status", label: "Status" }, { key: "party", label: "Supplier" }, { key: "sku", label: "SKU" }, { key: "product", label: "Product / variant" }, { key: "acceptedQuantity", label: "Accepted" }, { key: "rejectedQuantity", label: "Rejected" }, { key: "landedUnitCost", label: "Landed cost", money: true }, { key: "lineTotal", label: "Value", money: true }, { key: "identifiers", label: "IMEI / serial" }],
  "purchase-returns": [{ key: "documentNumber", label: "Return" }, { key: "sourceDocument", label: "Source GRN" }, { key: "date", label: "Date", date: true }, { key: "status", label: "Status" }, { key: "party", label: "Supplier" }, { key: "sku", label: "SKU" }, { key: "product", label: "Product / variant" }, { key: "quantity", label: "Quantity" }, { key: "disposition", label: "Disposition" }, { key: "total", label: "Supplier credit", money: true }, { key: "cost", label: "Inventory cost", money: true }, { key: "identifiers", label: "IMEI / serial" }],
  sales: [{ key: "documentNumber", label: "Invoice" }, { key: "date", label: "Date", date: true }, { key: "status", label: "Status" }, { key: "party", label: "Customer" }, { key: "salesperson", label: "Salesperson" }, { key: "sku", label: "SKU" }, { key: "product", label: "Product / variant" }, { key: "quantity", label: "Quantity" }, { key: "netRevenue", label: "Revenue", money: true }, { key: "cost", label: "Cost", money: true }, { key: "grossProfit", label: "Gross profit", money: true }, { key: "marginPercent", label: "Margin %" }, { key: "total", label: "Total", money: true }, { key: "identifiers", label: "IMEI / serial" }],
  "sales-returns": [{ key: "documentNumber", label: "Return" }, { key: "sourceDocument", label: "Source invoice" }, { key: "date", label: "Date", date: true }, { key: "status", label: "Status" }, { key: "party", label: "Customer" }, { key: "sku", label: "SKU" }, { key: "product", label: "Product / variant" }, { key: "quantity", label: "Quantity" }, { key: "disposition", label: "Disposition" }, { key: "total", label: "Customer credit", money: true }, { key: "cost", label: "Cost", money: true }, { key: "identifiers", label: "IMEI / serial" }],
  inventory: [{ key: "branch", label: "Branch" }, { key: "warehouse", label: "Warehouse" }, { key: "sku", label: "SKU" }, { key: "product", label: "Product / variant" }, { key: "tracking", label: "Tracking" }, { key: "quantity", label: "On hand" }, { key: "reserved", label: "Reserved" }, { key: "available", label: "Available" }, { key: "averageCost", label: "Average cost", money: true }, { key: "inventoryValue", label: "Stock value", money: true }],
  devices: [{ key: "status", label: "Status" }, { key: "branch", label: "Branch" }, { key: "warehouse", label: "Warehouse" }, { key: "sku", label: "SKU" }, { key: "product", label: "Product / variant" }, { key: "identifiers", label: "IMEI / serial" }, { key: "acquisitionDate", label: "Received", date: true }, { key: "acquisitionCost", label: "Cost", money: true }, { key: "soldAt", label: "Sold", date: true }],
  movements: [{ key: "date", label: "Date", date: true }, { key: "movementType", label: "Movement" }, { key: "documentNumber", label: "Source" }, { key: "warehouse", label: "Warehouse" }, { key: "sku", label: "SKU" }, { key: "product", label: "Product / variant" }, { key: "quantity", label: "Quantity" }, { key: "unitCost", label: "Unit cost", money: true }, { key: "totalCost", label: "Total cost", money: true }, { key: "identifiers", label: "IMEI / serial" }],
  reorder: [{ key: "sku", label: "SKU" }, { key: "product", label: "Product / variant" }, { key: "tracking", label: "Tracking" }, { key: "onHand", label: "On hand" }, { key: "reorderLevel", label: "Reorder level" }, { key: "maxStockLevel", label: "Max level" }, { key: "suggestedOrderQty", label: "Suggested qty" }, { key: "preferredSupplier", label: "Preferred supplier" }, { key: "supplierSku", label: "Supplier code" }, { key: "lastCost", label: "Last cost", money: true }, { key: "leadTimeDays", label: "Lead days" }, { key: "minOrderQty", label: "Min order" }],
  profitability: [{ key: "documentNumber", label: "Invoice" }, { key: "date", label: "Date", date: true }, { key: "status", label: "Status" }, { key: "party", label: "Customer" }, { key: "salesperson", label: "Salesperson" }, { key: "sku", label: "SKU" }, { key: "product", label: "Product / variant" }, { key: "quantity", label: "Quantity" }, { key: "netRevenue", label: "Revenue", money: true }, { key: "cost", label: "Cost", money: true }, { key: "grossProfit", label: "Gross profit", money: true }, { key: "marginPercent", label: "Margin %" }, { key: "identifiers", label: "IMEI / serial" }],

  // Enterprise additions
  "stock-by-brand": [{ key: "brand", label: "Brand" }, { key: "variantCount", label: "Variants" }, { key: "quantity", label: "On Hand" }, { key: "available", label: "Available" }, { key: "inventoryValue", label: "Stock Value", money: true }],
  "stock-by-model": [{ key: "product", label: "Phone Model" }, { key: "sku", label: "SKU" }, { key: "brand", label: "Brand" }, { key: "quantity", label: "On Hand" }, { key: "averageCost", label: "Avg Cost", money: true }, { key: "inventoryValue", label: "Total Value", money: true }],
  "stock-aging": [{ key: "brand", label: "Brand" }, { key: "product", label: "Model / SKU" }, { key: "warehouse", label: "Warehouse" }, { key: "totalQty", label: "Total Handsets" }, { key: "current0to30", label: "0-30 Days" }, { key: "days31to60", label: "31-60 Days" }, { key: "days61to90", label: "61-90 Days" }, { key: "over90Days", label: "90+ Days" }, { key: "inventoryValue", label: "Stock Value", money: true }],
  "stock-ledger-rollforward": [{ key: "brand", label: "Brand" }, { key: "product", label: "Product / SKU" }, { key: "warehouse", label: "Warehouse" }, { key: "openingQty", label: "Opening" }, { key: "receivedQty", label: "Inward (GRN)" }, { key: "soldQty", label: "Outward (Sales)" }, { key: "adjustedQty", label: "Adjustments" }, { key: "closingQty", label: "Closing Stock" }, { key: "closingValue", label: "Closing Value", money: true }],
  "negative-stock-exceptions": [{ key: "warehouse", label: "Warehouse" }, { key: "sku", label: "SKU" }, { key: "product", label: "Product" }, { key: "quantity", label: "Discrepancy Qty" }, { key: "averageCost", label: "Unit Cost", money: true }, { key: "status", label: "Exception Status" }],
  "imei-master-registry": [{ key: "identifiers", label: "IMEI 1 / IMEI 2" }, { key: "status", label: "Status" }, { key: "product", label: "Handset Model" }, { key: "sku", label: "SKU" }, { key: "brand", label: "Brand" }, { key: "warehouse", label: "Warehouse" }, { key: "receivedDate", label: "Received Date", date: true }, { key: "acquisitionCost", label: "Landed Cost", money: true }],
  "available-imei": [{ key: "identifiers", label: "IMEI 1 / IMEI 2" }, { key: "product", label: "Handset Model" }, { key: "sku", label: "SKU" }, { key: "brand", label: "Brand" }, { key: "warehouse", label: "Warehouse" }, { key: "branch", label: "Branch" }, { key: "receivedDate", label: "In Stock Since", date: true }, { key: "acquisitionCost", label: "Landed Cost", money: true }],
  "sold-imei": [{ key: "identifiers", label: "IMEI 1 / IMEI 2" }, { key: "product", label: "Handset Model" }, { key: "sku", label: "SKU" }, { key: "brand", label: "Brand" }, { key: "soldDate", label: "Sale Date", date: true }, { key: "customer", label: "Customer" }, { key: "invoiceNumber", label: "Invoice #" }],
  "duplicate-imei-exceptions": [{ key: "identifier", label: "IMEI Identifier" }, { key: "occurrenceCount", label: "Count Found" }, { key: "statuses", label: "Unit Statuses" }, { key: "warehouses", label: "Custody Locations" }],
  "imei-reconciliation": [{ key: "warehouse", label: "Warehouse" }, { key: "sku", label: "SKU" }, { key: "product", label: "Phone Model" }, { key: "balanceQty", label: "System Balance" }, { key: "physicalUnitCount", label: "Physical Handsets" }, { key: "variance", label: "Variance" }, { key: "status", label: "Reconciliation Status" }],
  "sales-by-brand": [{ key: "brand", label: "Brand" }, { key: "unitsSold", label: "Phones Sold" }, { key: "revenue", label: "Total Revenue", money: true }, { key: "cogs", label: "COGS", money: true }, { key: "grossProfit", label: "Gross Profit", money: true }, { key: "margin", label: "Margin %" }],
  "sales-by-model": [{ key: "product", label: "Phone Model" }, { key: "sku", label: "SKU" }, { key: "brand", label: "Brand" }, { key: "unitsSold", label: "Units Sold" }, { key: "revenue", label: "Total Revenue", money: true }, { key: "avgSellingPrice", label: "Avg Price", money: true }, { key: "cogs", label: "COGS", money: true }, { key: "grossProfit", label: "Gross Profit", money: true }, { key: "margin", label: "Margin %" }],
  "salesperson-performance": [{ key: "salesperson", label: "Sales Lead" }, { key: "invoiceCount", label: "Invoices" }, { key: "unitsSold", label: "Phones Sold" }, { key: "totalSales", label: "Total Revenue", money: true }, { key: "grossProfit", label: "Gross Margin", money: true }, { key: "margin", label: "Margin %" }],
  "fast-moving-stock": [{ key: "product", label: "Phone Model" }, { key: "sku", label: "SKU" }, { key: "brand", label: "Brand" }, { key: "unitsSold", label: "Units Sold (Period)" }, { key: "revenue", label: "Revenue", money: true }, { key: "onHandQty", label: "Current Stock" }, { key: "inventoryValue", label: "Stock Value", money: true }],
  "slow-moving-stock": [{ key: "product", label: "Phone Model" }, { key: "sku", label: "SKU" }, { key: "brand", label: "Brand" }, { key: "unitsSold", label: "Units Sold (Period)" }, { key: "onHandQty", label: "Current Stock" }, { key: "inventoryValue", label: "Capital at Risk", money: true }],
  "supplier-purchase-volume": [{ key: "supplier", label: "Supplier / Distributor" }, { key: "code", label: "Vendor Code" }, { key: "receiptCount", label: "Shipments (GRN)" }, { key: "unitsReceived", label: "Total Handsets" }, { key: "totalSpend", label: "Total Spend", money: true }],
  "purchase-price-trends": [{ key: "receiptNumber", label: "GRN #" }, { key: "receiptDate", label: "Date", date: true }, { key: "supplier", label: "Supplier" }, { key: "product", label: "Phone Model" }, { key: "sku", label: "SKU" }, { key: "quantity", label: "Qty" }, { key: "unitPrice", label: "Invoice Unit Cost", money: true }, { key: "landedUnitCost", label: "Landed Unit Cost", money: true }, { key: "totalLineAmount", label: "Total Spent", money: true }],
};

const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export function OperationsReportWorkspace({
  company,
  currency,
  permissions,
  initialReport,
  initialFrom,
  initialTo,
}: Props) {
  const available = useMemo(
    () => definitions.filter((item) => permissions.includes(item.permission)),
    [permissions]
  );

  const defaultReportKey =
    initialReport && available.some((item) => item.key === initialReport)
      ? (initialReport as ReportKey)
      : available[0]?.key || "inventory";

  const initialCategory = useMemo(() => {
    return definitions.find((d) => d.key === defaultReportKey)?.category || "Sales";
  }, [defaultReportKey]);

  const [report, setReport] = useState<ReportKey>(defaultReportKey);
  const [activeCategory, setActiveCategory] = useState<string>(initialCategory);
  const [tableSearch, setTableSearch] = useState<string>("");
  const [lookups, setLookups] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const found = definitions.find((d) => d.key === report);
    if (found && found.category !== activeCategory) {
      setActiveCategory(found.category);
    }
  }, [report, activeCategory]);

  const categoryReports = useMemo(() => {
    return available.filter((item) => item.category === activeCategory);
  }, [available, activeCategory]);

  const [filters, setFilters] = useState({
    from: initialFrom || `${today().slice(0, 7)}-01`,
    to: initialTo || today(),
    branchId: "",
    warehouseId: "",
    productId: "",
    status: "",
  });

  useEffect(() => {
    fetch("/api/operations/lookups", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => setLookups(body.data || null))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams({ report, limit: "1000" });
    Object.entries(filters).forEach(([key, value]) => {
      if (
        value &&
        !(
          [
            "inventory",
            "devices",
            "stock-by-brand",
            "stock-by-model",
            "available-imei",
            "duplicate-imei-exceptions",
            "imei-reconciliation",
            "negative-stock-exceptions",
          ].includes(report) && ["from", "to", "status"].includes(key)
        )
      ) {
        query.set(key, value);
      }
    });

    const response = await fetch(`/api/reports/operations?${query}`, { cache: "no-store" });
    const body = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) return toast.error(body?.error?.message || "Report could not be loaded.");
    setRows(body.data.rows || []);
    if (body.data.truncated) {
      toast.warning(
        "The report reached the 1,000-row display limit. Narrow the filters or export in smaller periods."
      );
    }
  }, [filters, report]);

  useEffect(() => {
    void load();
  }, [load]);

  const reportColumns = columns[report] || columns.inventory;

  const summary = useMemo(
    () => ({
      rows: rows.length,
      quantity: rows.reduce(
        (sum, row) =>
          sum +
          Number(
            row.acceptedQuantity ??
              row.quantity ??
              row.orderedQuantity ??
              row.unitsSold ??
              row.totalQty ??
              0
          ),
        0
      ),
      value: rows.reduce(
        (sum, row) =>
          sum +
          Number(
            row.lineTotal ??
              row.total ??
              row.inventoryValue ??
              row.totalCost ??
              row.revenue ??
              row.totalSpend ??
              0
          ),
        0
      ),
      tax: rows.reduce((sum, row) => sum + Number(row.tax ?? 0), 0),
      profit: rows.reduce((sum, row) => sum + Number(row.grossProfit ?? 0), 0),
    }),
    [rows]
  );

  const displayedRows = useMemo(() => {
    if (!tableSearch.trim()) return rows;
    const q = tableSearch.trim().toLowerCase();
    return rows.filter((r) =>
      Object.values(r).some((val) => String(val ?? "").toLowerCase().includes(q))
    );
  }, [rows, tableSearch]);

  const warehouses = (lookups?.warehouses || []).filter(
    (item: any) => !filters.branchId || item.branchId === filters.branchId
  );

  function reportQuery(extra: Record<string, string> = {}) {
    const query = new URLSearchParams({ report, limit: "1000", ...extra });
    Object.entries(filters).forEach(([key, value]) => {
      if (
        value &&
        !(
          [
            "inventory",
            "devices",
            "stock-by-brand",
            "stock-by-model",
            "available-imei",
            "duplicate-imei-exceptions",
            "imei-reconciliation",
            "negative-stock-exceptions",
          ].includes(report) && ["from", "to", "status"].includes(key)
        )
      ) {
        query.set(key, value);
      }
    });
    return query;
  }

  function exportCsv() {
    const query = reportQuery({ format: "csv" });
    window.location.assign(`/api/reports/operations?${query.toString()}`);
  }

  function detailHref(row: any) {
    if (!row.documentId) return null;
    if (report === "purchase-orders") return `/purchases/${row.documentId}/print`;
    if (report === "goods-receipts") return `/goods-receipts/${row.documentId}/print`;
    if (["purchase-returns", "sales-returns"].includes(report))
      return `/returns/${row.documentId}/print`;
    if (["sales", "profitability"].includes(report)) return `/sales/${row.documentId}/print`;
    return null;
  }

  const [views, setViews] = useState<any[]>([]);
  const [viewName, setViewName] = useState("");

  const loadViews = useCallback(async () => {
    const response = await fetch("/api/reports/saved-views?module=operations", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (response.ok) setViews(body.data || []);
  }, []);

  useEffect(() => {
    void loadViews();
  }, [loadViews]);

  async function saveView() {
    if (viewName.trim().length < 2)
      return toast.error("Give the view a name of at least two characters.");
    const response = await fetch("/api/reports/saved-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "operations", name: viewName.trim(), query: { report, ...filters } }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) return toast.error(body?.error?.message || "The view could not be saved.");
    toast.success("View saved");
    setViewName("");
    await loadViews();
  }

  async function deleteView(id: string) {
    const response = await fetch(`/api/reports/saved-views/${id}`, { method: "DELETE" });
    if (!response.ok) return toast.error("The view could not be deleted.");
    await loadViews();
  }

  function applyView(view: any) {
    const saved = (view.query || {}) as Record<string, string>;
    if (saved.report && definitions.some((item) => item.key === saved.report))
      setReport(saved.report as ReportKey);
    setFilters((current) => ({
      ...current,
      from: saved.from ?? current.from,
      to: saved.to ?? current.to,
      branchId: saved.branchId ?? "",
      warehouseId: saved.warehouseId ?? "",
      productId: saved.productId ?? "",
      status: saved.status ?? "",
    }));
  }

  if (!available.length)
    return (
      <div className="surface p-10 text-center text-sm text-slate-500">
        No operational report permission is assigned.
      </div>
    );

  return (
    <div className="space-y-5">
      {/* Official Print Header */}
      {company && (
        <div className="hidden print:block border-b-2 border-slate-900 pb-4 mb-6">
          <div className="flex justify-between items-start gap-4">
            <div className="flex gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-950 text-lg font-black text-white">
                {company.code ? company.code.slice(0, 2).toUpperCase() : "AX"}
              </div>
              <div>
                <h1 className="text-xl font-extrabold uppercase text-slate-950">
                  {company.legalName || company.name}
                </h1>
                <p className="text-xs text-slate-600">
                  {[company.addressLine1, company.city, company.province].filter(Boolean).join(", ")}
                </p>
                <p className="text-[11px] text-slate-500">
                  {[company.phone ? `Tel: ${company.phone}` : null, company.taxRegistrationNumber ? `Tax Reg / NTN: ${company.taxRegistrationNumber}` : null].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
            <div className="text-right text-xs">
              <span className="font-extrabold uppercase tracking-wider text-blue-700 block text-[11px]">
                {definitions.find((d) => d.key === report)?.label || "Operational Report"}
              </span>
              <p className="font-bold text-slate-800 mt-1">
                Period: {filters.from || "Start"} to {filters.to || "Latest"}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Printed: {new Date().toLocaleString()} · {currency}
              </p>
            </div>
          </div>
        </div>
      )}

      <header className="no-print flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="kicker">Operational Intelligence</span>
          <h1 className="mt-2 text-2xl font-black sm:text-[30px]">
            {definitions.find((d) => d.key === report)?.label || "Business Report"}
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Real-time multi-dimensional business reports with audited export and print capabilities.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/reports"
            className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Hub Catalog
          </Link>
          <button
            onClick={() => window.print()}
            className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
          <button
            onClick={exportCsv}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-700"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </header>

      {/* Category Pillars Selector */}
      <div className="no-print grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { key: "Sales", label: "Sales & Margins", icon: ShoppingCart },
          { key: "Inventory", label: "Inventory & Stock", icon: Package },
          { key: "IMEI", label: "IMEI Handsets", icon: Smartphone },
          { key: "Purchases", label: "Procurement", icon: Truck },
        ].map((cat) => {
          const Icon = cat.icon;
          const isSelected = activeCategory === cat.key;
          const catCount = available.filter((a) => a.category === cat.key).length;
          return (
            <button
              key={cat.key}
              onClick={() => {
                setActiveCategory(cat.key);
                const firstInCat = available.find((a) => a.category === cat.key);
                if (firstInCat && firstInCat.key !== report) {
                  setReport(firstInCat.key);
                  setRows([]);
                  setTableSearch("");
                }
              }}
              className={`flex items-center justify-between rounded-xl border p-3 text-left transition-all ${
                isSelected
                  ? "border-blue-600 bg-blue-50/50 shadow-sm ring-1 ring-blue-500"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`grid h-8 w-8 place-items-center rounded-lg ${
                    isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <span
                    className={`block text-xs font-bold ${
                      isSelected ? "text-blue-900" : "text-slate-800"
                    }`}
                  >
                    {cat.label}
                  </span>
                  <span className="text-[10px] text-slate-400">{catCount} reports</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Sub-Reports Selector */}
      <div className="no-print flex gap-1.5 overflow-x-auto rounded-xl bg-slate-100 p-1.5">
        {categoryReports.map((item) => (
          <button
            key={item.key}
            onClick={() => {
              setReport(item.key);
              setRows([]);
              setTableSearch("");
            }}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              report === item.key
                ? "bg-white text-blue-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Filter Toolbar */}
      <section className="no-print surface p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="field-label text-xs">
            From Date
            <input
              type="date"
              className="field-input text-xs"
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            />
          </label>
          <label className="field-label text-xs">
            To Date
            <input
              type="date"
              className="field-input text-xs"
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            />
          </label>
          <label className="field-label text-xs">
            Branch
            <select
              className="field-input text-xs"
              value={filters.branchId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, branchId: e.target.value, warehouseId: "" }))
              }
            >
              <option value="">All Branches</option>
              {lookups?.branches?.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label text-xs">
            Warehouse
            <select
              className="field-input text-xs"
              value={filters.warehouseId}
              onChange={(e) => setFilters((f) => ({ ...f, warehouseId: e.target.value }))}
            >
              <option value="">All Warehouses</option>
              {warehouses.map((w: any) => (
                <option key={w.id} value={w.id}>
                  {w.code} · {w.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              onClick={() => void load()}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
        </div>
      </section>

      {/* Summary Stats */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Total Records / Invoices
          </span>
          <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{summary.rows}</p>
          <p className="mt-0.5 text-[10px] text-slate-400">Loaded in selected range</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Total Volume / Quantity
          </span>
          <p className="mt-1 text-2xl font-black tabular-nums text-emerald-700">{summary.quantity}</p>
          <p className="mt-0.5 text-[10px] text-slate-400">Total volume moved</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Net Turnover / Valuation
          </span>
          <p className="mt-1 text-2xl font-black tabular-nums text-blue-700">
            {formatMoney(summary.value, currency)}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-400">Base transactional value</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {summary.tax > 0 ? "Tax Collected" : summary.profit > 0 ? "Gross Profit" : "Active Scope"}
          </span>
          <p className="mt-1 text-2xl font-black tabular-nums text-purple-700">
            {summary.tax > 0
              ? formatMoney(summary.tax, currency)
              : summary.profit > 0
              ? formatMoney(summary.profit, currency)
              : `${summary.rows} items`}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-400">
            {summary.tax > 0 ? "FBR / Sales tax" : summary.profit > 0 ? "Realized margin" : "Report items"}
          </p>
        </div>
      </section>

      {/* Report Data Table */}
      <section className="surface overflow-hidden">
        <div className="no-print flex flex-col gap-2 border-b border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative min-w-[260px] max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search table rows…"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
            />
            {tableSearch ? (
              <button
                onClick={() => setTableSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
          <span className="text-[11px] font-medium text-slate-400">
            Showing {displayedRows.length} of {rows.length} records
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b">
              <tr>
                {reportColumns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 ${col.money ? "text-right" : "text-left"}`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={reportColumns.length}
                    className="py-20 text-center text-xs text-slate-400"
                  >
                    <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-blue-600" />
                    Calculating report...
                  </td>
                </tr>
              ) : !rows.length ? (
                <tr>
                  <td
                    colSpan={reportColumns.length}
                    className="py-20 text-center text-xs text-slate-400"
                  >
                    <FileBarChart2 className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    <p className="font-bold text-slate-600">No records found for selected filters</p>
                  </td>
                </tr>
              ) : !displayedRows.length ? (
                <tr>
                  <td
                    colSpan={reportColumns.length}
                    className="py-14 text-center text-xs text-slate-400"
                  >
                    No records match "{tableSearch}".
                  </td>
                </tr>
              ) : (
                displayedRows.map((row, idx) => (
                  <tr key={idx} className="text-xs hover:bg-slate-50/70 transition-colors">
                    {reportColumns.map((col) => {
                      const val = row[col.key];
                      const href = col.key === "documentNumber" ? detailHref(row) : null;
                      return (
                        <td
                          key={col.key}
                          className={`px-4 py-3 ${
                            col.money ? "text-right font-mono font-semibold tabular-nums" : ""
                          }`}
                        >
                          {href ? (
                            <Link
                              href={href}
                              target="_blank"
                              className="font-bold text-blue-700 hover:underline inline-flex items-center gap-1"
                            >
                              {String(val ?? "—")}
                              <ExternalLink className="h-3 w-3 text-slate-400" />
                            </Link>
                          ) : col.money ? (
                            val !== null && val !== undefined ? (
                              formatMoney(Number(val), currency)
                            ) : (
                              "—"
                            )
                          ) : col.date ? (
                            val ? (
                              formatDate(val)
                            ) : (
                              "—"
                            )
                          ) : col.key === "status" ? (
                            <Badge
                              tone={
                                val === "POSTED" || val === "IN_STOCK" || val === "ACCEPTED"
                                  ? "green"
                                  : val === "SUBMITTED" || val === "PENDING"
                                  ? "amber"
                                  : val === "APPROVED"
                                  ? "blue"
                                  : val === "REVERSED" || val === "CANCELLED" || val === "REJECTED"
                                  ? "red"
                                  : "slate"
                              }
                            >
                              {titleCase(String(val ?? "—"))}
                            </Badge>
                          ) : col.key === "marginPercent" ? (
                            val !== null && val !== undefined ? (
                              <span
                                className={`font-mono font-bold ${
                                  Number(val) > 20
                                    ? "text-emerald-700"
                                    : Number(val) > 5
                                    ? "text-blue-700"
                                    : Number(val) >= 0
                                    ? "text-slate-800"
                                    : "text-rose-600"
                                }`}
                              >
                                {Number(val).toFixed(2)}%
                              </span>
                            ) : (
                              "—"
                            )
                          ) : (
                            String(val ?? "—")
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Official Print Signatures */}
      <div className="hidden print:grid grid-cols-3 gap-8 pt-8 border-t border-slate-300 mt-12 text-center text-xs">
        <div>
          <div className="border-b border-slate-400 h-10 mb-2" />
          <b className="text-slate-800">Prepared by (Officer)</b>
        </div>
        <div>
          <div className="border-b border-slate-400 h-10 mb-2" />
          <b className="text-slate-800">Verified by (Internal Audit)</b>
        </div>
        <div>
          <div className="border-b border-slate-400 h-10 mb-2" />
          <b className="text-slate-800">Approved by (Branch Manager)</b>
        </div>
      </div>
    </div>
  );
}
