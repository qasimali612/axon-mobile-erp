# POS IMPLEMENTATION PLAN — AXON MOBILE ERP
**Module:** Point of Sale (POS) Architecture Overhaul & Professional Completion  
**Execution Mode:** Audit -> Fix -> Complete -> Test -> Verify  
**Audit Date:** November 2026  
**Author:** Senior ERP Solution Architect  

---

## 1. Phased Roadmap

### Phase 1: Comprehensive Audit (COMPLETED)
- Audited POS components, routes, database models, catalog resolution, stock balances, device identifiers, and payment allocations.
- Authored 9 audit artifacts in root directory.

### Phase 2: Database & Backend Services
1. **Develop Unified POS Checkout Engine (`src/lib/operations/pos.ts`):**
   - Single atomic `prisma.$transaction` with `Serializable` isolation.
   - Dual-SIM handset custody locking and status transition to `SOLD`.
   - Quantity stock balance verification and weighted-average COGS.
   - Revenue, output tax, and balanced GL journal vouchers.
   - Multi-tender receipt voucher creation and allocation against invoice receivable.
   - Credit sale and advance payment accounting.
   - Zero-approval direct posting.
2. **Create REST API Endpoints:**
   - `POST /api/pos/checkout`: Primary atomic counter transaction.
   - `GET /api/pos/shifts/active`: Retrieve active shift for current cashier/terminal.
   - `POST /api/pos/shifts`: Open shift with opening cash float.
   - `POST /api/pos/shifts/[id]/close`: Close shift with cash drawer count and variance.
   - `GET /api/pos/parked`: Retrieve parked counter carts.

### Phase 3: Inventory & Accounting Verification
- Verify specific identification landed cost per device sold.
- Verify weighted average cost for accessories.
- Verify balanced GL journals (Total Dr = Total Cr).
- Verify net customer receivable updates for credit sales.

### Phase 4: POS UI/UX & Counter Terminal Redesign
1. **Header & Context:**
   - Branch, Warehouse, Terminal, Cashier, Price List, and Shift Status banner.
   - Shift drawer open/close modal.
2. **Keyboard Ergonomics:**
   - F2 (Catalog), F3 (Scanner), F4 (Customer), F6 (Salesperson), F8 (Clear), F9 (Park), F10 (Tender), Ctrl+Enter (Complete & Post), Esc (Close Modal).
3. **Cart & Scanner:**
   - Fast auto-add on barcode scanner burst.
   - Prominent Dual-SIM display (IMEI1 / IMEI2).
   - Quantity stepper for accessories; locked 1-unit for handsets.
4. **Tender & Payment Console:**
   - Support Single & Multi-Tender modes.
   - Quick Cash denomination chips (+500, +1000, +5000, Exact).
   - Card POS, Mobile Wallet (Raast/EasyPaisa/JazzCash), and Credit Terms.
   - Advance down payment calculator and live remaining due banner.
   - High-contrast change return display.

### Phase 5: Thermal Receipt & Printing Enhancements
- 80mm thermal receipt with Code128 barcode, dual IMEIs, split tender breakdown, remaining due, and return policy.
- Standard A4 invoice printing.

### Phase 6: Automated Testing & Verification
- Unit & integration tests for atomic checkout, dual-SIM IMEI validation, multi-tender allocations, and shift closures.
- Vitest acceptance test execution.
- TypeScript compiler verification across all project configs.

### Phase 7: Deployment & Remote Synchronization
- Commit all code changes with descriptive conventional messages.
- Push clean commits to `origin main`.
- Deliver comprehensive implementation report with empirical evidence.

---
© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
