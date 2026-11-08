import { redirect } from "next/navigation";
import { PartyManager } from "@/components/parties/party-manager";
import { requireAuth } from "@/lib/auth";

export default async function PartiesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const context = await requireAuth();
  if (!context.permissions.includes("customer.manage") && !context.permissions.includes("supplier.manage")) redirect("/unauthorized");
  const requested = (await searchParams).tab;
  const initialTab = requested === "suppliers" ? "suppliers" : requested === "customers" ? "customers" : undefined;
  return <PartyManager currency={context.company.currencyCode} permissions={context.permissions} initialTab={initialTab}/>;
}
