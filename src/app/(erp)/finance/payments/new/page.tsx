import { redirect } from "next/navigation";

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams(params as Record<string, string>);
  query.set("new", "1");
  redirect(`/finance/payments?${query.toString()}`);
}

