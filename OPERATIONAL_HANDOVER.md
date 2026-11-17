# AXON MOBILE ERP — PRODUCTION GO-LIVE & OPERATIONAL HANDOVER

**Business:** Gondal Mobile Center  
**System:** AXON MOBILE ERP  
**Release Version:** `v1.0.0-release`  
**Git Baseline:** `a3cfa10`  
**Currency:** PKR (Rs.)  
**Branches:** `HZR` — Hazro Central | `ISB` — Islamabad  
**Database:** Production PostgreSQL Engine (`db.prisma.io:5432`)  
**Date:** November 2026

---

## 1. Production Environment Verification

### 1.1 Live Environment Configuration
| Component | Production Specification | Operational Status |
| :--- | :--- | :---: |
| **Application Server** | Next.js 15 App Router (Standalone Node / Vercel Serverless) | **Operational** |
| **Database Engine** | PostgreSQL 16 (SSL Enforced) | **Connected** |
| **Health Check Route** | `GET /api/health` | **HTTP 200 OK** |
| **Operating Mode** | Single-Operator Direct-Posting (Zero SAP Bureaucracy) | **Active** |
| **Catalog Scope** | 85 Verified Products (20 IMEI Smartphones, 65 Feature Phones) | **Live** |
| **Store Physical Units** | 29 Handsets, 41 Registered IMEIs, Rs. 896,260 Stock Valuation | **Reconciled** |
| **Treasury Liquidity** | Cash on Hand: Rs. 47,410.00 \| Faysal Bank: Rs. 3,816.00 | **Reconciled** |

### 1.2 Required Environment Variables
Ensure the following keys are present in your production environment (`.env` or hosting provider settings):
- `DATABASE_URL`: Connection string to PostgreSQL (with `sslmode=require&connection_limit=1&pool_timeout=30`).
- `APP_SECRET`: 64-character hex cryptographic salt for secure session generation.
- `NODE_ENV`: Set to `production`.
- `NEXT_PUBLIC_APP_NAME`: `AXON Mobile ERP`.
- `NEXT_PUBLIC_COMPANY_NAME`: `Gondal Mobile Center`.

### 1.3 Database Backup & Restore Procedure
- **Automated Backup Rehearsal:** Execute `bash scripts/backup-restore-rehearsal.sh` to take a checkpointed snapshot and verify restore parity.
- **Manual Logical Backup:**
  ```bash
  # Take a clean logical dump without stopping read queries
  pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" > backups/axon_prod_$(date +%Y%m%d).dump
  ```
- **Disaster Recovery (Isolated Staging Restore):**
  ```bash
  # Restore to a clean staging database
  pg_restore --clean --if-exists --no-owner -d "$STAGING_DATABASE_URL" backups/axon_prod_YYYYMMDD.dump
  # Run verification harness
  npx tsx scripts/verify-restore-parity.ts
  ```
  *(Never restore a test backup over the live production database).*

---

## 2. Administrator Handover & Security Governance

The Super Administrator account (`owner@axonmobile.local` — **Qasim Ali**) holds overarching control over the company:

### 2.1 Administrative Responsibilities
1. **User Account Governance:** Navigate to **Access Management → Users** (`/access/users`) to create new staff accounts, assign roles, reset credentials, or deactivate departing staff.
2. **Branch & Warehouse Assignment:** Staff must be assigned strictly to their physical branch (`HZR` or `ISB`).
3. **Audit History Review:** Navigate to **Audit Trail** (`/audit`) to review append-only immutable logs of all sensitive actions (deletions, price overrides, reversals, logins).
4. **Administrative Safeguards:**
   - `LAST_ADMIN_PROTECTED`: The system strictly prohibits suspending or deactivating the last active Super Administrator.
   - Password hashes use bcrypt with 12 salt rounds; plaintext passwords are never stored or logged.

---

## 3. Staff Account Setup & Least-Privilege Role Guide

AXON ERP includes 9 pre-configured operational roles. Always follow **least-privilege access**—never grant administrative roles to retail clerks.

