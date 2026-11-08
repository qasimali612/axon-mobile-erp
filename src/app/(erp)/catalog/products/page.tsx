import { Suspense } from "react";
import { ProductCatalog, type Product } from "@/components/catalog/product-catalog";
import { PageHeader } from "@/components/ui/page-header";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

export const metadata = { title: "Product catalog" };

export default async function ProductsPage() {
  const context = await requirePagePermission("catalog.product.view");
  const companyId = context.company.id;
  const [products, total, imeiCount, qtyCount, categories, brands, units, suppliers] = await Promise.all([
    prisma.product.findMany({
      where: { companyId, status: "ACTIVE" },
      include: { brand: true, category: true, unit: true, preferredSupplier: true, variants: { orderBy: { createdAt: "asc" } }, barcodes: true },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      take: 25,
    }),
    prisma.product.count({ where: { companyId, status: "ACTIVE" } }),
    prisma.product.count({ where: { companyId, status: "ACTIVE", trackingMethod: "IMEI" } }),
    prisma.product.count({ where: { companyId, status: "ACTIVE", trackingMethod: "QUANTITY" } }),
    prisma.productCategory.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.brand.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.unitOfMeasure.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { companyId, status: "ACTIVE" }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-[1520px]">
      <PageHeader
        kicker="Product master"
        title="Product catalog"
        description="Define tracking policy, variants, commercial controls, and barcodes once—then reuse them safely throughout operations."
      />
      <Suspense fallback={<div className="surface h-80 animate-pulse bg-slate-50" />}>
        <ProductCatalog
          initialProducts={jsonSafe(products) as unknown as Product[]}
          initialTotal={total}
          initialStats={{
            total,
            imei: imeiCount,
            quantity: qtyCount,
            brands: brands.length,
            categories: categories.length,
          }}
          refs={{ categories, brands, units, suppliers }}
          currency={context.company.currencyCode}
          permissions={context.permissions}
        />
      </Suspense>
    </div>
  );
}
