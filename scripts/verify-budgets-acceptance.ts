import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.OPERATIONS_TEST_BASE_URL || "http://127.0.0.1:3000";
const run = Date.now().toString(36).toUpperCase();
const sessionIds: string[] = [];
type Session = { cookie: string; userAgent: string };
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const day = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const money = (value: unknown) => Number(value);

async function login(email: string, companyId: string, branchId: string, warehouseId: string): Promise<Session> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(32).toString("base64url");
  const userAgent = `Axon-Budget-Acceptance/${run}/${email}`;
  const row = await prisma.session.create({ data: { tokenHash: createHash("sha256").update(token).digest("hex"), userId: user.id, activeCompanyId: companyId, activeBranchId: branchId, activeWarehouseId: warehouseId, ipAddress: "127.0.0.1", userAgent, expiresAt: new Date(Date.now() + 3_600_000) } });
  sessionIds.push(row.id);
  return { cookie: `axon_session=${token}`, userAgent };
}

async function request(session: Session, path: string, options: { method?: string; body?: unknown; expected?: number | number[] } = {}): Promise<Row> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: { Cookie: session.cookie, Origin: baseUrl, "User-Agent": session.userAgent, ...(options.body === undefined ? {} : { "content-type": "application/json" }) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const body = text && response.headers.get("content-type")?.includes("json") ? JSON.parse(text) : { raw: text };
  const expected = Array.isArray(options.expected ?? 200) ? options.expected as number[] : [options.expected ?? 200];
  if (!expected.includes(response.status)) throw new Error(`${options.method || "GET"} ${path}: expected ${expected.join("/")}, got ${response.status}: ${text}`);
  return body;
}

async function postJournal(session: Session, reviewer: Session, poster: Session, body: { branchId: string; postingDate: string; lines: Array<{ accountId: string; debit: string; credit: string; description: string }>; narration: string; reference: string }) {
  const created = await request(session, "/api/finance/journals", {
    method: "POST",
    expected: 201,
    body: { branchId: body.branchId, postingDate: body.postingDate, voucherType: "GENERAL", cashFlowActivity: "OPERATING", narration: body.narration, referenceDocument: body.reference, idempotencyKey: `BUDGET-${run}-${body.reference}`, lines: body.lines },
  });
  await request(session, `/api/finance/journals/${created.data.id}/submit`, { method: "POST" });
  await request(reviewer, `/api/finance/journals/${created.data.id}/approve`, { method: "POST" });
  await request(poster, `/api/finance/journals/${created.data.id}/post`, { method: "POST" });
  return created.data.id as string;
}

