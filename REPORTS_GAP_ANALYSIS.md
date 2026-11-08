# Enterprise Reports Gap Analysis
**Project:** Mobile Phone Inventory Management ERP (Axon ERP)  
**Date:** October 31, 2026  
**Status:** Audit Complete | Implementation Roadmap Defined

---

## 1. Overview & Methodology

This gap analysis compares the **182 Enterprise Report Specifications** required across 12 distinct functional modules against the currently implemented endpoints and UI components in Axon ERP.

Every gap is mapped to:
1. **Target Report Name**
2. **Current System State** (Existing, Incomplete, or Missing)
3. **Primary Data Source & Relationships** in Prisma Schema
4. **Required Aggregations & Calculation Logic**
5. **Technical Constraints & Reconciliation Rules**

---

## 2. Detailed Gap Matrix by Functional Module

### Module A: Executive & Business Reports (18 Reports)

| # | Report Name | Current Status | Primary Data Source | Calculation & Aggregation Rules |
| :--- | :--- | :--- | :--- | :--- |
| A1 | **Executive Summary** | Incomplete (dashboard only) | `SalesInvoice`, `JournalEntryLine`, `StockBalance` | High-level KPI rollup: Revenue, COGS, Gross Profit, OPEX, Net Profit, Inventory Valuation, Cash/Bank. |
| A2 | **Daily Business Summary** | Missing | `SalesInvoice`, `PurchaseReceipt`, `BankTransaction` | Daily grouping: Invoiced Sales, Cash Collections, Direct Purchases, Returns, Net Cash Flow. |
| A3 | **Monthly Business Summary** | Missing | `SalesInvoice`, `JournalEntryLine`, `StockBalance` | Monthly trend: Revenue vs Budget, Margin %, Inventory Turn, Working Capital. |
| A4 | **Yearly Business Summary** | Missing | `JournalEntryLine`, `FiscalYear` | Multi-year comparative analysis across audited fiscal periods. |
| A5 | **Sales Performance Summary** | Missing | `SalesInvoice`, `Customer`, `Salesperson` | Sales volume, order frequency, average basket size, discount rate by salesperson and branch. |
| A6 | **Purchase Performance Summary**| Missing | `PurchaseReceipt`, `PurchaseOrder`, `Supplier` | Order fulfillment rate, lead time, landed cost variances, supplier return rates. |
| A7 | **Gross Profit Summary** | Incomplete (line-level only) | `SalesInvoiceLine` | Revenue minus Landed Cost grouped by Brand, Category, Warehouse, and Channel. |
| A8 | **Net Profit Summary** | Incomplete (financial only) | `JournalEntryLine` | Operating Gross Profit minus allocated overheads (selling, administrative, financial). |
| A9 | **Revenue Analysis** | Missing | `SalesInvoiceLine`, `ProductVariant` | Revenue breakdown by device storage tier, brand, retail vs wholesale price list. |
| A10 | **Business Growth Analysis** | Missing | `SalesInvoiceLine`, `JournalEntryLine` | Month-over-Month (MoM) and Year-over-Year (YoY) percentage delta calculations. |
| A11 | **Branch Performance** | Missing | `Branch`, `SalesInvoice`, `StockBalance` | Comparative P&L, stock turnover, and transaction velocity across branches. |
| A12 | **Warehouse Performance** | Missing | `Warehouse`, `InventoryMovement`, `StockBalance` | Receiving throughput, dispatch speed, dead stock ratio, cycle count accuracy. |
| A13 | **Product Performance** | Missing | `Product`, `SalesInvoiceLine`, `StockBalance` | Velocity, margin contribution, stock days-of-supply per master product. |
| A14 | **Top Selling Products** | Missing | `SalesInvoiceLine`, `ProductVariant` | Top $N$ ranking by revenue, quantity sold, and gross profit generation. |
| A15 | **Slow Moving Products** | Missing | `ProductVariant`, `InventoryMovement` | Items with $>60$ days since last sale but positive stock balance. |
| A16 | **Non-Moving Products** | Missing | `ProductVariant`, `InventoryMovement` | Dead stock: zero outward movements in $>90$ or $>180$ days. |
| A17 | **Low Stock Products** | Incomplete (as `reorder`) | `ProductVariant`, `StockBalance`, `Product` | Real-time shortfall against `reorderLevel` and safety stock thresholds. |
| A18 | **Business Transaction Summary**| Missing | `AuditLog`, `SalesInvoice`, `PurchaseReceipt` | Holistic document count and status breakdown across all operational workflows. |

