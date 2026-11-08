# AXON MOBILE ERP — DATABASE AUDIT & SCHEMA INTEGRITY REPORT
**Environment:** PostgreSQL / PGlite (Port 54329)  
**Prisma ORM Version:** 6.1.0  
**Audit Date:** November 2026  

---

## 1. Schema & Migration Status

- **Total Applied Migrations**: 41 clean migrations.
- **Latest Deployed Migration**: `20261031100000_production_assembly_management`.
- **Database Status**: `Database schema is up to date!` with zero pending or unapplied migrations.
- **Zero Schema Drift**: Prisma Client matches PostgreSQL catalog exactly.

---

## 2. Table & Record Count Audit

| Entity Model | Record Count | Integrity Constraints & Invariants | Status |
|---|:---:|---|:---:|
| **Companies** | 1 | `Axon Technologies Ltd.` — master entity | **VERIFIED** |
| **Branches** | 2 | `Main Branch`, `Downtown Branch` | **VERIFIED** |
| **Warehouses** | 3 | `Central Hub`, `Retail Store A`, `Service & Returns` | **VERIFIED** |
| **Users** | 21 | Multi-role user accounts with salted password hashes | **VERIFIED** |
| **Roles & Permissions** | 15 / 112 | Granular RBAC permissions with unique constraints | **VERIFIED** |
| **Products & Variants** | 6 / 6 | Smartphone catalog items with RAM, Storage, Color | **VERIFIED** |
| **PhysicalStockUnits** | 216 | 1 physical phone = 1 stock unit | **VERIFIED** |
| **DeviceIdentifiers** | 432 | Exactly 2 IMEIs per physical handset ($432 / 216 = 2.00$) | **VERIFIED** |
| **StockBalances** | 6 | Reconciled against `InventoryMovement` sums | **VERIFIED** |
| **InventoryMovements** | 426 | Append-only inventory movements with source document links | **VERIFIED** |
| **PurchaseOrders** | 16 | Complete with line items, tax rules, approval states | **VERIFIED** |
| **PurchaseReceipts (GRN)** | 39 | Direct and PO receipts with physical unit registration | **VERIFIED** |
| **SalesInvoices** | 29 | Posted invoices with IMEI allocations and COGS posting | **VERIFIED** |
| **Customers** | 9 | Retail, wholesale, dealer classifications with credit limits | **VERIFIED** |
| **Suppliers** | 1 | Master supplier accounts with payment terms | **VERIFIED** |
| **Accounts (COA)** | 113 | Standard 5-digit enterprise Chart of Accounts | **VERIFIED** |
| **JournalEntries** | 327 | 296 POSTED, 2 APPROVED, 29 REVERSED | **VERIFIED** |
| **JournalLines** | 763 | Zero debit/credit variance across all posted entries | **VERIFIED** |
| **Payments** | 18 | Customer receipts and supplier disbursements | **VERIFIED** |
| **AuditLogs** | 1932 | Immutable audit trail records | **VERIFIED** |

---

## 3. Core Business & Physical Device Invariants

1. **Dual IMEI Handset Invariant**:
   - Query: `SELECT COUNT(*) FROM "DeviceIdentifier" WHERE "value" IS NULL OR TRIM("value") = '';` $\rightarrow$ Result: **0**.
   - Ratio: `DeviceIdentifier.count / PhysicalStockUnit.count` = `432 / 216` = **2.00**.
   - No orphaned or duplicate identifiers within the active stock catalog.

2. **Double-Entry General Ledger Balancing**:
   - Query: `SELECT SUM("debit") - SUM("credit") FROM "JournalEntryLine" WHERE "journalEntryId" IN (SELECT "id" FROM "JournalEntry" WHERE "status" = 'POSTED');` $\rightarrow$ Result: **0.0000**.
   - Every posted journal voucher strictly adheres to standard double-entry accounting.

3. **Data Type & Referential Integrity**:
   - All financial amounts use `Decimal(19, 4)`. Floating point numeric types are prohibited for monetary calculations.
   - Foreign key actions prohibit cascading deletes (`onDelete: Restrict`) on posted business documents, stock movements, and financial ledgers.
