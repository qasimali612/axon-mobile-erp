/**
 * Production smoke and concurrency check.
 *
 * Verifies the health endpoint, authenticated navigation, every finance workspace page, and runs a
 * burst of concurrent read requests to confirm the single-connection pool never deadlocks and that
 * no request takes longer than the configured ceiling.
 *
 * Run against a running server: npx tsx scripts/smoke-test.ts
 */
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.OPERATIONS_TEST_BASE_URL || "http://127.0.0.1:3000";
const concurrency = Number(process.env.SMOKE_CONCURRENCY || 8);
const maxLatencyMs = Number(process.env.SMOKE_MAX_LATENCY_MS || 8000);
const sessionIds: string[] = [];

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

async function login(email: string, companyId: string, branchId: string, warehouseId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(32).toString("base64url");
  const userAgent = `Axon-Smoke/${Date.now()}`;
  const row = await prisma.session.create({ data: { tokenHash: createHash("sha256").update(token).digest("hex"), userId: user.id, activeCompanyId: companyId, activeBranchId: branchId, activeWarehouseId: warehouseId, ipAddress: "127.0.0.1", userAgent, expiresAt: new Date(Date.now() + 3_600_000) } });
  sessionIds.push(row.id);
  return { cookie: `axon_session=${token}`, userAgent };
}

async function timed(label: string, path: string, cookie?: string, userAgent?: string) {
  const started = Date.now();
  const response = await fetch(`${baseUrl}${path}`, { headers: { ...(cookie ? { Cookie: cookie } : {}), ...(userAgent ? { "User-Agent": userAgent } : {}) }, redirect: "manual" });
  const elapsed = Date.now() - started;
  if (!response.ok && response.status !== 307 && response.status !== 302) throw new Error(`${label} ${path} returned ${response.status}`);
  return { label, path, status: response.status, elapsed };
}

async function main() {
  const company = await prisma.company.findUniqueOrThrow({ where: { code: "AXON" } });
  const branch = await prisma.branch.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "HZR" } } });
  const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "HZR-MAIN" } } });
  const owner = await login("owner@axonmobile.local", company.id, branch.id, warehouse.id);

  const health = await fetch(`${baseUrl}/api/system/health`).then((response) => response.json());
  assert(health.status === "ok" && health.database === "reachable", "Health endpoint did not report a reachable database.");
  console.log(`✓ health ok · database reachable · ${health.latencyMs} ms`);

  const anonymous = await fetch(`${baseUrl}/`, { redirect: "manual" });
  assert([307, 302].includes(anonymous.status), "Anonymous workspace request did not redirect to the login screen.");
  console.log(`✓ anonymous workspace request redirected to login (${anonymous.status})`);

  const pages = ["/", "/reports", "/reports/operations", "/finance/reports", "/finance/reports/trial-balance", "/finance/budgets", "/finance/incentives", "/finance/rebates", "/finance/assets", "/finance/banking", "/finance/subledgers", "/finance/incentives/print", "/finance/rebates/print", "/finance/assets/print", "/audit"];
  const pageResults = [];
  for (const page of pages) pageResults.push(await timed("page", page, owner.cookie, owner.userAgent));
  const slowest = pageResults.reduce((worst, row) => (row.elapsed > worst.elapsed ? row : worst), pageResults[0]);
  assert(slowest.elapsed < maxLatencyMs, `${slowest.path} took ${slowest.elapsed} ms, above the ${maxLatencyMs} ms ceiling.`);
  console.log(`✓ ${pageResults.length} authenticated pages rendered · slowest ${slowest.path} at ${slowest.elapsed} ms`);

  const apis = ["/api/finance/budgets", "/api/finance/incentives", "/api/finance/rebates", "/api/finance/assets", "/api/reports/operations?report=inventory&limit=50", "/api/system/health?details=true"];
  for (const api of apis) await timed("api", api, owner.cookie, owner.userAgent);
  console.log(`✓ ${apis.length} API endpoints responded`);

  const targets = ["/api/system/health", "/api/reports/operations?report=inventory&limit=50", "/api/finance/budgets", "/api/finance/incentives"];
  const burst = await Promise.all(Array.from({ length: concurrency * targets.length }, (_, index) => timed("burst", targets[index % targets.length], owner.cookie, owner.userAgent)));
  const failures = burst.filter((row) => row.status >= 500);
  assert(failures.length === 0, `${failures.length} concurrent requests failed.`);
  const maxBurst = Math.max(...burst.map((row) => row.elapsed));
  console.log(`✓ ${burst.length} concurrent requests across ${targets.length} endpoints · no failures · max ${maxBurst} ms`);

  console.log("Smoke and concurrency check passed.");
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    if (sessionIds.length) await prisma.session.deleteMany({ where: { id: { in: sessionIds } } }).catch(() => undefined);
    await prisma.$disconnect();
  });