---

### Module B: Inventory Reports (21 Reports)

| # | Report Name | Current Status | Primary Data Source | Calculation & Aggregation Rules |
| :--- | :--- | :--- | :--- | :--- |
| B1 | **Current Stock Report** | Existing (`inventory`) | `StockBalance`, `ProductVariant` | Real-time on-hand, reserved, and available stock per warehouse. |
| B2 | **Stock Overview** | Missing | `StockBalance`, `Product` | Company-wide aggregated stock summary rolled up from all locations. |
| B3 | **Stock by Product** | Missing | `StockBalance`, `Product` | Aggregated at parent Product model level across all variants. |
| B4 | **Stock by Brand** | Missing | `StockBalance`, `Brand` | Quantity and total valuation grouped by manufacturer (Apple, Samsung, Xiaomi, etc.). |
| B5 | **Stock by Model** | Missing | `StockBalance`, `Product.model` | Grouped by commercial device model (e.g. iPhone 15 Pro, Galaxy S24). |
| B6 | **Stock by Color** | Missing | `StockBalance`, `ProductVariant.color` | Color-specific inventory balances across active variants. |
| B7 | **Stock by Storage/RAM Variant** | Missing | `ProductVariant.storageGb`, `ramGb` | Storage-tier breakdown (128GB, 256GB, 512GB, 1TB) for mobile device planning. |
| B8 | **Stock by Warehouse** | Existing (filtered) | `StockBalance`, `Warehouse` | Location-specific inventory breakdown. |
| B9 | **Stock by Branch** | Existing (filtered) | `StockBalance`, `Branch` | Multi-warehouse rollup to parent retail or wholesale branch. |
| B10 | **Stock Valuation Report** | Incomplete (raw value only) | `StockBalance`, `Product.costingMethod` | FIFO and Weighted Average cost breakdown reconciled with GL Account `11300`. |
| B11 | **Stock Movement Report** | Existing (`movements`) | `InventoryMovement` | Granular log of all stock transactions with document linkage. |
| B12 | **Stock Ledger** | Missing | `InventoryMovement`, `StockBalance` | Chronological running balance: Opening + In - Out $\pm$ Adjustments = Closing. |
| B13 | **Stock Transfer Report** | Missing | `StockTransfer`, `StockTransferLine` | Inter-branch and inter-warehouse shipments with transit status. |
| B14 | **Stock Adjustment Report** | Missing | `StockAdjustment`, `StockAdjustmentLine` | Variance write-offs, gains, damage adjustments, and posting vouchers. |
| B15 | **Physical Stock Count Report** | Missing | `StockCount`, `StockCountLine` | Cycle count variances: Book quantity vs Scanned quantity, valuation difference. |
| B16 | **Inventory Aging Report** | Missing | `PhysicalStockUnit`, `InventoryLot` | Aging buckets: 0-30, 31-60, 61-90, 91-180, 180+ days from acquisition date. |
| B17 | **Inventory Inward Report** | Missing | `InventoryMovement` (RECEIPT, RETURN, ADJUST_IN) | Total inward volume by vendor, transfer origin, or production completion. |
| B18 | **Inventory Outward Report** | Missing | `InventoryMovement` (SALE, TRANSFER_OUT) | Total outward consumption, POS sales, and wholesale dispatches. |
| B19 | **Reserved Stock Report** | Incomplete (aggregated in `inventory`) | `InventoryReservation` | Active e-commerce, quotation, or layaway reservations with expiry dates. |
| B20 | **Negative Stock Exception Report**| Missing | `StockBalance` | Exception query checking for any invalid $\le 0$ quantities violating ERP policies. |
| B21 | **Discontinued Product Stock** | Missing | `ProductVariant`, `Product.status` | Residual stock for ARCHIVED or DISCONTINUED models requiring liquidation. |

---

### Module C: IMEI & Serialized Device Reports (14 Reports)

> **Fundamental ERP Principle:** 1 `PhysicalStockUnit` represents 1 physical handset. Dual-SIM devices carry IMEI 1 (Slot 1) and IMEI 2 (Slot 2). Reporting must NEVER count IMEI 1 and IMEI 2 as two units of stock.

