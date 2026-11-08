import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
async function expectRejected(label: string, operation: () => Promise<unknown>) {
  try { await operation(); throw new Error(`${label} unexpectedly succeeded.`); }
  catch (error) { if (error instanceof Error && error.message.endsWith("unexpectedly succeeded.")) throw error; console.log(`✓ ${label} is rejected`); }
}

async function main() {
  const company = await prisma.company.findUniqueOrThrow({ where: { code: "AXON" } });
  const movement = await prisma.inventoryMovement.findFirstOrThrow({ where: { companyId: company.id }, include: { stockUnit: { include: { identifiers: true } } } });
  const balance = await prisma.stockBalance.findFirstOrThrow({ where: { companyId: company.id, warehouseId: movement.warehouseId, productId: movement.productId, variantId: movement.variantId, lotId: movement.lotId } });

  await expectRejected("stock balance UPDATE outside posting service", () => prisma.stockBalance.update({ where: { id: balance.id }, data: { version: { increment: 1 } } }));
  await expectRejected("InventoryMovement UPDATE", () => prisma.inventoryMovement.update({ where: { id: movement.id }, data: { notes: "forbidden mutation" } }));
  await expectRejected("InventoryMovement DELETE", () => prisma.inventoryMovement.delete({ where: { id: movement.id } }));
  if (movement.stockUnit?.identifiers[0]) {
    await expectRejected("posted device identifier UPDATE", () => prisma.deviceIdentifier.update({ where: { id: movement.stockUnit!.identifiers[0].id }, data: { value: "forbidden" } }));
  }

  const ledger = await prisma.inventoryMovement.aggregate({
    where: { companyId: balance.companyId, branchId: balance.branchId, warehouseId: balance.warehouseId, productId: balance.productId, variantId: balance.variantId, lotId: balance.lotId, movementType: { notIn: ["RESERVATION", "RELEASE"] } },
    _sum: { quantity: true, totalCost: true },
  });
  assert((ledger._sum.quantity || new Prisma.Decimal(0)).equals(balance.quantity), "Stock quantity projection differs from movement ledger.");
  assert((ledger._sum.totalCost || new Prisma.Decimal(0)).equals(balance.inventoryValue), "Stock value projection differs from movement ledger.");
  console.log("✓ StockBalance equals the append-only movement ledger");

  const dualSim = await prisma.physicalStockUnit.findFirstOrThrow({ where: { companyId: company.id, identifiers: { some: { type: "IMEI", slot: 2 } } }, include: { identifiers: { where: { type: "IMEI" } }, movements: true } });
  assert(dualSim.identifiers.length >= 2, "Expected multiple IMEIs on one physical stock unit.");
  const receiptQuantity = dualSim.movements.filter((item) => item.movementType === "PURCHASE_RECEIPT").reduce((sum, item) => sum.plus(item.quantity), new Prisma.Decimal(0));
  assert(receiptQuantity.equals(1), "Multiple IMEIs inflated physical stock quantity.");
  console.log("✓ multiple IMEIs remain one physical stock unit and quantity 1");

  const [receipt, invoice, payment] = await Promise.all([
    prisma.purchaseReceipt.findFirstOrThrow({ where: { companyId: company.id, status: "POSTED" } }),
    prisma.salesInvoice.findFirstOrThrow({ where: { companyId: company.id, status: "POSTED" } }),
    prisma.payment.findFirstOrThrow({ where: { companyId: company.id, status: "POSTED" } }),
  ]);
  for (const document of [receipt, invoice, payment]) {
    assert(document.preparedById !== document.approvedById && document.preparedById !== document.postedById && document.approvedById !== document.postedById, "Operational segregation of duties is invalid.");
    assert(document.journalEntryId, "Posted operational document has no source journal.");
  }
  console.log("✓ preparer, approver, and poster are distinct on posted operational documents");

  const sourceJournals = await prisma.journalEntry.findMany({ where: { id: { in: [receipt.journalEntryId!, invoice.journalEntryId!, payment.journalEntryId!] } }, include: { lines: true } });
  assert(sourceJournals.length === 3, "Source journals are missing.");
  for (const journal of sourceJournals) {
    assert(journal.status === "POSTED" && journal.totalDebit.equals(journal.totalCredit) && journal.lines.length >= 2, `Source journal ${journal.voucherNumber} is invalid.`);
  }
  console.log("✓ source journals are posted, balanced, and traceable");

  const roleChecks = [
    ["PROCUREMENT_OFFICER", "PURCHASE_ORDER_CREATE", "PURCHASE_ORDER_APPROVE"],
    ["PROCUREMENT_APPROVER", "PURCHASE_ORDER_APPROVE", "PURCHASE_ORDER_CREATE"],
    ["RECEIVING_POSTER", "PURCHASE_RECEIPT_POST", "PURCHASE_RECEIPT_APPROVE"],
    ["SALES_OFFICER", "SALES_INVOICE_CREATE", "SALES_INVOICE_APPROVE"],
    ["SALES_APPROVER", "SALES_INVOICE_APPROVE", "SALES_INVOICE_CREATE"],
    ["SALES_POSTER", "SALES_INVOICE_POST", "SALES_INVOICE_APPROVE"],
  ] as const;
  for (const [roleCode, mustHave, mustNotHave] of roleChecks) {
    const role = await prisma.role.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: roleCode } }, include: { permissions: { include: { permission: true } } } });
    const grants = new Set(role.permissions.map((item) => item.permission.key));
    assert(grants.has(mustHave) && !grants.has(mustNotHave), `${roleCode} permission separation is invalid.`);
  }
  console.log("✓ exact operational role authorities are separated");
  console.log("Operational control verification passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
