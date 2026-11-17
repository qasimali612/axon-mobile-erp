import { PrismaClient, WarehouseType } from "@prisma/client";

const cloudUrl = "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30";
const prisma = new PrismaClient({ datasources: { db: { url: cloudUrl } } });

async function main() {
  console.log("=== RESTORING AND FIXING BRANCHES & WAREHOUSES ===\n");

  const company = await prisma.company.findFirst({ where: { code: "AXON" } });
  if (!company) throw new Error("Company AXON not found");

  // 1. Ensure Branches HZR and ISB are active and not archived
  const hzr = await prisma.branch.updateMany({
    where: { companyId: company.id, code: "HZR" },
    data: { isActive: true, archivedAt: null }
  });
  console.log(`Branch HZR active & unarchived: count = ${hzr.count}`);

  const isb = await prisma.branch.updateMany({
    where: { companyId: company.id, code: "ISB" },
    data: { isActive: true, archivedAt: null }
  });
  console.log(`Branch ISB active & unarchived: count = ${isb.count}`);

  const hzrBranch = await prisma.branch.findFirst({ where: { companyId: company.id, code: "HZR" } });
  const isbBranch = await prisma.branch.findFirst({ where: { companyId: company.id, code: "ISB" } });

  // 2. Unarchive and activate HZR-MAIN
  const hzrMain = await prisma.warehouse.updateMany({
    where: { companyId: company.id, code: "HZR-MAIN" },
    data: {
      branchId: hzrBranch.id,
      isActive: true,
      archivedAt: null,
      allowReceiving: true,
      allowDispatch: true,
      type: WarehouseType.STANDARD
    }
  });
  console.log(`Warehouse HZR-MAIN restored and active: count = ${hzrMain.count}`);

  // 3. Unarchive and activate HZR-QUARANTINE
  const hzrQuar = await prisma.warehouse.updateMany({
    where: { companyId: company.id, code: "HZR-QUARANTINE" },
    data: {
      branchId: hzrBranch.id,
      isActive: true,
      archivedAt: null,
      allowReceiving: true,
      allowDispatch: false,
      type: WarehouseType.QUARANTINE
    }
  });
  console.log(`Warehouse HZR-QUARANTINE restored and active: count = ${hzrQuar.count}`);

  // 4. Unarchive and activate ISB-QUARANTINE
  const isbQuar = await prisma.warehouse.updateMany({
    where: { companyId: company.id, code: "ISB-QUARANTINE" },
    data: {
      branchId: isbBranch.id,
      isActive: true,
      archivedAt: null,
      allowReceiving: true,
      allowDispatch: false,
      type: WarehouseType.QUARANTINE
    }
  });
  console.log(`Warehouse ISB-QUARANTINE restored and active: count = ${isbQuar.count}`);

  // 5. Ensure ISB-RETAIL is active, unarchived, and is default
  const isbRetail = await prisma.warehouse.updateMany({
    where: { companyId: company.id, code: "ISB-RETAIL" },
    data: {
      branchId: isbBranch.id,
      isActive: true,
      archivedAt: null,
      allowReceiving: true,
      allowDispatch: true,
      isDefault: true,
      type: WarehouseType.STORE
    }
  });
  console.log(`Warehouse ISB-RETAIL active & default: count = ${isbRetail.count}`);

  // 6. Verify final state
  console.log("\n=== CURRENT BRANCHES & WAREHOUSES ===");
  const branches = await prisma.branch.findMany({
    where: { companyId: company.id },
    include: { warehouses: true },
    orderBy: { code: "asc" }
  });
  for (const b of branches) {
    console.log(`Branch: ${b.code} - ${b.name} (Active: ${b.isActive}, Archived: ${b.archivedAt})`);
    for (const w of b.warehouses) {
      console.log(`  -> Warehouse: ${w.code} - ${w.name} (Type: ${w.type}, Active: ${w.isActive}, Archived: ${w.archivedAt}, Default: ${w.isDefault})`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