| # | Report Name | Current Status | Primary Data Source | Calculation & Aggregation Rules |
| :--- | :--- | :--- | :--- | :--- |
| C1 | **Complete IMEI Registry** | Existing (`devices`) | `PhysicalStockUnit`, `DeviceIdentifier` | Full list of serialized units with associated IMEI 1, IMEI 2, and Serial Number. |
| C2 | **Available IMEI Report** | Missing | `PhysicalStockUnit` (`status = IN_STOCK`) | Filterable list of sellable handsets ready in inventory. |
| C3 | **Sold IMEI Report** | Missing | `PhysicalStockUnit` (`status = SOLD`), `SalesInvoice` | Sold handsets with customer name, invoice number, and sale date. |
| C4 | **Received IMEI Report** | Missing | `PhysicalStockUnit`, `PurchaseReceipt` | Newly received devices with GRN number, supplier, and landed cost. |
| C5 | **Transferred IMEI Report** | Missing | `StockTransferUnit`, `StockTransfer` | Serialized units currently in transit or transferred between locations. |
| C6 | **IMEI Status Report** | Missing | `PhysicalStockUnit.status` | Count and percentage breakdown: IN_STOCK, SOLD, RESERVED, DEFECTIVE, RETURNED. |
| C7 | **Duplicate IMEI Detection Report**| Missing | `DeviceIdentifier` | Integrity audit checking for normalized duplicate IMEIs across active stock. |
| C8 | **Invalid IMEI Report** | Missing | `DeviceIdentifier` | Luhn algorithm verification audit detecting corrupted or non-standard IMEIs. |
| C9 | **IMEI Movement History** | Missing | `InventoryMovement.stockUnitId` | Complete chronological timeline for a specific IMEI: GRN $\rightarrow$ Transfer $\rightarrow$ POS $\rightarrow$ Return. |
| C10 | **IMEI by Product Model** | Missing | `PhysicalStockUnit`, `Product` | Breakdown of serialized physical units grouped by model. |
| C11 | **IMEI by Warehouse** | Existing (filtered) | `PhysicalStockUnit`, `Warehouse` | On-shelf serialized unit listing per warehouse location/bin. |
| C12 | **IMEI by Purchase Invoice** | Missing | `PurchaseReceiptUnit`, `PurchaseReceipt` | Drilldown of all IMEIs received under a specific supplier GRN/invoice. |
| C13 | **IMEI by Sales Invoice** | Missing | `SalesInvoiceUnit`, `SalesInvoice` | Drilldown of all IMEIs dispatched on a specific customer invoice. |
| C14 | **IMEI Reconciliation Report** | Missing | `PhysicalStockUnit` vs `StockBalance` | Strict mathematical assertion: Total IN_STOCK units must exactly equal `StockBalance.quantity`. |

---

### Module D: Purchase Reports (16 Reports)

| # | Report Name | Current Status | Primary Data Source | Calculation & Aggregation Rules |
| :--- | :--- | :--- | :--- | :--- |
| D1 | **Purchase Register** | Incomplete (`purchase-orders`) | `PurchaseReceipt`, `PurchaseOrder` | Chronological listing of all procurement documents with status and totals. |
| D2 | **Purchase Invoice Report** | Incomplete (`goods-receipts`) | `PurchaseReceipt`, `Supplier` | Verified vendor invoices, gross amount, tax breakdown, landed costs. |
| D3 | **Purchase Return Report** | Existing (`purchase-returns`) | `StockReturn` (`returnType = PURCHASE_RETURN`) | Returns to vendors (RTV), supplier debit notes, returned IMEI list. |
| D4 | **Purchase Summary** | Missing | `PurchaseReceipt` | Period aggregations: Total items received, total landed spend, tax paid. |
| D5 | **Daily Purchase Report** | Missing | `PurchaseReceipt` | Daily spend and receiving volume trend. |
| D6 | **Monthly Purchase Report** | Missing | `PurchaseReceipt` | Monthly procurement trends and supplier allocations. |
| D7 | **Supplier-wise Purchase Report**| Missing | `PurchaseReceipt`, `Supplier` | Total spend, volume, and discount share per vendor. |
| D8 | **Product-wise Purchase Report** | Missing | `PurchaseReceiptLine`, `Product` | Purchased quantities and weighted average purchasing costs per item. |
| D9 | **Brand-wise Purchase Report** | Missing | `PurchaseReceiptLine`, `Brand` | Procurement volume grouped by brand. |
| D10 | **Warehouse-wise Purchase Report**| Missing | `PurchaseReceipt`, `Warehouse` | Receipts segmented by destination warehouse. |
| D11 | **Purchase Price History** | Missing | `PurchaseReceiptLine`, `SupplierItem` | Historical cost trend for each SKU across successive purchase receipts. |
| D12 | **Purchase Cost Analysis** | Missing | `PurchaseReceiptLine` | Analysis of base unit cost vs freight, customs, and landed cost additions. |
| D13 | **Goods Received Report** | Existing (`goods-receipts`) | `PurchaseReceipt` | Operational inspection report of received shipments. |
| D14 | **Pending Receiving Report** | Incomplete (in `purchase-orders`) | `PurchaseOrderLine` | Ordered vs received shortfall: $Q_{\text{ordered}} - Q_{\text{received}} > 0$. |
| D15 | **Purchase Cancellation Report**| Missing | `PurchaseOrder` (`status = CANCELLED`) | Cancelled procurement orders and recorded cancellation reasons. |
| D16 | **Purchase Tax Summary** | Missing | `PurchaseReceiptLine`, `TaxRule` | Input VAT/tax collected on procurement for statutory tax filing. |

