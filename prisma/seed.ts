import {
  AccountClass,
  BranchType,
  CashFlowActivity,
  CostingMethod,
  DepreciationMethod,
  JournalStatus,
  JournalType,
  MembershipStatus,
  NormalBalance,
  OpeningBalanceStatus,
  PeriodStatus,
  PrismaClient,
  ProductStatus,
  ProductType,
  TrackingMethod,
  UserStatus,
  WarehouseType,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { PERMISSIONS } from "../src/lib/permissions";
import { grantsForRole } from "../src/lib/role-grants";

const prisma = new PrismaClient();

const roleDefinitions = [
  { code: "SUPER_ADMIN", name: "Super Admin", description: "Full company administration and recovery controls." },
  { code: "ADMINISTRATOR", name: "Administrator", description: "Company configuration, users, and operational administration." },
  { code: "OWNER", name: "Owner / Director", description: "Executive access to operations, finance, approvals, and profit." },
  { code: "INVENTORY_MANAGER", name: "Inventory Manager", description: "Catalog, serialized devices, stock controls, transfers, and inventory reports." },
  { code: "WAREHOUSE_MANAGER", name: "Warehouse Manager", description: "Warehouse receiving, dispatch, counting, and location operations." },
  { code: "PURCHASE_MANAGER", name: "Purchase Manager", description: "Procurement, suppliers, receiving, and purchase approvals." },
  { code: "PROCUREMENT_OFFICER", name: "Procurement Officer", description: "Prepares purchase orders and goods receipts without approval or posting authority." },
  { code: "PROCUREMENT_APPROVER", name: "Procurement Approver", description: "Approves submitted purchase orders and receipts without preparation or posting authority." },
  { code: "RECEIVING_POSTER", name: "Receiving Posting Officer", description: "Posts approved receipts to inventory and accounting without preparation or approval authority." },
  { code: "SALES_MANAGER", name: "Sales Manager", description: "Sales, pricing controls, returns, customers, and sales reports." },
  { code: "SALES_OFFICER", name: "Sales Officer", description: "Prepares sales invoices without approval or posting authority." },
  { code: "SALES_APPROVER", name: "Sales Approver", description: "Approves submitted sales invoices without preparation or posting authority." },
  { code: "SALES_POSTER", name: "Sales Posting Officer", description: "Posts approved invoices to inventory and accounting without preparation or approval authority." },
  { code: "CASHIER", name: "Cashier", description: "POS sales, receipts, and assigned cash operations." },
  { code: "ACCOUNTANT", name: "Accountant", description: "Prepares journals, reconciliations, opening balances, budgets, and finance schedules without approval authority." },
  { code: "FINANCE_CONTROLLER", name: "Finance Controller", description: "Approves journals, payments, schedules, budgets, and period controls without draft-creation or posting authority." },
  { code: "GL_POSTING_OFFICER", name: "GL Posting Officer", description: "Posts approved journals and authorized reversals without preparation or approval authority." },
  { code: "TREASURY_OFFICER", name: "Treasury Officer", description: "Posts approved settlements and prepares bank reconciliations without journal approval authority." },
  { code: "AUDITOR", name: "Auditor", description: "Read-only operational, financial, and audit visibility." },
  { code: "BRANCH_MANAGER", name: "Branch Manager", description: "Branch-scoped operational management and approvals." },
  { code: "STOREKEEPER", name: "Storekeeper", description: "Warehouse-scoped stock handling and counting." },
  { code: "CUSTOMER_SERVICE", name: "Customer Service Representative", description: "Customer records, sales-return intake, statements, and communication history." },
  { code: "READ_ONLY", name: "Read-only User", description: "Basic, non-sensitive view access." },
] as const;

async function seedPermissionCatalog() {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      create: {
        key: permission.key,
        module: permission.module,
        action: permission.action,
        description: permission.description,
        isSensitive: permission.sensitive ?? false,
      },
      update: {
        module: permission.module,
        action: permission.action,
        description: permission.description,
        isSensitive: permission.sensitive ?? false,
      },
    });
  }
}

