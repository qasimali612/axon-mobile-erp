import { ReturnWorkspace } from "@/components/returns/return-workspace";
import { requirePagePermission } from "@/lib/auth";

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const context = await requirePagePermission("dashboard.view");
  const requested = (await searchParams).type;
  const initialType = requested === "PURCHASE_RETURN" ? "PURCHASE_RETURN" : "SALES_RETURN";
  return <ReturnWorkspace currency={context.company.currencyCode} userId={context.user.id} permissions={context.permissions} initialType={initialType}/>;
}
