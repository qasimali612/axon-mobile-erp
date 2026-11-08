import { PosWorkspace } from "@/components/sales/pos-workspace";
import { requirePagePermission } from "@/lib/auth";
import { idSchema } from "@/lib/validation";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditSalesInvoicePage({ params }: PageProps) {
  const context = await requirePagePermission("SALES_INVOICE_CREATE");
  const id = idSchema.parse((await params).id);
  return <PosWorkspace currency={context.company.currencyCode} userId={context.user.id} permissions={context.permissions} invoiceId={id}/>;
}
