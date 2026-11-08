import { PaymentMethodWorkspace } from "@/components/catalog/payment-method-workspace";
import { requirePagePermission } from "@/lib/auth";

export const metadata = { title: "Payment methods" };

export default async function PaymentMethodsPage() {
  const context = await requirePagePermission("finance.paymentmethod.view");
  return (
    <div className="mx-auto max-w-[1520px]">
      <PaymentMethodWorkspace
        permissions={{
          create: context.permissions.includes("finance.paymentmethod.manage"),
          edit: context.permissions.includes("finance.paymentmethod.manage"),
        }}
      />
    </div>
  );
}
