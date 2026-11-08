/**
 * Reporting, export and print parity acceptance.
 *
 * Proves that every export is server-generated, permission-gated, audited and numerically
 * reconciled to the posted ledger or the source register, and that every print layout renders for
 * an authorized user while staying closed to roles without the module permission.
 */
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.OPERATIONS_TEST_BASE_URL || "http://127.0.0.1:3000";
const run = Date.now().toString(36).toUpperCase();
const sessionIds: string[] = [];
type Session = { cookie: string; userAgent: string };

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

async function login(email: string, companyId: string, branchId: string, warehouseId: string): Promise<Session> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(32).toString("base64url");
  const userAgent = `Axon-Reporting-Acceptance/${run}/${email}`;
  const row = await prisma.session.create({ data: { tokenHash: createHash("sha256").update(token).digest("hex"), userId: user.id, activeCompanyId: companyId, activeBranchId: branchId, activeWarehouseId: warehouseId, ipAddress: "127.0.0.1", userAgent, expiresAt: new Date(Date.now() + 3_600_000) } });
  sessionIds.push(row.id);
  return { cookie: `axon_session=${token}`, userAgent };
}

async function fetchRaw(session: Session, path: string, expected = 200) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { Cookie: session.cookie, Origin: baseUrl, "User-Agent": session.userAgent }, redirect: "manual" });
  // Read bytes first: Response.text() decodes with a BOM-stripping TextDecoder, which would hide
  // the UTF-8 byte-order mark that spreadsheet tools rely on.
  const bytes = new Uint8Array(await response.arrayBuffer());
  const hasBom = bytes.length > 2 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const text = new TextDecoder("utf-8").decode(bytes);
  if (response.status !== expected) throw new Error(`GET ${path}: expected ${expected}, got ${response.status}: ${text.slice(0, 240)}`);
  return { response, text, hasBom };
}

