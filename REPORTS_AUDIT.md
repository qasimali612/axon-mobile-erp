# Comprehensive Audit of Reports & Analytics Module
**Project:** Mobile Phone Inventory Management ERP (Axon ERP)  
**Date:** October 31, 2026  
**Auditor:** Senior ERP Software Architect & Financial Systems Analyst  
**Scope:** Architecture, Data Sources, Endpoints, Permissions, Exports, Calculations, and Current Coverage

---

## 1. Executive Summary

This audit assesses the reporting, analytics, export, and printing capabilities of Axon ERP. The system operates on a dual operational and financial core:
- **Operational Layer:** Handles serialized device inventory (IMEI 1 & 2 per physical phone), purchase orders, goods receipt notes (GRN), sales invoices, stock returns, stock transfers, adjustments, and cycle counts.
- **Financial Layer:** Implements a double-entry General Ledger (GL) adhering to strict debit-credit balance, immutable posted vouchers, period closing locks, and dedicated sub-ledgers for customers, suppliers, banks, fixed assets, incentives, and rebates.

The current implementation provides a robust baseline foundation (including statement generation, operational register views, schedule runners, and raw CSV/PDF generators), but currently covers only **10 operational reports** and **4 financial statements/registers**, against the **182 enterprise report types** required for a full-scale mobile phone distribution and retail ERP.

---

## 2. Architecture & Data Source Audit

### 2.1 Database Architecture & Schema Integrity
The PostgreSQL / PGlite database is managed via Prisma (`prisma/schema.prisma`). Key reporting entities include:

| Domain | Core Models | Key Relationships & Integrity Constraints |
| :--- | :--- | :--- |
| **Inventory & IMEI** | `PhysicalStockUnit`, `DeviceIdentifier`, `StockBalance`, `InventoryMovement`, `InventoryReservation` | `DeviceIdentifier` links to `PhysicalStockUnit` with `slot` (1 or 2). A physical stock unit is strictly **1 item** regardless of dual-SIM/dual-IMEI. `StockBalance` tracks warehouse-level on-hand balances. `InventoryMovement` provides the immutable perpetual inventory ledger. |
| **Purchasing** | `PurchaseOrder`, `PurchaseOrderLine`, `PurchaseReceipt`, `PurchaseReceiptLine`, `PurchaseReceiptUnit` | Three-way matching structure: Orders $\rightarrow$ Receipts (GRNs) $\rightarrow$ Invoices. Physical units and IMEIs are captured at GRN acceptance. Direct purchases post GRNs and inventory movements atomically. |
| **Sales & POS** | `SalesInvoice`, `SalesInvoiceLine`, `SalesInvoiceUnit` | Lines record quantity, selling price, discounts, tax, and landed cost total (`costTotal`). `SalesInvoiceUnit` links sold `PhysicalStockUnit` records. Gross profit is captured at line level (`lineTotal - taxAmount - costTotal`). |
| **Returns & Reversals** | `StockReturn`, `StockReturnLine`, `StockReturnUnit` | Reversible operational flows for customer and supplier returns with disposition tracking (RESTOCK, DEFECTIVE, SCRAP). |
| **Financial Ledger** | `Account`, `AccountGroup`, `JournalEntry`, `JournalEntryLine`, `FiscalYear`, `AccountingPeriod` | Fully balanced double-entry accounting. Lines link to party dimensions (`customerId`, `supplierId`, `bankAccountId`, `salespersonId`). Balances are computed from posted and reversed journals. |
| **Cash & Banking** | `BankAccount`, `BankTransaction`, `BankStatement`, `BankStatementLine`, `BankReconciliation` | Real-time bank transaction ledger with deposit/withdrawal tracking and cash flow categorization (OPERATING, INVESTING, FINANCING). |
| **Subledgers** | `Customer`, `Supplier`, `FixedAsset`, `IncentivePlan`, `RebateProgram`, `Budget` | Dedicated domain tables reconciling directly against GL control accounts (`11200 Accounts Receivable`, `21100 Accounts Payable`, etc.). |

---

## 3. Existing Reports Inventory

