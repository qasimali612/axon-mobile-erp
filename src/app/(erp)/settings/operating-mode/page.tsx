import { PolicyWorkspace } from "@/components/settings/policy-workspace";
import { requirePagePermission } from "@/lib/auth";

export const metadata = { title: "System Operating Mode" };

export default async function OperatingModePage() {
  const context = await requirePagePermission("policy.manage");
  return (
    <div className="mx-auto max-w-[1380px]">
      <PolicyWorkspace canManage={context.permissions.includes("policy.manage")} />
    </div>
  );
}

