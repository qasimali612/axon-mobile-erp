import { createHash, randomBytes } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.OPERATIONS_TEST_BASE_URL || "http://127.0.0.1:3000";
const run = (process.env.ACCEPTANCE_RUN_ID || Date.now().toString(36)).replace(/[^a-z0-9-]/gi, "").slice(-12);
const sessionIds: string[] = [];
type Session = { cookie: string; userAgent: string };
type Context = { companyId: string; branchId: string; warehouseId: string };
type CountUnitLink = { id: string; stockUnitId: string };
type CountLineResult = { id: string; variantId: string; expectedQuantity: string; unitCost: string; units: CountUnitLink[] };

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function luhnDigit(prefix: string) {
  let sum = 0;
  for (let index = 0; index < prefix.length; index += 1) {
    let digit = Number(prefix[index]);
    if (index % 2 === 1) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
  }
  return String((10 - (sum % 10)) % 10);
}
function testImei(offset: number) {
  const number = (BigInt(`0x${createHash("sha256").update(`${run}:${offset}`).digest("hex").slice(0, 14)}`) % 1_000_000_000_000n).toString().padStart(12, "0");
  const prefix = `35${number}`;
  return `${prefix}${luhnDigit(prefix)}`;
}
async function login(email: string, context: Context): Promise<Session> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(32).toString("base64url");
  const userAgent = `Axon-Inventory-Control-Acceptance/${run}/${email}`;
  const session = await prisma.session.create({ data: { tokenHash: createHash("sha256").update(token).digest("hex"), userId: user.id, activeCompanyId: context.companyId, activeBranchId: context.branchId, activeWarehouseId: context.warehouseId, ipAddress: "127.0.0.1", userAgent, expiresAt: new Date(Date.now() + 3_600_000) } });
  sessionIds.push(session.id);
  return { cookie: `axon_session=${token}`, userAgent };
}
async function request(session: Session, path: string, options: RequestInit = {}, expected: number | number[] = 200) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { Cookie: session.cookie, Origin: baseUrl, "User-Agent": session.userAgent, ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } });
  const text = await response.text();
  const body = text && response.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text;
  const accepted = Array.isArray(expected) ? expected : [expected];
  if (!accepted.includes(response.status)) throw new Error(`${path}: expected ${accepted.join("/")}, got ${response.status}: ${text}`);
  return { status: response.status, body };
}
async function balance(companyId: string, warehouseId: string, variantId: string) {
  const row = await prisma.stockBalance.findFirst({ where: { companyId, warehouseId, variantId, lotId: null } });
  return { quantity: row?.quantity || new Prisma.Decimal(0), value: row?.inventoryValue || new Prisma.Decimal(0) };
}
async function createAdjustment(session: Session, context: Context, lines: unknown[], key: string, reason: string) {
  return request(session, "/api/inventory/adjustments", { method: "POST", body: JSON.stringify({ branchId: context.branchId, warehouseId: context.warehouseId, adjustmentDate: "2026-10-28", reasonCode: "ACCEPTANCE", reason, notes: `Automated inventory control acceptance ${run}`, idempotencyKey: key, lines }) }, 201);
}

