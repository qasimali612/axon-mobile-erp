import { PrismaClient } from "@prisma/client";

const cloudUrl =
  "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30";
const prisma = new PrismaClient({ datasources: { db: { url: cloudUrl } } });

async function main() {
  console.log("================================================================================");
  console.log("AXON MOBILE ERP — PRIORITY 06 ACCEPTANCE TEST SUITE");
  console.log("Customer & Supplier Management, Subledgers, Settlements, and GL Control Audit");
  console.log("================================================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, testName, details = "") {
    totalTests++;
    if (condition) {
      console.log(`[PASS] Test ${totalTests}: ${testName}`);
      passedTests++;
    } else {
      console.error(`[FAIL] Test ${totalTests}: ${testName}`);
      if (details) console.error(`       Details: ${details}`);
      process.exitCode = 1;
    }
  }

  const company = await prisma.company.findFirst({ where: { code: "AXON" } });
  assert(Boolean(company), "Company AXON exists", `Company ID: ${company?.id}`);

  // Test 1: Customer Registry Verification
  const customers = await prisma.customer.findMany({
    where: { companyId: company.id },
    orderBy: { code: "asc" },
  });
  assert(customers.length >= 3, "Customer registry contains at least 3 active customers", `Found ${customers.length}`);

  const alif = customers.find((c) => c.code === "CUST-1018");
  assert(Boolean(alif && alif.name.includes("Alif Finance")), "Customer CUST-1018 Alif Finance exists");
  assert(Number(alif?.creditLimit) === 1_000_000, "CUST-1018 credit limit is Rs. 1,000,000");

  const walkIn = customers.find((c) => c.code === "WALK-IN");
  assert(Boolean(walkIn), "Customer WALK-IN counter customer exists");

  // Test 2: Customer Sales & Settlement Verification
  const salesInvoices = await prisma.salesInvoice.findMany({
    where: { companyId: company.id, status: "POSTED" },
    include: {
      allocations: {
        include: { payment: { select: { status: true, direction: true } } },
      },
    },
  });
  assert(salesInvoices.length >= 11, "At least 11 posted sales invoices exist", `Found ${salesInvoices.length}`);

  let totalSalesInvoiced = 0;
  let totalSalesSettled = 0;
  let openCustomerInvoices = 0;

  for (const inv of salesInvoices) {
    const total = Number(inv.grandTotal);
    totalSalesInvoiced += total;
    const paid = inv.allocations.reduce((sum, a) => {
      if (a.payment.status !== "POSTED") return sum;
      return a.payment.direction === "CUSTOMER_RECEIPT"
        ? sum + Number(a.amount)
        : sum - Number(a.amount);
    }, 0);
    totalSalesSettled += paid;
    if (Math.round((total - paid) * 100) / 100 > 0) {
      openCustomerInvoices++;
    }
  }

  assert(
    Math.round(totalSalesInvoiced) === 456_494,
    "Total sales invoiced equals Rs. 456,494.00",
    `Calculated Rs. ${totalSalesInvoiced}`
  );
  assert(
    Math.round(totalSalesSettled) === 456_494,
    "Total sales settled equals Rs. 456,494.00",
    `Settled Rs. ${totalSalesSettled}`
  );
  assert(
    openCustomerInvoices === 0,
    "All posted sales invoices are 100% settled (0 open invoices)",
    `Open: ${openCustomerInvoices}`
  );

  // Test 3: Customer GL Control Account 1100 Reconciliation
  const arAccount = await prisma.account.findFirst({
    where: { companyId: company.id, accountType: "ACCOUNTS_RECEIVABLE" },
  });
  assert(Boolean(arAccount), "GL Account 1100 (Trade Receivables) exists");

  const arLines = await prisma.journalEntryLine.findMany({
    where: {
      accountId: arAccount.id,
      entry: { companyId: company.id, status: { in: ["POSTED", "REVERSED"] } },
    },
  });

  const totalArDebit = arLines.reduce((s, l) => s + Number(l.baseDebit), 0);
  const totalArCredit = arLines.reduce((s, l) => s + Number(l.baseCredit), 0);
  const netArBalance = Math.round((totalArDebit - totalArCredit) * 100) / 100;

  assert(
    Math.round(totalArDebit) === 598_892,
    "GL Account 1100 total debits equal Rs. 598,892.00",
    `Debit: Rs. ${totalArDebit}`
  );
  assert(
    Math.round(totalArCredit) === 598_892,
    "GL Account 1100 total credits equal Rs. 598,892.00",
    `Credit: Rs. ${totalArCredit}`
  );
  assert(
    netArBalance === 0,
    "GL Account 1100 net balance is exactly Rs. 0.00 (100% Reconciled)",
    `Net: Rs. ${netArBalance}`
  );

  // Test 4: Supplier Registry Verification
  const suppliers = await prisma.supplier.findMany({
    where: { companyId: company.id },
    orderBy: { code: "asc" },
  });
  assert(suppliers.length >= 2, "Supplier registry contains at least 2 active suppliers", `Found ${suppliers.length}`);

  const star = suppliers.find((s) => s.code === "SUP-3414");
  assert(Boolean(star && star.name.includes("3 Star Mobile")), "Supplier SUP-3414 3 Star Mobile exists");
  assert(
    Number(star?.openingBalance) === 140_475,
    "SUP-3414 opening balance is Rs. 140,475.00",
    `Opening balance: Rs. ${star?.openingBalance}`
  );

  const supplier5G = suppliers.find((s) => s.code === "SUP-8910");
  assert(Boolean(supplier5G && supplier5G.name.includes("5G Mobile City")), "Supplier SUP-8910 5G Mobile City exists");

  // Test 5: Supplier Purchases & Settlements Verification
  const purchaseReceipts = await prisma.purchaseReceipt.findMany({
    where: { companyId: company.id, status: "POSTED" },
    include: {
      allocations: {
        include: { payment: { select: { status: true, direction: true } } },
      },
    },
  });
  assert(purchaseReceipts.length >= 1, "At least 1 posted purchase receipt exists", `Found ${purchaseReceipts.length}`);

  const grn1 = purchaseReceipts.find((r) => r.receiptNumber.includes("000001"));
  assert(Boolean(grn1), "Purchase receipt ISB-GRN-FY2026-27-000001 exists");
  assert(
    Number(grn1?.grandTotal) === 278_900,
    "GRN grand total is Rs. 278,900.00",
    `Total: Rs. ${grn1?.grandTotal}`
  );

  const grn1Paid = grn1?.allocations.reduce((s, a) => s + Number(a.amount), 0) || 0;
  assert(
    grn1Paid === 278_900,
    "GRN is 100% settled with payment allocation of Rs. 278,900.00",
    `Paid: Rs. ${grn1Paid}`
  );

  // Test 6: Supplier GL Control Account 2000 Reconciliation
  const apAccount = await prisma.account.findFirst({
    where: { companyId: company.id, accountType: "ACCOUNTS_PAYABLE" },
  });
  assert(Boolean(apAccount), "GL Account 2000 (Trade Payables) exists");

  const apLines = await prisma.journalEntryLine.findMany({
    where: {
      accountId: apAccount.id,
      entry: { companyId: company.id, status: { in: ["POSTED", "REVERSED"] } },
    },
  });

  const totalApDebit = apLines.reduce((s, l) => s + Number(l.baseDebit), 0);
  const totalApCredit = apLines.reduce((s, l) => s + Number(l.baseCredit), 0);
  const netApBalance = Math.round((totalApCredit - totalApDebit) * 100) / 100;

  assert(
    Math.round(totalApDebit) === 328_900,
    "GL Account 2000 total debits equal Rs. 328,900.00",
    `Debit: Rs. ${totalApDebit}`
  );
  assert(
    Math.round(totalApCredit) === 419_375,
    "GL Account 2000 total credits equal Rs. 419,375.00",
    `Credit: Rs. ${totalApCredit}`
  );
  assert(
    netApBalance === 90_475,
    "GL Account 2000 net payable balance is exactly Rs. 90,475.00 (100% Reconciled)",
    `Net: Rs. ${netApBalance}`
  );

  // Test 7: Supplier Subledger Individual Trace
  // SUP-3414: OB 140,475 Credit, Payment 50,000 Debit = 90,475 Credit
  const starApLines = apLines.filter((l) => l.supplierId === star?.id);
  const starDebit = starApLines.reduce((s, l) => s + Number(l.baseDebit), 0);
  const starCredit = starApLines.reduce((s, l) => s + Number(l.baseCredit), 0);
  const starNet = Math.round((starCredit - starDebit) * 100) / 100;
  assert(
    starNet === 90_475,
    "SUP-3414 subledger net payable is exactly Rs. 90,475.00",
    `Credit Rs. ${starCredit} - Debit Rs. ${starDebit} = Rs. ${starNet}`
  );

  // SUP-8910: GRN 278,900 Credit, Payment 278,900 Debit = 0
  const sup5gApLines = apLines.filter((l) => l.supplierId === supplier5G?.id);
  const sup5gDebit = sup5gApLines.reduce((s, l) => s + Number(l.baseDebit), 0);
  const sup5gCredit = sup5gApLines.reduce((s, l) => s + Number(l.baseCredit), 0);
  const sup5gNet = Math.round((sup5gCredit - sup5gDebit) * 100) / 100;
  assert(
    sup5gNet === 0,
    "SUP-8910 subledger net balance is exactly Rs. 0.00",
    `Credit Rs. ${sup5gCredit} - Debit Rs. ${sup5gDebit} = Rs. ${sup5gNet}`
  );

  console.log("\n--------------------------------------------------------------------------------");
  console.log(`SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
  console.log("--------------------------------------------------------------------------------\n");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("FATAL TEST SUITE ERROR:", err);
  process.exit(1);
});
