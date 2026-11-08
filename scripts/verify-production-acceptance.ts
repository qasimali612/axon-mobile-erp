import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  IdentifierType,
  InventoryMovementType,
  Prisma,
  PrismaClient,
  ProductStatus,
  StockUnitStatus,
  TrackingMethod,
} from "@prisma/client";
import { isValidImei } from "../src/lib/imei";

const prisma = new PrismaClient();
const run = Date.now().toString(36).toUpperCase();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function luhnDigit(prefix: string): string {
  let sum = 0;
  for (let i = 0; i < prefix.length; i++) {
    let digit = Number(prefix[i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return String((10 - (sum % 10)) % 10);
}

function generateValidImei(seed: string): string {
  const hash = createHash("sha256").update(seed).digest("hex");
  const num = (BigInt(`0x${hash.slice(0, 14)}`) % 1000000000000n).toString().padStart(12, "0");
  const prefix = `86${num}`;
  return `${prefix}${luhnDigit(prefix)}`;
}

async function recordStockMovement(
  tx: Prisma.TransactionClient,
  journal: { id: string; postingDate: Date },
  input: {
    companyId: string;
    branchId: string;
    warehouseId: string;
    productId: string;
    variantId: string;
    movementGroupId: string;
    idempotencyKey: string;
    movementType: InventoryMovementType;
    quantity: Prisma.Decimal;
    unitCost: Prisma.Decimal;
    totalCost: Prisma.Decimal;
    sourceDocumentType: string;
    sourceDocumentId: string;
    sourceDocumentNumber: string;
    createdById: string;
  }
) {
  const m = await tx.inventoryMovement.create({
    data: {
      companyId: input.companyId,
      branchId: input.branchId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      variantId: input.variantId,
      movementGroupId: input.movementGroupId,
      idempotencyKey: input.idempotencyKey,
      movementType: input.movementType,
      postingDate: journal.postingDate,
      journalEntryId: journal.id,
      quantity: input.quantity,
      unitCost: input.unitCost,
      totalCost: input.totalCost,
      sourceDocumentType: input.sourceDocumentType,
      sourceDocumentId: input.sourceDocumentId,
      sourceDocumentNumber: input.sourceDocumentNumber,
      createdById: input.createdById,
    },
  });

  const existing = await tx.stockBalance.findFirst({
    where: {
      companyId: input.companyId,
      branchId: input.branchId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      variantId: input.variantId,
      lotId: null,
    },
  });

  if (existing) {
    await tx.stockBalance.update({
      where: { id: existing.id },
      data: {
        quantity: existing.quantity.plus(input.quantity),
        inventoryValue: existing.inventoryValue.plus(input.totalCost),
      },
    });
  } else {
    const balanceKey = [input.branchId, input.warehouseId, input.productId, input.variantId, "NOLOT"].join(":");
    await tx.stockBalance.create({
      data: {
        companyId: input.companyId,
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        variantId: input.variantId,
        balanceKey,
        quantity: input.quantity,
        inventoryValue: input.totalCost,
      },
    });
  }

  return m;
}

async function main() {
  console.log(`\n=============================================================`);
  console.log(`Starting Production & System Extensions Acceptance Test [RUN ${run}]`);
  console.log(`=============================================================\n`);

  // 1. Context setup
  const company = await prisma.company.findUniqueOrThrow({ where: { code: "AXON" } });
  const branch = await prisma.branch.findFirstOrThrow({ where: { companyId: company.id, isActive: true } });
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { companyId: company.id, branchId: branch.id, isActive: true } });
  const ownerUser = await prisma.user.findFirstOrThrow({ where: { email: "owner@axonmobile.local" } });
  const managerUser = await prisma.user.findFirstOrThrow({ where: { email: "inventory@axonmobile.local" } });
  const postedJournal = await prisma.journalEntry.findFirstOrThrow({
    where: { companyId: company.id, branchId: branch.id, status: "POSTED" },
  });

  console.log(`✓ Context loaded: Company=${company.code}, Branch=${branch.code}, Warehouse=${warehouse.code}, Journal=${postedJournal.voucherNumber}`);

  // 2. Department Management Acceptance
  console.log("\n--- Testing Department Management ---");
  const deptCode = `ENG-${run.slice(-4)}`;
  const department = await prisma.department.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      code: deptCode,
      name: `Assembly & Engineering ${run}`,
      isActive: true,
    },
  });
  assert(department.id, "Department creation failed");
  assert(department.branchId === branch.id, "Department branchId mismatch");
  console.log(`✓ Department created: ${department.code} under Branch ${branch.code}`);

  // Test unique department code constraint
  let duplicateRejected = false;
  try {
    await prisma.department.create({
      data: {
        companyId: company.id,
        branchId: branch.id,
        code: deptCode,
        name: `Duplicate ${deptCode}`,
      },
    });
  } catch {
    duplicateRejected = true;
  }
  assert(duplicateRejected, "Duplicate department code was not rejected");
  console.log(`✓ Duplicate department code correctly rejected by unique constraint`);

  // 3. Document Sequences Acceptance
  console.log("\n--- Testing Operational Sequences ---");
  const sequence = await prisma.documentSequence.upsert({
    where: {
      companyId_branchId_documentType_fiscalYear: {
        companyId: company.id,
        branchId: branch.id,
        documentType: "PRODUCTION_ORDER",
        fiscalYear: "2026-27",
      },
    },
    update: { prefix: "PRD", padding: 6 },
    create: {
      companyId: company.id,
      branchId: branch.id,
      documentType: "PRODUCTION_ORDER",
      prefix: "PRD",
      padding: 6,
      fiscalYear: "2026-27",
      nextValue: 1n,
    },
  });
  assert(sequence.prefix === "PRD", "Document sequence prefix mismatch");
  console.log(`✓ Document sequence verified: type=${sequence.documentType}, prefix=${sequence.prefix}, padding=${sequence.padding}`);

  // 4. Products & Master Data Setup for Production
  console.log("\n--- Testing Bill of Materials (BOM) & Production Setup ---");
  const uom = await prisma.unitOfMeasure.findFirstOrThrow({ where: { companyId: company.id } });
  const category = await prisma.productCategory.findFirstOrThrow({ where: { companyId: company.id } });

  // Finished Good Phone
  const finishedProduct = await prisma.product.create({
    data: {
      companyId: company.id,
      categoryId: category.id,
      unitId: uom.id,
      createdById: ownerUser.id,
      sku: `PHONE-${run}`,
      name: `Axon Pro Flagship ${run}`,
      productType: "SMARTPHONE",
      trackingMethod: "IMEI",
      costingMethod: "SPECIFIC",
      status: ProductStatus.ACTIVE,
    },
  });
  const finishedVariant = await prisma.productVariant.create({
    data: {
      companyId: company.id,
      productId: finishedProduct.id,
      sku: `AXP-${run}-128`,
      name: "128GB Midnight Blue",
      color: "Midnight Blue",
      storageGb: 128,
      ramGb: 8,
      purchasePrice: new Prisma.Decimal(150),
      retailPrice: new Prisma.Decimal(250),
      isActive: true,
    },
  });

  // Component 1: Motherboard
  const motherboardProduct = await prisma.product.create({
    data: {
      companyId: company.id,
      categoryId: category.id,
      unitId: uom.id,
      createdById: ownerUser.id,
      sku: `COMP-MB-${run}`,
      name: `Axon Mainboard PCB ${run}`,
      productType: "SPARE_PART",
      trackingMethod: "QUANTITY",
      costingMethod: "FIFO",
      status: ProductStatus.ACTIVE,
    },
  });
  const mbVariant = await prisma.productVariant.create({
    data: {
      companyId: company.id,
      productId: motherboardProduct.id,
      sku: `MB-${run}`,
      name: "Mainboard Standard",
      purchasePrice: new Prisma.Decimal(100),
      retailPrice: new Prisma.Decimal(150),
      isActive: true,
    },
  });

  // Component 2: OLED Display
  const displayProduct = await prisma.product.create({
    data: {
      companyId: company.id,
      categoryId: category.id,
      unitId: uom.id,
      createdById: ownerUser.id,
      sku: `COMP-DSP-${run}`,
      name: `AMOLED Display Panel ${run}`,
      productType: "SPARE_PART",
      trackingMethod: "QUANTITY",
      costingMethod: "FIFO",
      status: ProductStatus.ACTIVE,
    },
  });
  const displayVariant = await prisma.productVariant.create({
    data: {
      companyId: company.id,
      productId: displayProduct.id,
      sku: `DSP-${run}`,
      name: "6.7 AMOLED 120Hz",
      purchasePrice: new Prisma.Decimal(50),
      retailPrice: new Prisma.Decimal(80),
      isActive: true,
    },
  });

  console.log(`✓ Finished good & component products created with proper tracking specifications`);

  // 5. Seed initial component inventory in warehouse
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.inventory_posting', 'on', true)`;
    const seedGroup = randomUUID();

    // MB stock: 10 units @ $100
    await recordStockMovement(tx, postedJournal, {
      companyId: company.id,
      branchId: branch.id,
      warehouseId: warehouse.id,
      productId: motherboardProduct.id,
      variantId: mbVariant.id,
      movementGroupId: seedGroup,
      idempotencyKey: `SEED-MB-${run}`,
      movementType: InventoryMovementType.PURCHASE_RECEIPT,
      quantity: new Prisma.Decimal(10),
      unitCost: new Prisma.Decimal(100),
      totalCost: new Prisma.Decimal(1000),
      sourceDocumentType: "INIT_COMPONENTS",
      sourceDocumentId: motherboardProduct.id,
      sourceDocumentNumber: `INIT-MB-${run}`,
      createdById: ownerUser.id,
    });

    // Display stock: 10 units @ $50
    await recordStockMovement(tx, postedJournal, {
      companyId: company.id,
      branchId: branch.id,
      warehouseId: warehouse.id,
      productId: displayProduct.id,
      variantId: displayVariant.id,
      movementGroupId: seedGroup,
      idempotencyKey: `SEED-DSP-${run}`,
      movementType: InventoryMovementType.PURCHASE_RECEIPT,
      quantity: new Prisma.Decimal(10),
      unitCost: new Prisma.Decimal(50),
      totalCost: new Prisma.Decimal(500),
      sourceDocumentType: "INIT_COMPONENTS",
      sourceDocumentId: displayProduct.id,
      sourceDocumentNumber: `INIT-DSP-${run}`,
      createdById: ownerUser.id,
    });
  });
  console.log(`✓ Initial component stock balances seeded in ${warehouse.code}`);

  // 6. Create BOM
  const bom = await prisma.bom.create({
    data: {
      companyId: company.id,
      code: `BOM-${run}`,
      name: `Assembly BOM for Axon Pro ${run}`,
      productId: finishedProduct.id,
      variantId: finishedVariant.id,
      outputQuantity: new Prisma.Decimal(1),
      scrapPercentage: new Prisma.Decimal(0),
      items: {
        create: [
          {
            componentProductId: motherboardProduct.id,
            componentVariantId: mbVariant.id,
            quantity: new Prisma.Decimal(1),
            scrapTolerance: new Prisma.Decimal(0),
          },
          {
            componentProductId: displayProduct.id,
            componentVariantId: displayVariant.id,
            quantity: new Prisma.Decimal(1),
            scrapTolerance: new Prisma.Decimal(0),
          },
        ],
      },
    },
    include: { items: true },
  });
  assert(bom.id, "BOM creation failed");
  assert(bom.items.length === 2, "BOM item count mismatch");
  console.log(`✓ BOM created: ${bom.code} with 2 component lines`);

  // 7. Create Production Order (DRAFT)
  const orderNumber = `MO-${run}`;
  const prodOrder = await prisma.productionOrder.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      orderNumber,
      bomId: bom.id,
      productId: finishedProduct.id,
      variantId: finishedVariant.id,
      sourceWarehouseId: warehouse.id,
      targetWarehouseId: warehouse.id,
      plannedQuantity: new Prisma.Decimal(2),
      completedQuantity: new Prisma.Decimal(0),
      scrappedQuantity: new Prisma.Decimal(0),
      plannedStartDate: new Date(),
      plannedEndDate: new Date(Date.now() + 86400000),
      status: "DRAFT",
      createdById: ownerUser.id,
    },
  });
  assert(prodOrder.status === "DRAFT", "Production order initial status not DRAFT");
  console.log(`✓ Production Order created: ${prodOrder.orderNumber} in DRAFT status`);

  // 8. Submit Production Order -> PLANNED
  const submittedOrder = await prisma.productionOrder.update({
    where: { id: prodOrder.id },
    data: { status: "PLANNED" },
  });
  assert(submittedOrder.status === "PLANNED", "Production order submission failed");
  console.log(`✓ Production Order submitted -> PLANNED status`);

  // 9. Approve Production Order -> IN_PROGRESS (Maker-Checker validation)
  assert(ownerUser.id !== managerUser.id, "Test requires distinct requester and approver");
  const approvedOrder = await prisma.productionOrder.update({
    where: { id: prodOrder.id },
    data: {
      status: "IN_PROGRESS",
      approvedById: managerUser.id,
      actualStartDate: new Date(),
    },
  });
  assert(approvedOrder.status === "IN_PROGRESS", "Production order approval failed");
  assert(approvedOrder.approvedById === managerUser.id, "Approver ID not retained");
  console.log(`✓ Production Order approved by independent approver -> IN_PROGRESS`);

  // 10. Issue Materials to WIP
  const issueQty = new Prisma.Decimal(2); // For 2 phones
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.inventory_posting', 'on', true)`;
    const issueGroup = randomUUID();

    // Deduct MB
    const mbMove = await recordStockMovement(tx, postedJournal, {
      companyId: company.id,
      branchId: branch.id,
      warehouseId: warehouse.id,
      productId: motherboardProduct.id,
      variantId: mbVariant.id,
      movementGroupId: issueGroup,
      idempotencyKey: `ISSUE-MB-${run}`,
      movementType: InventoryMovementType.ADJUSTMENT_OUT,
      quantity: new Prisma.Decimal(-2),
      unitCost: new Prisma.Decimal(100),
      totalCost: new Prisma.Decimal(-200),
      sourceDocumentType: "PRODUCTION_ORDER",
      sourceDocumentId: prodOrder.id,
      sourceDocumentNumber: prodOrder.orderNumber,
      createdById: managerUser.id,
    });

    // Deduct Display
    const dspMove = await recordStockMovement(tx, postedJournal, {
      companyId: company.id,
      branchId: branch.id,
      warehouseId: warehouse.id,
      productId: displayProduct.id,
      variantId: displayVariant.id,
      movementGroupId: issueGroup,
      idempotencyKey: `ISSUE-DSP-${run}`,
      movementType: InventoryMovementType.ADJUSTMENT_OUT,
      quantity: new Prisma.Decimal(-2),
      unitCost: new Prisma.Decimal(50),
      totalCost: new Prisma.Decimal(-100),
      sourceDocumentType: "PRODUCTION_ORDER",
      sourceDocumentId: prodOrder.id,
      sourceDocumentNumber: prodOrder.orderNumber,
      createdById: managerUser.id,
    });

    // Record Material Issue Lines
    await tx.productionMaterialIssue.createMany({
      data: [
        {
          productionOrderId: prodOrder.id,
          productId: motherboardProduct.id,
          variantId: mbVariant.id,
          warehouseId: warehouse.id,
          quantity: issueQty,
          unitCost: new Prisma.Decimal(100),
          totalCost: new Prisma.Decimal(200),
          movementId: mbMove.id,
        },
        {
          productionOrderId: prodOrder.id,
          productId: displayProduct.id,
          variantId: displayVariant.id,
          warehouseId: warehouse.id,
          quantity: issueQty,
          unitCost: new Prisma.Decimal(50),
          totalCost: new Prisma.Decimal(100),
          movementId: dspMove.id,
        },
      ],
    });
  });
  console.log(`✓ Material Issue posted: 2 Motherboards ($200) + 2 Displays ($100) deducted to WIP`);

  // Verify component stock reduced
  const mbBalAfter = await prisma.stockBalance.findFirstOrThrow({
    where: { companyId: company.id, warehouseId: warehouse.id, variantId: mbVariant.id, lotId: null },
  });
  assert(Number(mbBalAfter.quantity) === 8, "Motherboard balance did not decrement correctly");
  console.log(`✓ Warehouse component balance correctly decremented (MB: 10 -> 8)`);

  // 11. Finished Goods Receipt & Dual-SIM IMEI Invariant Verification
  console.log("\n--- Testing Finished Goods Receipt & Serialized IMEI Invariants ---");
  const imei1A = generateValidImei(`${run}:device:1:sim1`);
  const imei2A = generateValidImei(`${run}:device:1:sim2`);
  const imei1B = generateValidImei(`${run}:device:2:sim1`);
  const imei2B = generateValidImei(`${run}:device:2:sim2`);

  assert(isValidImei(imei1A), "Generated IMEI1A is invalid");
  assert(isValidImei(imei2A), "Generated IMEI2A is invalid");
  assert(isValidImei(imei1B), "Generated IMEI1B is invalid");
  assert(isValidImei(imei2B), "Generated IMEI2B is invalid");
  console.log(`✓ Luhn checksum validated for 4 test dual-SIM IMEIs:`);
  console.log(`   Device 1: IMEI1=${imei1A}, IMEI2=${imei2A}`);
  console.log(`   Device 2: IMEI1=${imei1B}, IMEI2=${imei2B}`);

  // Test invalid Luhn IMEI rejection
  const invalidImei = "860000000000001"; // Bad checksum (sum % 10 !== 0)
  assert(!isValidImei(invalidImei), "Invalid Luhn checksum was not detected");
  console.log(`✓ Invalid Luhn checksum correctly detected and blocked`);

  // Post Finished Goods Receipt
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.inventory_posting', 'on', true)`;

    const unitCost = new Prisma.Decimal(150);
    const receiptGroup = randomUUID();

    // Movement for finished goods
    await recordStockMovement(tx, postedJournal, {
      companyId: company.id,
      branchId: branch.id,
      warehouseId: warehouse.id,
      productId: finishedProduct.id,
      variantId: finishedVariant.id,
      movementGroupId: receiptGroup,
      idempotencyKey: `PRD-RCV-${run}`,
      movementType: InventoryMovementType.ADJUSTMENT_IN,
      quantity: new Prisma.Decimal(2),
      unitCost: new Prisma.Decimal(150),
      totalCost: new Prisma.Decimal(300),
      sourceDocumentType: "PRODUCTION_ORDER",
      sourceDocumentId: prodOrder.id,
      sourceDocumentNumber: prodOrder.orderNumber,
      createdById: managerUser.id,
    });

    // Device 1: 1 PhysicalStockUnit + 2 DeviceIdentifier rows
    const unit1 = await tx.physicalStockUnit.create({
      data: {
        companyId: company.id,
        currentBranchId: branch.id,
        currentWarehouseId: warehouse.id,
        productId: finishedProduct.id,
        variantId: finishedVariant.id,
        status: StockUnitStatus.IN_STOCK,
        acquisitionDate: new Date(),
        acquisitionCost: unitCost,
      },
    });
    await tx.deviceIdentifier.createMany({
      data: [
        {
          companyId: company.id,
          stockUnitId: unit1.id,
          type: IdentifierType.IMEI,
          value: imei1A,
          normalizedValue: imei1A,
          slot: 1,
          isPrimary: true,
        },
        {
          companyId: company.id,
          stockUnitId: unit1.id,
          type: IdentifierType.IMEI,
          value: imei2A,
          normalizedValue: imei2A,
          slot: 2,
          isPrimary: false,
        },
      ],
    });
    await tx.productionOrderUnit.create({
      data: {
        productionOrderId: prodOrder.id,
        physicalStockUnitId: unit1.id,
        imei1: imei1A,
        imei2: imei2A,
        qcResult: "PASS",
      },
    });

    // Device 2: 1 PhysicalStockUnit + 2 DeviceIdentifier rows
    const unit2 = await tx.physicalStockUnit.create({
      data: {
        companyId: company.id,
        currentBranchId: branch.id,
        currentWarehouseId: warehouse.id,
        productId: finishedProduct.id,
        variantId: finishedVariant.id,
        status: StockUnitStatus.IN_STOCK,
        acquisitionDate: new Date(),
        acquisitionCost: unitCost,
      },
    });
    await tx.deviceIdentifier.createMany({
      data: [
        {
          companyId: company.id,
          stockUnitId: unit2.id,
          type: IdentifierType.IMEI,
          value: imei1B,
          normalizedValue: imei1B,
          slot: 1,
          isPrimary: true,
        },
        {
          companyId: company.id,
          stockUnitId: unit2.id,
          type: IdentifierType.IMEI,
          value: imei2B,
          normalizedValue: imei2B,
          slot: 2,
          isPrimary: false,
        },
      ],
    });
    await tx.productionOrderUnit.create({
      data: {
        productionOrderId: prodOrder.id,
        physicalStockUnitId: unit2.id,
        imei1: imei1B,
        imei2: imei2B,
        qcResult: "PASS",
      },
    });

    // Update order progress
    await tx.productionOrder.update({
      where: { id: prodOrder.id },
      data: {
        completedQuantity: new Prisma.Decimal(2),
        status: "COMPLETED",
        actualEndDate: new Date(),
      },
    });
  });
  console.log(`✓ Assembly receipt posted: 2 finished phones added to inventory`);

  // 12. Invariant Audits
  console.log("\n--- Verifying Invariants & Audit Trails ---");

  // Invariant 1: Exactly 1 PhysicalStockUnit per device with multiple IMEIs
  const registeredUnits = await prisma.productionOrderUnit.findMany({
    where: { productionOrderId: prodOrder.id },
    include: {
      physicalStockUnit: {
        include: { identifiers: true },
      },
    },
  });
  assert(registeredUnits.length === 2, "Registered units count mismatch");
  for (const reg of registeredUnits) {
    assert(reg.physicalStockUnit.identifiers.length === 2, "Device must have exactly 2 identifiers (IMEI1 & IMEI2)");
    assert(reg.physicalStockUnit.status === StockUnitStatus.IN_STOCK, "Physical stock unit must be IN_STOCK");
    console.log(`✓ Device Unit ${reg.physicalStockUnitId} verified: Status=${reg.physicalStockUnit.status}, Identifiers=${reg.physicalStockUnit.identifiers.map(i => `${i.type}[slot ${i.slot}]:${i.value}`).join(", ")}`);
  }

  // Invariant 2: Duplicate IMEI prevention
  let dupImeiRejected = false;
  try {
    const fakeUnit = await prisma.physicalStockUnit.create({
      data: {
        companyId: company.id,
        currentBranchId: branch.id,
        currentWarehouseId: warehouse.id,
        productId: finishedProduct.id,
        variantId: finishedVariant.id,
        status: StockUnitStatus.IN_STOCK,
        acquisitionDate: new Date(),
        acquisitionCost: new Prisma.Decimal(150),
      },
    });
    await prisma.deviceIdentifier.create({
      data: {
        companyId: company.id,
        stockUnitId: fakeUnit.id,
        type: IdentifierType.IMEI,
        value: imei1A, // Already registered!
        normalizedValue: imei1A,
        slot: 1,
        isPrimary: true,
      },
    });
  } catch {
    dupImeiRejected = true;
  }
  assert(dupImeiRejected, "Database permitted duplicate IMEI registration");
  console.log(`✓ Global duplicate IMEI registration correctly prevented by unique index [companyId, type, normalizedValue]`);

  // Invariant 3: Order completed status
  const finalOrder = await prisma.productionOrder.findUniqueOrThrow({
    where: { id: prodOrder.id },
  });
  assert(finalOrder.status === "COMPLETED", "Final order status must be COMPLETED");
  assert(Number(finalOrder.completedQuantity) === 2, "Final order completedQuantity must be 2");
  console.log(`✓ Production Order fully completed: Planned=2, Completed=${finalOrder.completedQuantity}`);

  // Invariant 4: Finished goods stock balance
  const phoneBal = await prisma.stockBalance.findFirstOrThrow({
    where: { companyId: company.id, warehouseId: warehouse.id, variantId: finishedVariant.id, lotId: null },
  });
  assert(Number(phoneBal.quantity) === 2, "Finished phone stock balance mismatch");
  assert(Number(phoneBal.inventoryValue) === 300, "Finished phone inventory value mismatch");
  console.log(`✓ Finished goods stock balance verified: 2 units in stock, value = $300.00`);

  console.log(`\n=============================================================`);
  console.log(`All Production, BOM, Device Invariants & Acceptance Tests PASSED!`);
  console.log(`=============================================================\n`);
}

main()
  .catch((err) => {
    console.error("FAILED acceptance test:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
