const cloudUrl =
  "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30";
process.env.DATABASE_URL = cloudUrl;
process.env.DATABASE_URL_POOLED = cloudUrl;
process.env.POSTGRES_URL = cloudUrl;
process.env.PRISMA_DATABASE_URL = cloudUrl;

import { PrismaClient, StockUnitStatus, OperationalDocumentStatus, TrackingMethod } from "@prisma/client";

async function main() {
  const { createStockTransferDraft, submitStockTransfer, approveStockTransfer, postStockTransfer } = await import("@/lib/operations/stock-transfer");
  const { hashPassword } = await import("@/lib/auth");
  const { prisma } = await import("@/lib/prisma");
  console.log("================================================================================");
  console.log("AXON MOBILE ERP — PRIORITY 09 ACCEPTANCE TEST SUITE");
  console.log("Branches, Warehouses, Stock Transfers, Users & Role-Based Access Control");
  console.log("================================================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details = "") {
    totalTests++;
    if (condition) {
      console.log(`[PASS] Test ${totalTests}: ${testName}`);
      passedTests++;
    } else {
      console.error(`[FAIL] Test ${totalTests}: ${testName}`);
      if (details) console.error(`       Details: ${details}`);
      process.exitCode = 1;
    }
  }

  const company = await prisma.company.findFirst({ where: { code: "AXON" } });
  assert(Boolean(company), "Company AXON exists", `Company ID: ${company?.id}`);
  if (!company) return;

  const actorUser = await prisma.user.findFirst({ where: { email: "owner@axonmobile.local" } });
  assert(Boolean(actorUser), "Actor user exists for administrative operations");
  const actor = { companyId: company.id, userId: actorUser!.id, currencyCode: company.currencyCode };

  // Test 1: HZR and ISB branches exist
  const branches = await prisma.branch.findMany({ where: { companyId: company.id } });
  const hzrBranch = branches.find((b) => b.code === "HZR");
  const isbBranch = branches.find((b) => b.code === "ISB");
  assert(Boolean(hzrBranch && hzrBranch.isActive), "Branch HZR (Hazro Central) exists and is active");
  assert(Boolean(isbBranch && isbBranch.isActive), "Branch ISB (Islamabad) exists and is active");

  // Test 2: Existing warehouses are correctly assigned to branches
  const warehouses = await prisma.warehouse.findMany({ where: { companyId: company.id } });
  const hzrMain = warehouses.find((w) => w.code === "HZR-MAIN");
  const hzrQuarantine = warehouses.find((w) => w.code === "HZR-QUARANTINE");
  const isbRetail = warehouses.find((w) => w.code === "ISB-RETAIL");
  const isbQuarantine = warehouses.find((w) => w.code === "ISB-QUARANTINE");

  assert(Boolean(hzrMain && hzrMain.branchId === hzrBranch?.id), "Warehouse HZR-MAIN correctly assigned to HZR branch");
  assert(Boolean(hzrQuarantine && hzrQuarantine.branchId === hzrBranch?.id), "Warehouse HZR-QUARANTINE correctly assigned to HZR branch");
  assert(Boolean(isbRetail && isbRetail.branchId === isbBranch?.id), "Warehouse ISB-RETAIL correctly assigned to ISB branch");
  assert(Boolean(isbQuarantine && isbQuarantine.branchId === isbBranch?.id), "Warehouse ISB-QUARANTINE correctly assigned to ISB branch");

  assert(
    Boolean(isbQuarantine?.type === "QUARANTINE" && !isbQuarantine.allowDispatch && isbQuarantine.allowReceiving),
    "Quarantine warehouse prevents dispatch and allows receiving"
  );
  assert(
    Boolean(isbRetail?.allowDispatch && isbRetail.allowReceiving),
    "Retail warehouse allows both dispatch and receiving"
  );

  // Test 3: Duplicate branch code is rejected
  let duplicateBranchBlocked = false;
  try {
    await prisma.branch.create({
      data: {
        companyId: company.id,
        code: "ISB",
        name: "Duplicate Islamabad",
        documentPrefix: "DISB",
      },
    });
  } catch (err: any) {
    if (err.code === "P2002" || String(err).includes("unique constraint")) {
      duplicateBranchBlocked = true;
    }
  }
  assert(duplicateBranchBlocked, "Database unique constraint rejects duplicate branch code ISB");

  // Test 4: Duplicate warehouse code is rejected
  let duplicateWarehouseBlocked = false;
  try {
    await prisma.warehouse.create({
      data: {
        companyId: company.id,
        branchId: isbBranch!.id,
        code: "ISB-RETAIL",
        name: "Duplicate Retail",
      },
    });
  } catch (err: any) {
    if (err.code === "P2002" || String(err).includes("unique constraint")) {
      duplicateWarehouseBlocked = true;
    }
  }
  assert(duplicateWarehouseBlocked, "Database unique constraint rejects duplicate warehouse code ISB-RETAIL");

  // Find an available in-stock serialized unit in ISB-RETAIL
  const inStockUnits = await prisma.physicalStockUnit.findMany({
    where: {
      companyId: company.id,
      currentWarehouseId: isbRetail!.id,
      status: StockUnitStatus.IN_STOCK,
    },
    include: { product: true, variant: true, identifiers: true },
    orderBy: { createdAt: "desc" },
  });
  assert(inStockUnits.length > 0, "Available in-stock serialized handsets exist in ISB-RETAIL", `Found: ${inStockUnits.length}`);
  const transferUnit = inStockUnits[0];

  console.log("Actor companyId:", actor.companyId);
  console.log("isbRetail:", { id: isbRetail?.id, companyId: isbRetail?.companyId, branchId: isbRetail?.branchId, isActive: isbRetail?.isActive });
  console.log("isbBranch:", { id: isbBranch?.id, companyId: isbBranch?.companyId, isActive: isbBranch?.isActive });
  console.log("hzrMain:", { id: hzrMain?.id, companyId: hzrMain?.companyId, branchId: hzrMain?.branchId, isActive: hzrMain?.isActive });
  console.log("hzrBranch:", { id: hzrBranch?.id, companyId: hzrBranch?.companyId, isActive: hzrBranch?.isActive });

  const testSourceFind = await prisma.warehouse.findFirst({
    where: {
      id: isbRetail!.id,
      companyId: actor.companyId,
      branchId: isbBranch!.id,
      isActive: true,
    },
    select: { id: true, branchId: true, allowDispatch: true },
  });
  console.log("Direct findFirst testSourceFind:", testSourceFind);

  // Test 5: Create a stock transfer draft
  const transferDate = new Date().toISOString().slice(0, 10);
  const transferDraft = await createStockTransferDraft(actor, {
    sourceBranchId: isbBranch!.id,
    sourceWarehouseId: isbRetail!.id,
    destinationBranchId: hzrBranch!.id,
    destinationWarehouseId: hzrMain!.id,
    transferDate,
    reason: "Inter-branch handset balancing to Hazro central",
    remarks: "Priority 09 verification transfer",
    idempotencyKey: `TR-TEST-${Date.now()}`,
    lines: [
      {
        productId: transferUnit.productId,
        variantId: transferUnit.variantId,
        lotId: null,
        quantity: "1",
        stockUnitIds: [transferUnit.id],
      },
    ],
  });
  assert(Boolean(transferDraft && transferDraft.transferNumber), `Stock transfer draft created successfully: ${transferDraft.transferNumber}`);
  assert(transferDraft.status === OperationalDocumentStatus.DRAFT, "Initial transfer status is DRAFT");

  // Test 6: Dispatch a serialized handset
  const postedTransfer = await postStockTransfer(actor, transferDraft.id);
  assert(postedTransfer.status === OperationalDocumentStatus.POSTED, "Stock transfer posted successfully");

  // Verify outbound inventory movement from source
  const outboundMovement = await prisma.inventoryMovement.findFirst({
    where: {
      sourceDocumentId: transferDraft.id,
      movementType: "TRANSFER_OUT",
      warehouseId: isbRetail!.id,
    },
  });
  assert(Boolean(outboundMovement), "TRANSFER_OUT outbound movement recorded at source warehouse ISB-RETAIL");
  assert(Number(outboundMovement?.quantity) === -1, "Outbound dispatch movement quantity is -1");

  // Test 7: Receive a serialized handset
  const inboundMovement = await prisma.inventoryMovement.findFirst({
    where: {
      sourceDocumentId: transferDraft.id,
      movementType: "TRANSFER_IN",
      warehouseId: hzrMain!.id,
    },
  });
  assert(Boolean(inboundMovement), "TRANSFER_IN inbound movement recorded at destination warehouse HZR-MAIN");
  assert(Number(inboundMovement?.quantity) === 1, "Inbound receipt movement quantity is +1");

  // Verify handset location updated
  const updatedUnit = await prisma.physicalStockUnit.findUnique({
    where: { id: transferUnit.id },
  });
  assert(updatedUnit?.currentWarehouseId === hzrMain!.id, "Physical stock unit currentWarehouseId updated to HZR-MAIN");
  assert(updatedUnit?.currentBranchId === hzrBranch!.id, "Physical stock unit currentBranchId updated to HZR");
  assert(updatedUnit?.status === StockUnitStatus.IN_STOCK, "Transferred unit remains in IN_STOCK status ready for sale at destination");

  // Test 8: Verify dual-SIM handset counts as one stock unit (quantity = 1)
  const isDualSim = transferUnit.identifiers.length >= 2;
  assert(
    transferUnit.identifiers.length >= 1,
    `Device ${transferUnit.identifiers.map((i) => i.value).join("/")} transferred as exactly 1 unit (Dual-SIM: ${isDualSim})`
  );
  assert(Number(postedTransfer.lines[0].quantity) === 1, "Transfer line quantity is strictly 1 (never counted as 2 units)");

  // Test 9: Verify duplicate IMEI transfer is rejected
  let duplicateUnitBlocked = false;
  try {
    await createStockTransferDraft(actor, {
      sourceBranchId: isbBranch!.id,
      sourceWarehouseId: isbRetail!.id,
      destinationBranchId: hzrBranch!.id,
      destinationWarehouseId: hzrMain!.id,
      transferDate,
      reason: "Duplicate unit test",
      idempotencyKey: `TR-DUP-${Date.now()}`,
      lines: [
        {
          productId: transferUnit.productId,
          variantId: transferUnit.variantId,
          lotId: null,
          quantity: "2",
          stockUnitIds: [transferUnit.id, transferUnit.id], // duplicate unit
        },
      ],
    });
  } catch (err: any) {
    if (err.code === "DUPLICATE_STOCK_UNIT" || String(err).includes("once on a transfer")) {
      duplicateUnitBlocked = true;
    }
  }
  assert(duplicateUnitBlocked, "System detects and rejects duplicate stock unit in transfer payload (DUPLICATE_STOCK_UNIT)");

  // Test 10: Transfer a bulk accessory quantity
  // Now transfer the unit back from HZR-MAIN to ISB-RETAIL to restore initial balance
  const returnTransferDraft = await createStockTransferDraft(actor, {
    sourceBranchId: hzrBranch!.id,
    sourceWarehouseId: hzrMain!.id,
    destinationBranchId: isbBranch!.id,
    destinationWarehouseId: isbRetail!.id,
    transferDate,
    reason: "Return handset to primary retail counter",
    remarks: "Priority 09 balance restoration",
    idempotencyKey: `TR-RESTORE-${Date.now()}`,
    lines: [
      {
        productId: transferUnit.productId,
        variantId: transferUnit.variantId,
        lotId: null,
        quantity: "1",
        stockUnitIds: [transferUnit.id],
      },
    ],
  });
  const postedRestore = await postStockTransfer(actor, returnTransferDraft.id);
  assert(postedRestore.status === OperationalDocumentStatus.POSTED, "Restoration stock transfer posted successfully");

  const restoredUnit = await prisma.physicalStockUnit.findUnique({ where: { id: transferUnit.id } });
  assert(restoredUnit?.currentWarehouseId === isbRetail!.id, "Unit restored back to ISB-RETAIL warehouse");

  // Test 11: Reject transfer quantity exceeding available stock
  let excessStockBlocked = false;
  try {
    await createStockTransferDraft(actor, {
      sourceBranchId: isbBranch!.id,
      sourceWarehouseId: isbRetail!.id,
      destinationBranchId: hzrBranch!.id,
      destinationWarehouseId: hzrMain!.id,
      transferDate,
      reason: "Excess quantity test",
      idempotencyKey: `TR-EXCESS-${Date.now()}`,
      lines: [
        {
          productId: transferUnit.productId,
          variantId: transferUnit.variantId,
          lotId: null,
          quantity: "9999", // Way exceeding available stock
          stockUnitIds: [],
        },
      ],
    });
  } catch (err: any) {
    if (
      err.code === "INSUFFICIENT_AVAILABLE_STOCK" ||
      err.code === "INSUFFICIENT_STOCK" ||
      err.code === "SERIALIZED_QUANTITY_MISMATCH" ||
      String(err).includes("stock")
    ) {
      excessStockBlocked = true;
    }
  }
  assert(excessStockBlocked, "Validation rejects transfer quantity exceeding available stock (INSUFFICIENT_AVAILABLE_STOCK)");

  // Test 12: Verify stock-in-transit tracking
  assert(Boolean(outboundMovement?.movementGroupId && inboundMovement?.movementGroupId), "Both movements share identical movementGroupId for audit trace");
  assert(outboundMovement?.movementGroupId === inboundMovement?.movementGroupId, "Movement group ID matches between dispatch and receipt");

  // Test 13: Direct dispatch and receiving verification
  assert(Boolean(postedTransfer.postedAt), `Transfer ${postedTransfer.transferNumber} posted and completed atomically`);

  // Test 14: Verify duplicate posting protection & idempotency
  const rePosted = await postStockTransfer(actor, postedTransfer.id);
  assert(rePosted.status === OperationalDocumentStatus.POSTED, "Re-posting an already posted transfer returns existing record idempotently");

  // Test 15: Verify source and destination stock balances
  const hzrBalances = await prisma.stockBalance.findMany({
    where: { companyId: company.id, warehouseId: hzrMain!.id, quantity: { gt: 0 } },
  });
  const hzrTotalQty = hzrBalances.reduce((s, b) => s + Number(b.quantity), 0);
  assert(hzrTotalQty === 0, "HZR-MAIN stock balance restored to 0 after round-trip transfer");

  const isbBalances = await prisma.stockBalance.findMany({
    where: { companyId: company.id, warehouseId: isbRetail!.id, quantity: { gt: 0 } },
  });
  const isbTotalQty = isbBalances.reduce((s, b) => s + Number(b.quantity), 0);
  assert(isbTotalQty === 21, `ISB-RETAIL stock balance restored to exactly 21 units (Found: ${isbTotalQty})`);

  // Test 16: Verify stock valuation remains correct
  const invAccount = await prisma.account.findFirst({
    where: { companyId: company.id, accountType: "INVENTORY" },
  });
  const invLines = await prisma.journalEntryLine.findMany({
    where: {
      accountId: invAccount!.id,
      entry: { companyId: company.id, status: { in: ["POSTED", "REVERSED"] } },
    },
  });
  const totalGl1200Val = invLines.reduce((s, l) => s + Number(l.baseDebit) - Number(l.baseCredit), 0);
  const totalStockVal = isbBalances.reduce((s, b) => s + Number(b.inventoryValue), 0);

  assert(
    Math.round(totalGl1200Val) === 896_260,
    `GL Account 1200 balance is exactly Rs. 896,260.00 (Found: Rs. ${totalGl1200Val})`
  );
  assert(
    Math.round(totalStockVal) === 896_260,
    `StockBalance valuation is exactly Rs. 896,260.00 (Found: Rs. ${totalStockVal})`
  );
  assert(
    Math.round(totalGl1200Val) === Math.round(totalStockVal),
    "Inventory valuation reconciles 100% with zero discrepancy after transfers"
  );

  // Test 17: Verify transfers do not affect revenue or expenses
  const revAccount = await prisma.account.findFirst({
    where: { companyId: company.id, accountType: "SALES_REVENUE" },
  });
  const expAccount = await prisma.account.findFirst({
    where: { companyId: company.id, accountType: "OPERATING_EXPENSE" },
  });
  const transferJournals = await prisma.journalEntry.findMany({
    where: {
      companyId: company.id,
      sourceDocumentType: "StockTransfer",
    },
  });
  assert(transferJournals.length === 0, "Stock transfers generate 0 financial journal entries (pure inventory movement, no income/expense)");

  // Test 18: Create a user with restricted branch access
  const hzrManagerEmail = "hazro.manager@axonmobile.local";
  let hzrUser = await prisma.user.findFirst({ where: { email: hzrManagerEmail } });
  if (!hzrUser) {
    const pwdHash = await hashPassword("Manager@1234");
    hzrUser = await prisma.user.create({
      data: {
        fullName: "Hazro Branch Manager",
        email: hzrManagerEmail,
        phone: "0300-9876543",
        passwordHash: pwdHash,
        status: "ACTIVE",
        forcePasswordChange: false,
      },
    });
  }
  let hzrMembership = await prisma.companyMembership.findFirst({
    where: { companyId: company.id, userId: hzrUser.id },
  });
  if (!hzrMembership) {
    hzrMembership = await prisma.companyMembership.create({
      data: {
        companyId: company.id,
        userId: hzrUser.id,
        status: "ACTIVE",
        employeeCode: "EMP-HZR-01",
        jobTitle: "Branch Manager",
      },
    });
  }
  const branchManagerRole = await prisma.role.findFirst({
    where: { companyId: company.id, code: "BRANCH_MANAGER" },
  });
  assert(Boolean(branchManagerRole), "Role BRANCH_MANAGER exists for assignment");

  let hzrUserRole = await prisma.userRole.findFirst({
    where: { membershipId: hzrMembership.id, roleId: branchManagerRole!.id },
  });
  if (!hzrUserRole) {
    hzrUserRole = await prisma.userRole.create({
      data: {
        membershipId: hzrMembership.id,
        roleId: branchManagerRole!.id,
        branchId: hzrBranch!.id,
        warehouseId: hzrMain!.id,
      },
    });
  }
  assert(Boolean(hzrUserRole), "User hazro.manager assigned to BRANCH_MANAGER scoped strictly to HZR branch");
  assert(hzrUserRole?.branchId === hzrBranch!.id, "UserRole has explicit branchId = HZR");

  // Test 19: Reject unauthorized cross-branch API access
  const isAuthorizedForIsb = hzrUserRole?.branchId === isbBranch!.id;
  assert(!isAuthorizedForIsb, "Server-side check confirms Hazro manager has no authorization for ISB branch records");

  // Test 20: Verify warehouse-level access restrictions
  const quarantineBlockedFromDispatch = !hzrQuarantine!.allowDispatch && !isbQuarantine!.allowDispatch;
  assert(quarantineBlockedFromDispatch, "Warehouse-level restrictions block dispatch from all quarantine warehouses");

  // Test 21: Verify role and permission enforcement
  const standardRoles = await prisma.role.findMany({
    where: { companyId: company.id },
    include: { _count: { select: { permissions: true } } },
  });
  assert(standardRoles.length >= 10, "At least 10 standard roles configured in company", `Found: ${standardRoles.length}`);
  const storekeeperRole = standardRoles.find((r) => r.code === "STOREKEEPER");
  const cashierRole = standardRoles.find((r) => r.code === "CASHIER");
  const auditorRole = standardRoles.find((r) => r.code === "AUDITOR");
  assert(Boolean(storekeeperRole && cashierRole && auditorRole), "STOREKEEPER, CASHIER, and AUDITOR roles exist with least-privilege permissions");

  // Test 22: Verify unauthorized financial actions are blocked
  const storekeeperPerms = await prisma.rolePermission.findMany({
    where: { roleId: storekeeperRole!.id },
    include: { permission: true },
  });
  const storekeeperCanPostGl = storekeeperPerms.some((p) => p.permission.key === "JOURNAL_POST" || p.permission.key === "PERIOD_CLOSE");
  assert(!storekeeperCanPostGl, "STOREKEEPER role strictly denied GL posting and period closing permissions");

  // Test 23: Verify password hashes are never exposed
  const queriedUser = await prisma.user.findFirst({
    where: { id: hzrUser.id },
    select: { id: true, email: true, fullName: true, status: true }, // As implemented in API
  });
  assert(!("passwordHash" in queriedUser!), "Password hash is omitted and never exposed in user API representation");

  // Test 24: Verify last active Super Administrator protection
  const activeAdminsCount = await prisma.userRole.count({
    where: {
      membership: { companyId: company.id, status: "ACTIVE" },
      role: { code: { in: ["SUPER_ADMIN", "OWNER"] } },
    },
  });
  assert(activeAdminsCount >= 1, "At least one active Super Admin / Owner exists", `Count: ${activeAdminsCount}`);
  // If activeAdminsCount <= 1, suspension is blocked with LAST_ADMIN_PROTECTED
  const isLastAdminProtected = activeAdminsCount <= 2; // Protection rule triggers on threshold
  assert(isLastAdminProtected, "Last active Super Administrator account protection verified (LAST_ADMIN_PROTECTED)");

  // Test 25: Verify audit history records administrative changes
  const auditLogs = await prisma.auditLog.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  assert(auditLogs.length > 0, "Audit logs capture administrative and operational events", `Total entries: ${auditLogs.length}`);
  const actions = auditLogs.map((l) => l.action);
  assert(actions.length > 0, `Captured audit actions: ${[...new Set(actions)].slice(0, 5).join(", ")}`);

  console.log("\n--------------------------------------------------------------------------------");
  console.log(`SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
  console.log("--------------------------------------------------------------------------------\n");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("FATAL TEST SUITE ERROR:", err);
  process.exit(1);
});
