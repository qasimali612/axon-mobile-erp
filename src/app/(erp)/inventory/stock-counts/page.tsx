import { StockCountWorkspace } from "@/components/inventory/stock-count-workspace";
import { requirePagePermission } from "@/lib/auth";

export default async function StockCountsPage() {
  const context = await requirePagePermission("inventory.stock.view");
  return <StockCountWorkspace
    currency={context.company.currencyCode}
    activeWarehouseId={context.activeWarehouseId}
    permissions={{
      manage: context.permissions.includes("inventory.stocktake.manage"),
      post: context.permissions.includes("inventory.stocktake.post"),
    }}
  />;
}
