# Milestone 1 Empirical Verification & Adversarial Challenge Report

**Author:** `teamwork_challenger_m1_3` (critic / specialist)  
**Recipient / Parent:** `e8657fcc-1efa-46f3-99d0-8540dc43c347` (Orchestrator)  
**Date:** 2026-11-15T12:07:00Z  
**Type:** Hard Handoff  
**Verdict:** **APPROVE**  

---

## 1. Observation

Direct code and test observations executed locally:

1. **Test Execution Results**:
   - Running `npx vitest run src/__tests__/settlement/numbering.test.ts`:
     ```
     RUN  v4.1.12 D:/Inventory Managment Software
     ✓ src/__tests__/settlement/numbering.test.ts (18 tests) 37ms
     Test Files  1 passed (1)
          Tests  18 passed (18)
     ```
   - Running comprehensive adversarial suite `npx vitest run src/__tests__/settlement/m1-adversarial.test.ts`:
     ```
     RUN  v4.1.12 D:/Inventory Managment Software
     ✓ src/__tests__/settlement/m1-adversarial.test.ts (10 tests) 23ms
     Test Files  1 passed (1)
          Tests  10 passed (10)
     ```
   - Combined test run (`npx vitest run src/__tests__/settlement/numbering.test.ts src/__tests__/settlement/m1-adversarial.test.ts`):
     ```
     Test Files  2 passed (2)
          Tests  28 passed (28)
     ```

2. **Branch Prefix Sanitization & Format**:
   - In `src/lib/document-sequence.ts`:
     - Lines 7–10:
       ```typescript
       export function sanitizeBranchPrefix(raw?: string | null): string {
         const sanitized = (raw || "BR").trim().replace(/[^A-Za-z0-9]/g, "");
         return sanitized || "BR";
       }
       ```
     - Lines 24–30:
       ```typescript
       export function sanitizePrefix(prefix: string): string {
         const parts = prefix
           .split("-")
           .map((part) => part.trim().replace(/[^A-Za-z0-9]/g, ""))
           .filter(Boolean);
         return parts.length > 0 ? parts.join("-") : "BR-DOC";
       }
       ```
     - Lines 45–56:
       ```typescript
       export function formatDocumentNumber(input: {
         branchPrefix?: string | null;
         suffix?: string | null;
         fiscalYear: string;
         sequenceNumber: number | bigint;
         padding?: number;
       }): string {
         const prefix = formatDocumentPrefix(input.branchPrefix, input.suffix);
         const pad = input.padding ?? 6;
         const seqStr = input.sequenceNumber.toString().padStart(pad, "0");
         return `${prefix}-${input.fiscalYear}-${seqStr}`;
       }
       ```
   - Tested hostile inputs: `"ISB-"`, `"--ISB--"`, `"ISB_01"`, `"KHI---"`, `""`, `"   "`, `null`, `undefined`, `"---"`, `"ISB!@#$%"`, `"- - -"`.
   - All inputs produced clean alphanumeric prefix tokens (`"ISB"`, `"ISB01"`, `"KHI"`, `"BR"`) and single-hyphen sequence numbers (`ISB-RC-FY2026-27-000001`, `ISB-PV-FY2026-27-000002`, `ISB01-RC-FY2026-27-000003`, `KHI-PV-FY2026-27-000004`, `BR-RC-FY2026-27-000005`). Zero double hyphens (`--`) were generated.

3. **Voucher Suffix Mapping (PV vs RC)**:
   - In `src/lib/operations/payments.ts`:
     - Line 97 (`createPaymentDraft`):
       ```typescript
       suffix: input.direction === PaymentDirection.CUSTOMER_RECEIPT || input.direction === PaymentDirection.SUPPLIER_REFUND ? "RC" : "PV",
       ```
     - Line 374 (`postPayment`):
       ```typescript
       voucherSuffix: incoming ? "RC" : "PV",
       ```
   - Grep verification across `src/lib/operations/payments.ts` confirmed 0 occurrences of `: "PY"` or legacy `"PY"` voucher suffixes.

