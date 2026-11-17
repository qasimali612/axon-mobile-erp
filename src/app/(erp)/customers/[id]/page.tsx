import { notFound } from "next/navigation";
import { CustomerProfileView } from "@/components/parties/customer-profile-view";
import { requirePagePermission } from "@/lib/auth";
import { getPartyStatement } from "@/lib/finance/subledger";
import { prisma } from "@/lib/prisma";
import { idSchema } from "@/lib/validation";

type PageProps = { params: Promise<{ id: string }> };

export default async function CustomerDetailPage({ params }: PageProps) {
  const context = await requirePagePermission("customer.manage");
  const id = idSchema.parse((await params).id);

  const customer = await prisma.customer.findFirst({
    where: { id, companyId: context.company.id },
    include: {
      branch: { select: { code: true, name: true } },
      priceList: { select: { code: true, name: true } },
    },
  });

  if (!customer) notFound();

  const currency = context.company.currencyCode;
  const now = new Date();
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  // Parallel fetch: invoices, receipts, and statement
  const [invoices, receipts, statement] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { customerId: id, companyId: context.company.id },
      include: {
        allocations: {
          include: { payment: { select: { status: true, direction: true } } },
        },
      },
      orderBy: { invoiceDate: "desc" },
    }),
    prisma.payment.findMany({
      where: {
        customerId: id,
        companyId: context.company.id,
        direction: "CUSTOMER_RECEIPT",
      },
      include: {
        allocations: true,
        paymentMethod: { select: { name: true } },
        bankAccount: { select: { bankName: true, accountNumberLast4: true } },
        cashAccount: { select: { name: true } },
      },
      orderBy: { paymentDate: "desc" },
    }),
    getPartyStatement({
      companyId: context.company.id,
      kind: "customer",
      partyId: id,
      from: defaultFrom,
      to: today,
      branchIds: null,
    }),
  ]);

  // Transform Invoices
  const mappedInvoices = invoices.map((inv) => {
    const paid = inv.allocations.reduce((sum, a) => {
      if (a.payment.status !== "POSTED") return sum;
      return a.payment.direction === "CUSTOMER_RECEIPT"
        ? sum + Number(a.amount)
        : sum - Number(a.amount);
    }, 0);
    const grand = Number(inv.grandTotal);
    const balance = Math.max(0, grand - paid);
    const settlementStatus: "PAID" | "PARTIAL" | "UNPAID" =
      balance <= 0.0001 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID";

    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate.toISOString(),
      dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
      status: inv.status,
      grandTotal: grand,
      paidAmount: paid,
      openBalance: balance,
      settlementStatus,
    };
  });

  // Transform Receipts
  const mappedReceipts = receipts.map((r) => {
    const amount = Number(r.amount);
    const allocated = r.allocations.reduce((sum: number, a: { amount: unknown }) => sum + Number(a.amount), 0);
    const unallocated = Math.max(0, amount - allocated);
    const methodName =
      r.paymentMethod?.name ||
      (r.bankAccount ? `${r.bankAccount.bankName} (${r.bankAccount.accountNumberLast4 || "****"})` : null) ||
      (r.cashAccount ? r.cashAccount.name : "Direct Cash");

    return {
      id: r.id,
      paymentNumber: r.paymentNumber,
      paymentDate: r.paymentDate.toISOString(),
      amount,
      allocatedAmount: allocated,
      unallocatedAmount: unallocated,
      status: r.status,
      methodName,
      reference: r.reference,
      notes: r.notes,
    };
  });

  // Transform Statement
  const mappedStatement = {
    from: statement.from.toISOString().slice(0, 10),
    to: statement.to.toISOString().slice(0, 10),
    openingBalance: Number(statement.openingBalance),
    periodDebit: Number(statement.periodDebit),
    periodCredit: Number(statement.periodCredit),
    closingBalance: Number(statement.closingBalance),
    transactions: statement.transactions.map((tx) => ({
      id: tx.id,
      postingDate: tx.postingDate.toISOString(),
      voucherNumber: tx.voucherNumber,
      description: tx.description,
      reference: tx.reference,
      branchCode: tx.branch.code,
      debit: Number(tx.debit),
      credit: Number(tx.credit),
      runningBalance: Number(tx.runningBalance),
      journalEntryId: tx.journalEntryId,
    })),
    openItems: statement.openItems.map((item) => ({
      id: item.id,
      number: item.number,
      documentDate: item.documentDate.toISOString(),
      dueDate: item.dueDate.toISOString(),
      originalAmount: Number(item.originalAmount),
      allocatedAmount: Number(item.allocatedAmount),
      openAmount: Number(item.openAmount),
      daysPastDue: item.daysPastDue,
      href: item.href,
    })),
    aging: {
      current: Number(statement.aging.current),
      days1To30: Number(statement.aging.days1To30),
      days31To60: Number(statement.aging.days31To60),
      days61To90: Number(statement.aging.days61To90),
      daysOver90: Number(statement.aging.daysOver90),
      residual: Number(statement.aging.residual),
      balance: Number(statement.aging.balance),
    },
  };

  return (
    <CustomerProfileView
      data={{
        customer: {
          id: customer.id,
          code: customer.code,
          name: customer.name,
          customerType: customer.customerType,
          status: customer.status,
          phone: customer.phone,
          email: customer.email,
          address: customer.address,
          taxNumber: customer.taxNumber,
          creditLimit: String(customer.creditLimit),
          paymentTermsDays: customer.paymentTermsDays,
          openingBalance: String(customer.openingBalance),
          branch: customer.branch,
          priceList: customer.priceList,
        },
        currency,
        invoices: mappedInvoices,
        receipts: mappedReceipts,
        statement: mappedStatement,
      }}
    />
  );
}
