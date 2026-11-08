# Master Implementation Plan: Complete Enterprise Reporting Module
**Project:** Mobile Phone Inventory Management ERP (Axon ERP)  
**Date:** October 31, 2026  
**Architect:** Senior ERP Software Architect & Financial Systems Analyst  
**Version:** 1.0.0 (Execution Architecture)

---

## 1. Architectural Strategy & Guiding Principles

To deliver all 182 required enterprise reports across 12 modules without rebuilding existing features, destabilizing working workflows, or creating duplicate database models, we implement a **Modular High-Performance Reporting Architecture**:

1. **Leverage Existing Database Models & Migrations:**
   - Zero destructive schema migrations.
   - Utilize existing indexed relations (`PhysicalStockUnit`, `DeviceIdentifier`, `StockBalance`, `InventoryMovement`, `SalesInvoiceLine`, `PurchaseReceiptLine`, `JournalEntryLine`).
2. **Server-Side Aggregation & Parameterized Queries:**
   - Execute all grouping, sums, and running balances directly in PostgreSQL / Prisma.
   - Avoid client-side computation of accounting and margin figures.
   - Strictly enforce company, branch, and warehouse isolation at query construction.
3. **Unified Enterprise Report Engine:**
   - Reusable query builder supporting report-specific filters, fast date presets, server pagination, sorting, and drill-down links.
4. **Strict Financial & IMEI Integrity:**
   - 1 `PhysicalStockUnit` = 1 physical phone. IMEI 1 & IMEI 2 belong to the same handset.
   - Double-entry GL rules: $\sum \text{Debit} = \sum \text{Credit}$.
   - All profit metrics derived from true landed inventory cost (`costTotal`).
5. **Multi-Format Export & Print Parity:**
   - Fast server-side CSV with UTF-8 BOM.
   - Direct Excel spreadsheet generation.
   - Server-side PDF generation (`src/lib/pdf/simple-pdf.ts`) and CSS print styling.
   - Full audit logging on every export and generation.
6. **Elimination of Legacy Clutter:**
   - Remove legacy `/roadmap` route and sidebar references as instructed.

---

## 2. Phased Execution Roadmap

### Stage 1: System Audit & Gap Documentation (Completed)
- Completed `REPORTS_AUDIT.md` (existing state, data sources, security, calculations).
- Completed `REPORTS_GAP_ANALYSIS.md` (comprehensive 182-report gap matrix).
- Completed `REPORTS_IMPLEMENTATION_PLAN.md` (this architectural roadmap).

### Stage 2: Navigation Clean-up & Shared Filter Infrastructure
- Clean up `/roadmap` route and sidebar navigation link in `src/components/shell/erp-shell.tsx`.
- Create a shared **Report Filter & Dimension Engine** in `src/lib/reports/dimensions.ts`:
  - Date preset resolver (Today, Yesterday, This Week, Last Week, This Month, Last Month, This Quarter, Last Quarter, This Year, Custom).
  - Multi-entity lookup loader (Companies, Branches, Warehouses, Categories, Brands, Models, Colors, Variants, Salespeople, Customers, Suppliers, Payment Methods).
  - Validation schemas (Zod) with strict type-safety.

### Stage 3: Enterprise Report Services — Core Operations & Serialized Devices
Implement high-performance server query services:
1. **Executive & Business Analytics Service (`src/lib/reports/executive.ts`):**
   - Executive Summary, Daily / Monthly / Yearly summaries, Revenue & Growth, Branch & Warehouse performance, Top / Slow / Non-moving products.
2. **Inventory & Valuation Service (`src/lib/reports/inventory.ts`):**
   - Current stock, Brand / Model / Color / Storage-RAM breakdowns, Inventory aging buckets (0-30, 31-60, 61-90, 91-180, 180+), Stock ledger with running balance, Transfers, Adjustments, Stock Count variances.
3. **IMEI & Serialized Device Service (`src/lib/reports/devices.ts`):**
   - Complete IMEI registry, Available, Sold, Received, Transferred, Duplicate detection audit, Luhn algorithm invalid IMEI audit, Complete device lifecycle movement history, IMEI-to-StockBalance reconciliation.
4. **Purchase Analytics Service (`src/lib/reports/purchases.ts`):**
   - Purchase register, Supplier-wise, Product-wise, Brand-wise, Daily / Monthly spend, Purchase price trend history, Goods received vs pending.
5. **Sales & Margin Analytics Service (`src/lib/reports/sales.ts`):**
   - Sales register, Daily / Weekly / Monthly / Yearly sales, Customer-wise, Product / Brand / Model-wise, Salesperson-wise, Channel breakdown (Wholesale vs Retail vs Dealer), Discount override audit, Margin profitability.

### Stage 4: Enterprise Report Services — Parties, Finance, Banking & Ledgers
1. **Customer & Supplier Subledger Service (`src/lib/reports/parties.ts`):**
   - Customer & Supplier lists, Statements of account, Running subledgers, Aging analysis (0-30, 31-60, 61-90, 90+ days), Payment histories, Customer profitability, Credit & advance balances.
2. **General Ledger & Financial Accounting Service (`src/lib/reports/accounting.ts`):**
   - General Ledger account drilldown with running balance, Chart of Accounts, Trial Balance, Profit & Loss, Balance Sheet, Cash Flow Statement, Journal entry register, Operating expense itemization, Revenue reconciliation, Unposted & Reversed transaction audits.
