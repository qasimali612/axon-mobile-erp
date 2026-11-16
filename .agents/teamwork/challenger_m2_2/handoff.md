# Handoff Report: Challenger M2-2 (Financial, COGS & Tax Oracle Adversarial Verification)

**Challenger**: Challenger M2-2 (`challenger_m2_2`)  
**Role**: `teamwork_challenger` (critic, specialist - Financial, COGS & Tax Oracle Adversarial Verifier)  
**Parent Orchestrator ID**: `801c1388-1cc8-4ee1-9f96-99c33e953b3a`  
**Date**: 2026-11-16T08:28:30Z  
**Handoff Type**: Hard Handoff  
**Verdict**: **APPROVE**  

---

## 1. Observation

Direct code inspection, static analysis, and empirical test execution across implementation files and dedicated adversarial test harnesses yielded the following verified facts:

### 1.1 Actual-Cost COGS & Profit Integrity
- **Serialized Handsets (Specific Identification)** (`src/lib/operations/sales.ts:465-476`):
  ```typescript
  if (serialized) {
    if (!line.quantity.isInteger() || line.units.length !== line.quantity.toNumber()) throw new ApiError(409, "SERIALIZED_QUANTITY_MISMATCH", `Sales line ${line.lineNumber} physical-unit count is invalid.`);
    for (const link of line.units) {
      const unit = await lockPhysicalStockUnit(tx, { companyId: actor.companyId, stockUnitId: link.stockUnitId });
      ...
      lineCost = lineCost.plus(unit.acquisitionCost);
    }
    unitCost = lineCost.div(line.quantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
  }
  ```
  - `PhysicalStockUnit.acquisitionCost` is directly summed. Customer selling price (`line.unitPrice`) is completely decoupled and never referenced for COGS calculations.
- **Accessories & Quantity Items (Moving Weighted Average)** (`src/lib/operations/sales.ts:489-493`, `src/lib/operations/inventory.ts:240-243`):
  ```typescript
  unitCost = averageUnitCost(balance!);
  lineCost = line.quantity.equals(balance!.quantity)
    ? balance!.inventoryValue
    : unitCost.times(line.quantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
  ```
  ```typescript
  export function averageUnitCost(balance: { quantity: Prisma.Decimal; inventoryValue: Prisma.Decimal }) {
    if (balance.quantity.lte(0)) throw new ApiError(409, "NO_STOCK", "No stock is available for this item.");
    return balance.inventoryValue.div(balance.quantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
  }
  ```
  - Partial issues compute unit cost via `inventoryValue / quantity`. Full issues consume exact `inventoryValue` to prevent fractional rounding pennies remaining on zero quantity.
- **Double-Entry General Ledger Balancing** (`src/lib/operations/sales.ts:510-533`, `src/lib/operations/accounting.ts:202-207`):
  - In `postSalesInvoice()`:
    - Debit: Accounts Receivable (`grandTotal`)
    - Credit: Sales Revenue (`netRevenue = subtotal - discountTotal`)
    - Credit: Tax Payable (`taxTotal`, when > 0)
    - Debit: COGS (`totalCost`)
    - Credit: Inventory Asset (`totalCost`)
  - In `postOperationalJournal()`:
    ```typescript
    if (totalDebit.lte(0) || !totalDebit.equals(totalCredit)) {
      throw new ApiError(422, "UNBALANCED_SOURCE_JOURNAL", "Source journal debits and credits must be equal and positive.", {
        debit: moneyString(totalDebit),
        credit: moneyString(totalCredit),
      });
    }
    ```
  - Total Debits (`grandTotal + totalCost`) strictly equal Total Credits (`netRevenue + taxTotal + totalCost`) down to 4 decimal places.

### 1.2 Server-Side Tax Snapshotting
- **Tax Override Rejection** (`src/lib/operations/sales.ts:130-138`):
  ```typescript
  const taxPolicies = input.lines.map((line, index) => {
    const product = productMap.get(line.productId);
    if (!product) throw new ApiError(422, "INVALID_PRODUCT", `Sales line ${index + 1} product is unavailable.`);
    if (line.taxRuleId && line.taxRuleId !== product.taxRuleId) throw new ApiError(403, "SALES_TAX_OVERRIDE_FORBIDDEN", `Sales line ${index + 1} cannot override the configured product tax rule.`);
    if (product.taxRule && (!product.taxRule.isActive || !product.taxRule.appliesToSales)) throw new ApiError(422, "INVALID_TAX_RULE", `Sales line ${index + 1} tax rule is inactive or does not apply to sales.`);
    const taxRate = product.taxRule?.rate ?? zero();
    if (line.taxRate && !decimal(line.taxRate).eq(taxRate)) throw new ApiError(422, "TAX_RATE_MISMATCH", `Sales line ${index + 1} tax rate does not match the configured product rule.`);
    return { taxRuleId: product.taxRule?.id ?? null, taxRate };
  });
  ```
  - Client attempts to supply a mismatched `taxRuleId` throw `403 SALES_TAX_OVERRIDE_FORBIDDEN`.
  - Client attempts to supply a forged `taxRate` throw `422 TAX_RATE_MISMATCH`.
