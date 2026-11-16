# AXON MOBILE ERP — POS TESTING INFRASTRUCTURE & ARCHITECTURE SPECIFICATION
## End-to-End, Requirement-Driven Automated Verification Framework

**Document Version:** 1.0.0  
**Effective Date:** November 2026  
**Target Module:** POS Counter Terminal & Operations Accounting  
**Execution Engine:** Vitest v4.1.x / TypeScript 5.9+ / Node.js 20+  
**Authority:** `ORIGINAL_REQUEST.md` & `PROJECT.md`

---

## 1. Executive Summary & Purpose

The Axon Mobile ERP POS Counter Terminal serves high-throughput retail stores dealing in serialized mobile phones (Dual-SIM IMEIs) and quantity-based accessories. This testing infrastructure defines the opaque-box, requirement-driven test architecture designed to certify production readiness across all commercial, operational, and double-entry accounting criteria without reliance on approval workflows.

All test suites verify system invariants against mathematical identities, regulatory fiscal numbering formats, exact landed-cost accounting principles, and retail cash-drawer controls.

---

## 2. Test Architecture & Runner Environment

### 2.1 Runner & Configuration
- **Test Engine**: Vitest (`vitest.config.mts`) running under the Node environment.
- **Path Resolution**: Direct module aliases `@/*` mapping to `./src/*`.
- **Isolation Principle**: Each test case is fully isolated, deterministic, and self-contained with no shared mutable state or execution-order dependencies.
- **Progressive Testability**: Verification exercises pure business logic, mathematical formulas, state machine validations, and domain engine contracts directly, enabling immediate verification and regression protection.

### 2.2 Execution Command
```bash
# Run the complete POS acceptance test suite
npx vitest run src/lib/operations/pos-acceptance.test.ts

# Run the complete project test suite
npm test
```

---

## 3. Feature Inventory & Acceptance Mapping

The test suite directly exercises and validates the R1–R5 user requirements and PROJECT.md Feature Inventory:

| Requirement | POS Feature | Implementation / Domain Target | Testing Scope |
|---|---|---|---|
| **R1 / F19** | Elimination of Approval Backend Checks | Direct checkout posting engine | Verifies maker-checker and approval band elimination; instant POSTED state without approval queues |
| **R2 / F3** | Dual-SIM IMEI Resolution & Deduplication | Device identifier resolver | Validates that scanning either IMEI1 or IMEI2 resolves to the same physical unit; rejects duplicate scans |
| **R2 / F7** | Fixed Handset Cart Line (1 unit = 1 row) | POS cart state validator | Locks serialized handset cart lines strictly to quantity = 1; forbids batch grouping |
| **R2 / F8** | Accessory Quantity Stock Controls | Stock boundary validation | Enforces available stock ceiling for accessories; strictly prevents negative inventory |
| **R2 / F13** | Multi-Tender Split Payment Checkout | Split tender payment engine | Supports simultaneous Cash, Card POS, Mobile Wallets, and Credit; validates total tenders balance invoice |
| **R3 / F21** | Balanced Commercial Journal Entry | Double-entry GL engine | Generates atomic balanced journal: DR AR, CR Revenue, CR Tax, DR COGS, CR Inventory Asset |
| **R3 / F22** | Balanced Receipt Journal Entry | Double-entry receipt engine | Generates atomic receipt journal: DR Cash/Bank/Wallet, CR AR |
| **R3 / F23** | Specific Identification Landed Cost | Handset COGS calculator | Strictly debits exact `acquisitionCost` per physical handset unit to COGS |
| **R3 / F24** | Weighted Average COGS | Accessory COGS calculator | Computes and debits weighted average cost `(inventoryValue / quantity)` for accessories |
| **R4 / F17** | Sequential Document Numbering Format | Document sequence formatter | Enforces single-hyphen format `ISB-SI-FY2026-27-000001` with hyphen sanitization preserving historical records |
| **R5 / F25-26** | Shift Management & Drawer Reconciliation | POS shift cash manager | Reconciles opening float, cash sales, cash refunds, and closing counts; strictly excludes card/digital tenders |
| **R2 / F27-28** | Parked Cart Holding & Custody Recall | Parked draft cart engine | Holds drafts without stock reservation; re-validates IMEI custody upon terminal recall |
| **R3 / F29** | IMEI Customer Returns & GL Credit Reversals | Return & refund engine | Validates original invoice and sold IMEI; posts balanced double-entry credit notes and restores stock |

---

## 4. 4-Tier Testing Methodology

The test suite is structured into four explicit, progressive verification tiers:

