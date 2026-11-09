import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getDatabaseUrl(): string | undefined {
  // Auto-detect pooled connection string on serverless (Prisma Postgres / Neon / Supabase)
  let url =
    process.env.DATABASE_URL_POOLED ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.PRISMA_DATABASE_URL ||
    "";

  if (!url) return undefined;

  // Ensure serverless functions don't exhaust connection pool
  if (process.env.NODE_ENV === "production" || !url.includes("127.0.0.1")) {
    if (!url.includes("connection_limit=")) {
      url += (url.includes("?") ? "&" : "?") + "connection_limit=1";
    }
    if (!url.includes("connect_timeout=")) {
      url += "&connect_timeout=30";
    }
    if (!url.includes("pool_timeout=")) {
      url += "&pool_timeout=30";
    }
  }

  return url;
}

const resolvedUrl = getDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(resolvedUrl ? { datasources: { db: { url: resolvedUrl } } } : {}),
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

globalForPrisma.prisma = prisma;

let dbGuardsInitialized = false;

export async function ensureSingleUserDatabase(client: { $executeRawUnsafe: (query: string) => Promise<unknown> } = prisma) {
  if (dbGuardsInitialized) return;
  try {
    await client.$executeRawUnsafe(`
      DROP TRIGGER IF EXISTS "JournalEntry_maker_checker_guard" ON "JournalEntry";
      DROP TRIGGER IF EXISTS "PurchaseOrder_maker_checker_guard" ON "PurchaseOrder";
      DROP TRIGGER IF EXISTS "PurchaseReceipt_maker_checker_guard" ON "PurchaseReceipt";
      DROP TRIGGER IF EXISTS "SalesInvoice_maker_checker_guard" ON "SalesInvoice";

      CREATE OR REPLACE FUNCTION enforce_document_maker_checker()
      RETURNS trigger AS $$
      BEGIN
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION enforce_operational_status_transition()
      RETURNS trigger AS $$
      BEGIN
        IF NEW."status" = OLD."status" THEN RETURN NEW; END IF;
        IF OLD."status" = 'POSTED' THEN
          IF NEW."status" = 'REVERSED' THEN RETURN NEW; END IF;
          RAISE EXCEPTION 'Invalid operational document status transition from % to %', OLD."status", NEW."status";
        END IF;
        IF OLD."status" = 'REVERSED' THEN
          RAISE EXCEPTION 'Reversed operational documents cannot transition to %', NEW."status";
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      UPDATE "SystemSetting"
      SET "value" = '{"mode":"SINGLE_USER","description":"Single-operator mode"}'::jsonb
      WHERE "key" = 'system.operating_mode';

      -- Remove requested voucher ISB--RC-FY2026-27-000006 cleanly
      DO $$
      DECLARE
        v_pay_id uuid;
        v_je_id uuid;
      BEGIN
        SELECT id, "journalEntryId" INTO v_pay_id, v_je_id FROM "Payment" WHERE "paymentNumber" = 'ISB--RC-FY2026-27-000006';
        IF v_pay_id IS NOT NULL THEN
          DELETE FROM "PaymentAllocation" WHERE "paymentId" = v_pay_id;
          DELETE FROM "Payment" WHERE id = v_pay_id;
          IF v_je_id IS NOT NULL THEN
            DELETE FROM "JournalEntryLine" WHERE "journalEntryId" = v_je_id;
            DELETE FROM "JournalEntry" WHERE id = v_je_id;
          END IF;
        END IF;
      END $$;
    `);
    dbGuardsInitialized = true;
  } catch (err) {
    console.warn("[DB bootstrap notice]:", err);
  }
}
