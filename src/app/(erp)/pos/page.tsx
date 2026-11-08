import { PosWorkspace } from "@/components/sales/pos-workspace";
import { requirePagePermission } from "@/lib/auth";

export default async function PosPage() {
  const context = await requirePagePermission("SALES_INVOICE_CREATE");
  return <PosWorkspace currency={context.company.currencyCode} userId={context.user.id} permissions={context.permissions} />;
}