async function seedFinanceFoundation(input: {
  companyId: string;
  hazroBranchId: string;
  islamabadBranchId: string;
  adminId: string;
}) {
  const { companyId, hazroBranchId, islamabadBranchId, adminId } = input;

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
      where: { companyId_code: { companyId, code: spec.code } },
      create: { companyId, ...spec },
      update: {
        name: spec.name,
        accountClass: spec.accountClass,
        statementSection: spec.statementSection,
        sequence: spec.sequence,
        isActive: true,
      },
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
  const accounts = new Map<string, string>();
  for (const spec of accountSpecs) {
    const account = await prisma.account.upsert({
      where: { companyId_code: { companyId, code: spec.code } },
      create: {
        companyId,
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
        groupId: groups.get(spec.group),
        accountClass: spec.class,
        subclass: spec.subclass,
        accountType: spec.type,
        normalBalance: spec.normal,
        reconciliationRequired: spec.reconcile,
        allowManualJournal: spec.manual,
        cashFlowActivity: spec.cashFlow,
        isActive: true,
      },
    });
    accounts.set(spec.code, account.id);
  }

  const fiscalYear = await prisma.fiscalYear.upsert({
    where: { companyId_code: { companyId, code: "FY2026-27" } },
    create: {
      companyId,
      code: "FY2026-27",
      name: "Fiscal year 2026-2027",
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2027-06-30T00:00:00.000Z"),
      isCurrent: true,
    },
    update: { isCurrent: true },
  });

  const periods: Array<{ id: string }> = [];
  for (let index = 0; index < 12; index += 1) {
    const startDate = new Date(Date.UTC(2026 + Math.floor((6 + index) / 12), (6 + index) % 12, 1));
    const endDate = new Date(Date.UTC(2026 + Math.floor((7 + index) / 12), (7 + index) % 12, 0));
    const period = await prisma.accountingPeriod.upsert({
      where: { companyId_fiscalYearId_number: { companyId, fiscalYearId: fiscalYear.id, number: index + 1 } },
      create: {
        companyId,
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
    periods.push(period);
  }

  const costCenter = await prisma.costCenter.upsert({
    where: { companyId_code: { companyId, code: "HZR-OPS" } },
    create: { companyId, branchId: hazroBranchId, code: "HZR-OPS", name: "Hazro Operations" },
    update: { isActive: true },
  });
  await prisma.costCenter.upsert({
    where: { companyId_code: { companyId, code: "ISB-OPS" } },
    create: { companyId, branchId: islamabadBranchId, code: "ISB-OPS", name: "Islamabad Operations" },
    update: { isActive: true },
  });
  const financeDepartment = await prisma.department.upsert({
    where: { companyId_code: { companyId, code: "FIN" } },
    create: { companyId, branchId: hazroBranchId, code: "FIN", name: "Finance" },
    update: { isActive: true },
  });
  await prisma.department.upsert({
    where: { companyId_code: { companyId, code: "SAL" } },
    create: { companyId, code: "SAL", name: "Sales" },
    update: { isActive: true },
  });

  await prisma.customer.upsert({
    where: { companyId_code: { companyId, code: "WALK-IN" } },
    create: { companyId, branchId: null, code: "WALK-IN", name: "Walk-in Customer", customerType: "RETAIL", paymentTermsDays: 0 },
    update: { status: "ACTIVE" },
  });
  await prisma.customer.upsert({
    where: { companyId_code: { companyId, code: "DEALER-001" } },
    create: { companyId, branchId: islamabadBranchId, code: "DEALER-001", name: "Capital Mobile Traders", customerType: "DEALER", paymentTermsDays: 30, creditLimit: "1000000" },
    update: { status: "ACTIVE" },
  });
  await prisma.supplier.upsert({
    where: { companyId_code: { companyId, code: "SUP-001" } },
    create: { companyId, branchId: hazroBranchId, code: "SUP-001", name: "National Device Distributors", paymentTermsDays: 30, creditLimit: "5000000" },
    update: { status: "ACTIVE" },
  });

  const bankAccount = await prisma.bankAccount.upsert({
    where: { companyId_code: { companyId, code: "HBL-HZR" } },
    create: {
      companyId,
      branchId: hazroBranchId,
      glAccountId: accounts.get("1010")!,
      code: "HBL-HZR",
      bankName: "Habib Bank Limited",
      accountTitle: "Axon Mobile Distribution",
      accountNumberLast4: "2026",
      iban: "PK00HABB0000000000002026",
      bankBranchName: "Hazro",
      currencyCode: "PKR",
      authorizedUserIds: [adminId],
    },
    update: { isActive: true, authorizedUserIds: [adminId] },
  });

  await prisma.assetCategory.upsert({
    where: { companyId_code: { companyId, code: "EQUIPMENT" } },
    create: {
      companyId,
      code: "EQUIPMENT",
      name: "Office and Store Equipment",
      defaultUsefulLifeMonths: 60,
      defaultMethod: DepreciationMethod.STRAIGHT_LINE,
      assetAccountId: accounts.get("1500")!,
      accumulatedAccountId: accounts.get("1510")!,
      expenseAccountId: accounts.get("6100")!,
      disposalAccountId: accounts.get("6400")!,
    },
    update: { isActive: true },
  });

  const seedApprover = await prisma.user.upsert({
    where: { email: "finance-seed-approver@axonmobile.local" },
    create: {
      email: "finance-seed-approver@axonmobile.local",
      fullName: "Development Finance Approver",
      passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12),
      status: UserStatus.SUSPENDED,
      forcePasswordChange: true,
    },
    update: {},
  });

  const openingIdempotencyKey = "DEV-OPENING-FY2026-27";
  let openingJournal = await prisma.journalEntry.findUnique({
    where: { companyId_sourceModule_idempotencyKey: { companyId, sourceModule: "OPENING_BALANCE", idempotencyKey: openingIdempotencyKey } },
  });
  if (!openingJournal) {
    openingJournal = await prisma.$transaction(async (tx) => {
      const journal = await tx.journalEntry.create({
        data: {
          companyId,
          branchId: hazroBranchId,
          periodId: periods[0].id,
          costCenterId: costCenter.id,
          departmentId: financeDepartment.id,
          voucherNumber: "HZR-OB-2026-0001",
          voucherDate: new Date("2026-07-01T00:00:00.000Z"),
          postingDate: new Date("2026-07-01T00:00:00.000Z"),
          voucherType: JournalType.OPENING,
          cashFlowActivity: CashFlowActivity.FINANCING,
          status: JournalStatus.DRAFT,
          narration: "Development opening capital deposited to the operating bank account",
          referenceDocument: "DEV-FIXTURE",
          sourceModule: "OPENING_BALANCE",
          sourceDocumentType: "OpeningBalanceBatch",
          sourceDocumentNumber: "OB-FY26-0001",
          idempotencyKey: openingIdempotencyKey,
          totalDebit: "2500000",
          totalCredit: "2500000",
          preparedById: adminId,
        },
      });
      const lines = await Promise.all([
        tx.journalEntryLine.create({
          data: {
            entryId: journal.id,
            accountId: accounts.get("1010")!,
            branchId: hazroBranchId,
            costCenterId: costCenter.id,
            departmentId: financeDepartment.id,
            bankAccountId: bankAccount.id,
            lineNumber: 1,
            description: "Opening bank balance",
            debit: "2500000",
            currencyCode: "PKR",
            baseDebit: "2500000",
          },
        }),
        tx.journalEntryLine.create({
          data: {
            entryId: journal.id,
            accountId: accounts.get("3000")!,
            branchId: hazroBranchId,
            costCenterId: costCenter.id,
            departmentId: financeDepartment.id,
            lineNumber: 2,
            description: "Opening contributed capital",
            credit: "2500000",
            currencyCode: "PKR",
            baseCredit: "2500000",
          },
        }),
      ]);
      const approvedAt = new Date();
      await tx.journalEntry.update({
        where: { id: journal.id },
        data: { status: JournalStatus.APPROVED, approvedById: seedApprover.id, approvedAt },
      });
      const posted = await tx.journalEntry.update({
        where: { id: journal.id },
        data: { status: JournalStatus.POSTED, postedById: seedApprover.id, postedAt: approvedAt },
      });
      await tx.bankTransaction.create({
        data: {
          companyId,
          bankAccountId: bankAccount.id,
          journalEntryId: journal.id,
          journalLineId: lines[0].id,
          transactionType: "OPENING_BALANCE",
          transactionDate: new Date("2026-07-01T00:00:00.000Z"),
          bankReference: "DEV-FIXTURE",
          description: "Opening bank balance",
          deposit: "2500000",
        },
      });
      return posted;
    });
  }

  const openingBatch = await prisma.openingBalanceBatch.upsert({
    where: { companyId_batchNumber: { companyId, batchNumber: "OB-FY26-0001" } },
    create: {
      companyId,
      fiscalYearId: fiscalYear.id,
      journalEntryId: openingJournal.id,
      batchNumber: "OB-FY26-0001",
      balanceDate: new Date("2026-07-01T00:00:00.000Z"),
      description: "Development opening balances",
      status: OpeningBalanceStatus.POSTED,
      totalDebit: "2500000",
      totalCredit: "2500000",
      createdById: adminId,
      approvedById: seedApprover.id,
      postedAt: openingJournal.postedAt,
    },
    update: {},
  });
  const openingLineCount = await prisma.openingBalanceLine.count({ where: { batchId: openingBatch.id } });
  if (openingLineCount === 0) {
    await prisma.openingBalanceLine.createMany({
      data: [
        { batchId: openingBatch.id, accountId: accounts.get("1010")!, bankAccountId: bankAccount.id, debit: "2500000", lineNumber: 1, reference: "DEV-FIXTURE" },
        { batchId: openingBatch.id, accountId: accounts.get("3000")!, credit: "2500000", lineNumber: 2, reference: "DEV-FIXTURE" },
      ],
    });
  }
}

async function seedDemo() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("DEMO_SEED is blocked in production.");
  }

  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD with at least 12 characters is required for demo fixtures.");
  }
  const adminEmail = (process.env.DEMO_ADMIN_EMAIL || "owner@axonmobile.local").toLowerCase();

  const company = await prisma.company.upsert({
    where: { code: "AXON" },
    create: {
      code: "AXON",
      name: "Axon Mobile Distribution",
      legalName: "Axon Mobile Distribution (Private) Limited",
      registrationNumber: "DEV-ERP-2026",
      taxRegistrationNumber: "DEMO-STRN",
      addressLine1: "GT Road, Hazro",
      countryCode: "PK",
      province: "Punjab",
      city: "Hazro",
      phone: "+92 57 000 0000",
      email: "operations@axonmobile.local",
      currencyCode: "PKR",
      timeZone: "Asia/Karachi",
      fiscalYearStartMonth: 7,
      inventoryCostingMethod: CostingMethod.SPECIFIC,
    },
    update: {},
  });

  const hazroBranch = await prisma.branch.upsert({
    where: { companyId_code: { companyId: company.id, code: "HZR" } },
    create: {
      companyId: company.id,
      code: "HZR",
      name: "Hazro Central",
      type: BranchType.HEAD_OFFICE,
      documentPrefix: "HZR",
      addressLine1: "GT Road",
      city: "Hazro",
      province: "Punjab",
      phone: "+92 57 000 0001",
    },
    update: {},
  });

  const islamabadBranch = await prisma.branch.upsert({
    where: { companyId_code: { companyId: company.id, code: "ISB" } },
    create: {
      companyId: company.id,
      code: "ISB",
      name: "Islamabad Blue Area",
      type: BranchType.RETAIL_STORE,
      documentPrefix: "ISB",
      addressLine1: "Blue Area",
      city: "Islamabad",
      province: "Islamabad Capital Territory",
    },
    update: {},
  });

  const mainWarehouse = await prisma.warehouse.upsert({
    where: { companyId_code: { companyId: company.id, code: "HZR-MAIN" } },
    create: {
      companyId: company.id,
      branchId: hazroBranch.id,
      code: "HZR-MAIN",
      name: "Hazro Main Warehouse",
      type: WarehouseType.MAIN,
      city: "Hazro",
      isDefault: true,
    },
    update: {},
  });

  await prisma.warehouse.upsert({
    where: { companyId_code: { companyId: company.id, code: "HZR-QA" } },
    create: {
      companyId: company.id,
      branchId: hazroBranch.id,
      code: "HZR-QA",
      name: "Hazro Quality Hold",
      type: WarehouseType.QUARANTINE,
      city: "Hazro",
      allowDispatch: false,
    },
    update: {},
  });

  await prisma.warehouse.upsert({
    where: { companyId_code: { companyId: company.id, code: "ISB-RETAIL" } },
    create: {
      companyId: company.id,
      branchId: islamabadBranch.id,
      code: "ISB-RETAIL",
      name: "Blue Area Retail Stockroom",
      type: WarehouseType.RETAIL,
      city: "Islamabad",
    },
    update: {},
  });

  const zone = await prisma.warehouseLocation.upsert({
    where: { warehouseId_code: { warehouseId: mainWarehouse.id, code: "ZONE-A" } },
    create: { warehouseId: mainWarehouse.id, code: "ZONE-A", name: "Fast-moving devices", type: "ZONE" },
    update: {},
  });
  const rack = await prisma.warehouseLocation.upsert({
    where: { warehouseId_code: { warehouseId: mainWarehouse.id, code: "A-01" } },
    create: { warehouseId: mainWarehouse.id, parentId: zone.id, code: "A-01", name: "Smartphone Rack A-01", type: "RACK" },
    update: {},
  });
  await prisma.warehouseLocation.upsert({
    where: { warehouseId_code: { warehouseId: mainWarehouse.id, code: "A-01-01" } },
    create: { warehouseId: mainWarehouse.id, parentId: rack.id, code: "A-01-01", name: "Secure Bin A-01-01", type: "BIN", barcode: "LOC-HZR-A0101" },
    update: {},
  });

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      fullName: "Ahsan Malik",
      phone: "+92 300 000 0000",
      passwordHash,
      status: UserStatus.ACTIVE,
      forcePasswordChange: false,
      passwordChangedAt: new Date(),
    },
    update: {},
  });

  const membership = await prisma.companyMembership.upsert({
    where: { companyId_userId: { companyId: company.id, userId: admin.id } },
    create: {
      companyId: company.id,
      userId: admin.id,
      employeeCode: "OWN-001",
      jobTitle: "Owner / Director",
      status: MembershipStatus.ACTIVE,
      isOwner: true,
    },
    update: { status: MembershipStatus.ACTIVE },
  });

  const permissionRecords = await prisma.permission.findMany();
  const permissionByKey = new Map(permissionRecords.map((item) => [item.key, item.id]));
  const roles = new Map<string, string>();

  for (const definition of roleDefinitions) {
    const role = await prisma.role.upsert({
      where: { companyId_code: { companyId: company.id, code: definition.code } },
      create: {
        companyId: company.id,
        code: definition.code,
        name: definition.name,
        description: definition.description,
        isSystem: true,
      },
      update: { name: definition.name, description: definition.description },
    });
    roles.set(definition.code, role.id);

    const grantedKeys = grantsForRole(definition.code);
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: grantedKeys.flatMap((key) => {
        const permissionId = permissionByKey.get(key);
        return permissionId ? [{ roleId: role.id, permissionId }] : [];
      }),
      skipDuplicates: true,
    });
  }

  const ownerRoleId = roles.get("OWNER");
  if (!ownerRoleId) throw new Error("Owner role was not created.");
  const existingOwnerAssignment = await prisma.userRole.findFirst({
    where: { membershipId: membership.id, roleId: ownerRoleId, branchId: null, warehouseId: null },
  });
  if (!existingOwnerAssignment) {
    await prisma.userRole.create({ data: { membershipId: membership.id, roleId: ownerRoleId } });
  }

  // Development-only workflow actors make exact maker-checker-poster controls
  // testable without weakening segregation rules for the owner account.
  const workflowActors = [
    { email: "accountant@axonmobile.local", fullName: "Development Accountant", employeeCode: "FIN-001", roleCode: "ACCOUNTANT" },
    { email: "controller@axonmobile.local", fullName: "Development Finance Controller", employeeCode: "FIN-002", roleCode: "FINANCE_CONTROLLER" },
    { email: "poster@axonmobile.local", fullName: "Development GL Posting Officer", employeeCode: "FIN-003", roleCode: "GL_POSTING_OFFICER" },
    { email: "treasury@axonmobile.local", fullName: "Development Treasury Officer", employeeCode: "FIN-004", roleCode: "TREASURY_OFFICER" },
    { email: "inventory@axonmobile.local", fullName: "Development Inventory Manager", employeeCode: "INV-001", roleCode: "INVENTORY_MANAGER" },
    { email: "warehouse@axonmobile.local", fullName: "Development Warehouse Manager", employeeCode: "INV-002", roleCode: "WAREHOUSE_MANAGER" },
    { email: "buyer@axonmobile.local", fullName: "Development Procurement Officer", employeeCode: "OPS-001", roleCode: "PROCUREMENT_OFFICER" },
    { email: "purchase.approver@axonmobile.local", fullName: "Development Procurement Approver", employeeCode: "OPS-002", roleCode: "PROCUREMENT_APPROVER" },
    { email: "receiver@axonmobile.local", fullName: "Development Receiving Posting Officer", employeeCode: "OPS-003", roleCode: "RECEIVING_POSTER" },
    { email: "sales@axonmobile.local", fullName: "Development Sales Officer", employeeCode: "SAL-001", roleCode: "SALES_OFFICER" },
    { email: "sales.approver@axonmobile.local", fullName: "Development Sales Approver", employeeCode: "SAL-002", roleCode: "SALES_APPROVER" },
    { email: "sales.poster@axonmobile.local", fullName: "Development Sales Posting Officer", employeeCode: "SAL-003", roleCode: "SALES_POSTER" },
  ] as const;
  for (const actor of workflowActors) {
    const user = await prisma.user.upsert({
      where: { email: actor.email },
      create: {
        email: actor.email,
        fullName: actor.fullName,
        passwordHash,
        status: UserStatus.ACTIVE,
        forcePasswordChange: false,
        passwordChangedAt: new Date(),
      },
      update: { status: UserStatus.ACTIVE },
    });
    const actorMembership = await prisma.companyMembership.upsert({
      where: { companyId_userId: { companyId: company.id, userId: user.id } },
      create: {
        companyId: company.id,
        userId: user.id,
        employeeCode: actor.employeeCode,
        jobTitle: actor.fullName.replace("Development ", ""),
        status: MembershipStatus.ACTIVE,
      },
      update: { status: MembershipStatus.ACTIVE },
    });
    const roleId = roles.get(actor.roleCode);
    if (!roleId) throw new Error(`${actor.roleCode} role was not created.`);
    const assignment = await prisma.userRole.findFirst({
      where: { membershipId: actorMembership.id, roleId, branchId: null, warehouseId: null },
    });
    if (!assignment) await prisma.userRole.create({ data: { membershipId: actorMembership.id, roleId } });
  }

  const categorySpecs = [
    ["PHONES", "Mobile Phones"],
    ["TABLETS", "Tablets"],
    ["ACCESSORIES", "Accessories"],
    ["SPARES", "Spare Parts"],
  ] as const;
  const categories = new Map<string, string>();
  for (const [code, name] of categorySpecs) {
    const category = await prisma.productCategory.upsert({
      where: { companyId_code: { companyId: company.id, code } },
      create: { companyId: company.id, code, name },
      update: {},
    });
    categories.set(code, category.id);
  }

  const brandNames = ["Apple", "Samsung", "Xiaomi", "Nokia", "Anker", "Generic"];
  const brands = new Map<string, string>();
  for (const name of brandNames) {
    const code = name.toUpperCase();
    const brand = await prisma.brand.upsert({
      where: { companyId_code: { companyId: company.id, code } },
      create: { companyId: company.id, code, name },
      update: {},
    });
    brands.set(name, brand.id);
  }

  const unit = await prisma.unitOfMeasure.upsert({
    where: { companyId_code: { companyId: company.id, code: "EA" } },
    create: { companyId: company.id, code: "EA", name: "Each", decimalPlaces: 0 },
    update: {},
  });

  const zeroPurchaseTax = await prisma.taxRule.upsert({
    where: { companyId_code: { companyId: company.id, code: "ZERO" } },
    create: { companyId: company.id, code: "ZERO", name: "Zero-rated", rate: "0", appliesToPurchases: true, appliesToSales: true },
    update: { name: "Zero-rated", rate: "0", isActive: true },
  });
  await prisma.taxRule.upsert({
    where: { companyId_code: { companyId: company.id, code: "GST18" } },
    create: { companyId: company.id, code: "GST18", name: "GST 18%", rate: "18", appliesToPurchases: true, appliesToSales: true },
    update: { name: "GST 18%", rate: "18", isActive: true },
  });

  const productSpecs = [
    {
      sku: "APL-IP15", name: "Apple iPhone 15", model: "iPhone 15", modelCode: "A3090", brand: "Apple", category: "PHONES",
      type: ProductType.SMARTPHONE, tracking: TrackingMethod.IMEI, standardCost: "227500",
      variant: { sku: "APL-IP15-128-BLK", name: "128 GB · Black", color: "Black", ram: 6, storage: 128, network: "5G", sim: "Nano-SIM + eSIM", region: "International", purchase: "227500", wholesale: "237000", retail: "244900", minimum: "235000", barcode: "194253819003" },
    },
    {
      sku: "SMS-S24", name: "Samsung Galaxy S24", model: "Galaxy S24", modelCode: "SM-S921B", brand: "Samsung", category: "PHONES",
      type: ProductType.SMARTPHONE, tracking: TrackingMethod.IMEI, standardCost: "206000",
      variant: { sku: "SMS-S24-256-GRY", name: "256 GB · Marble Gray", color: "Marble Gray", ram: 8, storage: 256, network: "5G", sim: "Dual SIM + eSIM", region: "Pakistan", purchase: "206000", wholesale: "217000", retail: "224999", minimum: "214000", barcode: "8806095299786" },
    },
    {
      sku: "XMI-RN13", name: "Xiaomi Redmi Note 13", model: "Redmi Note 13", modelCode: "23129RA5FL", brand: "Xiaomi", category: "PHONES",
      type: ProductType.SMARTPHONE, tracking: TrackingMethod.IMEI, standardCost: "45500",
      variant: { sku: "XMI-RN13-256-BLU", name: "8/256 GB · Ice Blue", color: "Ice Blue", ram: 8, storage: 256, network: "4G", sim: "Dual Nano-SIM", region: "Pakistan", purchase: "45500", wholesale: "48500", retail: "51999", minimum: "47500", barcode: "6941812759298" },
    },
    {
      sku: "NOK-105", name: "Nokia 105", model: "Nokia 105", modelCode: "TA-1557", brand: "Nokia", category: "PHONES",
      type: ProductType.FEATURE_PHONE, tracking: TrackingMethod.IMEI, standardCost: "4650",
      variant: { sku: "NOK-105-4G-BLU", name: "4G · Blue", color: "Blue", ram: null, storage: null, network: "4G", sim: "Dual SIM", region: "Pakistan", purchase: "4650", wholesale: "5000", retail: "5499", minimum: "4900", barcode: "6438409086192" },
    },
    {
      sku: "ANK-20W-USBC", name: "Anker 20W USB-C Charger", model: "PowerPort III", modelCode: "A2633", brand: "Anker", category: "ACCESSORIES",
      type: ProductType.ACCESSORY, tracking: TrackingMethod.QUANTITY, standardCost: "3550",
      variant: { sku: "ANK-A2633-WHT", name: "20W · White", color: "White", ram: null, storage: null, network: "", sim: "", region: "International", purchase: "3550", wholesale: "4100", retail: "4799", minimum: "3950", barcode: "194644037582" },
    },
    {
      sku: "GEN-IP15-SCR", name: "iPhone 15 OLED Replacement Display", model: "iPhone 15 compatible", modelCode: "IP15-OLED-A", brand: "Generic", category: "SPARES",
      type: ProductType.SPARE_PART, tracking: TrackingMethod.BATCH, standardCost: "24500",
      variant: { sku: "GEN-IP15-OLED-A", name: "Grade A · Black", color: "Black", ram: null, storage: null, network: "", sim: "", region: "Aftermarket", purchase: "24500", wholesale: "27000", retail: "29900", minimum: "26500", barcode: "2000000001518" },
    },
  ];

  for (const spec of productSpecs) {
    const product = await prisma.product.upsert({
      where: { companyId_sku: { companyId: company.id, sku: spec.sku } },
      create: {
        companyId: company.id,
        categoryId: categories.get(spec.category)!,
        brandId: brands.get(spec.brand),
        unitId: unit.id,
        taxRuleId: zeroPurchaseTax.id,
        createdById: admin.id,
        sku: spec.sku,
        name: spec.name,
        model: spec.model,
        modelCode: spec.modelCode,
        productType: spec.type,
        trackingMethod: spec.tracking,
        costingMethod: spec.tracking === TrackingMethod.IMEI ? CostingMethod.SPECIFIC : CostingMethod.WEIGHTED_AVERAGE,
        standardPurchasePrice: spec.standardCost,
        reorderLevel: spec.tracking === TrackingMethod.IMEI ? 2 : 10,
        status: ProductStatus.ACTIVE,
      },
      update: { taxRuleId: zeroPurchaseTax.id },
    });

    const variant = await prisma.productVariant.upsert({
      where: { companyId_sku: { companyId: company.id, sku: spec.variant.sku } },
      create: {
        companyId: company.id,
        productId: product.id,
        sku: spec.variant.sku,
        name: spec.variant.name,
        color: spec.variant.color,
        ramGb: spec.variant.ram,
        storageGb: spec.variant.storage,
        networkType: spec.variant.network || null,
        simConfiguration: spec.variant.sim || null,
        regionVariant: spec.variant.region,
        purchasePrice: spec.variant.purchase,
        wholesalePrice: spec.variant.wholesale,
        retailPrice: spec.variant.retail,
        minimumSellingPrice: spec.variant.minimum,
      },
      update: {},
    });

    await prisma.productBarcode.upsert({
      where: { companyId_barcode: { companyId: company.id, barcode: spec.variant.barcode } },
      create: {
        companyId: company.id,
        productId: product.id,
        variantId: variant.id,
        barcode: spec.variant.barcode,
        type: spec.variant.barcode.length === 13 ? "EAN13" : "UPC",
        isPrimary: true,
      },
      update: {},
    });
  }

  await seedFinanceFoundation({
    companyId: company.id,
    hazroBranchId: hazroBranch.id,
    islamabadBranchId: islamabadBranch.id,
    adminId: admin.id,
  });

  const auditExists = await prisma.auditLog.count({ where: { companyId: company.id } });
  if (!auditExists) {
    await prisma.auditLog.create({
      data: {
        companyId: company.id,
        actorId: admin.id,
        branchId: hazroBranch.id,
        warehouseId: mainWarehouse.id,
        action: "FOUNDATION_INITIALIZED",
        module: "system",
        entityType: "Company",
        entityId: company.id,
        entityReference: company.code,
        newValues: { phase: 1, permissionCount: PERMISSIONS.length, roleCount: roleDefinitions.length },
        metadata: { source: "development-seed" },
        ipAddress: "127.0.0.1",
      },
    });
  }

  const notificationExists = await prisma.notification.count({ where: { recipientId: admin.id } });
  if (!notificationExists) {
    await prisma.notification.create({
      data: {
        companyId: company.id,
        recipientId: admin.id,
        branchId: hazroBranch.id,
        type: "SYSTEM_READY",
        severity: "SUCCESS",
        title: "Foundation controls are ready",
        message: "Organization, access control, catalog, audit, and database safeguards are operational.",
        actionUrl: "/roadmap",
      },
    });
  }
}

async function main() {
  await seedPermissionCatalog();
  if (process.env.DEMO_SEED === "true") await seedDemo();
  console.log(`Permission catalog synchronized (${PERMISSIONS.length} permissions).`);
  if (process.env.DEMO_SEED === "true") console.log("Development fixtures synchronized.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
