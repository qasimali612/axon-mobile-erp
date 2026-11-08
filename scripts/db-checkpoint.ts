/**
 * Issues a PostgreSQL CHECKPOINT before a file-level backup so dirty shared buffers are flushed into
 * the data files. Without it a backup directory is only crash-consistent (WAL replay is required on
 * restore); after it the copy is clean and restores without replaying much WAL.
 *
 * Run: DATABASE_URL=… npx tsx scripts/db-checkpoint.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe("CHECKPOINT");
  const [row] = await prisma.$queryRawUnsafe<Array<{ checkpoint: string | null }>>("SHOW checkpoint_timeout")
    .catch(() => [{ checkpoint: null }]);
  console.log(`✓ checkpoint forced${row?.checkpoint ? ` (checkpoint_timeout ${row.checkpoint})` : ""}`);
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
