# POS Financial Accounting, Double-Entry GL & Valuation Technical Audit Report

**System**: Axon Mobile ERP Retail Point of Sale (POS) Counter Terminal  
**Auditor**: Teamwork Architecture & Audit Group (`worker_m1`)  
**Date**: 2026-11-10T12:25:00Z  
**Repository Working Directory**: `d:\Inventory Managment Software`  
**Audit Scope**: Chart of Accounts Integration, Double-Entry Journal Balancing, Landed Cost COGS Valuation, Subledger Reconciliation, Discount Proration, and Return Accounting

---

## 1. Chart of Accounts Integration & Zero-Hardcoded Account Policy

Axon Mobile ERP implements a strict standard for general ledger posting: **Zero Hardcoded Account IDs**.
- **Dynamic Account Resolution**: All accounting entries resolve posting accounts dynamically at runtime via `requirePostingAccount` (`src/lib/operations/accounting.ts` lines 42–85) by querying the company's active `Account` table using system `AccountClassification` and `SystemAccountRole`:
  - `ACCOUNTS_RECEIVABLE`: Current Asset control account for customer receivables (Account `1100`).
  - `SALES_REVENUE`: Operating Revenue account for phone and accessory sales (Account `4000`).
  - `TAX_PAYABLE`: Current Liability account for output sales tax / VAT (Account `2200`).
  - `COGS`: Expense account for Cost of Goods Sold (Account `5000`).
  - `INVENTORY`: Current Asset account for merchandise stock (Account `1200`).
  - `CASH`: Current Asset account for Cash on Hand / Cash Drawer (Account `1000`).
  - `BANK`: Current Asset accounts for bank accounts and electronic card settlements.
- **Branch & Currency Dimensioning**:
  Each `JournalEntryLine` records the transaction currency (`currencyCode`), branch dimension (`branchId`), and subledger entity (`customerId` or `supplierId`), ensuring multi-branch trial balances reconcile cleanly.

---

## 2. Double-Entry Commercial Sale Journal Entry Architecture

When a retail sale is posted at the counter, the system generates an atomic, balanced commercial journal entry via `postOperationalJournal` (`src/lib/operations/sales.ts` lines 523–545).

### 2.1 Commercial Journal Structure

| Line # | Account Classification | Target Account Code | Debit Amount | Credit Amount | Subledger Dimension Tag |
|:------:|:-----------------------|:-------------------:|:------------:|:-------------:|:------------------------|
| **1** | Accounts Receivable | `1100` (AR Control) | `invoice.grandTotal` | `0.0000` | `customerId`, `invoiceNumber`, `dueDate` |
| **2** | Sales Revenue | `4000` (Sales Rev) | `0.0000` | `netRevenue` | Branch dimension |
| **3** | Output Tax Payable | `2200` (Tax Payable) | `0.0000` | `invoice.taxTotal` | Tax rate & jurisdiction |
| **4** | Cost of Goods Sold | `5000` (COGS) | `totalCost` | `0.0000` | Product / Brand dimension |
| **5** | Inventory Asset | `1200` (Inventory) | `0.0000` | `totalCost` | Warehouse dimension |

*Note: If `invoice.taxTotal === 0`, Line 3 is omitted.*

### 2.2 Mathematical Proof of Double-Entry Balance
Let:
- $S = \text{invoice.subtotal}$ (gross item sales)
- $D = \text{invoice.discountTotal}$ (line and invoice discounts)
- $R = S - D = \text{netRevenue}$
- $T = \text{invoice.taxTotal}$
- $G = R + T = \text{invoice.grandTotal}$
- $C = \text{totalCost}$ (aggregate inventory landed cost)

Then:
$$\text{Total Debits} = \text{Debit}_{\text{AR}} + \text{Debit}_{\text{COGS}} = G + C = (R + T) + C$$
$$\text{Total Credits} = \text{Credit}_{\text{Revenue}} + \text{Credit}_{\text{Tax}} + \text{Credit}_{\text{Inventory}} = R + T + C$$
$$\Delta = \text{Total Debits} - \text{Total Credits} = (R + T + C) - (R + T + C) \equiv 0.0000$$

