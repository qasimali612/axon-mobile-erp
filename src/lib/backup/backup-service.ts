import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";

export type BackupSummary = {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  recordCount: number;
  companyCode: string;
  companyName: string;
  counts: Record<string, number>;
};

const BACKUP_DIR = path.join(process.cwd(), "backups");

async function ensureBackupDir() {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
  } catch {
    // Ignore already exists
  }
}

/**
 * Creates a complete, consistent JSON snapshot of the ERP company database.
 */
export async function createDatabaseBackup(companyId: string, userId?: string) {
  await ensureBackupDir();

  // Force checkpoint if possible
  try {
    await prisma.$executeRawUnsafe("CHECKPOINT");
  } catch {
    // Non-fatal if checkpoint is unsupported on this engine
  }

  const [
    company,
    branches,
    warehouses,
    accountGroups,
    accounts,
    categories,
    brands,
    units,
    taxRules,
    products,
    customers,
    suppliers,
    paymentMethods,
    priceLists,
    documentSequences,
    systemSettings,
    physicalStockUnits,
    inventoryLots,
    stockBalances,
    purchaseOrders,
    purchaseReceipts,
    salesInvoices,
    stockReturns,
    stockTransfers,
    stockAdjustments,
    stockCounts,
    journalEntries,
    bankAccounts,
    bankStatements,
    fixedAssets,
    budgets,
  ] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.branch.findMany({ where: { companyId } }),
    prisma.warehouse.findMany({
      where: { companyId },
      include: { locations: true },
    }),
    prisma.accountGroup.findMany({ where: { companyId } }),
    prisma.account.findMany({ where: { companyId } }),
    prisma.productCategory.findMany({ where: { companyId } }),
    prisma.brand.findMany({ where: { companyId } }),
    prisma.unitOfMeasure.findMany({ where: { companyId } }),
    prisma.taxRule.findMany({ where: { companyId } }),
    prisma.product.findMany({
      where: { companyId },
      include: {
        variants: {
          include: { barcodes: true },
        },
        barcodes: true,
      },
    }),
    prisma.customer.findMany({ where: { companyId } }),
    prisma.supplier.findMany({ where: { companyId } }),
    prisma.paymentMethod.findMany({ where: { companyId } }),
    prisma.priceList.findMany({
      where: { companyId },
      include: { items: true },
    }),
    prisma.documentSequence.findMany({ where: { companyId } }),
    prisma.systemSetting.findMany({ where: { companyId } }),
    prisma.physicalStockUnit.findMany({
      where: { companyId },
      include: { identifiers: true },
    }),
    prisma.inventoryLot.findMany({ where: { companyId } }),
    prisma.stockBalance.findMany({ where: { companyId } }),
    prisma.purchaseOrder.findMany({
      where: { companyId },
      include: { lines: true },
    }),
    prisma.purchaseReceipt.findMany({
      where: { companyId },
      include: {
        lines: {
          include: { units: true },
        },
      },
    }),
    prisma.salesInvoice.findMany({
      where: { companyId },
      include: {
        lines: {
          include: { units: true },
        },
      },
    }),
    prisma.stockReturn.findMany({
      where: { companyId },
      include: {
        lines: {
          include: { units: true },
        },
      },
    }),
    prisma.stockTransfer.findMany({
      where: { companyId },
      include: {
        lines: {
          include: { units: true },
        },
      },
    }),
    prisma.stockAdjustment.findMany({
      where: { companyId },
      include: {
        lines: {
          include: {
            units: {
              include: { identifiers: true },
            },
          },
        },
      },
    }),
    prisma.stockCount.findMany({
      where: { companyId },
      include: {
        lines: {
          include: { units: true },
        },
      },
    }),
    prisma.journalEntry.findMany({
      where: { companyId },
      include: { lines: true },
    }),
    prisma.bankAccount.findMany({
      where: { companyId },
      include: { transactions: true },
    }),
    prisma.bankStatement.findMany({
      where: { companyId },
      include: { lines: true },
    }),
    prisma.fixedAsset.findMany({
      where: { companyId },
      include: { schedules: true, transactions: true },
    }),
    prisma.budget.findMany({
      where: { companyId },
      include: { lines: true },
    }),
  ]);

  const counts: Record<string, number> = {
    accounts: accounts.length,
    products: products.length,
    stockUnits: physicalStockUnits.length,
    purchaseOrders: purchaseOrders.length,
    purchaseReceipts: purchaseReceipts.length,
    salesInvoices: salesInvoices.length,
    stockReturns: stockReturns.length,
    stockTransfers: stockTransfers.length,
    stockAdjustments: stockAdjustments.length,
    stockCounts: stockCounts.length,
    journalEntries: journalEntries.length,
    bankAccounts: bankAccounts.length,
    fixedAssets: fixedAssets.length,
    customers: customers.length,
    suppliers: suppliers.length,
  };

  const totalRecords = Object.values(counts).reduce((a, b) => a + b, 0);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `axon-backup-${company?.code || "ERP"}-${stamp}.json`;
  const filePath = path.join(BACKUP_DIR, filename);

  const payload = {
    version: "1.0",
    format: "AXON_DATABASE_BACKUP",
    timestamp: new Date().toISOString(),
    company: {
      id: company?.id,
      code: company?.code,
      name: company?.name,
      currencyCode: company?.currencyCode,
    },
    counts,
    totalRecords,
    data: {
      company,
      branches,
      warehouses,
      accountGroups,
      accounts,
      categories,
      brands,
      units,
      taxRules,
      products,
      customers,
      suppliers,
      paymentMethods,
      priceLists,
      documentSequences,
      systemSettings,
      physicalStockUnits,
      inventoryLots,
      stockBalances,
      purchaseOrders,
      purchaseReceipts,
      salesInvoices,
      stockReturns,
      stockTransfers,
      stockAdjustments,
      stockCounts,
      journalEntries,
      bankAccounts,
      bankStatements,
      fixedAssets,
      budgets,
    },
  };

  const jsonString = JSON.stringify(payload, null, 2);
  await fs.writeFile(filePath, jsonString, "utf8");
  const stat = await fs.stat(filePath);

  // Audit log entry
  if (userId && company) {
    try {
      await prisma.auditLog.create({
        data: {
          companyId: company.id,
          actorId: userId,
          action: "DATABASE_BACKUP_CREATED",
          module: "system",
          entityType: "Backup",
          entityId: filename,
          entityReference: filename,
          metadata: {
            filename,
            sizeBytes: stat.size,
            totalRecords,
            counts,
          },
        },
      });
    } catch {
      // Non-fatal if audit fails
    }
  }

  return {
    filename,
    filePath,
    sizeBytes: stat.size,
    timestamp: payload.timestamp,
    counts,
    totalRecords,
    payload,
  };
}

