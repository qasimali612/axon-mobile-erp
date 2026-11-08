import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Resets database to a 100% clean production slate.
 * Purges all demo transactions, dummy handsets, IMEIs, invoices, journals, and demo catalog.
 * Preserves all foundation tables: Chart of Accounts, Permissions, Roles, Users, Branches, Warehouses, Taxes, and Units.
 */
async function main() {
  console.log("🧹 Purging demo transactions, catalog, and fixtures from database...");

  const tablesToTruncate = [
    "ProductionOrderUnit",
    "ProductionMaterialIssue",
    "ProductionOrder",
    "BomItem",
    "Bom",
    "PaymentAllocation",
    "Payment",
    "StockReturnUnit",
    "StockReturnLine",
    "StockReturn",
    "SalesInvoiceUnit",
    "SalesInvoiceLine",
    "SalesInvoice",
    "QualityInspection",
    "PurchaseReceiptUnit",
    "PurchaseReceiptLine",
    "PurchaseReceipt",
    "PurchaseOrderLine",
    "PurchaseOrder",
    "StockCountUnit",
    "StockCountLine",
    "StockCount",
    "StockAdjustmentUnitIdentifier",
    "StockAdjustmentUnit",
    "StockAdjustmentLine",
    "StockAdjustment",
    "StockTransferUnit",
    "StockTransferLine",
    "StockTransfer",
    "InventoryReservation",
    "InventoryMovement",
    "StockBalance",
    "DeviceIdentifier",
    "PhysicalStockUnit",
    "InventoryLot",
    "JournalEntryLine",
    "JournalEntry",
    "BankStatementLine",
    "BankStatement",
    "BankTransaction",
    "BankReconciliation",
    "AssetDisposal",
    "AssetTransaction",
    "AssetDepreciationSchedule",
    "FixedAsset",
    "IncentivePayment",
    "IncentivePayable",
    "IncentiveCalculation",
    "IncentivePlan",
    "ReceivedIncentivePayment",
    "ReceivedIncentive",
    "RebatePayment",
    "RebatePayable",
    "RebateReceipt",
    "RebateReceivable",
    "RebateCalculation",
    "RebateProgram",
    "BudgetLine",
    "Budget",
    "OpeningBalanceLine",
    "OpeningBalanceBatch",
    "FinancialPeriodClose",
    "PriceListItem",
    "SupplierItem",
    "ProductBarcode",
    "ProductVariant",
    "Product",
    "Customer",
    "Supplier",
    "AuditLog",
    "Notification",
  ];

  const truncateSql = `TRUNCATE TABLE ${tablesToTruncate.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE;`;

  await prisma.$executeRawUnsafe(truncateSql);
  console.log("✓ Operational, transactional, and demo catalog tables truncated cleanly.");

  // Reset Document Sequences back to initial baseline
  await prisma.documentSequence.updateMany({
    data: {
      nextValue: BigInt(1),
    },
  });
  console.log("✓ Document sequences reset to 1.");

  // Re-create universal Walk-in Customer for counter POS operations
  const companies = await prisma.company.findMany({ select: { id: true, code: true } });
  for (const company of companies) {
    await prisma.customer.upsert({
      where: { companyId_code: { companyId: company.id, code: "WALK-IN" } },
      create: {
        companyId: company.id,
        code: "WALK-IN",
        name: "Walk-in Counter Customer",
        phone: "+92 300 0000000",
        address: "Main Counter",
        creditLimit: 0,
        paymentTermsDays: 0,
        status: "ACTIVE",
        branchId: null, // Company-wide
      },
      update: {
        status: "ACTIVE",
        branchId: null,
      },
    });
  }
  console.log("✓ Universal Walk-In POS customer established.");

  console.log(`
===========================================================
✨ DATABASE RESET COMPLETED SUCCESSFULLY ✨
-----------------------------------------------------------
Preserved Foundations:
  • Organization Structure: Companies, Branches, Warehouses
  • Financial Chart of Accounts (Ready with 0.00 balances)
  • Security Catalog: Permissions, Roles, User Memberships
  • Unit of Measure & Tax Rules
  • POS Counter Support (Universal Walk-In Customer)

Purged Demo Data:
  • 0 Demo Products & Variants
  • 0 Serialized Devices & IMEIs
  • 0 Dummy Purchase Orders & Goods Receipts
  • 0 Dummy Sales Invoices & Counter Receipts
  • 0 Demo General Ledger Journals & Accruals
===========================================================
`);
}

main()
  .catch((e) => {
    console.error("Failed to reset database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