The posting engine strictly executes `assertJournalBalances(lines)` prior to database persistence. Any deviation exceeding `0.0000` triggers an immediate rollback with `422 UNBALANCED_SOURCE_JOURNAL`.

---

## 3. Double-Entry Receipt Journal Entry Architecture

When a customer tenders payment at checkout, one or more balanced receipt vouchers (`Payment`) are posted (`src/lib/operations/payments.ts` lines 356–385).

### 3.1 Receipt Journal Structure

| Line # | Account Classification | Target Account Code | Debit Amount | Credit Amount | Subledger Dimension Tag |
|:------:|:-----------------------|:-------------------:|:------------:|:-------------:|:------------------------|
| **1** | Cash on Hand / Bank | `1000` (Cash) or Bank | `payment.amount` | `0.0000` | Cash Drawer / Bank Account ID |
| **2** | Accounts Receivable | `1100` (AR Control) | `0.0000` | `payment.amount` | `customerId`, `invoiceNumber` |

### 3.2 Instant Settlement Mechanics for Cash Customer
When a cash customer completes a counter sale of Rs 120,000:
1. Commercial Sale Entry: DR AR Rs 120,000 / CR Sales Rs 120,000.
2. Receipt Entry: DR Cash on Hand Rs 120,000 / CR AR Rs 120,000.
3. Net Customer AR Balance: $+120,000 - 120,000 = 0.0000$.
4. Cash Drawer (Account 1000): Increased by $+120,000.0000$.

---

## 4. Cost of Goods Sold (COGS) Valuation Methodology

Mobile phone retail demands dual inventory valuation due to the massive variance in unit costs between serialized smart devices and non-serialized bulk accessories.

### 4.1 Serialized Mobile Handsets: Specific Identification Landed Cost
- **Methodology**: Specific Identification.
- **Implementation**: `src/lib/operations/sales.ts` lines 477–488.
- Each physical mobile phone is individually tracked in `PhysicalStockUnit` by its unique IMEI.
- Upon procurement (Goods Receipt Note / GRN), all landed costs (purchase price, import duties, freight, PTA tax) are capitalized into `PhysicalStockUnit.acquisitionCost`.
- When the phone is sold, the exact landed cost is recognized as COGS:
  ```ts
  lineCost = lineCost.plus(unit.acquisitionCost);
  ```
- **Financial Benefit**: Eliminates standard costing variances and guarantees exact gross profit margin reporting per individual handset sold.

### 4.2 Non-Serialized Accessories & Spare Parts: Weighted Average Cost
- **Methodology**: Perpetual Weighted Average Cost.
- **Implementation**: `src/lib/operations/sales.ts` lines 489–505.
- Accessories (chargers, cases, screen protectors) are tracked in `StockBalance`.
- Unit Cost is calculated dynamically from the warehouse balance at posting:
  $$\text{Unit Cost} = \frac{\text{StockBalance.inventoryValue}}{\text{StockBalance.quantity}}$$
  $$\text{Line COGS} = \text{Unit Cost} \times \text{Line.quantity}$$
- The transaction deducts `Line.quantity` from `StockBalance.quantity` and `Line COGS` from `StockBalance.inventoryValue`, preventing inventory valuation distortion.

---

## 5. Discount Accounting & Tax Proration

### 5.1 Line-Level Discounts
- Entered by cashier per item row (`line.discountAmount`).
- Deducted directly from gross item revenue before tax calculation:
  $$\text{Line Net Revenue} = (\text{unitPrice} \times \text{quantity}) - \text{discountAmount}$$
  $$\text{Line Tax} = \text{Line Net Revenue} \times \text{taxRate}$$

### 5.2 Invoice-Level Discounts
- Applied to the total cart order.
- To prevent tax distortion and comply with statutory sales tax audits, invoice-level discounts are prorated proportionally across all taxable and non-taxable cart lines:
  $$\text{Line Discount Share} = \text{Invoice Discount} \times \left(\frac{\text{Line Gross Subtotal}}{\sum \text{Gross Subtotals}}\right)$$
- Output tax is computed strictly on the discounted net line subtotal.

---

## 6. Accounts Receivable & Customer Subledger Reconciliation

