import { GoodsReceiptEditor } from "@/components/purchase/goods-receipt-editor";
import { requirePagePermission } from "@/lib/auth";
import { idSchema } from "@/lib/validation";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditGoodsReceiptPage({ params }: PageProps) {
  const context = await requirePagePermission("PURCHASE_RECEIPT_CREATE");
  const id = idSchema.parse((await params).id);
  return <GoodsReceiptEditor currency={context.company.currencyCode} permissions={context.permissions} receiptId={id} defaultBranchId={context.activeBranchId} defaultWarehouseId={context.activeWarehouseId} />;
}
