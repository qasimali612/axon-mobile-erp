# Handoff Report: Database, Schema & Historical Voucher Audit

**Author:** teamwork_explorer (`teamwork_explorer_survey_1`)  
**Parent Agent:** `e8657fcc-1efa-46f3-99d0-8540dc43c347`  
**Working Directory:** `d:\Inventory Managment Software\.agents\teamwork\teamwork_explorer_survey_1\`  
**Date:** 2026-11-10T12:30:00Z  
**Primary Deliverable:** `d:\Inventory Managment Software\.agents\teamwork\teamwork_explorer_survey_1\survey_db_audit.md`  

---

## 1. Observation

1. **Prisma Models & Topology**:
   - `Payment` model defined in `prisma/schema.prisma:3072-3125`. Fields include `paymentNumber String @db.VarChar(60)`, `direction PaymentDirection`, `status OperationalDocumentStatus @default(DRAFT)`, `amount Decimal @db.Decimal(19, 4)`, `customerId`, `supplierId`, `bankAccountId`, `cashAccountId`, `paymentMethodId`, `journalEntryId`, `reversalOfId`.
   - `PaymentAllocation` model defined in `prisma/schema.prisma:3127-3141`. Fields include `paymentId`, `salesInvoiceId`, `purchaseReceiptId`, `amount Decimal @db.Decimal(19, 4)`. There is **no unique constraint** on `(paymentId, salesInvoiceId)`.
   - `JournalEntry` and `JournalEntryLine` defined in `prisma/schema.prisma:1286-1402`. `JournalEntryLine` maintains direct party subledger foreign keys: `customerId String? @db.Uuid`, `supplierId String? @db.Uuid`, and `bankAccountId String? @db.Uuid`. All debit/credit values are `Decimal(19, 4)`.
   - `DocumentSequence` model defined in `prisma/schema.prisma:757-775` with `@@unique([companyId, branchId, documentType, fiscalYear])`.

2. **Historical Voucher Logic & Blocker Analysis**:
   - In `src/lib/operations/payments.ts:271`:
     ```typescript
     if (allocation.salesInvoice.status !== OperationalDocumentStatus.POSTED) {
       throw new ApiError(409, "INVALID_ALLOCATION", "A sales allocation does not reference a posted invoice for this customer.");
     }
     ```
     Customer receipts allocating against an unposted invoice fail validation immediately.
   - In `src/lib/operations/payments.ts:274-282`:
     ```typescript
     const totals = await tx.$queryRaw<Array<{ settled: Prisma.Decimal }>>(Prisma.sql`
       SELECT COALESCE(SUM(CASE p."direction" WHEN 'CUSTOMER_RECEIPT' THEN a."amount" ELSE -a."amount" END),0)::numeric(19,4) AS settled
       FROM "PaymentAllocation" a JOIN "Payment" p ON p."id" = a."paymentId"
       WHERE a."salesInvoiceId" = ${allocation.salesInvoiceId}::uuid AND p."status" = 'POSTED'
     `);
     const settled = totals[0]?.settled || zero();
     if (payment.direction === PaymentDirection.CUSTOMER_RECEIPT && settled.plus(allocation.amount).gt(allocation.salesInvoice.grandTotal)) {
       throw new ApiError(409, "INVOICE_OVERPAYMENT", `Allocation exceeds the open amount on invoice ${allocation.salesInvoice.invoiceNumber}.`);
     }
     ```
     `settled` calculates only `p."status" = 'POSTED'`. When multiple vouchers are created in `SUBMITTED` state against invoice `000008` (Palmpay Limited), none show up as settled until one posts; the subsequent vouchers then fail with `INVOICE_OVERPAYMENT`.

3. **Voucher Deletion Anomaly**:
   - Migration `prisma/migrations/20261109190000_remove_voucher_and_allow_payment_delete/migration.sql:7`:
     `SELECT id, "journalEntryId" INTO v_pay_id, v_je_id FROM "Payment" WHERE "paymentNumber" = 'ISB--RC-FY2026-27-000006';`
     Attempts raw deletion of voucher `ISB--RC-FY2026-27-000006`.
   - `src/lib/prisma.ts:89`:
     Contains the exact same query in `initDbGuards()`.

4. **Document Numbering Architecture & Double Hyphens**:
   - In `src/lib/operations/accounting.ts:105-113`:
     ```typescript
     const cleanBranch = (branch.documentPrefix || "BR").trim().replace(/-+$/, "");
     const cleanSuffix = (input.suffix || "DOC").trim().replace(/^-+/, "");
     const number = await nextDocumentNumber(tx, {
       companyId: input.companyId,
       branchId: input.branchId,
       documentType: input.documentType,
       fiscalYear: period.fiscalYear.code,
       prefix: `${cleanBranch}-${cleanSuffix}`,
     });
     ```
     Before `.replace(/-+$/, "")` was introduced, `branch.documentPrefix = "ISB-"` produced `prefix = "ISB--RC"`.
   - In `src/lib/finance/posting.ts:93`:
     `prefix: `${branch.documentPrefix}-${documentType === "JOURNAL_REVERSAL" ? "RV" : "JV"}``
     `posting.ts` still does not sanitize `branch.documentPrefix`.
   - In `src/lib/operations/payments.ts:97`:
     `suffix: input.direction === PaymentDirection.CUSTOMER_RECEIPT || input.direction === PaymentDirection.SUPPLIER_REFUND ? "RC" : "PY"`
     Uses `"PY"` instead of `"PV"` (Payment Voucher) as requested in R4.

---

## 2. Logic Chain

1. **Step 1 (Schema & Precision)**:
   Observations in `prisma/schema.prisma` show that `Payment`, `PaymentAllocation`, `JournalEntry`, and `JournalEntryLine` already support all required financial fields using `Decimal(19, 4)` and foreign keys to `Customer`, `Supplier`, `BankAccount`, and `Account`. No schema redesign is needed for basic settlement, but advance handling and single-hyphen sequence updates must be formalized.

2. **Step 2 (Why Existing Vouchers are Submitted)**:
   Observations in `payments.ts:271` and `POS_IMPLEMENTATION_PLAN.md:33` confirm that Palmpay Limited invoice `ISB--SI-FY2026-27-000008` (and `000004`) was created but remained unposted due to legacy maker-checker restrictions. When vouchers `ISB--RC-FY2026-27-000001` through `000006` attempted to allocate against invoice `000008`, `validateAllocations` threw `409 INVALID_ALLOCATION` because the invoice was not in `POSTED` status. Consequently, the vouchers remained stuck in `SUBMITTED` status without generating journal entries.

3. **Step 3 (Duplicate Allocation & Race Condition)**:
   Because `settled` only counts already-posted payments (`p.status = 'POSTED'`), all six submitted vouchers were able to allocate up to the full invoice total without conflict during draft creation. When posting sequentially, the first voucher consumes the open balance; subsequent vouchers would fail with `INVOICE_OVERPAYMENT` unless the excess amount is recorded as a **Customer Advance** rather than rejected.

4. **Step 4 (Numbering Architecture)**:
   Observation of `branch.documentPrefix = "ISB-"` and string interpolation `${branch.documentPrefix}-${suffix}` explains why double hyphens (`ISB--RC`, `ISB--SI`) occurred. Stripping non-alphanumeric characters (`replace(/[^A-Z0-9]/g, "")`) and using suffix `"RC"` for receipts and `"PV"` for payments produces `ISB-RC-FY2026-27-XXXXXX` and `ISB-PV-FY2026-27-XXXXXX`. Concurrency safety is guaranteed by PostgreSQL's `INSERT ... ON CONFLICT DO UPDATE RETURNING` row lock on `DocumentSequence`.

---

## 3. Caveats

1. **Embedded Database State**:
   The local database `./.pglite/axon-erp` currently contains foundation tables (Chart of Accounts, Roles, Permissions, Users, Branches, Warehouses) with operational transactions previously reset by `scripts/reset-to-clean-slate.ts`. Historical voucher analysis was completed through forensic investigation of codebase code paths, migrations, audit logs, and test fixtures.
2. **Read-Only Investigation Mandate**:
   As strictly required by the prompt, no historical database records were modified or automatically posted. The correction plan outlines safe interactive resolution.

---

## 4. Conclusion

1. **Historical Vouchers**:
   Vouchers `ISB--RC-FY2026-27-000001` through `000006` remained in `SUBMITTED` state because their target invoice `ISB--SI-FY2026-27-000008` was unposted, and legacy maker-checker gatekeepers prevented progression.
2. **Safe Correction Plan**:
   - Invoices must be posted first.
   - Allocations against the invoice should settle the open balance; any surplus payment funds must be preserved as Customer Advances (`salesInvoiceId: null`) rather than causing failures.
   - Historical voucher numbers must be preserved exactly as-is.
   - Raw deletion code in `src/lib/prisma.ts:initDbGuards` must be removed.
3. **Numbering Fix**:
   - Update `payments.ts` supplier payment suffix to `"PV"`.
   - Apply clean alphanumeric regex sanitization to branch document prefixes.
   - Existing numbers in database tables remain unchanged, and future numbers follow `ISB-RC-FY2026-27-XXXXXX` and `ISB-PV-FY2026-27-XXXXXX`.

---

## 5. Verification Method

1. **Inspect Schema & Models**:
   - Verify `Payment`, `PaymentAllocation`, `JournalEntryLine` in `prisma/schema.prisma:3072-3141` and `1361-1402`.
2. **Verify Numbering Sanitization**:
   - Review `src/lib/operations/accounting.ts:105-113` and `src/lib/document-sequence.ts:18-35`.
3. **Verify Audit Document**:
   - Read full audit report at `d:\Inventory Managment Software\.agents\teamwork\teamwork_explorer_survey_1\survey_db_audit.md`.
4. **Invalidation Conditions**:
   - If any proposed fix modifies historical voucher numbers or drops historical transactions, the solution violates R4 and is invalid.
   - If supplier payments continue to use `"PY"` instead of `"PV"`, the numbering requirement is not met.