async function main() {
  const startedAt = new Date();
  const company = await prisma.company.findUniqueOrThrow({ where: { code: "AXON" } });
  const branch = await prisma.branch.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "HZR" } } });
  const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "HZR-MAIN" } } });
  const accountant = await login("accountant@axonmobile.local", company.id, branch.id, warehouse.id);
  const controller = await login("controller@axonmobile.local", company.id, branch.id, warehouse.id);
  const poster = await login("poster@axonmobile.local", company.id, branch.id, warehouse.id);
  const buyer = await login("buyer@axonmobile.local", company.id, branch.id, warehouse.id);

  const today = new Date(`${day()}T00:00:00.000Z`);
  const fiscalYear = await prisma.fiscalYear.findFirstOrThrow({ where: { companyId: company.id, startDate: { lte: today }, endDate: { gte: today } } });
  const currentPeriod = await prisma.accountingPeriod.findFirstOrThrow({ where: { companyId: company.id, fiscalYearId: fiscalYear.id, status: "OPEN", startDate: { lte: today }, endDate: { gte: today } }, orderBy: { number: "asc" } });
  const secondPeriod = await prisma.accountingPeriod.findFirstOrThrow({ where: { companyId: company.id, fiscalYearId: fiscalYear.id, status: "OPEN", id: { not: currentPeriod.id } }, orderBy: { number: "asc" } });
  const periods = [currentPeriod, secondPeriod];
  const foreignPeriodId = (await prisma.accountingPeriod.findFirst({ where: { companyId: company.id, fiscalYearId: { not: fiscalYear.id } }, select: { id: true } }))?.id ?? randomUUID();
  // Each run owns dedicated expense accounts so the variance figures are isolated from other suites.
  const expenseAccount = await request(accountant, "/api/finance/accounts", {
    method: "POST",
    expected: 201,
    body: { code: `69${run.slice(-5)}A`, name: `Acceptance Budget Expense ${run}`, accountClass: "EXPENSE", subclass: "Operating expenses", accountType: "EXPENSE", normalBalance: "DEBIT", reconciliationRequired: false, allowManualJournal: true, cashFlowActivity: "OPERATING" },
  });
  const secondAccount = await request(accountant, "/api/finance/accounts", {
    method: "POST",
    expected: 201,
    body: { code: `69${run.slice(-5)}B`, name: `Acceptance Budget Loss ${run}`, accountClass: "EXPENSE", subclass: "Operating expenses", accountType: "EXPENSE", normalBalance: "DEBIT", reconciliationRequired: false, allowManualJournal: true, cashFlowActivity: "OPERATING" },
  });
  const expense = { id: expenseAccount.data.id as string };
  const secondExpense = { id: secondAccount.data.id as string };
  const cash = await prisma.account.findFirst({ where: { companyId: company.id, code: "1000", allowManualJournal: true } })
    ?? await prisma.account.findFirstOrThrow({ where: { companyId: company.id, accountClass: "ASSET", allowManualJournal: true } });

  const code = `BUD-${run}`;
  const body = (overrides: Row = {}) => ({
    code,
    name: `Acceptance operating budget ${run}`,
    fiscalYearId: fiscalYear.id,
    branchId: branch.id,
    departmentId: null,
    costCenterId: null,
    lines: [
      { accountId: expense.id, periodId: periods[0].id, amount: "10000.0000", notes: "Operating expenses" },
      { accountId: expense.id, periodId: periods[1].id, amount: "12000.0000", notes: "Operating expenses" },
      { accountId: secondExpense.id, periodId: periods[0].id, amount: "3000.0000", notes: "Inventory losses" },
    ],
    ...overrides,
  });

  // 1 · permissions -----------------------------------------------------------
  await request(buyer, "/api/finance/budgets", { method: "POST", body: body(), expected: 403 });
  await request(accountant, `/api/finance/budgets/${company.id}/approve`, { method: "POST", expected: 403 });
  console.log("✓ budget preparation and approval are permission-gated");

  // 2 · draft validation ------------------------------------------------------
  const crossYear = await request(accountant, "/api/finance/budgets", { method: "POST", body: body({ lines: [{ accountId: expense.id, periodId: foreignPeriodId, amount: "1000.0000", notes: null }] }), expected: 422 });
  assert(/fiscal year|period/i.test(JSON.stringify(crossYear)), "A period outside the fiscal year was accepted.");
  const duplicateLine = await request(accountant, "/api/finance/budgets", { method: "POST", body: body({ lines: [{ accountId: expense.id, periodId: periods[0].id, amount: "1.0000", notes: null }, { accountId: expense.id, periodId: periods[0].id, amount: "2.0000", notes: null }] }), expected: 422 });
  assert(/once per period/i.test(JSON.stringify(duplicateLine)), "A duplicated account/period line was accepted.");
  const negative = await request(accountant, "/api/finance/budgets", { method: "POST", body: body({ lines: [{ accountId: expense.id, periodId: periods[0].id, amount: "-5", notes: null }] }), expected: 422 });
  assert(/non-negative/i.test(JSON.stringify(negative)), "A negative budget amount was accepted.");
  console.log("✓ draft lines reject foreign periods, duplicate account/period pairs, and negative amounts");

  // 3 · draft creation and editing -------------------------------------------
  const created = await request(accountant, "/api/finance/budgets", { method: "POST", body: body(), expected: 201 });
  assert(created.data.status === "DRAFT" && created.data.version === 1, "The first budget version was not created as draft v1.");
  assert(money(created.data.lines.reduce((sum: number, line: Row) => sum + Number(line.amount), 0)) === 25000, "The draft total did not match its lines.");
  const edited = await request(accountant, `/api/finance/budgets/${created.data.id}`, { method: "PATCH", body: body({ lines: [{ accountId: expense.id, periodId: periods[0].id, amount: "9000.0000", notes: "Revised" }] }) });
  assert(edited.data.lines.length === 1 && money(edited.data.lines[0].amount) === 9000, "Draft line replacement did not persist.");
  const restored = await request(accountant, `/api/finance/budgets/${created.data.id}`, { method: "PATCH", body: body() });
  assert(restored.data.lines.length === 3, "Restoring the draft lines failed.");
  console.log("✓ drafts are editable and line replacement recomputes the version total");

  // 4 · submission and state control -----------------------------------------
  await request(accountant, `/api/finance/budgets/${created.data.id}/submit`, { method: "POST" });
  const editedAfterSubmit = await request(accountant, `/api/finance/budgets/${created.data.id}`, { method: "PATCH", body: body(), expected: 409 });
  assert(/draft/i.test(JSON.stringify(editedAfterSubmit)), "A submitted budget was still editable.");
  await request(accountant, `/api/finance/budgets/${created.data.id}/submit`, { method: "POST", expected: 409 });
  console.log("✓ submission locks the version against further editing");

  // 5 · independent approval -------------------------------------------------
  await request(accountant, `/api/finance/budgets/${created.data.id}/approve`, { method: "POST", expected: 403 });
  const preparer = await prisma.user.findUniqueOrThrow({ where: { email: "accountant@axonmobile.local" } });
  const owner = await login("owner@axonmobile.local", company.id, branch.id, warehouse.id);
  const ownerDraft = await request(owner, "/api/finance/budgets", { method: "POST", body: body({ code: `${code}-OWN` }), expected: 201 });
  await request(owner, `/api/finance/budgets/${ownerDraft.data.id}/submit`, { method: "POST" });
  const selfApproval = await request(owner, `/api/finance/budgets/${ownerDraft.data.id}/approve`, { method: "POST", expected: 409 });
  assert(/independent|prepared/i.test(JSON.stringify(selfApproval)), "A budget preparer was allowed to approve their own version.");
  const approved = await request(controller, `/api/finance/budgets/${created.data.id}/approve`, { method: "POST" });
  assert(approved.data.status === "APPROVED" && approved.data.approvedById, "The budget was not approved with approver metadata.");
  console.log(`✓ an independent approver approved version 1 (prepared by ${preparer.fullName}) and self-approval is rejected`);

  // A duplicate draft approval attempt must not be possible.
  await request(controller, `/api/finance/budgets/${created.data.id}/approve`, { method: "POST", expected: 409 });

  // 6 · variance against posted actuals -------------------------------------
  await postJournal(accountant, controller, poster, {
    branchId: branch.id,
    postingDate: day(),
    narration: `Acceptance operating expense ${run}`,
    reference: `BUD-EXP-${run}`,
    lines: [
      { accountId: expense.id, debit: "4000.0000", credit: "0", description: "Operating expense" },
      { accountId: cash.id, debit: "0", credit: "4000.0000", description: "Cash settlement" },
    ],
  });
  const variance = await request(accountant, `/api/finance/budgets/${created.data.id}/variance`);
  assert(variance.data.rows.length === 3, `Variance returned ${variance.data.rows.length} rows, expected 3.`);
  const postedPeriodId = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: company.id, referenceDocument: `BUD-EXP-${run}` }, select: { periodId: true } }).then((row) => row.periodId);
  assert(postedPeriodId === currentPeriod.id, "The acceptance journal did not land in the budgeted current period.");
  const actualRow = variance.data.rows.find((row: Row) => row.accountId === expense.id && row.periodId === currentPeriod.id);
  assert(actualRow, "The posted expense did not appear in the variance rows.");
  assert(money(actualRow.actual) === 4000, `Actual for the posted expense was ${actualRow.actual}, expected 4000.`);
  assert(money(actualRow.variance) === Number(actualRow.budget) - 4000, "Variance was not budget minus actual.");
  const untouchedRow = variance.data.rows.find((row: Row) => row.accountId === secondExpense.id);
  assert(untouchedRow && money(untouchedRow.actual) === 0 && money(untouchedRow.variance) === 3000, "An unbudgeted-with-no-actuals line produced an unexpected variance.");
  assert(money(variance.data.totals.budget) === 25000, `Variance budget total was ${variance.data.totals.budget}, expected 25000.`);
  assert(money(variance.data.totals.actual) === 4000, `Variance actual total was ${variance.data.totals.actual}, expected 4000.`);
  console.log("✓ variance compares approved budget with posted actuals for the same branch and period");

  // 7 · revision supersedes the approval ------------------------------------
  const revision = await request(accountant, `/api/finance/budgets/${created.data.id}/revise`, { method: "POST" });
  assert(revision.data.version === 2 && revision.data.status === "DRAFT", "Revision did not create draft version 2.");
  assert(revision.data.lines.length === 3, "The revision did not copy the previous lines.");
  await request(accountant, `/api/finance/budgets/${revision.data.id}`, { method: "PATCH", body: body({ lines: [{ accountId: expense.id, periodId: periods[0].id, amount: "15000.0000", notes: "Revised budget" }] }) });
  await request(accountant, `/api/finance/budgets/${revision.data.id}/submit`, { method: "POST" });
  await request(controller, `/api/finance/budgets/${revision.data.id}/approve`, { method: "POST" });
  const superseded = await prisma.budget.findUniqueOrThrow({ where: { id: created.data.id } });
  assert(superseded.status === "REVISED", `Version 1 status was ${superseded.status} after the revision was approved.`);
  const liveApproved = await prisma.budget.count({ where: { companyId: company.id, code, status: "APPROVED" } });
  assert(liveApproved === 1, `${liveApproved} approved versions exist for ${code}, expected exactly one.`);
  console.log("✓ approving a revision supersedes the previous approval so only one version stays live");

  // 8 · close and immutability ----------------------------------------------
  await request(accountant, `/api/finance/budgets/${revision.data.id}/close`, { method: "POST", expected: 403 });
  const closed = await request(controller, `/api/finance/budgets/${revision.data.id}/close`, { method: "POST" });
  assert(closed.data.status === "CLOSED", "The approved version was not closed.");
  await request(accountant, `/api/finance/budgets/${revision.data.id}`, { method: "PATCH", body: body(), expected: 409 });
  await request(accountant, `/api/finance/budgets/${revision.data.id}/submit`, { method: "POST", expected: 409 });
  const thirdVersion = await request(accountant, `/api/finance/budgets/${revision.data.id}/revise`, { method: "POST" });
  assert(thirdVersion.data.version === 3, "A closed version could not seed the next draft revision.");
  console.log("✓ closed versions are immutable and can still seed a new draft version");

  // 9 · audit and workspace --------------------------------------------------
  const audit = await prisma.auditLog.findMany({ where: { companyId: company.id, createdAt: { gte: startedAt }, entityId: { in: [created.data.id, revision.data.id, thirdVersion.data.id] } }, select: { action: true } });
  const actions = new Set(audit.map((row) => row.action));
  for (const action of ["BUDGET_DRAFT_CREATED", "BUDGET_DRAFT_UPDATED", "BUDGET_SUBMITTED", "BUDGET_APPROVED", "BUDGET_CLOSED", "BUDGET_VERSION_CREATED"]) {
    assert(actions.has(action), `Missing budget audit event ${action}.`);
  }
  const page = await request(accountant, "/finance/budgets");
  const pageText = String(typeof page === "string" ? page : (page as Row).raw ?? JSON.stringify(page));
  assert(/Budgets|Budget lines|Variance/i.test(pageText), `Budget workspace did not render: ${pageText.slice(0, 200)}`);
  const list = await request(accountant, "/api/finance/budgets");
  assert(list.data.some((budget: Row) => budget.id === thirdVersion.data.id), "The budget register did not return the acceptance versions.");
  console.log(`✓ audit evidence and authenticated budget workspace rendered (${run})`);

  const finalRows = await prisma.budget.findMany({ where: { companyId: company.id, code }, orderBy: { version: "asc" }, select: { version: true, status: true } });
  console.log(`· retained budget evidence: ${finalRows.map((row) => `v${row.version}=${row.status}`).join(", ")}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (sessionIds.length) await prisma.session.deleteMany({ where: { id: { in: sessionIds } } }).catch(() => undefined);
  await prisma.$disconnect();
});
