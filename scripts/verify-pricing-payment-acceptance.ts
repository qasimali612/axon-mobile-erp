import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.OPERATIONS_TEST_BASE_URL || "http://127.0.0.1:3000";
const run = Date.now().toString(36).toUpperCase();
const sessionIds: string[] = [];
const priceListIds: string[] = [];
const paymentMethodIds: string[] = [];
const customerIds: string[] = [];
const invoiceIds: string[] = [];
const paymentIds: string[] = [];
type Session = { cookie: string; userAgent: string };

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
async function login(email: string, companyId: string, branchId: string, warehouseId: string): Promise<Session> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(32).toString("base64url");
  const userAgent = `Axon-Pricing-Acceptance/${run}/${email}`;
  const row = await prisma.session.create({ data: { tokenHash: createHash("sha256").update(token).digest("hex"), userId: user.id, activeCompanyId: companyId, activeBranchId: branchId, activeWarehouseId: warehouseId, ipAddress: "127.0.0.1", userAgent, expiresAt: new Date(Date.now() + 3_600_000) } });
  sessionIds.push(row.id);
  return { cookie: `axon_session=${token}`, userAgent };
}
async function request(session: Session, path: string, options: { method?: string; body?: unknown; expected?: number | number[] } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: { Cookie: session.cookie, Origin: baseUrl, "User-Agent": session.userAgent, ...(options.body === undefined ? {} : { "content-type": "application/json" }) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const body = text && response.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text;
  const expected = Array.isArray(options.expected ?? 200) ? options.expected as number[] : [options.expected ?? 200];
  if (!expected.includes(response.status)) throw new Error(`${options.method || "GET"} ${path}: expected ${expected.join("/")}, got ${response.status}: ${text}`);
  return body;
}

async function main() {
  const company = await prisma.company.findUniqueOrThrow({ where: { code: "AXON" } });
  const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "HZR-MAIN" } } });
  const owner = await login("owner@axonmobile.local", company.id, warehouse.branchId, warehouse.id);
  const buyer = await login("buyer@axonmobile.local", company.id, warehouse.branchId, warehouse.id);

  const cashAccount = await prisma.account.findFirstOrThrow({ where: { companyId: company.id, accountType: "CASH", isActive: true } });
  const bankAccount = await prisma.bankAccount.findFirst({ where: { companyId: company.id, isActive: true } });
  const variants = await prisma.productVariant.findMany({ where: { companyId: company.id, isActive: true }, select: { id: true, sku: true, retailPrice: true, minimumSellingPrice: true }, take: 2, orderBy: { sku: "asc" } });
  assert(variants.length >= 2, "At least two active variants are required for pricing acceptance.");

  await request(buyer, "/api/catalog/price-lists", { method: "POST", body: { code: `DENY-${run}`, name: `Denied list ${run}`, priceLevel: "RETAIL", currencyCode: "PKR", isDefault: false, isActive: true, items: [] }, expected: 403 });
  await request(buyer, "/api/catalog/payment-methods", { method: "POST", body: { code: `DENY-${run}`, name: `Denied method ${run}`, methodType: "CASH", cashAccountId: cashAccount.id, bankAccountId: null, requiresReference: false, sequence: 1, isActive: true }, expected: 403 });
  console.log("✓ pricing and payment master mutations reject users without the matching permission");

  const listBody = {
    code: `PL-${run}`,
    name: `Acceptance retail ${run}`,
    priceLevel: "WHOLESALE",
    currencyCode: "PKR",
    isDefault: false,
    isActive: true,
    effectiveFrom: null,
    effectiveTo: null,
    notes: `Pricing acceptance ${run}`,
    items: [
      { variantId: variants[0].id, price: "1500.0000", minimumPrice: "1400.0000" },
      { variantId: variants[1].id, price: "2500.0000", minimumPrice: null },
    ],
  };
  const list = await request(owner, "/api/catalog/price-lists", { method: "POST", body: listBody, expected: 201 });
  priceListIds.push(list.data.id);
  await request(owner, "/api/catalog/price-lists", { method: "POST", body: { ...listBody, name: `Acceptance duplicate ${run}` }, expected: 409 });
  await request(owner, "/api/catalog/price-lists", { method: "POST", body: { ...listBody, code: `PLB-${run}`, name: `Acceptance bad ${run}`, items: [{ variantId: variants[0].id, price: "100.0000", minimumPrice: "200.0000" }] }, expected: 422 });
  await request(owner, "/api/catalog/price-lists", { method: "POST", body: { ...listBody, code: `PLC-${run}`, name: `Acceptance window ${run}`, effectiveFrom: "2026-05-10", effectiveTo: "2026-05-01", items: [] }, expected: 422 });
  await request(owner, "/api/catalog/price-lists", { method: "POST", body: { ...listBody, code: `PLD-${run}`, name: `Acceptance variant ${run}`, items: [{ variantId: variants[0].id, price: "10.0000", minimumPrice: null }, { variantId: variants[0].id, price: "20.0000", minimumPrice: null }] }, expected: 422 });
  console.log("✓ price list creation, duplicate, window, and duplicate-line validation passed");

  const detail = await request(owner, `/api/catalog/price-lists/${list.data.id}`);
  assert(detail.data.items.length === 2, "Price list detail did not return both normalized lines.");
  const updated = await request(owner, `/api/catalog/price-lists/${list.data.id}`, {
    method: "PATCH",
    body: { ...listBody, isDefault: true, items: [{ variantId: variants[0].id, price: "1550.0000", minimumPrice: "1450.0000" }, { variantId: variants[1].id, price: "2600.0000", minimumPrice: "2450.0000" }] },
  });
  assert(updated.data.isDefault === true, "Price list default flag was not stored.");
  const defaultCount = await prisma.priceList.count({ where: { companyId: company.id, isDefault: true } });
  assert(defaultCount === 1, `Expected exactly one default price list, found ${defaultCount}.`);
  console.log("✓ price list update, normalized line replacement, and single default enforcement passed");

  const customer = await prisma.customer.upsert({
    where: { companyId_code: { companyId: company.id, code: `PLC-${run}` } },
    create: { companyId: company.id, code: `PLC-${run}`, name: `Pricing customer ${run}`, customerType: "WHOLESALE", priceListId: list.data.id },
    update: { priceListId: list.data.id },
  });
  customerIds.push(customer.id);
  const resolved = await request(owner, `/api/catalog/prices/resolve?customerId=${customer.id}&variantId=${variants[0].id}`);
  assert(resolved.data.source === "PRICE_LIST", "Price resolution ignored the customer price list.");
  assert(Number(resolved.data.price) === 1550, `Resolved price was ${resolved.data.price}, expected 1550.`);
  assert(Number(resolved.data.minimumPrice) === 1450, "Resolved minimum price did not come from the price list line.");
  const fallbackVariant = await prisma.productVariant.findFirstOrThrow({ where: { companyId: company.id, isActive: true, id: { notIn: [variants[0].id, variants[1].id] } }, select: { id: true, retailPrice: true } });
  const explicit = await request(owner, `/api/catalog/prices/resolve?customerId=${customer.id}&variantId=${variants[1].id}&priceListId=${list.data.id}&date=${new Date().toISOString().slice(0, 10)}`);
  assert(explicit.data.priceListId === list.data.id, "Explicit price list override was ignored.");
  assert(Number(explicit.data.price) === 2600, `Explicit list price was ${explicit.data.price}, expected 2600.`);
  const fallback = await request(owner, `/api/catalog/prices/resolve?customerId=${customer.id}&variantId=${fallbackVariant.id}`);
  assert(fallback.data.source === "VARIANT", "Unlisted variant did not fall back to the variant retail price.");
  assert(Number(fallback.data.price) === Number(fallbackVariant.retailPrice), "Variant fallback price mismatch.");
  console.log("✓ server price resolution honours an explicit list, then the customer list, then the variant retail price");

  await request(owner, `/api/catalog/price-lists/${list.data.id}`, { method: "PATCH", body: { ...listBody, isDefault: true, isActive: false, items: [] }, expected: 409 });
  console.log("✓ deactivating a price list assigned to active customers is blocked");

  const cashMethodBody = { code: `CASH-${run}`, name: `Counter cash ${run}`, methodType: "CASH", cashAccountId: cashAccount.id, bankAccountId: null, requiresReference: false, sequence: 10, isActive: true, notes: null };
  const cashMethod = await request(owner, "/api/catalog/payment-methods", { method: "POST", body: cashMethodBody, expected: 201 });
  paymentMethodIds.push(cashMethod.data.id);
  await request(owner, "/api/catalog/payment-methods", { method: "POST", body: { ...cashMethodBody, name: `Duplicate ${run}` }, expected: 409 });
  await request(owner, "/api/catalog/payment-methods", { method: "POST", body: { ...cashMethodBody, code: `BAD-${run}`, name: `Bad cash ${run}`, cashAccountId: null, bankAccountId: bankAccount?.id ?? null }, expected: 422 });
  if (bankAccount) {
    const cardMethod = await request(owner, "/api/catalog/payment-methods", { method: "POST", body: { code: `CARD-${run}`, name: `Card ${run}`, methodType: "CARD", cashAccountId: null, bankAccountId: bankAccount.id, requiresReference: true, sequence: 20, isActive: true, notes: null }, expected: 201 });
    paymentMethodIds.push(cardMethod.data.id);
    await request(owner, "/api/catalog/payment-methods", { method: "POST", body: { code: `BAD2-${run}`, name: `Bad card ${run}`, methodType: "CARD", cashAccountId: cashAccount.id, bankAccountId: null, requiresReference: false, sequence: 30, isActive: true, notes: null }, expected: 422 });
  }
  console.log("✓ payment method creation, duplicate, and settlement-account validation passed");

  const payment = await request(owner, "/api/payments", {
    method: "POST",
    body: { branchId: warehouse.branchId, customerId: customer.id, supplierId: null, paymentMethodId: cashMethod.data.id, paymentDate: new Date().toISOString().slice(0, 10), direction: "CUSTOMER_RECEIPT", currencyCode: "PKR", amount: "500.0000", reference: `RC-${run}`, notes: null, idempotencyKey: `pricing-${run}-1`, allocations: [] },
    expected: 201,
  });
  paymentIds.push(payment.data.id);
  const storedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.data.id } });
  assert(storedPayment.paymentMethodId === cashMethod.data.id, "Payment did not store the payment method.");
  assert(storedPayment.cashAccountId === cashAccount.id, "Payment did not derive the cash account from the method.");
  await request(owner, "/api/catalog/payment-methods", { method: "POST", body: { ...cashMethodBody, code: `REF-${run}`, name: `Cheque ${run}`, methodType: bankAccount ? "CHEQUE" : "CASH", cashAccountId: bankAccount ? null : cashAccount.id, bankAccountId: bankAccount?.id ?? null, requiresReference: true, sequence: 40 }, expected: 201 });
  const refMethodId = (await prisma.paymentMethod.findFirstOrThrow({ where: { companyId: company.id, code: `REF-${run}` } })).id;
  paymentMethodIds.push(refMethodId);
  await request(owner, "/api/payments", {
    method: "POST",
    body: { branchId: warehouse.branchId, customerId: customer.id, supplierId: null, paymentMethodId: refMethodId, paymentDate: new Date().toISOString().slice(0, 10), direction: "CUSTOMER_RECEIPT", currencyCode: "PKR", amount: "250.0000", reference: null, notes: null, idempotencyKey: `pricing-${run}-2`, allocations: [] },
    expected: 422,
  });
  console.log("✓ payments settle through the payment method, derive the account, and enforce the reference rule");

  await request(owner, `/api/catalog/payment-methods/${cashMethod.data.id}`, { method: "PATCH", body: { ...cashMethodBody, isActive: false }, expected: 409 });
  console.log("✓ deactivating a payment method used by an open payment is blocked");

  const stocked = await prisma.physicalStockUnit.findFirst({
    where: { companyId: company.id, status: "IN_STOCK", currentBranchId: warehouse.branchId, currentWarehouseId: warehouse.id, variantId: { in: [variants[0].id, variants[1].id] } },
    select: { id: true, variantId: true, productId: true },
  });
  if (stocked) {
    const listPrice = stocked.variantId === variants[0].id ? "1550.0000" : "2600.0000";
    const belowFloor = await request(owner, "/api/sales/invoices", {
      method: "POST",
      body: { branchId: warehouse.branchId, warehouseId: warehouse.id, customerId: customer.id, priceListId: list.data.id, invoiceDate: new Date().toISOString().slice(0, 10), dueDate: null, currencyCode: "PKR", notes: null, idempotencyKey: `pricing-${run}-3`, lines: [{ productId: stocked.productId, variantId: stocked.variantId, description: `Pricing acceptance ${run}`, quantity: "1.0000", unitPrice: "100.0000", discountAmount: "0", stockUnitIds: [stocked.id] }] },
      expected: 409,
    });
    assert(/minimum/i.test(JSON.stringify(belowFloor)), "Below-floor invoice rejection did not explain the minimum price rule.");
    const invoice = await request(owner, "/api/sales/invoices", {
      method: "POST",
      body: { branchId: warehouse.branchId, warehouseId: warehouse.id, customerId: customer.id, priceListId: list.data.id, invoiceDate: new Date().toISOString().slice(0, 10), dueDate: null, currencyCode: "PKR", notes: null, idempotencyKey: `pricing-${run}-4`, lines: [{ productId: stocked.productId, variantId: stocked.variantId, description: `Pricing acceptance ${run}`, quantity: "1.0000", unitPrice: listPrice, discountAmount: "0", stockUnitIds: [stocked.id] }] },
      expected: 201,
    });
    invoiceIds.push(invoice.data.id);
    const storedInvoice = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.data.id }, include: { lines: true } });
    assert(storedInvoice.priceListId === list.data.id, "Sales invoice did not persist the price list.");
    assert(Number(storedInvoice.lines[0].unitPrice) === Number(listPrice), "Sales invoice line price was not stored exactly.");
    await request(owner, `/api/sales/invoices/${invoice.data.id}/cancel`, { method: "POST", body: { reason: "Pricing acceptance cleanup" }, expected: [200, 201] });
    console.log("✓ sales invoices enforce the price list minimum and record the list used");
  } else {
    console.log("· sales invoice price-list floor check skipped (no stocked unit in the acceptance warehouse)");
  }

  const auditActions = await prisma.auditLog.findMany({ where: { companyId: company.id, entityId: { in: [...priceListIds, ...paymentMethodIds] } }, select: { action: true } });
  const actions = new Set(auditActions.map((row) => row.action));
  assert(actions.has("PRICE_LIST_CREATED") && actions.has("PRICE_LIST_UPDATED") && actions.has("PAYMENT_METHOD_CREATED"), "Pricing or payment master audit history is missing.");
  const pricePage = await request(owner, "/catalog/price-lists");
  assert(String(pricePage).includes("Price lists"), "Price list workspace did not render.");
  const methodPage = await request(owner, "/catalog/payment-methods");
  assert(String(methodPage).includes("Payment methods"), "Payment method workspace did not render.");
  console.log("✓ audit history and authenticated pricing workspaces rendered");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (paymentIds.length) await prisma.paymentAllocation.deleteMany({ where: { paymentId: { in: paymentIds } } }).catch(() => undefined);
  if (paymentIds.length) await prisma.auditLog.deleteMany({ where: { entityId: { in: paymentIds } } }).catch(() => undefined);
  if (paymentIds.length) await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } }).catch(() => undefined);
  if (customerIds.length) await prisma.customer.updateMany({ where: { id: { in: customerIds } }, data: { priceListId: null } }).catch(() => undefined);
  if (sessionIds.length) await prisma.session.deleteMany({ where: { id: { in: sessionIds } } }).catch(() => undefined);
  for (const id of [...priceListIds].reverse()) await prisma.priceList.delete({ where: { id } }).catch(() => undefined);
  for (const id of [...paymentMethodIds].reverse()) await prisma.paymentMethod.delete({ where: { id } }).catch(() => undefined);
  if (customerIds.length) await prisma.customer.deleteMany({ where: { id: { in: customerIds } } }).catch(() => undefined);
  await prisma.$disconnect();
});
