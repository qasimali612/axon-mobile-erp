import { redirect } from "next/navigation";
import { idSchema } from "@/lib/validation";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditCustomerPage({ params }: PageProps) {
  const id = idSchema.parse((await params).id);
  redirect(`/customers?edit=${id}`);
}

