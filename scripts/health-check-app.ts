import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = "http://127.0.0.1:3000";

type Session = { cookie: string; userAgent: string; email: string };
const sessionIds: string[] = [];

async function createSession(email: string): Promise<Session> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { memberships: { include: { company: true } } },
  });
  const company = user.memberships[0].company;
  const branch = await prisma.branch.findFirstOrThrow({ where: { companyId: company.id } });
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { companyId: company.id } });

  const token = randomBytes(32).toString("base64url");
  const userAgent = `Axon-Health-Check/${email}`;
  const row = await prisma.session.create({
    data: {
      tokenHash: createHash("sha256").update(token).digest("hex"),
      userId: user.id,
      activeCompanyId: company.id,
      activeBranchId: branch.id,
      activeWarehouseId: warehouse.id,
      ipAddress: "127.0.0.1",
      userAgent,
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  sessionIds.push(row.id);
  return { cookie: `axon_session=${token}`, userAgent, email };
}

async function checkUrl(session: Session | null, path: string, expectedStatus: number[] = [200]) {
  const headers: Record<string, string> = {
    Origin: baseUrl,
  };
  if (session) {
    headers["Cookie"] = session.cookie;
    headers["User-Agent"] = session.userAgent;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    headers,
    redirect: "manual",
  });

  const ok = expectedStatus.includes(res.status);
  const text = await res.text();
  const hasErrorOverlay = text.includes("Unhandled Runtime Error") || text.includes("PrismaClientKnownRequestError");

  return {
    path,
    status: res.status,
    ok: ok && !hasErrorOverlay,
    hasErrorOverlay,
    snippet: text.slice(0, 120).replace(/\s+/g, " "),
  };
}

async function main() {
  console.log("=== COMPREHENSIVE NEXT.JS & MODULE HEALTH CHECK ===");

  // 1. Unauthenticated checks (Should redirect to /login with 307)
  console.log("\n1. Testing Protected Route Security (Unauthenticated)...");
  const unauthPages = ["/", "/catalog/products", "/inventory", "/purchases", "/sales", "/finance"];
  for (const page of unauthPages) {
    const res = await checkUrl(null, page, [307]);
    console.log(`  ${res.ok ? "✓" : "✗"} ${page} -> HTTP ${res.status} (Redirect to Login: ${res.ok})`);
  }

  // 2. Authenticated Session Checks as Owner
  console.log("\n2. Initializing Authenticated Session as Owner (owner@axonmobile.local)...");
  const owner = await createSession("owner@axonmobile.local");
  console.log("✓ Owner session created successfully.");

  console.log("\n3. Testing Core ERP Pages (Owner Role)...");
  const pages = [
    { name: "Dashboard", path: "/" },
    { name: "Products Catalog", path: "/catalog/products" },
    { name: "Inventory Balances", path: "/inventory" },
    { name: "IMEI Registry", path: "/inventory/imei" },
    { name: "Stock Transfers", path: "/inventory/transfers" },
    { name: "Stock Adjustments", path: "/inventory/adjustments" },
    { name: "Stock Counts", path: "/inventory/stock-counts" },
    { name: "Purchases", path: "/purchases" },
    { name: "Goods Receipts (GRN)", path: "/goods-receipts" },
    { name: "Sales Invoices", path: "/sales" },
    { name: "Point of Sale (POS)", path: "/pos" },
    { name: "Returns", path: "/returns" },
    { name: "Parties (Customers & Suppliers)", path: "/parties" },
    { name: "Payments & Receipts", path: "/finance/payments" },
    { name: "Finance Overview", path: "/finance" },
    { name: "Chart of Accounts", path: "/finance/accounts" },
    { name: "Journal Register", path: "/finance/journals" },
    { name: "Financial Statements", path: "/finance/reports" },
    { name: "Trial Balance", path: "/finance/reports/trial-balance" },
    { name: "Party Subledgers", path: "/finance/subledgers" },
    { name: "Banking & Reconciliation", path: "/finance/banking" },
    { name: "Fixed Assets", path: "/finance/assets" },
    { name: "Incentives Register", path: "/finance/incentives" },
    { name: "Rebates Register", path: "/finance/rebates" },
    { name: "Budgets Register", path: "/finance/budgets" },
    { name: "Fiscal Periods", path: "/finance/periods" },
    { name: "Reporting Hub", path: "/reports" },
    { name: "Operational Reports", path: "/reports/operations" },
    { name: "Report Schedules", path: "/reports/schedules" },
    { name: "Operating Expenses", path: "/finance/expenses" },
    { name: "Approvals Command Center", path: "/approvals" },
    { name: "User Management", path: "/access/users" },
    { name: "Role Management", path: "/access/roles" },
    { name: "Audit Trail", path: "/audit" },
    { name: "Company Settings", path: "/organization" },
  ];

  let pagesPassed = 0;
  for (const page of pages) {
    const res = await checkUrl(owner, page.path, [200]);
    if (res.ok) {
      pagesPassed++;
      console.log(`  ✓ [200 OK] ${page.name.padEnd(30)} (${page.path})`);
    } else {
      console.error(`  ✗ [FAIL ${res.status}] ${page.name.padEnd(30)} (${page.path}) - Overlay: ${res.hasErrorOverlay}`);
    }
  }

  // 4. Testing Critical API Endpoints
  console.log("\n4. Testing Critical API Endpoints (Owner Role)...");
  const period = await prisma.accountingPeriod.findFirstOrThrow({
    where: { status: "OPEN" },
  });

  const apis = [
    { name: "Operations Lookups", path: "/api/operations/lookups" },
    { name: "Report Dimensions", path: "/api/reports/dimensions" },
    { name: "Report: Goods Receipts", path: "/api/reports/operations?report=goods-receipts&limit=10" },
    { name: "Report: Sales", path: "/api/reports/operations?report=sales&limit=10" },
    { name: "Report: Inventory", path: "/api/reports/operations?report=inventory&limit=10" },
    { name: "Report: Devices (IMEI)", path: "/api/reports/operations?report=devices&limit=10" },
    { name: "Report: Movements", path: "/api/reports/operations?report=movements&limit=10" },
    { name: "Report: Profitability", path: "/api/reports/operations?report=profitability&limit=10" },
    { name: "Report: Reorder", path: "/api/reports/operations?report=reorder&limit=10" },
    { name: "Finance: Statements", path: `/api/finance/reports/statements?period=${period.id}` },
    { name: "Finance: Trial Balance", path: `/api/finance/reports/trial-balance?period=${period.id}` },
    { name: "Finance: Expenses", path: "/api/finance/expenses" },
    { name: "Approvals Queue", path: "/api/approvals" },
  ];

  let apisPassed = 0;
  for (const api of apis) {
    const res = await checkUrl(owner, api.path, [200]);
    if (res.ok) {
      apisPassed++;
      console.log(`  ✓ [200 OK] ${api.name.padEnd(30)} (${api.path})`);
    } else {
      console.error(`  ✗ [FAIL ${res.status}] ${api.name.padEnd(30)} (${api.path})`);
    }
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`Pages Verified: ${pagesPassed} / ${pages.length}`);
  console.log(`APIs Verified: ${apisPassed} / ${apis.length}`);
}

main()
  .catch((e) => {
    console.error("Health check error:", e);
    process.exit(1);
  })
  .finally(async () => {
    if (sessionIds.length) {
      await prisma.session.deleteMany({ where: { id: { in: sessionIds } } });
    }
    await prisma.$disconnect();
  });