4. **Concurrency Resilience & Atomic Upsert Semantics**:
   - In `src/lib/document-sequence.ts` lines 76–89:
     ```typescript
     const rows = await tx.$queryRaw<Array<{ nextValue: bigint; prefix: string; padding: number }>>`
       INSERT INTO "DocumentSequence"
         ("id", "companyId", "branchId", "documentType", "prefix", "fiscalYear", "nextValue", "padding", "version", "createdAt", "updatedAt")
       VALUES
         (${crypto.randomUUID()}::uuid, ${input.companyId}::uuid, ${input.branchId ?? null}::uuid,
          ${input.documentType}, ${cleanPrefix}, ${input.fiscalYear}, 2, ${pad}, 1, NOW(), NOW())
       ON CONFLICT ("companyId", "branchId", "documentType", "fiscalYear")
       DO UPDATE SET
         "nextValue" = "DocumentSequence"."nextValue" + 1,
         "prefix" = ${cleanPrefix},
         "version" = "DocumentSequence"."version" + 1,
         "updatedAt" = NOW()
       RETURNING "nextValue" - 1 AS "nextValue", "prefix", "padding"
     `;
     ```
   - An adversarial probe firing 100 concurrent promises simulating parallel requests produced 100 strictly unique, monotonic sequential document numbers (`ISB-PV-FY2026-27-000001` through `000100`) without gaps, collision, or duplicate allocations.

5. **Historical Voucher Immutability & Rogue Deletion Eradication**:
   - In `src/lib/prisma.ts` lines 48–87:
     The `DO $$ DECLARE v_pay_id uuid; ... DELETE FROM "Payment" WHERE "paymentNumber" = 'ISB--RC-FY2026-27-000006' ... $$;` block has been completely eliminated.
   - Calling `ensureSingleUserDatabase(mockClient)` executed only trigger drops and setting updates; no `DELETE FROM` statements were generated or executed.
   - Codebase inspection confirmed that `tx.payment.update` in `payments.ts` never updates `paymentNumber`, and no SQL migration renames or alters historical records `ISB--RC-FY2026-27-000001` through `000006`.

6. **Audit Report Inspection (`HISTORICAL_VOUCHER_AUDIT.md`)**:
   - Location: `d:\Inventory Managment Software\.agents\teamwork\orchestrator_settlement\HISTORICAL_VOUCHER_AUDIT.md`.
   - Identified root cause of blocking: target sales invoice `ISB--SI-FY2026-27-000008` is unposted, triggering `409 INVALID_ALLOCATION` in `validateAllocations`.
   - Identified root cause of over-allocation: the draft query evaluated `settled` only on `POSTED` vouchers, allowing vouchers `000001..000006` to simultaneously allocate the full invoice amount in draft state.
   - Verified correction plan: zero renaming of historical vouchers, zero destructive record deletions, and no blind background posting. Recommends converting allocation overflow into explicit **Customer Advances** (`salesInvoiceId: null`) upon authorized posting, preserving 100% of funds.

---

## 2. Logic Chain

1. **Single-Hyphen Sequence Guarantee**:
   From Observation 2, `sanitizeBranchPrefix` strips all non-alphanumeric characters, and `sanitizePrefix` splits by `-`, filters empty parts, and joins with `-`. Because neither component can contain hyphens or symbols, their composition `${cleanBranch}-${cleanSuffix}-FY${year}-${seq6}` mathematically guarantees exactly one hyphen delimiter between tokens. Empirically proven by 11 hostile input cases passing with 0 double-hyphens.
2. **Correct Voucher Classification**:
   From Observation 3, both draft creation and journal posting routes explicitly test `direction` and assign `"RC"` to customer receipts / supplier refunds and `"PV"` to supplier payments / customer refunds. Legacy `"PY"` is verified absent from all settlement code paths.
3. **Concurrency and Monotonic Allocation**:
   From Observation 4, PostgreSQL's `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` acquires a pessimistic row-level lock on the conflicting index key (`companyId`, `branchId`, `documentType`, `fiscalYear`). Any concurrent transaction attempting to allocate on the same sequence key will block until the prior transaction finishes, preventing race conditions. Empirically validated across 100 concurrent requests without collisions.
