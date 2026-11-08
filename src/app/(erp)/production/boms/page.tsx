import { BomWorkspace } from "@/components/production/bom-workspace";
import { requirePagePermission } from "@/lib/auth";

export const metadata = { title: "Bills of Materials (BOM)" };

export default async function BomsPage() {
  const context = await requirePagePermission("production.view");

  return (
    <div className="mx-auto max-w-[1520px]">
      <BomWorkspace permissions={context.permissions} />
    </div>
  );
}

