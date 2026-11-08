import { createHash, randomBytes } from "node:crypto";
import {
  InventoryMovementType,
  OperationalDocumentStatus,
  PrismaClient,
} from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.OPERATIONS_TEST_BASE_URL || "http://127.0.0.1:3000";
const run = (process.env.REVERSAL_RUN_ID || Date.now().toString(36)).replace(/[^a-z0-9-]/gi, "").slice(-14);
const postingDate = process.env.REVERSAL_POSTING_DATE || "2026-10-28";
const sessionIds: string[] = [];
let customerCreditRestore: { id: string; value: string } | null = null;

type Session = { cookie: string; userAgent: string };
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function sessionFor(email: string, companyId: string, branchId: string, warehouseId: string): Promise<Session> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(32).toString("base64url");
  const userAgent = `Axon-Reversal-Acceptance/${run}/${email}`;
  const session = await prisma.session.create({
    data: {
      tokenHash: createHash("sha256").update(token).digest("hex"),
      userId: user.id,
      activeCompanyId: companyId,
      activeBranchId: branchId,
      activeWarehouseId: warehouseId,
      ipAddress: "127.0.0.1",
      userAgent,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  sessionIds.push(session.id);
  return { cookie: `axon_session=${token}`, userAgent };
}

async function request(session: Session, path: string, options: RequestInit = {}, expected: number | number[] = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Cookie: session.cookie,
      Origin: baseUrl,
      "User-Agent": session.userAgent,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = text && response.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text;
  const accepted = Array.isArray(expected) ? expected : [expected];
  if (!accepted.includes(response.status)) throw new Error(`${path}: expected ${accepted.join("/")}, got ${response.status}: ${text}`);
  return { status: response.status, body };
}

async function assertJournalPair(sourceId: string, reversalId: string) {
  const [source, reversal] = await Promise.all([
    prisma.journalEntry.findUniqueOrThrow({ where: { id: sourceId }, include: { lines: { orderBy: { lineNumber: "asc" } } } }),
    prisma.journalEntry.findUniqueOrThrow({ where: { id: reversalId }, include: { lines: { orderBy: { lineNumber: "asc" } } } }),
  ]);
  assert(source.status === "REVERSED", `Source journal ${source.voucherNumber} was not marked REVERSED.`);
  assert(reversal.status === "POSTED" && reversal.reversalOfId === source.id, `Reversal journal ${reversal.voucherNumber} is not linked and posted.`);
  assert(source.lines.length === reversal.lines.length, "Journal reversal line count differs from its source.");
  for (let index = 0; index < source.lines.length; index += 1) {
    const original = source.lines[index];
    const opposite = reversal.lines[index];
    assert(original.accountId === opposite.accountId, `Journal reversal line ${index + 1} changed account.`);
    assert(original.baseDebit.eq(opposite.baseCredit) && original.baseCredit.eq(opposite.baseDebit), `Journal reversal line ${index + 1} is not equal and opposite.`);
  }
}

async function main() {
  const company = await prisma.company.findUniqueOrThrow({ where: { code: "AXON" } });
  const branch = await prisma.branch.findFirstOrThrow({ where: { companyId: company.id, code: "HZR" } });
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { companyId: company.id, branchId: branch.id, isDefault: true } });
  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "SUP-001" } } });
  const customer = await prisma.customer.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "WALK-IN" } } });
  customerCreditRestore = { id: customer.id, value: customer.creditLimit.toString() };
  await prisma.customer.update({ where: { id: customer.id }, data: { creditLimit: "10000000" } });
  const variant = await prisma.productVariant.findUniqueOrThrow({
    where: { companyId_sku: { companyId: company.id, sku: "ANK-A2633-WHT" } },
    include: { product: { include: { taxRule: true } } },
  });
  assert(variant.product.trackingMethod === "QUANTITY", "Reversal fixture must use a quantity-tracked product.");

  const [owner, buyer, purchaseApprover, receiver, salesOfficer, salesApprover, salesPoster] = await Promise.all([
    sessionFor("owner@axonmobile.local", company.id, branch.id, warehouse.id),
    sessionFor("buyer@axonmobile.local", company.id, branch.id, warehouse.id),
    sessionFor("purchase.approver@axonmobile.local", company.id, branch.id, warehouse.id),
    sessionFor("receiver@axonmobile.local", company.id, branch.id, warehouse.id),
    sessionFor("sales@axonmobile.local", company.id, branch.id, warehouse.id),
    sessionFor("sales.approver@axonmobile.local", company.id, branch.id, warehouse.id),
    sessionFor("sales.poster@axonmobile.local", company.id, branch.id, warehouse.id),
  ]);
  console.log("✓ isolated workflow sessions created for seven active actors");

  const receiptBalanceBefore = await prisma.stockBalance.findFirstOrThrow({
    where: { companyId: company.id, branchId: branch.id, warehouseId: warehouse.id, productId: variant.productId, variantId: variant.id, lotId: null },
  });
  const poPayload = {
    branchId: branch.id,
    warehouseId: warehouse.id,
    supplierId: supplier.id,
    orderDate: postingDate,
    expectedDate: postingDate,
    supplierReference: `REV-${run}`,
    paymentTermsDays: 0,
    currencyCode: company.currencyCode,
    exchangeRate: "1",
    documentDiscount: "0",
    freightTotal: "0",
    otherCharges: "0",
    notes: "Automated linked-reversal acceptance fixture",
    idempotencyKey: `rev-po-${run}`,
    lines: [{
      productId: variant.productId,
      variantId: variant.id,
      taxRuleId: variant.product.taxRuleId,
      description: "Reversal acceptance receipt stock",
      quantity: "2",
      unitCost: "3500",
      discountAmount: "0",
      taxRate: String(variant.product.taxRule?.rate || 0),
    }],
  };
  const createdOrder = await request(buyer, "/api/purchases/orders", { method: "POST", body: JSON.stringify(poPayload) }, 201);
  const orderId = createdOrder.body.data.id as string;
  await request(buyer, `/api/purchases/orders/${orderId}/submit`, { method: "POST" });
  await request(purchaseApprover, `/api/purchases/orders/${orderId}/approve`, { method: "POST" });
  const order = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: orderId }, include: { lines: true } });
  const receiptPayload = {
    branchId: branch.id,
    warehouseId: warehouse.id,
    supplierId: supplier.id,
    purchaseOrderId: order.id,
    receiptType: "PO_BASED",
    receiptDate: postingDate,
    invoiceDate: postingDate,
    dueDate: postingDate,
    supplierInvoiceNumber: `REV-INV-${run}`,
    supplierDeliveryNote: `REV-DN-${run}`,
    allowOverReceipt: false,
    requiresInspection: false,
    currencyCode: company.currencyCode,
    documentDiscount: "0",
    freightTotal: "0",
    otherCharges: "0",
    notes: "Receipt will be reversed by acceptance verification",
    idempotencyKey: `rev-grn-${run}`,
    lines: [{
      orderLineId: order.lines[0].id,
      productId: variant.productId,
      variantId: variant.id,
      taxRuleId: variant.product.taxRuleId,
      description: "Two quantity-tracked units",
      quantity: "2",
      acceptedQuantity: "2",
      rejectedQuantity: "0",
      unitCost: "3500",
      discountAmount: "0",
      taxRate: String(variant.product.taxRule?.rate || 0),
      units: [],
    }],
  };
  const createdReceipt = await request(buyer, "/api/purchases/receipts", { method: "POST", body: JSON.stringify(receiptPayload) }, 201);
  const receiptId = createdReceipt.body.data.id as string;
  await request(buyer, `/api/purchases/receipts/${receiptId}/submit`, { method: "POST" });
  await request(purchaseApprover, `/api/purchases/receipts/${receiptId}/approve`, { method: "POST" });
  await request(receiver, `/api/purchases/receipts/${receiptId}/post`, { method: "POST" });
  const postedReceipt = await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receiptId } });
  assert(postedReceipt.status === OperationalDocumentStatus.POSTED && postedReceipt.journalEntryId, "Receipt fixture was not posted.");
  const receiptBalancePosted = await prisma.stockBalance.findFirstOrThrow({ where: { id: receiptBalanceBefore.id } });
  assert(receiptBalancePosted.quantity.eq(receiptBalanceBefore.quantity.plus(2)), "Receipt fixture did not add exactly two units.");

  await request(buyer, `/api/purchases/receipts/${receiptId}/reverse`, { method: "POST", body: JSON.stringify({ postingDate, reason: "Unauthorized buyer reversal attempt" }) }, 403);
  await request(receiver, `/api/purchases/receipts/${receiptId}/reverse`, { method: "POST", body: JSON.stringify({ postingDate, reason: "Original posting officer reversal attempt" }) }, 409);
  await request(owner, `/api/purchases/receipts/${receiptId}/reverse`, { method: "POST", body: JSON.stringify({ postingDate: "2020-01-01", reason: "Closed accounting period must reject reversal" }) }, 409);
  const receiptReverse = await request(owner, `/api/purchases/receipts/${receiptId}/reverse`, { method: "POST", body: JSON.stringify({ postingDate, reason: "Acceptance correction reverses the test receipt" }) });
  const receiptReversalId = receiptReverse.body.data.id as string;
  const receiptRepeat = await request(owner, `/api/purchases/receipts/${receiptId}/reverse`, { method: "POST", body: JSON.stringify({ postingDate, reason: "Acceptance correction reverses the test receipt" }) });
  assert(receiptRepeat.body.data.id === receiptReversalId, "Repeated receipt reversal did not return the same linked document.");

  const [reversedReceipt, receiptReversal, receiptBalanceAfter, orderAfter] = await Promise.all([
    prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receiptId } }),
    prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receiptReversalId } }),
    prisma.stockBalance.findFirstOrThrow({ where: { id: receiptBalanceBefore.id } }),
    prisma.purchaseOrder.findUniqueOrThrow({ where: { id: orderId }, include: { lines: true } }),
  ]);
  assert(reversedReceipt.status === OperationalDocumentStatus.REVERSED, "Source receipt was not marked REVERSED.");
  assert(receiptReversal.status === OperationalDocumentStatus.POSTED && receiptReversal.reversalOfId === receiptId, "Linked receipt reversal is invalid.");
  assert(receiptReversal.grandTotal.eq(reversedReceipt.grandTotal.negated()), "Receipt reversal total is not equal and opposite.");
  assert(receiptBalanceAfter.quantity.eq(receiptBalanceBefore.quantity) && receiptBalanceAfter.inventoryValue.eq(receiptBalanceBefore.inventoryValue), "Receipt reversal did not restore the exact stock quantity and value.");
  assert(orderAfter.status === OperationalDocumentStatus.APPROVED && orderAfter.lines[0].receivedQuantity.eq(0), "Receipt reversal did not restore purchase-order fulfillment.");
  assert(reversedReceipt.journalEntryId && receiptReversal.journalEntryId, "Receipt reversal journal links are missing.");
  await assertJournalPair(reversedReceipt.journalEntryId, receiptReversal.journalEntryId);
  const receiptOriginalMovements = await prisma.inventoryMovement.findMany({ where: { sourceDocumentId: receiptId } });
  const receiptReverseMovements = await prisma.inventoryMovement.findMany({ where: { sourceDocumentId: receiptReversalId } });
  assert(receiptOriginalMovements.length === receiptReverseMovements.length && receiptReverseMovements.every((movement) => movement.movementType === InventoryMovementType.PURCHASE_RETURN && receiptOriginalMovements.some((source) => source.id === movement.reversalOfId)), "Receipt movement reversals are incomplete or duplicated.");
  console.log("✓ receipt reversal enforced permission, segregation, open-period, exact-once, PO, stock, journal, and movement controls");

  const saleBalanceBefore = await prisma.stockBalance.findFirstOrThrow({ where: { id: receiptBalanceBefore.id } });
  const salesUser = await prisma.user.findUniqueOrThrow({ where: { email: "sales@axonmobile.local" } });
  const salePayload = {
    branchId: branch.id,
    warehouseId: warehouse.id,
    customerId: customer.id,
    salespersonId: salesUser.id,
    invoiceDate: postingDate,
    dueDate: postingDate,
    currencyCode: company.currencyCode,
    notes: "Sales reversal acceptance fixture",
    idempotencyKey: `rev-sale-${run}`,
    lines: [{
      productId: variant.productId,
      variantId: variant.id,
      description: "One quantity-tracked unit",
      quantity: "1",
      unitPrice: String(variant.retailPrice),
      discountAmount: "0",
      stockUnitIds: [],
    }],
  };
  const createdSale = await request(salesOfficer, "/api/sales/invoices", { method: "POST", body: JSON.stringify(salePayload) }, 201);
  const invoiceId = createdSale.body.data.id as string;
  await request(salesOfficer, `/api/sales/invoices/${invoiceId}/submit`, { method: "POST" });
  await request(salesApprover, `/api/sales/invoices/${invoiceId}/approve`, { method: "POST" });
  await request(salesPoster, `/api/sales/invoices/${invoiceId}/post`, { method: "POST" });
  const postedInvoice = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
  assert(postedInvoice.status === OperationalDocumentStatus.POSTED && postedInvoice.journalEntryId, "Sales fixture was not posted.");
  const saleBalancePosted = await prisma.stockBalance.findFirstOrThrow({ where: { id: saleBalanceBefore.id } });
  assert(saleBalancePosted.quantity.eq(saleBalanceBefore.quantity.minus(1)), "Sales fixture did not issue exactly one unit.");

  await request(salesOfficer, `/api/sales/invoices/${invoiceId}/reverse`, { method: "POST", body: JSON.stringify({ postingDate, reason: "Unauthorized sales preparer reversal" }) }, 403);
  await request(salesPoster, `/api/sales/invoices/${invoiceId}/reverse`, { method: "POST", body: JSON.stringify({ postingDate, reason: "Original posting officer reversal attempt" }) }, 409);
  await request(owner, `/api/sales/invoices/${invoiceId}/reverse`, { method: "POST", body: JSON.stringify({ postingDate: "2020-01-01", reason: "Closed accounting period must reject reversal" }) }, 409);
  const saleReverse = await request(owner, `/api/sales/invoices/${invoiceId}/reverse`, { method: "POST", body: JSON.stringify({ postingDate, reason: "Acceptance correction reverses the test invoice" }) });
  const invoiceReversalId = saleReverse.body.data.id as string;
  const saleRepeat = await request(owner, `/api/sales/invoices/${invoiceId}/reverse`, { method: "POST", body: JSON.stringify({ postingDate, reason: "Acceptance correction reverses the test invoice" }) });
  assert(saleRepeat.body.data.id === invoiceReversalId, "Repeated invoice reversal did not return the same linked document.");

  const [reversedInvoice, invoiceReversal, saleBalanceAfter] = await Promise.all([
    prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoiceId } }),
    prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoiceReversalId } }),
    prisma.stockBalance.findFirstOrThrow({ where: { id: saleBalanceBefore.id } }),
  ]);
  assert(reversedInvoice.status === OperationalDocumentStatus.REVERSED, "Source invoice was not marked REVERSED.");
  assert(invoiceReversal.status === OperationalDocumentStatus.POSTED && invoiceReversal.reversalOfId === invoiceId, "Linked invoice reversal is invalid.");
  assert(invoiceReversal.grandTotal.eq(reversedInvoice.grandTotal.negated()) && invoiceReversal.costTotal.eq(reversedInvoice.costTotal.negated()), "Invoice reversal totals are not equal and opposite.");
  assert(saleBalanceAfter.quantity.eq(saleBalanceBefore.quantity) && saleBalanceAfter.inventoryValue.eq(saleBalanceBefore.inventoryValue), "Invoice reversal did not restore the exact stock quantity and value.");
  assert(reversedInvoice.journalEntryId && invoiceReversal.journalEntryId, "Invoice reversal journal links are missing.");
  await assertJournalPair(reversedInvoice.journalEntryId, invoiceReversal.journalEntryId);
  const invoiceOriginalMovements = await prisma.inventoryMovement.findMany({ where: { sourceDocumentId: invoiceId } });
  const invoiceReverseMovements = await prisma.inventoryMovement.findMany({ where: { sourceDocumentId: invoiceReversalId } });
  assert(invoiceOriginalMovements.length === invoiceReverseMovements.length && invoiceReverseMovements.every((movement) => movement.movementType === InventoryMovementType.SALES_RETURN && invoiceOriginalMovements.some((source) => source.id === movement.reversalOfId)), "Invoice movement reversals are incomplete or duplicated.");
  console.log("✓ invoice reversal enforced permission, segregation, open-period, exact-once, stock, COGS, journal, and movement controls");

  const activeReturnSource = await prisma.salesInvoice.findFirst({
    where: { companyId: company.id, status: OperationalDocumentStatus.POSTED, reversalOfId: null, stockReturns: { some: { status: { notIn: [OperationalDocumentStatus.CANCELLED, OperationalDocumentStatus.REJECTED] } } } },
    select: { id: true },
  });
  if (activeReturnSource) {
    await request(owner, `/api/sales/invoices/${activeReturnSource.id}/reverse`, { method: "POST", body: JSON.stringify({ postingDate, reason: "Active return must block source reversal" }) }, 409);
    assert((await prisma.salesInvoice.findUniqueOrThrow({ where: { id: activeReturnSource.id } })).status === OperationalDocumentStatus.POSTED, "Blocked invoice reversal changed its source state.");
  }
  const consumedReceipt = await prisma.purchaseReceipt.findFirst({
    where: { companyId: company.id, status: OperationalDocumentStatus.POSTED, reversalOfId: null, lines: { some: { units: { some: { stockUnit: { status: { not: "IN_STOCK" } } } } } } },
    select: { id: true },
  });
  if (consumedReceipt) {
    await request(owner, `/api/purchases/receipts/${consumedReceipt.id}/reverse`, { method: "POST", body: JSON.stringify({ postingDate, reason: "Consumed physical stock must block receipt reversal" }) }, 409);
    assert((await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: consumedReceipt.id } })).status === OperationalDocumentStatus.POSTED, "Blocked receipt reversal changed its source state.");
  }
  console.log("✓ active returns and consumed physical stock block unsafe source reversals without side effects");

  const [receiptDetail, receiptReversalDetail, invoiceDetail, invoiceReversalDetail] = await Promise.all([
    request(owner, `/api/purchases/receipts/${receiptId}`),
    request(owner, `/api/purchases/receipts/${receiptReversalId}`),
    request(owner, `/api/sales/invoices/${invoiceId}`),
    request(owner, `/api/sales/invoices/${invoiceReversalId}`),
  ]);
  assert(receiptDetail.body.data.reversals.some((item: { id: string }) => item.id === receiptReversalId), "Receipt detail omitted its reversal chain.");
  assert(receiptReversalDetail.body.data.reversalOf?.id === receiptId, "Receipt reversal detail omitted its source link.");
  assert(invoiceDetail.body.data.reversals.some((item: { id: string }) => item.id === invoiceReversalId), "Invoice detail omitted its reversal chain.");
  assert(invoiceReversalDetail.body.data.reversalOf?.id === invoiceId, "Invoice reversal detail omitted its source link.");
  const auditCount = await prisma.auditLog.count({ where: { entityId: { in: [receiptId, receiptReversalId, invoiceId, invoiceReversalId] }, action: { in: ["PURCHASE_RECEIPT_REVERSED", "PURCHASE_RECEIPT_REVERSAL_POSTED", "SALES_INVOICE_REVERSED", "SALES_INVOICE_REVERSAL_POSTED"] } } });
  assert(auditCount === 4, "Operational reversal audit events are incomplete or duplicated.");
  console.log(`Operational posted-document reversal acceptance passed (${run}).`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    if (sessionIds.length) await prisma.session.deleteMany({ where: { id: { in: sessionIds } } }).catch(() => undefined);
    if (customerCreditRestore) await prisma.customer.update({ where: { id: customerCreditRestore.id }, data: { creditLimit: customerCreditRestore.value } }).catch(() => undefined);
    await prisma.$disconnect();
  });
