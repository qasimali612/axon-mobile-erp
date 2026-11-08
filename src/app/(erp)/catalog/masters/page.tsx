import { CatalogMasterWorkspace } from "@/components/catalog/catalog-master-workspace";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Catalog masters" };

export default async function CatalogMastersPage() {
  const context = await requirePagePermission("catalog.product.view");
  const companyId = context.company.id;

  const [categoriesCount, brandsCount, unitsCount] = await Promise.all([
    prisma.productCategory.count({ where: { companyId } }),
    prisma.brand.count({ where: { companyId } }),
    prisma.unitOfMeasure.count({ where: { companyId } }),
  ]);

  return (
    <div className="mx-auto max-w-[1520px]">
      <CatalogMasterWorkspace
        permissions={{
          create: context.permissions.includes("catalog.product.create"),
          edit: context.permissions.includes("catalog.product.edit"),
          archive: context.permissions.includes("catalog.product.archive"),
        }}
        initialCounts={{
          categories: categoriesCount,
          brands: brandsCount,
          units: unitsCount,
        }}
      />
    </div>
  );
}
