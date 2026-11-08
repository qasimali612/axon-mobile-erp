import { SupplierItemWorkspace } from "@/components/catalog/supplier-item-workspace";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Supplier item codes" };

export default async function SupplierItemsPage() {
  const context = await requirePagePermission("catalog.product.view");
  const companyId = context.company.id;
  const [suppliers, products] = await Promise.all([
    prisma.supplier.findMany({ where: { companyId, status: "ACTIVE" }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.product.findMany({ where: { companyId, status: "ACTIVE" }, select: { id: true, name: true, sku: true }, orderBy: { name: "asc" }, take: 500 }),
  ]);
  return (
    <div className="mx-auto max-w-[1380px]">
      <SupplierItemWorkspace
        permissions={{ edit: context.permissions.includes("catalog.product.edit") }}
        suppliers={suppliers}
        products={products.map((product) => ({ id: product.id, code: product.sku, name: `${product.sku} · ${product.name}` }))}
      />
    </div>
  );
}
