import { PolicyWorkspace } from "@/components/settings/policy-workspace";
import { requirePagePermission } from "@/lib/auth";

export const metadata = { title: "Commercial controls" };

export default async function PolicySettingsPage() {
  const context = await requirePagePermission("policy.manage");
  return (
    <div className="mx-auto max-w-[1380px]">
      <PolicyWorkspace canManage={context.permissions.includes("policy.manage")} />
    </div>
  );
}
