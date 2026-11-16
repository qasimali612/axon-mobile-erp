# Milestone 2 Independent Review & Adversarial Challenge Report

**Reviewer**: Reviewer M2-1 (`reviewer_m2_1`)  
**Role**: `teamwork_reviewer` (reviewer, critic)  
**Parent Orchestrator ID**: `801c1388-1cc8-4ee1-9f96-99c33e953b3a`  
**Date**: 2026-11-16T08:26:00Z  
**Verdict**: **APPROVE**  

---

## 1. Observation

Direct code inspection, AST verification, and empirical test execution against the Milestone 2 codebase yielded the following verifiable facts:

### 1.1 Handset Custody & Dual-IMEI Tracking
- **PhysicalStockUnit & DeviceIdentifier Models** (`prisma/schema.prisma:2204-2259`):
  - `PhysicalStockUnit` represents exactly 1 physical phone (`id: Uuid`, `status: StockUnitStatus @default(IN_STOCK)`, `acquisitionCost: Decimal(19,4)`, `currentWarehouseId: Uuid?`, `currentBranchId: Uuid?`, `soldAt: DateTime?`, `version: Int`).
  - `DeviceIdentifier` tracks slot 1 (IMEI1) and slot 2 (IMEI2) mapped to the same `stockUnitId`. Uniqueness is enforced at the database schema level:
    ```prisma
    @@unique([companyId, type, normalizedValue])
    @@unique([stockUnitId, type, slot])
    ```
- **Validation & Duplicate Prevention** (`src/lib/operations/inventory.ts:170-215`):
  - `normalizeDeviceIdentifiers()` enforces unique slots for all IMEIs and ensures distinct IMEI values across SIM slots:
    ```typescript
    if (seenUnitIdentifiers.has(key)) {
      if (identifier.type === IdentifierType.IMEI) {
        throw new ApiError(422, "DUPLICATE_IDENTIFIER", `Dual-SIM device cannot have identical IMEI 1 and IMEI 2: ${identifier.value}. Each SIM slot requires a distinct IMEI.`);
      }
      throw new ApiError(422, "DUPLICATE_IDENTIFIER", `Identifier ${identifier.value} is duplicated on the same physical unit.`);
    }
    ```
  - Serialized quantity invariant is strictly enforced in `src/lib/operations/sales.ts:152-154`:
    ```typescript
    if (serialized && (!quantity.isInteger() || line.stockUnitIds.length !== quantity.toNumber())) {
      throw new ApiError(422, "SERIALIZED_QUANTITY_MISMATCH", `Sales line ${index + 1} requires one physical stock unit per item.`);
    }
    ```
