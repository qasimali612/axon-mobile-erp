import { IncentiveWorkspace } from "@/components/finance/incentive-workspace";
import { requirePagePermission } from "@/lib/auth";

export default async function IncentivesPage() {
  const context = await requirePagePermission("INCENTIVE_VIEW");
  return <IncentiveWorkspace
    currency={context.company.currencyCode}
    currentUserId={context.user.id}
    permissions={{
      planManage: context.permissions.includes("INCENTIVE_PLAN_MANAGE"),
      calculate: context.permissions.includes("INCENTIVE_CALCULATE"),
      approve: context.permissions.includes("INCENTIVE_APPROVE"),
      pay: context.permissions.includes("INCENTIVE_PAY"),
      receivableCreate: context.permissions.includes("INCENTIVE_RECEIVABLE_CREATE"),
      receivableApprove: context.permissions.includes("INCENTIVE_RECEIVABLE_APPROVE"),
      receive: context.permissions.includes("INCENTIVE_RECEIVE"),
      export: context.permissions.includes("FINANCIAL_REPORTS_EXPORT"),
    }}
  />;
}
