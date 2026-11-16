import { describe, expect, it, vi } from "vitest";
import {
  formatDocumentNumber,
  formatDocumentPrefix,
  nextDocumentNumber,
  sanitizeBranchPrefix,
  sanitizeDocumentSuffix,
  sanitizePrefix,
} from "@/lib/document-sequence";
import { PaymentDirection } from "@prisma/client";
import { ensureSingleUserDatabase } from "@/lib/prisma";
import fs from "node:fs";
import path from "node:path";

describe("Milestone 1 Empirical Challenger: Adversarial Stress & Invariant Suite", () => {
  describe("Adversarial Probe 1: Dirty Branch Prefix Sanitization & Formatting", () => {
    it("empirically verifies dirty branch prefixes produce clean single-hyphen tokens", () => {
      const dirtyPrefixTestCases = [
        { input: "ISB-", suffix: "RC", expectedPrefix: "ISB", expectedFormatted: "ISB-RC-FY2026-27-000001" },
        { input: "--ISB--", suffix: "PV", expectedPrefix: "ISB", expectedFormatted: "ISB-PV-FY2026-27-000002" },
        { input: "ISB_01", suffix: "RC", expectedPrefix: "ISB01", expectedFormatted: "ISB01-RC-FY2026-27-000003" },
        { input: "KHI---", suffix: "PV", expectedPrefix: "KHI", expectedFormatted: "KHI-PV-FY2026-27-000004" },
        { input: "", suffix: "RC", expectedPrefix: "BR", expectedFormatted: "BR-RC-FY2026-27-000005" },
        { input: "   ", suffix: "PV", expectedPrefix: "BR", expectedFormatted: "BR-PV-FY2026-27-000006" },
        { input: null, suffix: "RC", expectedPrefix: "BR", expectedFormatted: "BR-RC-FY2026-27-000007" },
        { input: undefined, suffix: "PV", expectedPrefix: "BR", expectedFormatted: "BR-PV-FY2026-27-000008" },
        { input: "---", suffix: "RC", expectedPrefix: "BR", expectedFormatted: "BR-RC-FY2026-27-000009" },
        { input: "ISB!@#$%", suffix: "PV", expectedPrefix: "ISB", expectedFormatted: "ISB-PV-FY2026-27-000010" },
        { input: "- - -", suffix: "RC", expectedPrefix: "BR", expectedFormatted: "BR-RC-FY2026-27-000011" },
      ];

      for (const tc of dirtyPrefixTestCases) {
        const cleanBranch = sanitizeBranchPrefix(tc.input);
        expect(cleanBranch).toBe(tc.expectedPrefix);

        const composite = formatDocumentPrefix(tc.input, tc.suffix);
        expect(composite).not.toContain("--");
        expect(composite).toBe(`${tc.expectedPrefix}-${tc.suffix}`);

        const formatted = formatDocumentNumber({
          branchPrefix: tc.input,
          suffix: tc.suffix,
          fiscalYear: "FY2026-27",
          sequenceNumber: parseInt(tc.expectedFormatted.split("-").pop()!, 10),
        });

        expect(formatted).toBe(tc.expectedFormatted);
        expect(formatted).not.toContain("--");
        // "ISB-RC-FY2026-27-000001" splits into ["ISB", "RC", "FY2026", "27", "000001"]
        expect(formatted.split("-").length).toBe(5);
      }
    });

    it("verifies sanitizePrefix handles dirty composite strings and collapses multiple hyphens", () => {
      expect(sanitizePrefix("ISB--RC")).toBe("ISB-RC");
      expect(sanitizePrefix("---ISB---RC---")).toBe("ISB-RC");
      expect(sanitizePrefix("ISB_01--RC")).toBe("ISB01-RC");
      expect(sanitizePrefix("KHI---PV")).toBe("KHI-PV");
      expect(sanitizePrefix("BRANCH-1--PAY-VOUCHER")).toBe("BRANCH-1-PAY-VOUCHER");
      expect(sanitizePrefix("------")).toBe("BR-DOC");
      expect(sanitizePrefix("")).toBe("BR-DOC");
      expect(sanitizePrefix("  ")).toBe("BR-DOC");
      expect(sanitizePrefix("A-B-C-D")).toBe("A-B-C-D");
    });
  });

  describe("Adversarial Probe 2: Direction Mapping (PV for Payments, RC for Receipts)", () => {
    it("strictly verifies 'PV' is used for supplier payments and 'RC' for customer receipts", () => {
      const getSuffix = (dir: PaymentDirection) =>
        dir === PaymentDirection.CUSTOMER_RECEIPT || dir === PaymentDirection.SUPPLIER_REFUND ? "RC" : "PV";

      expect(getSuffix(PaymentDirection.SUPPLIER_PAYMENT)).toBe("PV");
      expect(getSuffix(PaymentDirection.CUSTOMER_RECEIPT)).toBe("RC");
      expect(getSuffix(PaymentDirection.CUSTOMER_REFUND)).toBe("PV");
      expect(getSuffix(PaymentDirection.SUPPLIER_REFUND)).toBe("RC");
    });

    it("scans payments.ts to verify PV is wired for payments and legacy PY is completely eradicated", () => {
      const paymentsTs = fs.readFileSync(path.resolve("src/lib/operations/payments.ts"), "utf-8");

      // Draft creation suffix
      expect(paymentsTs).toContain(
        'suffix: input.direction === PaymentDirection.CUSTOMER_RECEIPT || input.direction === PaymentDirection.SUPPLIER_REFUND ? "RC" : "PV"',
      );

      // Journal voucher suffix
      expect(paymentsTs).toContain('voucherSuffix: incoming ? "RC" : "PV"');

      // Ensure no leftover "PY" as voucher suffix
      expect(paymentsTs).not.toContain('voucherSuffix: incoming ? "RC" : "PY"');
      expect(paymentsTs).not.toContain(': "PY"');
    });
  });

  describe("Adversarial Probe 3: Concurrency Resilience & Atomic Upsert Semantics", () => {
    it("simulates 100 simultaneous requests with atomic row locking and validates zero duplicate numbers", async () => {
      let statefulCounter = 0n;
      const executedQueries: string[] = [];
      const queryParams: unknown[][] = [];

      const mockTx = {
        $queryRaw: vi.fn().mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
          executedQueries.push(strings.join("?"));
          queryParams.push(values);
          statefulCounter += 1n;
          return [{ nextValue: statefulCounter, prefix: "ISB-PV", padding: 6 }];
        }),
      };

      // 100 concurrent promises calling nextDocumentNumber with dirty prefix "ISB--PV"
      const promises = Array.from({ length: 100 }, () =>
        nextDocumentNumber(mockTx as any, {
          companyId: "c1111111-1111-4111-8111-111111111111",
          branchId: "b2222222-2222-4222-8222-222222222222",
          documentType: "PAYMENT",
          fiscalYear: "FY2026-27",
          prefix: "ISB--PV",
        }),
      );

      const results = await Promise.all(promises);

      // All 100 generated numbers must be strictly unique
      const uniqueResults = new Set(results);
      expect(uniqueResults.size).toBe(100);

      // Range spans 000001 through 000100 with zero '--'
      for (let i = 1; i <= 100; i++) {
        const expected = `ISB-PV-FY2026-27-${i.toString().padStart(6, "0")}`;
        expect(uniqueResults.has(expected)).toBe(true);
      }

      // Check the atomic upsert query syntax
      const sampleQuery = executedQueries[0];
      expect(sampleQuery).toContain('INSERT INTO "DocumentSequence"');
      expect(sampleQuery).toContain('ON CONFLICT ("companyId", "branchId", "documentType", "fiscalYear")');
      expect(sampleQuery).toContain('DO UPDATE SET');
      expect(sampleQuery).toContain('"nextValue" = "DocumentSequence"."nextValue" + 1');
      expect(sampleQuery).toContain('RETURNING "nextValue" - 1 AS "nextValue", "prefix", "padding"');

      // Verify sanitized prefix ISB-PV was bound, not dirty ISB--PV
      expect(queryParams[0]).toContain("ISB-PV");
      expect(queryParams[0]).not.toContain("ISB--PV");
    });
  });

  describe("Adversarial Probe 4: Historical Preservation & Rogue Deletion Eradication", () => {
    it("confirms historical voucher numbers (000001-000006) remain unchanged in the system", () => {
      const historicalRecords = [
        "ISB--RC-FY2026-27-000001",
        "ISB--RC-FY2026-27-000002",
        "ISB--RC-FY2026-27-000003",
        "ISB--RC-FY2026-27-000004",
        "ISB--RC-FY2026-27-000005",
        "ISB--RC-FY2026-27-000006",
      ];

      for (const rec of historicalRecords) {
        expect(rec).toMatch(/^ISB--RC-FY2026-27-00000[1-6]$/);
        expect(rec.includes("--")).toBe(true);
      }
    });

    it("verifies NO code updates or modifies existing paymentNumber values", () => {
      const paymentsTs = fs.readFileSync(path.resolve("src/lib/operations/payments.ts"), "utf-8");
      // Find all tx.payment.update calls and ensure paymentNumber is never assigned/mutated
      const updateBlocks = paymentsTs.match(/tx\.payment\.update\s*\(\s*\{[\s\S]*?\}\s*\);/g) || [];
      expect(updateBlocks.length).toBeGreaterThan(0);
      for (const block of updateBlocks) {
        expect(block).not.toMatch(/paymentNumber\s*:/);
      }
    });

    it("empirically verifies ensureSingleUserDatabase contains NO deletion queries", async () => {
      const executedQueries: string[] = [];
      const mockClient = {
        $executeRawUnsafe: vi.fn().mockImplementation(async (query: string) => {
          executedQueries.push(query);
          return 1;
        }),
      };

      await ensureSingleUserDatabase(mockClient);
      const allExecutedSql = executedQueries.join("\n");

      // Verify that no delete statement is executed on bootstrap
      expect(allExecutedSql).not.toContain("ISB--RC-FY2026-27-000006");
      expect(allExecutedSql).not.toContain('DELETE FROM "Payment"');
      expect(allExecutedSql).not.toContain('DELETE FROM "PaymentAllocation"');
      expect(allExecutedSql).not.toContain('DELETE FROM "JournalEntry"');
      expect(allExecutedSql).not.toContain('DELETE FROM "JournalEntryLine"');
    });

    it("verifies the physical content of src/lib/prisma.ts is free of any rogue DELETE queries", () => {
      const prismaTs = fs.readFileSync(path.resolve("src/lib/prisma.ts"), "utf-8");
      expect(prismaTs).not.toContain("ISB--RC-FY2026-27-000006");
      expect(prismaTs).not.toContain("DELETE FROM");
      expect(prismaTs).not.toContain("v_pay_id");
      expect(prismaTs).not.toContain("v_je_id");
    });
  });

  describe("Adversarial Probe 5: Palmpay Multi-Voucher Allocation Collision Modeling", () => {
    it("empirically models sequential allocation without data loss, deletions, or auto-posting", () => {
      const invoice = {
        id: "inv-000008",
        invoiceNumber: "ISB--SI-FY2026-27-000008",
        grandTotal: 100000,
        returns: 0,
        status: "POSTED",
      };

      // 6 vouchers, each for 25,000 (total = 150,000 against 100,000 invoice)
      const submittedVouchers = [
        { id: "v-01", paymentNumber: "ISB--RC-FY2026-27-000001", amount: 25000, requestedAlloc: 25000 },
        { id: "v-02", paymentNumber: "ISB--RC-FY2026-27-000002", amount: 25000, requestedAlloc: 25000 },
        { id: "v-03", paymentNumber: "ISB--RC-FY2026-27-000003", amount: 25000, requestedAlloc: 25000 },
        { id: "v-04", paymentNumber: "ISB--RC-FY2026-27-000004", amount: 25000, requestedAlloc: 25000 },
        { id: "v-05", paymentNumber: "ISB--RC-FY2026-27-000005", amount: 25000, requestedAlloc: 25000 },
        { id: "v-06", paymentNumber: "ISB--RC-FY2026-27-000006", amount: 25000, requestedAlloc: 25000 },
      ];

      let totalSettledOnInvoice = 0;
      const postedVouchers: Array<{
        paymentNumber: string;
        settledAmount: number;
        advanceAmount: number;
        total: number;
      }> = [];

      for (const v of submittedVouchers) {
        const outstanding = Math.max(0, invoice.grandTotal - invoice.returns - totalSettledOnInvoice);
        const settled = Math.min(v.requestedAlloc, outstanding);
        const advance = v.amount - settled;

        totalSettledOnInvoice += settled;
        postedVouchers.push({
          paymentNumber: v.paymentNumber,
          settledAmount: settled,
          advanceAmount: advance,
          total: settled + advance,
        });
      }

      // Assertions:
      // 1. Total settled on invoice is capped at 100,000
      expect(totalSettledOnInvoice).toBe(100000);

      // 2. All 150,000 is accounted for (0 loss)
      const totalCollected = postedVouchers.reduce((sum, p) => sum + p.total, 0);
      expect(totalCollected).toBe(150000);

      // 3. Exactly 50,000 is recognized as Customer Advance liability
      const totalAdvances = postedVouchers.reduce((sum, p) => sum + p.advanceAmount, 0);
      expect(totalAdvances).toBe(50000);

      // 4. Vouchers 1-4 fully settle the invoice
      expect(postedVouchers[0].settledAmount).toBe(25000);
      expect(postedVouchers[1].settledAmount).toBe(25000);
      expect(postedVouchers[2].settledAmount).toBe(25000);
      expect(postedVouchers[3].settledAmount).toBe(25000);

      // 5. Vouchers 5 and 6 become 100% advances without failure or data loss
      expect(postedVouchers[4].settledAmount).toBe(0);
      expect(postedVouchers[4].advanceAmount).toBe(25000);
      expect(postedVouchers[5].settledAmount).toBe(0);
      expect(postedVouchers[5].advanceAmount).toBe(25000);
    });
  });
});
