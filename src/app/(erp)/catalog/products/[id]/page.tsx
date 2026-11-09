import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Barcode, Boxes, Edit3, Layers, Package, ShieldCheck, Tag, Warehouse } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney } from "@/lib/utils";
import { idSchema } from "@/lib/validation";

type PageProps = { params: Promise<{ id: string }> };

export default async function ProductDetailPage({ params }: PageProps) {
  const context = await requirePagePermission("catalog.product.view");
  const id = idSchema.parse((await params).id);

  const product = await prisma.product.findFirst({
    where: { id, companyId: context.company.id },
    include: {
      brand: true,
      category: true,
      unit: true,
      preferredSupplier: true,
      variants: {
        include: {
          stockBalances: {
            include: { warehouse: { select: { code: true, name: true } } },
          },
          barcodes: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!product) notFound();

  const currency = context.company.currencyCode;
  const canEdit = context.permissions.includes("catalog.product.edit");

  // Aggregate stock across variants
  const totalStock = product.variants.reduce(
    (sum, v) => sum + v.stockBalances.reduce((bSum, b) => bSum + Number(b.quantity), 0),
    0
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/catalog/products"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition mb-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Product Catalog
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{product.name}</h1>
            <Badge tone={product.status === "ACTIVE" ? "green" : "slate"}>{product.status}</Badge>
            <Badge tone="blue">{product.trackingMethod}</Badge>
            {product.brand ? <Badge tone="slate">{product.brand.name}</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            SKU: <span className="font-mono font-semibold text-slate-700">{product.sku}</span> · Category: {product.category?.name || "Uncategorized"} · Unit: {product.unit?.name || "Piece"}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canEdit ? (
            <Link
              href={`/catalog/products?edit=${product.id}`}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white hover:bg-blue-700 transition"
            >
              <Edit3 className="h-3.5 w-3.5" /> Edit Product
            </Link>
          ) : null}

          {canEdit ? (
            <Link
              href={`/catalog/products?variants=${product.id}`}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              <Layers className="h-3.5 w-3.5" /> Manage Variants ({product.variants.length})
            </Link>
          ) : null}
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Stock On Hand</span>
          <p className="mt-1 text-2xl font-black text-slate-800">{totalStock.toLocaleString()} {product.unit?.code || "units"}</p>
          <p className="text-xs text-slate-500 mt-1">Across all branches and warehouses</p>
        </div>

        <div className="surface p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Variants</span>
          <p className="mt-1 text-2xl font-black text-slate-800">{product.variants.length}</p>
          <p className="text-xs text-slate-500 mt-1">Colors, storage capacities & regions</p>
        </div>

        <div className="surface p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Preferred Supplier</span>
          <p className="mt-1 text-base font-bold text-slate-800 truncate">{product.preferredSupplier?.name || "None assigned"}</p>
          <p className="text-xs text-slate-500 mt-1">{product.preferredSupplier?.code || "—"}</p>
        </div>

        <div className="surface p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tracking & Reorder</span>
          <p className="mt-1 text-base font-bold text-slate-800">{product.trackingMethod} Tracking</p>
          <p className="text-xs text-slate-500 mt-1">
            Reorder Level: {Number(product.reorderLevel || 0)} · Max: {Number(product.maxStockLevel || 0)}
          </p>
        </div>
      </div>

      {/* Variants Table */}
      <section className="surface overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Configured Variants ({product.variants.length})</h2>
            <p className="text-xs text-slate-500">SKUs, pricing rules, inventory stock, and barcodes</p>
          </div>
          {canEdit ? (
            <Link
              href={`/catalog/products?variants=${product.id}`}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
            >
              + Add / Edit Variants
            </Link>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Variant / Specs</th>
                <th className="px-3 py-3 text-right">Cost Price</th>
                <th className="px-3 py-3 text-right">Wholesale</th>
                <th className="px-3 py-3 text-right">Retail Price</th>
                <th className="px-3 py-3 text-right">Margin %</th>
                <th className="px-3 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {product.variants.map((v) => {
                const cost = Number(v.purchasePrice);
                const retail = Number(v.retailPrice);
                const margin = cost > 0 && retail > cost ? Math.round(((retail - cost) / retail) * 100) : 0;
                const vStock = v.stockBalances.reduce((sum, b) => sum + Number(b.quantity), 0);

                return (
                  <tr key={v.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-800">{v.sku}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{v.name}</p>
                      <div className="flex gap-2 text-[10px] text-slate-500 mt-0.5">
                        {v.color ? <span>Color: {v.color}</span> : null}
                        {v.storageGb ? <span>Storage: {v.storageGb}GB</span> : null}
                        {v.ramGb ? <span>RAM: {v.ramGb}GB</span> : null}
                        {v.networkType ? <span>Network: {v.networkType}</span> : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-slate-600">{formatMoney(String(cost), currency)}</td>
                    <td className="px-3 py-3 text-right font-mono text-slate-600">{formatMoney(String(v.wholesalePrice), currency)}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">{formatMoney(String(retail), currency)}</td>
                    <td className="px-3 py-3 text-right font-mono">
                      {margin > 0 ? (
                        <span className="font-semibold text-emerald-700">{margin}%</span>
                      ) : (
                        <span className="text-slate-400">0%</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold">
                      <span className={vStock > 0 ? "text-slate-900" : "text-amber-600"}>
                        {vStock.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge tone={v.isActive ? "green" : "slate"}>{v.isActive ? "Active" : "Inactive"}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!product.variants.length ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No variants defined for this product yet.
            </div>
          ) : null}
        </div>
      </section>

      {/* Warehouse Stock Details */}
      {product.variants.some((v) => v.stockBalances.length > 0) ? (
        <section className="surface p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-blue-600" /> Warehouse Stock Allocation
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {product.variants.flatMap((v) =>
              v.stockBalances
                .filter((b) => Number(b.quantity) > 0)
                .map((b) => (
                  <div key={b.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs flex justify-between items-center">
                    <div>
                      <span className="font-bold text-slate-800">{b.warehouse.name} ({b.warehouse.code})</span>
                      <span className="block text-[10px] text-slate-500 font-mono">{v.sku} · {v.name}</span>
                    </div>
                    <span className="font-mono font-bold text-sm text-slate-900">
                      {Number(b.quantity).toLocaleString()}
                    </span>
                  </div>
                ))
            )}
          </div>
        </section>
      ) : null}

      <div className="text-center text-[10px] text-slate-400 pt-4">
        © 2026 Copyright Reserved · Qasim Ali · 0315-5049489
      </div>
    </div>
  );
}