| Role | Target Staff | Permitted Scope | Restricted Scope |
| :--- | :--- | :--- | :--- |
| **Super Administrator / Owner** | Business Owner (Qasim Ali) | Complete company-wide access to all branches, accounting, settings, and user management. | None. |
| **Branch Manager** | Hazro / Islamabad In-Charge | Branch sales, purchase receipts, stock transfers, employee commission tracking, branch reports. | Other branch data, company fiscal settings, user role configuration. |
| **Inventory Manager** | Stock Head / Warehouse Supervisor | Goods receiving (GRN), IMEI registry, physical stock counts, warehouse transfers, adjustments. | General ledger journal posting, bank account transactions, customer receipts. |
| **Storekeeper** | Stock Boy / Receiving Clerk | IMEI barcode scanning, receiving items into warehouse bins, packaging dispatch. | Financial ledgers, selling prices, customer credit balances, purchase prices. |
| **Salesperson** | Counter Staff / Floor Sales | POS sales checkout, customer price checks, product availability, invoice generation. | Purchasing, inventory adjustments, general ledger, expense posting. |
| **Purchase Officer** | Procurement Agent | Supplier purchase orders, vendor item price agreements, goods receipt drafts. | Cashier tills, customer accounts, general ledger posting. |
| **Accountant** | Bookkeeper / Finance Executive | Customer receipts, supplier payments, expense vouchers, bank reconciliation, trial balance, P&L. | Altering inventory serial numbers, changing system settings. |
| **Cashier** | Till Operator / Counter Cashier | POS cash collections, customer cash receipts, receipt printing, daily cash till closing. | Modifying historical vouchers, manual journal entries, inventory write-offs. |
| **Auditor** | External / Internal Auditor | Read-only inspection of ledgers, subledgers, inventory valuation, audit trail, tax reports. | **Zero write/edit/delete access across all modules.** |

---

## 4. Branch Operational Setup

Gondal Mobile Center operates two distinct physical branches with isolated warehouses:

```
┌──────────────────────────────────────────────┐
│           AXON — Gondal Mobile Center        │
└──────────────────────┬───────────────────────┘
                       │
       ┌───────────────┴───────────────┐
       ▼                               ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│  HZR — Hazro Central     │   │  ISB — Islamabad         │
│  (Main Hub & Wholesale)  │   │  (Retail Counter)        │
├──────────────────────────┤   ├──────────────────────────┤
│ • HZR-MAIN (Sellable)    │   │ • ISB-RETAIL (Sellable)  │
│ • HZR-QUARANTINE (Faulty)│   │ • ISB-QUARANTINE (Faulty)│
└──────────────────────────┘   └──────────────────────────┘
```

### Operational Rules for Branches
1. **Sellable Stock Rule:** All POS sales and customer deliveries draw inventory exclusively from `HZR-MAIN` or `ISB-RETAIL`.
2. **Quarantine Protection:** `HZR-QUARANTINE` and `ISB-QUARANTINE` hold customer return phones or damaged shipments awaiting vendor return. Items in quarantine are **strictly excluded** from sellable POS inventory.
3. **Branch Isolation:** Hazro counter staff cannot view or sell Islamabad retail units, and vice-versa, preventing accidental cross-city dispatch.

---

## 5. Daily Business Workflow Guide (Step-by-Step)

### Workflow 1: Morning Login & Executive Dashboard
1. Open the browser to the application URL: `http://localhost:3000` (or your live production domain).
2. Enter your assigned email and password on the **Sign In** screen.
3. Upon login, the **Executive Intelligence Center** (`/`) appears:
   - Review **Sales This Month** and **Sales Today**.
   - Review the **Live Ledger Treasury Grid**:
     - *Cash on Hand (GL 1000)*
     - *Bank Accounts (GL 1010)*
     - *Trade Receivables (GL 1100)*
     - *Trade Payables (GL 2000)*
   - Inspect the **Branch Performance Overview** comparing Hazro and Islamabad.

---

### Workflow 2: Product Search & Registering New Models
1. Navigate to **Catalog → Products** (`/catalog/products`).
2. To find an existing phone: Type the model name (e.g. *Infinix Hot 60i*, *Samsung A07*, or *DIGIT C1*) into the search bar.
3. To add a new phone model:
   - Click the blue **+ New Product** button.
   - Enter Product Name, Brand (e.g. *Infinix, VIVO, Tecno, Me Mobile*), Category (`Mobile Phone`).
   - Choose **Tracking Method**:
     - Select **IMEI** for smartphones (each unit tracked by serial IMEI).
     - Select **Quantity (Without IMEI)** for feature phones or accessories.
   - Select Costing Method: `Weighted Average` (or `Specific Identification` for flagship phones).
   - Click **Save Product**. The system automatically generates a standard variant (`-STD`).

---

### Workflow 3: Purchasing & Goods Receiving (GRN) with IMEI Scanning
1. Navigate to **Purchases → Receive Stock** (`/goods-receipts/new` or `/purchases`).
2. Select the **Supplier** (e.g. *Gondal Mobile Wholesale* or *Al-Rehman Telecom*).
3. Select the destination **Warehouse** (e.g. `ISB-RETAIL` or `HZR-MAIN`).
4. Select the phone model and enter purchase cost in PKR.
5. **IMEI Barcode Scanning:**
   - For smartphones: Scan IMEI 1 and IMEI 2 with your barcode gun into the rapid input box.
   - Dual-SIM phones register both IMEIs linked to **1 single handset unit**.
