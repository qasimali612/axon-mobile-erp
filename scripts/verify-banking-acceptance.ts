import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.OPERATIONS_TEST_BASE_URL || "http://127.0.0.1:3000";
const run = Date.now().toString(36).toUpperCase();
const sessionIds: string[] = [];
const bankAccountIds: string[] = [];
const statementIds: string[] = [];
type Session = { cookie: string; userAgent: string };
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const day = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function login(email: string, companyId: string, branchId: string, warehouseId: string): Promise<Session> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(32).toString("base64url");
  const userAgent = `Axon-Banking-Acceptance/${run}/${email}`;
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

async function postJournal(sessions: { accountant: Session; controller: Session; poster: Session }, branchId: string, line: { accountId: string; debit: string; credit: string; description: string }, bankAccountId: string, counterpartyAccountId: string, narration: string, reference: string, postingDate: string) {
  const created = await request(sessions.accountant, "/api/finance/journals", {
    method: "POST",
    expected: 201,
    body: {
      branchId,
      postingDate,
      voucherType: "GENERAL",
      cashFlowActivity: "OPERATING",
      narration,
      referenceDocument: reference,
      idempotencyKey: `BANK-${run}-${reference}`,
      lines: [
        { accountId: line.accountId, bankAccountId, description: line.description, debit: line.debit, credit: line.credit },
        { accountId: counterpartyAccountId, description: narration, debit: line.credit, credit: line.debit },
      ],
    },
  });
  await request(sessions.accountant, `/api/finance/journals/${created.data.id}/submit`, { method: "POST" });
  await request(sessions.controller, `/api/finance/journals/${created.data.id}/approve`, { method: "POST" });
  await request(sessions.poster, `/api/finance/journals/${created.data.id}/post`, { method: "POST" });
  return created.data.id as string;
}

