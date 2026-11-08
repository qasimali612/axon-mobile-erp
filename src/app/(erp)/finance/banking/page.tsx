import { BankingWorkspace } from "@/components/finance/banking-workspace";
import { requirePagePermission } from "@/lib/auth";

export default async function BankingPage() {
  const context = await requirePagePermission("BANK_LEDGER_VIEW");
  return <BankingWorkspace
    currency={context.company.currencyCode}
    permissions={{
      manageAccount: context.permissions.includes("BANK_ACCOUNT_MANAGE"),
      prepare: context.permissions.includes("BANK_RECONCILIATION_PREPARE"),
      approve: context.permissions.includes("BANK_RECONCILIATION_APPROVE"),
    }}
  />;
}
