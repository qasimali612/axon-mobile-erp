# Technical Survey: Frontend UI, Settlement Dashboard & 20 Reports

**Module:** Axon Mobile ERP — Cash, Bank & Party Settlement  
**Investigator:** Teamwork Explorer (`teamwork_explorer_survey_3`)  
**Date:** 2026-11-10  
**Repository Working Directory:** `d:\Inventory Managment Software`  
**Reference Document:** `.agents/teamwork/ORIGINAL_REQUEST.md`

---

## 1. Executive Summary

This survey provides a comprehensive audit of the frontend architecture, settlement dashboard, voucher grid, customer receipt/supplier payment UI forms, the 20 financial settlement reports, approval workflow remnants, and the testing framework in Axon Mobile ERP.

### Key Survey Findings
1. **Frontend Architecture**: Built on Next.js 15 (App Router, Server Components + Client Workspaces), React 19, Tailwind CSS, and Lucide React. UI state management is component-local (`useState`, `useMemo`, `useCallback`) with direct Next.js API client fetching (`fetch`).
2. **Settlement Dashboard & KPI Cards**:
   - The primary settlement view is located at `/finance/payments` (`src/components/finance/payment-register.tsx`).
   - **Critical KPI Flaw**: KPI cards calculate metrics strictly on the client side from an in-memory array `rows` capped at 200 items (`fetch("/api/payments?pageSize=200")`). When total records exceed 200, all metrics are truncated and mathematically inaccurate.
   - While `metrics.collected` and `metrics.paidOut` correctly check `row.status === "POSTED"`, `metrics.pendingCount` inappropriately includes `row.status === "APPROVED"` (an approval-workflow remnant).
3. **Voucher Grid & Contextual Actions**:
   - The voucher grid supports basic search, direction filter, status filter, and branch filter.
   - **Missing Contextual Actions**: "Cancel" (for Submitted vouchers), "PDF" (direct document download), and "Reverse" (for Posted vouchers) are missing from the row action buttons.
   - **Fallback Approval Hack**: When posting directly, if `/post` fails, the client attempts fallback calls to `/submit` followed by `/approve` before retrying `/post`.
4. **Receipt & Payment Forms & Allocation Grid**:
   - Payment method support is currently limited to two radio-like buttons ("Cash Drawer" vs "Bank Account"). Cheque details and Card options are not first-class selectable payment methods.
   - **Critical Allocation Grid Flaw**: Open documents are listed with `item.grandTotal` rather than computing true `outstandingBalance` (`grandTotal - previouslyPaid`). Clicking "⚡ Settle Full" replaces the allocation state instead of allowing multi-invoice selection or manual allocation amounts per invoice.
5. **The 20 Settlement Reports**:
   - Of the 20 required reports specified in R5, **only 3 exist partially** (Cash Book via Cash-in-Hand, Customer Subledger, Supplier Subledger), and **17 are missing or incomplete**.
   - No dedicated settlement reporting hub or comprehensive multi-criteria filtering (date, party, branch, account, payment method, status) exists for settlement reports.
   - Export infrastructure currently provides CSV with UTF-8 BOM and basic HTML print, but lacks native PDF exports for settlement vouchers/reports and Excel (.xlsx) formatting.
6. **Testing Setup**:
   - Vitest runner (`vitest.config.mts`) is operational (11 test files, 63 unit tests passing in 1.54s).
   - Integration acceptance scripts in `scripts/verify-*.ts` execute against database instances using tsx.

---

## 2. Frontend Architecture Mapping

### 2.1 Route & Page Hierarchy

The ERP system organizes Cash, Bank, Party Settlements, and Reporting routes within `src/app/(erp)`:

