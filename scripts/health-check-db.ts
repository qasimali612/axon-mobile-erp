import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Testing Prisma connection to 127.0.0.1:54329...");
  const start = Date.now();
  await prisma.$queryRaw`SELECT 1 as connected`;
  const pingMs = Date.now() - start;
  console.log(`✓ Database responded in ${pingMs}ms`);

  const [
    companies,
    users,
    branches,
    warehouses,
    products,
    variants,
    stockUnits,
    identifiers,
    stockBalances,
    movements,
    purchaseOrders,
    receipts,
    salesInvoices,
    customers,
    suppliers,
    journalEntries,
    journalLines,
    accounts,
    auditLogs,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.user.count(),
    prisma.branch.count(),
    prisma.warehouse.count(),
    prisma.product.count(),
    prisma.productVariant.count(),
    prisma.physicalStockUnit.count(),
    prisma.deviceIdentifier.count(),
    prisma.stockBalance.count(),
    prisma.inventoryMovement.count(),
    prisma.purchaseOrder.count(),
    prisma.purchaseReceipt.count(),
    prisma.salesInvoice.count(),
    prisma.customer.count(),
    prisma.supplier.count(),
    prisma.journalEntry.count(),
    prisma.journalEntryLine.count(),
    prisma.account.count(),
    prisma.auditLog.count(),
  ]);

  console.log("\n=== DATABASE COUNTS ===");
  console.table({
    Companies: companies,
    Users: users,
    Branches: branches,
    Warehouses: warehouses,
    Products: products,
    Variants: variants,
    PhysicalStockUnits: stockUnits,
    DeviceIdentifiers: identifiers,
    StockBalances: stockBalances,
    InventoryMovements: movements,
    PurchaseOrders: purchaseOrders,
    PurchaseReceipts: receipts,
    SalesInvoices: salesInvoices,
    Customers: customers,
    Suppliers: suppliers,
    JournalEntries: journalEntries,
    JournalLines: journalLines,
    Accounts: accounts,
    AuditLogs: auditLogs,
  });

  // Verify IMEI integrity: check if any device has null or corrupted normalized value
  const badIdentifiers = await prisma.deviceIdentifier.count({
    where: { OR: [{ normalizedValue: "" }, { value: "" }] },
  });
  console.log(`Bad / empty IMEI values: ${badIdentifiers}`);

  // Check unposted vs posted journals
  const journalStatuses = await prisma.journalEntry.groupBy({
    by: ["status"],
    _count: { id: true },
  });
  console.log("\n=== JOURNAL STATUSES ===");
  console.table(journalStatuses.map((s) => ({ Status: s.status, Count: s._count.id })));
}

main()
  .catch((e) => {
    console.error("Database health check failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
