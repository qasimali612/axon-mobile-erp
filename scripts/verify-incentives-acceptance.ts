/**
 * Incentives acceptance: plans → calculation from posted sales → independent approval →
 * accrual journal → payable → payment/reversal, plus supplier incentive accrual and receipt.
 *
 * Posted sales invoices and a posted sales return are written directly as fixtures because the
 * incentive engine's only input is posted sales history; everything the module itself produces
 * (accrual journals, payables, payments, reversals, receipts) is exercised through the HTTP API.
 */
import { createHash, randomBytes } from "node:crypto";
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
  const userAgent = `Axon-Incentive-Acceptance/${run}/${email}`;
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

async function main() {
  const started = new Date();
  const company = await prisma.company.findUniqueOrThrow({ where: { code: "AXON" } });
  const branch = await prisma.branch.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "HZR" } } });
  const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "HZR-MAIN" } } });
  const accountant = await login("accountant@axonmobile.local", company.id, branch.id, warehouse.id);
  const controller = await login("controller@axonmobile.local", company.id, branch.id, warehouse.id);
  const owner = await login("owner@axonmobile.local", company.id, branch.id, warehouse.id);
  const buyer = await login("buyer@axonmobile.local", company.id, branch.id, warehouse.id);
  const accountantUser = await prisma.user.findUniqueOrThrow({ where: { email: "accountant@axonmobile.local" } });
  const controllerUser = await prisma.user.findUniqueOrThrow({ where: { email: "controller@axonmobile.local" } });

  const suffix = run.slice(-5);
  const createAccount = async (code: string, name: string, accountClass: string, accountType: string, normalBalance: string, cashFlowActivity: string) => {
    const created = await request(accountant, "/api/finance/accounts", {
      method: "POST",
      expected: 201,
      body: { code, name, accountClass, subclass: "Acceptance incentives", accountType, normalBalance, reconciliationRequired: false, allowManualJournal: true, cashFlowActivity },
    });
    return { id: created.data.id as string, code };
  };
  const expense = await createAccount(`69${suffix}I`, `Incentive expense ${run}`, "EXPENSE", "EXPENSE", "DEBIT", "OPERATING");
  const payable = await createAccount(`29${suffix}I`, `Incentive payable ${run}`, "LIABILITY", "LIABILITY", "CREDIT", "OPERATING");
  const income = await createAccount(`49${suffix}I`, `Incentive income ${run}`, "REVENUE", "REVENUE", "CREDIT", "OPERATING");
  const receivable = await createAccount(`19${suffix}I`, `Incentive receivable ${run}`, "ASSET", "ASSET", "DEBIT", "OPERATING");
  const cashAccount = await prisma.account.findFirstOrThrow({ where: { companyId: company.id, accountType: "CASH", isActive: true }, orderBy: { code: "asc" } });
  // Every run creates its own cash settlement method so the acceptance never depends on seeded masters.
  const cashMethod = (await request(accountant, "/api/catalog/payment-methods", {
    method: "POST",
    expected: 201,
    body: { code: `INC-CASH-${suffix}`, name: `Incentive cash ${run}`, methodType: "CASH", cashAccountId: cashAccount.id, bankAccountId: null, requiresReference: false, sequence: 0, isActive: true, notes: null },
  })).data;

  // ---- committed sales evidence ---------------------------------------------
  // Eligibility is read from real posted sales already committed by the operational suites, so the
  // expectation below is recomputed independently from the database and compared with the API.
  const periodStart = day(-60);
  const periodEnd = day(0);
  const range = { gte: new Date(`${periodStart}T00:00:00.000Z`), lte: new Date(`${periodEnd}T00:00:00.000Z`) };
  const invoices = await prisma.salesInvoice.findMany({
    where: { companyId: company.id, status: "POSTED", invoiceDate: range, branchId: branch.id, salespersonId: { not: null } },
    select: { id: true, salespersonId: true, subtotal: true, discountTotal: true, lines: { select: { quantity: true } } },
  });
  const returns = await prisma.stockReturn.findMany({
    where: { companyId: company.id, status: "POSTED", returnType: "SALES_RETURN", returnDate: range, branchId: branch.id },
    select: { salesInvoiceId: true, subtotal: true, discountTotal: true, lines: { select: { quantity: true } } },
  });
  const salespersonByInvoice = new Map(invoices.map((invoice) => [invoice.id, invoice.salespersonId as string]));
  const expected = new Map<string, { net: number; quantity: number }>();
  const bump = (salespersonId: string, net: number, quantity: number) => {
    const bucket = expected.get(salespersonId) ?? { net: 0, quantity: 0 };
    bucket.net = Math.round((bucket.net + net) * 10_000) / 10_000;
    bucket.quantity = Math.round((bucket.quantity + quantity) * 10_000) / 10_000;
    expected.set(salespersonId, bucket);
  };
  for (const invoice of invoices) {
    const net = Number(invoice.subtotal) - Number(invoice.discountTotal);
    if (net <= 0) continue;
    bump(invoice.salespersonId as string, net, invoice.lines.reduce((sum, line) => sum + Number(line.quantity), 0));
  }
  for (const row of returns) {
    const salespersonId = row.salesInvoiceId ? salespersonByInvoice.get(row.salesInvoiceId) : null;
    if (!salespersonId) continue;
    bump(salespersonId, -(Number(row.subtotal) - Number(row.discountTotal)), -row.lines.reduce((sum, line) => sum + Number(line.quantity), 0));
  }
  const expectedBuckets = [...expected.entries()].filter(([, bucket]) => bucket.net > 0 || bucket.quantity > 0);
  assert(expectedBuckets.length > 0, "The acceptance run needs posted sales with a salesperson in the last 60 days for the HZR branch.");

  const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

  const planBody = (code: string, incentiveType: string, extra: Row = {}) => ({
    code, name: `Acceptance ${code}`, effectiveFrom: day(-300), effectiveTo: day(200), recipientType: "USER", branchId: branch.id,
    incentiveType, rate: null, fixedAmount: null, minimumTarget: "0", maximumIncentive: null, returnAdjustmentRule: "REVERSE",
    approvalRequired: true, expenseAccountId: expense.id, payableAccountId: payable.id, isActive: true, ...extra,
  });

  // 1 · permission gating ------------------------------------------------------
  await request(buyer, "/api/finance/incentives/plans", { method: "POST", body: planBody(`PERM-${run}`, "PERCENT_NET_SALES", { rate: "2" }), expected: 403 });
  await request(buyer, "/api/finance/incentives", { expected: 403 });
  console.log("✓ plan management and the incentive workspace are permission gated");

  // 2 · plan validation --------------------------------------------------------
  await request(accountant, "/api/finance/incentives/plans", { method: "POST", body: planBody(`BAD1-${run}`, "PERCENT_NET_SALES", { rate: "120" }), expected: 422 });
  await request(accountant, "/api/finance/incentives/plans", { method: "POST", body: planBody(`BAD2-${run}`, "PERCENT_NET_SALES"), expected: 422 });
  await request(accountant, "/api/finance/incentives/plans", { method: "POST", body: planBody(`BAD3-${run}`, "FIXED_PER_UNIT"), expected: 422 });
  const wrongClass = await request(accountant, "/api/finance/incentives/plans", { method: "POST", body: planBody(`BAD4-${run}`, "PERCENT_NET_SALES", { rate: "2", expenseAccountId: income.id }), expected: 422 });
  assert(/invalid_account_class|account/i.test(JSON.stringify(wrongClass)), "A revenue account was accepted as the incentive expense account.");
  await request(accountant, "/api/finance/incentives/plans", { method: "POST", body: { ...planBody(`BAD5-${run}`, "PERCENT_NET_SALES", { rate: "2" }), effectiveTo: day(-400) }, expected: 422 });
  console.log("✓ plan validation rejects invalid rates, missing amounts, wrong account classes and inverted dates");

  // 3 · plan register ----------------------------------------------------------
  const percentPlan = await request(accountant, "/api/finance/incentives/plans", { method: "POST", expected: 201, body: planBody(`PCT-${run}`, "PERCENT_NET_SALES", { rate: "2" }) });
  const unitPlan = await request(accountant, "/api/finance/incentives/plans", { method: "POST", expected: 201, body: planBody(`UNIT-${run}`, "FIXED_PER_UNIT", { fixedAmount: "300", minimumTarget: "2" }) });
  const targetPlan = await request(accountant, "/api/finance/incentives/plans", { method: "POST", expected: 201, body: planBody(`TGT-${run}`, "SALES_TARGET", { rate: "5", minimumTarget: "100000" }) });
  await request(accountant, "/api/finance/incentives/plans", { method: "POST", body: planBody(`PCT-${run}`, "PERCENT_NET_SALES", { rate: "2" }), expected: 409 });
  const renamed = await request(accountant, `/api/finance/incentives/plans/${percentPlan.data.id}`, { method: "PATCH", body: { ...planBody(`PCT-${run}`, "PERCENT_NET_SALES", { rate: "2" }), name: `Acceptance ${run} percentage` } });
  assert(renamed.data.name.endsWith("percentage"), "The plan was not updated.");
  console.log("✓ plans are created, duplicate codes rejected and edits persisted");

  // 4 · calculation from posted sales -----------------------------------------
  const calculated = await request(accountant, `/api/finance/incentives/plans/${percentPlan.data.id}/calculate`, { method: "POST", body: { periodStart, periodEnd } });
  assert(calculated.data.created === expectedBuckets.length, `Expected ${expectedBuckets.length} calculations, got ${calculated.data.created}.`);
  for (const row of calculated.data.rows) {
    const bucket = expected.get(row.recipientUserId);
    assert(bucket, "A calculation was produced for a salesperson with no posted sales.");
    assert(round4(money(row.eligibleNetSales)) === round4(bucket.net), `Net sales were ${row.eligibleNetSales}, expected ${bucket.net}.`);
    assert(round4(money(row.eligibleQuantity)) === round4(bucket.quantity), `Quantity was ${row.eligibleQuantity}, expected ${bucket.quantity}.`);
    assert(round4(money(row.calculatedAmount)) === round4(bucket.net * 0.02), `Percentage incentive was ${row.calculatedAmount}, expected ${round4(bucket.net * 0.02)}.`);
    assert(row.status === "CALCULATED" && row.calculatedById === accountantUser.id, "The calculation did not record its maker.");
  }
  const percentRow = [...calculated.data.rows].sort((left: Row, right: Row) => money(right.calculatedAmount) - money(left.calculatedAmount))[0];
  assert(money(percentRow.calculatedAmount) > 0, "The largest percentage incentive must be positive for the payment test.");
  const repeat = await request(accountant, `/api/finance/incentives/plans/${percentPlan.data.id}/calculate`, { method: "POST", body: { periodStart, periodEnd } });
  assert(repeat.data.created === 0 && repeat.data.skipped === expectedBuckets.length, "Re-running the same period duplicated the incentive.");
  await request(accountant, `/api/finance/incentives/plans/${percentPlan.data.id}/calculate`, { method: "POST", body: { periodStart: day(-400), periodEnd: day(-390) }, expected: 422 });
  const unitRows = (await request(accountant, `/api/finance/incentives/plans/${unitPlan.data.id}/calculate`, { method: "POST", body: { periodStart, periodEnd } })).data.rows;
  for (const row of unitRows) {
    const bucket = expected.get(row.recipientUserId);
    if (!bucket || bucket.quantity < 2) continue;
    assert(round4(money(row.calculatedAmount)) === round4(bucket.quantity * 300), `Per-unit incentive was ${row.calculatedAmount}, expected ${round4(bucket.quantity * 300)}.`);
  }
  const targetRows = (await request(accountant, `/api/finance/incentives/plans/${targetPlan.data.id}/calculate`, { method: "POST", body: { periodStart, periodEnd } })).data.rows;
  const targetBucket = [...expectedBuckets].filter(([, bucket]) => bucket.net > 100_000).sort((left, right) => right[1].net - left[1].net)[0];
  const unitRow = unitRows.find((row: Row) => row.recipientUserId === percentRow.recipientUserId);
  assert(unitRow, "The per-unit plan did not calculate the same salesperson.");
  const targetRow = targetBucket ? targetRows.find((row: Row) => row.recipientUserId === targetBucket[0]) : undefined;
  if (targetBucket && targetRow) {
    assert(round4(money(targetRow.calculatedAmount)) === round4((targetBucket[1].net - 100_000) * 0.05), `Target incentive was ${targetRow.calculatedAmount}.`);
  }
  console.log("✓ posted sales, returns and quantities drive percentage, per-unit and above-target calculations");

  // 5 · independent approval ---------------------------------------------------
  await request(accountant, `/api/finance/incentives/calculations/${percentRow.id}/approve`, { method: "POST", expected: 403 });
  const selfApprove = await request(controller, `/api/finance/incentives/calculations/${percentRow.id}/approve`, { method: "POST" });
  assert(selfApprove.data.status === "APPROVED" && selfApprove.data.approvedById === controllerUser.id, "The incentive was not approved.");
  assert(round4(money(selfApprove.data.approvedAmount)) === round4(money(percentRow.calculatedAmount)), "Approved amount did not match the calculated amount.");
  await request(controller, `/api/finance/incentives/calculations/${percentRow.id}/approve`, { method: "POST", expected: 409 });
  const makerApproval = await request(accountant, `/api/finance/incentives/calculations/${unitRow.id}/approve`, { method: "POST", expected: 403 });
  void makerApproval;
  console.log("✓ approval requires the approval permission and an independent officer");

  // 6 · accrual ----------------------------------------------------------------
  const accrued = await request(controller, `/api/finance/incentives/calculations/${percentRow.id}/accrue`, { method: "POST", body: { postingDate: day() } });
  const approvedAmount = round4(money(percentRow.calculatedAmount));
  assert(round4(money(accrued.data.payable.outstandingAmount)) === approvedAmount, "The payable was not created with the approved amount.");
  const accrualLines = await prisma.journalEntryLine.findMany({ where: { entryId: accrued.data.journal.id } });
  assert(accrualLines.length === 2, `The accrual journal had ${accrualLines.length} lines.`);
  assert(accrualLines.some((line) => line.accountId === expense.id && round4(money(line.debit)) === approvedAmount), "The accrual did not debit the incentive expense account.");
  assert(accrualLines.some((line) => line.accountId === payable.id && round4(money(line.credit)) === approvedAmount), "The accrual did not credit the incentive payable account.");
  await request(controller, `/api/finance/incentives/calculations/${percentRow.id}/accrue`, { method: "POST", body: { postingDate: day() }, expected: 409 });
  console.log("✓ accrual posts a balanced expense-to-payable journal exactly once");

  // 7 · payment ----------------------------------------------------------------
  const firstPart = round4(approvedAmount / 2);
  await request(accountant, `/api/finance/incentives/payables/${accrued.data.payable.id}/pay`, { method: "POST", expected: 403, body: { amount: String(firstPart), paymentDate: day(), paymentMethodId: cashMethod.id } });
  const partial = await request(owner, `/api/finance/incentives/payables/${accrued.data.payable.id}/pay`, { method: "POST", body: { amount: String(firstPart), paymentDate: day(), paymentMethodId: cashMethod.id, reference: `PART-${run}` } });
  assert(partial.data.payable.status === "PARTIALLY_PAID" && round4(money(partial.data.payable.outstandingAmount)) === round4(approvedAmount - firstPart), "A partial payment did not reduce the outstanding balance.");
  await request(owner, `/api/finance/incentives/payables/${accrued.data.payable.id}/pay`, { method: "POST", body: { amount: String(approvedAmount * 2), paymentDate: day(), paymentMethodId: cashMethod.id }, expected: 422 });
  const settled = await request(owner, `/api/finance/incentives/payables/${accrued.data.payable.id}/pay`, { method: "POST", body: { amount: String(round4(approvedAmount - firstPart)), paymentDate: day(), paymentMethodId: cashMethod.id, reference: `SET-${run}` } });
  assert(settled.data.payable.status === "PAID" && money(settled.data.payable.outstandingAmount) === 0, "The final payment did not close the payable.");
  const paymentLines = await prisma.journalEntryLine.findMany({ where: { entryId: settled.data.journal.id } });
  assert(paymentLines.some((line) => line.accountId === payable.id && round4(money(line.debit)) === round4(approvedAmount - firstPart)), "The payment did not debit the incentive payable.");
  assert(paymentLines.some((line) => line.accountId === cashAccount.id && round4(money(line.credit)) === round4(approvedAmount - firstPart)), "The payment did not credit the cash account.");
  const paidCalculation = await prisma.incentiveCalculation.findUniqueOrThrow({ where: { id: percentRow.id } });
  assert(paidCalculation.status === "PAID", "The calculation status did not follow the payable to PAID.");
  console.log("✓ payments settle the payable in parts, reject overpayment and post to the settlement account");

  // 8 · adjustment and reversal -------------------------------------------------
  const adjustable = targetRow ?? unitRow;
  const adjusted = await request(accountant, `/api/finance/incentives/calculations/${adjustable.id}/adjust`, { method: "POST", body: { adjustmentAmount: "-100", reason: `Acceptance correction ${run}` } });
  assert(money(adjusted.data.adjustmentAmount) === -100, "The adjustment was not recorded.");
  const adjustableAmount = round4(money(adjustable.calculatedAmount) - 100);
  const approvedAdjusted = await request(controller, `/api/finance/incentives/calculations/${adjustable.id}/approve`, { method: "POST" });
  assert(round4(money(approvedAdjusted.data.approvedAmount)) === adjustableAmount, `Approved amount was ${approvedAdjusted.data.approvedAmount}, expected ${adjustableAmount}.`);
  const targetAccrued = await request(controller, `/api/finance/incentives/calculations/${adjustable.id}/accrue`, { method: "POST", body: { postingDate: day() } });
  const reverser = await request(controller, `/api/finance/incentives/calculations/${adjustable.id}/reverse`, { method: "POST", body: { reason: `Acceptance reversal ${run}` }, expected: 409 });
  assert(/independent/i.test(JSON.stringify(reverser)), "The accruing officer was able to reverse their own accrual.");
  const reversed = await request(owner, `/api/finance/incentives/calculations/${adjustable.id}/reverse`, { method: "POST", body: { reason: `Acceptance reversal ${run}` } });
  assert(reversed.data.calculation.status === "REVERSED", "The accrual was not reversed.");
  const reversalLines = await prisma.journalEntryLine.findMany({ where: { entryId: reversed.data.journal.id } });
  const reversalDebit = round4(reversalLines.reduce((sum, line) => sum + money(line.debit), 0));
  const reversalCredit = round4(reversalLines.reduce((sum, line) => sum + money(line.credit), 0));
  assert(reversalDebit === reversalCredit && reversalDebit === adjustableAmount, "The reversal journal was not balanced at the approved amount.");
  const reversedPayable = await prisma.incentivePayable.findUniqueOrThrow({ where: { id: targetAccrued.data.payable.id } });
  assert(reversedPayable.status === "REVERSED" && money(reversedPayable.outstandingAmount) === 0, "The payable was not cleared by the reversal.");
  console.log("✓ adjustments flow into approval and an unpaid accrual can be reversed by an independent officer");

  // 9 · supplier incentive ------------------------------------------------------
  const claim = await request(accountant, "/api/finance/incentives/received", {
    method: "POST",
    expected: 201,
    body: {
      referenceNumber: `SIC-${run}`, payerName: `Acceptance Vendor ${run}`, programName: "Quarterly volume program",
      supplierId: null, planId: null, periodStart, periodEnd, targetQuantity: "10", achievedQuantity: "12",
      eligibleAmount: "900", expectedReceiptDate: day(20), incomeAccountId: income.id, receivableAccountId: receivable.id,
    },
  });
  await request(accountant, `/api/finance/incentives/received/${claim.data.id}/approve`, { method: "POST", body: { branchId: branch.id, postingDate: day() }, expected: 403 });
  const claimApproved = await request(controller, `/api/finance/incentives/received/${claim.data.id}/approve`, { method: "POST", body: { branchId: branch.id, postingDate: day() } });
  assert(claimApproved.data.claim.status === "ACCRUED" && money(claimApproved.data.claim.outstandingAmount) === 900, "The supplier incentive was not accrued.");
  const claimLines = await prisma.journalEntryLine.findMany({ where: { entryId: claimApproved.data.journal.id } });
  assert(claimLines.some((line) => line.accountId === receivable.id && money(line.debit) === 900), "The supplier incentive did not debit the receivable.");
  assert(claimLines.some((line) => line.accountId === income.id && money(line.credit) === 900), "The supplier incentive did not credit income.");
  await request(owner, `/api/finance/incentives/received/${claim.data.id}/receive`, { method: "POST", body: { amount: "1000", receiptDate: day(), paymentMethodId: cashMethod.id }, expected: 422 });
  const partReceived = await request(owner, `/api/finance/incentives/received/${claim.data.id}/receive`, { method: "POST", body: { amount: "600", receiptDate: day(), paymentMethodId: cashMethod.id, reference: `SIP-${run}` } });
  assert(partReceived.data.claim.status === "PARTIALLY_RECEIVED" && money(partReceived.data.claim.outstandingAmount) === 300, "A partial supplier incentive receipt was not recorded.");
  await request(accountant, `/api/finance/incentives/received/${claim.data.id}/receive`, { method: "POST", body: { amount: "300", receiptDate: day(), paymentMethodId: cashMethod.id }, expected: 403 });
  const fullyReceived = await request(owner, `/api/finance/incentives/received/${claim.data.id}/receive`, { method: "POST", body: { amount: "300", receiptDate: day(), paymentMethodId: cashMethod.id, reference: `SIP2-${run}` } });
  assert(fullyReceived.data.claim.status === "RECEIVED" && money(fullyReceived.data.claim.outstandingAmount) === 0, "The supplier incentive was not fully received.");
  console.log("✓ supplier incentives accrue income and settle through separate receipts");

  // 10 · audit and workspace ----------------------------------------------------
  const ids = [percentPlan.data.id, unitPlan.data.id, targetPlan.data.id, percentRow.id, adjustable.id, claim.data.id];
  const audit = await prisma.auditLog.findMany({ where: { companyId: company.id, createdAt: { gte: started }, OR: [{ entityId: { in: ids } }, { action: { in: ["INCENTIVE_CALCULATED", "INCENTIVE_ACCRUED", "INCENTIVE_PAID", "INCENTIVE_REVERSED", "RECEIVED_INCENTIVE_APPROVED", "RECEIVED_INCENTIVE_RECEIVED"] } }] }, select: { action: true } });
  const actions = new Set(audit.map((row) => row.action));
  for (const action of ["INCENTIVE_PLAN_CREATED", "INCENTIVE_CALCULATED", "INCENTIVE_APPROVED", "INCENTIVE_ACCRUED", "INCENTIVE_PAID", "INCENTIVE_REVERSED", "RECEIVED_INCENTIVE_CREATED", "RECEIVED_INCENTIVE_APPROVED", "RECEIVED_INCENTIVE_RECEIVED"]) {
    assert(actions.has(action), `Missing audit action ${action}.`);
  }
  const page = await request(accountant, "/finance/incentives", { expected: 200 });
  assert(/Incentives/.test(String(page.raw)), "The incentive workspace did not render.");
  console.log(`✓ audit trail and authenticated workspace verified (${run})`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    if (sessionIds.length) await prisma.session.deleteMany({ where: { id: { in: sessionIds } } }).catch(() => undefined);
    await prisma.$disconnect();
  });
