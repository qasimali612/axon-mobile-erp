import { RebateWorkspace } from "@/components/finance/rebate-workspace";
import { requirePagePermission } from "@/lib/auth";

export default async function RebatesPage() {
  const context = await requirePagePermission("REBATE_VIEW");
  return <RebateWorkspace
    currency={context.company.currencyCode}
    currentUserId={context.user.id}
    permissions={{
      manage: context.permissions.includes("REBATE_MANAGE"),
      approve: context.permissions.includes("REBATE_APPROVE"),
      pay: context.permissions.includes("REBATE_PAY"),
      receive: context.permissions.includes("REBATE_RECEIVE"),
      export: context.permissions.includes("FINANCIAL_REPORTS_EXPORT"),
    }}
  />;
}
