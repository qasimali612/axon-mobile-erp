import { SalesManager } from "@/components/sales/sales-manager";
import { requirePagePermission } from "@/lib/auth";

const documentStatuses = new Set(["DRAFT", "SUBMITTED", "APPROVED", "POSTED", "REJECTED", "CANCELLED", "REVERSED"]);
const paymentStatuses = new Set(["UNPAID", "PARTIAL", "PAID", "OVERDUE"]);

type PageProps = { searchParams: Promise<{ status?: string; paymentStatus?: string }> };

export default async function SalesPage({ searchParams }: PageProps) {
  const context = await requirePagePermission("sales.view");
  const params = await searchParams;
  return <SalesManager
    currency={context.company.currencyCode}
    userId={context.user.id}
    permissions={context.permissions}
    initialStatus={params.status && documentStatuses.has(params.status) ? params.status : ""}
    initialPaymentStatus={params.paymentStatus && paymentStatuses.has(params.paymentStatus) ? params.paymentStatus : ""}
  />;
}
