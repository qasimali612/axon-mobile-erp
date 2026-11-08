/**
 * Acceptance for the delivery phases: catalog depth, commercial policy controls, and output/delivery.
 *
 * Covers supplier item codes, product max-stock/preferred-supplier fields, the reorder report, the
 * approval-policy gate on journal posting, the discount-cap and credit-override rules, server-side
 * PDF generation, the 80 mm receipt, the device label sheet, saved views and report schedules.
 */
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertCreditOverrideAllowed, bandCovers } from "@/lib/policies";
import { Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.OPERATIONS_TEST_BASE_URL || "http://127.0.0.1:3000";
const run = Date.now().toString(36).toUpperCase();
// Every fixture carries this prefix so an interrupted run can be cleaned up before the next one.
const FIXTURE = "[acceptance]";
const sessionIds: string[] = [];

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function obj(value: unknown): Record<string, unknown> { return value && typeof value === "object" ? (value as Record<string, unknown>) : {}; }
function rows(value: unknown): Array<Record<string, unknown>> { return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []; }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function payload<T>(result: { json: unknown }): T { return obj(result.json).data as T; }
type Session = { cookie: string; userAgent: string; userId: string };

async function login(email: string, companyId: string, branchId: string, warehouseId: string): Promise<Session> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(32).toString("base64url");
  const userAgent = `Axon-Enhancements/${run}/${email}`;
  const row = await prisma.session.create({ data: { tokenHash: createHash("sha256").update(token).digest("hex"), userId: user.id, activeCompanyId: companyId, activeBranchId: branchId, activeWarehouseId: warehouseId, ipAddress: "127.0.0.1", userAgent, expiresAt: new Date(Date.now() + 3_600_000) } });
  sessionIds.push(row.id);
  return { cookie: `axon_session=${token}`, userAgent, userId: user.id };
}

