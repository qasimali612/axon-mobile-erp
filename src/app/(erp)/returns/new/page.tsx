import { redirect } from "next/navigation";

export default async function NewReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  redirect(type ? `/returns?type=${type}&new=1` : "/returns?new=1");
}