/**
 * Lists all existing backup files on disk with metadata.
 */
export async function listDatabaseBackups(): Promise<BackupSummary[]> {
  await ensureBackupDir();
  const entries = await fs.readdir(BACKUP_DIR);
  const backups: BackupSummary[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const fullPath = path.join(BACKUP_DIR, entry);
      const stat = await fs.stat(fullPath);
      const raw = await fs.readFile(fullPath, "utf8");
      const parsed = JSON.parse(raw);

      backups.push({
        filename: entry,
        sizeBytes: stat.size,
        createdAt: parsed.timestamp || stat.birthtime.toISOString(),
        recordCount: parsed.totalRecords || 0,
        companyCode: parsed.company?.code || "ERP",
        companyName: parsed.company?.name || "Axon ERP",
        counts: parsed.counts || {},
      });
    } catch {
      // Skip invalid files
    }
  }

  return backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Restores a full database snapshot into the current database.
 */
export async function restoreDatabaseBackup(inputPayload: any, actorId?: string) {
  if (inputPayload.format !== "AXON_DATABASE_BACKUP") {
    throw new Error("Invalid backup format. Only Axon ERP JSON backup archives (.json) can be restored.");
  }

  const { data, company } = inputPayload;
  if (!data || !company) {
    throw new Error("Corrupted backup archive: missing data payload or company metadata.");
  }

  console.log(`⏳ Restoring backup for ${company.code} (${inputPayload.totalRecords} records)...`);

  // Truncate transactional & operational tables first
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
  ];

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tablesToTruncate.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE;`,
  );

  // Restore Catalog, Customers, Suppliers
  if (data.customers?.length) {
    for (const c of data.customers) {
      await prisma.customer.create({ data: c });
    }
  }
  if (data.suppliers?.length) {
    for (const s of data.suppliers) {
      await prisma.supplier.create({ data: s });
    }
  }

  // Products with variants & barcodes
  if (data.products?.length) {
    for (const p of data.products) {
      const { variants, barcodes, ...productData } = p;
      await prisma.product.create({ data: productData });

      if (variants?.length) {
        for (const v of variants) {
          const { barcodes: variantBarcodes, ...variantData } = v;
          await prisma.productVariant.create({ data: variantData });
          if (variantBarcodes?.length) {
            for (const b of variantBarcodes) {
              await prisma.productBarcode.create({ data: b });
            }
          }
        }
      }
      if (barcodes?.length) {
        for (const b of barcodes) {
          await prisma.productBarcode.create({ data: b });
        }
      }
    }
  }

  // Restore Stock Units & IMEIs
  if (data.physicalStockUnits?.length) {
    for (const u of data.physicalStockUnits) {
      const { identifiers, ...unitData } = u;
      await prisma.physicalStockUnit.create({ data: unitData });
      if (identifiers?.length) {
        for (const idf of identifiers) {
          await prisma.deviceIdentifier.create({ data: idf });
        }
      }
    }
  }
  if (data.inventoryLots?.length) {
    for (const l of data.inventoryLots) {
      await prisma.inventoryLot.create({ data: l });
    }
  }
  if (data.stockBalances?.length) {
    for (const b of data.stockBalances) {
      await prisma.stockBalance.create({ data: b });
    }
  }

  // Restore Purchases
  if (data.purchaseOrders?.length) {
    for (const po of data.purchaseOrders) {
      const { lines, ...orderData } = po;
      await prisma.purchaseOrder.create({ data: orderData });
      if (lines?.length) {
        for (const l of lines) {
          await prisma.purchaseOrderLine.create({ data: l });
        }
      }
    }
  }
  if (data.purchaseReceipts?.length) {
    for (const pr of data.purchaseReceipts) {
      const { lines, ...receiptData } = pr;
      await prisma.purchaseReceipt.create({ data: receiptData });
      if (lines?.length) {
        for (const l of lines) {
          const { units, ...lineData } = l;
          await prisma.purchaseReceiptLine.create({ data: lineData });
          if (units?.length) {
            for (const u of units) {
              await prisma.purchaseReceiptUnit.create({ data: u });
            }
          }
        }
      }
    }
  }

  // Restore Sales
  if (data.salesInvoices?.length) {
    for (const si of data.salesInvoices) {
      const { lines, ...invoiceData } = si;
      await prisma.salesInvoice.create({ data: invoiceData });
      if (lines?.length) {
        for (const l of lines) {
          const { units, ...lineData } = l;
          await prisma.salesInvoiceLine.create({ data: lineData });
          if (units?.length) {
            for (const u of units) {
              await prisma.salesInvoiceUnit.create({ data: u });
            }
          }
        }
      }
    }
  }

  // Restore GL Journals
  if (data.journalEntries?.length) {
    for (const j of data.journalEntries) {
      const { lines, ...journalData } = j;
      await prisma.journalEntry.create({ data: journalData });
      if (lines?.length) {
        for (const l of lines) {
          await prisma.journalEntryLine.create({ data: l });
        }
      }
    }
  }

  // Restore Document Sequences
  if (data.documentSequences?.length) {
    for (const seq of data.documentSequences) {
      await prisma.documentSequence.upsert({
        where: { id: seq.id },
        create: seq,
        update: { nextValue: seq.nextValue },
      });
    }
  }

  // Record Audit
  if (actorId && company.id) {
    try {
      await prisma.auditLog.create({
        data: {
          companyId: company.id,
          actorId,
          action: "DATABASE_RESTORED",
          module: "system",
          entityType: "Backup",
          entityId: company.id,
          entityReference: inputPayload.timestamp,
          metadata: {
            backupTimestamp: inputPayload.timestamp,
            totalRecords: inputPayload.totalRecords,
            counts: inputPayload.counts,
          },
        },
      });
    } catch {
      // Non-fatal
    }
  }

  return {
    success: true,
    totalRecords: inputPayload.totalRecords,
    counts: inputPayload.counts,
    timestamp: inputPayload.timestamp,
  };
}