- **Warehouse Custody & Concurrency Protection** (`src/lib/operations/inventory.ts:221-225`, `src/lib/operations/sales.ts:468-475, 541-563`):
  - `lockPhysicalStockUnit()` issues pessimistic row-level locking:
    ```typescript
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "PhysicalStockUnit"
      WHERE "id" = ${input.stockUnitId}::uuid AND "companyId" = ${input.companyId}::uuid
      FOR UPDATE
    `);
    ```
  - `postSalesInvoice()` verifies active `IN_STOCK` status, warehouse custody, and product/variant identity:
    ```typescript
    if (unit.status !== StockUnitStatus.IN_STOCK || unit.currentWarehouseId !== invoice.warehouseId || unit.productId !== line.productId || unit.variantId !== line.variantId) {
      throw new ApiError(409, "STOCK_UNIT_UNAVAILABLE", `A physical unit on sales line ${line.lineNumber} is no longer available.`);
    }
    ```
  - Active unexpired reservations are checked via `tx.inventoryReservation.findFirst`, throwing `409 STOCK_UNIT_RESERVED` if reserved.
  - Upon posting, handset custody is atomically cleared (`currentBranchId: null, currentWarehouseId: null, currentLocationId: null`), status is set to `StockUnitStatus.SOLD`, `soldAt: new Date()` is recorded, and `version` is incremented.

### 1.2 Actual-Cost COGS & GL Double-Entry Invariants
- **Costing Engine** (`src/lib/operations/sales.ts:463-497`):
  - Serialized handsets use Specific Identification derived strictly from historical `unit.acquisitionCost`:
    ```typescript
    lineCost = lineCost.plus(unit.acquisitionCost);
    unitCost = lineCost.div(line.quantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    ```
    Selling price (`unitPrice`) is never used in COGS calculations.
  - Accessories and quantity-tracked items use Moving Weighted Average (`src/lib/operations/sales.ts:489-493`, `src/lib/operations/inventory.ts:240-243`):
    ```typescript
    unitCost = averageUnitCost(balance!); // balance.inventoryValue.div(balance.quantity)
    lineCost = line.quantity.equals(balance!.quantity)
      ? balance!.inventoryValue
      : unitCost.times(line.quantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    ```
- **Balanced GL Double-Entry** (`src/lib/operations/sales.ts:510-533`, `src/lib/operations/accounting.ts:172-207`):
  - Debits:
    - Accounts Receivable: `invoice.grandTotal`
    - COGS: `totalCost`
  - Credits:
    - Sales Revenue: `netRevenue = invoice.subtotal - invoice.discountTotal`
    - Tax Payable: `invoice.taxTotal` (if gt 0)
    - Inventory Asset: `totalCost`
  - Balance Verification:
    Because `grandTotal = netRevenue + taxTotal`:
    $\sum \text{Debits} = \text{grandTotal} + \text{totalCost} \equiv \text{netRevenue} + \text{taxTotal} + \text{totalCost} = \sum \text{Credits}$.
    `postOperationalJournal()` strictly validates equality:
    ```typescript
    if (totalDebit.lte(0) || !totalDebit.equals(totalCredit)) {
      throw new ApiError(422, "UNBALANCED_SOURCE_JOURNAL", "Source journal debits and credits must be equal and positive.", {
        debit: moneyString(totalDebit),
        credit: moneyString(totalCredit),
      });
    }
    ```

### 1.3 Server-Side Tax Policy & Snapshotting
- **Tax Enforcement** (`src/lib/operations/sales.ts:130-138, 226-234, 317-325`):
  - Tax rate is derived strictly from configured server rules: `product.taxRule?.rate ?? zero()`.
  - Client-side tax overrides are rejected:
    ```typescript
    if (line.taxRuleId && line.taxRuleId !== product.taxRuleId) {
      throw new ApiError(403, "SALES_TAX_OVERRIDE_FORBIDDEN", `Sales line ${index + 1} cannot override the configured product tax rule.`);
    }
    if (line.taxRate && !decimal(line.taxRate).eq(taxRate)) {
      throw new ApiError(422, "TAX_RATE_MISMATCH", `Sales line ${index + 1} tax rate does not match the configured product rule.`);
    }
    ```
  - Line snapshots for `taxRuleId`, `taxRate`, and server-computed `taxAmount` are persisted directly to `SalesInvoiceLine`.

### 1.4 Document Numbering Sanitization & Historical Record Safety
- **Single-Hyphen Sequences** (`src/lib/document-sequence.ts:7-95`, `src/lib/operations/accounting.ts:105-113`):
  - `sanitizeBranchPrefix()` and `sanitizeDocumentSuffix()` strip non-alphanumerics and clean up hyphens.
  - `formatDocumentPrefix()` joins with a single hyphen (`ISB-SI`).
  - `nextDocumentNumber()` allocates clean single-hyphen sequence numbers (`ISB-SI-FY2026-27-000008`) under row locks.
  - Historical records (`ISB--SI-FY2026-27-000004`) are strictly preserved in their original format with zero renaming or data mutation. In `sales-posting-adversarial.test.ts` Probe 6, historical document eligibility for direct posting without renaming was confirmed.

### 1.5 Deterministic Idempotency
- **Document Level** (`src/lib/operations/sales.ts:407`):
  ```typescript
  if (invoice.status === OperationalDocumentStatus.POSTED) return invoice;
  ```
- **Composite Idempotency Keys**:
  - GL Journal Entry: `SALES-INVOICE:${invoice.id}` (`sales.ts:523`, checked via `companyId_sourceModule_idempotencyKey` in `accounting.ts:155-169`)
  - Serialized Stock Movement: `SI:${invoice.id}:${line.id}:${unit.id}` (`sales.ts:551`, checked via `companyId_idempotencyKey` in `inventory.ts:63-71`)
  - Accessory Stock Movement: `SI:${invoice.id}:${line.id}:QTY` (`sales.ts:573`, checked via `companyId_idempotencyKey` in `inventory.ts:63-71`)

### 1.6 Verification Commands Executed
All verification commands were executed independently with zero failures:
1. `npx tsc -p tsconfig.ops.json --noEmit` -> **Exit code 0, 0 type errors**
2. `npx vitest run src/tests/e2e/sales-invoices-e2e.test.ts` -> **1 passed, 21 passed (21 tests), duration 533ms**
3. `npx vitest run src/lib/operations/sales-posting-adversarial.test.ts` -> **1 passed, 26 passed (26 tests), duration 700ms**
4. `npx vitest run src/__tests__/settlement/m1-2-rbac-security.test.ts` -> **1 passed, 14 passed (14 tests), duration 909ms**
5. `npx vitest run` (Global project test suite) -> **19 passed (19 files), 363 passed (363 tests), duration 5.55s**
6. `npx eslint src/lib/operations/sales.ts src/lib/operations/accounting.ts src/lib/document-sequence.ts` -> **Exit code 0, 0 lint errors/warnings**

---

## 2. Logic Chain

1. **Premise 1 (Handset Tracking & Concurrency)**:
   - Each `PhysicalStockUnit` has a unique primary key and points to 1 physical device.
   - Dual-IMEI devices are assigned two `DeviceIdentifier` records with slots `1` and `2` referencing the same `stockUnitId`.
   - `normalizeDeviceIdentifiers()` prohibits duplicate IMEIs across slots on the same unit.
   - Schema constraints `@@unique([companyId, type, normalizedValue])` prevent duplicate IMEIs across devices.
   - `lockPhysicalStockUnit()` executes `SELECT ... FOR UPDATE` row locks inside a `Serializable` transaction before checking unit availability and warehouse custody.
   - *Inference*: Any two concurrent sales operations attempting to post the same handset (whether referenced by IMEI1 or IMEI2) are serialized. The first caller transitions the unit to `SOLD` and clears its warehouse custody; the second caller encounters `unit.status !== IN_STOCK` and is safely rejected with `409 STOCK_UNIT_UNAVAILABLE`.

2. **Premise 2 (Costing Accuracy & Accounting Balance)**:
   - Serialized items compute COGS strictly from `unit.acquisitionCost` stored on the physical unit, ignoring selling price.
   - Accessories compute COGS using weighted average costing from `StockBalance`, using `balance.inventoryValue` when the full balance is sold to avoid penny drift.
   - `postOperationalJournal()` enforces $\sum \text{Debits} \equiv \sum \text{Credits}$ to 4 decimal places.
   - *Inference*: COGS and inventory asset balances reflect real acquisition costs without margin distortions or GL out-of-balance entries.

3. **Premise 3 (Server Tax Integrity)**:
   - Client-provided tax rules and rates are strictly compared against the database `product.taxRule`.
   - Any divergence triggers `403 SALES_TAX_OVERRIDE_FORBIDDEN` or `422 TAX_RATE_MISMATCH`.
   - Server-computed rates and amounts are snapshotted on lines.
   - *Inference*: Untrusted client inputs cannot forge tax exemptions or manipulate output tax liability.

4. **Premise 4 (Numbering Sanitization & Historical Protection)**:
   - Prefix generation sanitizes branch code and suffix into single-hyphen format (`ISB-SI`).
   - `nextDocumentNumber()` updates `DocumentSequence.prefix` without touching existing documents.
   - *Inference*: Future invoices generate numbers in `ISB-SI-FY2026-27-000008` format while legacy records like `ISB--SI-FY2026-27-000004` remain intact, searchable, and postable.

5. **Premise 5 (Strict Idempotency)**:
   - `postSalesInvoice()` returns immediately if status is already `POSTED`.
   - Unique composite idempotency keys at the journal level (`SALES-INVOICE:${id}`) and stock movement level (`SI:${id}:${lineId}:${unitId}`) prevent duplicate GL and inventory entries.
   - *Inference*: Repeated API calls or network retries are completely safe and produce no duplicate ledger side effects.

---

## 3. Caveats

- **Test Fixture Note**: `src/tests/e2e/sales-invoices-e2e.test.ts` uses an in-memory database mock for speed and zero-socket network isolation in Windows sandbox environments. However, the production implementation in `src/lib/operations/sales.ts` was independently validated via AST analysis, TypeScript compiler checks (`tsc -p tsconfig.ops.json`), and unit/adversarial probes (`sales-posting-adversarial.test.ts`).

---

## 4. Conclusion

### **Verdict: APPROVE**

The Milestone 2 implementation satisfies all technical, functional, and accounting requirements specified in `ORIGINAL_REQUEST.md`:
1. **Handset Custody & Dual-IMEI Tracking**: Verified. 1 handset = 1 unit; slot 1 = IMEI1, slot 2 = IMEI2; duplicate IMEI prevention and warehouse custody checks are enforced; pessimistic row locking (`FOR UPDATE`) eliminates race conditions.
2. **Actual-Cost COGS & GL Double-Entry**: Verified. Specific identification uses `unit.acquisitionCost` (never selling price); accessories use weighted moving average; journal debits and credits balance to 4 decimal places.
3. **Server-Side Tax Policy & Snapshotting**: Verified. Server rules dictate tax rates; client overrides are rejected with 403; tax snapshots are stored on invoice lines.
4. **Document Numbering Sanitization**: Verified. Allocates single-hyphen format (`ISB-SI-FY2026-27-000008`) for new vouchers while preserving historical records (`ISB--SI-FY2026-27-000004`).
5. **Idempotency**: Verified. Re-posting guard returns existing invoice; deterministic composite idempotency keys prevent duplicate stock movements and journal entries.
6. **Integrity & Code Quality**: Verified. Zero hardcoded test shortcuts in production code; all 363 automated test cases pass; TypeScript compilation and ESLint pass with zero errors.

---

## 5. Verification Method

To independently reproduce and verify this review:
1. **Run TypeScript Operations Compiler**:
   ```powershell
   npx tsc -p tsconfig.ops.json --noEmit
   ```
   *Expected: Exit code 0, no errors.*
2. **Run Order-to-Cash E2E Acceptance Suite**:
   ```powershell
   npx vitest run src/tests/e2e/sales-invoices-e2e.test.ts
   ```
   *Expected: 21 of 21 tests pass.*
3. **Run Sales Posting Adversarial Suite**:
   ```powershell
   npx vitest run src/lib/operations/sales-posting-adversarial.test.ts
   ```
   *Expected: 26 of 26 tests pass.*
4. **Run RBAC & Security Suite**:
   ```powershell
   npx vitest run src/__tests__/settlement/m1-2-rbac-security.test.ts
   ```
   *Expected: 14 of 14 tests pass.*
5. **Run ESLint on Modified Operations Files**:
   ```powershell
   npx eslint src/lib/operations/sales.ts src/lib/operations/accounting.ts src/lib/document-sequence.ts
   ```
   *Expected: 0 lint errors, 0 warnings.*
6. **Run Complete Project Test Suite**:
   ```powershell
   npx vitest run
   ```
   *Expected: 363 tests pass across 19 files.*
