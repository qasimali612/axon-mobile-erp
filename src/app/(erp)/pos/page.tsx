import { PosWorkspace } from "@/components/sales/pos-workspace";
import { requirePagePermission } from "@/lib/auth";

type PageProps = { searchParams: Promise<{ invoiceId?: string }> };

export default async function PosPage({ searchParams }: PageProps) {
  const context = await requirePagePermission("SALES_INVOICE_CREATE");
  const params = await searchParams;
  return <PosWorkspace currency={context.company.currencyCode} userId={context.user.id} permissions={context.permissions} invoiceId={params.invoiceId} />;
}