async function main() {
  const company = await prisma.company.findUniqueOrThrow({ where: { code: "AXON" } });
  const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "HZR-MAIN" } } });
  const context = { companyId: company.id, branchId: warehouse.branchId, warehouseId: warehouse.id };
  const owner = await login("owner@axonmobile.local", context);
  const inventoryManager = await login("inventory@axonmobile.local", context);
  const buyer = await login("buyer@axonmobile.local", context);
  const quantityVariant = await prisma.productVariant.findUniqueOrThrow({ where: { companyId_sku: { companyId: company.id, sku: "ANK-A2633-WHT" } }, include: { product: true } });
  const existingUnit = await prisma.physicalStockUnit.findFirstOrThrow({ where: { companyId: company.id, currentWarehouseId: warehouse.id, status: "IN_STOCK", product: { trackingMethod: "IMEI" }, reservations: { none: { releasedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } }, include: { product: true, variant: true, identifiers: true } });
  const newUnitVariant = await prisma.productVariant.findFirstOrThrow({ where: { companyId: company.id, id: { not: existingUnit.variantId }, isActive: true, product: { trackingMethod: "IMEI", status: "ACTIVE" } }, include: { product: true } });
  const [quantityBefore, existingBefore, newVariantBefore] = await Promise.all([balance(company.id, warehouse.id, quantityVariant.id), balance(company.id, warehouse.id, existingUnit.variantId), balance(company.id, warehouse.id, newUnitVariant.id)]);
  const averageCost = quantityBefore.value.div(quantityBefore.quantity).toDecimalPlaces(4).toFixed(4);
  const imei1 = testImei(1); const imei2 = testImei(2);
  const mixedLines = [
    { productId: quantityVariant.productId, variantId: quantityVariant.id, lotId: null, quantityDelta: "2", unitCost: averageCost, stockUnitIds: [], units: [] },
    { productId: existingUnit.productId, variantId: existingUnit.variantId, lotId: null, quantityDelta: "-1", unitCost: "0", stockUnitIds: [existingUnit.id], units: [] },
    { productId: newUnitVariant.productId, variantId: newUnitVariant.id, lotId: null, quantityDelta: "1", unitCost: "87500", stockUnitIds: [], units: [{ unitCost: "87500", identifiers: [{ type: "IMEI", value: imei1, slot: 1, isPrimary: true }, { type: "IMEI", value: imei2, slot: 2, isPrimary: false }] }] },
  ];

  await createAdjustment(buyer, context, mixedLines, `unauthorized-${run}`, "Unauthorized adjustment must be rejected").then(() => { throw new Error("Unauthorized adjustment unexpectedly succeeded."); }, (error) => { if (!String(error).includes("got 403")) throw error; });
  const created = await createAdjustment(owner, context, mixedLines, `mixed-${run}`, "Mixed quantity and serialized acceptance adjustment");
  const adjustmentId = created.body.data.id as string;
  assert(created.body.data.lines.length === 3, "Mixed adjustment did not persist three normalized lines.");
  assert(await prisma.inventoryMovement.count({ where: { sourceDocumentType: "StockAdjustment", sourceDocumentId: adjustmentId } }) === 0, "Draft adjustment affected inventory.");
  assert((await prisma.physicalStockUnit.findUniqueOrThrow({ where: { id: existingUnit.id } })).status === "IN_STOCK", "Draft adjustment changed serialized custody.");
  const idempotent = await createAdjustment(owner, context, mixedLines, `mixed-${run}`, "Mixed quantity and serialized acceptance adjustment");
  assert(idempotent.body.data.id === adjustmentId, "Adjustment create idempotency returned another document.");
  await request(owner, `/api/inventory/adjustments/${adjustmentId}/submit`, { method: "POST" });
  await request(owner, `/api/inventory/adjustments/${adjustmentId}/post`, { method: "POST" }, 409);
  const posted = await request(inventoryManager, `/api/inventory/adjustments/${adjustmentId}/post`, { method: "POST" });
  assert(posted.body.data.status === "POSTED" && posted.body.data.journalEntryId, "Adjustment did not post with a journal.");
  await request(inventoryManager, `/api/inventory/adjustments/${adjustmentId}/post`, { method: "POST" });
  assert(await prisma.inventoryMovement.count({ where: { sourceDocumentType: "StockAdjustment", sourceDocumentId: adjustmentId } }) === 3, "Adjustment posting was not exactly once.");
  const createdUnit = await prisma.physicalStockUnit.findFirstOrThrow({ where: { companyId: company.id, identifiers: { some: { normalizedValue: imei1 } } } });
  const [quantityPosted, existingPosted, newVariantPosted, removedUnit] = await Promise.all([balance(company.id, warehouse.id, quantityVariant.id), balance(company.id, warehouse.id, existingUnit.variantId), balance(company.id, warehouse.id, newUnitVariant.id), prisma.physicalStockUnit.findUniqueOrThrow({ where: { id: existingUnit.id } })]);
  assert(quantityPosted.quantity.eq(quantityBefore.quantity.plus(2)), "Quantity gain did not post.");
  assert(existingPosted.quantity.eq(existingBefore.quantity.minus(1)) && removedUnit.status === "SCRAPPED" && !removedUnit.currentWarehouseId, "Serialized loss did not remove custody.");
  assert(newVariantPosted.quantity.eq(newVariantBefore.quantity.plus(1)) && createdUnit.status === "IN_STOCK", "Serialized gain did not create one physical unit.");
  console.log("✓ mixed quantity/IMEI draft remained neutral, maker-checker posting was enforced, and effects posted exactly once");

  let immutable = false;
  try { await prisma.stockAdjustment.update({ where: { id: adjustmentId }, data: { reason: "Illegal posted mutation" } }); } catch { immutable = true; }
  assert(immutable, "Database allowed posted adjustment history to be edited.");
  const reversalPayload = { postingDate: "2026-10-28", reason: "Acceptance exact linked reversal of mixed adjustment", idempotencyKey: `mixed-reversal-${run}` };
  const reversed = await request(inventoryManager, `/api/inventory/adjustments/${adjustmentId}/reverse`, { method: "POST", body: JSON.stringify(reversalPayload) }, 201);
  const reversalId = reversed.body.data.id as string;
  assert(reversed.body.data.status === "POSTED" && reversed.body.data.reversalOfId === adjustmentId, "Adjustment reversal was not linked and posted.");
  const reversalMovements = await prisma.inventoryMovement.findMany({ where: { sourceDocumentType: "StockAdjustment", sourceDocumentId: reversalId } });
  assert(reversalMovements.length === 3 && reversalMovements.every((movement) => movement.reversalOfId), "Reversal movements are not exact linked opposites.");
  const [quantityReversed, existingReversed, newVariantReversed, restoredExisting, scrappedNew] = await Promise.all([balance(company.id, warehouse.id, quantityVariant.id), balance(company.id, warehouse.id, existingUnit.variantId), balance(company.id, warehouse.id, newUnitVariant.id), prisma.physicalStockUnit.findUniqueOrThrow({ where: { id: existingUnit.id } }), prisma.physicalStockUnit.findUniqueOrThrow({ where: { id: createdUnit.id } })]);
  assert(quantityReversed.quantity.eq(quantityBefore.quantity) && quantityReversed.value.eq(quantityBefore.value), "Quantity balance/value did not reconcile after reversal.");
  assert(existingReversed.quantity.eq(existingBefore.quantity) && existingReversed.value.eq(existingBefore.value) && restoredExisting.status === "IN_STOCK", "Existing IMEI was not exactly restored.");
  assert(newVariantReversed.quantity.eq(newVariantBefore.quantity) && newVariantReversed.value.eq(newVariantBefore.value) && scrappedNew.status === "SCRAPPED", "New IMEI gain was not exactly reversed.");
  const reversedAgain = await request(inventoryManager, `/api/inventory/adjustments/${adjustmentId}/reverse`, { method: "POST", body: JSON.stringify(reversalPayload) }, 201);
  assert(reversedAgain.body.data.id === reversalId, "Reversal idempotency returned a different document.");
  console.log("✓ immutable posted history and exact linked reversal restored quantity, value, and serialized custody");

  const cancelled = await createAdjustment(owner, context, [{ productId: quantityVariant.productId, variantId: quantityVariant.id, lotId: null, quantityDelta: "-1", unitCost: "0", stockUnitIds: [], units: [] }], `cancel-${run}`, "Cancelled adjustment acceptance scenario");
  await request(owner, `/api/inventory/adjustments/${cancelled.body.data.id}/cancel`, { method: "POST", body: JSON.stringify({ reason: "Acceptance cancellation before any inventory effect" }) });
  assert(await prisma.inventoryMovement.count({ where: { sourceDocumentType: "StockAdjustment", sourceDocumentId: cancelled.body.data.id } }) === 0, "Cancelled draft produced a movement.");
  console.log("✓ cancellation preserved a stock-neutral audited draft");

  const countCreated = await request(owner, "/api/inventory/counts", { method: "POST", body: JSON.stringify({ branchId: warehouse.branchId, warehouseId: warehouse.id, countDate: "2026-10-28", scopeMode: "CYCLE", variantIds: [quantityVariant.id, existingUnit.variantId], reason: "Acceptance quantity and serialized cycle count", notes: `Run ${run}`, idempotencyKey: `count-${run}` }) }, 201);
  const countId = countCreated.body.data.id as string;
  assert(await prisma.stockAdjustment.count({ where: { stockCountId: countId } }) === 0, "Count snapshot created a variance adjustment before posting.");
  const countDetail = await request(owner, `/api/inventory/counts/${countId}`);
  const quantityLine = countDetail.body.data.lines.find((line: CountLineResult) => line.variantId === quantityVariant.id) as CountLineResult | undefined;
  const serializedLine = countDetail.body.data.lines.find((line: CountLineResult) => line.variantId === existingUnit.variantId) as CountLineResult | undefined;
  assert(quantityLine && serializedLine, "Cycle count did not snapshot both selected variants.");
  const serializedLinks = serializedLine.units;
  const missingLink = serializedLinks.find((link) => link.stockUnitId === existingUnit.id) || serializedLinks[0];
  const countedSerializedIds = serializedLinks.filter((link) => link.stockUnitId !== missingLink.stockUnitId).map((link) => link.stockUnitId);
  await request(owner, `/api/inventory/counts/${countId}`, { method: "PATCH", body: JSON.stringify({ lines: [
    { lineId: quantityLine.id, countedQuantity: new Prisma.Decimal(quantityLine.expectedQuantity).minus(1).toFixed(4), countedStockUnitIds: [], notes: "One accessory shortage" },
    { lineId: serializedLine.id, countedQuantity: String(countedSerializedIds.length), countedStockUnitIds: countedSerializedIds, notes: "One IMEI not found" },
  ] }) });
  await request(owner, `/api/inventory/counts/${countId}/submit`, { method: "POST" });
  await request(owner, `/api/inventory/counts/${countId}/post`, { method: "POST" }, 409);
  const countPosted = await request(inventoryManager, `/api/inventory/counts/${countId}/post`, { method: "POST" });
  assert(countPosted.body.data.status === "POSTED" && countPosted.body.data.adjustment?.status === "POSTED", "Count variance did not post through a generated adjustment.");
  const countAdjustmentId = countPosted.body.data.adjustment.id as string;
  assert(await prisma.inventoryMovement.count({ where: { sourceDocumentType: "StockAdjustment", sourceDocumentId: countAdjustmentId } }) === 2, "Generated count adjustment did not create exact variance movements.");
  assert((await prisma.physicalStockUnit.findUniqueOrThrow({ where: { id: missingLink.stockUnitId } })).status === "SCRAPPED", "Missing count unit remained in custody.");
  await request(inventoryManager, `/api/inventory/counts/${countId}/post`, { method: "POST" });
  await request(inventoryManager, `/api/inventory/adjustments/${countAdjustmentId}/reverse`, { method: "POST", body: JSON.stringify({ postingDate: "2026-10-28", reason: "Independent count reversal must remain blocked", idempotencyKey: `blocked-count-reversal-${run}` }) }, 409);
  console.log("✓ snapshot count posted quantity and IMEI shortages only through one generated adjustment and blocked independent reversal");

  const missingUnit = await prisma.physicalStockUnit.findUniqueOrThrow({ where: { id: missingLink.stockUnitId } });
  const restore = await createAdjustment(owner, context, [
    { productId: quantityVariant.productId, variantId: quantityVariant.id, lotId: null, quantityDelta: "1", unitCost: quantityLine.unitCost, stockUnitIds: [], units: [] },
    { productId: missingUnit.productId, variantId: missingUnit.variantId, lotId: null, quantityDelta: "1", unitCost: missingUnit.acquisitionCost.toFixed(4), stockUnitIds: [], units: [{ stockUnitId: missingUnit.id, unitCost: missingUnit.acquisitionCost.toFixed(4), identifiers: [] }] },
  ], `count-restore-${run}`, "Restore acceptance count variance after verification");
  await request(owner, `/api/inventory/adjustments/${restore.body.data.id}/submit`, { method: "POST" });
  await request(inventoryManager, `/api/inventory/adjustments/${restore.body.data.id}/post`, { method: "POST" });
  const [quantityRestored, serializedRestored, unitRestored] = await Promise.all([balance(company.id, warehouse.id, quantityVariant.id), balance(company.id, warehouse.id, existingUnit.variantId), prisma.physicalStockUnit.findUniqueOrThrow({ where: { id: missingUnit.id } })]);
  assert(quantityRestored.quantity.eq(quantityBefore.quantity) && quantityRestored.value.eq(quantityBefore.value), "Count correction did not restore quantity/value baseline.");
  assert(serializedRestored.quantity.eq(existingBefore.quantity) && serializedRestored.value.eq(existingBefore.value) && unitRestored.status === "IN_STOCK", "Count correction did not restore serialized custody/value.");
  console.log("✓ controlled follow-up adjustment restored reconciled stock without editing posted count history");

  const staleCount = await request(owner, "/api/inventory/counts", { method: "POST", body: JSON.stringify({ branchId: warehouse.branchId, warehouseId: warehouse.id, countDate: "2026-10-28", scopeMode: "CYCLE", variantIds: [quantityVariant.id], reason: "Acceptance stale snapshot protection scenario", idempotencyKey: `stale-count-${run}` }) }, 201);
  const staleLine = staleCount.body.data.lines[0];
  await request(owner, `/api/inventory/counts/${staleCount.body.data.id}`, { method: "PATCH", body: JSON.stringify({ lines: [{ lineId: staleLine.id, countedQuantity: staleLine.expectedQuantity, countedStockUnitIds: [], notes: null }] }) });
  await request(owner, `/api/inventory/counts/${staleCount.body.data.id}/submit`, { method: "POST" });
  const intervening = await createAdjustment(owner, context, [{ productId: quantityVariant.productId, variantId: quantityVariant.id, lotId: null, quantityDelta: "1", unitCost: averageCost, stockUnitIds: [], units: [] }], `intervening-${run}`, "Intervening stock activity for stale count test");
  await request(owner, `/api/inventory/adjustments/${intervening.body.data.id}/submit`, { method: "POST" });
  await request(inventoryManager, `/api/inventory/adjustments/${intervening.body.data.id}/post`, { method: "POST" });
  await request(inventoryManager, `/api/inventory/counts/${staleCount.body.data.id}/post`, { method: "POST" }, 409);
  await request(inventoryManager, `/api/inventory/counts/${staleCount.body.data.id}/cancel`, { method: "POST", body: JSON.stringify({ reason: "Cancelled because stock changed after snapshot" }) });
  await request(inventoryManager, `/api/inventory/adjustments/${intervening.body.data.id}/reverse`, { method: "POST", body: JSON.stringify({ postingDate: "2026-10-28", reason: "Restore stock after stale snapshot acceptance", idempotencyKey: `intervening-reversal-${run}` }) }, 201);
  const finalBalance = await balance(company.id, warehouse.id, quantityVariant.id);
  assert(finalBalance.quantity.eq(quantityBefore.quantity) && finalBalance.value.eq(quantityBefore.value), "Stale-count test did not return quantity/value to baseline.");
  console.log("✓ stale snapshots are rejected, cancellable, and final inventory reconciles");

  const [adjustmentPage, countPage, globalSearch] = await Promise.all([
    request(owner, "/inventory/adjustments"),
    request(owner, "/inventory/stock-counts"),
    request(owner, `/api/search?q=${encodeURIComponent(created.body.data.adjustmentNumber)}`),
  ]);
  assert(String(adjustmentPage.body).includes("Stock adjustments"), "Authenticated adjustment workspace did not server-render.");
  assert(String(countPage.body).includes("Physical stock counts"), "Authenticated stock-count workspace did not server-render.");
  assert(globalSearch.body.data.some((group: { type: string }) => group.type === "stock-adjustment"), "Global search did not return the stock adjustment.");
  console.log(`✓ authenticated workspaces and adjustment global search rendered successfully (${run})`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { if (sessionIds.length) await prisma.session.deleteMany({ where: { id: { in: sessionIds } } }).catch(() => undefined); await prisma.$disconnect(); });
