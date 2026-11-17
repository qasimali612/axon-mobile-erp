import { PrismaClient } from "@prisma/client";

const cloudUrl =
  "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require&connection_limit=1&pool_timeout=30";
const prisma = new PrismaClient({ datasources: { db: { url: cloudUrl } } });

const roleTemplates = [
  { code: "SUPER_ADMIN", name: "Super Administrator", description: "Full company administration, user management, and security controls.", isSystem: true },
  { code: "ADMINISTRATOR", name: "Administrator", description: "Company configuration, users, roles, and operational administration.", isSystem: true },
  { code: "BRANCH_MANAGER", name: "Branch Manager", description: "Full operational oversight for an assigned branch (sales, stock, expenses).", isSystem: false },
  { code: "INVENTORY_MANAGER", name: "Inventory Manager", description: "Stock controls, catalog, serialized devices, transfers, and inventory audits.", isSystem: false },
  { code: "STOREKEEPER", name: "Storekeeper", description: "Warehouse stock receiving, dispatch, transfers, and counting.", isSystem: false },
  { code: "SALESPERSON", name: "Salesperson", description: "POS counter operations, sales invoices, receipts, and returns.", isSystem: false },
  { code: "PURCHASE_OFFICER", name: "Purchase Officer", description: "Purchase orders, goods receipts, and vendor returns.", isSystem: false },
  { code: "ACCOUNTANT", name: "Accountant", description: "General ledger, expenses, payments, banking, and financial reports.", isSystem: false },
  { code: "CASHIER", name: "Cashier", description: "Retail POS sales, cash/bank receipt recording, and shift closing.", isSystem: false },
  { code: "AUDITOR", name: "Auditor / Viewer", description: "Read-only access to audit logs, stock ledgers, financial reports, and sales.", isSystem: false },
];

async function main() {
  const company = await prisma.company.findFirst({ where: { code: "AXON" } });
  if (!company) throw new Error("Company AXON not found");

  const allPermissions = await prisma.permission.findMany();
  const permMap = new Map(allPermissions.map((p) => [p.key, p.id]));

  for (const t of roleTemplates) {
    let role = await prisma.role.findFirst({
      where: { companyId: company.id, code: t.code },
    });

    if (!role) {
      role = await prisma.role.create({
        data: {
          companyId: company.id,
          code: t.code,
          name: t.name,
          description: t.description,
          isSystem: t.isSystem,
          isActive: true,
        },
      });
      console.log(`Created role: ${role.code} (${role.name})`);
    } else {
      console.log(`Role already exists: ${role.code}`);
    }

    // Determine permissions for role
    let grantedKeys = [];
    if (t.code === "SUPER_ADMIN" || t.code === "OWNER") {
      grantedKeys = allPermissions.map((p) => p.key);
    } else if (t.code === "ADMINISTRATOR") {
      grantedKeys = allPermissions.filter((p) => p.key !== "backup.restore").map((p) => p.key);
    } else if (t.code === "BRANCH_MANAGER") {
      grantedKeys = allPermissions
        .filter((p) => p.module === "sales" || p.module === "purchase" || p.module === "inventory" || p.module === "transfer" || p.module === "expense" || p.module === "customer" || p.module === "supplier" || p.module === "dashboard" || p.module === "report" || p.module === "organization")
        .map((p) => p.key);
    } else if (t.code === "INVENTORY_MANAGER") {
      grantedKeys = allPermissions
        .filter((p) => p.module === "inventory" || p.module === "transfer" || p.module === "stocktake" || p.module === "catalog" || p.module === "label" || p.module === "dashboard" || p.module === "report")
        .map((p) => p.key);
    } else if (t.code === "STOREKEEPER") {
      grantedKeys = allPermissions
        .filter((p) => p.module === "transfer" || p.key.startsWith("inventory.") || p.module === "stocktake" || p.module === "label")
        .map((p) => p.key);
    } else if (t.code === "SALESPERSON") {
      grantedKeys = allPermissions
        .filter((p) => p.module === "sales" || p.module === "customer" || p.key.startsWith("inventory.stock") || p.key.startsWith("catalog."))
        .map((p) => p.key);
    } else if (t.code === "PURCHASE_OFFICER") {
      grantedKeys = allPermissions
        .filter((p) => p.module === "purchase" || p.module === "supplier" || p.key.startsWith("inventory.stock") || p.key.startsWith("catalog."))
        .map((p) => p.key);
    } else if (t.code === "ACCOUNTANT") {
      grantedKeys = allPermissions
        .filter((p) => p.module === "finance" || p.module === "expense" || p.module === "report" || p.key.startsWith("customer.") || p.key.startsWith("supplier.") || p.key.startsWith("audit."))
        .map((p) => p.key);
    } else if (t.code === "CASHIER") {
      grantedKeys = allPermissions
        .filter((p) => p.module === "sales" || p.key.startsWith("inventory.stock") || p.key === "dashboard.view" || p.key === "label.print" || p.key === "PAYMENT_CREATE")
        .map((p) => p.key);
    } else if (t.code === "AUDITOR") {
      grantedKeys = allPermissions
        .filter((p) => p.key.endsWith(".view") || p.key.endsWith("_VIEW") || p.module === "report" || p.module === "audit")
        .map((p) => p.key);
    }

    const permIds = grantedKeys.map((k) => permMap.get(k)).filter(Boolean);
    if (permIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permIds.map((pid) => ({ roleId: role.id, permissionId: pid })),
        skipDuplicates: true,
      });
    }
    console.log(`  Linked ${permIds.length} permissions to ${role.code}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
