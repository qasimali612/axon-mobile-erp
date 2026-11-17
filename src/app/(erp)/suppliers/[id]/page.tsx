import { notFound } from "next/navigation";
import { SupplierProfileView } from "@/components/parties/supplier-profile-view";
import { requirePagePermission } from "@/lib/auth";
import { getPartyStatement } from "@/lib/finance/subledger";
import { prisma } from "@/lib/prisma";
import { idSchema } from "@/lib/validation";

type PageProps = { params: Promise<{ id: string }> };

export default async function SupplierDetailPage({ params }: PageProps) {
  const context = await requirePagePermission("supplier.manage");
  const id = idSchema.parse((await params).id);

  const supplier = await prisma.supplier.findFirst({
    where: { id, companyId: context.company.id },
    include: {
      branch: { select: { code: true, name: true } },
    },
  });

  if (!supplier) notFound();

  const currency = context.company.currencyCode;
  const now = new Date();
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  // Parallel fetch: bills, payments, and statement
  const [bills, payments, statement] = await Promise.all([
    prisma.purchaseReceipt.findMany({
      where: { supplierId: id, companyId: context.company.id },
      include: {
        allocations: {
          include: { payment: { select: { status: true, direction: true } } },
        },
      },
      orderBy: { receiptDate: "desc" },
    }),
    prisma.payment.findMany({
      where: {
        supplierId: id,
        companyId: context.company.id,
        direction: "SUPPLIER_PAYMENT",
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
      kind: "supplier",
      partyId: id,
      from: defaultFrom,
      to: today,
      branchIds: null,
    }),
  ]);

  // Transform Bills
  const mappedBills = bills.map((b) => {
    const paid = b.allocations.reduce((sum, a) => {
      if (a.payment.status !== "POSTED") return sum;
      return a.payment.direction === "SUPPLIER_PAYMENT"
        ? sum + Number(a.amount)
        : sum - Number(a.amount);
    }, 0);
    const grand = Number(b.grandTotal);
    const balance = Math.max(0, grand - paid);
    const settlementStatus: "PAID" | "PARTIAL" | "UNPAID" =
      balance <= 0.0001 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID";

    return {
      id: b.id,
      receiptNumber: b.receiptNumber,
      receiptDate: b.receiptDate.toISOString(),
      dueDate: b.dueDate ? b.dueDate.toISOString() : null,
      status: b.status,
      grandTotal: grand,
      paidAmount: paid,
      openBalance: balance,
      settlementStatus,
    };
  });

  // Transform Payments
  const mappedPayments = payments.map((p) => {
    const amount = Number(p.amount);
    const allocated = p.allocations.reduce((sum: number, a: { amount: unknown }) => sum + Number(a.amount), 0);
    const unallocated = Math.max(0, amount - allocated);
    const methodName =
      p.paymentMethod?.name ||
      (p.bankAccount ? `${p.bankAccount.bankName} (${p.bankAccount.accountNumberLast4 || "****"})` : null) ||
      (p.cashAccount ? p.cashAccount.name : "Direct Cash");

    return {
      id: p.id,
      paymentNumber: p.paymentNumber,
      paymentDate: p.paymentDate.toISOString(),
      amount,
      allocatedAmount: allocated,
      unallocatedAmount: unallocated,
      status: p.status,
      methodName,
      reference: p.reference,
      notes: p.notes,
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
    <SupplierProfileView
      data={{
        supplier: {
          id: supplier.id,
          code: supplier.code,
          name: supplier.name,
          contactPerson: supplier.contactPerson,
          status: supplier.status,
          phone: supplier.phone,
          email: supplier.email,
          address: supplier.address,
          taxNumber: supplier.taxNumber,
          creditLimit: String(supplier.creditLimit),
          paymentTermsDays: supplier.paymentTermsDays,
          openingBalance: String(supplier.openingBalance),
          branch: supplier.branch,
        },
        currency,
        bills: mappedBills,
        payments: mappedPayments,
        statement: mappedStatement,
      }}
    />
  );
}
