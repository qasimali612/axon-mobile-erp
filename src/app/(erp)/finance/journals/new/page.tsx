import { redirect } from "next/navigation";

export default function NewJournalPage() {
  redirect("/finance/journals?new=1");
}