| Route | Page File Path | Primary Component | Purpose & Access Control |
| :--- | :--- | :--- | :--- |
| `/finance/payments` | `src/app/(erp)/finance/payments/page.tsx` | `<PaymentRegister>` | Central voucher grid, creation modal, detail inspector, and batch posting. Requires `PAYMENT_VIEW`. |
| `/finance/payments/new` | `src/app/(erp)/finance/payments/new/page.tsx` | Server Redirect | Redirects to `/finance/payments?new=1` with query params. |
| `/finance/payments/[id]/print` | `src/app/(erp)/finance/payments/[id]/print/page.tsx` | Server Rendered Document | Official A4 print preview with Code128 barcode and signatures. Requires `PAYMENT_VIEW`. |
| `/finance/banking` | `src/app/(erp)/finance/banking/page.tsx` | `<BankingWorkspace>` | Bank account catalog, statement imports, bank ledger transactions, transfers/contra. Requires `BANK_LEDGER_VIEW`. |
| `/finance/reports/cash-in-hand` | `src/app/(erp)/finance/reports/cash-in-hand/page.tsx` | `<CashInHandWorkspace>` | Cash account movements, denomination calculator, period summary. Requires `FINANCIAL_REPORTS_VIEW`. |
| `/finance/subledgers` | `src/app/(erp)/finance/subledgers/page.tsx` | `<PartySubledgerWorkspace>` | Customer/Supplier aging register, statements, open items. Requires `CUSTOMER_LEDGER_VIEW` / `SUPPLIER_LEDGER_VIEW`. |
| `/finance/subledgers/[kind]/[id]/print` | `src/app/(erp)/finance/subledgers/[kind]/[id]/print/page.tsx` | Server Rendered Document | Printable customer/supplier account statement. |
| `/finance` | `src/app/(erp)/finance/page.tsx` | Server Dashboard | General finance dashboard (COA metrics, P&L trend, balance sheet equation). Requires `FINANCE_DASHBOARD_VIEW`. |
| `/finance/reports` | `src/app/(erp)/finance/reports/page.tsx` | Server Statements | Core financial statements (P&L, Balance Sheet, Cash Flow). Requires `FINANCIAL_REPORTS_VIEW`. |
| `/finance/reports/trial-balance` | `src/app/(erp)/finance/reports/trial-balance/page.tsx` | `<TrialBalanceWorkspace>` | Trial Balance roll-forward (Opening, Movement, Closing). Requires `FINANCIAL_REPORTS_VIEW`. |
| `/finance/journals` | `src/app/(erp)/finance/journals/page.tsx` | `<JournalRegister>` | General Ledger journal entry register. Requires `GL_VIEW`. |
| `/reports` | `src/app/(erp)/reports/page.tsx` | Server Hub | Reports & Analytics Hub covering Inventory, IMEI, Sales, and Procurement. Requires `dashboard.view`. |
| `/reports/operations` | `src/app/(erp)/reports/operations/page.tsx` | `<OperationsReportWorkspace>` | Interactive operational report viewer and CSV export. |
| `/approvals` | `src/app/(erp)/approvals/page.tsx` | `<ApprovalsWorkspace>` | Governance pending approval queue (Maker-Checker). |
| `/sales/[id]/receipt` | `src/app/(erp)/sales/[id]/receipt/page.tsx` | Thermal Receipt View | 80mm POS thermal receipt with allocation summary. Requires `sales.view`. |

### 2.2 Shell & Navigation Structure

File: `src/components/shell/erp-shell.tsx`
- **Sales Group** (lines 148-158): Links to `Receipts & payments` (`/finance/payments`) with `Landmark` icon and `PAYMENT_VIEW` permission.
- **Finance Group** (lines 160-178): Links to `Finance dashboard` (`/finance`), `Chart of accounts` (`/finance/accounts`), `Journal register` (`/finance/journals`), `Party statements & aging` (`/finance/subledgers`), `Cash in hand` (`/finance/reports/cash-in-hand`), `Banking` (`/finance/banking`), `Statements` (`/finance/reports`), `Reports & exports` (`/reports`).
- **Control Group** (lines 180-188): Links to `Approvals queue` (`/approvals`) with `FileCheck2` icon.

### 2.3 Component State Management & API Communication

1. **State Paradigm**: Local React hooks (`useState`, `useMemo`, `useCallback`, `useRef`, `useEffect`). No global Redux or Zustand stores.
2. **Server Communication**:
   - Direct HTTP calls using `fetch()` against RESTful API route handlers in `src/app/api/*`.
   - Idempotency via `idempotencyKey: crypto.randomUUID()`.
   - Toast notifications via `sonner` (`toast.success`, `toast.error`, `toast.info`, `toast.loading`).
3. **Lookups & Master Data**:
   - Loaded on demand via `GET /api/operations/lookups`, which returns `branches`, `warehouses`, `customers`, `suppliers`, `salesInvoices`, `purchaseReceipts`, `banks`, and `cashAccounts`.

---

## 3. Investigation: Settlement Dashboard & Voucher Grid

File: `src/components/finance/payment-register.tsx` (1,909 lines)

### 3.1 KPI Metric Cards & Accuracy Analysis

The dashboard metrics are computed in lines 747–766:

```typescript
// Aggregate Metrics in PaymentRegister
const metrics = useMemo(() => {
  let collected = 0;
  let paidOut = 0;
  let pendingCount = 0;

  for (const row of rows) {
    const amt = Number(row.amount) || 0;
    if (row.status === "POSTED") {
      if (row.direction === "CUSTOMER_RECEIPT" || row.direction === "SUPPLIER_REFUND") {
        collected += amt;
      } else {
        paidOut += amt;
      }
    } else if (row.status === "SUBMITTED" || row.status === "APPROVED") {
      pendingCount++;
    }
  }

  return { collected, paidOut, pendingCount };
}, [rows]);
```

#### Verification & Flaws:
1. **Strictly Posted Verification**:
   - `collected` and `paidOut` strictly evaluate `if (row.status === "POSTED")`. Unposted/submitted vouchers do **not** contribute to these two totals. This adheres to the requirement.