```
+--------------------------------------------------------------------------+
| Tier 4: Real-World Retail Application Scenarios                          |
| - Full business day simulation: Shift Open -> Multi-Tender Checkout ->   |
|   Parked Sale Recall -> Serialized Customer Return -> Drawer Count       |
+--------------------------------------------------------------------------+
                                    ^
+--------------------------------------------------------------------------+
| Tier 3: Cross-Feature Combinations (Pairwise Coverage)                   |
| - Handset + Accessory mixed cart checkout with multi-tender split        |
| - Parked cart recall with dynamic price list change & live stock check   |
| - Customer partial return with cash drawer refund impacting shift count  |
+--------------------------------------------------------------------------+
                                    ^
+--------------------------------------------------------------------------+
| Tier 2: Boundary & Corner Cases (>= 5 tests per feature)                 |
| - Zero / negative quantities & prices; invalid Luhn IMEI check digits     |
| - Single-cent rounding, tax boundary extremes, unallocated tender deltas|
| - Multi-hyphen prefix sanitization, historical ID preservation           |
| - Drawer overage / shortage edge cases with digital tender isolation     |
+--------------------------------------------------------------------------+
                                    ^
+--------------------------------------------------------------------------+
| Tier 1: Feature Coverage (>= 5 tests per feature)                        |
| - Primary happy-path behavior for all 9 core POS feature domains         |
| - Contract conformance for inputs, outputs, error codes, and GL balances |
+--------------------------------------------------------------------------+
```

### Tier 1: Feature Coverage (>= 5 tests per feature)
- Validates the functional happy-path for each POS capability.
- Asserts that valid inputs produce expected outputs conforming to the schema and accounting identities.
- At least 5 distinct test cases per core feature.

### Tier 2: Boundary & Corner Cases (>= 5 tests per feature)
- Evaluates adversarial, malformed, and extreme inputs.
- Verifies rejection of invalid Luhn IMEIs, non-numeric values, negative prices, zero quantities, empty lines, and duplicate identifiers.
- Tests single-cent rounding tolerances, maximum discount caps, credit limit thresholds, and non-cash tender leakage into the cash drawer.
- At least 5 distinct test cases per core feature.

### Tier 3: Cross-Feature Combinations (Pairwise Matrix)
- Exercises combinatorial interactions across distinct POS subsystems.
- Mixed cart sales containing serialized handsets and non-serialized accessories.
- Split tenders involving cash, digital wallets, bank transfers, and customer credit limits.
- Parked cart holding across inventory price changes and stock re-validations.
- Customer return workflow generating credit reversals and updating active shift cash positions.

### Tier 4: Real-World Retail Application Scenarios
- End-to-end operational lifecycle simulations representing realistic retail trading days.
- Morning shift opening with cash float -> peak rush hour dual-SIM smartphone checkout -> accessory upsell with line discount -> customer requests split payment -> parked draft held while customer retrieves wallet -> recalled and tendered -> evening return of defective accessory with cash refund -> end-of-day shift closing with physical denomination count and variance calculation.

---

## 5. Authoritative Expected Output Derivation & Precision Rules

All test expectations are derived strictly from authoritative sources:
1. **Double-Entry Accounting Invariant**:
   $$\sum \text{Debits} \equiv \sum \text{Credits}$$
   $$\text{Debit AR} = \text{Credit Revenue} + \text{Credit Tax}$$
   $$\text{Debit COGS} = \text{Credit Inventory Asset}$$
   $$\text{Debit Cash/Bank} = \text{Credit AR}$$
2. **Specific Identification Landed Cost**:
   $$\text{COGS}_{\text{handset}} = \text{PhysicalStockUnit.acquisitionCost}$$
3. **Weighted Average Cost Formula**:
   $$\text{COGS}_{\text{accessory}} = \text{Quantity} \times \left(\frac{\text{Current Inventory Value}}{\text{Current Stock Balance}}\right)$$
4. **Document Sequence Single-Hyphen Formatting**:
   $$\text{Number} = \text{Sanitize}(\text{BranchPrefix}) - \text{Sanitize}(\text{DocType}) - \text{FiscalYear} - \text{PaddedNextVal}$$
   Example: `ISB` + `SI` + `FY2026-27` + `1` $\rightarrow$ `ISB-SI-FY2026-27-000001`. Multiple dashes (`ISB--SI`) must be strictly sanitized to single dashes.
5. **Cash Drawer Shift Reconciliation Invariant**:
   $$\text{Expected Cash} = \text{Opening Float} + \sum \text{Cash Inflows} - \sum \text{Cash Outflows}$$
   $$\text{Digital/Card/Wallet Tenders} \notin \text{Drawer Cash Total}$$
   $$\text{Variance} = \text{Counted Physical Cash} - \text{Expected Cash}$$
6. **IMEI Verification Standard**:
   - Conforms to ISO/IEC 7812 / 3GPP TS 23.003 Luhn Mod-10 algorithm.
   - Dual-SIM devices have two distinct 15-digit IMEIs linked to the identical `stockUnitId`.

---

## 6. Pass/Fail Semantics & Test Integrity

- **Pass Standard**: 100% of test assertions must evaluate to true with zero unhandled exceptions.
- **Fail Standard**: Any assertion mismatch, unbalanced journal entry ($\Delta \neq 0$), duplicate IMEI acceptance, negative stock condition, un-sanitized double-hyphen document number, or digital tender cash drawer contamination constitutes an immediate test failure.
- **No Facade Tests**: Every test must execute real domain calculation functions, schema validations, and state machines with explicit, independently calculated expected values.

---

## 7. Delivery & Certification Checklist

- [x] Test infrastructure document authored (`TEST_INFRA.md`).
- [x] Automated test suite created (`src/lib/operations/pos-acceptance.test.ts`).
- [x] All 4 testing tiers populated with >= 5 tests per feature domain.
- [x] Vitest runner passes 100% cleanly without warnings.
- [x] Readiness report published (`TEST_READY.md`).
