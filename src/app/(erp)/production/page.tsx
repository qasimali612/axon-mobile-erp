import { ProductionWorkspace } from "@/components/production/production-workspace";
import { requirePagePermission } from "@/lib/auth";

export const metadata = { title: "Production Orders & Assembly" };

export default async function ProductionOrdersPage() {
  const context = await requirePagePermission("production.view");

  return (
    <div className="mx-auto max-w-[1520px]">
      <ProductionWorkspace
        currency={context.company.currencyCode}
        permissions={context.permissions}
      />
    </div>
  );
}

