import { PrismaClient, AccountClass, BranchType, CashFlowActivity, MembershipStatus, NormalBalance, PeriodStatus, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PERMISSIONS } from "../src/lib/permissions";

let rawUrl = process.env.DATABASE_URL || "postgres://f6295efad2859863f9cbc676cb7f84e3b90e5b1d522d533fe8d4f37bafce3097:sk_soUSBQGmGRUD04OVUOXGu@db.prisma.io:5432/postgres?sslmode=require";

if (!rawUrl.includes("connection_limit=")) {
  rawUrl += (rawUrl.includes("?") ? "&" : "?") + "connection_limit=1&pool_timeout=30";
}

const prisma = new PrismaClient({
  datasources: { db: { url: rawUrl } },
});

async function main() {
  console.log("=================================================");
  console.log("🚀 Axon Mobile ERP - Cloud Database Provisioning");
  console.log("=================================================\n");

  const maskedUrl = rawUrl.replace(/:([^:@]+)@/, ":****@");
  console.log(`📡 Target Database: ${maskedUrl}`);

  const email = (process.env.ADMIN_EMAIL || "owner@axonmobile.local").trim().toLowerCase();
  const name = (process.env.ADMIN_NAME || "Ahsan Malik").trim();
  const password = process.env.ADMIN_PASSWORD || "Inventory!2026";
  const companyCode = (process.env.ADMIN_COMPANY_CODE || "AXON").trim().toUpperCase();
  const companyName = (process.env.ADMIN_COMPANY_NAME || "Axon Mobile Distribution").trim();

  // 1. Permissions
  console.log("1. Seeding system permissions catalog...");
  await prisma.permission.createMany({
    data: PERMISSIONS.map((p) => ({
      key: p.key,
      module: p.module,
      action: p.action,
      description: p.description,
      isSensitive: p.sensitive ?? false,
    })),
    skipDuplicates: true,
  });

  // 2. Company Master
  console.log("2. Upserting Company Master (AXON)...");
  const company = await prisma.company.upsert({
    where: { code: companyCode },
    create: {
      code: companyCode,
      name: companyName,
      legalName: companyName,
      currencyCode: "PKR",
      timeZone: "Asia/Karachi",
      status: "ACTIVE",
    },
    update: {
      name: companyName,
      status: "ACTIVE",
    },
  });

  // 3. Branches (Head Office & Retail Store)
  console.log("3. Upserting Branches (Hazro Central & Islamabad)...");
  const headOffice = await prisma.branch.upsert({
    where: { companyId_code: { companyId: company.id, code: "HZR" } },
    create: {
      companyId: company.id,
      code: "HZR",
      name: "Hazro Central",
      type: BranchType.HEAD_OFFICE,
      city: "Hazro",
      addressLine1: "Main Commercial Center, Hazro",
      phone: "0315-5049489",
      email,
      documentPrefix: "HZR-",
      isActive: true,
    },
    update: { isActive: true },
  });

  const retailBranch = await prisma.branch.upsert({
    where: { companyId_code: { companyId: company.id, code: "ISB" } },
    create: {
      companyId: company.id,
      code: "ISB",
      name: "Islamabad",
      type: BranchType.RETAIL_STORE,
      city: "Islamabad",
      addressLine1: "Blue Area Commercial Hub, Islamabad",
      phone: "0315-5049489",
      email,
      documentPrefix: "ISB-",
      isActive: true,
    },
    update: { isActive: true },
  });

  // 4. Warehouses
  console.log("4. Upserting Warehouses (Hazro Main & Blue Area Stockroom)...");
  const mainWarehouse = await prisma.warehouse.upsert({
    where: { companyId_code: { companyId: company.id, code: "HZR-MAIN" } },
    create: {
      companyId: company.id,
      branchId: headOffice.id,
      code: "HZR-MAIN",
      name: "Hazro Main Warehouse",
      type: "MAIN",
      isDefault: true,
      isActive: true,
    },
    update: { branchId: headOffice.id, isActive: true },
  });

  await prisma.warehouse.upsert({
    where: { companyId_code: { companyId: company.id, code: "ISB-RETAIL" } },
    create: {
      companyId: company.id,
      branchId: retailBranch.id,
      code: "ISB-RETAIL",
      name: "Blue Area Retail Stockroom",
      type: "RETAIL",
      isDefault: false,
      isActive: true,
    },
    update: { branchId: retailBranch.id, isActive: true },
  });

  // 5. Universal Walk-in Customer for counter POS checkout
  console.log("5. Upserting Universal POS Walk-in Customer...");
  await prisma.customer.upsert({
    where: { companyId_code: { companyId: company.id, code: "WALK-IN" } },
    create: {
      companyId: company.id,
      branchId: headOffice.id,
      code: "WALK-IN",
      name: "Walk-in Counter Customer",
      customerType: "RETAIL",
      phone: "0315-5049489",
      address: "Main Counter",
      status: "ACTIVE",
    },
    update: { status: "ACTIVE" },
  });

  // 6. Chart of Accounts Foundation
  console.log("6. Upserting Chart of Accounts (26 core foundation accounts)...");
  const rootGroupSpecs = [
    { code: "100", name: "Assets", accountClass: AccountClass.ASSET, statementSection: "Assets", sequence: 100 },
    { code: "200", name: "Liabilities", accountClass: AccountClass.LIABILITY, statementSection: "Liabilities", sequence: 200 },
    { code: "300", name: "Equity", accountClass: AccountClass.EQUITY, statementSection: "Equity", sequence: 300 },
    { code: "400", name: "Revenue", accountClass: AccountClass.REVENUE, statementSection: "Income", sequence: 400 },
    { code: "500", name: "Cost of Goods Sold", accountClass: AccountClass.COGS, statementSection: "Cost of sales", sequence: 500 },
    { code: "600", name: "Operating Expenses", accountClass: AccountClass.EXPENSE, statementSection: "Operating expenses", sequence: 600 },
  ] as const;

  const groups = new Map<string, string>();
  for (const spec of rootGroupSpecs) {
    const group = await prisma.accountGroup.upsert({
      where: { companyId_code: { companyId: company.id, code: spec.code } },
      create: { companyId: company.id, ...spec },
      update: { name: spec.name, accountClass: spec.accountClass, statementSection: spec.statementSection, isActive: true },
    });
    groups.set(spec.code, group.id);
  }

  const accountSpecs = [
    { code: "1000", name: "Cash on Hand", group: "100", class: AccountClass.ASSET, subclass: "Current assets", type: "CASH", normal: NormalBalance.DEBIT, manual: true, reconcile: true, cashFlow: CashFlowActivity.OPERATING },
    { code: "1010", name: "HBL Current Account", group: "100", class: AccountClass.ASSET, subclass: "Current assets", type: "BANK", normal: NormalBalance.DEBIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.OPERATING },
    { code: "1100", name: "Trade Receivables", group: "100", class: AccountClass.ASSET, subclass: "Current assets", type: "ACCOUNTS_RECEIVABLE", normal: NormalBalance.DEBIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.OPERATING },
    { code: "1200", name: "Merchandise Inventory", group: "100", class: AccountClass.ASSET, subclass: "Current assets", type: "INVENTORY", normal: NormalBalance.DEBIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.OPERATING },
    { code: "1210", name: "Recoverable Input Tax", group: "100", class: AccountClass.ASSET, subclass: "Current assets", type: "TAX_RECEIVABLE", normal: NormalBalance.DEBIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.OPERATING },
    { code: "1300", name: "Incentives Receivable", group: "100", class: AccountClass.ASSET, subclass: "Current assets", type: "INCENTIVE_RECEIVABLE", normal: NormalBalance.DEBIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.OPERATING },
    { code: "1310", name: "Supplier Rebates Receivable", group: "100", class: AccountClass.ASSET, subclass: "Current assets", type: "REBATE_RECEIVABLE", normal: NormalBalance.DEBIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.OPERATING },
    { code: "1500", name: "Equipment at Cost", group: "100", class: AccountClass.ASSET, subclass: "Non-current assets", type: "FIXED_ASSET", normal: NormalBalance.DEBIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.INVESTING },
    { code: "1510", name: "Accumulated Depreciation - Equipment", group: "100", class: AccountClass.ASSET, subclass: "Non-current assets", type: "ACCUMULATED_DEPRECIATION", normal: NormalBalance.CREDIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.INVESTING },
    { code: "2000", name: "Trade Payables", group: "200", class: AccountClass.LIABILITY, subclass: "Current liabilities", type: "ACCOUNTS_PAYABLE", normal: NormalBalance.CREDIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.OPERATING },
    { code: "2100", name: "Accrued Incentives Payable", group: "200", class: AccountClass.LIABILITY, subclass: "Current liabilities", type: "INCENTIVE_PAYABLE", normal: NormalBalance.CREDIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.OPERATING },
    { code: "2110", name: "Customer Rebates Payable", group: "200", class: AccountClass.LIABILITY, subclass: "Current liabilities", type: "REBATE_PAYABLE", normal: NormalBalance.CREDIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.OPERATING },
    { code: "2200", name: "Sales Tax Payable", group: "200", class: AccountClass.LIABILITY, subclass: "Current liabilities", type: "TAX_PAYABLE", normal: NormalBalance.CREDIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.OPERATING },
    { code: "3000", name: "Share Capital", group: "300", class: AccountClass.EQUITY, subclass: "Contributed capital", type: "CAPITAL", normal: NormalBalance.CREDIT, manual: true, reconcile: false, cashFlow: CashFlowActivity.FINANCING },
    { code: "3100", name: "Retained Earnings", group: "300", class: AccountClass.EQUITY, subclass: "Retained earnings", type: "RETAINED_EARNINGS", normal: NormalBalance.CREDIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.FINANCING },
    { code: "4000", name: "Mobile and Accessory Sales", group: "400", class: AccountClass.REVENUE, subclass: "Operating revenue", type: "SALES_REVENUE", normal: NormalBalance.CREDIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.OPERATING },
    { code: "4010", name: "Incentive Income", group: "400", class: AccountClass.REVENUE, subclass: "Other operating income", type: "INCENTIVE_INCOME", normal: NormalBalance.CREDIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.OPERATING },
    { code: "4020", name: "Rebate Income", group: "400", class: AccountClass.REVENUE, subclass: "Other operating income", type: "REBATE_INCOME", normal: NormalBalance.CREDIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.OPERATING },
    { code: "4030", name: "Inventory Adjustment Gain", group: "400", class: AccountClass.REVENUE, subclass: "Other operating income", type: "INVENTORY_ADJUSTMENT_GAIN", normal: NormalBalance.CREDIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.OPERATING },
    { code: "5000", name: "Cost of Goods Sold", group: "500", class: AccountClass.COGS, subclass: "Cost of sales", type: "COGS", normal: NormalBalance.DEBIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.OPERATING },
    { code: "6000", name: "General Operating Expense", group: "600", class: AccountClass.EXPENSE, subclass: "Operating expenses", type: "GENERAL_EXPENSE", normal: NormalBalance.DEBIT, manual: true, reconcile: false, cashFlow: CashFlowActivity.OPERATING },
    { code: "6100", name: "Depreciation Expense", group: "600", class: AccountClass.EXPENSE, subclass: "Operating expenses", type: "DEPRECIATION_EXPENSE", normal: NormalBalance.DEBIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.OPERATING },
    { code: "6200", name: "Sales Incentive Expense", group: "600", class: AccountClass.EXPENSE, subclass: "Selling expenses", type: "INCENTIVE_EXPENSE", normal: NormalBalance.DEBIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.OPERATING },
    { code: "6300", name: "Customer Rebate Expense", group: "600", class: AccountClass.EXPENSE, subclass: "Selling expenses", type: "REBATE_EXPENSE", normal: NormalBalance.DEBIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.OPERATING },
    { code: "6400", name: "Gain or Loss on Asset Disposal", group: "600", class: AccountClass.EXPENSE, subclass: "Other gains and losses", type: "ASSET_DISPOSAL", normal: NormalBalance.DEBIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.INVESTING },
    { code: "6500", name: "Inventory Adjustment Loss", group: "600", class: AccountClass.EXPENSE, subclass: "Operating expenses", type: "INVENTORY_ADJUSTMENT_LOSS", normal: NormalBalance.DEBIT, manual: false, reconcile: true, cashFlow: CashFlowActivity.OPERATING },
  ] as const;

  for (const spec of accountSpecs) {
    await prisma.account.upsert({
      where: { companyId_code: { companyId: company.id, code: spec.code } },
      create: {
        companyId: company.id,
        groupId: groups.get(spec.group),
        code: spec.code,
        name: spec.name,
        accountClass: spec.class,
        subclass: spec.subclass,
        accountType: spec.type,
        normalBalance: spec.normal,
        reconciliationRequired: spec.reconcile,
        allowManualJournal: spec.manual,
        cashFlowActivity: spec.cashFlow,
      },
      update: {
        name: spec.name,
        accountClass: spec.class,
        subclass: spec.subclass,
        accountType: spec.type,
        normalBalance: spec.normal,
        isActive: true,
      },
    });
  }

  // 7. Fiscal Year and 12 Monthly Accounting Periods
  console.log("7. Upserting Fiscal Year & 12 Accounting Periods...");
  const fiscalYear = await prisma.fiscalYear.upsert({
    where: { companyId_code: { companyId: company.id, code: "FY2026-27" } },
    create: {
      companyId: company.id,
      code: "FY2026-27",
      name: "Fiscal year 2026-2027",
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2027-06-30T00:00:00.000Z"),
      isCurrent: true,
    },
    update: { isCurrent: true },
  });

  for (let index = 0; index < 12; index += 1) {
    const startDate = new Date(Date.UTC(2026 + Math.floor((6 + index) / 12), (6 + index) % 12, 1));
    const endDate = new Date(Date.UTC(2026 + Math.floor((7 + index) / 12), (7 + index) % 12, 0));
    await prisma.accountingPeriod.upsert({
      where: { companyId_fiscalYearId_number: { companyId: company.id, fiscalYearId: fiscalYear.id, number: index + 1 } },
      create: {
        companyId: company.id,
        fiscalYearId: fiscalYear.id,
        number: index + 1,
        name: startDate.toLocaleString("en", { month: "short", year: "numeric", timeZone: "UTC" }),
        quarter: Math.floor(index / 3) + 1,
        startDate,
        endDate,
        status: PeriodStatus.OPEN,
      },
      update: {},
    });
  }

  // 8. Document Sequence Numbers for each Branch
  console.log("8. Initializing Document Sequences...");
  const documentTypes = [
    { type: "SALES_INVOICE", prefixSuffix: "INV" },
    { type: "PURCHASE_ORDER", prefixSuffix: "PO" },
    { type: "PURCHASE_RECEIPT", prefixSuffix: "GRN" },
    { type: "SALES_RETURN", prefixSuffix: "RET" },
    { type: "PURCHASE_RETURN", prefixSuffix: "PRET" },
    { type: "JOURNAL_ENTRY", prefixSuffix: "JV" },
    { type: "PAYMENT", prefixSuffix: "PAY" },
    { type: "STOCK_TRANSFER", prefixSuffix: "TRN" },
    { type: "STOCK_ADJUSTMENT", prefixSuffix: "ADJ" },
    { type: "STOCK_COUNT", prefixSuffix: "STK" },
  ];
  for (const b of [headOffice, retailBranch]) {
    for (const doc of documentTypes) {
      await prisma.documentSequence.upsert({
        where: {
          companyId_branchId_documentType_fiscalYear: {
            companyId: company.id,
            branchId: b.id,
            documentType: doc.type,
            fiscalYear: "2026-2027",
          },
        },
        create: {
          companyId: company.id,
          branchId: b.id,
          documentType: doc.type,
          fiscalYear: "2026-2027",
          prefix: `${b.documentPrefix}${doc.prefixSuffix}`,
          nextValue: 1n,
          padding: 5,
        },
        update: {},
      });
    }
  }

  // 9. Super Admin Role (OWNER) with all permissions
  console.log("9. Upserting Owner Role & Permissions...");
  const ownerRole = await prisma.role.upsert({
    where: { companyId_code: { companyId: company.id, code: "OWNER" } },
    create: {
      companyId: company.id,
      code: "OWNER",
      name: "Owner / Director",
      description: "Full company administration and operational authority.",
      isSystem: true,
    },
    update: { name: "Owner / Director" },
  });

  const allPermissions = await prisma.permission.findMany({ select: { id: true } });
  await prisma.rolePermission.createMany({
    data: allPermissions.map((p) => ({ roleId: ownerRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  // 10. Super Admin User Account
  console.log(`10. Upserting Admin User (${email})...`);
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      fullName: name,
      passwordHash,
      status: UserStatus.ACTIVE,
      forcePasswordChange: false,
      passwordChangedAt: new Date(),
    },
    update: {
      fullName: name,
      passwordHash,
      status: UserStatus.ACTIVE,
      forcePasswordChange: false,
    },
  });

  // 11. Company Membership & Role Assignment
  console.log("11. Upserting Membership & Scope Roles...");
  const membership = await prisma.companyMembership.upsert({
    where: { companyId_userId: { companyId: company.id, userId: user.id } },
    create: {
      companyId: company.id,
      userId: user.id,
      status: MembershipStatus.ACTIVE,
      isOwner: true,
      jobTitle: "Owner / Director",
    },
    update: { status: MembershipStatus.ACTIVE, isOwner: true },
  });

  const existingScopedRole = await prisma.userRole.findFirst({
    where: { membershipId: membership.id, roleId: ownerRole.id, branchId: headOffice.id },
  });
  if (!existingScopedRole) {
    await prisma.userRole.create({
      data: {
        membershipId: membership.id,
        roleId: ownerRole.id,
        branchId: headOffice.id,
        warehouseId: mainWarehouse.id,
      },
    });
  }

  const existingGlobalRole = await prisma.userRole.findFirst({
    where: { membershipId: membership.id, roleId: ownerRole.id, branchId: null, warehouseId: null },
  });
  if (!existingGlobalRole) {
    await prisma.userRole.create({
      data: {
        membershipId: membership.id,
        roleId: ownerRole.id,
      },
    });
  }

  console.log("\n=================================================");
  console.log("🎉 CLOUD DATABASE SETUP COMPLETE!");
  console.log("=================================================");
  console.log(`Company:      ${companyName} (${companyCode})`);
  console.log(`Admin Email:  ${email}`);
  console.log(`Password:     ${password}`);
  console.log(`Branches:     Hazro Central (HO), Islamabad (Retail)`);
  console.log(`Warehouses:   Hazro Main Warehouse, Blue Area Stockroom`);
  console.log(`POS Customer: Walk-in Counter Customer (WALK-IN)`);
  console.log(`Chart of Acc: 26 Core Foundation Accounts (Zero Balance)`);
  console.log(`Permissions:  154 System Security Permissions`);
  console.log("Transactions: 0 demo entries (100% clean production slate)");
  console.log("=================================================\n");
}

main()
  .catch((e) => {
    console.error("❌ Setup failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
