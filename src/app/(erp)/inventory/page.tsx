import { StockRegister } from "@/components/inventory/stock-register";
import { requirePagePermission } from "@/lib/auth";
export default async function InventoryPage(){const context=await requirePagePermission("inventory.stock.view");return <StockRegister currency={context.company.currencyCode}/>;}
