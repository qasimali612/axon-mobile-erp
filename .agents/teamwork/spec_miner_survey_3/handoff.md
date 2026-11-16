# Comprehensive Specification Mining Report: Sales Invoice UI, API, Reports & Test Harness

**Spec Miner**: Spec Miner 3 (API & UI/Dashboard Spec Miner)  
**Date**: 2026-11-09T18:28:00Z  
**Target Module**: Axon Mobile ERP Order-to-Cash (Sales Invoices, AR Reconciliation, Reports, Test Infrastructure)  
**Working Directory**: `d:\Inventory Managment Software\.agents\teamwork\spec_miner_survey_3`  

---

## 1. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Sales Invoice UI | Sales Invoice Register Screen | Main invoice listing screen mounted at `/sales` rendering `<SalesManager />`. | Permissions (`sales.view`, `SALES_INVOICE_CREATE`, `SALES_INVOICE_POST`, `SALES_INVOICE_REVERSE`, `PAYMENT_CREATE`), initial status/paymentStatus search params | Interactive register with summary cards, tab navigation, search/filter bar, data grid, pagination, reversal and cancellation modals | Renders sonner toast error if `/api/sales/invoices` fetch fails | `src/app/(erp)/sales/page.tsx:1-20`, `src/components/sales/sales-manager.tsx:1-898` |
| 2 | Sales Invoice UI | Summary KPI Cards | Top-level executive metrics cards on the sales invoice page. Currently 6 cards: Invoices (Total), Unposted Invoices (Draft+Submitted+Approved), Posted, Posted Sales, Collected Amount, Outstanding AR. | Query aggregation from `/api/sales/invoices` summary object | 6 stat card elements (missing separate Drafts, Awaiting Posting, Overdue Receivables, Paid Invoices) | Displays 0 or default currency if summary data is missing | `src/components/sales/sales-manager.tsx:286-358` |
| 3 | Sales Invoice UI | Multi-Criteria Filters | Filtering controls above invoice data grid. | Search text (debounced 300ms), From Date, To Date, Document Status dropdown, Payment Status dropdown | Filtered table rows, recalculated pagination and metrics | Invalid dates or unhandled params trigger API 400 or empty results | `src/components/sales/sales-manager.tsx:393-467` |
| 4 | Sales Invoice UI | Invoice Grid Table & Columns | Data grid showing sales invoice records. Currently columns: Invoice #/Date, Customer, Location (Warehouse/Branch), Salesperson, Document Status, Payment Status, Items/Units, Total/Due, Actions. | Rows array from `/api/sales/invoices` | Tabular row rendering with status badges, line count, grand total, and due amount (Missing explicit Due Date column and separate Paid amount) | Shows empty state "No matching sales invoices found" | `src/components/sales/sales-manager.tsx:470-667` |
| 5 | Sales Invoice UI | Grid Contextual Actions | Action buttons per invoice row. Currently: Print (A4 HTML preview), View (`/sales/[id]`), Edit Draft (`/sales/[id]/edit`), Post Now (`directPost`), Receive Payment (`/finance/payments?invoiceId=...`), Cancel Draft (modal), Reverse Posted (modal). | Invoice record object and user RBAC permissions | Link navigation or modal triggers (Missing "Download PDF" button and "Return" action button) | Returns toast errors if action fails | `src/components/sales/sales-manager.tsx:571-665` |
| 6 | Sales Invoice UI | Sales Invoice Detail View | Individual sales invoice document view at `/sales/[id]`. | Document ID parameter in URL | Full header details, customer details, lines table with IMEI/serial unit chips, journal voucher link, payment/return history, audit trail | Returns Next.js `notFound()` if ID invalid or unauthorized | `src/app/(erp)/sales/[id]/page.tsx:1-189` |
| 7 | Sales Invoice UI | Sales Invoice Edit Page | Edit draft sales invoice at `/sales/[id]/edit`. | Document ID parameter in URL | Mounts `<PosWorkspace invoiceId={id} />` in edit mode | Permission denial if user lacks `SALES_INVOICE_CREATE` | `src/app/(erp)/sales/[id]/edit/page.tsx:1-12` |
| 8 | Sales Invoice UI | Sales Invoice Print View | Official printable A4 invoice template at `/sales/[id]/print`. | Document ID parameter in URL | Clean A4 invoice layout with Code-128 SVG barcode, company details, line items, IMEIs, tax breakdown, signatures | Returns `notFound()` if invoice doesn't exist | `src/app/(erp)/sales/[id]/print/page.tsx:1-42` |
| 9 | Sales Invoice UI | Sales Invoice POS Thermal Receipt | 80mm/58mm thermal receipt print view at `/sales/[id]/receipt`. | Document ID parameter in URL | Compact thermal receipt format with barcode, serial numbers, tender lines, cashier details | Returns `notFound()` if invoice doesn't exist | `src/app/(erp)/sales/[id]/receipt/page.tsx:1-120` |
| 10 | Sales Invoice UI | Sales Command Center Dashboard | High-level operational & executive dashboard at `/sales/dashboard`. | Filter params: `from`, `to`, `branchId`, `warehouseId`, `customerId`, `salespersonId`, `productId`, `model`, `color` | 8 summary cards, recent invoices table, bar summaries for branch, product, model, customer | Shows zero values if no documents match filters | `src/app/(erp)/sales/dashboard/page.tsx:1-187` |
| 11 | API — Sales | List Sales Invoices (`GET /api/sales/invoices`) | Fetches paginated sales invoices with server-calculated summaries, payment statuses, and line quantity aggregations. | Query params: `page`, `pageSize`, `search`, `status`, `paymentStatus`, `branchId`, `warehouseId`, `customerId`, `salespersonId`, `productId`, `model`, `color`, `from`, `to`, `dueFrom`, `dueTo`, `sort`, `sortDir` | JSON `{ data: items, pagination: {...}, summary: {...} }` | 400 INVALID_DATE, 401 Unauthorized, 403 Forbidden | `src/app/api/sales/invoices/route.ts:42-205` |
| 12 | API — Sales | Create Sales Invoice Draft (`POST /api/sales/invoices`) | Creates a draft sales invoice or auto-posts if `autoPost: true`. | JSON payload matching `salesInvoiceDraftSchema` | 201 Created with invoice data or auto-posted invoice data | 422 for schema/currency/quantity/product errors, 409 for locked/inactive items, 404 for missing master records | `src/app/api/sales/invoices/route.ts:207-238`, `src/lib/operations/sales.ts:181-248` |
| 13 | API — Sales | Get Sales Invoice Detail (`GET /api/sales/invoices/[id]`) | Fetches complete sales invoice record including lines, units with IMEIs, payment allocations, stock returns, journal voucher, audit logs, and inventory movements. | URL parameter `id` (UUID) | JSON `{ data: { ...invoice, attachments, history, movements } }` | 404 SALES_INVOICE_NOT_FOUND, 403 Forbidden | `src/app/api/sales/invoices/[id]/route.ts:22-65` |
| 14 | API — Sales | Update Sales Invoice Draft (`PATCH /api/sales/invoices/[id]`) | Updates an existing unposted sales invoice draft, replacing lines and recalculating taxes. | URL parameter `id`, JSON body matching `salesInvoiceDraftSchema` | JSON `{ data: updatedInvoice }` | 404 SALES_INVOICE_NOT_FOUND, 409 INVALID_DOCUMENT_STATE (if posted/cancelled/reversed), 403 NOT_PREPARER | `src/app/api/sales/invoices/[id]/route.ts:67-83`, `src/lib/operations/sales.ts:249-351` |
| 15 | API — Sales | Direct Post Sales Invoice (`POST /api/sales/invoices/[id]/post`) | Atomically posts invoice: validates stock/IMEI custody, derives actual-cost COGS, creates stock movements, posts balanced GL journal, creates AR subledger, marks status POSTED. | URL parameter `id`, user credentials/session | JSON `{ data: postedInvoice }` | 404 SALES_INVOICE_NOT_FOUND, 409 STOCK_UNIT_UNAVAILABLE / CUSTOMER_INACTIVE / INSUFFICIENT_AVAILABLE_STOCK, 422 SERIALIZED_QUANTITY_MISMATCH | `src/app/api/sales/invoices/[id]/post/route.ts:1-10`, `src/lib/operations/sales.ts:447-609` |
| 16 | API — Sales | Approve Sales Invoice (`POST /api/sales/invoices/[id]/approve`) — **TO BE ELIMINATED** | Approval workflow endpoint that transitions invoice status from SUBMITTED to APPROVED and checks maker-checker / credit limits. | URL parameter `id`, optional JSON `{ reason?: string }` | JSON `{ data: approvedInvoice }` | 409 MAKER_CHECKER_VIOLATION / CREDIT_LIMIT_EXCEEDED, 403 Forbidden | `src/app/api/sales/invoices/[id]/approve/route.ts:1-10`, `src/lib/operations/sales.ts:407-445` |
| 17 | API — Sales | Submit Sales Invoice (`POST /api/sales/invoices/[id]/submit`) — **TO BE ELIMINATED** | Approval workflow endpoint that transitions invoice status from DRAFT to SUBMITTED. | URL parameter `id`, optional JSON `{ reason?: string }` | JSON `{ data: submittedInvoice }` | 409 INVALID_DOCUMENT_STATE, 403 NOT_PREPARER | `src/app/api/sales/invoices/[id]/submit/route.ts:1-10`, `src/lib/operations/sales.ts:384-405` |
| 18 | API — Sales | Cancel Sales Invoice Draft (`POST /api/sales/invoices/[id]/cancel`) | Cancels a draft sales invoice with mandatory reason string (>= 10 chars) without affecting inventory or accounting. | URL parameter `id`, JSON `{ reason: string }` | JSON `{ data: cancelledInvoice }` | 404 SALES_INVOICE_NOT_FOUND, 409 INVALID_DOCUMENT_STATE (only DRAFT can be cancelled), 403 NOT_PREPARER | `src/app/api/sales/invoices/[id]/cancel/route.ts:1-28`, `src/lib/operations/sales.ts:353-382` |
| 19 | API — Sales | Reverse Posted Sales Invoice (`POST /api/sales/invoices/[id]/reverse`) | Creates linked reversal sales invoice, reversal journal voucher, and reversing inventory movements with reason and postingDate. | URL parameter `id`, JSON `{ reason: string, postingDate: string }` | JSON `{ data: reversalInvoice }` | 404 SALES_INVOICE_NOT_FOUND, 409 if allocations/returns exist or physical units have moved | `src/app/api/sales/invoices/[id]/reverse/route.ts:1-39`, `src/lib/operations/reversals.ts` |
| 20 | API — Sales | Batch Post Invoices (`POST /api/sales/invoices/batch-post`) | Sequentially executes posting across multiple unposted invoices (up to 50). | JSON `{ invoiceIds?: string[] }` | JSON `{ data: { totalProcessed, postedCount, failedCount, results } }` | Continues on per-item failure, reporting item-level error strings | `src/app/api/sales/invoices/batch-post/route.ts:1-69` |
| 21 | API — Documents | Download Invoice PDF (`GET /api/documents/invoice/[id]/pdf`) | Generates server-side PDF byte stream for a sales invoice using pure TypeScript PDF renderer (`renderDocumentPdf`). | URL parameters `type: "invoice"`, `id` | PDF binary document (`application/pdf`) with `inline; filename="...pdf"` | 404 SALES_INVOICE_NOT_FOUND, 403 Forbidden | `src/app/api/documents/[type]/[id]/pdf/route.ts:1-186`, `src/lib/pdf/simple-pdf.ts` |
| 22 | API — Approvals | Central Approval Queue (`GET/POST /api/approvals`) — **CONTAINS SALES INVOICE ARTIFACT** | Central queue aggregating submitted documents for manager approval. Currently includes `SALES_INVOICE`. | GET: none; POST: `{ documentType, id, action: "approve"|"reject", reason }` | GET: list of submitted items; POST: approved/rejected entity | 400 UNSUPPORTED_TYPE, 403 Forbidden | `src/app/api/approvals/route.ts:1-390` |
| 23 | API — Payments | Customer Payment Receipts & Allocations (`GET/POST /api/payments`) | Manages payments and receipt allocations against posted sales invoices. | JSON payload matching `paymentDraftSchema` with `allocations: [{ salesInvoiceId, amount }]` | 201 Created payment record; posts journal and allocates to invoice on post | 422 OVER_ALLOCATION, 409 INVOICE_OVERPAYMENT | `src/app/api/payments/route.ts:1-79`, `src/lib/operations/payments.ts:1-446` |
| 24 | API — Returns | Sales Returns & Source Resolvers (`GET/POST /api/returns`, `GET /api/returns/sources`) | Resolves posted sales invoices with available returnable quantities and creates restock returns / credit notes. | `GET /api/returns/sources?type=SALES_RETURN&q=...` | Returns list of posted invoices with remaining line quantities and sold IMEI units eligible for return | 422 RETURN_TYPE_REQUIRED, 404 not found | `src/app/api/returns/route.ts:1-67`, `src/app/api/returns/sources/route.ts:1-23` |
| 25 | API — Finance Subledgers | Customer Statement & Aging (`GET /api/finance/subledgers`, `GET /api/finance/subledgers/customer/[id]`) | Computes customer subledger statement, running balance, aging buckets (current, 1-30, 31-60, 61-90, >90), open items, and CSV export. | Query params: `type="customer"`, `asOf`, `branchId`, `search`, `page`, `pageSize`, `format="csv"` | JSON or CSV data reconciling customer transactions to GL AR control account | 403 BRANCH_SCOPE_FORBIDDEN, 422 INVALID_PARTY_LEDGER | `src/app/api/finance/subledgers/route.ts:1-26`, `src/app/api/finance/subledgers/[kind]/[id]/route.ts:1-47`, `src/lib/finance/subledger.ts:1-226` |
| 26 | Reports — Operations | Operations Reports Dispatcher (`GET /api/reports/operations`) | Central operational reporting API serving 27 report keys including sales, sales-by-brand, sales-by-model, salesperson-performance, fast/slow-moving stock, sold-imei, and imei-reconciliation. | Query params: `report`, `from`, `to`, `branchId`, `warehouseId`, `customerId`, `salespersonId`, `brandId`, `productId`, `limit`, `format="csv"` | JSON `{ data: { report, rows, truncated } }` or CSV stream | 422 INVALID_DATE, 403 Forbidden | `src/app/api/reports/operations/route.ts:1-388` |
| 27 | Reports — Operational Workspace | Operations Report UI Workspace | Interactive front-end workspace at `/reports/operations` for filtering, viewing, and exporting all 27 operational reports. | User selections (report type, date ranges, dimension dropdowns) | Data table with formatted numbers, currency, badges, CSV export, and print preview | Toast errors on fetch failure | `src/components/reports/operations-report-workspace.tsx:1-811` |
| 28 | Test Infrastructure | Vitest Unit Test Framework | Ultra-fast unit and service-level test runner configured via `vitest.config.mts`. | Vitest CLI: `npx vitest run` | 11 test files, 63 tests currently executed in ~2 seconds with 100% pass rate | Fails with stack trace on assertion failure | `vitest.config.mts:1-14`, `src/**/*.test.ts` |
| 29 | Test Infrastructure | Database Acceptance Scripts | Standalone Node/tsx acceptance test scripts in `scripts/` verifying end-to-end workflows against PostgreSQL / PGlite database. | `bash scripts/run-with-env.sh tsx scripts/verify-*.ts` | Colored console output with detailed assertions across database records | Throws Error and exits with non-zero code | `package.json:14-48`, `scripts/verify-*.ts` |

