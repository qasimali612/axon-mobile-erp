import { PaymentRegister } from "@/components/finance/payment-register";
import { requirePagePermission } from "@/lib/auth";
import { idSchema } from "@/lib/validation";

type PageProps = { searchParams: Promise<{ invoiceId?: string; receiptId?: string; amount?: string }> };

export default async function PaymentsPage({ searchParams }: PageProps) {
  const context = await requirePagePermission("PAYMENT_VIEW");
  const params = await searchParams;
  const invoiceId = idSchema.safeParse(params.invoiceId).success ? params.invoiceId : undefined;
  const receiptId = idSchema.safeParse(params.receiptId).success ? params.receiptId : undefined;
  const amount = params.amount && /^\d+(?:\.\d{1,4})?$/.test(params.amount) ? params.amount : undefined;
  return <PaymentRegister
    currency={context.company.currencyCode}
    userId={context.user.id}
    permissions={context.permissions}
    initialInvoiceId={invoiceId}
    initialReceiptId={receiptId}
    initialAmount={amount}
  />;
}
