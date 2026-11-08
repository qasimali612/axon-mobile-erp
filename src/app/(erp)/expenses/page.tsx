import { redirect } from "next/navigation";

export default function RootExpensesPage() {
  redirect("/finance/expenses");
}

