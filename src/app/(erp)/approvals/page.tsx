import { ApprovalsWorkspace } from "@/components/governance/approvals-workspace";
import { requireAuth } from "@/lib/auth";

export default async function ApprovalsPage() {
  const context = await requireAuth();

  return (
    <ApprovalsWorkspace
      currencyCode={context.company.currencyCode}
      userPermissions={context.permissions}
      currentUserId={context.user.id}
    />
  );
}