2. **Client-Side Truncation Flaw**:
   - `rows` is populated at line 214 by `fetch("/api/payments?pageSize=200")`.
   - If the company has more than 200 vouchers in history, the KPI totals calculate only across the latest 200 records. Any historical posted vouchers beyond row 200 are silently omitted from the KPI cards.
   - **Remedy**: KPI metrics must be calculated via server-side aggregation (`_sum`, `count`) over the entire company/branch scope, not from client-side array slices.
3. **Approval Status Infiltration**:
   - `pendingCount` evaluates `row.status === "SUBMITTED" || row.status === "APPROVED"`. Under R1, `APPROVED` must not exist.
   - What about `DRAFT` vouchers? Currently `DRAFT` vouchers are not surfaced in `pendingCount`, yet the user can click "Post Now" on draft vouchers (line 1104).
4. **SAP Business One Dashboard Gap**:
   - The current dashboard only has 3 basic cards.
   - A true SAP Business One-inspired settlement dashboard requires:
     1. Total Posted Customer Receipts (Inflow)
     2. Total Posted Supplier Payments (Outflow)
     3. Net Settlement Flow (`Receipts - Payments`)
     4. Awaiting Posting Vouchers (`SUBMITTED` count & total amount)
     5. Customer Advance Balances (On-account unallocated receipts)
     6. Supplier Advance Balances (On-account unallocated disbursements)

### 3.2 Voucher Grid Inspection

Located in `PaymentRegister` lines 981–1176:

#### Columns Rendered:
1. **Payment #**: Payment number, payment date, direction title, and General Ledger journal voucher link (`row.journalEntry.voucherNumber`).
2. **Party**: Customer or Supplier name, code, and branch code.
3. **Settlement Account**: Bank code & bank name (with Landmark icon) OR Cash code & cash name (with Wallet icon), plus reference string.
4. **Status**: Badge tone (`POSTED` = green, `APPROVED` = blue, `SUBMITTED` = amber, `REVERSED`/`CANCELLED` = red, `DRAFT` = slate).
5. **Amount**: Formatted currency with mono font and tabular numbers.
6. **Actions**: Row-level contextual action buttons.

#### Search & Filtering Toolbar (lines 904–979):
- **Search**: Case-insensitive text filter on `paymentNumber`, `customer.name`, `supplier.name`, `customer.code`, `supplier.code`, `reference`, `journalEntry.voucherNumber`.
- **Direction Filter**: `ALL`, `CUSTOMER_RECEIPT`, `SUPPLIER_PAYMENT`, `CUSTOMER_REFUND`, `SUPPLIER_REFUND`.
- **Status Filter**: `ALL`, `DRAFT`, `SUBMITTED`, `APPROVED` *(needs removal)*, `POSTED`, `REVERSED`.
- **Branch Filter**: Dropdown of company branches.
- **CRITICAL FILTERING GAPS**:
  - Missing Date Range filter (From Date / To Date).
  - Missing Account filter (filter by specific Cash Account or Bank Account).
  - Missing Payment Method filter (Cash, Bank Transfer, Cheque, Card).
  - Missing Party Autocomplete selector (only text search is supported).

#### Contextual Action Buttons Comparison:

| Action | Required by Prompt/R5 | Current Implementation in `payment-register.tsx` | Status & Gap |
| :--- | :--- | :--- | :--- |
| **View** | Yes | Lines 1080–1087: `<Button onClick={() => openDetail(row.id)}>View</Button>` | Fully implemented; opens detail modal. |
| **Edit Draft** | Yes | Lines 1090–1101: `<Button onClick={() => void startEdit(row)}>Edit</Button>` | Implemented for `DRAFT`, `SUBMITTED`, `APPROVED`. Loads into edit modal. |
| **Post Now** | Yes | Lines 1104–1119: `<Button onClick={() => void directPost(row)}>Post Now</Button>` | Implemented for `DRAFT`, `SUBMITTED`, `APPROVED`. Has approval-fallback bug. |
| **Cancel** | Yes | Missing. (Only a hard `handleDeletePayment` button exists, lines 1122–1138). | **MISSING**. Requirements explicitly demand a Cancel action for Submitted vouchers. |
| **Print** | Yes | Lines 1070–1077: `<Link href="/finance/payments/${row.id}/print" target="_blank">` | Implemented; opens HTML print view. |
| **PDF** | Yes | Missing. | **MISSING**. No button to trigger server-rendered PDF download. |
| **Reverse** | Yes | Missing on grid rows! | **MISSING**. Posted vouchers only show "Print" and "View". No "Reverse Voucher" button exists on posted rows. |

### 3.3 UI Approval Mechanisms & Maker-Checker Remnants to Remove

The following approval remnants exist in the UI and must be eliminated:

