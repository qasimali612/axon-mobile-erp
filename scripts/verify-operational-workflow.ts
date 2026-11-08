import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.OPERATIONS_TEST_BASE_URL || "http://127.0.0.1:3000";
const password = process.env.OPERATIONS_TEST_PASSWORD;
if (!password) throw new Error("OPERATIONS_TEST_PASSWORD is required.");

type Session = { cookie: string; userAgent: string };
async function login(email: string): Promise<Session> {
  const userAgent = `Axon-Operations-Control-Test/${email}`;
  const response = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": userAgent }, body: JSON.stringify({ email, password }) });
  if (!response.ok) throw new Error(`Login failed for ${email}: ${response.status} ${await response.text()}`);
  const token = (response.headers.get("set-cookie") || "").match(/axon_session=([^;,]+)/)?.[1];
  if (!token) throw new Error(`Session cookie missing for ${email}.`);
  return { cookie: `axon_session=${token}`, userAgent };
}
async function request(session: Session, path: string, options: RequestInit = {}, expected = 200) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { Cookie: session.cookie, "User-Agent": session.userAgent, ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (response.status !== expected) throw new Error(`${path}: expected ${expected}, got ${response.status}: ${text}`);
  return body;
}

async function main() {
  const [buyer, purchaseApprover, receiver, salesOfficer, salesApprover, salesPoster, accountant, controller, treasury] = await Promise.all([
    login("buyer@axonmobile.local"), login("purchase.approver@axonmobile.local"), login("receiver@axonmobile.local"),
    login("sales@axonmobile.local"), login("sales.approver@axonmobile.local"), login("sales.poster@axonmobile.local"),
    login("accountant@axonmobile.local"), login("controller@axonmobile.local"), login("treasury@axonmobile.local"),
  ]);
  console.log("✓ exact procurement, sales, and settlement actors authenticated");
  const company = await prisma.company.findUniqueOrThrow({ where: { code: "AXON" } });
  const branch = await prisma.branch.findFirstOrThrow({ where: { companyId: company.id, code: "HZR" } });
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { companyId: company.id, branchId: branch.id, isDefault: true } });
  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "SUP-001" } } });
  const customer = await prisma.customer.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "WALK-IN" } } });
  const variant = await prisma.productVariant.findUniqueOrThrow({ where: { companyId_sku: { companyId: company.id, sku: "SMS-S24-256-GRY" } }, include: { product: true } });
  const imeis = ["490154203237518", "356938035643809"];

  const poKey = "OPS-PO-20261027-S24-01";
  let order = await prisma.purchaseOrder.findUnique({ where: { companyId_idempotencyKey: { companyId: company.id, idempotencyKey: poKey } } });
  if (!order) {
    const created = await request(buyer, "/api/purchases/orders", { method: "POST", body: JSON.stringify({ branchId: branch.id, warehouseId: warehouse.id, supplierId: supplier.id, orderDate: "2026-10-27", expectedDate: "2026-10-28", currencyCode: "PKR", idempotencyKey: poKey, lines: [{ productId: variant.productId, variantId: variant.id, description: "Samsung Galaxy S24 dual-SIM operational workflow", quantity: "1", unitCost: "206000", discountAmount: "0", taxAmount: "0" }] }) }, 201);
    order = created.data;
    const retry = await request(buyer, "/api/purchases/orders", { method: "POST", body: JSON.stringify({ branchId: branch.id, warehouseId: warehouse.id, supplierId: supplier.id, orderDate: "2026-10-27", currencyCode: "PKR", idempotencyKey: poKey, lines: [{ productId: variant.productId, variantId: variant.id, description: "Samsung Galaxy S24 dual-SIM operational workflow", quantity: "1", unitCost: "206000", discountAmount: "0", taxAmount: "0" }] }) }, 201);
    if (retry.data.id !== order!.id) throw new Error("Purchase-order idempotency returned a different record.");
    console.log("✓ purchase order created idempotently");
  }
  if (!order) throw new Error("Purchase order fixture could not be created or loaded.");
  if (order.status === "DRAFT") {
    await request(buyer, `/api/purchases/orders/${order.id}/submit`, { method: "POST" });
    await request(buyer, `/api/purchases/orders/${order.id}/approve`, { method: "POST" }, 403);
    order = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } });
    console.log("✓ purchase preparer submitted but could not approve");
  }
  if (order.status === "SUBMITTED") {
    await request(purchaseApprover, `/api/purchases/orders/${order.id}/approve`, { method: "POST" });
    order = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } });
    console.log("✓ independent procurement approver approved order");
  }

  const receiptKey = "OPS-GRN-20261027-S24-01";
  let receipt = await prisma.purchaseReceipt.findUnique({ where: { companyId_idempotencyKey: { companyId: company.id, idempotencyKey: receiptKey } } });
  if (!receipt) {
    const orderLine = await prisma.purchaseOrderLine.findFirstOrThrow({ where: { orderId: order.id } });
    const created = await request(buyer, "/api/purchases/receipts", { method: "POST", body: JSON.stringify({ branchId: branch.id, warehouseId: warehouse.id, supplierId: supplier.id, purchaseOrderId: order.id, receiptDate: "2026-10-27", invoiceDate: "2026-10-27", supplierInvoiceNumber: "SUP-INV-S24-001", currencyCode: "PKR", idempotencyKey: receiptKey, lines: [{ orderLineId: orderLine.id, productId: variant.productId, variantId: variant.id, description: "One physical dual-SIM Samsung Galaxy S24", quantity: "1", unitCost: "206000", taxAmount: "0", units: [{ identifiers: [{ type: "IMEI", value: imeis[0], slot: 1, isPrimary: true }, { type: "IMEI", value: imeis[1], slot: 2, isPrimary: false }] }] }] }) }, 201);
    receipt = created.data;
    console.log("✓ goods receipt staged one physical unit with two unique IMEIs");
  }
  if (!receipt) throw new Error("Purchase receipt fixture could not be created or loaded.");
  if (receipt.status === "DRAFT") {
    await request(buyer, `/api/purchases/receipts/${receipt.id}/submit`, { method: "POST" });
    receipt = await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receipt.id } });
  }
  if (receipt.status === "SUBMITTED") {
    await request(purchaseApprover, `/api/purchases/receipts/${receipt.id}/approve`, { method: "POST" });
    receipt = await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receipt.id } });
  }
  if (receipt.status === "APPROVED") {
    await request(receiver, `/api/purchases/receipts/${receipt.id}/post`, { method: "POST" });
    receipt = await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receipt.id } });
    console.log("✓ third-role receiver atomically posted receipt, inventory, and GL");
  }
  const receivedUnit = await prisma.physicalStockUnit.findFirstOrThrow({ where: { companyId: company.id, receiptUnits: { some: { receiptLine: { receiptId: receipt.id } } } }, include: { identifiers: true } });
  if (receivedUnit.identifiers.length !== 2) throw new Error("Expected two identifiers on one physical stock unit.");
  const receiptMovement = await prisma.inventoryMovement.findFirstOrThrow({ where: { sourceDocumentId: receipt.id, stockUnitId: receivedUnit.id } });
  if (receiptMovement.quantity.toFixed(4) !== "1.0000") throw new Error("Dual-SIM device did not count as exactly one inventory unit.");
  console.log("✓ dual-SIM unit has quantity 1 and two identifiers");

  const salesKey = "OPS-SI-20261027-S24-01";
  let invoice = await prisma.salesInvoice.findUnique({ where: { companyId_idempotencyKey: { companyId: company.id, idempotencyKey: salesKey } } });
  if (!invoice) {
    const created = await request(salesOfficer, "/api/sales/invoices", { method: "POST", body: JSON.stringify({ branchId: branch.id, warehouseId: warehouse.id, customerId: customer.id, invoiceDate: "2026-10-27", currencyCode: "PKR", idempotencyKey: salesKey, lines: [{ productId: variant.productId, variantId: variant.id, description: "Samsung Galaxy S24 dual-SIM sale", quantity: "1", unitPrice: "224999", discountAmount: "0", taxAmount: "0", stockUnitIds: [receivedUnit.id] }] }) }, 201);
    invoice = created.data;
    console.log("✓ sales draft reserved the actual physical unit");
  }
  if (!invoice) throw new Error("Sales invoice fixture could not be created or loaded.");
  if (invoice.status === "DRAFT") {
    await request(salesOfficer, `/api/sales/invoices/${invoice.id}/submit`, { method: "POST" });
    await request(salesOfficer, `/api/sales/invoices/${invoice.id}/approve`, { method: "POST" }, 403);
    invoice = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
  }
  if (invoice.status === "SUBMITTED") {
    await request(salesApprover, `/api/sales/invoices/${invoice.id}/approve`, { method: "POST" });
    invoice = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
  }
  if (invoice.status === "APPROVED") {
    await request(salesPoster, `/api/sales/invoices/${invoice.id}/post`, { method: "POST" });
    invoice = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    console.log("✓ independent sales poster atomically issued stock, revenue, COGS, and GL");
  }

  const paymentKey = "OPS-RC-20261027-S24-01";
  const bank = await prisma.bankAccount.findFirstOrThrow({ where: { companyId: company.id, branchId: branch.id, isActive: true } });
  let payment = await prisma.payment.findUnique({ where: { companyId_idempotencyKey: { companyId: company.id, idempotencyKey: paymentKey } } });
  if (!payment) {
    const created = await request(accountant, "/api/payments", { method: "POST", body: JSON.stringify({ branchId: branch.id, customerId: customer.id, bankAccountId: bank.id, paymentDate: "2026-10-27", direction: "CUSTOMER_RECEIPT", currencyCode: "PKR", amount: "224999", reference: "BANK-OPS-001", idempotencyKey: paymentKey, allocations: [{ salesInvoiceId: invoice.id, amount: "224999" }] }) }, 201);
    payment = created.data;
  }
  if (!payment) throw new Error("Payment fixture could not be created or loaded.");
  if (payment.status === "DRAFT") {
    await request(accountant, `/api/payments/${payment.id}/submit`, { method: "POST" });
    payment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  }
  if (payment.status === "SUBMITTED") {
    await request(controller, `/api/payments/${payment.id}/approve`, { method: "POST" });
    payment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  }
  if (payment.status === "APPROVED") {
    await request(treasury, `/api/payments/${payment.id}/post`, { method: "POST" });
    payment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    console.log("✓ payment was accrued once, then independently settled through bank and party ledgers");
  }

  const finalUnit = await prisma.physicalStockUnit.findUniqueOrThrow({ where: { id: receivedUnit.id } });
  const balance = await prisma.stockBalance.findFirstOrThrow({ where: { companyId: company.id, warehouseId: warehouse.id, variantId: variant.id, lotId: null } });
  const movements = await prisma.inventoryMovement.findMany({ where: { companyId: company.id, stockUnitId: receivedUnit.id } });
  // The warehouse balance is shared with every other suite, so it is reconciled to the movement
  // ledger for the same variant/warehouse instead of being assumed to be zero.
  const ledgerRows = await prisma.inventoryMovement.findMany({ where: { companyId: company.id, warehouseId: warehouse.id, variantId: variant.id, lotId: null }, select: { quantity: true } });
  const expectedQuantity = ledgerRows.reduce((sum, row) => sum.plus(row.quantity), movements[0].quantity.mul(0));
  const journals = await prisma.journalEntry.findMany({ where: { sourceDocumentId: { in: [receipt.id, invoice.id, payment.id] }, status: "POSTED" }, include: { lines: true } });
  if (finalUnit.status !== "SOLD") throw new Error(`Final physical unit state is ${finalUnit.status}, expected SOLD.`);
  if (balance.quantity.toFixed(4) !== expectedQuantity.toFixed(4)) throw new Error(`Stock balance ${balance.quantity.toFixed(4)} does not match the movement ledger total ${expectedQuantity.toFixed(4)}.`);
  if (movements.length !== 2 || movements.reduce((sum, movement) => sum.plus(movement.quantity), movements[0].quantity.mul(0)).toFixed(4) !== "0.0000") throw new Error("Receipt and sale movement ledger does not net to zero.");
  if (journals.length !== 3 || journals.some((journal) => journal.totalDebit.toFixed(4) !== journal.totalCredit.toFixed(4))) throw new Error("Operational source journals are missing or unbalanced.");
  const audits = await prisma.auditLog.count({ where: { entityId: { in: [order.id, receipt.id, invoice.id, payment.id] } } });
  if (audits < 12) throw new Error("Operational workflow audit custody is incomplete.");
  console.log("✓ movement ledger, zero ending stock, balanced source journals, and audit custody verified");
  console.log("Operational workflow verification passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