---

## 2. Edge Cases Discovered

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Direct Post UI Hack (`sales-manager.tsx:154-188`, `sales-invoice-actions.tsx:92-106`) | User clicks "Post Now" on a `DRAFT` or `SUBMITTED` invoice | If `post` fails due to unapproved status, client-side code catches the error and silently issues sequential calls to `/submit` then `/approve` with hardcoded reason `"Direct Post authorization"`, then retries `/post`. This confirms the approval workflow was artificially bypassed rather than properly removed from the backend engine. |
| 2 | Outstanding AR Ignores Sales Returns (`api/sales/invoices/route.ts:169`, `sales/dashboard/page.tsx:135`, `sales-manager.tsx:566`) | Sales invoice for PKR 100,000 has a posted sales return / credit note of PKR 40,000 and zero cash receipts | `GET /api/sales/invoices` and `/sales/dashboard` compute `outstandingAmount = grandTotal - paid = 100,000 - 0 = 100,000`. They completely ignore `stockReturns`, showing the full original invoice amount as outstanding instead of PKR 60,000. In contrast, `src/lib/finance/subledger.ts` correctly computes `openAmount = grandTotal - returnsAmount - allocatedAmount`. |
| 3 | Payment Allocation Ignores Sales Returns (`lib/operations/payments.ts:280-282`) | Sales invoice for PKR 100,000 has a posted return of PKR 40,000 (net due 60,000). A receipt is submitted for PKR 100,000 | `validateAllocations()` only checks `settled.plus(allocation.amount).gt(allocation.salesInvoice.grandTotal)`. Because `settled` only sums `PaymentAllocation`, it permits allocations up to PKR 100,000 instead of capping at the net due amount of PKR 60,000. |
| 4 | Payment Status Override on Unposted Invoices (`api/sales/invoices/route.ts:174-177`) | A draft invoice has no payments recorded | `api/sales/invoices` sets `paymentStatus: isPosted ? invoicePaymentStatus(...) : "DRAFT"`. Setting `paymentStatus = "DRAFT"` violates requirement R1: "Payment statuses must remain independent of document status: `Unpaid`, `Partially Paid`, `Paid`, `Overdue`." |
| 5 | Sold IMEI Report Includes Unposted Invoices (`lib/reports/services/imei-reports.ts:64-73`) | A sales invoice is created as a `DRAFT` with physical handsets selected, or subsequently `CANCELLED` | `getSoldImeiReport` queries `prisma.salesInvoiceUnit` filtered only by company and date range, with NO check on `status: "POSTED"`. Consequently, unposted draft or cancelled invoices incorrectly report physical phones as "Sold IMEIs". |
| 6 | Sales and Profitability Reports Include Drafts If Status Not Passed (`api/reports/operations/route.ts:258`) | User opens the "Sales Invoices" or "Line Profitability" report in `/reports/operations` without selecting the "POSTED" status dropdown | The database query filters by `...(status ? { status } : {})`. If `status` is omitted, it includes `DRAFT`, `SUBMITTED`, and `CANCELLED` invoices, distorting recognized sales volume, revenue, and gross margin. |
| 7 | Duplicate Separator in Document Sequence (`lib/operations/accounting.ts:105-112`, `lib/document-sequence.ts:35`) | Branch documentPrefix had trailing dash or prefix combined with suffix created `--` (e.g. `ISB--SI-FY2026-27-000004`) | Historical records in database contain double dashes (`ISB--SI-FY2026-27-000004`, `ISB--RC-FY2026-27-000006`). `accounting.ts` line 105 has regex cleaning (`replace(/-+$/, "")`), but format consistency must be guaranteed for all new invoices while preserving historical numbers without corruption. |
| 8 | Segregation of Duties / Maker-Checker Post Lock (`lib/operations/sales.ts:466`) | Preparer of an invoice attempts to directly post the invoice | `postSalesInvoice()` calls `assertSegregationOfDuties(tx, actor.companyId, actor.userId, invoice.preparedById, invoice.approvedById, "post this sales invoice", [], true)`. In multi-user mode, this throws `SEGREGATION_OF_DUTIES` (409) if the poster is the preparer or approver, preventing single-user direct posting unless operating in single-user mode. |
| 9 | Reversal Blocked by Preparer/Approver Check (`app/(erp)/sales/[id]/page.tsx:92`) | User views posted invoice detail page to evaluate reversal eligibility | `separated = context.user.id !== invoice.preparedById && context.user.id !== invoice.approvedById && context.user.id !== invoice.postedById`. The UI disables the reversal button if the viewing user was involved in preparing, approving, or posting the document. |
| 10 | Print Preview Hardcodes Approval Roles (`app/(erp)/sales/[id]/print/page.tsx:37-38`) | User prints an invoice | The printed document renders three signature blocks: "Prepared by", "Approved by" (showing "Pending" if unapproved), and "Posted by", and displays footer text `"Workflow copy — subject to approval and posting."` when unposted. |