---

### Module E: Sales Reports (21 Reports)

| # | Report Name | Current Status | Primary Data Source | Calculation & Aggregation Rules |
| :--- | :--- | :--- | :--- | :--- |
| E1 | **Sales Register** | Incomplete (`sales`) | `SalesInvoice`, `Customer` | Comprehensive register of all sales invoices with payment & posting state. |
| E2 | **Sales Invoice Report** | Existing (`sales`) | `SalesInvoiceLine` | Line-item invoice detail with taxes, discounts, and customer codes. |
| E3 | **Sales Return Report** | Existing (`sales-returns`) | `StockReturn` (`returnType = SALES_RETURN`) | Customer credit notes, restocked units, scrap dispositions. |
| E4 | **Daily Sales Report** | Missing | `SalesInvoice` | Daily revenue, tax, cash collections, and credit sales. |
| E5 | **Weekly Sales Report** | Missing | `SalesInvoice` | Week-by-week sales run-rate and volume trends. |
| E6 | **Monthly Sales Report** | Missing | `SalesInvoice` | Monthly commercial revenue against targets. |
| E7 | **Yearly Sales Report** | Missing | `SalesInvoice` | Annual historical performance by quarter and month. |
| E8 | **Customer-wise Sales** | Missing | `SalesInvoice`, `Customer` | Revenue, order count, and gross profit by customer account. |
| E9 | **Product-wise Sales** | Missing | `SalesInvoiceLine`, `Product` | Units sold, gross sales, discounts, net sales, and average selling price. |
| E10 | **Brand-wise Sales** | Missing | `SalesInvoiceLine`, `Brand` | Market share and margin contribution by brand. |
| E11 | **Model-wise Sales** | Missing | `SalesInvoiceLine`, `Product.model` | Model-specific sales ranking (e.g. iPhone 15 vs 15 Plus). |
| E12 | **Salesperson-wise Sales** | Missing | `SalesInvoice`, `User` | Commissionable sales, volume, and margin achieved per sales agent. |
| E13 | **Branch-wise Sales** | Missing | `SalesInvoice`, `Branch` | Outlet and branch retail revenue comparison. |
| E14 | **Warehouse-wise Sales** | Missing | `SalesInvoice`, `Warehouse` | Fulfillment location throughput. |
| E15 | **Wholesale Sales Report** | Missing | `SalesInvoice`, `Customer` (`type = WHOLESALE`) | B2B bulk transactions and credit term utilization. |
| E16 | **Retail Sales Report** | Missing | `SalesInvoice`, `Customer` (`type = RETAIL`) | POS walk-in and counter retail transactions. |
| E17 | **Dealer Sales Report** | Missing | `SalesInvoice`, `Customer` (`type = DEALER`) | Distribution tier sales, volume rebates, and dealer pricing. |
| E18 | **Sales Discount Report** | Missing | `SalesInvoiceLine`, `AuditLog` | Promotional discounts, manual overrides, and approval policy logs. |
| E19 | **Sales Tax Report** | Missing | `SalesInvoiceLine`, `TaxRule` | Output VAT collected on sales for tax authorities. |
| E20 | **Sales Cancellation Report** | Missing | `SalesInvoice` (`status = CANCELLED`) | Voided and cancelled sales with authorization reasons. |
| E21 | **Sales Profitability Report** | Existing (`profitability`) | `SalesInvoiceLine` | Gross Margin: Net Revenue minus Landed Cost of Goods Sold. |

