import { redirect } from "next/navigation";

export default function NewTransferPage() {
  redirect("/inventory/transfers?new=1");
}