---

## 3. Five-Component Handoff Report

### 1. Observation

Direct examination of the codebase reveals the following exact files, lines, and constructs:

1. **Sales Invoice UI Summary Cards & Missing Items**:
   - Location: `src/components/sales/sales-manager.tsx:286-358`.
   - Current implementation defines only **6 summary cards**:
     1. "Invoices" (Total registered, `metrics.total`)
     2. "Unposted Invoices" (Draft + Submitted + Approved, `metrics.unposted`)
     3. "Posted" (Committed to stock + GL, `metrics.posted`)
     4. "Posted Sales" (Recognized revenue, `summary?.postedSales || summary?.grandTotal || 0`)
     5. "Collected Amount" (Settled receipts, `summary?.paidTotal || 0`)
     6. "Outstanding AR" (Posted receivable balance, `summary?.outstandingTotal || 0`)
   - **Discrepancy vs Spec**: Requirement R5 requires **8 summary cards**:
     * Total Invoices
     * Drafts (separate count)
     * Awaiting Posting (no approval terminology; count of unposted valid invoices)
     * Posted (count)
     * Total Posted Sales (amount)
     * Outstanding Receivables (AR balance from posted invoices remaining unpaid)
     * Overdue Receivables (**currently missing entirely**)
     * Paid Invoices (**currently missing count of settled invoices**)

