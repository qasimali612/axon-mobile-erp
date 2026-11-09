import { redirect } from "next/navigation";

export default function NewCustomerPage() {
  redirect("/parties?tab=customers&new=1");
}

