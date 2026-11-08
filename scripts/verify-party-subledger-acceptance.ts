import { createHash, randomBytes } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.OPERATIONS_TEST_BASE_URL || "http://127.0.0.1:3000";
const run = Date.now().toString(36);
const sessionIds: string[] = [];
type Session = { cookie: string; userAgent: string };
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
async function login(email: string, companyId: string, branchId: string, warehouseId: string): Promise<Session> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(32).toString("base64url");
  const userAgent = `Axon-Subledger-Acceptance/${run}/${email}`;
  const row = await prisma.session.create({ data: { tokenHash: createHash("sha256").update(token).digest("hex"), userId: user.id, activeCompanyId: companyId, activeBranchId: branchId, activeWarehouseId: warehouseId, ipAddress: "127.0.0.1", userAgent, expiresAt: new Date(Date.now() + 3_600_000) } });
  sessionIds.push(row.id); return { cookie: `axon_session=${token}`, userAgent };
}
async function request(session: Session, path: string, expected: number | number[] = 200) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { Cookie: session.cookie, Origin: baseUrl, "User-Agent": session.userAgent } });
  const text = await response.text();
  const body = text && response.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text;
  const statuses = Array.isArray(expected) ? expected : [expected];
  if (!statuses.includes(response.status)) throw new Error(`${path}: expected ${statuses.join("/")}, got ${response.status}: ${text}`);
  return { body, response };
}
async function verifyKind(session: Session, kind: "customer" | "supplier") {
  const summary = await request(session, `/api/finance/subledgers?type=${kind}&asOf=2026-10-28&pageSize=100`);
  const rows = summary.body.data as Array<{ id: string; code: string; aging: { balance: string; documentOpen: string; residual: string } }>;
  assert(rows.length > 0, `${kind} aging returned no parties.`);
  const totalFromRows = rows.reduce((sum, row) => sum.plus(row.aging.balance), new Prisma.Decimal(0));
  assert(totalFromRows.eq(summary.body.totals.balance), `${kind} summary total does not equal displayed party balances.`);
  const selected = rows.find((row) => !new Prisma.Decimal(row.aging.balance).isZero()) || rows[0];
  const detail = await request(session, `/api/finance/subledgers/${kind}/${selected.id}?from=2020-01-01&to=2026-10-28`);
  const report = detail.body.data as { openingBalance: string; closingBalance: string; periodDebit: string; periodCredit: string; transactions: Array<{ debit: string; credit: string; runningBalance: string }>; openItems: Array<{ openAmount: string }>; aging: { residual: string } };
  const movement = report.transactions.reduce((sum, row) => sum.plus(kind === "customer" ? new Prisma.Decimal(row.debit).minus(row.credit) : new Prisma.Decimal(row.credit).minus(row.debit)), new Prisma.Decimal(0));
  assert(new Prisma.Decimal(report.openingBalance).plus(movement).eq(report.closingBalance), `${kind} running statement does not reconcile opening plus activity to closing.`);
  if (report.transactions.length) assert(new Prisma.Decimal(report.transactions.at(-1)!.runningBalance).eq(report.closingBalance), `${kind} final running balance differs from closing balance.`);
  assert(new Prisma.Decimal(report.closingBalance).eq(selected.aging.balance), `${kind} statement closing balance differs from summary control-account balance.`);
  const open = report.openItems.reduce((sum, item) => sum.plus(item.openAmount), new Prisma.Decimal(0));
  assert(open.plus(report.aging.residual).eq(report.closingBalance), `${kind} open items plus residual do not reconcile to the ledger.`);
  const csv = await request(session, `/api/finance/subledgers/${kind}/${selected.id}?from=2020-01-01&to=2026-10-28&format=csv`);
  assert(csv.response.headers.get("content-type")?.includes("text/csv") && String(csv.body).includes("Running balance"), `${kind} CSV statement export failed.`);
  console.log(`✓ ${kind} summary, aging, running statement, open items, residual, and CSV reconcile`);
}
async function main() {
  const company = await prisma.company.findUniqueOrThrow({ where: { code: "AXON" } });
  const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "HZR-MAIN" } } });
  const accountant = await login("accountant@axonmobile.local", company.id, warehouse.branchId, warehouse.id);
  const buyer = await login("buyer@axonmobile.local", company.id, warehouse.branchId, warehouse.id);
  await request(buyer, "/api/finance/subledgers?type=customer&asOf=2026-10-28", 403);
  console.log("✓ sensitive party-ledger API rejects an operational user without finance access");
  await verifyKind(accountant, "customer");
  await verifyKind(accountant, "supplier");
  const page = await request(accountant, "/finance/subledgers");
  assert(String(page.body).includes("Party statements &amp; aging") || String(page.body).includes("Party statements & aging"), "Authenticated subledger workspace did not render.");
  console.log(`✓ authenticated party statement and aging workspace rendered (${run})`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { if (sessionIds.length) await prisma.session.deleteMany({ where: { id: { in: sessionIds } } }).catch(() => undefined); await prisma.$disconnect(); });