2. **Invoice Grid Table Columns and Actions**:
   - Location: `src/components/sales/sales-manager.tsx:470-667`.
   - Current Table Columns: Invoice # / Date, Customer, Location, Salesperson, Document Status, Payment, Items / Units, Total / Due, Actions.
   - **Missing Column**: "Due Date" is not displayed in the table columns (only Invoice Date is rendered at line 520).
   - Current Actions: Print A4 (`/sales/${row.id}/print`), View (`/sales/${row.id}`), Edit (`/sales/${row.id}/edit`), Post Now (button), Receive Payment (`/finance/payments?...`), Cancel Draft (button), Reverse Posted (button).
   - **Missing Actions**:
     * **"Download PDF"** button is missing from table row actions (backend `/api/documents/invoice/${row.id}/pdf` already exists at `src/app/api/documents/[type]/[id]/pdf/route.ts:45`).
     * **"Return"** button is missing from table row actions (no shortcut to initiate a sales return against the posted invoice).

3. **Multi-Criteria Filtering Implementation**:
   - Location: `src/components/sales/sales-manager.tsx:393-467`.
   - The UI currently provides:
     * A single free-text search box (`search`)
     * From Date (`from`) and To Date (`to`)
     * Document Status dropdown (`status`): contains `DRAFT`, `SUBMITTED`, `APPROVED`, `POSTED`, `REJECTED`, `CANCELLED`, `REVERSED`
     * Payment Status dropdown (`paymentStatus`): contains `UNPAID`, `PARTIAL`, `PAID`, `OVERDUE`
   - **Missing UI Filters**:
     * Branch dropdown (absent from UI toolbar, though supported by backend `branchId`)
     * Warehouse dropdown (absent from UI toolbar, though supported by backend `warehouseId`)
     * Customer picker / selector (currently only part of general search string)
     * Phone, SKU, IMEI1/IMEI2 are currently combined into free text search rather than distinct filter criteria.