---

### Module F: Customer Reports (10 Reports)

| # | Report Name | Current Status | Primary Data Source | Calculation & Aggregation Rules |
| :--- | :--- | :--- | :--- | :--- |
| F1 | **Customer List** | Incomplete (raw CRUD only) | `Customer`, `Company` | Directory of customers, credit limits, credit terms, and status. |
| F2 | **Customer Ledger** | Incomplete (in subledgers) | `JournalEntryLine` (`customerId`) | Running financial balance: Debit (Invoices) - Credit (Payments/Returns). |
| F3 | **Customer Statement** | Existing (`/finance/subledgers`)| `JournalEntryLine`, `Customer` | Official statement of account for external distribution. |
| F4 | **Customer Outstanding Report** | Incomplete | `Customer`, `JournalEntryLine` | Total receivables balance per customer exceeding zero. |
| F5 | **Customer Aging Report** | Incomplete (basic) | `SalesInvoice`, `PaymentAllocation` | Aging buckets: Current, 1-30, 31-60, 61-90, 91+ days past invoice due date. |
| F6 | **Customer Payment History** | Missing | `Payment`, `PaymentAllocation` | Chronological receipts, payment methods (Cash, Bank, Card), voucher refs. |
| F7 | **Customer Sales History** | Missing | `SalesInvoice`, `Customer` | Full document timeline of all invoices issued to the customer. |
| F8 | **Customer Return History** | Missing | `StockReturn`, `Customer` | Return frequency, defective claim rates, and credit notes. |
| F9 | **Customer Profitability** | Missing | `SalesInvoiceLine`, `Customer` | Total revenue minus COGS generated from this specific customer. |
| F10 | **Customer Credit Balance Report**| Missing | `Customer`, `JournalEntryLine` | Customers with unallocated advances or overpayments (credit balances). |

---

### Module G: Supplier Reports (10 Reports)

| # | Report Name | Current Status | Primary Data Source | Calculation & Aggregation Rules |
| :--- | :--- | :--- | :--- | :--- |
| G1 | **Supplier List** | Incomplete (CRUD only) | `Supplier`, `Company` | Vendor catalog, payment terms, currency, bank details. |
| G2 | **Supplier Ledger** | Incomplete (in subledgers) | `JournalEntryLine` (`supplierId`) | Running balance: Credit (Bills/GRNs) - Debit (Payments/Returns). |
| G3 | **Supplier Statement** | Existing (`/finance/subledgers`)| `JournalEntryLine`, `Supplier` | Official account reconciliation statement. |
| G4 | **Supplier Outstanding Report** | Incomplete | `Supplier`, `JournalEntryLine` | Payables obligations per supplier. |
| G5 | **Supplier Aging Report** | Incomplete (basic) | `PurchaseReceipt`, `PaymentAllocation` | Payables aging based on supplier credit terms. |
| G6 | **Supplier Payment History** | Missing | `Payment`, `PaymentAllocation` | Disbursements, check numbers, wire transfers, and bank deductions. |
| G7 | **Supplier Purchase History** | Missing | `PurchaseReceipt`, `Supplier` | Historic orders and receipts placed with the vendor. |
| G8 | **Supplier Return History** | Missing | `StockReturn`, `Supplier` | Historical return-to-vendor (RTV) claims and replacement status. |
| G9 | **Supplier Purchase Analysis** | Missing | `PurchaseReceiptLine`, `Supplier` | Lead time adherence, price stability, and volume discounting. |
| G10 | **Supplier Advance Balance** | Missing | `Supplier`, `JournalEntryLine` | Advance deposits paid to suppliers awaiting GRN settlement. |

---

### Module H: Finance & Accounting Reports (25 Reports)

