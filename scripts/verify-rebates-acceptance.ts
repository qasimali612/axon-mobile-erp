/**
 * Rebates acceptance: programs → calculation from posted goods receipts / sales invoices →
 * independent approval → accrual journal → receivable or payable → receipt or payment.
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
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

async function login(email: string, companyId: string, branchId: string, warehouseId: string): Promise<Session> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(32).toString("base64url");
  const userAgent = `Axon-Rebate-Acceptance/${run}/${email}`;
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

  const suffix = run.slice(-5);
  const createAccount = async (code: string, name: string, accountClass: string, accountType: string, normalBalance: string, cashFlowActivity: string) => {
    const created = await request(accountant, "/api/finance/accounts", { method: "POST", expected: 201, body: { code, name, accountClass, subclass: "Acceptance rebates", accountType, normalBalance, reconciliationRequired: false, allowManualJournal: true, cashFlowActivity } });
    return { id: created.data.id as string, code };
  };
  const rebateIncome = await createAccount(`49${suffix}R`, `Rebate income ${run}`, "REVENUE", "REVENUE", "CREDIT", "OPERATING");
  const rebateExpense = await createAccount(`69${suffix}R`, `Rebate expense ${run}`, "EXPENSE", "EXPENSE", "DEBIT", "OPERATING");
  const rebateReceivable = await createAccount(`19${suffix}R`, `Supplier rebate receivable ${run}`, "ASSET", "ASSET", "DEBIT", "OPERATING");
  const rebatePayable = await createAccount(`29${suffix}R`, `Customer rebate payable ${run}`, "LIABILITY", "LIABILITY", "CREDIT", "OPERATING");
  const cashAccount = await prisma.account.findFirstOrThrow({ where: { companyId: company.id, accountType: "CASH", isActive: true }, orderBy: { code: "asc" } });
  const cashMethod = (await request(accountant, "/api/catalog/payment-methods", {
    method: "POST",
    expected: 201,
    body: { code: `RB-CASH-${suffix}`, name: `Rebate cash ${run}`, methodType: "CASH", cashAccountId: cashAccount.id, bankAccountId: null, requiresReference: false, sequence: 0, isActive: true, notes: null },
  })).data;

  // ---- eligibility sources from committed documents ---------------------------
  const periodStart = day(-60);
  const periodEnd = day(0);
  const range = { gte: new Date(`${periodStart}T00:00:00.000Z`), lte: new Date(`${periodEnd}T00:00:00.000Z`) };
  const receiptGroups = await prisma.purchaseReceipt.groupBy({ by: ["supplierId"], where: { companyId: company.id, status: "POSTED", receiptDate: range }, _count: { _all: true } });
  const invoiceGroups = await prisma.salesInvoice.groupBy({ by: ["customerId"], where: { companyId: company.id, status: "POSTED", invoiceDate: range }, _count: { _all: true } });
  assert(receiptGroups.length > 0, "The rebate acceptance needs posted goods receipts in the last 60 days.");
  assert(invoiceGroups.length > 0, "The rebate acceptance needs posted sales invoices in the last 60 days.");
  const supplierId = receiptGroups.sort((left, right) => right._count._all - left._count._all)[0].supplierId;
  const customerId = invoiceGroups.sort((left, right) => right._count._all - left._count._all)[0].customerId;

  const receipts = await prisma.purchaseReceipt.findMany({ where: { companyId: company.id, supplierId, status: "POSTED", receiptDate: range }, select: { subtotal: true, discountTotal: true, documentDiscount: true, lines: { select: { quantity: true } } } });
  const expectedReceiptValue = round4(receipts.reduce((sum, receipt) => sum + Number(receipt.subtotal) - Number(receipt.discountTotal) - Number(receipt.documentDiscount), 0));
  const expectedReceiptQuantity = round4(receipts.reduce((sum, receipt) => sum + receipt.lines.reduce((lineSum, line) => lineSum + Number(line.quantity), 0), 0));

  const invoices = await prisma.salesInvoice.findMany({ where: { companyId: company.id, customerId, status: "POSTED", invoiceDate: range }, select: { id: true, subtotal: true, discountTotal: true, lines: { select: { quantity: true } } } });
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const salesReturns = await prisma.stockReturn.findMany({ where: { companyId: company.id, status: "POSTED", returnType: "SALES_RETURN", returnDate: range, salesInvoiceId: { in: invoiceIds } }, select: { subtotal: true, discountTotal: true, lines: { select: { quantity: true } } } });
  let expectedSalesValue = 0;
  let expectedSalesQuantity = 0;
  for (const invoice of invoices) {
    const net = Number(invoice.subtotal) - Number(invoice.discountTotal);
    if (net <= 0) continue;
    expectedSalesValue += net;
    expectedSalesQuantity += invoice.lines.reduce((sum, line) => sum + Number(line.quantity), 0);
  }
  for (const row of salesReturns) {
    expectedSalesValue -= Number(row.subtotal) - Number(row.discountTotal);
    expectedSalesQuantity -= row.lines.reduce((sum, line) => sum + Number(line.quantity), 0);
  }
  expectedSalesValue = round4(expectedSalesValue);
  expectedSalesQuantity = round4(expectedSalesQuantity);
  assert(expectedReceiptValue > 0 && expectedSalesValue > 0, "Both rebate directions need positive eligible value in the period.");

  const programBody = (code: string, direction: "RECEIVABLE" | "PAYABLE", extra: Row = {}) => ({
    code, name: `Acceptance ${code}`, direction,
    supplierId: direction === "RECEIVABLE" ? supplierId : null,
    customerId: direction === "PAYABLE" ? customerId : null,
    effectiveFrom: day(-90), effectiveTo: day(90),
    calculationMethod: "PERCENT_OF_VALUE", rate: "1.5", fixedAmount: null,
    primaryAccountId: direction === "RECEIVABLE" ? rebateIncome.id : rebateExpense.id,
    settlementAccountId: direction === "RECEIVABLE" ? rebateReceivable.id : rebatePayable.id,
    accountingTreatment: direction === "RECEIVABLE" ? "INCOME" : "COST_REDUCTION",
    isActive: true, ...extra,
  });

  // 1 · permission gating ------------------------------------------------------
  await request(buyer, "/api/finance/rebates", { expected: 403 });
  await request(buyer, "/api/finance/rebates/programs", { method: "POST", body: programBody(`PERM-${run}`, "RECEIVABLE"), expected: 403 });
  console.log("✓ rebate programs and the rebate workspace are permission gated");

  // 2 · program validation -----------------------------------------------------
  await request(accountant, "/api/finance/rebates/programs", { method: "POST", body: programBody(`BAD1-${run}`, "RECEIVABLE", { supplierId: null }), expected: 422 });
  await request(accountant, "/api/finance/rebates/programs", { method: "POST", body: programBody(`BAD2-${run}`, "PAYABLE", { customerId: null }), expected: 422 });
  await request(accountant, "/api/finance/rebates/programs", { method: "POST", body: programBody(`BAD3-${run}`, "RECEIVABLE", { primaryAccountId: rebateReceivable.id }), expected: 422 });
  const sameAccount = await request(accountant, "/api/finance/rebates/programs", { method: "POST", body: programBody(`BAD4-${run}`, "RECEIVABLE", { settlementAccountId: rebateIncome.id, primaryAccountId: rebateIncome.id }), expected: 422 });
  assert(/differ/i.test(JSON.stringify(sameAccount)), "A program was allowed to settle into its own primary account.");
  await request(accountant, "/api/finance/rebates/programs", { method: "POST", body: programBody(`BAD5-${run}`, "RECEIVABLE", { rate: null }), expected: 422 });
  await request(accountant, "/api/finance/rebates/programs", { method: "POST", body: programBody(`BAD6-${run}`, "PAYABLE", { customerId: null, supplierId }), expected: 422 });
  console.log("✓ program validation enforces party, direction, account class and calculation rules");

  // 3 · programs ---------------------------------------------------------------
  const supplierProgram = await request(accountant, "/api/finance/rebates/programs", { method: "POST", expected: 201, body: programBody(`SR-${run}`, "RECEIVABLE") });
  const customerProgram = await request(accountant, "/api/finance/rebates/programs", { method: "POST", expected: 201, body: programBody(`CR-${run}`, "PAYABLE", { calculationMethod: "PER_UNIT", rate: null, fixedAmount: "100" }) });
  await request(accountant, "/api/finance/rebates/programs", { method: "POST", body: programBody(`SR-${run}`, "RECEIVABLE"), expected: 409 });
  const renamed = await request(accountant, `/api/finance/rebates/programs/${supplierProgram.data.id}`, { method: "PATCH", body: { ...programBody(`SR-${run}`, "RECEIVABLE"), name: `Acceptance ${run} supplier rebate` } });
  assert(renamed.data.name.endsWith("supplier rebate"), "The rebate program was not updated.");
  console.log("✓ supplier and customer rebate programs are created, de-duplicated and editable");

  // 4 · calculation ------------------------------------------------------------
  const supplierCalculation = await request(accountant, `/api/finance/rebates/programs/${supplierProgram.data.id}/calculate`, { method: "POST", expected: 201, body: { periodStart, periodEnd } });
  assert(round4(money(supplierCalculation.data.eligibleValue)) === expectedReceiptValue, `Eligible value was ${supplierCalculation.data.eligibleValue}, expected ${expectedReceiptValue}.`);
  assert(round4(money(supplierCalculation.data.eligibleQuantity)) === expectedReceiptQuantity, `Eligible quantity was ${supplierCalculation.data.eligibleQuantity}, expected ${expectedReceiptQuantity}.`);
  assert(round4(money(supplierCalculation.data.calculatedAmount)) === round4(expectedReceiptValue * 0.015), `Calculated rebate was ${supplierCalculation.data.calculatedAmount}.`);
  assert(supplierCalculation.data.status === "CALCULATED" && supplierCalculation.data.calculatedById === accountantUser.id, "The rebate calculation did not record its maker.");
  await request(accountant, `/api/finance/rebates/programs/${supplierProgram.data.id}/calculate`, { method: "POST", body: { periodStart, periodEnd }, expected: 409 });
  await request(accountant, `/api/finance/rebates/programs/${supplierProgram.data.id}/calculate`, { method: "POST", body: { periodStart: day(-400), periodEnd: day(-390) }, expected: 422 });
  const customerCalculation = await request(accountant, `/api/finance/rebates/programs/${customerProgram.data.id}/calculate`, { method: "POST", expected: 201, body: { periodStart, periodEnd } });
  assert(round4(money(customerCalculation.data.eligibleValue)) === expectedSalesValue, `Customer eligible value was ${customerCalculation.data.eligibleValue}, expected ${expectedSalesValue}.`);
  assert(round4(money(customerCalculation.data.calculatedAmount)) === round4(expectedSalesQuantity * 100), `Customer rebate was ${customerCalculation.data.calculatedAmount}, expected ${round4(expectedSalesQuantity * 100)}.`);
  console.log("✓ rebate amounts are computed from posted receipts and posted sales net of returns");

  // 5 · independent approval ---------------------------------------------------
  await request(accountant, `/api/finance/rebates/calculations/${supplierCalculation.data.id}/approve`, { method: "POST", expected: 403 });
  const supplierApproved = await request(controller, `/api/finance/rebates/calculations/${supplierCalculation.data.id}/approve`, { method: "POST" });
  assert(supplierApproved.data.status === "APPROVED" && round4(money(supplierApproved.data.approvedAmount)) === round4(money(supplierCalculation.data.calculatedAmount)), "The supplier rebate was not approved at the calculated amount.");
  await request(controller, `/api/finance/rebates/calculations/${supplierCalculation.data.id}/approve`, { method: "POST", expected: 409 });
  const customerApproved = await request(controller, `/api/finance/rebates/calculations/${customerCalculation.data.id}/approve`, { method: "POST" });
  assert(customerApproved.data.status === "APPROVED", "The customer rebate was not approved.");
  console.log("✓ approval requires an independent officer holding the approval permission");

  // 6 · accrual ----------------------------------------------------------------
  const supplierAccrued = await request(controller, `/api/finance/rebates/calculations/${supplierCalculation.data.id}/accrue`, { method: "POST", body: { postingDate: day() } });
  const supplierAmount = round4(money(supplierCalculation.data.calculatedAmount));
  const supplierLines = await prisma.journalEntryLine.findMany({ where: { entryId: supplierAccrued.data.journal.id } });
  assert(supplierLines.some((line) => line.accountId === rebateReceivable.id && round4(money(line.debit)) === supplierAmount), "The supplier rebate did not debit the receivable account.");
  assert(supplierLines.some((line) => line.accountId === rebateIncome.id && round4(money(line.credit)) === supplierAmount), "The supplier rebate did not credit income.");
  await request(controller, `/api/finance/rebates/calculations/${supplierCalculation.data.id}/accrue`, { method: "POST", body: { postingDate: day() }, expected: 409 });
  const customerAccrued = await request(controller, `/api/finance/rebates/calculations/${customerCalculation.data.id}/accrue`, { method: "POST", body: { postingDate: day() } });
  const customerAmount = round4(money(customerCalculation.data.calculatedAmount));
  const customerLines = await prisma.journalEntryLine.findMany({ where: { entryId: customerAccrued.data.journal.id } });
  assert(customerLines.some((line) => line.accountId === rebateExpense.id && round4(money(line.debit)) === customerAmount), "The customer rebate did not debit the rebate expense.");
  assert(customerLines.some((line) => line.accountId === rebatePayable.id && round4(money(line.credit)) === customerAmount), "The customer rebate did not credit the payable.");
  console.log("✓ accruals post balanced journals in both directions exactly once");

  // 7 · settlement -------------------------------------------------------------
  const half = round4(supplierAmount / 2);
  await request(accountant, `/api/finance/rebates/calculations/${supplierCalculation.data.id}/settle`, { method: "POST", expected: 403, body: { amount: String(half), settlementDate: day(), paymentMethodId: cashMethod.id } });
  const partial = await request(owner, `/api/finance/rebates/calculations/${supplierCalculation.data.id}/settle`, { method: "POST", body: { amount: String(half), settlementDate: day(), paymentMethodId: cashMethod.id, reference: `RBR-${run}` } });
  assert(partial.data.calculation.status === "PARTIALLY_SETTLED" && round4(money(partial.data.calculation.outstandingAmount)) === round4(supplierAmount - half), "A partial supplier rebate receipt was not recorded.");
  await request(owner, `/api/finance/rebates/calculations/${supplierCalculation.data.id}/settle`, { method: "POST", body: { amount: String(supplierAmount * 2), settlementDate: day(), paymentMethodId: cashMethod.id }, expected: 422 });
  const settled = await request(owner, `/api/finance/rebates/calculations/${supplierCalculation.data.id}/settle`, { method: "POST", body: { amount: String(round4(supplierAmount - half)), settlementDate: day(), paymentMethodId: cashMethod.id, reference: `RBR2-${run}` } });
  assert(settled.data.calculation.status === "SETTLED" && money(settled.data.calculation.outstandingAmount) === 0, "The supplier rebate was not fully received.");
  const receiptLines = await prisma.journalEntryLine.findMany({ where: { entryId: settled.data.journal.id } });
  assert(receiptLines.some((line) => line.accountId === cashAccount.id && round4(money(line.debit)) === round4(supplierAmount - half)), "The rebate receipt did not debit the settlement account.");
  const paid = await request(owner, `/api/finance/rebates/calculations/${customerCalculation.data.id}/settle`, { method: "POST", body: { amount: String(customerAmount), settlementDate: day(), paymentMethodId: cashMethod.id, reference: `RBP-${run}` } });
  assert(paid.data.calculation.status === "SETTLED" && money(paid.data.calculation.outstandingAmount) === 0, "The customer rebate was not paid.");
  const paymentLines = await prisma.journalEntryLine.findMany({ where: { entryId: paid.data.journal.id } });
  assert(paymentLines.some((line) => line.accountId === rebatePayable.id && round4(money(line.debit)) === customerAmount), "The customer rebate payment did not debit the payable.");
  assert(paymentLines.some((line) => line.accountId === cashAccount.id && round4(money(line.credit)) === customerAmount), "The customer rebate payment did not credit the settlement account.");
  console.log("✓ receipts and payments settle each direction in parts, reject over-settlement and post cash");

  // 8 · audit and workspace -----------------------------------------------------
  const ids = [supplierProgram.data.id, customerProgram.data.id, supplierCalculation.data.id, customerCalculation.data.id];
  const audit = await prisma.auditLog.findMany({ where: { companyId: company.id, createdAt: { gte: started }, OR: [{ entityId: { in: ids } }, { action: { in: ["REBATE_CALCULATED", "REBATE_APPROVED", "REBATE_ACCRUED", "REBATE_RECEIVED", "REBATE_PAID"] } }] }, select: { action: true } });
  const actions = new Set(audit.map((row) => row.action));
  for (const action of ["REBATE_PROGRAM_CREATED", "REBATE_CALCULATED", "REBATE_APPROVED", "REBATE_ACCRUED", "REBATE_RECEIVED", "REBATE_PAID"]) {
    assert(actions.has(action), `Missing audit action ${action}.`);
  }
  const page = await request(accountant, "/finance/rebates", { expected: 200 });
  assert(/Rebates/.test(String(page.raw)), "The rebate workspace did not render.");
  const stale = await prisma.rebateCalculation.findMany({ where: { companyId: company.id, status: { in: ["ACCRUED", "PARTIALLY_SETTLED"] }, outstandingAmount: { gt: 0 } }, select: { id: true, outstandingAmount: true } });
  console.log(`✓ audit trail and authenticated workspace verified (${run}) · open rebate items after run: ${stale.length}`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    if (sessionIds.length) await prisma.session.deleteMany({ where: { id: { in: sessionIds } } }).catch(() => undefined);
    await prisma.$disconnect();
  });
