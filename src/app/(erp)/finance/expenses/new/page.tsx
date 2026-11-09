import { redirect } from "next/navigation";

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams(params as Record<string, string>);
  query.set("new", "1");
  redirect(`/finance/expenses?${query.toString()}`);
}
