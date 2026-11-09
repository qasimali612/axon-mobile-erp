import { redirect } from "next/navigation";

export default function NewAdjustmentPage() {
  redirect("/inventory/adjustments?new=1");
}