3. **Cash & Bank Ledger Service (`src/lib/reports/banking.ts`):**
   - Cash Book, Bank Book, Cash & Bank transaction registers, Bank reconciliation statement, Unreconciled transaction list, Cash flow summary, Daily POS cash closing register.
4. **Fixed Assets, Incentives & Rebates Service (`src/lib/reports/registers.ts`):**
   - Fixed asset register with depreciation schedules, Asset acquisitions, Disposals with net gain/loss, Sales incentive calculation & payable reports, Received manufacturer incentives, Customer & supplier rebate ledgers.

### Stage 5: Modern Enterprise UI/UX & Drill-Down Engine
- Upgrade `/reports` into an **Enterprise Reporting Hub**:
  - Organized by 12 functional categories (A through L).
  - Real-time report search, category pills, and favorites.
  - Permission-based visibility.
- Build a standardized **Enterprise Report Viewer Component** (`src/components/reports/enterprise-report-viewer.tsx`):
  - Compact SAP Business One-inspired layout.
  - Collapsible contextual filter bar (only shows relevant filters for the active report).
  - Summary KPI cards (Total Qty, Total Amount, Net Margin, Record Count).
  - Server-paginated, sortable data table with column visibility toggling.
  - Clickable drilldown links:
    - Click Customer $\rightarrow$ Customer Ledger
    - Click Supplier $\rightarrow$ Supplier Ledger
    - Click IMEI $\rightarrow$ IMEI Movement History modal
    - Click Product $\rightarrow$ Stock Ledger
    - Click Account $\rightarrow$ General Ledger statement
    - Click Voucher $\rightarrow$ Journal Entry / Source Document print view

### Stage 6: Export, Printing & Multi-Format Generators
- Fast server-side CSV with UTF-8 BOM for all 182 reports.
- Structured Excel (.xlsx) file generation using clean XML spreadsheet package or `fflate` streaming.
- Professional Server-side PDF export with company letterhead, applied filter metadata, page numbers ("Page X of Y"), and double-underline financial totals.
- Native CSS print view optimized for A4 landscape / portrait.
- Audited export tracking (`AuditLog`).

### Stage 7: Automated Reconciliation & Acceptance Testing
- Unit and integration tests in `scripts/verify-enterprise-reports.ts`:
  - Date boundary accuracy and timezone consistency.
  - Multi-company and branch data isolation.
  - IMEI reconciliation: Assert IN_STOCK physical units == StockBalance quantity.
  - GL reconciliation: Assert Trial Balance $\sum \text{Debit} = \sum \text{Credit}$.
  - Subledger reconciliation: Assert Customer aging sum == GL Account `11200` balance.
  - Cost visibility permission gates: Assert non-authorized users receive `null` / "Restricted" for cost and margin columns.

---

## 3. Technical Risk Matrix & Mitigation Controls

| Technical Risk | Impact | Preventative Architecture & Mitigation |
| :--- | :--- | :--- |
| **High Query Latency on Large Datasets** | Slow report loading, DB connection starvation | Enforce indexed column filtering (`companyId`, `postingDate`, `productId`, `warehouseId`). Implement server-side pagination with default `take: 50` and indexed cursor or fast offset limits. Use SQL aggregations rather than loading full row arrays into memory. |
| **IMEI Overcounting (Dual-SIM Devices)** | Distorted stock quantities and asset values | Never aggregate `DeviceIdentifier` counts. Always query `PhysicalStockUnit` or `StockBalance` for physical quantities, joining identifiers as an array relation. |
| **Financial Imbalance in Dynamic Reports** | Inaccurate P&L or Balance Sheet | Exclude unposted drafts from financial totals unless explicitly running the Unposted Transactions Audit. Verify accounting equation $\text{Assets} = \text{Liabilities} + \text{Equity} + \text{Earnings}$ in every statement response. |
| **Data Leaks Across Tenants or Branches** | Security and compliance violation | Strictly inject session company ID and permitted branch/warehouse scopes into every Prisma query `where` clause. Validate user roles both in API route handlers and server components. |
| **Cost & Margin Exposure to Retail Staff** | Commercial confidentiality breach | Redact `unitCost`, `landedUnitCost`, `costTotal`, and `grossProfit` at the database projection / serialization layer when the user lacks `report.profitability` or `catalog.cost.view`. |

---

## 4. Deliverables Checklist

- [x] Phase 1: Complete System & Existing Codebase Audit (`REPORTS_AUDIT.md`)
- [x] Phase 1: Comprehensive 182-Report Gap Analysis (`REPORTS_GAP_ANALYSIS.md`)
- [x] Phase 1: Implementation & Architectural Execution Plan (`REPORTS_IMPLEMENTATION_PLAN.md`)
- [ ] Phase 2: Removal of obsolete `/roadmap` route and shell link
- [ ] Phase 3: Global filter engine and dimension lookup provider
- [ ] Phase 4: Core Operational, Inventory, IMEI, Purchase, and Sales services
- [ ] Phase 5: Finance, Subledger, Cash/Bank, Expense, and Register services
- [ ] Phase 6: Enterprise UI viewer with drill-downs, pagination, and column visibility
- [ ] Phase 7: Multi-format exports (CSV, XLSX, PDF) and print stylesheets
- [ ] Phase 8: Comprehensive test suite and reconciliation verification

