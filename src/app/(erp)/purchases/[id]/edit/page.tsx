import { PurchaseOrderEditor } from "@/components/purchase/purchase-order-editor";
import { requirePagePermission } from "@/lib/auth";
import { idSchema } from "@/lib/validation";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditPurchaseOrderPage({ params }: PageProps) {
  const context = await requirePagePermission("PURCHASE_ORDER_CREATE");
  const id = idSchema.parse((await params).id);
  return <PurchaseOrderEditor currency={context.company.currencyCode} permissions={context.permissions} orderId={id} />;
}
