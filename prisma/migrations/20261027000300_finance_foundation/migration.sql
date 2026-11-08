-- CreateEnum
CREATE TYPE "AccountClass" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'COGS', 'EXPENSE');

-- CreateEnum
CREATE TYPE "NormalBalance" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'REVERSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "JournalType" AS ENUM ('GENERAL', 'OPENING', 'ADJUSTMENT', 'ACCRUAL', 'PREPAYMENT', 'DEPRECIATION', 'RECLASSIFICATION', 'REVERSAL', 'CLOSING', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'SOFT_CLOSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashFlowActivity" AS ENUM ('NONE', 'OPERATING', 'INVESTING', 'FINANCING');

-- CreateEnum
CREATE TYPE "PartyStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BankReconciliationStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'REOPENED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('DRAFT', 'ACTIVE', 'FULLY_DEPRECIATED', 'IMPAIRED', 'HELD_FOR_SALE', 'DISPOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DepreciationMethod" AS ENUM ('NONE', 'STRAIGHT_LINE', 'DECLINING_BALANCE');

-- CreateEnum
CREATE TYPE "AssetTransactionType" AS ENUM ('ACQUISITION', 'CAPITALIZATION', 'DEPRECIATION', 'TRANSFER', 'IMPAIRMENT', 'REVALUATION', 'DISPOSAL', 'SALE');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('PLANNED', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "IncentiveType" AS ENUM ('FIXED_PER_UNIT', 'PERCENT_NET_SALES', 'MODEL_WISE', 'BRAND_WISE', 'QUANTITY_SLAB', 'SALES_TARGET', 'BRANCH_TARGET', 'DEALER', 'CAMPAIGN');

-- CreateEnum
CREATE TYPE "IncentiveRecipientType" AS ENUM ('USER', 'CUSTOMER', 'BRANCH', 'OTHER');

-- CreateEnum
CREATE TYPE "IncentiveStatus" AS ENUM ('DRAFT', 'CALCULATED', 'SUBMITTED', 'APPROVED', 'ACCRUED', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_RECEIVED', 'RECEIVED', 'REJECTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "RebateDirection" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "RebateStatus" AS ENUM ('DRAFT', 'CALCULATED', 'SUBMITTED', 'APPROVED', 'ACCRUED', 'PARTIALLY_SETTLED', 'SETTLED', 'REJECTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REVISED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OpeningBalanceStatus" AS ENUM ('DRAFT', 'VALIDATED', 'APPROVED', 'POSTED', 'REVERSED');

-- Preserve legacy product warranty values as historical JSON before removing the
-- excluded operational field. This data is informational only and is never used
-- by a workflow, report, notification, permission, or posting rule.
UPDATE "Product"
SET "attributes" = jsonb_set(
  COALESCE("attributes"::jsonb, '{}'::jsonb),
  '{legacyRemoved,warrantyMonths}',
  to_jsonb("warrantyMonths"),
  true
)
WHERE "warrantyMonths" IS NOT NULL;

-- Deactivate any legacy excluded-scope role without deleting users, membership,
-- assignment history, or audit records. Revoke and remove obsolete grants.
UPDATE "Role"
SET "isActive" = false,
    "code" = 'RETIRED-' || substring("id"::text, 1, 8),
    "name" = 'Retired excluded-scope role',
    "description" = 'Deactivated during the finance ERP migration; this operational scope is permanently excluded.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE lower("code") LIKE '%repair%'
   OR lower("name") LIKE '%repair%'
   OR lower("code") LIKE '%warranty%'
   OR lower("name") LIKE '%warranty%';

DELETE FROM "RolePermission"
WHERE "permissionId" IN (
  SELECT "id" FROM "Permission"
  WHERE "key" LIKE 'repair.%' OR "key" LIKE 'warranty.%'
);

DELETE FROM "Permission"
WHERE "key" LIKE 'repair.%' OR "key" LIKE 'warranty.%';

-- Remove the excluded field only after its legacy value has been preserved.
ALTER TABLE "Product" DROP COLUMN "warrantyMonths";

-- CreateTable
CREATE TABLE "AccountGroup" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "parentId" UUID,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "accountClass" "AccountClass" NOT NULL,
    "statementSection" VARCHAR(80) NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AccountGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "groupId" UUID,
    "parentId" UUID,
    "branchId" UUID,
    "costCenterId" UUID,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "accountClass" "AccountClass" NOT NULL,
    "subclass" VARCHAR(80) NOT NULL,
    "accountType" VARCHAR(80) NOT NULL,
    "normalBalance" "NormalBalance" NOT NULL,
    "openingBalance" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "openingBalanceDate" DATE,
    "currencyCode" CHAR(3),
    "isControlAccount" BOOLEAN NOT NULL DEFAULT false,
    "reconciliationRequired" BOOLEAN NOT NULL DEFAULT false,
    "allowManualJournal" BOOLEAN NOT NULL DEFAULT true,
    "cashFlowActivity" "CashFlowActivity" NOT NULL DEFAULT 'NONE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalYear" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FiscalYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "fiscalYearId" UUID NOT NULL,
    "number" SMALLINT NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "quarter" SMALLINT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMPTZ(3),
    "closedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "customerType" VARCHAR(40) NOT NULL DEFAULT 'RETAIL',
    "phone" VARCHAR(30),
    "email" VARCHAR(190),
    "address" TEXT,
    "taxNumber" VARCHAR(80),
    "creditLimit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 0,
    "openingBalance" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "status" "PartyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "contactPerson" VARCHAR(120),
    "phone" VARCHAR(30),
    "email" VARCHAR(190),
    "address" TEXT,
    "taxNumber" VARCHAR(80),
    "creditLimit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 0,
    "openingBalance" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "status" "PartyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "periodId" UUID NOT NULL,
    "costCenterId" UUID,
    "departmentId" UUID,
    "voucherNumber" VARCHAR(60) NOT NULL,
    "voucherDate" DATE NOT NULL,
    "postingDate" DATE NOT NULL,
    "voucherType" "JournalType" NOT NULL,
    "status" "JournalStatus" NOT NULL DEFAULT 'DRAFT',
    "narration" TEXT NOT NULL,
    "referenceDocument" VARCHAR(120),
    "sourceModule" VARCHAR(60) NOT NULL DEFAULT 'MANUAL',
    "sourceDocumentType" VARCHAR(80),
    "sourceDocumentId" VARCHAR(80),
    "sourceDocumentNumber" VARCHAR(80),
    "cashFlowActivity" "CashFlowActivity" NOT NULL DEFAULT 'NONE',
    "idempotencyKey" VARCHAR(120),
    "totalDebit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "totalCredit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "preparedById" UUID NOT NULL,
    "approvedById" UUID,
    "postedById" UUID,
    "reversedById" UUID,
    "reversalOfId" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "postedAt" TIMESTAMPTZ(3),
    "reversedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntryLine" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "costCenterId" UUID,
    "departmentId" UUID,
    "customerId" UUID,
    "supplierId" UUID,
    "bankAccountId" UUID,
    "lineNumber" SMALLINT NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "debit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "credit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "currencyCode" CHAR(3) NOT NULL,
    "exchangeRate" DECIMAL(19,8) NOT NULL DEFAULT 1,
    "baseDebit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "baseCredit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "invoiceNumber" VARCHAR(80),
    "dueDate" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "glAccountId" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "bankName" VARCHAR(140) NOT NULL,
    "accountTitle" VARCHAR(160) NOT NULL,
    "accountNumberEncrypted" BYTEA,
    "accountNumberLast4" VARCHAR(4),
    "iban" VARCHAR(40),
    "bankBranchName" VARCHAR(120),
    "currencyCode" CHAR(3) NOT NULL,
    "openingBalance" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "openingDate" DATE,
    "authorizedUserIds" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "journalEntryId" UUID NOT NULL,
    "journalLineId" UUID NOT NULL,
    "transactionType" VARCHAR(50) NOT NULL,
    "transactionDate" DATE NOT NULL,
    "valueDate" DATE,
    "bankReference" VARCHAR(120),
    "description" VARCHAR(500) NOT NULL,
    "deposit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "withdrawal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "reconciliationStatus" VARCHAR(30) NOT NULL DEFAULT 'UNRECONCILED',
    "reconciledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatement" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "statementNumber" VARCHAR(80),
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "openingBalance" DECIMAL(19,4) NOT NULL,
    "closingBalance" DECIMAL(19,4) NOT NULL,
    "importedFileName" VARCHAR(240),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementLine" (
    "id" UUID NOT NULL,
    "statementId" UUID NOT NULL,
    "matchedJournalLineId" UUID,
    "transactionDate" DATE NOT NULL,
    "valueDate" DATE,
    "reference" VARCHAR(120),
    "description" VARCHAR(500) NOT NULL,
    "deposit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "withdrawal" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "isMatched" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankReconciliation" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "statementId" UUID NOT NULL,
    "status" "BankReconciliationStatus" NOT NULL DEFAULT 'DRAFT',
    "bookBalance" DECIMAL(19,4) NOT NULL,
    "statementBalance" DECIMAL(19,4) NOT NULL,
    "outstandingDeposits" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "outstandingPayments" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "adjustedBalance" DECIMAL(19,4) NOT NULL,
    "preparedById" UUID NOT NULL,
    "completedById" UUID,
    "completedAt" TIMESTAMPTZ(3),
    "reopenedReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BankReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetCategory" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "depreciable" BOOLEAN NOT NULL DEFAULT true,
    "defaultUsefulLifeMonths" INTEGER,
    "defaultMethod" "DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "defaultRate" DECIMAL(9,6),
    "assetAccountId" UUID NOT NULL,
    "accumulatedAccountId" UUID NOT NULL,
    "expenseAccountId" UUID NOT NULL,
    "disposalAccountId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AssetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAsset" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "supplierId" UUID,
    "branchId" UUID NOT NULL,
    "departmentId" UUID,
    "custodianId" UUID,
    "assetAccountId" UUID NOT NULL,
    "accumulatedAccountId" UUID NOT NULL,
    "expenseAccountId" UUID NOT NULL,
    "disposalAccountId" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "serialNumber" VARCHAR(120),
    "purchaseInvoice" VARCHAR(80),
    "purchaseDate" DATE NOT NULL,
    "capitalizationDate" DATE NOT NULL,
    "depreciationStartDate" DATE,
    "purchaseCost" DECIMAL(19,4) NOT NULL,
    "additionalCost" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "residualValue" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER,
    "depreciationMethod" "DepreciationMethod" NOT NULL,
    "depreciationRate" DECIMAL(9,6),
    "accumulatedDepreciation" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "netBookValue" DECIMAL(19,4) NOT NULL,
    "assetLocation" VARCHAR(180),
    "status" "AssetStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetDepreciationSchedule" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "journalEntryId" UUID,
    "periodDate" DATE NOT NULL,
    "openingNetBookValue" DECIMAL(19,4) NOT NULL,
    "depreciationAmount" DECIMAL(19,4) NOT NULL,
    "closingNetBookValue" DECIMAL(19,4) NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'PLANNED',
    "postedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetDepreciationSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetTransaction" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "journalEntryId" UUID,
    "type" "AssetTransactionType" NOT NULL,
    "transactionDate" DATE NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "description" TEXT NOT NULL,
    "previousValues" JSONB,
    "newValues" JSONB,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetDisposal" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "journalEntryId" UUID,
    "disposalDate" DATE NOT NULL,
    "disposalMethod" VARCHAR(50) NOT NULL,
    "proceeds" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "costAtDisposal" DECIMAL(19,4) NOT NULL,
    "accumulatedAtDisposal" DECIMAL(19,4) NOT NULL,
    "netBookValueAtDisposal" DECIMAL(19,4) NOT NULL,
    "gainOrLoss" DECIMAL(19,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "approvedById" UUID NOT NULL,
    "approvedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetDisposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentivePlan" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE NOT NULL,
    "recipientType" "IncentiveRecipientType" NOT NULL,
    "branchId" UUID,
    "incentiveType" "IncentiveType" NOT NULL,
    "rate" DECIMAL(19,6),
    "fixedAmount" DECIMAL(19,4),
    "minimumTarget" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "maximumIncentive" DECIMAL(19,4),
    "eligibilityRules" JSONB,
    "returnAdjustmentRule" VARCHAR(40) NOT NULL DEFAULT 'REVERSE',
    "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
    "expenseAccountId" UUID NOT NULL,
    "payableAccountId" UUID NOT NULL,
    "incomeAccountId" UUID,
    "receivableAccountId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IncentivePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentiveCalculation" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "branchId" UUID,
    "recipientType" "IncentiveRecipientType" NOT NULL,
    "recipientUserId" UUID,
    "recipientCustomerId" UUID,
    "recipientName" VARCHAR(160),
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "eligibleQuantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "eligibleNetSales" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "calculatedAmount" DECIMAL(19,4) NOT NULL,
    "adjustmentAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "approvedAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "status" "IncentiveStatus" NOT NULL DEFAULT 'CALCULATED',
    "calculationDetails" JSONB,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "accrualJournalId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IncentiveCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentivePayable" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "calculationId" UUID NOT NULL,
    "voucherNumber" VARCHAR(60) NOT NULL,
    "accruedAmount" DECIMAL(19,4) NOT NULL,
    "paidAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(19,4) NOT NULL,
    "status" "IncentiveStatus" NOT NULL DEFAULT 'ACCRUED',
    "accrualJournalId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IncentivePayable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentivePayment" (
    "id" UUID NOT NULL,
    "payableId" UUID NOT NULL,
    "bankAccountId" UUID,
    "journalEntryId" UUID NOT NULL,
    "paymentDate" DATE NOT NULL,
    "paymentMethod" VARCHAR(40) NOT NULL,
    "reference" VARCHAR(120),
    "amount" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncentivePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceivedIncentive" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "planId" UUID,
    "supplierId" UUID,
    "referenceNumber" VARCHAR(60) NOT NULL,
    "payerName" VARCHAR(160) NOT NULL,
    "programName" VARCHAR(160) NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "targetQuantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "achievedQuantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "eligibleAmount" DECIMAL(19,4) NOT NULL,
    "approvedAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "receivedAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "expectedReceiptDate" DATE,
    "status" "IncentiveStatus" NOT NULL DEFAULT 'DRAFT',
    "incomeAccountId" UUID NOT NULL,
    "receivableAccountId" UUID NOT NULL,
    "accrualJournalId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReceivedIncentive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceivedIncentivePayment" (
    "id" UUID NOT NULL,
    "receivedIncentiveId" UUID NOT NULL,
    "bankAccountId" UUID,
    "journalEntryId" UUID NOT NULL,
    "receiptDate" DATE NOT NULL,
    "receiptMethod" VARCHAR(40) NOT NULL,
    "reference" VARCHAR(120),
    "amount" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceivedIncentivePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RebateProgram" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "direction" "RebateDirection" NOT NULL,
    "supplierId" UUID,
    "customerId" UUID,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE NOT NULL,
    "calculationMethod" VARCHAR(60) NOT NULL,
    "rate" DECIMAL(19,6),
    "fixedAmount" DECIMAL(19,4),
    "rules" JSONB,
    "primaryAccountId" UUID NOT NULL,
    "settlementAccountId" UUID NOT NULL,
    "accountingTreatment" VARCHAR(80) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RebateProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RebateCalculation" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "programId" UUID NOT NULL,
    "supplierId" UUID,
    "customerId" UUID,
    "referenceNumber" VARCHAR(60) NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "eligibleQuantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "eligibleValue" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "calculatedAmount" DECIMAL(19,4) NOT NULL,
    "approvedAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "settledAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "dueDate" DATE,
    "status" "RebateStatus" NOT NULL DEFAULT 'CALCULATED',
    "calculationDetails" JSONB,
    "accrualJournalId" UUID,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RebateCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RebateReceivable" (
    "id" UUID NOT NULL,
    "calculationId" UUID NOT NULL,
    "accrualJournalId" UUID NOT NULL,
    "accruedAmount" DECIMAL(19,4) NOT NULL,
    "receivedAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "RebateReceivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RebateReceipt" (
    "id" UUID NOT NULL,
    "receivableId" UUID NOT NULL,
    "bankAccountId" UUID,
    "journalEntryId" UUID NOT NULL,
    "receiptDate" DATE NOT NULL,
    "receiptMethod" VARCHAR(40) NOT NULL,
    "reference" VARCHAR(120),
    "amount" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RebateReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RebatePayable" (
    "id" UUID NOT NULL,
    "calculationId" UUID NOT NULL,
    "accrualJournalId" UUID NOT NULL,
    "accruedAmount" DECIMAL(19,4) NOT NULL,
    "paidAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "RebatePayable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RebatePayment" (
    "id" UUID NOT NULL,
    "payableId" UUID NOT NULL,
    "bankAccountId" UUID,
    "journalEntryId" UUID NOT NULL,
    "paymentDate" DATE NOT NULL,
    "paymentMethod" VARCHAR(40) NOT NULL,
    "reference" VARCHAR(120),
    "amount" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RebatePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "fiscalYearId" UUID NOT NULL,
    "branchId" UUID,
    "departmentId" UUID,
    "costCenterId" UUID,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "periodId" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "notes" VARCHAR(500),

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningBalanceBatch" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "fiscalYearId" UUID NOT NULL,
    "journalEntryId" UUID,
    "batchNumber" VARCHAR(60) NOT NULL,
    "balanceDate" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "status" "OpeningBalanceStatus" NOT NULL DEFAULT 'DRAFT',
    "totalDebit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "totalCredit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "validationErrors" JSONB,
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "postedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OpeningBalanceBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningBalanceLine" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "customerId" UUID,
    "supplierId" UUID,
    "bankAccountId" UUID,
    "fixedAssetId" UUID,
    "reference" VARCHAR(120),
    "dueDate" DATE,
    "debit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "credit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "details" JSONB,
    "lineNumber" SMALLINT NOT NULL,

    CONSTRAINT "OpeningBalanceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialPeriodClose" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "periodId" UUID NOT NULL,
    "closingJournalId" UUID,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "checklist" JSONB NOT NULL,
    "unresolvedItems" JSONB,
    "requestedById" UUID NOT NULL,
    "approvedById" UUID,
    "closedAt" TIMESTAMPTZ(3),
    "reopenedAt" TIMESTAMPTZ(3),
    "reopenReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FinancialPeriodClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountGroup_companyId_accountClass_sequence_idx" ON "AccountGroup"("companyId", "accountClass", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "AccountGroup_companyId_code_key" ON "AccountGroup"("companyId", "code");

-- CreateIndex
CREATE INDEX "Account_companyId_accountClass_isActive_idx" ON "Account"("companyId", "accountClass", "isActive");

-- CreateIndex
CREATE INDEX "Account_companyId_accountType_idx" ON "Account"("companyId", "accountType");

-- CreateIndex
CREATE INDEX "Account_parentId_idx" ON "Account"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_companyId_code_key" ON "Account"("companyId", "code");

-- CreateIndex
CREATE INDEX "FiscalYear_companyId_startDate_endDate_idx" ON "FiscalYear"("companyId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalYear_companyId_code_key" ON "FiscalYear"("companyId", "code");

-- CreateIndex
CREATE INDEX "AccountingPeriod_companyId_startDate_endDate_status_idx" ON "AccountingPeriod"("companyId", "startDate", "endDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_companyId_fiscalYearId_number_key" ON "AccountingPeriod"("companyId", "fiscalYearId", "number");

-- CreateIndex
CREATE INDEX "CostCenter_companyId_branchId_isActive_idx" ON "CostCenter"("companyId", "branchId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_companyId_code_key" ON "CostCenter"("companyId", "code");

-- CreateIndex
CREATE INDEX "Department_companyId_branchId_isActive_idx" ON "Department"("companyId", "branchId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Department_companyId_code_key" ON "Department"("companyId", "code");

-- CreateIndex
CREATE INDEX "Customer_companyId_name_status_idx" ON "Customer"("companyId", "name", "status");

-- CreateIndex
CREATE INDEX "Customer_companyId_phone_idx" ON "Customer"("companyId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_code_key" ON "Customer"("companyId", "code");

-- CreateIndex
CREATE INDEX "Supplier_companyId_name_status_idx" ON "Supplier"("companyId", "name", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_companyId_code_key" ON "Supplier"("companyId", "code");

-- CreateIndex
CREATE INDEX "JournalEntry_companyId_postingDate_status_idx" ON "JournalEntry"("companyId", "postingDate", "status");

-- CreateIndex
CREATE INDEX "JournalEntry_companyId_sourceModule_sourceDocumentId_idx" ON "JournalEntry"("companyId", "sourceModule", "sourceDocumentId");

-- CreateIndex
CREATE INDEX "JournalEntry_periodId_status_idx" ON "JournalEntry"("periodId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_companyId_voucherNumber_key" ON "JournalEntry"("companyId", "voucherNumber");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_companyId_sourceModule_idempotencyKey_key" ON "JournalEntry"("companyId", "sourceModule", "idempotencyKey");

-- CreateIndex
CREATE INDEX "JournalEntryLine_accountId_entryId_idx" ON "JournalEntryLine"("accountId", "entryId");

-- CreateIndex
CREATE INDEX "JournalEntryLine_customerId_dueDate_idx" ON "JournalEntryLine"("customerId", "dueDate");

-- CreateIndex
CREATE INDEX "JournalEntryLine_supplierId_dueDate_idx" ON "JournalEntryLine"("supplierId", "dueDate");

-- CreateIndex
CREATE INDEX "JournalEntryLine_bankAccountId_idx" ON "JournalEntryLine"("bankAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntryLine_entryId_lineNumber_key" ON "JournalEntryLine"("entryId", "lineNumber");

-- CreateIndex
CREATE INDEX "BankAccount_companyId_isActive_idx" ON "BankAccount"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_companyId_code_key" ON "BankAccount"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_companyId_glAccountId_key" ON "BankAccount"("companyId", "glAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_journalLineId_key" ON "BankTransaction"("journalLineId");

-- CreateIndex
CREATE INDEX "BankTransaction_companyId_bankAccountId_transactionDate_idx" ON "BankTransaction"("companyId", "bankAccountId", "transactionDate");

-- CreateIndex
CREATE INDEX "BankTransaction_reconciliationStatus_idx" ON "BankTransaction"("reconciliationStatus");

-- CreateIndex
CREATE INDEX "BankStatement_companyId_periodEnd_idx" ON "BankStatement"("companyId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatement_bankAccountId_periodStart_periodEnd_key" ON "BankStatement"("bankAccountId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "BankStatementLine_statementId_transactionDate_idx" ON "BankStatementLine"("statementId", "transactionDate");

-- CreateIndex
CREATE INDEX "BankStatementLine_matchedJournalLineId_idx" ON "BankStatementLine"("matchedJournalLineId");

-- CreateIndex
CREATE UNIQUE INDEX "BankReconciliation_statementId_key" ON "BankReconciliation"("statementId");

-- CreateIndex
CREATE INDEX "BankReconciliation_companyId_bankAccountId_status_idx" ON "BankReconciliation"("companyId", "bankAccountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AssetCategory_companyId_code_key" ON "AssetCategory"("companyId", "code");

-- CreateIndex
CREATE INDEX "FixedAsset_companyId_categoryId_status_idx" ON "FixedAsset"("companyId", "categoryId", "status");

-- CreateIndex
CREATE INDEX "FixedAsset_companyId_branchId_assetLocation_idx" ON "FixedAsset"("companyId", "branchId", "assetLocation");

-- CreateIndex
CREATE INDEX "FixedAsset_serialNumber_idx" ON "FixedAsset"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAsset_companyId_code_key" ON "FixedAsset"("companyId", "code");

-- CreateIndex
CREATE INDEX "AssetDepreciationSchedule_periodDate_status_idx" ON "AssetDepreciationSchedule"("periodDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AssetDepreciationSchedule_assetId_periodDate_key" ON "AssetDepreciationSchedule"("assetId", "periodDate");

-- CreateIndex
CREATE INDEX "AssetTransaction_assetId_transactionDate_idx" ON "AssetTransaction"("assetId", "transactionDate");

-- CreateIndex
CREATE UNIQUE INDEX "AssetDisposal_assetId_key" ON "AssetDisposal"("assetId");

-- CreateIndex
CREATE INDEX "IncentivePlan_companyId_effectiveFrom_effectiveTo_isActive_idx" ON "IncentivePlan"("companyId", "effectiveFrom", "effectiveTo", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "IncentivePlan_companyId_code_key" ON "IncentivePlan"("companyId", "code");

-- CreateIndex
CREATE INDEX "IncentiveCalculation_companyId_status_periodEnd_idx" ON "IncentiveCalculation"("companyId", "status", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "IncentiveCalculation_planId_recipientType_recipientUserId_r_key" ON "IncentiveCalculation"("planId", "recipientType", "recipientUserId", "recipientCustomerId", "branchId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "IncentivePayable_calculationId_key" ON "IncentivePayable"("calculationId");

-- CreateIndex
CREATE INDEX "IncentivePayable_companyId_status_idx" ON "IncentivePayable"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IncentivePayable_companyId_voucherNumber_key" ON "IncentivePayable"("companyId", "voucherNumber");

-- CreateIndex
CREATE INDEX "IncentivePayment_payableId_paymentDate_idx" ON "IncentivePayment"("payableId", "paymentDate");

-- CreateIndex
CREATE INDEX "ReceivedIncentive_companyId_status_expectedReceiptDate_idx" ON "ReceivedIncentive"("companyId", "status", "expectedReceiptDate");

-- CreateIndex
CREATE UNIQUE INDEX "ReceivedIncentive_companyId_referenceNumber_key" ON "ReceivedIncentive"("companyId", "referenceNumber");

-- CreateIndex
CREATE INDEX "ReceivedIncentivePayment_receivedIncentiveId_receiptDate_idx" ON "ReceivedIncentivePayment"("receivedIncentiveId", "receiptDate");

-- CreateIndex
CREATE INDEX "RebateProgram_companyId_direction_isActive_idx" ON "RebateProgram"("companyId", "direction", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "RebateProgram_companyId_code_key" ON "RebateProgram"("companyId", "code");

-- CreateIndex
CREATE INDEX "RebateCalculation_companyId_status_dueDate_idx" ON "RebateCalculation"("companyId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "RebateCalculation_companyId_referenceNumber_key" ON "RebateCalculation"("companyId", "referenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RebateReceivable_calculationId_key" ON "RebateReceivable"("calculationId");

-- CreateIndex
CREATE INDEX "RebateReceipt_receivableId_receiptDate_idx" ON "RebateReceipt"("receivableId", "receiptDate");

-- CreateIndex
CREATE UNIQUE INDEX "RebatePayable_calculationId_key" ON "RebatePayable"("calculationId");

-- CreateIndex
CREATE INDEX "RebatePayment_payableId_paymentDate_idx" ON "RebatePayment"("payableId", "paymentDate");

-- CreateIndex
CREATE INDEX "Budget_companyId_fiscalYearId_status_idx" ON "Budget"("companyId", "fiscalYearId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_companyId_code_version_key" ON "Budget"("companyId", "code", "version");

-- CreateIndex
CREATE INDEX "BudgetLine_periodId_accountId_idx" ON "BudgetLine"("periodId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetLine_budgetId_accountId_periodId_key" ON "BudgetLine"("budgetId", "accountId", "periodId");

-- CreateIndex
CREATE INDEX "OpeningBalanceBatch_companyId_balanceDate_status_idx" ON "OpeningBalanceBatch"("companyId", "balanceDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningBalanceBatch_companyId_batchNumber_key" ON "OpeningBalanceBatch"("companyId", "batchNumber");

-- CreateIndex
CREATE INDEX "OpeningBalanceLine_accountId_idx" ON "OpeningBalanceLine"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningBalanceLine_batchId_lineNumber_key" ON "OpeningBalanceLine"("batchId", "lineNumber");

-- CreateIndex
CREATE INDEX "FinancialPeriodClose_companyId_status_idx" ON "FinancialPeriodClose"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialPeriodClose_periodId_key" ON "FinancialPeriodClose"("periodId");

-- AddForeignKey
ALTER TABLE "AccountGroup" ADD CONSTRAINT "AccountGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountGroup" ADD CONSTRAINT "AccountGroup_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AccountGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AccountGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalYear" ADD CONSTRAINT "FiscalYear_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_journalLineId_fkey" FOREIGN KEY ("journalLineId") REFERENCES "JournalEntryLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_matchedJournalLineId_fkey" FOREIGN KEY ("matchedJournalLineId") REFERENCES "JournalEntryLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_assetAccountId_fkey" FOREIGN KEY ("assetAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_accumulatedAccountId_fkey" FOREIGN KEY ("accumulatedAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_disposalAccountId_fkey" FOREIGN KEY ("disposalAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_custodianId_fkey" FOREIGN KEY ("custodianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_assetAccountId_fkey" FOREIGN KEY ("assetAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_accumulatedAccountId_fkey" FOREIGN KEY ("accumulatedAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_disposalAccountId_fkey" FOREIGN KEY ("disposalAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDepreciationSchedule" ADD CONSTRAINT "AssetDepreciationSchedule_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FixedAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDepreciationSchedule" ADD CONSTRAINT "AssetDepreciationSchedule_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransaction" ADD CONSTRAINT "AssetTransaction_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FixedAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransaction" ADD CONSTRAINT "AssetTransaction_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransaction" ADD CONSTRAINT "AssetTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDisposal" ADD CONSTRAINT "AssetDisposal_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FixedAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDisposal" ADD CONSTRAINT "AssetDisposal_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDisposal" ADD CONSTRAINT "AssetDisposal_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentivePlan" ADD CONSTRAINT "IncentivePlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentivePlan" ADD CONSTRAINT "IncentivePlan_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentivePlan" ADD CONSTRAINT "IncentivePlan_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentivePlan" ADD CONSTRAINT "IncentivePlan_payableAccountId_fkey" FOREIGN KEY ("payableAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentivePlan" ADD CONSTRAINT "IncentivePlan_incomeAccountId_fkey" FOREIGN KEY ("incomeAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentivePlan" ADD CONSTRAINT "IncentivePlan_receivableAccountId_fkey" FOREIGN KEY ("receivableAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveCalculation" ADD CONSTRAINT "IncentiveCalculation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveCalculation" ADD CONSTRAINT "IncentiveCalculation_planId_fkey" FOREIGN KEY ("planId") REFERENCES "IncentivePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveCalculation" ADD CONSTRAINT "IncentiveCalculation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveCalculation" ADD CONSTRAINT "IncentiveCalculation_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveCalculation" ADD CONSTRAINT "IncentiveCalculation_recipientCustomerId_fkey" FOREIGN KEY ("recipientCustomerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveCalculation" ADD CONSTRAINT "IncentiveCalculation_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveCalculation" ADD CONSTRAINT "IncentiveCalculation_accrualJournalId_fkey" FOREIGN KEY ("accrualJournalId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentivePayable" ADD CONSTRAINT "IncentivePayable_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentivePayable" ADD CONSTRAINT "IncentivePayable_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "IncentiveCalculation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentivePayable" ADD CONSTRAINT "IncentivePayable_accrualJournalId_fkey" FOREIGN KEY ("accrualJournalId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentivePayment" ADD CONSTRAINT "IncentivePayment_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "IncentivePayable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentivePayment" ADD CONSTRAINT "IncentivePayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentivePayment" ADD CONSTRAINT "IncentivePayment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivedIncentive" ADD CONSTRAINT "ReceivedIncentive_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivedIncentive" ADD CONSTRAINT "ReceivedIncentive_planId_fkey" FOREIGN KEY ("planId") REFERENCES "IncentivePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivedIncentive" ADD CONSTRAINT "ReceivedIncentive_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivedIncentive" ADD CONSTRAINT "ReceivedIncentive_incomeAccountId_fkey" FOREIGN KEY ("incomeAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivedIncentive" ADD CONSTRAINT "ReceivedIncentive_receivableAccountId_fkey" FOREIGN KEY ("receivableAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivedIncentive" ADD CONSTRAINT "ReceivedIncentive_accrualJournalId_fkey" FOREIGN KEY ("accrualJournalId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivedIncentivePayment" ADD CONSTRAINT "ReceivedIncentivePayment_receivedIncentiveId_fkey" FOREIGN KEY ("receivedIncentiveId") REFERENCES "ReceivedIncentive"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivedIncentivePayment" ADD CONSTRAINT "ReceivedIncentivePayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivedIncentivePayment" ADD CONSTRAINT "ReceivedIncentivePayment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateProgram" ADD CONSTRAINT "RebateProgram_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateProgram" ADD CONSTRAINT "RebateProgram_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateProgram" ADD CONSTRAINT "RebateProgram_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateProgram" ADD CONSTRAINT "RebateProgram_primaryAccountId_fkey" FOREIGN KEY ("primaryAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateProgram" ADD CONSTRAINT "RebateProgram_settlementAccountId_fkey" FOREIGN KEY ("settlementAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateCalculation" ADD CONSTRAINT "RebateCalculation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateCalculation" ADD CONSTRAINT "RebateCalculation_programId_fkey" FOREIGN KEY ("programId") REFERENCES "RebateProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateCalculation" ADD CONSTRAINT "RebateCalculation_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateCalculation" ADD CONSTRAINT "RebateCalculation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateCalculation" ADD CONSTRAINT "RebateCalculation_accrualJournalId_fkey" FOREIGN KEY ("accrualJournalId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateCalculation" ADD CONSTRAINT "RebateCalculation_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateReceivable" ADD CONSTRAINT "RebateReceivable_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "RebateCalculation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateReceivable" ADD CONSTRAINT "RebateReceivable_accrualJournalId_fkey" FOREIGN KEY ("accrualJournalId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateReceipt" ADD CONSTRAINT "RebateReceipt_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "RebateReceivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateReceipt" ADD CONSTRAINT "RebateReceipt_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateReceipt" ADD CONSTRAINT "RebateReceipt_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebatePayable" ADD CONSTRAINT "RebatePayable_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "RebateCalculation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebatePayable" ADD CONSTRAINT "RebatePayable_accrualJournalId_fkey" FOREIGN KEY ("accrualJournalId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebatePayment" ADD CONSTRAINT "RebatePayment_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "RebatePayable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebatePayment" ADD CONSTRAINT "RebatePayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebatePayment" ADD CONSTRAINT "RebatePayment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalanceBatch" ADD CONSTRAINT "OpeningBalanceBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalanceBatch" ADD CONSTRAINT "OpeningBalanceBatch_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalanceBatch" ADD CONSTRAINT "OpeningBalanceBatch_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalanceBatch" ADD CONSTRAINT "OpeningBalanceBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalanceBatch" ADD CONSTRAINT "OpeningBalanceBatch_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalanceLine" ADD CONSTRAINT "OpeningBalanceLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "OpeningBalanceBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalanceLine" ADD CONSTRAINT "OpeningBalanceLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalanceLine" ADD CONSTRAINT "OpeningBalanceLine_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalanceLine" ADD CONSTRAINT "OpeningBalanceLine_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalanceLine" ADD CONSTRAINT "OpeningBalanceLine_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalanceLine" ADD CONSTRAINT "OpeningBalanceLine_fixedAssetId_fkey" FOREIGN KEY ("fixedAssetId") REFERENCES "FixedAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPeriodClose" ADD CONSTRAINT "FinancialPeriodClose_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPeriodClose" ADD CONSTRAINT "FinancialPeriodClose_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPeriodClose" ADD CONSTRAINT "FinancialPeriodClose_closingJournalId_fkey" FOREIGN KEY ("closingJournalId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPeriodClose" ADD CONSTRAINT "FinancialPeriodClose_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPeriodClose" ADD CONSTRAINT "FinancialPeriodClose_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Finance integrity constraints: monetary values are fixed-point decimals and
-- every row records exactly one debit/credit or deposit/withdrawal side.
ALTER TABLE "FiscalYear"
  ADD CONSTRAINT "FiscalYear_valid_dates" CHECK ("endDate" >= "startDate");
ALTER TABLE "AccountingPeriod"
  ADD CONSTRAINT "AccountingPeriod_valid_dates" CHECK ("endDate" >= "startDate"),
  ADD CONSTRAINT "AccountingPeriod_valid_number" CHECK ("number" BETWEEN 1 AND 13),
  ADD CONSTRAINT "AccountingPeriod_valid_quarter" CHECK ("quarter" BETWEEN 1 AND 4);
ALTER TABLE "JournalEntry"
  ADD CONSTRAINT "JournalEntry_nonnegative_totals" CHECK ("totalDebit" >= 0 AND "totalCredit" >= 0),
  ADD CONSTRAINT "JournalEntry_posted_balanced" CHECK (
    "status" NOT IN ('POSTED', 'REVERSED') OR
    ("totalDebit" > 0 AND "totalDebit" = "totalCredit")
  ),
  ADD CONSTRAINT "JournalEntry_maker_checker" CHECK (
    ("approvedById" IS NULL OR "approvedById" <> "preparedById") AND
    ("postedById" IS NULL OR "postedById" <> "preparedById") AND
    ("reversedById" IS NULL OR "reversedById" <> "preparedById")
  );
ALTER TABLE "JournalEntryLine"
  ADD CONSTRAINT "JournalEntryLine_one_sided" CHECK (
    ("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0)
  ),
  ADD CONSTRAINT "JournalEntryLine_base_one_sided" CHECK (
    ("baseDebit" > 0 AND "baseCredit" = 0) OR ("baseCredit" > 0 AND "baseDebit" = 0)
  ),
  ADD CONSTRAINT "JournalEntryLine_positive_rate" CHECK ("exchangeRate" > 0);
ALTER TABLE "BankTransaction"
  ADD CONSTRAINT "BankTransaction_one_sided" CHECK (
    ("deposit" > 0 AND "withdrawal" = 0) OR ("withdrawal" > 0 AND "deposit" = 0)
  );
ALTER TABLE "BankStatementLine"
  ADD CONSTRAINT "BankStatementLine_one_sided" CHECK (
    ("deposit" > 0 AND "withdrawal" = 0) OR ("withdrawal" > 0 AND "deposit" = 0)
  );
ALTER TABLE "FixedAsset"
  ADD CONSTRAINT "FixedAsset_valid_values" CHECK (
    "purchaseCost" >= 0 AND "additionalCost" >= 0 AND "residualValue" >= 0 AND
    "accumulatedDepreciation" >= 0 AND "netBookValue" >= 0 AND
    "residualValue" <= ("purchaseCost" + "additionalCost")
  );
ALTER TABLE "AssetDepreciationSchedule"
  ADD CONSTRAINT "AssetDepreciationSchedule_valid_values" CHECK (
    "openingNetBookValue" >= 0 AND "depreciationAmount" >= 0 AND
    "closingNetBookValue" >= 0 AND
    "closingNetBookValue" = "openingNetBookValue" - "depreciationAmount"
  );
ALTER TABLE "IncentivePayment" ADD CONSTRAINT "IncentivePayment_positive_amount" CHECK ("amount" > 0);
ALTER TABLE "ReceivedIncentivePayment" ADD CONSTRAINT "ReceivedIncentivePayment_positive_amount" CHECK ("amount" > 0);
ALTER TABLE "RebateReceipt" ADD CONSTRAINT "RebateReceipt_positive_amount" CHECK ("amount" > 0);
ALTER TABLE "RebatePayment" ADD CONSTRAINT "RebatePayment_positive_amount" CHECK ("amount" > 0);
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_nonnegative_amount" CHECK ("amount" >= 0);
ALTER TABLE "OpeningBalanceLine"
  ADD CONSTRAINT "OpeningBalanceLine_one_sided" CHECK (
    ("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0)
  );
ALTER TABLE "OpeningBalanceBatch"
  ADD CONSTRAINT "OpeningBalanceBatch_posted_balanced" CHECK (
    "status" NOT IN ('POSTED', 'REVERSED') OR
    ("totalDebit" > 0 AND "totalDebit" = "totalCredit")
  );

-- Verify journal header scope before accepting a row.
CREATE OR REPLACE FUNCTION enforce_journal_header_scope()
RETURNS trigger AS $$
DECLARE
  branch_company UUID;
  period_company UUID;
  period_start DATE;
  period_end DATE;
  period_status "PeriodStatus";
BEGIN
  SELECT "companyId" INTO branch_company FROM "Branch" WHERE "id" = NEW."branchId";
  SELECT "companyId", "startDate", "endDate", "status"
    INTO period_company, period_start, period_end, period_status
    FROM "AccountingPeriod" WHERE "id" = NEW."periodId";

  IF branch_company IS DISTINCT FROM NEW."companyId" OR period_company IS DISTINCT FROM NEW."companyId" THEN
    RAISE EXCEPTION 'Journal company, branch, and period must share one tenant';
  END IF;
  IF NEW."postingDate" < period_start OR NEW."postingDate" > period_end THEN
    RAISE EXCEPTION 'Journal posting date is outside its accounting period';
  END IF;
  IF NEW."status" = 'POSTED' AND period_status <> 'OPEN' THEN
    RAISE EXCEPTION 'Cannot post to a soft-closed or closed period';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "JournalEntry_scope_guard"
BEFORE INSERT OR UPDATE ON "JournalEntry"
FOR EACH ROW EXECUTE FUNCTION enforce_journal_header_scope();

-- Enforce tenant/branch scope and permit journal-line edits only while the
-- parent voucher is a draft. This blocks silent edits after submission.
CREATE OR REPLACE FUNCTION enforce_journal_line_scope()
RETURNS trigger AS $$
DECLARE
  parent_entry "JournalEntry"%ROWTYPE;
  account_company UUID;
  branch_company UUID;
  related_company UUID;
BEGIN
  SELECT * INTO parent_entry FROM "JournalEntry" WHERE "id" = COALESCE(NEW."entryId", OLD."entryId");
  IF parent_entry."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'Journal lines are immutable unless the voucher is DRAFT';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT "companyId" INTO account_company FROM "Account" WHERE "id" = NEW."accountId";
  SELECT "companyId" INTO branch_company FROM "Branch" WHERE "id" = NEW."branchId";
  IF account_company IS DISTINCT FROM parent_entry."companyId"
     OR branch_company IS DISTINCT FROM parent_entry."companyId"
     OR NEW."branchId" IS DISTINCT FROM parent_entry."branchId" THEN
    RAISE EXCEPTION 'Journal line account and branch must match the voucher tenant and branch';
  END IF;

  IF NEW."customerId" IS NOT NULL THEN
    SELECT "companyId" INTO related_company FROM "Customer" WHERE "id" = NEW."customerId";
    IF related_company IS DISTINCT FROM parent_entry."companyId" THEN
      RAISE EXCEPTION 'Journal line customer belongs to another tenant';
    END IF;
  END IF;
  IF NEW."supplierId" IS NOT NULL THEN
    SELECT "companyId" INTO related_company FROM "Supplier" WHERE "id" = NEW."supplierId";
    IF related_company IS DISTINCT FROM parent_entry."companyId" THEN
      RAISE EXCEPTION 'Journal line supplier belongs to another tenant';
    END IF;
  END IF;
  IF NEW."bankAccountId" IS NOT NULL THEN
    SELECT "companyId" INTO related_company FROM "BankAccount" WHERE "id" = NEW."bankAccountId";
    IF related_company IS DISTINCT FROM parent_entry."companyId" THEN
      RAISE EXCEPTION 'Journal line bank account belongs to another tenant';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "JournalEntryLine_scope_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "JournalEntryLine"
FOR EACH ROW EXECUTE FUNCTION enforce_journal_line_scope();

-- A voucher may enter POSTED only when at least two lines exist and database
-- sums exactly match balanced header totals.
CREATE OR REPLACE FUNCTION verify_journal_before_posting()
RETURNS trigger AS $$
DECLARE
  line_count INTEGER;
  debit_sum NUMERIC(19,4);
  credit_sum NUMERIC(19,4);
BEGIN
  IF NEW."status" = 'POSTED' AND OLD."status" <> 'POSTED' THEN
    SELECT COUNT(*), COALESCE(SUM("baseDebit"), 0), COALESCE(SUM("baseCredit"), 0)
      INTO line_count, debit_sum, credit_sum
      FROM "JournalEntryLine" WHERE "entryId" = NEW."id";
    IF line_count < 2 OR debit_sum <= 0 OR debit_sum <> credit_sum
       OR debit_sum <> NEW."totalDebit" OR credit_sum <> NEW."totalCredit" THEN
      RAISE EXCEPTION 'A posted journal requires at least two balanced lines matching header totals';
    END IF;
    IF NEW."approvedById" IS NULL OR NEW."postedById" IS NULL OR NEW."approvedAt" IS NULL OR NEW."postedAt" IS NULL THEN
      RAISE EXCEPTION 'Approval and posting metadata are required before posting';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "JournalEntry_posting_guard"
BEFORE UPDATE ON "JournalEntry"
FOR EACH ROW EXECUTE FUNCTION verify_journal_before_posting();

-- Posted vouchers cannot be deleted or edited. The only allowed update marks a
-- posted voucher REVERSED and records the authorized reversal metadata; the
-- reversing financial effect must be a separate linked voucher.
CREATE OR REPLACE FUNCTION protect_posted_journal()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."status" IN ('POSTED', 'REVERSED') THEN
    RAISE EXCEPTION 'Posted or reversed journals cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" = 'REVERSED' THEN
    RAISE EXCEPTION 'Reversed journals are immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" = 'POSTED' THEN
    IF NEW."status" <> 'REVERSED'
       OR NEW."reversedById" IS NULL OR NEW."reversedAt" IS NULL
       OR NEW."companyId" IS DISTINCT FROM OLD."companyId"
       OR NEW."branchId" IS DISTINCT FROM OLD."branchId"
       OR NEW."periodId" IS DISTINCT FROM OLD."periodId"
       OR NEW."voucherNumber" IS DISTINCT FROM OLD."voucherNumber"
       OR NEW."voucherDate" IS DISTINCT FROM OLD."voucherDate"
       OR NEW."postingDate" IS DISTINCT FROM OLD."postingDate"
       OR NEW."voucherType" IS DISTINCT FROM OLD."voucherType"
       OR NEW."narration" IS DISTINCT FROM OLD."narration"
       OR NEW."totalDebit" IS DISTINCT FROM OLD."totalDebit"
       OR NEW."totalCredit" IS DISTINCT FROM OLD."totalCredit" THEN
      RAISE EXCEPTION 'Posted journals are immutable; create a linked reversal voucher';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "JournalEntry_immutability_guard"
BEFORE UPDATE OR DELETE ON "JournalEntry"
FOR EACH ROW EXECUTE FUNCTION protect_posted_journal();