- **Snapshot Persistence** (`src/lib/operations/sales.ts:70, 226-234`):
  - Server calculates `taxAmount = gross.minus(discountAmount).times(taxRate).div(100).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)`.
  - `taxRate` and `taxAmount` are snapshotted onto each `SalesInvoiceLine` row in PostgreSQL.

### 1.3 Document Numbering Sequence & Historical Preservation
- **Single-Hyphen Sequence Standard** (`src/lib/document-sequence.ts:7-95, 98-102`):
  - `DOCUMENT_SEQUENCE_REGEX = /^[A-Z0-9]+-[A-Z0-9]+-FY[0-9]{4}-[0-9]{2}-[0-9]{6}$/`
  - Sanitization functions (`sanitizeBranchPrefix`, `sanitizeDocumentSuffix`, `sanitizePrefix`, `formatDocumentPrefix`) strip duplicate hyphens and non-alphanumerics, generating standard single-hyphen sequence numbers (e.g., `ISB-SI-FY2026-27-000008`).
- **Historical Record Safety** (`src/lib/document-sequence.ts:109-123`, `src/lib/operations/sales.ts:587-591`):
  - `HISTORICAL_DOCUMENT_SEQUENCE_REGEX = /^[A-Z0-9]+--[A-Z0-9]+-FY[0-9]{4}-[0-9]{2}-[0-9]{6}$/`
  - Historical invoice `ISB--SI-FY2026-27-000004` is recognized and strictly preserved.
  - No database migration, renumbering, or sanitization mutates existing invoice records.

### 1.4 Strict Idempotency Under Repeat Invocations
- **Early Return Guard** (`src/lib/operations/sales.ts:407`):
  ```typescript
  if (invoice.status === OperationalDocumentStatus.POSTED) return invoice;
  ```
- **Deterministic Idempotency Keys**:
  - GL Journal Entry: `SALES-INVOICE:${invoice.id}` (`sales.ts:523`)
  - Serialized Handset Movement: `SI:${invoice.id}:${line.id}:${unit.id}` (`sales.ts:551`)
  - Accessory Quantity Movement: `SI:${invoice.id}:${line.id}:QTY` (`sales.ts:573`)
- Repeat posting calls return the existing invoice record with 0 new journal entries and 0 new inventory movements.

### 1.5 Empirical Verification Tool Results
1. **Challenger M2-2 Dedicated Adversarial Suite**:
   ```bash
   npx vitest run src/__tests__/m2-financial-tax-cogs-adversarial.test.ts
   ```
   *Result*: **1 passed (1 file), 16 passed (16 tests), 0 failed, duration 719ms**.
2. **Sales Invoices E2E Acceptance Suite**:
   ```bash
   npx vitest run src/tests/e2e/sales-invoices-e2e.test.ts
   ```
   *Result*: **1 passed (1 file), 21 passed (21 tests), 0 failed, duration 523ms**.
3. **RBAC & Security Suite**:
   ```bash
   npx vitest run src/__tests__/settlement/m1-2-rbac-security.test.ts
   ```
   *Result*: **1 passed (1 file), 14 passed (14 tests), 0 failed, duration 1.05s**.
4. **Sales Posting Adversarial Suite**:
   ```bash
   npx vitest run src/lib/operations/sales-posting-adversarial.test.ts
   ```
   *Result*: **1 passed (1 file), 26 passed (26 tests), 0 failed, duration 1.21s**.
5. **Full Project Global Test Suite**:
   ```bash
   npx vitest run
   ```
   *Result*: **20 passed (20 files), 379 passed (379 tests), 0 failed, duration 5.99s**.
6. **Operations TypeScript Typecheck**:
   ```bash
   npx tsc -p tsconfig.ops.json --noEmit
   ```
   *Result*: **0 errors, exit code 0**.
7. **ESLint Code Quality**:
   ```bash
   npx eslint src/lib/operations/sales.ts src/lib/operations/accounting.ts src/lib/document-sequence.ts src/__tests__/m2-financial-tax-cogs-adversarial.test.ts
   ```
   *Result*: **0 errors, 0 warnings, exit code 0**.

---

## 2. Logic Chain

1. **Premise 1 (COGS Derivation & Profit Integrity)**:
   - For serialized handsets, lines 465-476 iterate through locked `PhysicalStockUnit` records and sum `unit.acquisitionCost`.
   - `line.unitPrice` is neither read nor referenced in line cost calculation.
   - For accessories, lines 489-493 query `StockBalance` and divide `inventoryValue` by `quantity`.
   - In `src/__tests__/m2-financial-tax-cogs-adversarial.test.ts`, tests with randomized selling prices (both above cost, below cost, and 5x cost) confirmed line costs remained invariant and exactly equal to acquisition cost and moving average.
   - *Inference*: Actual-cost COGS and gross profit calculations adhere strictly to GAAP/IFRS costing principles.

