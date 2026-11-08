import { PartySubledgerWorkspace } from "@/components/finance/party-subledger-workspace";
import { requireAnyPagePermission } from "@/lib/auth";

export default async function PartySubledgersPage() {
  const context = await requireAnyPagePermission(["CUSTOMER_LEDGER_VIEW", "SUPPLIER_LEDGER_VIEW"]);
  return <PartySubledgerWorkspace
    currency={context.company.currencyCode}
    permissions={{
      customer: context.permissions.includes("CUSTOMER_LEDGER_VIEW"),
      supplier: context.permissions.includes("SUPPLIER_LEDGER_VIEW"),
    }}
  />;
}
