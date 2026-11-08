import { StockAdjustmentWorkspace } from "@/components/inventory/stock-adjustment-workspace";
import { requirePagePermission } from "@/lib/auth";

export default async function StockAdjustmentsPage() {
  const context = await requirePagePermission("inventory.stock.view");
  return <StockAdjustmentWorkspace
    currency={context.company.currencyCode}
    activeWarehouseId={context.activeWarehouseId}
    permissions={{
      create: context.permissions.includes("inventory.stock.adjust"),
      approve: context.permissions.includes("inventory.stock.approve_adjustment"),
    }}
  />;
}
