import { redirect } from "next/navigation";

export default function NewBranchPage() {
  redirect("/organization?tab=branches&new=1");
}