async function call(session: Session, path: string, options: { method?: string; body?: unknown; expect?: number } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: { Cookie: session.cookie, Origin: baseUrl, "User-Agent": session.userAgent, ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    redirect: "manual",
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const text = new TextDecoder("utf-8").decode(bytes);
  const expected = options.expect ?? 200;
  if (response.status !== expected) throw new Error(`${options.method || "GET"} ${path}: expected ${expected}, got ${response.status}: ${text.slice(0, 300)}`);
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { response, status: response.status, text, json, bytes };
}

async function cleanupFixtures(companyId: string) {
  await prisma.reportSchedule.deleteMany({ where: { companyId, name: { startsWith: FIXTURE } } });
  await prisma.savedView.deleteMany({ where: { companyId, name: { startsWith: FIXTURE } } });
  await prisma.approvalPolicy.deleteMany({ where: { companyId, name: { startsWith: FIXTURE } } });
  await prisma.supplierItem.deleteMany({ where: { companyId, supplierSku: { startsWith: "SUP-ACC-" } } });
}

async function main() {
  const started = new Date();
  const company = await prisma.company.findUniqueOrThrow({ where: { code: "AXON" } });
  const branch = await prisma.branch.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "HZR" } } });
  const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "HZR-MAIN" } } });
  await cleanupFixtures(company.id);
  const owner = await login("owner@axonmobile.local", company.id, branch.id, warehouse.id);
  const accountant = await login("accountant@axonmobile.local", company.id, branch.id, warehouse.id);
  const controller = await login("controller@axonmobile.local", company.id, branch.id, warehouse.id);
  const poster = await login("poster@axonmobile.local", company.id, branch.id, warehouse.id);
  const storekeeper = await login("warehouse@axonmobile.local", company.id, branch.id, warehouse.id);

  const supplier = await prisma.supplier.findFirstOrThrow({ where: { companyId: company.id, status: "ACTIVE" } });
  const product = await prisma.product.findFirstOrThrow({ where: { companyId: company.id, status: "ACTIVE" } });

  // 1 · catalog depth ------------------------------------------------------------
  const supplierSku = `SUP-ACC-${run}`;
  const created = await call(owner, "/api/catalog/supplier-items", { method: "POST", expect: 201, body: { supplierId: supplier.id, productId: product.id, supplierSku, lastCost: "1200.5000", leadTimeDays: 7, minOrderQty: "5.0000" } });
  const itemId = text(payload<Record<string, unknown>>(created).id);
  await call(owner, "/api/catalog/supplier-items", { method: "POST", expect: 409, body: { supplierId: supplier.id, productId: product.id, supplierSku, lastCost: "1" } });
  await call(owner, "/api/catalog/supplier-items", { method: "POST", expect: 422, body: { supplierId: "00000000-0000-4000-8000-000000000000", productId: product.id, supplierSku: `BAD-${run}` } });
  await call(owner, `/api/catalog/supplier-items/${itemId}`, { method: "PATCH", body: { lastCost: "1250.0000", leadTimeDays: 10 } });
  const listed = await call(owner, `/api/catalog/supplier-items?supplierId=${supplier.id}`);
  const listedRow = rows(payload<unknown>(listed)).find((row) => row.id === itemId);
  assert(listedRow && Number(listedRow.lastCost) === 1250 && Number(listedRow.leadTimeDays) === 10, "Supplier item update was not persisted.");
  const supplierAudit = await prisma.auditLog.count({ where: { entityId: itemId, action: { in: ["SUPPLIER_ITEM_CREATED", "SUPPLIER_ITEM_UPDATED"] } } });
  assert(supplierAudit >= 2, "Supplier item audit trail is incomplete.");
  console.log(`✓ supplier item codes validate, persist and audit (${supplierSku})`);

  // Product max stock + preferred supplier, then the reorder report.
  const variant = await prisma.productVariant.findFirstOrThrow({ where: { productId: product.id, companyId: company.id } });
  const productPayload = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
  const variantPayload = await prisma.productVariant.findFirstOrThrow({ where: { productId: product.id, companyId: company.id }, orderBy: { createdAt: "asc" } });
  // The product endpoint treats an empty barcode as "clear the primary barcode", so echo the existing
  // value back and never destroy seeded catalog data from an acceptance run.
  const primaryBarcode = await prisma.productBarcode.findFirst({ where: { companyId: company.id, variantId: variantPayload.id }, select: { barcode: true } });
  const updateBody = {
    sku: productPayload.sku, name: productPayload.name, model: productPayload.model || "", modelCode: productPayload.modelCode || "",
    categoryId: productPayload.categoryId, brandId: productPayload.brandId, unitId: productPayload.unitId,
    productType: productPayload.productType, trackingMethod: productPayload.trackingMethod, costingMethod: productPayload.costingMethod,
    standardPurchasePrice: productPayload.standardPurchasePrice.toFixed(4), reorderLevel: "999999.0000", maxStockLevel: "1000000.0000",
    preferredSupplierId: supplier.id, description: `Depth fixture ${run}`,
    variant: {
      sku: variantPayload.sku, name: variantPayload.name, color: variantPayload.color || "",
      ramGb: variantPayload.ramGb ?? null, storageGb: variantPayload.storageGb ?? null,
      networkType: variantPayload.networkType || "", simConfiguration: variantPayload.simConfiguration || "", regionVariant: variantPayload.regionVariant || "",
      purchasePrice: variantPayload.purchasePrice.toFixed(4), wholesalePrice: variantPayload.wholesalePrice.toFixed(4),
      retailPrice: variantPayload.retailPrice.toFixed(4), minimumSellingPrice: variantPayload.minimumSellingPrice.toFixed(4),
      barcode: primaryBarcode?.barcode || "",
    },
  };
  await call(owner, `/api/products/${product.id}`, { method: "PUT", body: updateBody });
  const refreshed = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
  assert(refreshed.preferredSupplierId === supplier.id && refreshed.maxStockLevel.toNumber() === 1_000_000, "Product depth fields were not persisted.");
  const reorder = await call(owner, "/api/reports/operations?report=reorder&limit=200");
  const reorderRows = rows(obj(payload<unknown>(reorder)).rows);
  const suggestion = reorderRows.find((row) => row.sku === variant.sku);
  assert(suggestion, "The reorder report did not suggest the low-stock variant.");
  assert(Number(suggestion.suggestedOrderQty) > 0, "The reorder suggestion has no suggested quantity.");
  const reorderCsv = await call(owner, "/api/reports/operations?report=reorder&format=csv");
  assert(reorderCsv.response.headers.get("content-type")?.includes("text/csv"), "The reorder report did not export as CSV.");
  assert(new Uint8Array(reorderCsv.bytes).slice(0, 3).join(",") === "239,187,191", "The reorder CSV is missing its UTF-8 BOM.");
  console.log(`✓ product depth fields persist and the reorder report suggests ${suggestion.suggestedOrderQty} units`);

  // 2 · approval policy gate -----------------------------------------------------
  await call(accountant, "/api/settings/policies", { expect: 403 });
  await call(accountant, "/api/settings/policies", { method: "POST", expect: 403, body: { documentType: "JOURNAL", name: "n/a", requiredPermission: "GL_VIEW" } });
  const policyName = `${FIXTURE} Journal control ${run}`;
  const policy = await call(owner, "/api/settings/policies", { method: "POST", expect: 201, body: { documentType: "JOURNAL", name: policyName, minAmount: "0", maxAmount: null, requiredPermission: "FINANCIAL_REPORTS_EXPORT", notes: "Delivery acceptance fixture" } });
  const policyId = text(payload<Record<string, unknown>>(policy).id);

  const journalAccounts = await prisma.account.findMany({
    where: { companyId: company.id, isActive: true, allowManualJournal: true },
    select: { id: true, accountClass: true },
    orderBy: { code: "asc" },
  });
  const debitAccount = journalAccounts.find((account) => account.accountClass === "ASSET" || account.accountClass === "EXPENSE");
  const creditAccount = journalAccounts.find((account) => account.id !== debitAccount?.id);
  assert(debitAccount && creditAccount, "Two manual-journal accounts are required for the policy fixture; run the finance suites first.");
  const journalBody = {
    branchId: branch.id, postingDate: new Date().toISOString().slice(0, 10), narration: `Policy gate fixture ${run}`,
    idempotencyKey: `POLICY-${run}`,
    lines: [
      { accountId: debitAccount.id, description: `Debit ${run}`, debit: "150.0000", credit: "0" },
      { accountId: creditAccount.id, description: `Credit ${run}`, debit: "0", credit: "150.0000" },
    ],
  };
  const journal = await call(accountant, "/api/finance/journals", { method: "POST", expect: 201, body: journalBody });
  const journalId = text(payload<Record<string, unknown>>(journal).id);
  await call(accountant, `/api/finance/journals/${journalId}/submit`, { method: "POST" });
  await call(controller, `/api/finance/journals/${journalId}/approve`, { method: "POST" });
  const blocked = await call(poster, `/api/finance/journals/${journalId}/post`, { method: "POST", expect: 403 });
  const blockedCode = text(obj(obj(blocked.json).error).code);
  assert(blockedCode === "APPROVAL_POLICY_REQUIRED", `Expected APPROVAL_POLICY_REQUIRED, got ${blockedCode}.`);
  const blockedAudit = await prisma.auditLog.count({ where: { entityId: journalId, action: "APPROVAL_POLICY_BLOCKED" } });
  assert(blockedAudit >= 1, "The blocked posting was not audited.");
  await call(owner, `/api/settings/policies/${policyId}`, { method: "PATCH", body: { isActive: false } });
  await call(poster, `/api/finance/journals/${journalId}/post`, { method: "POST" });
  const posted = await prisma.journalEntry.findUniqueOrThrow({ where: { id: journalId } });
  assert(posted.status === "POSTED", "Disabling the band did not allow the posting officer through.");
  console.log("✓ approval band blocks a posting officer without the extra grant, audits it, and releases once disabled");

  // 3 · discount cap and credit override rules -----------------------------------
  const currentDiscount = await prisma.systemSetting.findUnique({ where: { companyId_key: { companyId: company.id, key: "sales.discount.policy" } } });
  await call(owner, "/api/settings/policies", { method: "PUT", body: { maxPercent: 5, overridePermission: "sales.discount.override" } });
  const savedDiscount = await prisma.systemSetting.findUniqueOrThrow({ where: { companyId_key: { companyId: company.id, key: "sales.discount.policy" } } });
  assert(Number(obj(savedDiscount.value).maxPercent) === 5, "The discount cap setting was not persisted.");
  const discountAudit = await prisma.auditLog.count({ where: { action: "DISCOUNT_POLICY_UPDATED", createdAt: { gte: started } } });
  assert(discountAudit >= 1, "The discount policy change was not audited.");

  const subtotal = new Prisma.Decimal(1000);
  const bigDiscount = new Prisma.Decimal(200); // 20% > 5% cap
  let discountBlocked = false;
  try {
    await prisma.$transaction(async (tx) => {
      const { assertDiscountCap } = await import("@/lib/policies");
      await assertDiscountCap(tx, { actor: { companyId: company.id, userId: accountant.userId, permissions: ["SALES_INVOICE_CREATE"] }, subtotal, discountTotal: bigDiscount, entityId: journalId, reference: `DISC-${run}` });
    });
  } catch (error) { discountBlocked = (error as { code?: string }).code === "DISCOUNT_CAP_EXCEEDED"; }
  assert(discountBlocked, "A discount above the configured cap was not refused.");
  await prisma.$transaction(async (tx) => {
    const { assertDiscountCap } = await import("@/lib/policies");
    await assertDiscountCap(tx, { actor: { companyId: company.id, userId: owner.userId, permissions: ["sales.discount.override"], overrideReason: "Owner-approved clearance batch" }, subtotal, discountTotal: bigDiscount, entityId: journalId, reference: `DISC-OK-${run}` });
  });
  const overrideAudit = await prisma.auditLog.count({ where: { action: "DISCOUNT_CAP_OVERRIDDEN", createdAt: { gte: started } } });
  assert(overrideAudit >= 1, "The discount override was not audited.");

  let creditBlocked = false;
  try {
    assertCreditOverrideAllowed({ companyId: company.id, userId: accountant.userId, permissions: [] }, { outstanding: new Prisma.Decimal(9000), invoiceTotal: new Prisma.Decimal(2000), creditLimit: new Prisma.Decimal(10000) });
  } catch (error) { creditBlocked = (error as { code?: string }).code === "CREDIT_LIMIT_EXCEEDED"; }
  assert(creditBlocked, "A credit-limit breach without the override grant was not refused.");
  assert(bandCovers(new Prisma.Decimal(500), { minAmount: new Prisma.Decimal(0), maxAmount: new Prisma.Decimal(1000) }), "Band coverage is wrong for an in-range amount.");
  assert(!bandCovers(new Prisma.Decimal(1500), { minAmount: new Prisma.Decimal(0), maxAmount: new Prisma.Decimal(1000) }), "Band coverage accepted an out-of-range amount.");
  if (currentDiscount) await prisma.systemSetting.update({ where: { companyId_key: { companyId: company.id, key: "sales.discount.policy" } }, data: { value: currentDiscount.value as Prisma.InputJsonValue } });
  else await prisma.systemSetting.deleteMany({ where: { companyId: company.id, key: "sales.discount.policy" } });
  console.log(`✓ discount cap refuses ${bigDiscount} on ${subtotal} without the override grant; overrides are audited`);

  // 4 · server-side PDF ----------------------------------------------------------
  const invoice = await prisma.salesInvoice.findFirst({ where: { companyId: company.id, status: "POSTED" }, orderBy: { createdAt: "desc" } });
  assert(invoice, "A posted sales invoice is required for the PDF check; run procurement-sales first.");
  const pdf = await call(owner, `/api/documents/invoice/${invoice.id}/pdf`);
  assert(pdf.response.headers.get("content-type") === "application/pdf", "The PDF route did not return application/pdf.");
  assert(Buffer.from(pdf.bytes.slice(0, 5)).toString() === "%PDF-", "The generated document is not a PDF file.");
  assert(pdf.bytes.byteLength > 1200, "The generated PDF is implausibly small.");
  const pdfAudit = await prisma.auditLog.count({ where: { entityId: invoice.id, action: "DOCUMENT_PDF_GENERATED" } });
  assert(pdfAudit >= 1, "PDF generation was not audited.");
  await call(storekeeper, `/api/documents/invoice/${invoice.id}/pdf`, { expect: 403 });
  console.log(`✓ invoice PDF generated server-side (${pdf.bytes.byteLength} bytes) and audited`);

  // 5 · thermal receipt and device labels ----------------------------------------
  const receipt = await call(owner, `/sales/${invoice.id}/receipt`);
  assert(receipt.text.includes("80 mm") || receipt.text.includes("SALES RECEIPT"), "The thermal receipt layout did not render.");
  const stockUnit = await prisma.physicalStockUnit.findFirst({ where: { companyId: company.id }, include: { identifiers: true } });
  assert(stockUnit, "A physical stock unit is required for the label sheet.");
  const labels = await call(owner, `/inventory/labels?units=${stockUnit.id}`);
  assert(labels.text.includes("<svg"), "The label sheet did not render a barcode SVG.");
  assert(labels.text.includes(stockUnit.identifiers[0]?.value || stockUnit.id.slice(0, 8).toUpperCase()), "The label sheet is missing the device identifier.");
  console.log("✓ 80 mm receipt and barcode label sheet render for the owner");

  // 6 · saved views --------------------------------------------------------------
  await call(accountant, "/api/reports/saved-views", { method: "POST", expect: 201, body: { module: "operations", name: `${FIXTURE} Cashier ${run}`, query: { report: "sales", status: "" } } });
  const viewCreated = await call(accountant, "/api/reports/saved-views", { method: "POST", expect: 201, body: { module: "operations", name: `${FIXTURE} Manager ${run}`, query: { report: "inventory" } } });
  await call(accountant, "/api/reports/saved-views", { method: "POST", expect: 409, body: { module: "operations", name: `${FIXTURE} Manager ${run}`, query: {} } });
  const views = await call(accountant, "/api/reports/saved-views?module=operations");
  assert(rows(payload<unknown>(views)).some((row) => row.name === `${FIXTURE} Manager ${run}`), "The saved view was not listed for its owner.");
  const ownerViews = await call(owner, "/api/reports/saved-views?module=operations");
  assert(!rows(payload<unknown>(ownerViews)).some((row) => row.name === `${FIXTURE} Manager ${run}`), "A private saved view leaked to another user.");
  await call(accountant, `/api/reports/saved-views/${text(payload<Record<string, unknown>>(viewCreated).id)}`, { method: "DELETE" });
  console.log("✓ saved views are per-user, reject duplicates and delete cleanly");

  // 7 · report schedules ---------------------------------------------------------
  await call(accountant, "/api/reports/schedules", { expect: 403 });
  const schedule = await call(owner, "/api/reports/schedules", { method: "POST", expect: 201, body: { name: `${FIXTURE} Weekly sales ${run}`, reportKey: "sales", filters: {}, cadence: "WEEKLY", recipients: "owner@axonmobile.local", isActive: true } });
  const scheduleId = text(payload<Record<string, unknown>>(schedule).id);
  const scheduleRun = await call(owner, `/api/reports/schedules/${scheduleId}/run`, { method: "POST" });
  assert(scheduleRun.response.headers.get("content-type")?.includes("text/csv"), "Running a schedule did not produce a CSV.");
  assert(scheduleRun.bytes[0] === 0xef && scheduleRun.bytes[1] === 0xbb && scheduleRun.bytes[2] === 0xbf, "The schedule CSV is missing its UTF-8 BOM.");
  const ranSchedule = await prisma.reportSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
  assert(ranSchedule.lastRunStatus === "SUCCEEDED" && ranSchedule.lastRunAt, "The schedule run was not recorded.");
  await call(owner, `/api/reports/schedules/${scheduleId}`, { method: "PATCH", body: { isActive: false } });
  await call(owner, `/api/reports/schedules/${scheduleId}/run`, { method: "POST", expect: 409 });
  const scheduleAudit = await prisma.auditLog.count({ where: { entityId: scheduleId, action: { in: ["REPORT_SCHEDULE_CREATED", "REPORT_SCHEDULE_RUN", "REPORT_SCHEDULE_UPDATED"] } } });
  assert(scheduleAudit >= 3, "Schedule audit trail is incomplete.");
  await call(owner, `/api/reports/schedules/${scheduleId}`, { method: "DELETE" });
  console.log(`✓ report schedules create, run ${ranSchedule.lastRunRows ?? 0} rows, pause and delete with audit`);

  // 8 · workspaces render --------------------------------------------------------
  for (const path of ["/settings/controls", "/reports/schedules", "/catalog/supplier-items", "/reports/operations"]) {
    const page = await call(owner, path);
    assert(page.text.length > 2000, `${path} rendered an empty page.`);
  }
  console.log("✓ policy, schedule, supplier-item and report workspaces render");

  await prisma.product.update({ where: { id: product.id }, data: { reorderLevel: productPayload.reorderLevel, maxStockLevel: 0, preferredSupplierId: null, description: productPayload.description } });
  await cleanupFixtures(company.id);
  console.log(`Enhancements acceptance passed (${run})`);
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(async () => {
    if (sessionIds.length) await prisma.session.deleteMany({ where: { id: { in: sessionIds } } }).catch(() => undefined);
    await prisma.$disconnect();
  });