### 6.1 Subledger Architecture (`src/lib/finance/subledger.ts`)
The customer subledger maintains an audit trail of every transactional document affecting customer balances.
- **General Ledger AR Balance**:
  $$\text{GL AR Balance} = \sum (\text{Debit} - \text{Credit}) \quad \text{on Account } 1100 \text{ where } \text{status} \in [\text{'POSTED'}, \text{'REVERSED'}]$$
- **Customer Open Document Outstanding**:
  $$\text{Open Balance} = \max(\text{grandTotal} - \sum \text{Posted Returns} - \sum \text{Posted Allocations}, 0)$$

### 6.2 Strict Exclusion of Unposted Vouchers
- **Crucial Invariant**: Draft, submitted, unposted, or cancelled documents **never contribute to General Ledger or subledger totals**.
- Only documents with `status === POSTED` create active debit or credit lines in `JournalEntryLine`.
- If an invoice is parked as `DRAFT`, neither the customer's open balance nor the company's revenue ledger is altered.

---

## 7. Counter Sales Returns & Credit Note Reversal Accounting

When a customer returns a purchased device at the counter (`src/lib/operations/stock-return.ts` lines 184–215):
1. **Commercial Entry Reversal**:
   - **CR** Accounts Receivable (`1100`): Returned invoice amount.
   - **DR** Sales Revenue (`4000`): Reversal of net revenue.
   - **DR** Output Tax Payable (`2200`): Reversal of sales tax.
   - **CR** Cost of Goods Sold (`5000`): Reversal of recognized COGS.
   - **DR** Inventory Asset (`1200`): Restores asset value to stock.
2. **Immediate Cash Drawer Refund Entry** (if refunded in cash):
   - **DR** Accounts Receivable (`1100`): Settle credit note.
   - **CR** Cash on Hand (`1000`): Physical cash paid out to customer.
   - Decrements active shift cash drawer balance.

---

## 8. Forensic Audit of Submitted Receipt Vouchers & Palmpay Limited Allocations (Requirement R4)

### 8.1 Scope & Context
Per `ORIGINAL_REQUEST.md` Requirement R4, a forensic audit of the six historical customer receipt vouchers (`ISB--RC-FY2026-27-000001` through `000006`) and their allocations against sales invoice `ISB--SI-FY2026-27-000008` (Palmpay Limited) was conducted.

### 8.2 Inventory of Historical Customer Receipt Vouchers
All six vouchers were created within the Islamabad branch (`ISB`) under financial year `FY2026-27`:

| Voucher Number | Branch | Direction | Recorded Status | GL Journal Linked | Cash / Bank Linked | Target Party | Allocation Target |
|---|---|---|---|---|---|---|---|
| `ISB--RC-FY2026-27-000001` | ISB | `CUSTOMER_RECEIPT` | `SUBMITTED` | `null` | Unposted | Palmpay Limited | `ISB--SI-FY2026-27-000008` |
| `ISB--RC-FY2026-27-000002` | ISB | `CUSTOMER_RECEIPT` | `SUBMITTED` | `null` | Unposted | Palmpay Limited | `ISB--SI-FY2026-27-000008` |
| `ISB--RC-FY2026-27-000003` | ISB | `CUSTOMER_RECEIPT` | `SUBMITTED` | `null` | Unposted | Palmpay Limited | `ISB--SI-FY2026-27-000008` |
| `ISB--RC-FY2026-27-000004` | ISB | `CUSTOMER_RECEIPT` | `SUBMITTED` | `null` | Unposted | Palmpay Limited | `ISB--SI-FY2026-27-000008` |
| `ISB--RC-FY2026-27-000005` | ISB | `CUSTOMER_RECEIPT` | `SUBMITTED` | `null` | Unposted | Palmpay Limited | `ISB--SI-FY2026-27-000008` |
| `ISB--RC-FY2026-27-000006` | ISB | `CUSTOMER_RECEIPT` | `SUBMITTED` | `null` | Unposted | Palmpay Limited | `ISB--SI-FY2026-27-000008` |

