import { redirect } from "next/navigation";

export default function SuppliersRedirectPage() {
  redirect("/parties?tab=suppliers");
}

