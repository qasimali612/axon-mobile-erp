import { WarehouseLocationWorkspace } from "@/components/organization/warehouse-location-workspace";
import { requirePagePermission } from "@/lib/auth";

export default async function WarehouseLocationsPage() {
  const context = await requirePagePermission("organization.warehouse.view");
  return <WarehouseLocationWorkspace
    activeWarehouseId={context.activeWarehouseId}
    permissions={{
      edit: context.permissions.includes("organization.warehouse.edit"),
      archive: context.permissions.includes("organization.warehouse.archive"),
    }}
  />;
}
