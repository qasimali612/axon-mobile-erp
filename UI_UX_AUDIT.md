# AXON MOBILE ERP — UI/UX ARCHITECTURE & DESIGN AUDIT
**Date:** November 2026  
**Auditor:** Enterprise UI/UX Lead & Frontend Architect  

---

## 1. Design System & Principles

Axon Mobile ERP implements a high-density, business-focused enterprise interface inspired by SAP Business One and modern cloud financial platforms:
- **Palette**: Slate neutral foundation with Enterprise Blue (`#1d4ed8`) primary actions, Emerald (`#059669`) for positive financial/inventory movements, Amber (`#d97706`) for pending reviews, and Rose (`#e11d48`) for reversals and errors.
- **Typography**: Inter / system font with high-readability micro-type (`text-xs` / `text-sm`) and strict tabular numerals (`font-mono font-bold tabular-nums`) for currency amounts, quantities, and IMEIs.
- **Components**: Reusable Badges, Buttons, Modals, Empty States, Page Headers, and responsive Data Tables with sticky headers.
- **Print Layouts**: Clean, paper-optimized print styles for Invoices, Goods Receipts, Purchase Orders, Device Barcode Labels, and Payment Vouchers.

---

## 2. Page & Workspace Audit

### 2.1 Navigation & Shell Structure (`src/components/shell/erp-shell.tsx`)
- Sidebar organized into 8 logical groups:
  1. **Overview**: Executive Dashboard.
  2. **Operations**: Products Catalog, Inventory Balances, IMEI Registry, Stock Transfers, Adjustments, Stock Counts, Purchases, Goods Receiving, Sales Invoices, POS Counter, Returns, Assembly/BOM.
  3. **Parties**: Customers & Suppliers ledger.
  4. **Treasury & Finance**: Overview, Payments & Receipts, Accounts, Journals, Financial Statements, Trial Balance, Subledgers, Banking & Reconciliation, Fixed Assets, Incentives, Rebates, Budgets, Fiscal Periods.
  5. **Intelligence**: Reporting Hub, Operational Reports, Schedules.
  6. **Settings & Governance**: Users, Roles, Audit Trail, Company & Branch Settings, Numbering Sequences, Approval Policies.
- **Obsolete Roadmap Removal**: Verified that `/roadmap` is completely removed from navigation and returns 404.
- **Excluded Modules**: Verified that Warranty and Repair links are strictly absent.

### 2.2 Transaction & Document Workspaces
1. **Goods Receiving (`/goods-receipts/new`)**:
   - Header with supplier and warehouse selection.
   - Bulk IMEI paste modal with real-time format validation, dual-SIM slotting, and duplicate checking.
   - Direct and PO-linked receiving modes.
2. **Sales Invoices (`/sales`) & POS Counter (`/pos`)**:
   - High-speed barcode/IMEI scanner input with autofocus.
   - Live pricing resolution respecting minimum selling price floor.
   - Multi-tender payment (Cash, Bank, Card) with change calculation.
   - Thermal receipt and commercial invoice print buttons.
3. **Receipts & Payments (`/finance/payments`)**:
   - Newly upgraded executive register with search, direction and status filters, and aggregate KPI cards.
   - Detailed voucher preview modal with general ledger link and invoice allocations.
   - Dedicated print page `/finance/payments/[id]/print` with Code128 barcode, amount in words, and signature lines.
4. **IMEI Registry & Tracker (`/inventory/imei`)**:
   - One-phone-one-unit display.
   - Bulk IMEI audit and duplicate inspection modal.
   - Lifecycle drilldown drawer displaying complete custody history from GRN to Sale and Returns.
5. **Reporting Hub (`/reports`)**:
   - Categorized directory covering operational, inventory, financial, and party analytics.

---

## 3. UI/UX Identified Improvements
1. **Reporting Hub UI**: Upgrade the main `/reports` index page into a rich 12-category enterprise business intelligence dashboard with quick-search and filter pills.
2. **Expense Entry UX**: Provide a dedicated shortcut within Finance for operating expense recording (Rent, Utilities, Salaries) with pre-selected expense GL accounts.