1. **`src/components/finance/payment-register.tsx`**:
   - **Line 63**: `approvedBy: { fullName: string } | null;` in `PaymentRow` type definition.
   - **Line 77**: `if (status === "APPROVED") return "blue" as const;`
   - **Lines 446–450** (Approval Fallback in `directPost`):
     ```typescript
     if (!postRes.ok) {
       await fetch(`/api/payments/${row.id}/submit`, { method: "POST" }).catch(() => null);
       await fetch(`/api/payments/${row.id}/approve`, { method: "POST" }).catch(() => null);
       const retryRes = await fetch(`/api/payments/${row.id}/post`, { method: "POST" });
       ...
     }
     ```
   - **Lines 657–660** (Approval Fallback in `handleCreate` with `andPost`):
     ```typescript
     const subRes = await fetch(`/api/payments/${targetIdToPost}/submit`, { method: "POST" });
     const appRes = await fetch(`/api/payments/${targetIdToPost}/approve`, { method: "POST" });
     const postRes = await fetch(`/api/payments/${targetIdToPost}/post`, { method: "POST" });
     ```
   - **Line 760**: `} else if (row.status === "SUBMITTED" || row.status === "APPROVED") {`
   - **Line 790**: Tooltip stating "Auto-post all submitted and approved payments directly to General Ledger".
   - **Line 955**: `<option value="APPROVED">Approved</option>` in status filter.
   - **Lines 1090, 1104, 1122, 1383**: Conditional rendering checking `row.status === "APPROVED"`.
   - **Lines 1357–1361** (Detail Modal):
     ```tsx
     <div>
       <span className="block text-[10px] text-slate-400 uppercase font-bold">Approved By</span>
       <b className="text-slate-900">{selectedPayment.approvedBy?.fullName || "Not yet approved"}</b>
     </div>
     ```
2. **`src/app/(erp)/finance/payments/[id]/print/page.tsx`**:
   - **Line 67**: `approvedBy: { select: { fullName: true } }`
   - **Line 170**: `payment.status === "APPROVED" ? "bg-amber-500"`
   - **Lines 315–317**: Print signature box displaying "Verified & Approved By".
3. **`src/components/governance/approvals-workspace.tsx` & `src/app/(erp)/approvals/page.tsx`**:
   - **Line 38**: `PendingApprovalItem` includes `"PAYMENT"`.
   - Lines 103–113 of `/api/approvals/route.ts` queries payments where `status = "SUBMITTED"` and exposes them to the governance approval queue.
   - Line 312 of `/api/approvals/route.ts` invokes `approvePayment()`.
   - **Action Required**: Payments must be completely decoupled from `/approvals` and `/api/approvals`.
4. **`src/app/api/payments/[id]/approve/route.ts`**:
   - Dedicated route handler for approving payments. Must be deprecated or retired.
5. **`src/components/shell/erp-shell.tsx`**:
   - Line 182 links to `/approvals` in the sidebar. For payments and settlements, approval queues must not be referenced.

---

## 4. Investigation: Customer Receipt & Supplier Payment Forms

File: `src/components/finance/payment-register.tsx` (Lines 1431–1905)

### 4.1 Payment Allocation Grid Deficiencies

The allocation section is currently rendered in lines 1768–1838:

```tsx
{/* Open Invoices Settlement */}
{targets.length > 0 ? (
  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
        <FileText className="h-4 w-4 text-blue-600" />
        Unpaid {isCustomer ? "Invoices" : "Bills"} ({targets.length})
      </span>
      <span className="text-[11px] text-slate-500">Click &apos;Settle Full&apos; to auto-fill amount</span>
    </div>
    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
      {targets.map((item: any) => {
        const docNum = item.invoiceNumber || item.receiptNumber;
        const docDate = item.invoiceDate || item.receiptDate;
        const grandTotalStr = String(item.grandTotal);
        const currentAlloc = docAllocations[item.id] || (targetId === item.id ? allocationAmount : "");
        const isMatched = (parseFloat(currentAlloc) || 0) > 0;

        return (
          <div key={item.id} ...>
            <div>
              <span className="font-bold text-slate-900 block font-sans">{docNum}</span>
              <span className="text-[11px] text-slate-500">{formatDate(docDate)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-slate-900">
                {formatMoney(item.grandTotal, currency)}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (isMatched) {
                    setDocAllocations((prev) => {
                      const next = { ...prev };
                      delete next[item.id];
                      return next;
                    });
                    if (amount === grandTotalStr) setAmount("");
                  } else {
                    setDocAllocations({ [item.id]: grandTotalStr });
                    setAmount(grandTotalStr);
                  }
                }} ...
              >
                {isMatched ? "✓ Settled" : "⚡ Settle Full"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  </div>
) : ... }
```

#### Critical Functional Gaps:
1. **No Calculation of Outstanding Balance**:
   - `lookups.salesInvoices` only supplies `grandTotal`. It does not calculate `previouslyPaid` from existing posted `PaymentAllocation` records.
   - If an invoice of PKR 100,000 had PKR 40,000 settled earlier, the grid continues to show PKR 100,000 and attempts to allocate the full grand total.
