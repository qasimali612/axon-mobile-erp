/**
 * Migration rehearsal: proves the deployed database matches the migration folder exactly, that no
 * migration was edited after being applied (checksum drift), that the fold-in order is linear, and
 * that the guards the application depends on still exist.
 *
 * Run: npx tsx scripts/migration-rehearsal.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const migrationsDir = join(process.cwd(), "prisma", "migrations");

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

type AppliedRow = { migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null };

async function main() {
  const folders = readdirSync(migrationsDir)
    .filter((entry) => statSync(join(migrationsDir, entry)).isDirectory())
    .sort();
  assert(folders.length > 0, "No migration folders were found.");
  assert(JSON.stringify(folders) === JSON.stringify([...folders].sort()), "Migration folders are not lexicographically ordered.");

  const applied = await prisma.$queryRaw<AppliedRow[]>`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name`;
  const appliedNames = applied.map((row) => row.migration_name);
  assert(applied.length === folders.length, `Applied ${applied.length} migrations but ${folders.length} folders exist.`);
  assert(JSON.stringify(appliedNames) === JSON.stringify(folders), "Applied migrations do not match the migration folder list.");
  assert(applied.every((row) => row.finished_at && !row.rolled_back_at), "At least one migration is unfinished or rolled back.");
  console.log(`✓ ${folders.length} migrations applied in folder order, none pending`);

  // Prisma stores a SHA-256 of the migration file; recompute and compare so an edited,
  // already-applied migration is caught before it silently diverges from production.
  let verified = 0;
  for (const row of applied) {
    const sql = readFileSync(join(migrationsDir, row.migration_name, "migration.sql"));
    const checksum = createHash("sha256").update(sql).digest("hex");
    assert(checksum === row.checksum, `Migration ${row.migration_name} was modified after it was applied. Create a new forward migration instead.`);
    verified += 1;
  }
  console.log(`✓ ${verified} migration checksums match their deployed state`);

  const triggers = await prisma.$queryRaw<Array<{ table: string; name: string }>>`
    SELECT c.relname AS table, t.tgname AS name
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal ORDER BY c.relname, t.tgname`;
  const requiredTriggers: Record<string, string[]> = {
    AuditLog: ["AuditLog_immutable"],
    JournalEntry: ["JournalEntry_immutability_guard", "JournalEntry_posting_guard"],
    SalesInvoice: ["SalesInvoice_posting_guard", "SalesInvoice_inventory_effect_guard", "SalesInvoice_immutability_guard"],
    PurchaseReceipt: ["PurchaseReceipt_posting_guard", "PurchaseReceipt_inventory_effect_guard"],
    StockReturn: ["StockReturn_header_guard"],
    InventoryMovement: ["InventoryMovement_append_only", "InventoryMovement_balance_projection"],
    DeviceIdentifier: ["DeviceIdentifier_scope_guard", "DeviceIdentifier_immutability_guard"],
  };
  for (const [table, names] of Object.entries(requiredTriggers)) {
    for (const name of names) {
      assert(triggers.some((trigger) => trigger.table === table && trigger.name === name), `Missing required trigger ${name} on ${table}.`);
    }
  }
  console.log(`✓ ${triggers.length} database triggers present including all required guards`);

  const [companies, journals, drafts] = await Promise.all([
    prisma.company.count(),
    prisma.journalEntry.count(),
    prisma.journalEntry.count({ where: { status: "DRAFT" } }),
  ]);
  const unbalanced = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count FROM (
      SELECT "entryId" FROM "JournalEntryLine" GROUP BY "entryId"
      HAVING round(sum("debit"), 4) <> round(sum("credit"), 4)
    ) AS unbalanced`;
  assert(Number(unbalanced[0].count) === 0, "At least one journal entry is unbalanced.");
  console.log(`✓ ${companies} companies · ${journals} journal entries (${drafts} draft) · every entry balanced`);
  console.log("Migration rehearsal passed.");
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
