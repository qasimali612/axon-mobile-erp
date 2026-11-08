import { PurchaseOrderEditor } from "@/components/purchase/purchase-order-editor";
import { requirePagePermission } from "@/lib/auth";

export default async function NewPurchaseOrderPage() {
  const context = await requirePagePermission("PURCHASE_ORDER_CREATE");
  return <PurchaseOrderEditor currency={context.company.currencyCode} permissions={context.permissions} />;
}
