import { InventoryMovementType, OperationalDocumentStatus, Prisma, PrismaClient, StockReturnType, StockUnitStatus } from "@prisma/client";

const prisma = new PrismaClient();
const zero = new Prisma.Decimal(0);
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function key(row: { companyId: string; branchId: string; warehouseId: string; productId: string; variantId: string; lotId: string | null }) { return [row.companyId, row.branchId, row.warehouseId, row.productId, row.variantId, row.lotId || "NOLOT"].join(":"); }
function exactLineInventory(line: { acceptedQuantity: Prisma.Decimal; unitCost: Prisma.Decimal; discountAmount: Prisma.Decimal; allocatedDocumentDiscount: Prisma.Decimal; allocatedFreight: Prisma.Decimal; allocatedOtherCharges: Prisma.Decimal }) { return line.acceptedQuantity.times(line.unitCost).minus(line.discountAmount).minus(line.allocatedDocumentDiscount).plus(line.allocatedFreight).plus(line.allocatedOtherCharges).toDecimalPlaces(4); }

async function main() {
  const [balances, movementGroups] = await Promise.all([
    prisma.stockBalance.findMany(),
    prisma.inventoryMovement.groupBy({ by: ["companyId", "branchId", "warehouseId", "productId", "variantId", "lotId"], where: { movementType: { notIn: [InventoryMovementType.RESERVATION, InventoryMovementType.RELEASE] } }, _sum: { quantity: true, totalCost: true } }),
  ]);
  const movementMap = new Map(movementGroups.map((group) => [key(group), group]));
  for (const balance of balances) { const ledger = movementMap.get(key(balance)); assert(ledger, `Stock balance ${balance.id} has no movement-ledger group.`); assert((ledger._sum.quantity || zero).eq(balance.quantity), `Stock quantity mismatch on ${balance.balanceKey}.`); assert((ledger._sum.totalCost || zero).eq(balance.inventoryValue), `Stock value mismatch on ${balance.balanceKey}.`); movementMap.delete(key(balance)); }
  assert(movementMap.size === 0, `${movementMap.size} movement-ledger groups have no StockBalance projection.`); console.log(`✓ all ${balances.length} stock balances equal their append-only movement-ledger projections`);

  const units = await prisma.physicalStockUnit.findMany({ include: { identifiers: true, movements: { where: { movementType: { notIn: [InventoryMovementType.RESERVATION, InventoryMovementType.RELEASE] } } } } });
  const onHandStatuses = new Set<StockUnitStatus>([StockUnitStatus.IN_STOCK, StockUnitStatus.RESERVED, StockUnitStatus.IN_TRANSIT, StockUnitStatus.QUARANTINED]);
  for (const unit of units) { const quantity = unit.movements.reduce((sum, movement) => sum.plus(movement.quantity), zero); const expected = onHandStatuses.has(unit.status) ? new Prisma.Decimal(1) : zero; assert(quantity.eq(expected), `Physical unit ${unit.id} status ${unit.status} conflicts with ledger quantity ${quantity.toFixed(4)}.`); if (onHandStatuses.has(unit.status)) assert(unit.currentBranchId && unit.currentWarehouseId, `On-hand physical unit ${unit.id} has no custody warehouse.`); else assert(!unit.currentWarehouseId, `Off-hand physical unit ${unit.id} still has warehouse custody.`); assert(unit.identifiers.length > 0, `Physical unit ${unit.id} has no identifier.`); }
  const identifierCount = units.reduce((count, unit) => count + unit.identifiers.length, 0); const distinctIdentifiers = new Set(units.flatMap((unit) => unit.identifiers.map((identifier) => `${identifier.type}:${identifier.normalizedValue}`))); assert(distinctIdentifiers.size === identifierCount, "Device identifiers are not globally unique by type and normalized value."); console.log(`✓ all ${units.length} physical units reconcile custody/status to ledger quantity; ${identifierCount} identifiers are unique`);

  const receipts = await prisma.purchaseReceipt.findMany({ where: { status: { in: [OperationalDocumentStatus.POSTED, OperationalDocumentStatus.REVERSED] } }, include: { lines: true, journalEntry: true, reversalOf: { select: { journalEntryId: true } }, reversals: { where: { status: OperationalDocumentStatus.POSTED }, select: { id: true } } } });
  for (const receipt of receipts) {
    const expectedJournalStatus = receipt.status === OperationalDocumentStatus.REVERSED ? "REVERSED" : "POSTED";
    assert(receipt.journalEntry?.status === expectedJournalStatus, `${receipt.status} receipt ${receipt.receiptNumber} has an invalid journal state.`);
    if (receipt.status === OperationalDocumentStatus.REVERSED) assert(receipt.reversals.length === 1, `Reversed receipt ${receipt.receiptNumber} lacks exactly one posted reversal.`);
    if (receipt.reversalOfId) assert(receipt.journalEntry?.reversalOfId === receipt.reversalOf?.journalEntryId, `Receipt reversal ${receipt.receiptNumber} does not reverse the source journal.`);
    const movementType = receipt.reversalOfId ? InventoryMovementType.PURCHASE_RETURN : InventoryMovementType.PURCHASE_RECEIPT;
    const movements = await prisma.inventoryMovement.groupBy({ by: ["lineReference"], where: { sourceDocumentId: receipt.id, movementType }, _sum: { quantity: true, totalCost: true } });
    const movementMapByLine = new Map(movements.map((movement) => [movement.lineReference, movement._sum]));
    for (const line of receipt.lines) { const effect = movementMapByLine.get(line.id); assert((effect?.quantity || zero).eq(line.acceptedQuantity), `Receipt ${receipt.receiptNumber} line ${line.lineNumber} quantity does not reconcile.`); assert((effect?.totalCost || zero).eq(exactLineInventory(line)), `Receipt ${receipt.receiptNumber} line ${line.lineNumber} landed value does not reconcile.`); }
  }
  console.log(`✓ all ${receipts.length} posted/reversed goods receipts reconcile accepted quantities, exact landed value, reversal links, and journals`);

  const invoices = await prisma.salesInvoice.findMany({ where: { status: { in: [OperationalDocumentStatus.POSTED, OperationalDocumentStatus.REVERSED] } }, include: { lines: true, journalEntry: true, reversalOf: { select: { journalEntryId: true } }, reversals: { where: { status: OperationalDocumentStatus.POSTED }, select: { id: true } } } });
  for (const invoice of invoices) {
    const expectedJournalStatus = invoice.status === OperationalDocumentStatus.REVERSED ? "REVERSED" : "POSTED";
    assert(invoice.journalEntry?.status === expectedJournalStatus, `${invoice.status} invoice ${invoice.invoiceNumber} has an invalid journal state.`);
    if (invoice.status === OperationalDocumentStatus.REVERSED) assert(invoice.reversals.length === 1, `Reversed invoice ${invoice.invoiceNumber} lacks exactly one posted reversal.`);
    if (invoice.reversalOfId) assert(invoice.journalEntry?.reversalOfId === invoice.reversalOf?.journalEntryId, `Invoice reversal ${invoice.invoiceNumber} does not reverse the source journal.`);
    const movementType = invoice.reversalOfId ? InventoryMovementType.SALES_RETURN : InventoryMovementType.SALE_ISSUE;
    const movements = await prisma.inventoryMovement.groupBy({ by: ["lineReference"], where: { sourceDocumentId: invoice.id, movementType }, _sum: { quantity: true, totalCost: true } });
    const movementMapByLine = new Map(movements.map((movement) => [movement.lineReference, movement._sum]));
    for (const line of invoice.lines) { const effect = movementMapByLine.get(line.id); assert((effect?.quantity || zero).eq(line.quantity.negated()), `Invoice ${invoice.invoiceNumber} line ${line.lineNumber} quantity does not reconcile.`); assert((effect?.totalCost || zero).eq(line.costTotal.negated()), `Invoice ${invoice.invoiceNumber} line ${line.lineNumber} COGS does not reconcile.`); }
  }
  console.log(`✓ all ${invoices.length} posted/reversed sales invoices reconcile quantities, COGS, reversal links, and journals`);

  const transfers = await prisma.stockTransfer.findMany({
    where: { status: { in: [OperationalDocumentStatus.POSTED, OperationalDocumentStatus.REVERSED] } },
    include: {
      lines: { include: { units: { include: { stockUnit: true } } } },
      reversal: { select: { id: true, status: true } },
      reversalOf: { select: { id: true } },
    },
  });
  for (const transfer of transfers) {
    if (transfer.status === OperationalDocumentStatus.REVERSED) {
      assert(transfer.reversal?.status === OperationalDocumentStatus.POSTED, `Reversed transfer ${transfer.transferNumber} lacks one posted reversal.`);
    }
    const movements = await prisma.inventoryMovement.findMany({
      where: { sourceDocumentType: "StockTransfer", sourceDocumentId: transfer.id },
      include: { reversalOf: true },
    });
    for (const line of transfer.lines) {
      const out = movements.filter((movement) => movement.lineReference === line.id && movement.movementType === InventoryMovementType.TRANSFER_OUT);
      const incoming = movements.filter((movement) => movement.lineReference === line.id && movement.movementType === InventoryMovementType.TRANSFER_IN);
      const outQuantity = out.reduce((sum, movement) => sum.plus(movement.quantity), zero);
      const inQuantity = incoming.reduce((sum, movement) => sum.plus(movement.quantity), zero);
      const outValue = out.reduce((sum, movement) => sum.plus(movement.totalCost), zero);
      const inValue = incoming.reduce((sum, movement) => sum.plus(movement.totalCost), zero);
      assert(outQuantity.eq(line.quantity.negated()) && inQuantity.eq(line.quantity), `Transfer ${transfer.transferNumber} line ${line.lineNumber} quantity does not reconcile.`);
      assert(outValue.eq(line.totalCost.negated()) && inValue.eq(line.totalCost), `Transfer ${transfer.transferNumber} line ${line.lineNumber} value does not reconcile.`);
      assert(out.every((movement) => movement.branchId === transfer.sourceBranchId && movement.warehouseId === transfer.sourceWarehouseId && !movement.journalEntryId), `Transfer ${transfer.transferNumber} has an invalid source movement.`);
      assert(incoming.every((movement) => movement.branchId === transfer.destinationBranchId && movement.warehouseId === transfer.destinationWarehouseId && !movement.journalEntryId), `Transfer ${transfer.transferNumber} has an invalid destination movement.`);
      if (line.trackingMethod === "IMEI" || line.trackingMethod === "SERIAL") {
        assert(line.quantity.isInteger() && line.units.length === line.quantity.toNumber(), `Serialized transfer ${transfer.transferNumber} line ${line.lineNumber} has invalid unit links.`);
        assert(out.length === line.units.length && incoming.length === line.units.length, `Serialized transfer ${transfer.transferNumber} line ${line.lineNumber} has incomplete unit movements.`);
        if (transfer.status === OperationalDocumentStatus.POSTED) {
          assert(line.units.every((link) => link.stockUnit.currentWarehouseId === transfer.destinationWarehouseId), `Posted transfer ${transfer.transferNumber} does not match physical custody.`);
        }
      }
    }
    if (transfer.reversalOfId) {
      assert(movements.every((movement) => movement.reversalOfId && movement.reversalOf?.sourceDocumentId === transfer.reversalOfId && movement.quantity.eq(movement.reversalOf.quantity.negated()) && movement.totalCost.eq(movement.reversalOf.totalCost.negated())), `Transfer reversal ${transfer.transferNumber} does not exactly negate source movements.`);
    }
  }
  console.log(`✓ all ${transfers.length} posted/reversed stock transfers reconcile directions, value, units, custody, and reversal links`);

  const adjustments = await prisma.stockAdjustment.findMany({
    where: { status: { in: [OperationalDocumentStatus.POSTED, OperationalDocumentStatus.REVERSED] } },
    include: {
      lines: { include: { units: true } },
      journalEntry: true,
      reversal: { select: { id: true, status: true } },
      reversalOf: { select: { id: true, journalEntryId: true } },
      stockCount: { select: { id: true, status: true } },
    },
  });
  for (const adjustment of adjustments) {
    const expectedJournalStatus = adjustment.status === OperationalDocumentStatus.REVERSED ? "REVERSED" : "POSTED";
    assert(adjustment.journalEntry?.status === expectedJournalStatus, `${adjustment.status} adjustment ${adjustment.adjustmentNumber} has an invalid journal state.`);
    if (adjustment.status === OperationalDocumentStatus.REVERSED) assert(adjustment.reversal?.status === OperationalDocumentStatus.POSTED, `Reversed adjustment ${adjustment.adjustmentNumber} lacks one posted linked reversal.`);
    if (adjustment.stockCountId) assert(adjustment.stockCount?.status === OperationalDocumentStatus.POSTED, `Count adjustment ${adjustment.adjustmentNumber} is not linked to a posted count.`);
    const movements = await prisma.inventoryMovement.findMany({ where: { sourceDocumentType: "StockAdjustment", sourceDocumentId: adjustment.id }, include: { reversalOf: true } });
    let increase = zero;
    let decrease = zero;
    for (const line of adjustment.lines) {
      const lineMovements = movements.filter((movement) => movement.lineReference === line.id);
      const quantity = lineMovements.reduce((sum, movement) => sum.plus(movement.quantity), zero);
      const value = lineMovements.reduce((sum, movement) => sum.plus(movement.totalCost), zero);
      assert(quantity.eq(line.quantityDelta), `Adjustment ${adjustment.adjustmentNumber} line ${line.lineNumber} quantity does not reconcile.`);
      assert(value.eq(line.totalCost), `Adjustment ${adjustment.adjustmentNumber} line ${line.lineNumber} value does not reconcile.`);
      assert(lineMovements.every((movement) => movement.branchId === adjustment.branchId && movement.warehouseId === adjustment.warehouseId && movement.journalEntryId === adjustment.journalEntryId), `Adjustment ${adjustment.adjustmentNumber} line ${line.lineNumber} has an invalid warehouse or journal link.`);
      const expectedType = line.quantityDelta.gt(0) ? InventoryMovementType.ADJUSTMENT_IN : InventoryMovementType.ADJUSTMENT_OUT;
      assert(lineMovements.every((movement) => movement.movementType === expectedType), `Adjustment ${adjustment.adjustmentNumber} line ${line.lineNumber} has the wrong movement direction.`);
      if (line.trackingMethod === "IMEI" || line.trackingMethod === "SERIAL") {
        assert(line.quantityDelta.isInteger() && line.units.length === line.quantityDelta.abs().toNumber() && lineMovements.length === line.units.length && lineMovements.every((movement) => movement.stockUnitId), `Serialized adjustment ${adjustment.adjustmentNumber} line ${line.lineNumber} has incomplete unit effects.`);
      } else {
        assert(lineMovements.length === 1 && !lineMovements[0].stockUnitId, `Quantity adjustment ${adjustment.adjustmentNumber} line ${line.lineNumber} must have one aggregate movement.`);
      }
      if (line.totalCost.gt(0)) increase = increase.plus(line.totalCost); else decrease = decrease.plus(line.totalCost.abs());
    }
    assert(increase.eq(adjustment.increaseValue) && decrease.eq(adjustment.decreaseValue) && increase.minus(decrease).eq(adjustment.netValue), `Adjustment ${adjustment.adjustmentNumber} header values do not reconcile to lines.`);
    if (adjustment.reversalOfId) {
      assert(adjustment.journalEntry?.reversalOfId === adjustment.reversalOf?.journalEntryId, `Adjustment reversal ${adjustment.adjustmentNumber} does not reverse the source journal.`);
      assert(movements.every((movement) => movement.reversalOfId && movement.reversalOf?.sourceDocumentId === adjustment.reversalOfId && movement.quantity.eq(movement.reversalOf.quantity.negated()) && movement.totalCost.eq(movement.reversalOf.totalCost.negated())), `Adjustment reversal ${adjustment.adjustmentNumber} does not exactly negate source movements.`);
    }
  }
  console.log(`✓ all ${adjustments.length} posted/reversed stock adjustments reconcile lines, journals, serialized units, count links, and exact reversals`);

  const counts = await prisma.stockCount.findMany({ include: { lines: { include: { units: true } }, adjustment: { include: { lines: true } } } });
  for (const count of counts) {
    for (const line of count.lines) {
      assert(line.varianceQuantity.eq(line.countedQuantity.minus(line.expectedQuantity)), `Count ${count.countNumber} line ${line.lineNumber} has an invalid quantity variance.`);
      if (line.trackingMethod === "IMEI" || line.trackingMethod === "SERIAL") {
        const expectedUnits = line.units.filter((unit) => unit.wasExpected).length;
        const countedUnits = line.units.filter((unit) => unit.counted).length;
        assert(line.expectedQuantity.eq(expectedUnits) && line.countedQuantity.eq(countedUnits), `Serialized count ${count.countNumber} line ${line.lineNumber} does not reconcile snapshot/count flags.`);
      }
    }
    const varianceLines = count.lines.filter((line) => !line.varianceQuantity.isZero());
    if (count.status === OperationalDocumentStatus.POSTED && varianceLines.length) {
      assert(count.adjustment?.status === OperationalDocumentStatus.POSTED, `Posted count ${count.countNumber} lacks its posted generated adjustment.`);
      assert(count.adjustment.lines.length === varianceLines.length, `Count ${count.countNumber} adjustment line count does not match variances.`);
      for (const line of varianceLines) {
        const adjusted = count.adjustment.lines.find((item) => item.productId === line.productId && item.variantId === line.variantId && item.lotId === line.lotId);
        assert(adjusted?.quantityDelta.eq(line.varianceQuantity) && adjusted.totalCost.eq(line.totalVariance), `Count ${count.countNumber} line ${line.lineNumber} does not reconcile to its adjustment.`);
      }
    } else if (count.status === OperationalDocumentStatus.POSTED) {
      assert(!count.adjustment, `Zero-variance count ${count.countNumber} unexpectedly has an adjustment.`);
    } else {
      assert(!count.adjustment, `Unposted count ${count.countNumber} unexpectedly has a posted variance adjustment.`);
    }
  }
  console.log(`✓ all ${counts.length} physical stock counts reconcile immutable snapshots, scanned units, variances, and generated adjustments`);

  const returns = await prisma.stockReturn.findMany({ where: { status: OperationalDocumentStatus.POSTED }, include: { lines: true, journalEntry: true } });
  for (const stockReturn of returns) { assert(stockReturn.journalEntry?.status === "POSTED", `Posted return ${stockReturn.returnNumber} has no posted journal.`); const movementType = stockReturn.returnType === StockReturnType.SALES_RETURN ? InventoryMovementType.SALES_RETURN : InventoryMovementType.PURCHASE_RETURN; const sign = stockReturn.returnType === StockReturnType.SALES_RETURN ? new Prisma.Decimal(1) : new Prisma.Decimal(-1); const movements = await prisma.inventoryMovement.groupBy({ by: ["lineReference"], where: { sourceDocumentId: stockReturn.id, movementType }, _sum: { quantity: true, totalCost: true } }); const movementMapByLine = new Map(movements.map((movement) => [movement.lineReference, movement._sum])); for (const line of stockReturn.lines) { const effect = movementMapByLine.get(line.id); assert((effect?.quantity || zero).eq(line.quantity.times(sign)), `Return ${stockReturn.returnNumber} line ${line.lineNumber} quantity does not reconcile.`); assert((effect?.totalCost || zero).eq(line.costTotal.times(sign)), `Return ${stockReturn.returnNumber} line ${line.lineNumber} cost does not reconcile.`); } }
  console.log(`✓ all ${returns.length} posted sales/vendor returns reconcile source quantity, inventory value, and journals`);

  const journals = await prisma.journalEntry.findMany({ where: { status: { in: ["POSTED", "REVERSED"] } }, include: { lines: true } });
  for (const journal of journals) { const debit = journal.lines.reduce((sum, line) => sum.plus(line.baseDebit), zero); const credit = journal.lines.reduce((sum, line) => sum.plus(line.baseCredit), zero); assert(journal.lines.length >= 2 && debit.eq(credit) && debit.eq(journal.totalDebit) && credit.eq(journal.totalCredit), `Journal ${journal.voucherNumber} is not exactly balanced.`); }
  console.log(`✓ all ${journals.length} posted/reversed journals are exactly balanced`);
  console.log("Operational reconciliation verification passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