6. Review the summary total and click **Post Goods Receipt**.
7. **Instant Result:**
   - Stock balance immediately increases by the scanned count.
   - Supplier ledger is credited (Accounts Payable GL 2000).
   - Inventory Asset account (GL 1200) is debited.
   - No manual journal entry required.

---

### Workflow 4: Serialized IMEI Lookup & Warranty Check
1. Navigate to **Inventory → IMEI Registry** (`/inventory/imei`).
2. Scan or paste any 15-digit IMEI into the search bar.
3. The system instantly reveals:
   - Product name and variant.
   - Current warehouse location (`ISB-RETAIL`, `HZR-MAIN`, or `QUARANTINE`).
   - Status: `IN_STOCK`, `SOLD`, `TRANSIT`, or `RETURNED`.
   - Purchase Date and Goods Receipt document number.
   - Sale Date, Sales Invoice number, and Customer name (if sold).

---

### Workflow 5: Inter-Branch Stock Transfers (Hazro ↔ Islamabad)
1. Navigate to **Inventory → Transfers** (`/inventory/transfers`).
2. Click **+ New Stock Transfer**.
3. Select **Source Warehouse** (e.g. `HZR-MAIN`) and **Destination Warehouse** (e.g. `ISB-RETAIL`).
4. Scan the IMEIs of the handsets being shipped to Islamabad.
5. Click **Dispatch Transfer**:
   - Stock moves into status `TRANSIT` (deducted from Hazro sellable inventory).
   - Company stock valuation is preserved at exact purchase cost with zero gain/loss.
6. When the courier/driver arrives in Islamabad:
   - The Islamabad storekeeper opens `/inventory/transfers`, selects the incoming transfer, and clicks **Receive & Verify**.
   - Handsets immediately become available for retail sale in `ISB-RETAIL`.

---

### Workflow 6: POS Retail Counter & Thermal Invoice Printing
1. Navigate to **POS Counter** (`/pos`) or click the POS button in the top bar.
2. Select your active store branch (`ISB` or `HZR`).
3. Select Customer: Choose **Walk-in Retail Customer** (or a registered credit customer).
4. **Add Items:**
   - Scan the handset barcode / IMEI box directly, or search by model name.
   - For accessories / feature phones: Enter the quantity.
5. Review the selling price in PKR. Apply line or invoice discount if approved.
6. Click **Pay & Checkout**:
   - Select Payment Tender: **Cash**, **Bank Transfer** (Faysal Bank), or **Credit / On Account**.
   - Enter tendered amount. The system calculates exact change in PKR.
7. Click **Complete Sale**:
   - The sale posts instantly to the ledger.
   - The 80mm thermal receipt printer triggers automatically (or standard A4 receipt).
   - Physical handset status changes to `SOLD` with sold timestamp.
   - COGS is automatically recognized in General Ledger (Dr 5000 COGS / Cr 1200 Inventory).

---

### Workflow 7: Customer Receipts & Credit Settlement
1. Navigate to **Parties → Customers** (`/parties?tab=customers`).
2. Select the customer (e.g. *Usman Telecom Hazro*).
3. Review their outstanding balance in PKR and invoice aging.
4. Click **Record Receipt**:
   - Enter Received Amount (e.g. `Rs. 50,000`).
   - Select receiving account: **Cash on Hand (Till)** or **Faysal Bank Current Account**.
   - Allocate the payment against specific unpaid invoices (or choose Auto-FIFO allocation).
5. Click **Post Receipt**:
   - Customer outstanding balance drops immediately.
   - Cash/Bank increases and Trade Receivables (GL 1100) decreases.

---

### Workflow 8: Supplier Payments & Bill Allocation
1. Navigate to **Parties → Suppliers** (`/parties?tab=suppliers`).
2. Select the vendor partner.
3. Click **Make Payment**:
   - Enter payment amount in PKR.
   - Select disbursement method: Cash or Bank Transfer.
   - Allocate against open purchase receipts.
4. Click **Post Payment**:
   - Vendor payable balance reduces.
   - Cash or Bank balance is deducted automatically.

---

