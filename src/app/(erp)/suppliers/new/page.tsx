import { redirect } from "next/navigation";

export default function NewSupplierPage() {
  redirect("/parties?tab=suppliers&new=1");
}