async function main() {
  const company = await prisma.company.findUniqueOrThrow({ where: { code: "AXON" } });
  const branch = await prisma.branch.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "HZR" } } });
  const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "HZR-MAIN" } } });
  const accountant = await login("accountant@axonmobile.local", company.id, branch.id, warehouse.id);
  const controller = await login("controller@axonmobile.local", company.id, branch.id, warehouse.id);
  const poster = await login("poster@axonmobile.local", company.id, branch.id, warehouse.id);
  const buyer = await login("buyer@axonmobile.local", company.id, branch.id, warehouse.id);

  // Each run owns a fresh asset ledger account so the one-account-per-ledger rule is exercised without
  // stealing a shared account from other acceptance suites.
  const ledgerAccount = await request(accountant, "/api/finance/accounts", {
    method: "POST",
    expected: 201,
    body: { code: `19${run.slice(-5)}`, name: `Acceptance Bank Ledger ${run}`, accountClass: "ASSET", subclass: "Current assets", accountType: "BANK", normalBalance: "DEBIT", reconciliationRequired: true, allowManualJournal: true, cashFlowActivity: "OPERATING" },
  });
  const freeAsset = await prisma.account.findUniqueOrThrow({ where: { id: ledgerAccount.data.id } });
  const equity = await prisma.account.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "3000" } } });
  const expense = await prisma.account.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "6000" } } });

  const accountBody = { branchId: branch.id, code: `BA-${run}`, bankName: `Acceptance Bank ${run}`, accountTitle: `Acceptance Operating ${run}`, glAccountId: freeAsset.id, iban: `PK00AXON${run}`, accountNumberLast4: "4242", bankBranchName: "Hazro Main", currencyCode: "PKR", isActive: true };
  await request(buyer, "/api/finance/bank-accounts", { method: "POST", body: accountBody, expected: 403 });
  await request(buyer, "/api/finance/bank-statements", { method: "POST", body: { bankAccountId: freeAsset.id, periodStart: day(-2), periodEnd: day(2), openingBalance: "0", closingBalance: "1", lines: [{ transactionDate: day(-1), description: "Denied", deposit: "1", withdrawal: "0" }] }, expected: 403 });
  console.log("✓ banking mutations reject a user without treasury permissions");

  await request(accountant, "/api/finance/bank-accounts", { method: "POST", body: { ...accountBody, glAccountId: equity.id }, expected: 422 });
  const bankAccount = await request(accountant, "/api/finance/bank-accounts", { method: "POST", body: accountBody, expected: 201 });
  bankAccountIds.push(bankAccount.data.id);
  const reuse = await request(accountant, "/api/finance/bank-accounts", { method: "POST", body: { ...accountBody, code: `BA2-${run}` }, expected: 409 });
  assert(/already linked|ledger/i.test(JSON.stringify(reuse)), "Duplicate ledger linkage was not explained.");
  console.log("✓ bank account creation, asset-account validation, and one-account-per-ledger rule passed");

  const depositDate = day(-1);
  const withdrawalDate = day(0);
  await postJournal({ accountant, controller, poster }, branch.id, { accountId: freeAsset.id, debit: "5000.0000", credit: "0", description: `Acceptance capital injection ${run}` }, bankAccount.data.id, equity.id, `Acceptance capital injection ${run}`, `DEP-${run}`, depositDate);
  await postJournal({ accountant, controller, poster }, branch.id, { accountId: freeAsset.id, debit: "0", credit: "1500.0000", description: `Acceptance expense payment ${run}` }, bankAccount.data.id, expense.id, `Acceptance expense payment ${run}`, `WDR-${run}`, withdrawalDate);
  const transactions = await prisma.bankTransaction.findMany({ where: { bankAccountId: bankAccount.data.id }, orderBy: { transactionDate: "asc" } });
  assert(transactions.length === 2, `Expected 2 posted bank transactions, found ${transactions.length}.`);
  console.log("✓ posted journals produced ledger-derived bank transactions (no separate booking path)");

  const statementBody = {
    bankAccountId: bankAccount.data.id,
    statementNumber: `ST-${run}`,
    periodStart: day(-2),
    periodEnd: day(1),
    openingBalance: "0.0000",
    closingBalance: "3500.0000",
    lines: [
      { transactionDate: depositDate, reference: `DEP-${run}`, description: `Transfer in ${run}`, deposit: "5000.0000", withdrawal: "0" },
      { transactionDate: withdrawalDate, reference: `WDR-${run}`, description: `Transfer out ${run}`, deposit: "0", withdrawal: "1500.0000" },
    ],
  };
  await request(accountant, "/api/finance/bank-statements", { method: "POST", body: { ...statementBody, closingBalance: "9999.0000" }, expected: 422 });
  await request(accountant, "/api/finance/bank-statements", { method: "POST", body: { ...statementBody, lines: [{ transactionDate: day(-9), description: "Outside period", deposit: "10.0000", withdrawal: "0" }], openingBalance: "0", closingBalance: "10.0000" }, expected: 422 });
  const statement = await request(accountant, "/api/finance/bank-statements", { method: "POST", body: statementBody, expected: 201 });
  statementIds.push(statement.data.id);
  await request(accountant, "/api/finance/bank-statements", { method: "POST", body: { ...statementBody, statementNumber: `ST2-${run}` }, expected: 409 });
  console.log("✓ statement balance, period containment, and overlapping-period controls passed");

  const autoMatched = await request(accountant, `/api/finance/bank-statements/${statement.data.id}/auto-match`, { method: "POST" });
  assert(autoMatched.data.matched === 2, `Auto-match matched ${autoMatched.data.matched} lines, expected 2.`);
  const reconciledTransactions = await prisma.bankTransaction.count({ where: { bankAccountId: bankAccount.data.id, reconciliationStatus: "RECONCILED" } });
  assert(reconciledTransactions === 2, `Expected 2 reconciled transactions, found ${reconciledTransactions}.`);
  console.log("✓ auto-match linked both statement lines to posted ledger transactions");

  const detail = await request(accountant, `/api/finance/bank-statements/${statement.data.id}`);
  assert(detail.data.lines.every((line: Row) => line.isMatched), "Statement detail reported unmatched lines after auto-match.");

  const prepared = await request(accountant, `/api/finance/bank-statements/${statement.data.id}/reconciliation`, { method: "POST" });
  assert(prepared.data.unmatchedLines === 0, "Reconciliation reported unmatched lines.");
  assert(Number(prepared.data.bookBalance) === 3500, `Book balance was ${prepared.data.bookBalance}, expected 3500.`);
  assert(Number(prepared.data.adjustedBalance) === 3500, `Adjusted balance was ${prepared.data.adjustedBalance}, expected 3500.`);
  await request(accountant, `/api/finance/bank-reconciliations/${prepared.data.id}/complete`, { method: "POST", expected: 403 });
  const completed = await request(controller, `/api/finance/bank-reconciliations/${prepared.data.id}/complete`, { method: "POST" });
  assert(completed.data.status === "COMPLETED", "Reconciliation was not completed.");
  console.log("✓ prepared reconciliation balanced and a separate approver completed it");

  const lockedMatch = await request(accountant, `/api/finance/bank-statements/${statement.data.id}/match`, { method: "POST", body: { lineId: detail.data.lines[0].id, bankTransactionId: null }, expected: 409 });
  assert(/reopen/i.test(JSON.stringify(lockedMatch)), "Completed reconciliation did not block match changes.");
  console.log("✓ completed reconciliations lock statement matches");

  await request(accountant, `/api/finance/bank-reconciliations/${prepared.data.id}/reopen`, { method: "POST", body: { reason: "short" }, expected: 403 });
  await request(controller, `/api/finance/bank-reconciliations/${prepared.data.id}/reopen`, { method: "POST", body: { reason: "short" }, expected: 422 });
  const reopened = await request(controller, `/api/finance/bank-reconciliations/${prepared.data.id}/reopen`, { method: "POST", body: { reason: `Acceptance reopen ${run} to re-verify controls` } });
  assert(reopened.data.status === "REOPENED", "Reconciliation was not reopened.");

  const withdrawalLine = detail.data.lines.find((line: Row) => Number(line.withdrawal) > 0);
  assert(withdrawalLine, "The withdrawal statement line was not found.");
  await request(accountant, `/api/finance/bank-statements/${statement.data.id}/match`, { method: "POST", body: { lineId: withdrawalLine.id, bankTransactionId: null } });
  const unbalanced = await request(accountant, `/api/finance/bank-statements/${statement.data.id}/reconciliation`, { method: "POST" });
  assert(Number(unbalanced.data.difference) !== 0, "Un-matching a line did not create a reconciliation difference.");
  const blocked = await request(controller, `/api/finance/bank-reconciliations/${unbalanced.data.id}/complete`, { method: "POST", expected: 409 });
  assert(/matched|balance/i.test(JSON.stringify(blocked)), "Out-of-balance or unmatched completion was not rejected.");

  const candidate = await prisma.bankTransaction.findFirst({ where: { bankAccountId: bankAccount.data.id, withdrawal: { gt: 0 } } });
  assert(candidate, "The withdrawal bank transaction was not found for re-matching.");
  await request(accountant, `/api/finance/bank-statements/${statement.data.id}/match`, { method: "POST", body: { lineId: withdrawalLine.id, bankTransactionId: candidate.id } });
  const rebalanced = await request(accountant, `/api/finance/bank-statements/${statement.data.id}/reconciliation`, { method: "POST" });
  assert(Number(rebalanced.data.difference) === 0, "Re-matching did not restore a zero difference.");
  const recompleted = await request(controller, `/api/finance/bank-reconciliations/${rebalanced.data.id}/complete`, { method: "POST" });
  assert(recompleted.data.status === "COMPLETED", "Reconciliation could not be completed after rematching.");
  console.log("✓ reopening requires an approver and a reason; unmatched lines and differences block completion");

  await postJournal({ accountant, controller, poster }, branch.id, { accountId: freeAsset.id, debit: "75.0000", credit: "0", description: `Acceptance post-reconciliation deposit ${run}` }, bankAccount.data.id, equity.id, `Acceptance post-reconciliation deposit ${run}`, `DEP2-${run}`, day(2));
  const blockedDeactivation = await request(accountant, `/api/finance/bank-accounts/${bankAccount.data.id}`, { method: "PATCH", body: { ...accountBody, isActive: false }, expected: 409 });
  assert(/unreconciled/i.test(JSON.stringify(blockedDeactivation)), "Unreconciled activity did not block bank account deactivation.");
  console.log("✓ a bank account cannot be retired while unreconciled ledger activity remains");

  const audit = await prisma.auditLog.findMany({ where: { companyId: company.id, entityId: { in: [statement.data.id, prepared.data.id, ...bankAccountIds] } }, select: { action: true } });
  const actions = new Set(audit.map((row) => row.action));
  for (const action of ["BANK_ACCOUNT_CREATED", "BANK_STATEMENT_CREATED", "BANK_STATEMENT_AUTO_MATCHED", "BANK_RECONCILIATION_PREPARED", "BANK_RECONCILIATION_COMPLETED", "BANK_RECONCILIATION_REOPENED"]) {
    assert(actions.has(action), `Missing banking audit event ${action}.`);
  }
  const page = await request(accountant, "/finance/banking");
  const pageText = String(typeof page === "string" ? page : (page as Row).raw ?? JSON.stringify(page));
  assert(/Banking and reconciliation|Bank accounts/i.test(pageText), `Banking workspace did not render: ${pageText.slice(0, 200)}`);
  console.log(`✓ audit evidence and authenticated banking workspace rendered (${run})`);

  const finalStatement = await prisma.bankStatement.findUniqueOrThrow({ where: { id: statement.data.id }, include: { reconciliation: true } });
  console.log(`· retained banking evidence: bank account ${accountBody.code}, statement ${statementBody.statementNumber}, reconciliation ${finalStatement.reconciliation?.status}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (sessionIds.length) await prisma.session.deleteMany({ where: { id: { in: sessionIds } } }).catch(() => undefined);
  await prisma.$disconnect();
});