### 3.1 Operational Reports (`/api/reports/operations`)
Located in `src/app/api/reports/operations/route.ts` and rendered via `src/components/reports/operations-report-workspace.tsx`:

| Key | Title | Data Source | Metrics Computed | Limitations |
| :--- | :--- | :--- | :--- | :--- |
| `purchase-orders` | Purchase Orders | `PurchaseOrderLine` | Ordered, Received, Outstanding, Unit Cost, Tax, Line Total | Line-level only; no supplier performance or daily/monthly grouping. |
| `goods-receipts` | Goods Receipts (GRN) | `PurchaseReceiptLine`, `PurchaseReceiptUnit` | Accepted, Rejected, Landed Cost, Line Total, IMEIs | Limited to 1,000 rows; lacks supplier return link and quality analytics. |
| `purchase-returns` | Purchase Returns | `StockReturnLine` | Quantity, Disposition, Supplier Credit, Cost, IMEIs | Merged endpoint with sales returns; lacks category/brand aggregation. |
| `sales` | Sales Transactions | `SalesInvoiceLine` | Quantity, Net Revenue, Tax, Total, IMEIs | Flat list; lacks salesperson aggregation, payment method details, and channel splitting. |
| `sales-returns` | Sales Returns | `StockReturnLine` | Quantity, Customer Credit, Disposition, IMEIs | Flat table without customer return rate metrics. |
| `inventory` | Stock Balances | `StockBalance`, `InventoryReservation` | On-hand, Reserved, Available, Valuation, Average Cost | Warehouse-variant balance; lacks aging, brand/model rollups, and discontinued product flags. |
| `devices` | Physical Units / IMEIs | `PhysicalStockUnit`, `DeviceIdentifier` | Status, Branch, Warehouse, Acquisition Cost, Sold Date | Displays current status only; lacks full chronological movement lifecycle history. |
| `movements` | Movement Ledger | `InventoryMovement` | Posting date, Movement type, Source doc, Quantity, Cost | Linear log; no opening/closing balance roll-forward calculation. |
| `profitability` | Profit by Line | `SalesInvoiceLine` | Revenue, Landed Cost, Gross Profit, Margin % | Line-level margin only; does not factor operating expenses for net profit. |
| `reorder` | Reorder Suggestions | `ProductVariant`, `StockBalance`, `SupplierItem` | On-hand, Reorder level, Shortfall, Suggested order qty, Preferred supplier | Static reorder calculation; no lead-time demand forecasting. |

### 3.2 Financial Reports (`/api/finance/reports/*` & `/finance/*`)
Located in `src/lib/finance/reports.ts`:

| Report | Endpoint / Route | Source Tables | Accuracy & Verification |
| :--- | :--- | :--- | :--- |
| **Profit & Loss** | `/api/finance/reports/statements` | `JournalEntryLine`, `Account` (REVENUE, COGS, EXPENSE) | Verified via `scripts/verify-reporting-acceptance.ts`. Accurately computes Gross Profit and Net Profit from posted journal lines. |
| **Balance Sheet** | `/api/finance/reports/statements` | `JournalEntryLine`, `Account` (ASSET, LIABILITY, EQUITY) | Reconciles assets against liabilities + equity + cumulative earnings. Reconciles to $\pm 0.0001$. |
| **Cash Flow Statement** | `/api/finance/reports/statements` | `BankTransaction`, `JournalEntry` | Groups flows into OPERATING, INVESTING, FINANCING based on voucher metadata. |
| **Trial Balance** | `/api/finance/reports/trial-balance` | `JournalEntryLine`, `Account` | Full roll-forward: Opening Debit/Credit + Period Debit/Credit = Closing Debit/Credit. Total debit equals total credit. |
| **Subledgers (Party Statements)** | `/finance/subledgers` | `JournalEntryLine`, `Customer`, `Supplier` | Reconciles party balances and aging buckets against AR/AP control accounts. |
| **Bank Reconciliation** | `/finance/banking` | `BankStatementLine`, `BankTransaction` | Reconciles cleared statement lines against ledger transactions. |

---

## 4. Security, Access Controls & Company Isolation

