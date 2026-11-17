import { redirect } from "next/navigation";

export default async function ExpensePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/finance/journals/${id}/print`);
}