2. **Premise 2 (GL Double-Entry Invariant)**:
   - In `calculateSalesLines()`, `subtotal`, `discountTotal`, and `taxTotal` are rounded to 4 decimals (`ROUND_HALF_UP`).
   - `netRevenue = subtotal - discountTotal`.
   - `grandTotal = netRevenue + taxTotal`.
   - Debit lines (`grandTotal` on AR, `totalCost` on COGS) sum to `grandTotal + totalCost`.
   - Credit lines (`netRevenue` on Sales Revenue, `taxTotal` on Tax Payable, `totalCost` on Inventory Asset) sum to `netRevenue + taxTotal + totalCost = grandTotal + totalCost`.
   - In `src/__tests__/m2-financial-tax-cogs-adversarial.test.ts`, fuzz-testing 100 randomized multi-line transactions across random tax rates (0-25%), discounts, and quantities confirmed `sumDebits === sumCredits` with zero variance across all iterations.
   - *Inference*: GL double-entry journals are guaranteed to balance atomically.

3. **Premise 3 (Tax Snapshotting & Tamper Resistance)**:
   - Client-provided tax payloads are validated against configured active rules. Discrepancies throw `403 SALES_TAX_OVERRIDE_FORBIDDEN` or `422 TAX_RATE_MISMATCH`.
   - In `sales-invoices-e2e.test.ts` (Req 8) and `m2-financial-tax-cogs-adversarial.test.ts` (Oracle 2), client forged rates (e.g. 0%, 5%, 50%) were rejected by the server, while valid lines snapshotted server-computed `taxRate` and `taxAmount`.
   - *Inference*: Tax liabilities cannot be manipulated by client-side tampering.

4. **Premise 4 (Document Numbering & Historical Safety)**:
   - `formatDocumentPrefix()` and `sanitizePrefix()` enforce single-hyphen segment joining (`ISB-SI`).
   - `nextDocumentNumber()` allocates via `INSERT ... ON CONFLICT DO UPDATE SET "nextValue" = "nextValue" + 1`, ensuring sequential, single-hyphen formatting (`ISB-SI-FY2026-27-000008`) and race condition safety.
   - Historical invoices (such as `ISB--SI-FY2026-27-000004`) are matched by `HISTORICAL_DOCUMENT_SEQUENCE_REGEX` and remain unaltered.
   - *Inference*: Document numbering satisfies format standardization without risking historical data corruption.

5. **Premise 5 (Idempotency Invariant)**:
   - `postSalesInvoice()` guards with `if (invoice.status === POSTED) return invoice;` under row-level lock.
   - Idempotency keys on GL entries (`SALES-INVOICE:${id}`) and stock movements (`SI:${id}:${lineId}:${unitId}`) prevent duplicate insertion.
   - Tests in `sales-invoices-e2e.test.ts` (Req 20) and `m2-financial-tax-cogs-adversarial.test.ts` (Oracle 4) verified that repeat posting produces identical return values with 0 duplicate movements or journals.
   - *Inference*: Duplicate API submissions cannot cause double-counting or double inventory deduction.

---

## 3. Caveats

- **No Caveats**: All 4 financial, COGS, tax, numbering, and idempotency criteria specified in the dispatch instructions were thoroughly and empirically verified with 0 regressions.

---

## 4. Conclusion

**Verdict: APPROVE**

Milestone 2 Order-to-Cash implementation satisfies all financial, accounting, inventory, and architectural requirements:
1. Serialized handsets debit COGS strictly using `PhysicalStockUnit.acquisitionCost`, never selling price.
2. Non-serialized items utilize moving weighted average costing (`inventoryValue / quantity`).
3. General Ledger journal entries are strictly balanced: Total Debits == Total Credits.
4. Server-side tax calculation snapshots rates and amounts, rejecting client-side overrides (`403 SALES_TAX_OVERRIDE_FORBIDDEN` / `422 TAX_RATE_MISMATCH`).
5. New documents generate standardized single-hyphen numbers (`ISB-SI-FY2026-27-xxxxxx`) while historical records (`ISB--SI-FY2026-27-000004`) remain preserved.
6. Posting is strictly idempotent and safe against duplicate submissions.

---

## 5. Verification Method

To independently reproduce all empirical findings:

1. **Run Challenger M2-2 Dedicated Adversarial Suite**:
   ```powershell
   npx vitest run src/__tests__/m2-financial-tax-cogs-adversarial.test.ts
   ```
2. **Run Order-to-Cash E2E Acceptance Suite**:
   ```powershell
   npx vitest run src/tests/e2e/sales-invoices-e2e.test.ts
   ```
3. **Run Settlement RBAC & Security Suite**:
   ```powershell
   npx vitest run src/__tests__/settlement/m1-2-rbac-security.test.ts
   ```
4. **Run Global Test Suite (20 test files, 379 tests)**:
   ```powershell
   npx vitest run
   ```
5. **Run TypeScript Typecheck**:
   ```powershell
   npx tsc -p tsconfig.ops.json --noEmit
   ```
6. **Run ESLint Code Quality**:
   ```powershell
   npx eslint src/lib/operations/sales.ts src/lib/operations/accounting.ts src/lib/document-sequence.ts src/__tests__/m2-financial-tax-cogs-adversarial.test.ts
   ```
