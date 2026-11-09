import { redirect } from "next/navigation";

export default function BranchesRedirectPage() {
  redirect("/organization?tab=branches");
}