| # | Report Name | Current Status | Primary Data Source | Calculation & Aggregation Rules |
| :--- | :--- | :--- | :--- | :--- |
| H1 | **Chart of Accounts** | Existing (catalog page) | `Account`, `AccountGroup` | Complete tree of 5 account classes: Assets, Liabilities, Equity, Revenue, Expense. |
| H2 | **General Ledger** | Missing (only subledger) | `JournalEntryLine`, `Account` | Full running ledger for any chosen account with voucher drilldown. |
| H3 | **Trial Balance** | Existing (`trial-balance`) | `JournalEntryLine`, `Account` | Opening, Movement, Closing. Proves $\sum \text{Debit} = \sum \text{Credit}$. |
| H4 | **Profit & Loss Statement** | Existing (`statements`) | `JournalEntryLine` (REVENUE, COGS, EXPENSE) | Periodic net operating profit from posted journals. |
| H5 | **Balance Sheet** | Existing (`statements`) | `JournalEntryLine` (ASSET, LIABILITY, EQUITY) | Point-in-time financial position: Assets = Liabilities + Equity + Retained Earnings. |
| H6 | **Cash Flow Statement** | Existing (`statements`) | `BankTransaction`, `JournalEntry` | Operating, Investing, and Financing cash movements. |
| H7 | **Journal Entry Register** | Existing (CRUD page) | `JournalEntry`, `JournalEntryLine` | Chronological audit register of all vouchers with posting state. |
| H8 | **Account Ledger** | Missing | `JournalEntryLine`, `Account` | Detailed statement for any active balance sheet or nominal account. |
| H9 | **Expense Report** | Missing | `JournalEntryLine` (`EXPENSE` class) | Itemized expenses by operational sub-accounts (Rent, Utilities, Salaries). |
| H10 | **Income Report** | Missing | `JournalEntryLine` (`REVENUE` class) | Itemized operating and non-operating revenue accounts. |
| H11 | **Revenue Report** | Incomplete (in P&L) | `SalesInvoiceLine`, `JournalEntryLine` | Reconciled revenue between operational sales lines and GL account `41000`. |
| H12 | **Gross Profit Report** | Incomplete (in P&L) | `JournalEntryLine` (`REVENUE` vs `COGS`) | Financial gross margin generated directly from the double-entry ledger. |
| H13 | **Net Profit Report** | Incomplete (in P&L) | `JournalEntryLine` | Comprehensive net profit after operating and overhead expenses. |
| H14 | **Financial Position Report** | Incomplete (in Balance Sheet)| `Account`, `JournalEntryLine` | Working Capital, Current Ratio, Debt-to-Equity metrics. |
| H15 | **Accounts Receivable** | Incomplete (subledger only) | `JournalEntryLine` (`11200`), `Customer` | Total open customer receivables reconciled with GL control account. |
| H16 | **Accounts Payable** | Incomplete (subledger only) | `JournalEntryLine` (`21100`), `Supplier` | Total open supplier obligations reconciled with GL control account. |
| H17 | **Receivables Aging** | Incomplete | `SalesInvoice`, `JournalEntryLine` | Receivables overdue breakdown (0-30, 31-60, 61-90, 90+ days). |
| H18 | **Payables Aging** | Incomplete | `PurchaseReceipt`, `JournalEntryLine` | Payables overdue breakdown based on supplier invoices. |
| H19 | **Financial Year Comparison** | Missing | `JournalEntryLine`, `FiscalYear` | Side-by-side statement comparison across two fiscal years. |
| H20 | **Monthly Financial Summary** | Missing | `JournalEntryLine` | Month-by-month financial statement rollup. |
| H21 | **Quarterly Financial Summary** | Missing | `JournalEntryLine` | Q1, Q2, Q3, Q4 financial performance report. |
| H22 | **Yearly Financial Summary** | Missing | `JournalEntryLine`, `FiscalYear` | Year-end closing financial position. |
| H23 | **Unposted Transactions Report**| Missing | `JournalEntry`, `SalesInvoice`, `Payment`| Operational and financial drafts awaiting supervisor approval or posting. |
| H24 | **Reversed Transactions Report**| Missing | `JournalEntry` (`status = REVERSED`) | Complete audit trail of reversed vouchers with reversal reasons and timestamps. |
| H25 | **Suspense Account Report** | Missing | `JournalEntryLine` (Suspense accounts) | Uncleared transactions in clearing or suspense accounts awaiting allocation. |

---

### Module I: Cash & Bank Reports (15 Reports)

