import { BankingWorkspace } from "@/components/finance/banking-workspace";
import { requirePagePermission } from "@/lib/auth";

export default async function BankingPage() {
  const context = await requirePagePermission("BANK_LEDGER_VIEW");
  const canReconcile = context.permissions.includes("BANK_RECONCILIATION_PREPARE") || context.permissions.includes("BANK_RECONCILIATION_APPROVE");
  return <BankingWorkspace
    currency={context.company.currencyCode}
    permissions={{
      manageAccount: context.permissions.includes("BANK_ACCOUNT_MANAGE"),
      prepare: canReconcile,
      approve: canReconcile,
    }}
  />;
}