4. **Approval Workflow Artifacts**:
   - Client-side auto-approval hack in `src/components/sales/sales-manager.tsx:157-168` and `src/components/sales/sales-invoice-actions.tsx:95-106`:
     ```ts
     let postRes = await fetch(`/api/sales/invoices/${row.id}/post`, { method: "POST" });
     if (!postRes.ok && (row.status === "DRAFT" || row.status === "SUBMITTED")) {
       if (row.status === "DRAFT") {
         await fetch(`/api/sales/invoices/${row.id}/submit`, { method: "POST" });
       }
       await fetch(`/api/sales/invoices/${row.id}/approve`, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ reason: "Direct Post authorization" }),
       });
       postRes = await fetch(`/api/sales/invoices/${row.id}/post`, { method: "POST" });
     }
     ```
   - Server auto-post approval in `src/app/api/sales/invoices/route.ts:218-220`:
     ```ts
     await submitSalesInvoice(actor, invoice.id);
     await approveSalesInvoice({ ...actor, overrideReason: "Single-user auto-post approval" }, invoice.id);
     const posted = await postSalesInvoice(actor, invoice.id);
     ```
   - Active routes:
     * `src/app/api/sales/invoices/[id]/approve/route.ts`
     * `src/app/api/sales/invoices/[id]/submit/route.ts`
   - Approval Queue registration in `src/app/api/approvals/route.ts:19, 70-79, 168-181, 306-308, 344-349`.
   - `postSalesInvoice()` in `src/lib/operations/sales.ts:454-466` forcibly transitions status to `APPROVED` before posting:
     ```ts
     if (invoice.status === OperationalDocumentStatus.DRAFT || invoice.status === OperationalDocumentStatus.SUBMITTED) {
       await tx.salesInvoice.update({
         where: { id },
         data: {
           status: OperationalDocumentStatus.APPROVED,
           approvedById: invoice.approvedById || actor.userId,
           approvedAt: invoice.approvedAt || new Date(),
         },
       });
       invoice.status = OperationalDocumentStatus.APPROVED;
     }
     await assertSegregationOfDuties(...);
     ```

