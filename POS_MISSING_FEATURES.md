# POS Gap Analysis & Missing Features Inventory Report

**System**: Axon Mobile ERP Retail Point of Sale (POS) Counter Terminal  
**Auditor**: Teamwork Architecture & Audit Group (`worker_m1`)  
**Date**: 2026-11-10T12:28:00Z  
**Repository Working Directory**: `d:\Inventory Managment Software`  
**Audit Scope**: Enumeration of Missing Features, Functional Gaps, Behavioral Defects, and Audit of all 15 Required POS Reports

---

## 1. Executive Summary of Audit Findings

The comprehensive technical audit of the Axon Mobile ERP POS subsystem revealed that while the core enterprise foundation is robust (Prisma ORM, PostgreSQL row-level locks, double-entry GL balancing, and specific identification COGS), several critical counter terminal features, UI workflows, database models, and reports are missing, incomplete, or broken.

This document provides an exhaustive inventory of all identified gaps, classified by architectural category, operational severity, and assigned implementation milestone.

---

## 2. Complete Missing Features & Functional Deficiencies Matrix

| # | Feature / Gap Area | Category | Current State in Codebase | Target Requirement | Severity | Milestone |
|:--:|:-------------------|:---------|:--------------------------|:-------------------|:--------:|:---------:|
| **1** | **Atomic POS Checkout Endpoint** | Backend / API | 8 chained client HTTP requests (`pos-workspace.tsx:380-515`) taking 2–4.5s; unposted payment risk on failure. | Single atomic endpoint `POST /api/pos/checkout` combining invoice, custody, GL, and payment in < 250ms. | **CRITICAL** | M3 |
| **2** | **Multi-Tender Split Payment UI** | Frontend / UI | Single radio selection (`saleType: "cash" \| "card" \| "wallet" \| "credit"`); no split tender capability. | Split payment grid allowing simultaneous Cash, Card POS, Mobile Wallets, Bank, and Credit with live balance. | **HIGH** | M5 |
| **3** | **Strict 1 Handset = 1 Cart Line** | Frontend / Cart | `pos-workspace.tsx:268` groups multiple handsets of same model into one line with `quantity > 1`. | Every physical handset locked strictly to quantity 1 on its own cart row with dual IMEIs visible. | **HIGH** | M4 |
| **4** | **Retail Keyboard Shortcuts** | Frontend / Hotkeys | `F6` (Salesperson), `F9` (Park Draft), and `F10` (Tender) are missing; `Esc` only closes search modal. | Global listeners for `F2`, `F3`, `F4`, `F6`, `F8`, `F9`, `F10`, `Ctrl+Enter`, and comprehensive `Esc`. | **MEDIUM** | M5 |
| **5** | **Purge Approval Workflows from POS** | UI / Workflow | Line 1428 renders "Submit for Approval" button; credit override sends HTTP approve call. | Remove all approval buttons, status badges, and intermediate checks; direct posting only. | **HIGH** | M5 |
| **6** | **PosTerminal & PosShift Database Models** | Database / Prisma | `prisma/schema.prisma` contains no models for terminals or cashier shifts. | Add `PosTerminal` and `PosShift` models with opening float, closing count, and cash variance. | **CRITICAL** | M2 |
| **7** | **Cashier Shift Opening & Float Management** | Frontend & API | No shift opening interface or cashier drawer float tracking exists. | Shift opening modal prompting cashier for drawer float upon terminal login. | **HIGH** | M6 |
| **8** | **Cashier Shift Closing & Cash Reconciliation** | Frontend & API | No denomination counting or cash reconciliation (Z-Report) exists. | Denomination count modal computing expected vs actual cash, variance, and isolating non-cash tenders. | **HIGH** | M6 |
| **9** | **Parked Cart In-Terminal Recall** | Frontend / UX | `pos-workspace.tsx:1600` navigates to `/sales/[id]/edit`, leaving POS; notice falsely claims stock is reserved. | Recall parked draft directly into `/pos?invoiceId=...`; correct notice to state stock remains available. | **MEDIUM** | M6 |
| **10**| **Parked Cart Live IMEI Re-Validation** | Frontend & API | Recalling a held cart skips re-checking device custody; sold handsets fail only at final checkout. | Recalling parked cart re-validates all handset IMEIs in real-time, highlighting unavailable units. | **HIGH** | M6 |
| **11**| **In-Terminal Counter Returns & Cash Refunds**| Frontend & API | Returns isolated in `/returns`; no counter return dialog or cash drawer refund integration. | Counter return modal in POS terminal restoring returned handset and deducting cash refund from drawer. | **MEDIUM** | M6 |
| **12**| **58mm Compact Thermal Receipt Layout** | Printing / CSS | Only A4 (`/sales/[id]/print`) and 80mm (`/sales/[id]/receipt`) exist; no 58mm layout. | Add `/sales/[id]/receipt-58mm` (32-column width) and direct print buttons on sale completion card. | **MEDIUM** | M6 |
| **13**| **Catalog Search Warehouse Property Bug** | Backend / API | `catalog/search/route.ts:28` queries `stockUnit: { warehouseId }`, throwing Prisma validation error. | Change query to `stockUnit: { currentWarehouseId: warehouseId, status: "IN_STOCK" }`. | **HIGH** | M4 |
| **14**| **Invoice-Level Discount Proration** | Frontend & API | No invoice-wide discount input exists in POS workspace; only line discounts supported. | Invoice discount input prorating discount proportionally across lines for accurate tax and GL posting. | **MEDIUM** | M3 |
| **15**| **7 Missing POS Operational Reports** | Reporting | 8 operational reports exist in reporting service; 7 essential POS counter reports are absent. | Implement the 7 missing POS reports in reporting service and operations report dashboard. | **HIGH** | M6 |

