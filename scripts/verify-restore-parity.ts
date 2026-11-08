/**
 * Compares a restored database against the live source: migration state, critical invariants and
 * core row counts. Used by scripts/backup-restore-rehearsal.sh.
 */
import { PrismaClient } from "@prisma/client";

const source = new PrismaClient({ datasources: { db: { url: process.env.SOURCE_URL || "" } } });
const restore = new PrismaClient({ datasources: { db: { url: process.env.RESTORE_URL || "" } } });

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

const counts = {
  companies: (client: PrismaClient) => client.company.count(),
  users: (client: PrismaClient) => client.user.count(),
  products: (client: PrismaClient) => client.product.count(),
  stockUnits: (client: PrismaClient) => client.physicalStockUnit.count(),
  salesInvoices: (client: PrismaClient) => client.salesInvoice.count(),
  purchaseReceipts: (client: PrismaClient) => client.purchaseReceipt.count(),
  journalEntries: (client: PrismaClient) => client.journalEntry.count(),
  journalLines: (client: PrismaClient) => client.journalEntryLine.count(),
  auditLogs: (client: PrismaClient) => client.auditLog.count(),
  budgets: (client: PrismaClient) => client.budget.count(),
  incentiveCalculations: (client: PrismaClient) => client.incentiveCalculation.count(),
  rebateCalculations: (client: PrismaClient) => client.rebateCalculation.count(),
  fixedAssets: (client: PrismaClient) => client.fixedAsset.count(),
};

async function main() {
  const sourceMigrations = await source.$queryRaw<Array<{ migration_name: string; finished_at: Date | null }>>`SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY migration_name`;
  const restoreMigrations = await restore.$queryRaw<Array<{ migration_name: string; finished_at: Date | null }>>`SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY migration_name`;
  assert(sourceMigrations.length > 0, "The source database has no applied migrations.");
  assert(sourceMigrations.length === restoreMigrations.length, `Migration count differs: source ${sourceMigrations.length}, restored ${restoreMigrations.length}.`);
  const sourceNames = sourceMigrations.map((row) => row.migration_name).join(",");
  const restoreNames = restoreMigrations.map((row) => row.migration_name).join(",");
  assert(sourceNames === restoreNames, "The restored database has a different migration history.");
  const incomplete = restoreMigrations.filter((row) => !row.finished_at);
  assert(incomplete.length === 0, `Restored database has unfinished migrations: ${incomplete.map((row) => row.migration_name).join(", ")}`);
  console.log(`✓ ${restoreMigrations.length} migrations restored with identical history`);

  const expectedTriggers = ["AuditLog", "JournalEntry", "JournalEntryLine", "SalesInvoice", "PurchaseReceipt", "StockReturn"];
  for (const table of expectedTriggers) {
    const rows = await restore.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE c.relname = ${table} AND NOT t.tgisinternal`;
    assert(Number(rows[0].count) > 0, `Restored database lost the integrity triggers on ${table}.`);
  }
  console.log(`✓ database guards present on ${expectedTriggers.join(", ")}`);

  for (const [label, counter] of Object.entries(counts)) {
    const [sourceCount, restoreCount] = await Promise.all([counter(source), counter(restore)]);
    assert(sourceCount === restoreCount, `${label} differ: source ${sourceCount}, restored ${restoreCount}.`);
    console.log(`✓ ${label}: ${restoreCount}`);
  }

  const [sourceBalance, restoreBalance] = await Promise.all([
    source.journalEntryLine.aggregate({ _sum: { baseDebit: true, baseCredit: true } }),
    restore.journalEntryLine.aggregate({ _sum: { baseDebit: true, baseCredit: true } }),
  ]);
  assert(String(sourceBalance._sum.baseDebit) === String(restoreBalance._sum.baseDebit), "Restored ledger debit total differs from the source.");
  assert(String(sourceBalance._sum.baseCredit) === String(restoreBalance._sum.baseCredit), "Restored ledger credit total differs from the source.");
  console.log(`✓ ledger totals identical · debit ${restoreBalance._sum.baseDebit} · credit ${restoreBalance._sum.baseCredit}`);
  console.log("Backup and restore rehearsal passed.");
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await source.$disconnect(); await restore.$disconnect(); });
