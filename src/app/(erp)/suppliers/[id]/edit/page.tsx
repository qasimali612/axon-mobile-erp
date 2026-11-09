import { redirect } from "next/navigation";
import { idSchema } from "@/lib/validation";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditSupplierPage({ params }: PageProps) {
  const id = idSchema.parse((await params).id);
  redirect(`/suppliers?edit=${id}`);
}

