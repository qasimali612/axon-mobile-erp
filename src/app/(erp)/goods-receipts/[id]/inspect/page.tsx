import { GoodsReceiptInspector } from "@/components/purchase/goods-receipt-inspector";
import { assertPermittedBranch, requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idSchema } from "@/lib/validation";

export default async function InspectGoodsReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePagePermission("PURCHASE_RECEIPT_INSPECT");
  const id = idSchema.parse((await params).id);
  const receipt = await prisma.purchaseReceipt.findFirstOrThrow({ where: { id, companyId: context.company.id }, select: { branchId: true } });
  assertPermittedBranch(context, "PURCHASE_RECEIPT_INSPECT", receipt.branchId);
  return <GoodsReceiptInspector receiptId={id}/>;
}
