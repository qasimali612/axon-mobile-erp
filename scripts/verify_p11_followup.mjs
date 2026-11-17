import { PrismaClient } from "@prisma/client";

const cloudUrl =
  "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30";

const prisma = new PrismaClient({
  datasources: { db: { url: cloudUrl } },
});

async function main() {
  console.log("================================================================================");
  console.log("AXON MOBILE ERP — PRIORITY 11 FOLLOW-UP AUDIT");
  console.log("1. 63 Seeded Feature Phones Integrity");
  console.log("2. Opening Cash Voucher ISB--JV-FY2026-27-000001 Impact");
  console.log("================================================================================\n");

  const company = await prisma.company.findFirst({ where: { code: "AXON" } });
  if (!company) throw new Error("Company AXON not found");

  // 1. FEATURE PHONES CHECK
  console.log("--- 1. FEATURE PHONES & CATALOG AUDIT ---");
  const allProducts = await prisma.product.findMany({
    where: { companyId: company.id },
    include: {
      category: true,
      brand: true,
      variants: true,
      stockBalances: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Total Products in DB: ${allProducts.length}`);

  const imeiProducts = allProducts.filter((p) => p.trackingMethod === "IMEI");
  const qtyProducts = allProducts.filter((p) => p.trackingMethod === "QUANTITY");
  const otherProducts = allProducts.filter((p) => p.trackingMethod !== "IMEI" && p.trackingMethod !== "QUANTITY");

  console.log(`- TrackingMethod IMEI: ${imeiProducts.length}`);
  console.log(`- TrackingMethod QUANTITY: ${qtyProducts.length}`);
  console.log(`- Other TrackingMethod: ${otherProducts.length}`);

  // Inspect the 63 seeded feature phones vs original products
  // In seed_feature_phones.mjs, SKUs were FP-...
  const fpSeeded = allProducts.filter((p) => p.sku.startsWith("FP-"));
  console.log(`\nSeeded with SKU prefix 'FP-': ${fpSeeded.length}`);

  let fpStockAnomalies = [];
  let fpCostingAnomalies = [];
  let fpVariantAnomalies = [];
  let duplicateSkus = new Set();
  let seenSkus = new Set();

  for (const p of fpSeeded) {
    if (seenSkus.has(p.sku)) duplicateSkus.add(p.sku);
    seenSkus.add(p.sku);

    if (p.costingMethod !== "WEIGHTED_AVERAGE") {
      fpCostingAnomalies.push({ sku: p.sku, name: p.name, costing: p.costingMethod });
    }
    if (p.variants.length !== 1 || !p.variants[0].sku.endsWith("-STD")) {
      fpVariantAnomalies.push({ sku: p.sku, name: p.name, variants: p.variants.length });
    }

    const totalQty = p.stockBalances.reduce((sum, b) => sum + Number(b.quantity), 0);
    const totalVal = p.stockBalances.reduce((sum, b) => sum + Number(b.inventoryValue), 0);
    if (totalQty !== 0 || totalVal !== 0) {
      fpStockAnomalies.push({ sku: p.sku, name: p.name, totalQty, totalVal });
    }
  }

  console.log(`- FP Products count: ${fpSeeded.length} (Expected: 63)`);
  console.log(`- Duplicate SKUs among FP: ${duplicateSkus.size}`);
  console.log(`- Costing Anomalies in FP: ${fpCostingAnomalies.length}`);
  console.log(`- Variant Anomalies in FP: ${fpVariantAnomalies.length}`);
  console.log(`- Unintended Stock in FP: ${fpStockAnomalies.length}`);

  // Also check non-FP products
  const nonFpProducts = allProducts.filter((p) => !p.sku.startsWith("FP-"));
  console.log(`\nNon-FP (Original) Products count: ${nonFpProducts.length}`);
  for (const p of nonFpProducts) {
    console.log(`  Original: [${p.sku}] ${p.name} | Category: ${p.category?.name} | Method: ${p.trackingMethod} | Costing: ${p.costingMethod} | Variants: ${p.variants.length}`);
  }

  // 2. CASH OPENING VOUCHER CHECK
  console.log("\n--- 2. CASH OPENING VOUCHER VERIFICATION ---");
  const voucherId = "a1eaf18e-9814-4ad3-960c-e6ccf2f9d922";
  const voucher = await prisma.journalEntry.findUnique({
    where: { id: voucherId },
    include: {
      period: true,
      lines: {
        include: { account: true },
        orderBy: { lineNumber: "asc" },
      },
    },
  });

  if (!voucher) {
    console.error(`Voucher ${voucherId} NOT FOUND!`);
  } else {
    console.log(`Voucher Number: ${voucher.entryNumber}`);
    console.log(`Voucher Type: ${voucher.voucherType}`);
    console.log(`Posting Date: ${voucher.postingDate.toISOString()}`);
    console.log(`Voucher Date: ${voucher.voucherDate.toISOString()}`);
    console.log(`Status: ${voucher.status}`);
    console.log(`Description: ${voucher.description}`);
    console.log(`Fiscal Period: ${voucher.period?.name} (${voucher.period?.startDate.toISOString().slice(0, 10)} to ${voucher.period?.endDate.toISOString().slice(0, 10)}) - Closed: ${voucher.period?.isClosed}`);

    let totalDebit = 0;
    let totalCredit = 0;
    console.log("\nVoucher Lines:");
    for (const line of voucher.lines) {
      console.log(`  Line ${line.lineNumber}: [${line.account.code} - ${line.account.name}] Dr: Rs. ${Number(line.baseDebit).toLocaleString()} | Cr: Rs. ${Number(line.baseCredit).toLocaleString()} | Desc: ${line.description}`);
      totalDebit += Number(line.baseDebit);
      totalCredit += Number(line.baseCredit);
    }
    console.log(`Total Debit: Rs. ${totalDebit.toLocaleString()}`);
    console.log(`Total Credit: Rs. ${totalCredit.toLocaleString()}`);
    console.log(`Line Equilibrium (Diff): Rs. ${(totalDebit - totalCredit).toFixed(2)}`);
  }

  // Check Account 1000 GL Balances for Oct & Nov
  console.log("\n--- 3. GL 1000 (CASH ON HAND) BALANCE TIMELINE ---");
  const oct31 = new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999));
  const nov01 = new Date(Date.UTC(2026, 10, 1, 0, 0, 0, 0));

  // Pre-Nov transactions on GL 1000
  const preNovLines = await prisma.journalEntryLine.aggregate({
    where: {
      account: { code: "1000" },
      entry: { companyId: company.id, status: { in: ["POSTED", "REVERSED"] }, postingDate: { lte: oct31 } },
    },
    _sum: { baseDebit: true, baseCredit: true },
  });
  const octCloseCash = Number(preNovLines._sum.baseDebit || 0) - Number(preNovLines._sum.baseCredit || 0);
  console.log(`Oct 31 Closing Cash (Pre-Nov GL 1000 Balance): Rs. ${octCloseCash.toLocaleString()}`);

  // Nov transactions on GL 1000
  const novLines = await prisma.journalEntryLine.aggregate({
    where: {
      account: { code: "1000" },
      entry: { companyId: company.id, status: { in: ["POSTED", "REVERSED"] }, postingDate: { gte: nov01 } },
    },
    _sum: { baseDebit: true, baseCredit: true },
  });
  const novNetMovement = Number(novLines._sum.baseDebit || 0) - Number(novLines._sum.baseCredit || 0);
  console.log(`Nov Net Cash Movement: Rs. ${novNetMovement.toLocaleString()} (Dr: ${Number(novLines._sum.baseDebit || 0).toLocaleString()}, Cr: ${Number(novLines._sum.baseCredit || 0).toLocaleString()})`);

  // Overall current cash balance
  const currentCashAgg = await prisma.journalEntryLine.aggregate({
    where: {
      account: { code: "1000" },
      entry: { companyId: company.id, status: { in: ["POSTED", "REVERSED"] } },
    },
    _sum: { baseDebit: true, baseCredit: true },
  });
  const currentCash = Number(currentCashAgg._sum.baseDebit || 0) - Number(currentCashAgg._sum.baseCredit || 0);
  console.log(`Total Authoritative GL 1000 Cash Balance: Rs. ${currentCash.toLocaleString()}`);
  console.log(`Calculated (Oct Close + Nov Movement): Rs. ${(octCloseCash + novNetMovement).toLocaleString()}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
