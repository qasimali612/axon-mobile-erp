import { BudgetWorkspace } from "@/components/finance/budget-workspace";
import { requirePagePermission } from "@/lib/auth";

export default async function BudgetsPage() {
  const context = await requirePagePermission("BUDGET_VIEW");
  return <BudgetWorkspace
    currency={context.company.currencyCode}
    currentUserId={context.user.id}
    permissions={{
      create: context.permissions.includes("BUDGET_CREATE"),
      approve: context.permissions.includes("BUDGET_APPROVE"),
      export: context.permissions.includes("FINANCIAL_REPORTS_EXPORT"),
    }}
  />;
}
