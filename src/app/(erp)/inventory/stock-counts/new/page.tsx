import { redirect } from "next/navigation";

export default function NewStockCountPage() {
  redirect("/inventory/stock-counts?new=1");
}