4. **Historical Data Preservation**:
   From Observation 5, no application code or database migration mutates `Payment.paymentNumber`. The rogue deletion query in `prisma.ts` that dropped `ISB--RC-FY2026-27-000006` on server boot was excised, preventing startup data loss.
5. **Soundness of the Audit & Safe Correction Model**:
   From Observation 6, `HISTORICAL_VOUCHER_AUDIT.md` correctly diagnoses the double-hyphen origin, the unposted invoice roadblock, and the draft-concurrency allocation race. It adheres strictly to double-entry standards by requiring user validation and preserving excess funds as customer advance liabilities rather than deleting or silently truncating records.

---

## 3. Caveats

- **Invoice `ISB--SI-FY2026-27-000008` Posting**: As mandated by R4 and the correction plan, this invoice has NOT been posted in Milestone 1; it remains for authorized finance users to post in the invoice workflow.
- **Approval Workflow Removal**: Full removal of maker-checker checks and approval queues from `postPayment` belongs to Milestone 2; Milestone 1 focused strictly on sequence numbering, sanitization, Prisma guards, and the historical audit plan.
- **Downstream Milestones (M2–M7)**: Subledger mathematical reconciliation and advance GL liability creation will be fully wired into `postPayment` and `validateAllocations` during Milestones 2, 3, and 4.

---

## 4. Conclusion

**Verdict: APPROVE**

Milestone 1 satisfies all functional, architectural, and safety requirements specified in `ORIGINAL_REQUEST.md` (R4) and `PROJECT.md` (Features 1 and 2):
1. Voucher sequence numbers are clean single-hyphen tokens (`ISB-RC-...`, `ISB-PV-...`).
2. Supplier payments correctly format with `"PV"` and customer receipts with `"RC"`.
3. Concurrency safety is guaranteed by atomic PostgreSQL row-locked upsert semantics.
4. Historical voucher records `000001` through `000006` are preserved without renaming or modification.
5. The destructive deletion query in `prisma.ts` was permanently removed.
6. The Palmpay multi-voucher collision is thoroughly documented in `HISTORICAL_VOUCHER_AUDIT.md` with a non-destructive customer advance correction plan.

---

## 5. Verification Method

To independently verify this milestone, run:

1. **Standard Numbering Tests**:
   ```bash
   npx vitest run src/__tests__/settlement/numbering.test.ts
   ```
   *Expected Output*: 18 passed.

2. **Adversarial Stress & Historical Invariant Tests**:
   ```bash
   npx vitest run src/__tests__/settlement/m1-adversarial.test.ts
   ```
   *Expected Output*: 10 passed.

3. **Combined Suite**:
   ```bash
   npx vitest run src/__tests__/settlement/numbering.test.ts src/__tests__/settlement/m1-adversarial.test.ts
   ```
   *Expected Output*: 28 passed across 2 test files.

4. **Code Inspection**:
   - `src/lib/document-sequence.ts`: Review `sanitizeBranchPrefix`, `sanitizePrefix`, and `nextDocumentNumber`.
   - `src/lib/operations/payments.ts`: Review lines 97 and 374 for `"PV"` suffix mapping.
   - `src/lib/prisma.ts`: Verify lines 48–87 have zero `DELETE` statements or mentions of voucher `000006`.
   - `d:\Inventory Managment Software\.agents\teamwork\orchestrator_settlement\HISTORICAL_VOUCHER_AUDIT.md`: Review forensic audit findings and multi-voucher collision handling.

5. **Invalidation Conditions**:
   - Any newly allocated voucher number containing consecutive hyphens (`--`).
   - Any supplier payment allocated with suffix `"PY"` instead of `"PV"`.
   - Any execution of `ensureSingleUserDatabase()` executing `DELETE` statements.
   - Any code modifying historical voucher numbers `ISB--RC-FY2026-27-000001` through `000006`.
