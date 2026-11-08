import { createHash, randomBytes } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.OPERATIONS_TEST_BASE_URL || "http://127.0.0.1:3000";
const run = (process.env.ACCEPTANCE_RUN_ID || Date.now().toString(36)).replace(/[^a-z0-9-]/gi, "").slice(-14);
const sessionIds: string[] = [];

type Session = { cookie: string; userAgent: string };
type Context = { companyId: string; branchId: string; warehouseId: string };

async function login(email: string, context: Context): Promise<Session> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(32).toString("base64url");
  const userAgent = `Axon-Transfer-Acceptance/${run}/${email}`;
  const session = await prisma.session.create({
    data: {
      tokenHash: createHash("sha256").update(token).digest("hex"),
      userId: user.id,
      activeCompanyId: context.companyId,
      activeBranchId: context.branchId,
      activeWarehouseId: context.warehouseId,
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function balance(companyId: string, warehouseId: string, variantId: string) {
  const row = await prisma.stockBalance.findFirst({ where: { companyId, warehouseId, variantId, lotId: null } });
  return { quantity: row?.quantity || new Prisma.Decimal(0), value: row?.inventoryValue || new Prisma.Decimal(0) };
}

async function main() {
  const company = await prisma.company.findUniqueOrThrow({ where: { code: "AXON" } });
  const source = await prisma.warehouse.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "HZR-MAIN" } } });
  const destination = await prisma.warehouse.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "ISB-RETAIL" } } });
  const owner = await login("owner@axonmobile.local", { companyId: company.id, branchId: source.branchId, warehouseId: source.id });
  const buyer = await login("buyer@axonmobile.local", { companyId: company.id, branchId: source.branchId, warehouseId: source.id });
  const quantityVariant = await prisma.productVariant.findUniqueOrThrow({
    where: { companyId_sku: { companyId: company.id, sku: "ANK-A2633-WHT" } },
    include: { product: true },
  });
  const serializedUnit = await prisma.physicalStockUnit.findFirstOrThrow({
    where: {
      companyId: company.id,
      currentWarehouseId: source.id,
      status: "IN_STOCK",
      product: { trackingMethod: "IMEI" },
      reservations: { none: { releasedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } },
    },
    include: { product: true, variant: true, identifiers: true },
  });
  const quantityBeforeSource = await balance(company.id, source.id, quantityVariant.id);
  const quantityBeforeDestination = await balance(company.id, destination.id, quantityVariant.id);
  const unitBeforeSource = await balance(company.id, source.id, serializedUnit.variantId);
  const unitBeforeDestination = await balance(company.id, destination.id, serializedUnit.variantId);

  const payload = {
    sourceBranchId: source.branchId,
    sourceWarehouseId: source.id,
    destinationBranchId: destination.branchId,
    destinationWarehouseId: destination.id,
    transferDate: "2026-10-28",
    reference: `ACCEPT-${run}`,
    reason: "Automated mixed stock transfer acceptance",
    remarks: "Quantity accessory plus one dual-SIM physical phone",
    idempotencyKey: `transfer-${run}`,
    lines: [
      { productId: quantityVariant.productId, variantId: quantityVariant.id, lotId: null, quantity: "2", stockUnitIds: [] },
      { productId: serializedUnit.productId, variantId: serializedUnit.variantId, lotId: null, quantity: "1", stockUnitIds: [serializedUnit.id] },
    ],
  };

  await request(buyer, "/api/inventory/transfers", { method: "POST", body: JSON.stringify(payload) }, 403);
  const sameWarehouse = { ...payload, destinationBranchId: source.branchId, destinationWarehouseId: source.id, idempotencyKey: `same-${run}` };
  await request(owner, "/api/inventory/transfers", { method: "POST", body: JSON.stringify(sameWarehouse) }, 422);
  const overstock = structuredClone(payload);
  overstock.idempotencyKey = `over-${run}`;
  overstock.lines = [{ productId: quantityVariant.productId, variantId: quantityVariant.id, lotId: null, quantity: "99999999", stockUnitIds: [] }];
  await request(owner, "/api/inventory/transfers", { method: "POST", body: JSON.stringify(overstock) }, 409);
  console.log("✓ unauthorized, same-warehouse, and insufficient-stock attempts rejected");

  const created = await request(owner, "/api/inventory/transfers", { method: "POST", body: JSON.stringify(payload) }, 201);
  const transferId = created.body.data.id as string;
  assert(created.body.data.lines.length === 2, "Transfer did not persist both normalized lines.");
  assert(await prisma.inventoryMovement.count({ where: { sourceDocumentType: "StockTransfer", sourceDocumentId: transferId } }) === 0, "Draft transfer changed stock.");
  const unitAfterDraft = await prisma.physicalStockUnit.findUniqueOrThrow({ where: { id: serializedUnit.id } });
  assert(unitAfterDraft.currentWarehouseId === source.id, "Draft transfer changed physical custody.");
  const idempotentCreate = await request(owner, "/api/inventory/transfers", { method: "POST", body: JSON.stringify(payload) }, 201);
  assert(idempotentCreate.body.data.id === transferId, "Draft create idempotency returned a different transfer.");
  console.log("✓ mixed transfer draft is normalized, stock-neutral, and idempotent");

  await request(owner, `/api/inventory/transfers/${transferId}/post`, { method: "POST" });
  const movementCount = await prisma.inventoryMovement.count({ where: { sourceDocumentType: "StockTransfer", sourceDocumentId: transferId } });
  assert(movementCount === 4, `Expected four transfer movements, found ${movementCount}.`);
  await request(owner, `/api/inventory/transfers/${transferId}/post`, { method: "POST" });
  assert(await prisma.inventoryMovement.count({ where: { sourceDocumentId: transferId, sourceDocumentType: "StockTransfer" } }) === 4, "Repeated posting duplicated stock movements.");
  const [quantityPostedSource, quantityPostedDestination, unitPostedSource, unitPostedDestination, movedUnit] = await Promise.all([
    balance(company.id, source.id, quantityVariant.id),
    balance(company.id, destination.id, quantityVariant.id),
    balance(company.id, source.id, serializedUnit.variantId),
    balance(company.id, destination.id, serializedUnit.variantId),
    prisma.physicalStockUnit.findUniqueOrThrow({ where: { id: serializedUnit.id } }),
  ]);
  assert(quantityPostedSource.quantity.eq(quantityBeforeSource.quantity.minus(2)), "Quantity source balance was not reduced by two.");
  assert(quantityPostedDestination.quantity.eq(quantityBeforeDestination.quantity.plus(2)), "Quantity destination balance was not increased by two.");
  assert(unitPostedSource.quantity.eq(unitBeforeSource.quantity.minus(1)), "Serialized source balance was not reduced by one.");
  assert(unitPostedDestination.quantity.eq(unitBeforeDestination.quantity.plus(1)), "Serialized destination balance was not increased by one.");
  assert(movedUnit.currentWarehouseId === destination.id && movedUnit.currentBranchId === destination.branchId && movedUnit.status === "IN_STOCK", "Physical unit custody did not move to the destination.");
  let immutable = false;
  try {
    await prisma.stockTransfer.update({ where: { id: transferId }, data: { reason: "Illegal posted edit" } });
  } catch {
    immutable = true;
  }
  assert(immutable, "Database allowed posted transfer history to be edited.");
  console.log("✓ atomic post created exact OUT/IN effects, moved custody, resisted duplicate post, and locked history");

  const reversalPayload = {
    postingDate: "2026-10-28",
    reason: "Acceptance rollback through authorized linked reversal",
    idempotencyKey: `transfer-reversal-${run}`,
  };
  const reversed = await request(owner, `/api/inventory/transfers/${transferId}/reverse`, { method: "POST", body: JSON.stringify(reversalPayload) }, 201);
  const reversalId = reversed.body.data.id as string;
  assert(reversed.body.data.status === "POSTED" && reversed.body.data.reversalOfId === transferId, "Linked reversal was not posted.");
  const originalAfter = await prisma.stockTransfer.findUniqueOrThrow({ where: { id: transferId } });
  assert(originalAfter.status === "REVERSED", "Original transfer was not marked reversed.");
  const reversalMovements = await prisma.inventoryMovement.findMany({ where: { sourceDocumentType: "StockTransfer", sourceDocumentId: reversalId } });
  assert(reversalMovements.length === 4 && reversalMovements.every((movement) => movement.reversalOfId), "Reversal did not link all opposite stock movements.");
  const [quantityFinalSource, quantityFinalDestination, unitFinalSource, unitFinalDestination, restoredUnit] = await Promise.all([
    balance(company.id, source.id, quantityVariant.id),
    balance(company.id, destination.id, quantityVariant.id),
    balance(company.id, source.id, serializedUnit.variantId),
    balance(company.id, destination.id, serializedUnit.variantId),
    prisma.physicalStockUnit.findUniqueOrThrow({ where: { id: serializedUnit.id } }),
  ]);
  assert(quantityFinalSource.quantity.eq(quantityBeforeSource.quantity) && quantityFinalSource.value.eq(quantityBeforeSource.value), "Quantity source did not reconcile after reversal.");
  assert(quantityFinalDestination.quantity.eq(quantityBeforeDestination.quantity) && quantityFinalDestination.value.eq(quantityBeforeDestination.value), "Quantity destination did not reconcile after reversal.");
  assert(unitFinalSource.quantity.eq(unitBeforeSource.quantity) && unitFinalSource.value.eq(unitBeforeSource.value), "Serialized source did not reconcile after reversal.");
  assert(unitFinalDestination.quantity.eq(unitBeforeDestination.quantity) && unitFinalDestination.value.eq(unitBeforeDestination.value), "Serialized destination did not reconcile after reversal.");
  assert(restoredUnit.currentWarehouseId === source.id && restoredUnit.currentBranchId === source.branchId, "Reversal did not restore physical custody.");
  const idempotentReversal = await request(owner, `/api/inventory/transfers/${transferId}/reverse`, { method: "POST", body: JSON.stringify(reversalPayload) }, 201);
  assert(idempotentReversal.body.data.id === reversalId, "Reversal idempotency returned a different document.");
  assert(await prisma.inventoryMovement.count({ where: { sourceDocumentType: "StockTransfer", sourceDocumentId: reversalId } }) === 4, "Repeated reversal duplicated effects.");
  console.log(`✓ exact linked reversal restored quantity, value, and IMEI custody with no duplicate effects (${run})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (sessionIds.length) await prisma.session.deleteMany({ where: { id: { in: sessionIds } } }).catch(() => undefined);
    await prisma.$disconnect();
  });