### 4.1 Company & Branch Scoping
- All reporting queries enforce `where: { companyId: context.company.id }`.
- Scoped users are restricted via `permittedDocumentScopes(context, permission)`, injecting branch and warehouse restrictions (`branchFilter`, `unitScopes`).
- Cross-company data contamination is strictly prevented at the ORM/database level.

### 4.2 Permission Enforcement
Current permission mapping in `src/lib/permissions.ts`:
- `report.inventory` $\rightarrow$ Stock, devices, movements
- `report.purchase` $\rightarrow$ POs, GRNs, purchase returns, reorder
- `report.sales` $\rightarrow$ Sales, sales returns
- `report.profitability` $\rightarrow$ Profit by line (gates cost figures)
- `FINANCIAL_REPORTS_VIEW` $\rightarrow$ P&L, Balance Sheet, Cash Flow, Trial Balance
- `FINANCIAL_REPORTS_EXPORT` $\rightarrow$ Audited CSV export of statements and registers
- `audit.view`, `audit.export` $\rightarrow$ Audit trail access

### 4.3 Sensitive Cost Protection
- In operational reports, `unitCost`, `landedUnitCost`, `acquisitionCost`, and `marginPercent` are gated by `canViewCost`.
- Users lacking cost permissions receive `null` ("Restricted"), preventing unauthorized margin leaks on frontend tables and CSV exports.

---

## 5. Export, Print & Document Generation

1. **CSV Export:**
   - Server-side generated with UTF-8 Byte Order Mark (`\uFEFF`) for proper display in Microsoft Excel.
   - Values are CSV-escaped and formula-injection guarded (`^[=+\-@]`).
   - Appends an immutable audit event (`OPERATIONAL_REPORT_EXPORTED`, `FINANCIAL_STATEMENTS_EXPORTED`, `FINANCE_REGISTER_EXPORTED`) with row count, period, and actor ID.
2. **PDF Generation:**
   - Single-pass native PDF generator (`src/lib/pdf/simple-pdf.ts`) producing A4 output without heavy Chromium dependencies.
   - Text encoding transliterates non-Latin characters to preserve numeric and identifier integrity.
3. **Thermal Printing & Barcode Labels:**
   - Dedicated 80 mm POS receipt view (`/sales/:id/receipt`).
   - Sized 50 × 25 mm Code128 barcode label generator (`/inventory/labels`) powered by `bwip-js`.
4. **Scheduled Exports:**
   - `ReportSchedule` model supports DAILY, WEEKLY, and MONTHLY cadences.
   - Executed headless via `npm run reports:run-schedules`, writing output files to `exports/` without in-memory timer leaks.

---

## 6. Identified Deficiencies & Architectural Bottlenecks

1. **Lack of Multi-Dimensional Aggregation:**
   - Operational reports fetch raw lines (up to 1,000) and perform basic client-side array reduction. Large datasets suffer truncation warnings.
   - Missing SQL `GROUP BY` rollups for executive, daily, monthly, supplier-wise, product-wise, and salesperson-wise summaries.
2. **IMEI Lifecycle Fragmentation:**
   - `devices` report only shows current status and current warehouse.
   - Does not stitch together the end-to-end journey: Purchase GRN $\rightarrow$ Quality Inspection $\rightarrow$ Stock Transfer $\rightarrow$ POS Sale $\rightarrow$ Customer Return $\rightarrow$ Supplier RTV.
3. **Absence of Dedicated Business Analytics:**
   - No Executive Summary, Revenue Growth, Top Selling, Slow Moving, or Non-Moving stock reports.
   - Gross vs Net profit requires cross-referencing operational sales with financial expense journals.
4. **Filter Inflexibility:**
   - Hardcoded filter panel in `operations-report-workspace.tsx` does not support Brand, Model, Color, Variant, Customer, Supplier, or Salesperson filters.
5. **No Excel (.xlsx) Native Generation:**
   - Exports are plain CSV. Formatted multi-tab or styled `.xlsx` spreadsheets are missing.
6. **Roadmap Navigation Clutter:**
   - Legacy `/roadmap` page and navigation links remain exposed in the shell (`http://localhost:3000/roadmap`), which the user specifically requested to remove.