#### Forensic Accounting Observations:
1. **Zero Double-Entry Impact**: All six vouchers retain `journalEntryId = null`. Neither Accounts Receivable (`1100`) nor Cash/Bank accounts were debited or credited.
2. **Subledger-to-GL Parity**: Because vouchers were never posted, Palmpay Limited's customer subledger balance and Accounts Receivable General Ledger control account (`1100`) remain fully synchronized at pre-receipt balances. No subledger corruption occurred.
3. **Double-Hyphen Identifiers**: Voucher numbers contain legacy formatting (`ISB--RC-...`) resulting from branch master `documentPrefix = "ISB-"` concatenating with delimiter `-${suffix}`.

### 8.3 Investigation of Palmpay Limited Invoice `ISB--SI-FY2026-27-000008`
- **Customer**: Palmpay Limited (`ACTIVE`)
- **Invoice Status**: Submitted/Draft, but **not posted to the General Ledger**.
- **Accounting Implication**: In double-entry ERP accounting, an invoice creates an Accounts Receivable debit (`DR 1100 AR / CR 4000 Revenue`) only when posted. Permitting receipt vouchers to allocate against unposted invoices violates the accounting matching principle.

### 8.4 Root Cause Analysis: Why Vouchers Were Blocked & Over-Allocated
1. **Target Invoice Unposted**: In `src/lib/operations/payments.ts:validateAllocations`, postings against invoices with `status !== POSTED` are strictly rejected with `409 INVALID_ALLOCATION`.
2. **Legacy Maker-Checker Guard**: The legacy PostgreSQL trigger `enforce_document_maker_checker` and application checks blocked single-user direct submission and posting.
3. **Amount-Banded Approvals**: Segregation of duties and tiered approval bands prevented counter cashiers from finalizing receipts without escalation.
4. **Draft Allocation Race / Settled Query Flaw**: During voucher draft creation, open invoice balance was computed as `grandTotal - SUM(POSTED allocations)`. Because each voucher remained in `SUBMITTED` status (not `POSTED`), subsequent vouchers all saw `settled = 0.0000` and each claimed 100% of the invoice balance. When posting was attempted sequentially, the second voucher breached the invoice ceiling with `409 INVOICE_OVERPAYMENT`.
5. **Rogue Deletion Query in `prisma.ts`**: Previous patch scripts attempted to delete voucher `ISB--RC-FY2026-27-000006` via raw SQL on boot, creating an audit gap. This rogue query has been removed, ensuring `ISB--RC-FY2026-27-000006` is permanently preserved.

### 8.5 Safe Correction Plan (Zero Data Destruction / Zero Forced Automation)
In strict compliance with Requirement R4:
1. **No Historical Renaming**: Existing voucher numbers (`ISB--RC-FY2026-27-000001` through `000006`) are immutable historical audit records and must **not** be renamed or migrated.
2. **No Automatic Background Posting**: Historical vouchers must not be silently posted during database migrations or startup hooks.
3. **Establish Legal Receivable First**: Authorized finance users must review and post Sales Invoice `ISB--SI-FY2026-27-000008` in the Sales module, establishing the legal AR debit in GL.
4. **Handle Allocation Overflow via Customer Advances**: When posting submitted vouchers that exceed the remaining open balance:
   - Settle open invoice balance up to outstanding amount:
     $$\text{Settlement} = \min(\text{AllocationAmount}, \text{OutstandingInvoiceBalance})$$
   - Book the remaining surplus as an explicit **Customer Advance**:
     $$\text{CustomerAdvance} = \text{PaymentAmount} - \text{Settlement}$$
   - Generate balanced GL entry:
     - **DR** Cash on Hand / Bank Account (`1000` / `1010`): Full Payment Amount
     - **CR** Accounts Receivable (`1100`): $\text{Settlement}$
     - **CR** Customer Advances Liability (`2100`): $\text{CustomerAdvance}$
5. **Single-Hyphen Sequence Architecture for Future Documents**: Future vouchers generated through `src/lib/document-sequence.ts` enforce sanitized single-hyphen format (e.g., `ISB-RC-FY2026-27-000007`, `ISB-PV-FY2026-27-000001`) with concurrency-safe PostgreSQL atomic upsert.
