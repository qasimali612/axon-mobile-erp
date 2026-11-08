import { ProcurementManager } from "@/components/purchase/procurement-manager";
import { requirePagePermission } from "@/lib/auth";

const allowedStatuses = new Set(["DRAFT", "SUBMITTED", "INSPECTED", "APPROVED", "POSTED", "REJECTED", "CANCELLED", "CLOSED"]);

type PageProps = { searchParams: Promise<{ status?: string }> };

export default async function GoodsReceiptsPage({ searchParams }: PageProps) {
  const ctx = await requirePagePermission("purchase.view");
  const params = await searchParams;
  const status = params.status && allowedStatuses.has(params.status) ? params.status : "";
  return <ProcurementManager currency={ctx.company.currencyCode} userId={ctx.user.id} permissions={ctx.permissions} initialTab="receipts" initialStatus={status} />;
}
