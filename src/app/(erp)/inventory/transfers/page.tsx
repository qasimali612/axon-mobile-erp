import { StockTransferWorkspace } from "@/components/inventory/stock-transfer-workspace";
import { requirePagePermission } from "@/lib/auth";

export default async function StockTransfersPage() {
  const context = await requirePagePermission("inventory.transfer.view");
  return <StockTransferWorkspace
    currency={context.company.currencyCode}
    activeWarehouseId={context.activeWarehouseId}
    permissions={{
      create: context.permissions.includes("inventory.transfer.create"),
      approve: context.permissions.includes("inventory.transfer.approve"),
      dispatch: context.permissions.includes("inventory.transfer.dispatch"),
      receive: context.permissions.includes("inventory.transfer.receive"),
    }}
  />;
}