5. **AR and Dashboard Sales Returns Omission**:
   - In `src/app/api/sales/invoices/route.ts:169`:
     ```ts
     const outstandingAmount = isPosted ? Prisma.Decimal.max(invoice.grandTotal.minus(paidAmount), 0) : new Prisma.Decimal(0);
     ```
     (Does not include `stockReturns` in deduction).
   - In `src/app/(erp)/sales/dashboard/page.tsx:135`:
     ```ts
     const outstanding = Prisma.Decimal.max(invoice.grandTotal.minus(paid), 0);
     ```
     (Does not include `stockReturns` in deduction).
   - In `src/lib/operations/payments.ts:280-282`:
     ```ts
     if (payment.direction === PaymentDirection.CUSTOMER_RECEIPT && settled.plus(allocation.amount).gt(allocation.salesInvoice.grandTotal)) {
       throw new ApiError(409, "INVOICE_OVERPAYMENT", `Allocation exceeds the open amount on invoice ${allocation.salesInvoice.invoiceNumber}.`);
     }
     ```
     (Does not deduct credit notes from open balance limit).
   - In `src/lib/finance/subledger.ts:95`:
     ```sql
     (d."grandTotal"-COALESCE(r.amount,0)-COALESCE(p.amount,0))::numeric(19,4) AS "openAmount"
     ```
     (Here, `subledger.ts` does deduct returns, showing that `sales/invoices/route.ts` and `sales/dashboard` are inconsistent with the GL subledger).

