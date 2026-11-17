import { redirect } from "next/navigation";

export default async function BankbookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) {
      if (Array.isArray(v)) {
        v.forEach((val) => sp.append(k, val));
      } else {
        sp.set(k, v);
      }
    }
  }
  const query = sp.toString();
  redirect(`/finance/banking${query ? `?${query}` : ""}`);
}
