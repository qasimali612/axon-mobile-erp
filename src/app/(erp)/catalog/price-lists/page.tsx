import { PriceListWorkspace } from "@/components/catalog/price-list-workspace";
import { requirePagePermission } from "@/lib/auth";

export const metadata = { title: "Price lists" };

export default async function PriceListsPage() {
  const context = await requirePagePermission("catalog.pricelist.view");
  return (
    <div className="mx-auto max-w-[1520px]">
      <PriceListWorkspace
        permissions={{
          create: context.permissions.includes("catalog.pricelist.create"),
          edit: context.permissions.includes("catalog.pricelist.edit"),
        }}
      />
    </div>
  );
}