---

## 3. Comprehensive Audit of all 15 Required POS Reports

To fulfill reporting requirements, all 15 retail counter reports were audited against the codebase (`src/app/api/reports/operations/route.ts`, `src/lib/reports/services/`, and `src/components/reports/operations-report-workspace.tsx`):

| # | Report Name | Description & Key Metrics | Status in Codebase | Source File / Endpoint | Detailed Gap Analysis & Missing Elements |
|:--:|:------------|:--------------------------|:------------------:|:-----------------------|:-----------------------------------------|
| **1** | **Daily POS Sales Summary (Z-Report)** | End-of-day counter summary: Gross sales, discounts, taxes, net sales, cash/card/wallet collections, returns, net cash collected. | **PARTIAL** | `/api/reports/operations?report=sales` | Only returns raw invoice line items; lacks daily aggregated totals, tender breakdown, and shift cash reconciliation. |
| **2** | **Cashier Shift Reconciliation & Cash Discrepancy** | Opening cash float, cash sales, cash refunds, paid-in/out, expected cash, counted cash, overage/shortage variance. | **MISSING** | None | No shift models exist; no cash drawer session tracking or shift reconciliation report exists. |
| **3** | **Multi-Tender Payment Method Breakdown** | Revenue and transaction count grouped by payment method (Cash, Card POS, EasyPaisa, JazzCash, Raast, Bank, Credit). | **MISSING** | None | Payments are recorded in general ledger; no aggregated POS tender distribution summary report exists. |
| **4** | **Hourly POS Sales Distribution & Traffic** | Sales volume and foot traffic (transaction count) bucketed by hour of day (8 AM – 11 PM) for cashier staffing. | **MISSING** | None | No hourly aggregation service or visualization exists in operations reports. |
| **5** | **Product & Variant Sales Summary** | Quantity sold, average selling price, discounts, net revenue, and COGS grouped by product model and variant. | **EXISTS** | `sales-reports.ts:73` (`sales-by-model`) | Fully functional with revenue, units sold, average selling price, and gross margin percentage. |
| **6** | **Sales & Gross Margin by Brand** | Revenue, phone units sold, COGS, gross profit, and margin % aggregated by phone brand (Apple, Samsung, Xiaomi, etc.). | **EXISTS** | `sales-reports.ts:16` (`sales-by-brand`) | Fully functional with multi-criteria filtering and cost-permission guards. |
| **7** | **Line Profitability & Margin Analysis** | Invoice-by-invoice, line-by-line actual revenue, exact handset acquisition cost (IMEI-specific) or weighted average cost, profit & margin. | **EXISTS** | `operations/route.ts:256` (`profitability`) | Fully functional with exact acquisition cost resolution for serialized units. |
| **8** | **Salesperson Performance & Commission** | Counter sales lead metrics: invoice count, units sold, total sales revenue, gross margin contribution, and commission baseline. | **EXISTS** | `sales-reports.ts:139` (`salesperson-performance`) | Fully functional with salesperson lookup and margin contribution. |
| **9** | **Fast-Moving Stock Report** | High-velocity phone models sorted by units sold in period vs current warehouse on-hand stock to prevent stockouts. | **EXISTS** | `sales-reports.ts:197` (`fast-moving-stock`) | Fully functional comparing period sales against current on-hand balances. |
| **10**| **Slow-Moving / Dead Stock Capital-at-Risk** | Low-turnover phone models with zero or minimal sales and aging inventory, calculating total capital tied up. | **EXISTS** | `sales-reports.ts:197` (`slow-moving-stock`) | Fully functional with capital-at-risk calculation. |
| **11**| **Sold IMEI Audit & Customer Traceability Registry** | Master register of all sold handset IMEIs: IMEI1, IMEI2, sold date, customer, salesperson, and source invoice number. | **EXISTS** | `imei-reports.ts:63` (`sold-imei`) | Fully functional with dual-slot IMEI display and invoice linking. |
| **12**| **Available IMEI Counter Inventory & Aging** | Real-time registry of unsold handsets in counter warehouse with aging brackets (0-30, 31-60, 61-90, 90+ days) and landed cost. | **EXISTS** | `imei-reports.ts:56` (`available-imei`), `inventory-reports.ts:103` (`stock-aging`) | Fully functional with aging bucket breakdown and warehouse filtering. |
| **13**| **POS Customer Returns & IMEI Restock Audit** | Register of counter customer returns: original invoice, returned IMEI, return reason, disposition (Restock vs Quarantine), refund amount. | **PARTIAL** | `operations/route.ts:245` (`sales-returns`) | Tracks warehouse sales returns; lacks counter cash refund and exchange tracking. |
| **14**| **Discounts, Price Overrides & Exceptions Audit** | Audit log of all line-level discounts, invoice discounts, below-floor price overrides, and credit limit overrides executed at counter. | **MISSING** | None | Discounts are stored on invoice lines, but no dedicated exception/override audit report exists. |
| **15**| **Parked / Held Sales Drafts Status** | Register of currently held/parked sales: parking timestamp, cashier, customer, item count, total value, and hold duration. | **MISSING** | None | Only a basic modal query exists in `pos-workspace.tsx`; no reporting view, export, or abandoned cart alerts. |

---

## 4. Remediation Scope & Roadmap Summary

To bring the POS subsystem into full compliance with the master architecture:
1. **Database Tier (M2)**: Add `PosTerminal` and `PosShift` models to `prisma/schema.prisma` and deploy clean Prisma migration.
2. **Posting Engine Tier (M3)**: Implement `POST /api/pos/checkout` atomic transaction, purge approval checks, double-entry GL balancing, and specific identification COGS.
3. **Scanner & Inventory Tier (M4)**: Fix catalog search warehouse bug, verify dual-SIM IMEI resolution, enforce 1 handset = 1 cart row, and add accessory quantity stock checks.
4. **Counter UI Tier (M5)**: Redesign counter UI, implement `F2`–`F10` shortcuts, multi-tender split payment grid, and customer credit limit validation.
5. **Shifts, Returns & Reports Tier (M6)**: Build shift opening/closing & cash reconciliation, parked cart in-terminal recall with live IMEI re-validation, counter returns with drawer refund, 58mm compact thermal receipt, and all 15 POS reports.