### Workflow 9: Cash & Bank Management (Deposits, Withdrawals, Contras)
1. Navigate to **Cash & Bank** (`/finance/banking`).
2. **Cash Deposit into Bank (Shop Cash → Faysal Bank):**
   - Click **Record Contra Transfer**.
   - Source Account: `1000 - Cash on Hand`.
   - Destination Account: `1010 - Faysal Bank Current Account (0001)`.
   - Enter amount in PKR (e.g. `Rs. 25,000`).
   - Narration: *"Cash deposit by shop manager"*.
   - Click **Post Transfer**: Cash in shop till decreases; bank balance increases by exact matching amount.
3. **Cash Withdrawal from Bank (Faysal Bank → Shop Till):**
   - Source Account: `1010 - Bank` | Destination: `1000 - Cash on Hand`.

---

### Workflow 10: Recording Business Operating Expenses
1. Navigate to **Finance → Operating Expenses** (`/finance/expenses`).
2. Click **+ Record Expense**.
3. Select Expense Category:
   - *Shop Rent, Electricity Bill, Staff Salaries, Internet / PTCL, Tea & Entertainment, Stationary, Police / Security, Generator Fuel*.
4. Select Paid From: **Cash on Hand** (or Bank Account).
5. Enter Amount in PKR and enter invoice/bill reference or remarks.
6. Click **Post Expense**:
   - Operating expense posts directly to GL (Dr Expense Category / Cr Cash on Hand).
   - Voucher is immediately available for print and audit.

---

### Workflow 11: Customer Sales Returns & Phone Exchanges
1. Navigate to **Returns & Exchanges** (`/returns`).
2. Click **+ New Sales Return** (or **Phone Exchange Wizard**):
   - Select original Sales Invoice.
   - Select returned item and scan its IMEI.
   - Choose Condition / Disposition:
     - **Restock into Inventory (`ISB-RETAIL`):** If phone is in brand-new resale condition.
     - **Quarantine (`ISB-QUARANTINE`):** If phone is faulty/defective.
   - Choose Refund Method: Cash refund, Bank refund, or Customer Account credit note.
3. Click **Post Return**:
   - Defective phone enters quarantine; sellable inventory is protected.
   - Net sales and gross profit adjust accurately.

---

### Workflow 12: Daily Reports & Comparative Matrix
1. Navigate to **Finance → Branch Comparison** (`/reports/branch-comparison`):
   - Review side-by-side trading performance between Hazro Central and Islamabad for the selected date range.
   - Compare Gross Sales, Returns, Discounts, Net Sales, Gross Margin %, OPEX, Net Profit, and Inventory Value.
   - Click **Export CSV** or **Print Formal Statement** for branch records.
2. Navigate to **Business Analytics** (`/reports/analytics`):
   - Inspect Top 10 Selling Phones by volume and revenue.
   - Review Brand Market Share & Gross Margin %.
   - Inspect Salesperson Leaderboard and Slow-Moving Stock alerts.

---

## 6. First-Day Live Transaction Checklist (Go-Live Day 1)

Execute these controlled steps using **actual business operations** on the morning of Go-Live:

- [ ] **Step 1 — Morning System Health Verification:**
  - Open `/api/health` and verify `status: "healthy"`, database latency $< 100\text{ms}$.
  - Log in as Super Administrator (`owner@axonmobile.local`).
- [ ] **Step 2 — Morning Cash Till Verification:**
  - Open `/finance/reports/cashbook`.
  - Confirm Cash on Hand matches actual physical currency in store tills.
- [ ] **Step 3 — First Goods Receiving (GRN):**
  - When the first stock delivery arrives from supplier, enter `/goods-receipts/new`.
  - Scan IMEIs of new handsets into `ISB-RETAIL` or `HZR-MAIN`.
  - Confirm stock balance increases in `/inventory/imei`.
- [ ] **Step 4 — First Live POS Counter Sale:**
  - Process the first retail customer order at `/pos`.
  - Scan the sold phone's IMEI barcode.
  - Tender payment (Cash or Bank).
  - Print the customer thermal receipt.
  - Verify phone status updates to `SOLD` in `/inventory/imei`.
- [ ] **Step 5 — First Daily Operating Expense:**
  - Record the day's first petty expense (e.g. tea, office supplies) via `/finance/expenses`.
  - Verify Cash on Hand deducts correctly.
- [ ] **Step 6 — First Customer Receipt (If Credit Customer Pays):**
  - Record payment at `/parties` and confirm customer outstanding balance updates.
- [ ] **Step 7 — Day-End Closing:**
  - Execute the Daily Closing SOP below.

---

## 7. Daily Closing Standard Operating Procedure (SOP)

Every evening at shop closing time (e.g. 9:00 PM), the Cashier and Branch Manager must perform this 10-minute closing routine:

