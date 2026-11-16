# Project Context

## Project Information
- Project Name: Axon Mobile ERP - Point of Sale (POS) Module
- Working Directory: d:\Inventory Managment Software
- Operating System: Windows
- Primary Stack: TypeScript / Node.js / React / Next.js / Prisma (to be confirmed during survey)
- Caller/Parent Agent ID: 806e8aac-aff5-43d0-8f40-a48fad2c6dc6

## Core Architectural Directives
- **Direct Atomic Posting**: No approval queues, no maker-checker steps. Direct atomic database transaction.
- **Dual Inventory Model**:
  - Individually tracked IMEI handsets (fixed qty = 1, IMEI1/IMEI2 resolve to same physical unit, verify warehouse custody and availability, duplicate rejected).
  - Quantity accessories and spare parts (manual qty, warehouse stock check, prevent negative stock).
- **Accounting Integrity**:
  - Real-cost COGS posting (Debit COGS, Credit Inventory Asset).
  - Revenue, Output Tax, Multi-tender receipts, AR subledger balanced in GL.
- **Document Numbering**: Sequential format e.g. `ISB-SI-FY2026-27-000001` preserving historical references.
- **Retail Terminal UI**: Keyboard shortcuts (F2, F3, F4, F6, F8, F9, F10, Ctrl+Enter, Esc), auto-focusing scanner input.
- **Operational Features**: Shifts/cash drawers, parked carts, invoice returns with credit reversals, multi-format printing (A4, 80mm, 58mm), 15 POS reports.
- **Historical Safety**: Never delete, truncate, or rewrite historical invoice, receipt, stock movement, or accounting records.