6. **Historical Invoice `ISB--SI-FY2026-27-000004`**:
   - Location: `scratch/audit_invoice.mjs:7`.
   - Has status `APPROVED`, with double-dash sequence number.
   - Per Requirement R1: "Remove its approval dependency and make it eligible for direct posting if valid, without automatically posting it or altering historical data."

7. **Test Framework & Suites**:
   - Vitest v4.1.12 configured in `vitest.config.mts:1-14`.
   - Running `npx vitest run`: 11 test files, 63 tests pass with 0 failures in 2.05s.
   - Acceptance test infrastructure: `scripts/verify-*.ts` runs via `run-with-env.sh` and Prisma Client.

---

### 2. Logic Chain

1. **Approval Workflow Architecture**:
   - Observation: `postSalesInvoice()` in `sales.ts` requires status `APPROVED`, forcing `directPost()` and `POST /api/sales/invoices` auto-post to artificially invoke `submit` and `approve`.
   - Inference: Because `submitSalesInvoice` and `approveSalesInvoice` are still prerequisite steps, approval checks (such as maker-checker, segregation of duties, and approval policies) remain active in the posting pipeline.
   - Deduction: Direct posting must allow posting straight from `DRAFT` to `POSTED` within a single atomic database transaction. The intermediate `SUBMITTED` and `APPROVED` statuses and routes (`/approve`, `/submit`, and entries in `/api/approvals`) must be pruned from the Sales Invoice domain.

2. **UI Summary Cards Architecture**:
   - Observation: `sales-manager.tsx` renders 6 summary cards calculated from `summary` and `pagination.total`. It groups `DRAFT`, `SUBMITTED`, and `APPROVED` into "Unposted Invoices" and calculates no Overdue Receivables or Paid Invoice counts.
   - Inference: The UI lacks the 8 specific cards required by R5.
   - Deduction: The summary aggregation in `api/sales/invoices/route.ts` and the UI cards in `sales-manager.tsx` must be upgraded to provide the exact 8 cards: Total Invoices, Drafts, Awaiting Posting, Posted, Total Posted Sales, Outstanding Receivables, Overdue Receivables, Paid Invoices.

3. **AR Reconciliation & Sales Return Deductions**:
   - Observation: `subledger.ts` defines `openAmount = grandTotal - returnsAmount - allocatedAmount`, whereas `sales/invoices/route.ts` and `sales/dashboard/page.tsx` define `outstandingAmount = grandTotal - paidAmount`.
   - Inference: Whenever a customer has posted sales returns against an invoice, the sales invoice register and sales dashboard show an inflated outstanding balance that does not reconcile with the Customer Subledger or General Ledger control account.
   - Deduction: `api/sales/invoices/route.ts` must join or aggregate posted `stockReturns` (credit notes) for each invoice so that `outstandingAmount = max(grandTotal - returns - paid, 0)`. Furthermore, `payment.ts` validation must enforce that payment allocations cannot exceed `grandTotal - returns - previouslySettled`.

4. **Multi-Criteria Filtering & Grid Enhancement**:
   - Observation: The backend endpoint `GET /api/sales/invoices` already supports `branchId`, `warehouseId`, `customerId`, `salespersonId`, `productId`, `model`, `color`, `from`, `to`, `dueFrom`, `dueTo`. However, the frontend toolbar in `sales-manager.tsx` only exposes `search`, `from`, `to`, `status`, and `paymentStatus`.
   - Inference: The UI does not provide users access to the branch, warehouse, and due date filters that the backend already implements.
   - Deduction: Expanding `sales-manager.tsx` to include branch, warehouse, customer, and date filters, and adding "Due Date" column and "Download PDF" / "Return" action buttons directly fulfills requirement R5.

