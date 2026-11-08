import { Suspense } from "react";
import { ImeiRegistry } from "@/components/inventory/imei-registry";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "IMEI registry" };

export default async function ImeiRegistryPage() {
  const context = await requirePagePermission("inventory.device.view");
  const company = await prisma.company.findUnique({
    where: { id: context.company.id },
    select: {
      name: true,
      legalName: true,
      code: true,
      taxRegistrationNumber: true,
      phone: true,
      addressLine1: true,
      city: true,
      province: true,
    },
  });

  return (
    <Suspense fallback={<div className="surface h-96 animate-pulse bg-slate-50" />}>
      <ImeiRegistry
        currency={context.company.currencyCode}
        company={company || undefined}
      />
    </Suspense>
  );
}
