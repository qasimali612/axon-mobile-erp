import { PrismaClient } from "@prisma/client";

const cloudUrl = "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30";
const prisma = new PrismaClient({ datasources: { db: { url: cloudUrl } } });

async function main() {
  console.log("================================================================================");
  console.log("AXON MOBILE ERP — PRIORITY 06: CUSTOMER & SUPPLIER PRE-IMPLEMENTATION AUDIT");
  console.log("================================================================================\n");

  const company = await prisma.company.findFirst({ where: { code: 'AXON' } });

  // 1. Audit Customers
  const customers = await prisma.customer.findMany({
    where: { companyId: company.id },
    include: {
      salesInvoices: {
        where: { status: 'POSTED' },
        select: { id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, grandTotal: true }
      },
      payments: {
        where: { direction: 'CUSTOMER_RECEIPT', status: 'POSTED' },
        include: { allocations: true }
      }
    }
  });

  console.log(`--- 1. CUSTOMERS AUDIT (${customers.length} registered) ---`);
  for (const c of customers) {
    const totalSales = c.salesInvoices.reduce((s, inv) => s + Number(inv.grandTotal), 0);
    const totalReceipts = c.payments.reduce((s, p) => s + Number(p.amount), 0);
    const totalAllocated = c.payments.flatMap(p => p.allocations).reduce((s, a) => s + Number(a.amount), 0);
    const unallocatedAdvance = totalReceipts - totalAllocated;

    // GL Receivable lines for this customer
    const arLines = await prisma.journalEntryLine.findMany({
      where: {
        customerId: c.id,
        account: { accountType: 'ACCOUNTS_RECEIVABLE' },
        entry: { companyId: company.id, status: { in: ['POSTED', 'REVERSED'] } }
      }
    });
    const glDebit = arLines.reduce((s, l) => s + Number(l.baseDebit), 0);
    const glCredit = arLines.reduce((s, l) => s + Number(l.baseCredit), 0);
    const glBalance = glDebit - glCredit;

    console.log(`\nCustomer: ${c.code} · ${c.name} (Type: ${c.customerType})`);
    console.log(`  Profile Credit Limit:   Rs. ${Number(c.creditLimit).toLocaleString()}`);
    console.log(`  Profile Opening Bal:    Rs. ${Number(c.openingBalance).toLocaleString()}`);
    console.log(`  Posted Sales Invoices:  ${c.salesInvoices.length} invoices (Rs. ${totalSales.toLocaleString()})`);
    console.log(`  Posted Receipts:        ${c.payments.length} receipts (Rs. ${totalReceipts.toLocaleString()})`);
    console.log(`  Allocated to Invoices:  Rs. ${totalAllocated.toLocaleString()}`);
    console.log(`  Unallocated Advance:    Rs. ${unallocatedAdvance.toLocaleString()}`);
    console.log(`  Net AR Subledger / GL:  Rs. ${glBalance.toLocaleString()} (Debit: ${glDebit.toLocaleString()}, Credit: ${glCredit.toLocaleString()})`);

    // Invoices open-item detail
    for (const inv of c.salesInvoices) {
      const allocations = await prisma.paymentAllocation.findMany({
        where: {
          salesInvoiceId: inv.id,
          payment: { status: 'POSTED' }
        }
      });
      const allocated = allocations.reduce((s, a) => s + Number(a.amount), 0);
      const outstanding = Number(inv.grandTotal) - allocated;
      console.log(`    - Inv ${inv.invoiceNumber} (${inv.invoiceDate.toISOString().slice(0, 10)}): Total Rs. ${Number(inv.grandTotal).toLocaleString()} | Paid: Rs. ${allocated.toLocaleString()} | Open: Rs. ${outstanding.toLocaleString()}`);
    }
  }

  // 2. Audit Suppliers
  const suppliers = await prisma.supplier.findMany({
    where: { companyId: company.id },
    include: {
      purchaseReceipts: {
        where: { status: 'POSTED' },
        select: { id: true, receiptNumber: true, receiptDate: true, dueDate: true, grandTotal: true }
      },
      payments: {
        where: { direction: 'SUPPLIER_PAYMENT', status: 'POSTED' },
        include: { allocations: true }
      }
    }
  });

  console.log(`\n\n--- 2. SUPPLIERS AUDIT (${suppliers.length} registered) ---`);
  for (const s of suppliers) {
    const totalPurchases = s.purchaseReceipts.reduce((sum, r) => sum + Number(r.grandTotal), 0);
    const totalPayments = s.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalAllocated = s.payments.flatMap(p => p.allocations).reduce((sum, a) => sum + Number(a.amount), 0);
    const unallocatedAdvance = totalPayments - totalAllocated;

    // GL Payable lines for this supplier
    const apLines = await prisma.journalEntryLine.findMany({
      where: {
        supplierId: s.id,
        account: { accountType: 'ACCOUNTS_PAYABLE' },
        entry: { companyId: company.id, status: { in: ['POSTED', 'REVERSED'] } }
      }
    });
    const glDebit = apLines.reduce((sum, l) => sum + Number(l.baseDebit), 0);
    const glCredit = apLines.reduce((sum, l) => sum + Number(l.baseCredit), 0);
    const glBalance = glCredit - glDebit; // Credit normal for AP

    console.log(`\nSupplier: ${s.code} · ${s.name}`);
    console.log(`  Profile Opening Bal:    Rs. ${Number(s.openingBalance).toLocaleString()}`);
    console.log(`  Posted Purchase Bills:  ${s.purchaseReceipts.length} bills (Rs. ${totalPurchases.toLocaleString()})`);
    console.log(`  Posted Payments:        ${s.payments.length} payments (Rs. ${totalPayments.toLocaleString()})`);
    console.log(`  Allocated to Bills:     Rs. ${totalAllocated.toLocaleString()}`);
    console.log(`  Unallocated Advance:    Rs. ${unallocatedAdvance.toLocaleString()}`);
    console.log(`  Net AP Subledger / GL:  Rs. ${glBalance.toLocaleString()} (Credit: ${glCredit.toLocaleString()}, Debit: ${glDebit.toLocaleString()})`);

    // Bills open-item detail
    for (const r of s.purchaseReceipts) {
      const allocations = await prisma.paymentAllocation.findMany({
        where: {
          purchaseReceiptId: r.id,
          payment: { status: 'POSTED' }
        }
      });
      const allocated = allocations.reduce((sum, a) => sum + Number(a.amount), 0);
      const outstanding = Number(r.grandTotal) - allocated;
      console.log(`    - Bill ${r.receiptNumber} (${r.receiptDate.toISOString().slice(0, 10)}): Total Rs. ${Number(r.grandTotal).toLocaleString()} | Paid: Rs. ${allocated.toLocaleString()} | Open: Rs. ${outstanding.toLocaleString()}`);
    }
  }

  // 3. GL Control Accounts Reconciliation
  console.log(`\n\n--- 3. GENERAL LEDGER CONTROL ACCOUNTS RECONCILIATION ---`);
  const arAccount = await prisma.account.findFirst({
    where: { companyId: company.id, accountType: 'ACCOUNTS_RECEIVABLE' }
  });
  const apAccount = await prisma.account.findFirst({
    where: { companyId: company.id, accountType: 'ACCOUNTS_PAYABLE' }
  });

  const allArLines = await prisma.journalEntryLine.findMany({
    where: { accountId: arAccount?.id, entry: { companyId: company.id, status: { in: ['POSTED', 'REVERSED'] } } }
  });
  const totalArDebit = allArLines.reduce((s, l) => s + Number(l.baseDebit), 0);
  const totalArCredit = allArLines.reduce((s, l) => s + Number(l.baseCredit), 0);
  const totalArBalance = totalArDebit - totalArCredit;

  const allApLines = await prisma.journalEntryLine.findMany({
    where: { accountId: apAccount?.id, entry: { companyId: company.id, status: { in: ['POSTED', 'REVERSED'] } } }
  });
  const totalApDebit = allApLines.reduce((s, l) => s + Number(l.baseDebit), 0);
  const totalApCredit = allApLines.reduce((s, l) => s + Number(l.baseCredit), 0);
  const totalApBalance = totalApCredit - totalApDebit;

  console.log(`Control Account ${arAccount?.code} (${arAccount?.name}):`);
  console.log(`  Debit: Rs. ${totalArDebit.toLocaleString()} | Credit: Rs. ${totalArCredit.toLocaleString()} | Net Balance: Rs. ${totalArBalance.toLocaleString()}`);

  console.log(`Control Account ${apAccount?.code} (${apAccount?.name}):`);
  console.log(`  Debit: Rs. ${totalApDebit.toLocaleString()} | Credit: Rs. ${totalApCredit.toLocaleString()} | Net Balance: Rs. ${totalApBalance.toLocaleString()}`);
}

main().finally(() => prisma.$disconnect());
