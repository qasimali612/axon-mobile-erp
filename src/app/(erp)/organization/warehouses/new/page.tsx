import { redirect } from "next/navigation";

export default function NewWarehousePage() {
  redirect("/organization?tab=warehouses&new=1");
}

