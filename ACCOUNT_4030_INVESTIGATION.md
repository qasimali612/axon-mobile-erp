# ACCOUNT 4030 INVESTIGATION REPORT
**Account:** `4030 · Inventory Adjustment Gain`  
**Classification:** Revenue (Other Operating Income)  
**Normal Balance:** Credit  
**Targeted Balance:** PKR 1,025,740.00  

---

## 1. Problem Identification

Account 4030 is designed in double-entry ERP architectures to record **unplanned inventory surplus discovered during periodic physical cycle counts** (e.g., finding 1 extra charger during a weekly audit). It represents an operational gain on ordinary inventory variances.

During system setup, the cutover opening stock import was posted using the standard stock adjustment handler with `reason: "OPENING_STOCK"`. Because the handler used Account 4030 as the generic offset account for inventory increases, the entire cutover stock value:
$$\text{Account 4030 Balance} = \text{Rs } 756,410 + 266,780 + 2,550 = \text{Rs } 1,025,740$$
accumulated in Account 4030.

### The Accounting Distortion
Because Account 4030 was assigned `AccountClass.REVENUE`, the Financial Command Center and standard report queries aggregated it into **Operating Revenue / Other Income**:
* **True Trading Revenue:** PKR 30,999 (Sales Invoice `ISB--SI-FY2026-27-000004`)
* **True COGS:** PKR 26,880
* **True Gross Trading Margin:** PKR 4,119
* **Reported Other Income:** PKR 1,025,740 (False Gain!)
* **Distorted Net Profit:** PKR 1,042,706 (Inflated by 6,045%!)

Treating owner's capital goods as monthly business profit violated International Accounting Standards (IAS 2 - Inventories & Conceptual Framework for Financial Reporting): capital introduced by owners or opening assets brought forward cannot be recognized as profit or loss in the current period.

---

## 2. Technical Investigation & Root Cause

In `src/lib/operations/stock-adjustment.ts`, the posting handler originally evaluated:
```typescript
// Legacy behavior
const gainAccount = await tx.account.findFirst({
  where: { code: "4030", companyId: actor.companyId }
});
// Credited 4030 regardless of whether reason was "OPENING_STOCK" or "CYCLE_COUNT"
```
And in `src/lib/finance/reports.ts`:
```typescript
// Legacy behavior
if (line.account.accountClass === AccountClass.REVENUE) {
  revenueTotal = revenueTotal.plus(balance); // Ingested Account 4030 into P&L!
}
```

---

## 3. Corrective Measures Implemented

1. **Isolation in Financial Reporting (`src/lib/finance/reports.ts`):**
   * Account 4030 lines originating from opening stock initialization are excluded from P&L Revenue, Gross Profit, and Operating Income.
   * Account 4030's Rs 1,025,740 balance is remapped into Balance Sheet **Equity** under `Opening Stock Equity Reserve`.
2. **Permanent Posting Logic Upgrade (`src/lib/operations/stock-adjustment.ts`):**
   * When `reason === "OPENING_STOCK"`, the transaction handler dynamically looks up the equity account (`3100 Retained Earnings` or `3200 Opening Balance Equity`) rather than Account 4030.
   * Normal inventory adjustments (reasons `PHYSICAL_COUNT`, `CYCLE_COUNT`, `VARIANCE`) continue to use Account 4030 (Gain) or Account 6500 (Loss) appropriately.

---

© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
