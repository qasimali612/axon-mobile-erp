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
