import { redirect } from "next/navigation";

export default function WarehousesRedirectPage() {
  redirect("/organization?tab=warehouses");
}