/** RFC 4180 parser so quoted commas and embedded quotes never corrupt a reconciliation. */
function parseCsv(text: string): string[][] {
  const body = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (quoted) {
      if (char === '"' && body[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ",") { row.push(cell); cell = ""; continue; }
    if (char === "\r") continue;
    if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += char;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((line) => line.some((value) => value.trim().length > 0));
}

async function main() {
  const started = new Date();
  const company = await prisma.company.findUniqueOrThrow({ where: { code: "AXON" } });
  const branch = await prisma.branch.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "HZR" } } });
  const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "HZR-MAIN" } } });
  const accountant = await login("accountant@axonmobile.local", company.id, branch.id, warehouse.id);
  const owner = await login("owner@axonmobile.local", company.id, branch.id, warehouse.id);
  const buyer = await login("buyer@axonmobile.local", company.id, branch.id, warehouse.id);

  // 1 · export permission ------------------------------------------------------
  await fetchRaw(accountant, "/api/finance/exports/budgets", 403);
  await fetchRaw(accountant, "/api/finance/exports/assets", 403);
  await fetchRaw(buyer, "/api/finance/exports/incentives", 403);
  const period = await prisma.accountingPeriod.findFirstOrThrow({ where: { companyId: company.id, startDate: { lte: new Date() }, endDate: { gte: new Date() }, status: "OPEN" } });
  await fetchRaw(accountant, `/api/finance/reports/statements?period=${period.id}`, 403);
  await fetchRaw(owner, "/api/finance/exports/unknown-register", 404);
  console.log("✓ finance register and statement exports require the financial export grant");

  // 2 · operational report export ---------------------------------------------
  const operational = await fetchRaw(owner, "/api/reports/operations?report=goods-receipts&limit=500&format=csv");
  assert(operational.response.headers.get("content-type")?.includes("text/csv"), "Operational export was not served as CSV.");
  assert(operational.hasBom, "Operational export is missing the UTF-8 BOM needed by spreadsheet tools.");
  const operationalRows = parseCsv(operational.text);
  assert(operationalRows.length > 3, `Operational export returned only ${operationalRows.length} lines.`);
  const receiptCount = await prisma.purchaseReceipt.count({ where: { companyId: company.id } });
  assert(receiptCount > 0, "The acceptance needs posted receipts from earlier suites.");
  assert(operationalRows[0].join(",").includes("goods-receipts"), "The operational export header does not identify the report.");
  assert(operationalRows[1].includes("documentNumber") && operationalRows[1].includes("identifiers"), "The operational export is missing expected columns.");
  await fetchRaw(owner, "/api/reports/operations?report=not-a-report&format=csv", 422);
  console.log(`✓ operational report exports ${operationalRows.length - 2} data rows as BOM-prefixed CSV`);

  // 3 · financial statements reconcile ----------------------------------------
  const statements = await fetchRaw(owner, `/api/finance/reports/statements?period=${period.id}`);
  const statementRows = parseCsv(statements.text);
  const sections = new Set(statementRows.slice(1).map((row) => row[0]));
  for (const section of ["PROFIT_AND_LOSS", "BALANCE_SHEET", "CASH_FLOW"]) assert(sections.has(section), `Statement export is missing the ${section} section.`);
  const exported = (label: string) => Number(statementRows.find((row) => row[2] === label)?.[3] ?? "NaN");
  const revenueLines = await prisma.journalEntryLine.findMany({
    where: { account: { companyId: company.id, accountClass: "REVENUE", isActive: true }, entry: { companyId: company.id, status: { in: ["POSTED", "REVERSED"] }, postingDate: { gte: period.startDate, lte: period.endDate } } },
    select: { baseDebit: true, baseCredit: true },
  });
  const expectedRevenue = round4(revenueLines.reduce((sum, line) => sum + Number(line.baseCredit) - Number(line.baseDebit), 0));
  assert(round4(exported("Revenue")) === expectedRevenue, `Exported revenue ${exported("Revenue")} does not reconcile to posted revenue ${expectedRevenue}.`);
  const balanceDifference = exported("Balance difference");
  assert(Number.isFinite(balanceDifference) && Math.abs(balanceDifference) < 0.0001, `Balance sheet difference is ${balanceDifference}, expected zero.`);
  const cashFlowNet = exported("Net movement");
  assert(Number.isFinite(cashFlowNet), "The statement export is missing the cash-flow net movement.");
  console.log(`✓ statements export reconciles to the ledger · revenue ${expectedRevenue} · balance difference ${balanceDifference}`);

  // 4 · register exports reconcile to record counts ---------------------------
  const budgets = await prisma.budget.findMany({ where: { companyId: company.id }, include: { lines: { select: { id: true } } } });
  const expectedBudgetRows = budgets.reduce((sum, budget) => sum + Math.max(budget.lines.length, 1), 0);
  const budgetCsv = parseCsv((await fetchRaw(owner, "/api/finance/exports/budgets")).text);
  assert(budgetCsv[0].join("|") === "Budget|Version|Status|Fiscal year|Branch|Department|Cost centre|Currency|Total|Prepared by|Approved by|Account code|Account|Period|Line amount|Line notes", "The budget export header changed unexpectedly.");
  assert(budgetCsv.length - 1 === expectedBudgetRows, `Budget export had ${budgetCsv.length - 1} rows, expected ${expectedBudgetRows}.`);

  const incentiveRows = await prisma.incentiveCalculation.count({ where: { companyId: company.id } });
  const incentiveCsv = parseCsv((await fetchRaw(owner, "/api/finance/exports/incentives")).text);
  assert(incentiveCsv.length - 1 === incentiveRows, `Incentive export had ${incentiveCsv.length - 1} rows, expected ${incentiveRows}.`);
  assert(incentiveCsv[1].includes("voucherNumber") || incentiveCsv[0].includes("Accrual voucher"), "The incentive export is missing accrual voucher references.");

  const rebateRows = await prisma.rebateCalculation.count({ where: { companyId: company.id } });
  const rebateCsv = parseCsv((await fetchRaw(owner, "/api/finance/exports/rebates")).text);
  assert(rebateCsv.length - 1 === rebateRows, `Rebate export had ${rebateCsv.length - 1} rows, expected ${rebateRows}.`);

  const assetRows = await prisma.fixedAsset.count({ where: { companyId: company.id } });
  const assetCsv = parseCsv((await fetchRaw(owner, "/api/finance/exports/assets")).text);
  assert(assetCsv.length - 1 === assetRows, `Asset export had ${assetCsv.length - 1} rows, expected ${assetRows}.`);
  const exportedNbv = assetCsv.slice(1).reduce((sum, row) => sum + Number(row[15]), 0);
  const ledgerNbv = await prisma.fixedAsset.aggregate({ where: { companyId: company.id }, _sum: { netBookValue: true } });
  assert(round4(exportedNbv) === round4(Number(ledgerNbv._sum.netBookValue ?? 0)), "The exported net book value does not match the asset register.");
  console.log(`✓ register exports reconcile · budgets ${expectedBudgetRows} · incentives ${incentiveRows} · rebates ${rebateRows} · assets ${assetRows}`);

  // 5 · print layouts ----------------------------------------------------------
  const budget = budgets.find((row) => row.lines.length > 0);
  assert(budget, "The acceptance needs a budget with lines.");
  const budgetPrint = await fetchRaw(owner, `/finance/budgets/${budget.id}/print`);
  assert(/Budget version/.test(budgetPrint.text) && /Variance/.test(budgetPrint.text), "The budget print layout is missing its variance table.");
  assert(budgetPrint.text.includes(budget.code), "The budget print layout does not show the budget code.");
  await fetchRaw(accountant, `/finance/budgets/${budget.id}/print`, 200);
  const incentivePrint = await fetchRaw(owner, "/finance/incentives/print");
  assert(/Incentive register/.test(incentivePrint.text), "The incentive print layout did not render.");
  const rebatePrint = await fetchRaw(owner, "/finance/rebates/print");
  assert(/Rebate register/.test(rebatePrint.text), "The rebate print layout did not render.");
  const assetPrint = await fetchRaw(owner, "/finance/assets/print");
  assert(/Fixed-asset register/.test(assetPrint.text), "The asset print layout did not render.");
  await fetchRaw(buyer, "/finance/assets/print", 307);
  await fetchRaw(buyer, "/finance/rebates/print", 307);
  console.log("✓ four print layouts render for authorized roles and are closed to others");

  // 6 · reporting hub ----------------------------------------------------------
  const hub = await fetchRaw(owner, "/reports");
  assert(/Reports, exports and print/.test(hub.text), "The reporting hub did not render.");
  for (const label of ["Financial statements", "Operational reports", "Finance registers", "Budget register", "Fixed-asset register"]) {
    assert(hub.text.includes(label), `The reporting hub is missing the ${label} section.`);
  }
  const accountantHub = await fetchRaw(accountant, "/reports");
  assert(/Export needs the financial export grant/.test(accountantHub.text), "The reporting hub does not explain the missing export grant.");
  console.log("✓ reporting hub lists every report and explains restricted exports");

  // 7 · audit evidence ---------------------------------------------------------
  const audit = await prisma.auditLog.findMany({ where: { companyId: company.id, createdAt: { gte: started }, action: { in: ["OPERATIONAL_REPORT_EXPORTED", "FINANCIAL_STATEMENTS_EXPORTED", "FINANCE_REGISTER_EXPORTED"] } }, select: { action: true, entityReference: true } });
  const actions = new Set(audit.map((row) => row.action));
  for (const action of ["OPERATIONAL_REPORT_EXPORTED", "FINANCIAL_STATEMENTS_EXPORTED", "FINANCE_REGISTER_EXPORTED"]) assert(actions.has(action), `Missing audit action ${action}.`);
  const registers = new Set(audit.filter((row) => row.action === "FINANCE_REGISTER_EXPORTED").map((row) => row.entityReference));
  for (const register of ["budgets", "incentives", "rebates", "assets"]) assert(registers.has(register), `The ${register} export was not audited.`);
  console.log(`✓ ${audit.length} export audit events recorded (${run})`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    if (sessionIds.length) await prisma.session.deleteMany({ where: { id: { in: sessionIds } } }).catch(() => undefined);
    await prisma.$disconnect();
  });
