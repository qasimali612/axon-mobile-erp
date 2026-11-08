import { GoodsReceiptEditor } from "@/components/purchase/goods-receipt-editor";
import { requirePagePermission } from "@/lib/auth";

export default async function NewGoodsReceiptPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await requirePagePermission("PURCHASE_RECEIPT_CREATE");
  const query = await searchParams;
  const requestedOrder = query.purchaseOrderId;
  const initialPurchaseOrderId = Array.isArray(requestedOrder) ? requestedOrder[0] : requestedOrder;
  return <GoodsReceiptEditor currency={context.company.currencyCode} permissions={context.permissions} defaultBranchId={context.activeBranchId} defaultWarehouseId={context.activeWarehouseId} initialPurchaseOrderId={initialPurchaseOrderId || null} />;
}