| # | Report Name | Current Status | Primary Data Source | Calculation & Aggregation Rules |
| :--- | :--- | :--- | :--- | :--- |
| I1 | **Cash Book** | Missing | `JournalEntryLine` (Cash Accounts) | Chronological register of physical cash in hand with running balance. |
| I2 | **Bank Book** | Missing | `BankTransaction`, `BankAccount` | Register of deposits, withdrawals, and cleared bank checks. |
| I3 | **Cash Account Ledger** | Missing | `JournalEntryLine`, `Account` (`type = CASH`) | Specific GL drilldown for petty cash and till drawers. |
| I4 | **Bank Account Ledger** | Incomplete (in banking page)| `BankTransaction`, `Account` (`type = BANK`) | Bank-specific transaction history. |
| I5 | **Bank Transactions** | Existing (`/finance/banking`) | `BankTransaction` | All bank debit/credit events linked to vouchers. |
| I6 | **Cash Transactions** | Missing | `Payment` (`method = CASH`) | Walk-in counter cash collections and cash disbursements. |
| I7 | **Bank Reconciliation** | Existing (`/finance/banking`) | `BankReconciliation`, `BankStatement`| Reconciled statement balance vs ledger balance. |
| I8 | **Unreconciled Transactions** | Missing | `BankTransaction` (`isReconciled = false`)| Outstanding checks and in-transit deposits not yet cleared on bank statement. |
| I9 | **Cash Flow Summary** | Incomplete (in statements) | `BankTransaction`, `Payment` | Daily/weekly summary of cash inflows vs outflows. |
| I10 | **Payment Collection Report** | Missing | `Payment` (`direction = INBOUND`) | Summary of customer receipts categorized by payment method (Cash, Card, Transfer). |
| I11 | **Payment Disbursement Report** | Missing | `Payment` (`direction = OUTBOUND`) | Summary of supplier payouts and operational disbursements. |
| I12 | **Customer Receipt Report** | Incomplete (in payments CRUD)| `Payment`, `Customer` | Itemized customer receipts with invoice allocation details. |
| I13 | **Supplier Payment Report** | Incomplete (in payments CRUD)| `Payment`, `Supplier` | Itemized supplier payments with GRN allocation details. |
| I14 | **Cash Closing Report** | Missing | `Payment`, `Branch`, `User` | Daily POS cash drawer opening, cash sales, drop, and closing variance. |
| I15 | **Bank Balance Summary** | Incomplete (in dashboard) | `BankAccount`, `BankTransaction` | Real-time cleared balance across all active company bank accounts. |

---

### Module J: Expense Reports (11 Reports)

| # | Report Name | Current Status | Primary Data Source | Calculation & Aggregation Rules |
| :--- | :--- | :--- | :--- | :--- |
| J1 | **Expense Register** | Missing | `JournalEntryLine` (`accountClass = EXPENSE`) | Chronological listing of all recorded operational expenses. |
| J2 | **Daily Expense** | Missing | `JournalEntryLine`, `JournalEntry` | Daily operating expenditure breakdown. |
| J3 | **Monthly Expense** | Missing | `JournalEntryLine`, `JournalEntry` | Monthly spending by ledger sub-code. |
| J4 | **Yearly Expense** | Missing | `JournalEntryLine`, `FiscalYear` | Annual expenditure review. |
| J5 | **Expense Category Report** | Missing | `AccountGroup`, `Account` | Aggregated expenses by functional category (Utilities, Rent, Logistics, Salaries). |
| J6 | **Branch-wise Expense** | Missing | `JournalEntryLine.branchId` | Expenses allocated by specific operating branch. |
| J7 | **Department-wise Expense** | Missing | `JournalEntryLine.departmentId` | Expenses grouped by department (Sales, Warehouse, IT, Management). |
| J8 | **Employee-wise Expense** | Missing | `JournalEntryLine.salespersonId` | Expense claims or disbursements assigned to staff members. |
| J9 | **Expense Payment History** | Missing | `Payment`, `JournalEntryLine` | Disbursements linked to operational expense vouchers. |
| J10 | **Pending Expense Report** | Missing | `JournalEntry` (`status = DRAFT`) | Expense vouchers submitted but pending managerial approval. |
| J11 | **Expense Approval Report** | Missing | `AuditLog`, `JournalEntry` | Vouchers approved, approval timestamps, and approving managers. |

---

### Module K: Fixed Asset Reports (9 Reports)