5. **Test Harness Architecture for the 20 Testing Requirements**:
   - Observation: Vitest is installed and executes in ~2s. TypeScript acceptance scripts run using `tsx` against the live schema and database.
   - Inference: Unit validation (schemas, calculation functions, tax rules, money arithmetic) can be added cleanly as Vitest suites under `src/lib/operations/sales.test.ts`. Integration and database tests (concurrency, atomic rollbacks, IMEI locks, subledger reconciliation) can be run as automated test suites.
   - Deduction: The 20 requirements can be structured into modular Vitest and acceptance test suites targeting each specific lifecycle invariant.

---

### 3. Caveats

1. **Database Runtime**: In the local development sandbox, PostgreSQL runs via `@electric-sql/pglite-server` on port 54329. When running standalone scripts, `scripts/run-with-env.sh` or local database services must be initialized.
2. **Schema Enum Constraints**: `OperationalDocumentStatus` in `prisma/schema.prisma` is a shared database enum across multiple modules (Purchase Orders, Receipts, Payments, Transfers). While requirement R1 restricts Sales Invoice document statuses strictly to `Draft`, `Posted`, `Cancelled`, `Reversed`, modifying the database enum itself could affect other modules if not carefully scoped. The constraint must be enforced at the Sales Invoice domain model and API validation level.
3. **Historical References**: Historical invoices such as `ISB--SI-FY2026-27-000004` and `ISB--RC-FY2026-27-000006` have double hyphens. As mandated by R4 and the acceptance criteria, historical records must be preserved exactly as-is without rewriting historical database rows.

---

### 4. Conclusion

The specification mining investigation has uncovered the precise architectural locations, data flows, and discrepancies across the Order-to-Cash module:

1. **Approval Workflow Removal**: The existing approval mechanism is a superficial layer that requires calling `/submit` and `/approve` before `/post`. Removing this requires enabling direct posting from `DRAFT` to `POSTED` in `src/lib/operations/sales.ts:postSalesInvoice()`, removing the `/approve` and `/submit` route handlers for sales invoices, removing `SALES_INVOICE` from `src/app/api/approvals/route.ts`, and removing approval UI buttons from `sales-manager.tsx`, `sales-invoice-actions.tsx`, and print views.
2. **UI & Dashboard Upgrade**: `src/components/sales/sales-manager.tsx` requires expansion from 6 to 8 summary cards (adding Drafts, Awaiting Posting, Overdue Receivables, Paid Invoices), adding the Due Date column, adding "Download PDF" and "Return" action buttons, and implementing branch, warehouse, and criteria filters.
3. **AR & Reconciliation Repair**: In `src/app/api/sales/invoices/route.ts` and `src/app/(erp)/sales/dashboard/page.tsx`, `outstandingAmount` must be fixed to subtract posted sales returns / credit notes so that invoice outstanding receivables strictly reconcile with `src/lib/finance/subledger.ts` and the GL control account.
4. **Test Infrastructure**: Vitest 4.1.12 is fully operational, and the test suite architecture has been mapped to cover all 20 required verification cases.

---

### 5. Verification Method

To independently verify all findings and test suite infrastructure:

1. **Verify Existing Vitest Test Suite**:
   ```bash
   npx vitest run
   ```
   *Expected result*: 11 test files passed, 63 tests passed.

2. **Verify Type-Checking**:
   ```bash
   npx tsc --noEmit
   ```
   *Expected result*: Analyzes TypeScript compilation across foundation, finance, and operations.

3. **Inspect Key Source Files**:
   - `src/components/sales/sales-manager.tsx`: Lines 154-188 (direct post approval hack), lines 286-358 (6 summary cards), lines 470-667 (table columns and missing actions).
   - `src/app/api/sales/invoices/route.ts`: Line 169 (outstanding AR missing return deduction), lines 218-220 (auto-post calling submit/approve).
   - `src/lib/operations/sales.ts`: Lines 454-466 (forced status flip to APPROVED in postSalesInvoice), line 466 (segregation of duties check).
   - `src/app/api/approvals/route.ts`: Lines 19, 70-79, 168-181, 306-308, 344-349 (SalesInvoice in approval queue).
   - `src/lib/reports/services/imei-reports.ts`: Lines 64-73 (Sold IMEI report missing `status: "POSTED"` filter).
   - `src/lib/finance/subledger.ts`: Lines 89-109 (formula demonstrating returns deduction vs invoices route).
   - `src/app/api/documents/[type]/[id]/pdf/route.ts`: Lines 45-84 (existing invoice PDF endpoint).
