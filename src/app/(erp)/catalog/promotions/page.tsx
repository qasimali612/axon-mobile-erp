import { PromotionWorkspace } from "@/components/catalog/promotion-workspace";
import { requirePagePermission } from "@/lib/auth";

export default async function PromotionsPage() {
  const context = await requirePagePermission("catalog.pricelist.view");

  return (
    <PromotionWorkspace
      currency={context.company.currencyCode}
      userPermissions={context.permissions}
    />
  );
}