2. **Missing Tabular Grid Layout**:
   - The UI lacks proper enterprise table columns:
     - Document Number (Invoice / Bill #)
     - Document Date & Due Date
     - Original Total Amount
     - Previously Paid / Settled
     - Outstanding Balance
     - Current Allocation (Editable numeric input)
     - Remaining Balance
3. **Single-Selection Overwrite Bug**:
   - In lines 1813–1814:
     `setDocAllocations({ [item.id]: grandTotalStr });`
     `setAmount(grandTotalStr);`
   - Clicking "Settle Full" destroys all other allocations in `docAllocations`! Multi-invoice allocation (1:many) cannot be performed interactively via this toggle.
4. **Lack of Inline Partial Allocation Input**:
   - The user cannot type a partial payment amount (e.g., PKR 25,000) directly into the row. The user must manually edit the total amount and cannot specify partial distribution across lines.
5. **Advance Balance Transparency**:
   - While `advanceOnLedger` is calculated in line 150 (`Math.max(0, amt - totalAllocated)`), the UI does not show an explicit advance badge or notification warning the user that unallocated funds will be credited as an on-account balance advance.

### 4.2 Multi-Payment Methods Support

Located in lines 1670–1742:
- Currently, the form only features two hardcoded buttons:
  - "Cash Drawer" (`paymentInstrument = "CASH"`)
  - "Bank Account" (`paymentInstrument = "BANK_TRANSFER"`)
- **Missing Payment Methods**:
  - **Cheque**: Variables `chequeNumber`, `chequeDate`, and `chequeBank` are declared in state (lines 125–127), but their input elements are never rendered in the modal form. Only a generic `reference` input is shown.
  - **Card (POS / Debit / Credit Card)**: No button or fields exist for card payments, card terminal, or transaction authorization codes.
  - **Payment Method Catalog Master**: The system has a full catalog model `PaymentMethod` in PostgreSQL (`src/lib/catalog/payment-methods.ts`), but `PaymentRegister` does not query or render payment methods from `PaymentMethod`. Instead, it forces users to pick between raw bank accounts and cash accounts.

---

## 5. Survey: The 20 Settlement Reports

Requirement R5 demands the full implementation of 20 settlement reports supporting multi-criteria filters (date, party, branch, account, payment method, status) and export capabilities (Excel, PDF, print).

### 5.1 Detailed Catalog & Current Implementation Status

| # | Report Name | Current Status | Primary Data Source | Required Filters | Export Support |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Customer Receipt Register** | Incomplete | `Payment` (`direction = CUSTOMER_RECEIPT`), `Customer`, `BankAccount`, `Account` | Date Range, Customer, Branch, Account, Method, Status | CSV / PDF / Print |
| **2** | **Supplier Payment Register** | Incomplete | `Payment` (`direction = SUPPLIER_PAYMENT`), `Supplier`, `BankAccount`, `Account` | Date Range, Supplier, Branch, Account, Method, Status | CSV / PDF / Print |
| **3** | **Cash Payment Register** | Missing | `Payment` (`cashAccountId IS NOT NULL`), `Account`, `Customer`, `Supplier` | Date Range, Branch, Cash Account, Direction, Party | CSV / PDF / Print |
| **4** | **Bank Payment Register** | Missing | `Payment` (`bankAccountId IS NOT NULL`), `BankAccount`, `BankTransaction` | Date Range, Branch, Bank Account, Direction, Party | CSV / PDF / Print |
| **5** | **Cash Book / Register** | Incomplete | `Account` (`type = CASH`), `JournalEntryLine`, `Payment` | Date Range, Branch, Cash Account | CSV / PDF / Print |
| **6** | **Bank Book / Register** | Incomplete | `BankAccount`, `BankTransaction`, `JournalEntryLine` | Date Range, Branch, Bank Account, Reconciled Status | CSV / PDF / Print |
| **7** | **Customer Subledger Report** | Existing | `Customer`, `JournalEntryLine` (AR `11200`), `SalesInvoice`, `Payment` | Date Range, Customer, Branch | CSV / PDF / Print |
| **8** | **Supplier Subledger Report** | Existing | `Supplier`, `JournalEntryLine` (AP `21100`), `PurchaseReceipt`, `Payment` | Date Range, Supplier, Branch | CSV / PDF / Print |
| **9** | **Receipt Allocation Report** | Missing | `PaymentAllocation`, `Payment` (`CUSTOMER_RECEIPT`), `SalesInvoice` | Date Range, Customer, Branch, Invoice #, Receipt # | CSV / PDF / Print |
| **10** | **Payment Allocation Report** | Missing | `PaymentAllocation`, `Payment` (`SUPPLIER_PAYMENT`), `PurchaseReceipt` | Date Range, Supplier, Branch, Bill #, Payment # | CSV / PDF / Print |
| **11** | **Unallocated Advance Register (Customer)** | Missing | `Payment` (`CUSTOMER_RECEIPT`, `POSTED`), `PaymentAllocation` | Date Range, Customer, Branch | CSV / PDF / Print |
| **12** | **Unallocated Advance Register (Supplier)** | Missing | `Payment` (`SUPPLIER_PAYMENT`, `POSTED`), `PaymentAllocation` | Date Range, Supplier, Branch | CSV / PDF / Print |
| **13** | **Bank Reconciliation Statement** | Incomplete | `BankReconciliation`, `BankStatement`, `BankAccount`, `BankTransaction` | Bank Account, Statement Date, Fiscal Period | CSV / PDF / Print |
| **14** | **Cheque / Payment Instrument Register** | Missing | `Payment` (`paymentInstrument = CHEQUE` or reference), `BankAccount` | Date Range, Bank, Direction, Clearance Status, Party | CSV / PDF / Print |
| **15** | **Daily Cash & Bank Collection Summary** | Missing | `Payment` (`status = POSTED`), `BankAccount`, `Account` | Date Range, Branch, Payment Method | CSV / PDF / Print |
| **16** | **Cash Flow Settlement Summary** | Incomplete | `Payment`, `BankTransaction`, `JournalEntryLine` | Date Range, Branch, Account | CSV / PDF / Print |
| **17** | **Voucher Posting Audit Log** | Missing | `AuditLog` (`action IN ('PAYMENT_POSTED', 'JOURNAL_POSTED')`), `Payment`, `User` | Date Range, Branch, User, Voucher Type | CSV / PDF / Print |
| **18** | **Reversal Audit Register** | Missing | `Payment` (`status = REVERSED`), `JournalEntry` (`status = REVERSED`), `AuditLog` | Date Range, Branch, User, Voucher # | CSV / PDF / Print |
| **19** | **Customer Outstanding & Settlement Aging** | Incomplete | `SalesInvoice` (`POSTED`), `PaymentAllocation`, `Customer` | As-of Date, Customer, Branch, Aging Bucket | CSV / PDF / Print |
| **20** | **Supplier Outstanding & Settlement Aging** | Incomplete | `PurchaseReceipt` (`POSTED`), `PaymentAllocation`, `Supplier` | As-of Date, Supplier, Branch, Aging Bucket | CSV / PDF / Print |

### 5.2 Deep-Dive into Missing Reports Logic

#### Reports 9 & 10: Allocation Reports
- **Receipt Allocation Report**: Must show 1:many and many:1 relationships between customer receipts and sales invoices. Columns: Receipt Date, Receipt Voucher #, Customer Name, Payment Method, Total Receipt Amount, Invoice #, Invoice Date, Invoice Grand Total, Previously Settled, Allocated Amount, Invoice Open Balance Remaining.
- **Payment Allocation Report**: Corresponding report for supplier payments against purchase bills/receipts.

#### Reports 11 & 12: Unallocated Advance Registers
- **Calculation**: $\text{Advance} = \text{Voucher Amount} - \sum \text{Allocations}$.
- Must filter for posted vouchers where $\text{Advance} > 0$.
- Essential for reconciling open balances that have not yet been tied to operational invoices.

#### Report 14: Cheque / Payment Instrument Register
- Essential in wholesale trade where post-dated cheques (PDCs) and bank cheques are standard.
- Tracks: Cheque Number, Issue Date, Due/Maturity Date, Drawee Bank, Drawer Party, Payee Party, Direction (Received from Customer / Issued to Supplier), Amount, Clearing Status (Pending Deposit, Cleared, Bounced/Dishonored).

#### Report 15: Daily Cash & Bank Collection Summary
- Aggregates all collections for each business day segmented by branch and payment mode: Cash Till Inflow, Online Wire/IBFT, Cheque Deposit, Card Swipes, Total Inflows.

#### Report 17 & 18: Voucher Posting & Reversal Audit Registers
- Since approval workflows are removed and direct posting is allowed, immutable audit logging becomes paramount.
- Report 17 logs every posted settlement voucher: timestamp, voucher sequence, user ID, user full name, IP address, branch, debit/credit total, GL voucher reference.
- Report 18 logs every reversed voucher: reversal timestamp, original voucher number, reversal voucher number, reason for reversal, reversing user ID, financial impact.

### 5.3 Multi-Criteria Filtering Architecture

A unified settlement reporting service must support standard query dimensions:
- `companyId`: Mandatory security isolation.
- `from` and `to`: ISO date strings parsed into UTC boundaries.
- `branchId` / `branchIds`: RBAC-enforced branch access scope.
- `partyId` / `partyType`: `customer` or `supplier`.
- `accountId` / `bankAccountId` / `cashAccountId`: Specific asset or GL ledger account.
- `paymentMethodId` / `paymentInstrument`: `CASH`, `BANK_TRANSFER`, `CHEQUE`, `CARD`.
- `status`: `DRAFT`, `SUBMITTED`, `POSTED`, `CANCELLED`, `REVERSED`.

### 5.4 Export Capabilities Evaluation

1. **CSV / Excel Export**:
   - `src/app/api/reports/operations/route.ts` (line 99) implements RFC 4180 CSV with UTF-8 Byte Order Mark (`\uFEFF`) and spreadsheet formula injection guards (`/^[=+\-@]/`).
   - UTF-8 CSV with BOM opens seamlessly in Microsoft Excel, Google Sheets, and LibreOffice Calc.
   - For native `.xlsx` generation, `read-excel-file` is installed for reading, but no `.xlsx` writing library is in `package.json`. CSV with BOM is the established, zero-dependency pattern in the repository.
2. **PDF Generation**:
   - `src/lib/pdf/simple-pdf.ts` provides a high-performance, dependency-free A4 PDF generator.
   - Currently, it only renders `SalesInvoice`, `PurchaseReceipt`, and `PurchaseOrder`.
   - **Required Extension**: Add settlement report layout and payment voucher layout to `simple-pdf.ts` or create dedicated PDF handlers for settlement reports.
3. **Print Layouts**:
   - Screen print uses Tailwind's `print:` modifier and standard `@media print` CSS.
   - Print headers and signature blocks exist in `src/components/print/report-print-header.tsx` and `report-print-signatures.tsx`.

---

## 6. Testing Setup & Harness Verification

### 6.1 Vitest Configuration

File: `vitest.config.mts`
```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: { reporter: ["text", "html"] },
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
});
```

#### Verification Execution:
Command: `npm test`
Result:
```
 ✓ src/lib/utils.test.ts (2 tests)
 ✓ src/lib/catalog/pricing-validation.test.ts (10 tests)
 ✓ src/lib/finance/rebate-validation.test.ts (5 tests)
 ✓ src/lib/finance/rebate-price-protection.test.ts (5 tests)
 ✓ src/lib/finance/banking-validation.test.ts (10 tests)
 ✓ src/lib/finance/asset-validation.test.ts (13 tests)
 ✓ src/lib/finance/money.test.ts (3 tests)
 ✓ src/lib/operations/validation.test.ts (7 tests)
 ✓ src/lib/password-policy.test.ts (2 tests)
 ✓ src/lib/imei.test.ts (3 tests)
 ✓ src/lib/operating-mode.test.ts (3 tests)

 Test Files  11 passed (11)
      Tests  63 passed (63)
   Duration  1.54s
```

### 6.2 Existing Scripts and Integration Tests

In `package.json` and `scripts/`:
- `scripts/verify-pricing-payment-acceptance.ts`: Tests payment master creation, permissions, and pricing.
- `scripts/verify-finance-controls.ts`: Tests double-entry balance ($\sum \text{Debit} = \sum \text{Credit}$), period constraints, and balance sheet equation ($\text{Assets} = \text{Liabilities} + \text{Equity} + \text{Earnings}$).
- `scripts/verify-banking-acceptance.ts`: Tests bank accounts, transfers, statements, and reconciliation.
- `scripts/verify-party-subledger-acceptance.ts`: Tests subledger balances against GL control accounts.

### 6.3 Test Harness Strategy for Settlement Module

To verify the 28 required scenarios from `ORIGINAL_REQUEST.md`:
- Author comprehensive Vitest integration suites located in `src/lib/finance/__tests__/settlement-workflow.test.ts` and `src/lib/finance/__tests__/settlement-reports.test.ts`.
- These tests can run directly via `npm test` within the existing Vitest configuration without external runner dependencies.

---

## 7. Concrete Implementation Recommendations

### 7.1 Settlement Dashboard & Voucher Grid Overhaul

1. **Server-Side KPI Aggregation**:
   - Expose `GET /api/finance/settlements/kpis` (or return `kpis` inside `GET /api/payments`) computed via Prisma aggregate queries:
     - `totalPostedReceipts`: Sum of `amount` where `status = POSTED` and `direction = CUSTOMER_RECEIPT`.
     - `totalPostedPayments`: Sum of `amount` where `status = POSTED` and `direction = SUPPLIER_PAYMENT`.
     - `netSettlementFlow`: `totalPostedReceipts - totalPostedPayments`.
     - `awaitingPostingCount` & `awaitingPostingAmount`: Count and sum where `status = SUBMITTED`.
     - `customerAdvanceTotal`: Unallocated posted receipts.
     - `supplierAdvanceTotal`: Unallocated posted disbursements.
2. **Contextual Action Buttons**:
   - **Post Now**: Visible on `SUBMITTED` vouchers. Calls `POST /api/payments/[id]/post` without any approval intermediate.
   - **Edit Draft**: Visible on `DRAFT` and `SUBMITTED` vouchers.
   - **View**: Visible on all vouchers.
   - **Cancel**: Visible on `DRAFT` and `SUBMITTED` vouchers. Updates status to `CANCELLED` (releases allocations).
   - **Reverse**: Visible on `POSTED` vouchers. Opens reversal dialog requiring reason; generates balanced reversal journal and marks payment `REVERSED`.
   - **Print**: Opens `/finance/payments/[id]/print`.
   - **PDF**: Direct download from `/api/documents/payment/[id]/pdf`.

### 7.2 Receipt & Payment Form & Allocation Grid Overhaul

1. **Open Documents Outstanding Calculation**:
   - Enhance the lookups or open-documents endpoint to calculate true open balance:
     $$\text{Outstanding} = \text{GrandTotal} - \sum \text{PostedAllocations} - \sum \text{ApprovedReturns}$$
2. **True Enterprise Allocation Grid**:
   - Render a table inside the modal with:
     - Checkbox to select/unselect document.
     - Document Number & Date.
     - Original Amount & Outstanding Balance.
     - Allocation Input (`<input type="number">` auto-populated with minimum of remaining payment amount and outstanding document balance).
     - Remaining Balance after allocation.
   - Support FIFO Auto-Allocate button.
   - Clearly display the "Unallocated Advance" amount when total payment exceeds allocated amount.
3. **Multi-Payment Method Selector**:
   - Provide a selector for payment methods:
     - Cash (bound to cash account).
     - Bank Transfer / IBFT (bound to bank account, reference required).
     - Cheque (inputs: Cheque #, Cheque Date, Bank Name).
     - Card / POS Terminal (inputs: Card Type, Auth Code, Terminal ID).

### 7.3 20 Settlement Reports Implementation Plan

1. **Dedicated Service**: Create `src/lib/finance/settlement-reports.ts` containing dedicated querying and aggregation logic for each of the 20 reports.
2. **Unified API Dispatcher**: Create `src/app/api/finance/reports/settlement/route.ts` accepting `?report=<report-key>` with date, party, branch, account, method, and status filters, supporting both JSON and CSV formats.
3. **Settlement Reports Hub UI**:
   - Create `src/app/(erp)/finance/reports/settlement/page.tsx` and component `src/components/finance/settlement-reports-workspace.tsx`.
   - Include report switcher tabs, global multi-criteria filter bar, metric rollup cards, responsive data table, and export buttons (CSV/Excel, PDF, Print).
4. **Extend Simple-PDF**:
   - Add report table generator in `src/lib/pdf/simple-pdf.ts` to render tabular settlement reports as standard A4 PDFs.

---

## 8. Summary Table of Files Inspected

| File Path | Lines | Observations & Gaps |
| :--- | :--- | :--- |
| `src/components/finance/payment-register.tsx` | 1,909 | Core settlement workspace. Client-capped KPIs (200 rows), missing Cancel/Reverse/PDF actions, approval fallbacks, broken multi-invoice allocation grid, missing cheque/card inputs. |
| `src/app/(erp)/finance/payments/page.tsx` | 22 | Main page wrapper for PaymentRegister. |
| `src/app/(erp)/finance/payments/[id]/print/page.tsx` | 345 | Official payment voucher print document. Contains "Approved By" signature box remnant. |
| `src/components/governance/approvals-workspace.tsx` | 482 | Governance approvals queue. Includes `PAYMENT` document type. |
| `src/app/api/approvals/route.ts` | 390 | Queries submitted payments for approval. Dispatches `approvePayment`. |
| `src/app/api/payments/[id]/approve/route.ts` | 10 | Route handler for approving payments. Must be retired. |
| `src/lib/operations/payments.ts` | 446 | Payment operational service. Contains `approvePayment`, maker-checker calls, and segregation of duties assertions. |
| `src/components/finance/banking-workspace.tsx` | 833 | Banking, transfers, statements, reconciliation workspace. |
| `src/components/finance/cash-in-hand-workspace.tsx` | 716 | Cash in hand movements and denomination register. |
| `src/components/finance/party-subledger-workspace.tsx` | 92 | Customer and supplier subledger statements and aging buckets. |
| `src/components/finance/journal-actions.tsx` | 216 | Journal actions. Explicit "Approve" button and maker-checker calls. |
| `src/components/finance/journal-register.tsx` | 939 | Journal register. Fast-post fallback calls `/approve`. |
| `src/lib/operating-mode.ts` | 199 | Operating mode controls. Maker-checker and segregation functions are no-ops. |
| `src/lib/policies.ts` | 94 | Amount-banded approval policies. Disabled project-wide. |
| `src/lib/pdf/simple-pdf.ts` | 204 | Dependency-free A4 PDF engine. Only renders sales invoices, GRNs, and purchase orders. |
| `src/app/api/documents/[type]/[id]/pdf/route.ts` | 186 | Document PDF endpoint. Missing support for `type = payment`. |
| `src/app/(erp)/reports/page.tsx` | 319 | Reports & Analytics hub. Does not list settlement reports. |
| `src/app/api/reports/operations/route.ts` | 388 | Operational reports dispatcher. Contains no settlement reports. |
| `vitest.config.mts` | 14 | Vitest configuration. Working cleanly (63 tests pass). |