```
┌────────────────────────────────────────────────────────┐
│             DAILY SHOP CLOSING WORKFLOW                │
├────────────────────────────────────────────────────────┤
│ 1. Count physical cash in counter drawer               │
│ 2. Open Cashbook Report (/finance/reports/cashbook)    │
│ 3. Match Drawer Cash = System GL 1000 Cash on Hand     │
│ 4. Verify Faysal Bank online portal = System GL 1010   │
│ 5. Review Daily Sales Register (/sales)                │
│ 6. Spot-check 3 random handsets against IMEI Registry  │
│ 7. Sign off Daily Branch Closing Summary               │
└────────────────────────────────────────────────────────┘
```

### Step-by-Step Daily Closing Checklist
1. **Physical Cash Drawer Count:**
   - Count all paper currency notes and coins in the cash till.
   - Record total physical cash (e.g. `Rs. 78,500.00`).
2. **System Cashbook Balance:**
   - Navigate to `/finance/reports/cashbook`.
   - Check the **Closing Balance** of Account 1000.
   - **Verification Rule:** Physical Cash in Drawer must equal System Cash on Hand.
   - *If variance exists:* Check for unrecorded petty cash expenses, unrecorded POS cash receipts, or customer change errors.
3. **Bank Balance Verification:**
   - Log in to Faysal Bank corporate online banking.
   - Compare available bank balance against `/finance/banking` (Account 1010).
   - Confirm all customer digital transfers / QR payments received during the day were recorded in the system.
4. **Daily Sales & Returns Audit:**
   - Open `/reports/operations?report=sales` with date filter set to *Today*.
   - Confirm invoice count and total gross sales in PKR.
   - Check if any customer returns occurred during the shift.
5. **Physical Handset Spot-Check:**
   - Pick 3 mobile phone boxes at random from the display showcase.
   - Scan their IMEI numbers in `/inventory/imei`.
   - Confirm all 3 show status `IN_STOCK` and correct store warehouse location.
6. **Nightly Cash Safe Transfer (Optional):**
   - If moving cash from counter till into the main branch locker safe, record internal transfer or record bank deposit contra.

---

## 8. Staff Role-Based Training Quick Reference

### For Counter Sales Staff
- **Goal:** Fast, friendly retail checkout with zero inventory errors.
- **Key Screen:** `/pos` (POS Counter).
- **Rule 1:** Always scan the actual barcode on the phone box being handed to the customer. Never scan one phone and hand over another.
- **Rule 2:** Always verify dual-SIM phones have both IMEI 1 and IMEI 2 on the invoice.
- **Rule 3:** For walk-in customers, always collect cash or verify bank transfer screenshot before clicking *Complete Sale*.

### For Storekeepers & Stock In-Charge
- **Goal:** Accurate inventory counts with zero missing or duplicate phones.
- **Key Screen:** `/goods-receipts/new` and `/inventory/imei`.
- **Rule 1:** When a box arrives from a supplier, inspect the factory seal. If broken or damaged, flag for manager inspection before receiving.
- **Rule 2:** Defective or customer-returned phones must ALWAYS be placed in `QUARANTINE` warehouse, never in `MAIN` or `RETAIL`.
- **Rule 3:** Never hand a box to a courier for branch transfer without clicking *Dispatch Transfer* in the system first.

### For Cashiers & Accountants
- **Goal:** Balanced till, accurate customer ledgers, zero unbalanced vouchers.
- **Key Screens:** `/finance/reports/cashbook`, `/finance/banking`, `/parties`.
- **Rule 1:** Never mix shop petty cash with personal funds.
- **Rule 2:** When cash is deposited into Faysal Bank, always record a *Contra Transfer* immediately.
- **Rule 3:** Every evening, execute the Daily Closing SOP without exception.

---

## 9. Backup, Recovery & Disaster Procedure

1. **Daily Automated Cloud Backups:**
   - Database resides on PostgreSQL cloud cluster with automated continuous write-ahead logging (WAL) and daily automated snapshots.
2. **Weekly Local Snapshot Archive:**
   - The Super Administrator should run `bash scripts/backup-restore-rehearsal.sh` once per week and store the encrypted archive off-site.
3. **Disaster Recovery Contact:**
   - In the event of network disruption or cloud cluster outage, contact system administrator immediately.

---

## 10. Escalation & Operational Support

For system support, operational inquiries, or administrative escalation:

- **Business Owner:** Qasim Ali
- **Contact Phone:** 0315-5049489
- **Branches:** Hazro Central & Islamabad
- **Software:** AXON MOBILE ERP v1.0.0-release

---
© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