| # | Report Name | Current Status | Primary Data Source | Calculation & Aggregation Rules |
| :--- | :--- | :--- | :--- | :--- |
| K1 | **Fixed Asset Register** | Existing (`/finance/assets`) | `FixedAsset`, `AssetCategory` | Complete asset schedule: Acquisition cost, accumulated depreciation, Net Book Value. |
| K2 | **Asset Acquisition Report** | Missing | `FixedAsset`, `AssetTransaction` | New capital asset additions within a period. |
| K3 | **Asset Disposal Report** | Missing | `AssetDisposal`, `FixedAsset` | Scrapped or sold assets, proceeds, disposal cost, and Net Gain/Loss. |
| K4 | **Asset Depreciation Report** | Incomplete (table only) | `AssetDepreciationSchedule` | Periodic depreciation posted to GL expense account `65000`. |
| K5 | **Monthly Depreciation** | Missing | `AssetTransaction` (`DEPRECIATION`) | Monthly depreciation run summary. |
| K6 | **Yearly Depreciation** | Missing | `AssetTransaction` (`DEPRECIATION`) | Annual capital asset depreciation write-down. |
| K7 | **Asset Book Value** | Incomplete (in register) | `FixedAsset` | Remaining balance sheet value: $\text{NBV} = \text{Acquisition Cost} - \text{Accumulated Depreciation}$. |
| K8 | **Asset Location Report** | Missing | `FixedAsset.location` | Assets grouped by branch, office, or warehouse location. |
| K9 | **Asset Category Report** | Missing | `FixedAsset`, `AssetCategory` | Total capital expenditure grouped by category (IT Equipment, Furniture, Vehicles). |

---

### Module L: Incentive & Rebate Reports (12 Reports)

| # | Report Name | Current Status | Primary Data Source | Calculation & Aggregation Rules |
| :--- | :--- | :--- | :--- | :--- |
| L1 | **Sales Incentive Report** | Existing (`/finance/incentives`)| `IncentiveCalculation`, `IncentivePlan` | Performance incentives calculated for sales staff against target bands. |
| L2 | **Incentive Payable Report** | Missing | `IncentivePayable` | Accrued but unpaid incentives owed to staff. |
| L3 | **Incentive Payment History** | Missing | `IncentivePayment`, `Payment` | Historical payouts made to sales representatives. |
| L4 | **Received Incentive Report** | Missing | `ReceivedIncentive` | Incentives earned from manufacturers/brands for achieving sales targets. |
| L5 | **Received Rebate Report** | Existing (`/finance/rebates`) | `RebateCalculation`, `RebateProgram` | Volume and price protection rebates settled by suppliers. |
| L6 | **Paid Rebate Report** | Missing | `RebatePayable`, `RebatePayment` | Volume discounts or dealer kickbacks paid out to top customers. |
| L7 | **Rebate Receivable Report** | Missing | `RebateReceivable` | Accrued supplier rebates pending credit note or bank remittance. |
| L8 | **Rebate Payable Report** | Missing | `RebatePayable` | Accrued customer rebates awaiting credit memo issuance. |
| L9 | **Monthly Incentive Summary** | Missing | `IncentiveCalculation` | Monthly trend of sales commissions and brand incentives. |
| L10 | **Quarterly Incentive Summary**| Missing | `IncentiveCalculation` | Quarterly target achievement and bonus accruals. |
| L11 | **Yearly Incentive Summary** | Missing | `IncentiveCalculation` | Annual reward summaries for staff and brand audits. |
| L12 | **Incentive/Rebate Ledger** | Missing | `JournalEntryLine` (`INCENTIVE_...`, `REBATE_...`)| Complete double-entry ledger audit separating earned, received, payable, and paid. |

---

## 3. Global Filter & UX Gap Summary

1. **Missing Filter Criteria:**
   - Existing operational workspace supports only: `from`, `to`, `branchId`, `warehouseId`, `productId`, `status`.
   - Missing required enterprise filters: `Brand`, `Model`, `Color`, `Category`, `Customer`, `Supplier`, `Salesperson`, `Payment Method`, `Date Range Presets` (Today, Yesterday, This Week, Last Week, This Month, Last Month, This Quarter, This Year).
2. **Missing UI & Table Controls:**
   - Missing Column Visibility customization (show/hide columns).
   - Missing Server-side sorting on table headers.
   - Missing true Server-side Pagination (currently uses hard limit of 1,000 rows with a truncation warning).
3. **Missing Multi-format Export:**
   - Currently exports CSV only.
   - Native Excel (.xlsx) export with formatted headers and bold totals is missing.
   - Dedicated Print-to-PDF layouts for operational reports are basic browser prints rather than structured, page-numbered reports.
4. **Drill-down Gaps:**
   - Current table links only open print preview of source invoices/GRNs.
   - Missing contextual drill-downs:
     - Click Customer $\rightarrow$ Customer Ledger
     - Click Supplier $\rightarrow$ Supplier Ledger
     - Click IMEI $\rightarrow$ IMEI Movement History Timeline
     - Click Product $\rightarrow$ Stock Ledger
     - Click Account Balance $\rightarrow$ General Ledger

