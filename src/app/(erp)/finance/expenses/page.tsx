import { ExpenseWorkspace } from "@/components/finance/expense-workspace";
import { requirePagePermission } from "@/lib/auth";

export default async function ExpensesPage() {
  const context = await requirePagePermission("expense.manage");

  return (
    <ExpenseWorkspace
      currencyCode={context.company.currencyCode}
      userPermissions={context.permissions}
      userId={context.user.id}
    />
  );
}
