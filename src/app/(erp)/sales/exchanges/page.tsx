import { ExchangeWorkspace } from "@/components/sales/exchange-workspace";
import { requirePagePermission } from "@/lib/auth";

export default async function ExchangesPage() {
  const context = await requirePagePermission("sales.view");

  return (
    <ExchangeWorkspace
      currency={context.company.currencyCode}
      userPermissions={context.permissions}
    />
  );
}

