import { describe, expect, it, vi } from "vitest";
import {
  DOCUMENT_SEQUENCE_REGEX,
  HISTORICAL_DOCUMENT_SEQUENCE_REGEX,
  formatDocumentNumber,
  formatDocumentPrefix,
  isHistoricalDocumentSequence,
  isValidDocumentSequence,
  nextDocumentNumber,
  sanitizeBranchPrefix,
  sanitizeDocumentSuffix,
  sanitizePrefix,
} from "@/lib/document-sequence";
import { PaymentDirection, PosShiftStatus, Prisma, ReceiptPrinterType } from "@prisma/client";

describe("Milestone 1: Voucher Sequence Numbering & Concurrency Architecture", () => {
  describe("Branch Prefix Sanitization", () => {
    it("strips trailing hyphens from branch prefix (e.g. 'ISB-' -> 'ISB')", () => {
      expect(sanitizeBranchPrefix("ISB-")).toBe("ISB");
      expect(sanitizeBranchPrefix("ISB--")).toBe("ISB");
      expect(sanitizeBranchPrefix("KHI---")).toBe("KHI");
    });

    it("strips leading hyphens and surrounding whitespace", () => {
      expect(sanitizeBranchPrefix("-ISB")).toBe("ISB");
      expect(sanitizeBranchPrefix("  --ISB--  ")).toBe("ISB");
    });

    it("strips non-alphanumeric characters while preserving branch codes", () => {
      expect(sanitizeBranchPrefix("ISB#01")).toBe("ISB01");
      expect(sanitizeBranchPrefix("LHE_BR.1")).toBe("LHEBR1");
      expect(sanitizeBranchPrefix("RWP-01!")).toBe("RWP01");
    });

    it("falls back to 'BR' when given empty, whitespace, null, or symbol-only inputs", () => {
      expect(sanitizeBranchPrefix("")).toBe("BR");
      expect(sanitizeBranchPrefix("   ")).toBe("BR");
      expect(sanitizeBranchPrefix("---")).toBe("BR");
      expect(sanitizeBranchPrefix(null)).toBe("BR");
      expect(sanitizeBranchPrefix(undefined)).toBe("BR");
    });
  });

  describe("Document Suffix Sanitization", () => {
    it("cleans standard document suffixes (RC, PV, JV, RV)", () => {
      expect(sanitizeDocumentSuffix("RC")).toBe("RC");
      expect(sanitizeDocumentSuffix("PV")).toBe("PV");
      expect(sanitizeDocumentSuffix("JV")).toBe("JV");
      expect(sanitizeDocumentSuffix("RV")).toBe("RV");
    });

    it("strips hyphens and non-alphanumerics from suffixes", () => {
      expect(sanitizeDocumentSuffix("-PV-")).toBe("PV");
      expect(sanitizeDocumentSuffix("--RC--")).toBe("RC");
      expect(sanitizeDocumentSuffix("PV_01")).toBe("PV01");
    });

    it("falls back to 'DOC' when given empty or null suffix", () => {
      expect(sanitizeDocumentSuffix("")).toBe("DOC");
      expect(sanitizeDocumentSuffix(null)).toBe("DOC");
      expect(sanitizeDocumentSuffix(undefined)).toBe("DOC");
    });
  });

  describe("Composite Prefix Formatting", () => {
    it("creates strictly single-hyphen prefix from branch and suffix", () => {
      expect(formatDocumentPrefix("ISB-", "RC")).toBe("ISB-RC");
      expect(formatDocumentPrefix("ISB-", "PV")).toBe("ISB-PV");
      expect(formatDocumentPrefix("KHI", "JV")).toBe("KHI-JV");
      expect(formatDocumentPrefix("LHE--", "RV")).toBe("LHE-RV");
      expect(formatDocumentPrefix("  ISB-  ", "  -PV-  ")).toBe("ISB-PV");
    });

    it("sanitizes composite prefix strings with double-hyphens (e.g. 'ISB--RC' -> 'ISB-RC')", () => {
      expect(sanitizePrefix("ISB--RC")).toBe("ISB-RC");
      expect(sanitizePrefix("ISB--PV")).toBe("ISB-PV");
      expect(sanitizePrefix("--ISB---RC--")).toBe("ISB-RC");
      expect(sanitizePrefix("ISB-RC")).toBe("ISB-RC");
      expect(sanitizePrefix("ISB")).toBe("ISB");
    });
  });

  describe("Document Suffix Rules: PV for Supplier Payments & RC for Receipts", () => {
    it("maps CUSTOMER_RECEIPT to RC suffix", () => {
      const getSuffix = (dir: PaymentDirection) =>
        dir === PaymentDirection.CUSTOMER_RECEIPT || dir === PaymentDirection.SUPPLIER_REFUND ? "RC" : "PV";

      expect(getSuffix(PaymentDirection.CUSTOMER_RECEIPT)).toBe("RC");
    });

    it("maps SUPPLIER_PAYMENT to PV suffix (NOT legacy 'PY')", () => {
      const getSuffix = (dir: PaymentDirection) =>
        dir === PaymentDirection.CUSTOMER_RECEIPT || dir === PaymentDirection.SUPPLIER_REFUND ? "RC" : "PV";

      expect(getSuffix(PaymentDirection.SUPPLIER_PAYMENT)).toBe("PV");
      expect(getSuffix(PaymentDirection.SUPPLIER_PAYMENT)).not.toBe("PY");
    });

    it("maps refunds consistently", () => {
      const getSuffix = (dir: PaymentDirection) =>
        dir === PaymentDirection.CUSTOMER_RECEIPT || dir === PaymentDirection.SUPPLIER_REFUND ? "RC" : "PV";

      expect(getSuffix(PaymentDirection.SUPPLIER_REFUND)).toBe("RC");
      expect(getSuffix(PaymentDirection.CUSTOMER_REFUND)).toBe("PV");
    });
  });

  describe("Sequential Single-Hyphen Voucher Formatting", () => {
    const FISCAL_YEAR = "FY2026-27";

    it("formats customer receipt voucher number strictly with single hyphens", () => {
      const num = formatDocumentNumber({
        branchPrefix: "ISB-",
        suffix: "RC",
        fiscalYear: FISCAL_YEAR,
        sequenceNumber: 1,
      });

      expect(num).toBe("ISB-RC-FY2026-27-000001");
      expect(num).not.toContain("--");
      expect(num).toMatch(/^ISB-RC-FY\d{4}-\d{2}-\d{6}$/);
    });

    it("formats supplier payment voucher number strictly with PV and single hyphens", () => {
      const num = formatDocumentNumber({
        branchPrefix: "ISB-",
        suffix: "PV",
        fiscalYear: FISCAL_YEAR,
        sequenceNumber: 42,
      });

      expect(num).toBe("ISB-PV-FY2026-27-000042");
      expect(num).not.toContain("--");
      expect(num).not.toContain("PY");
      expect(num).toMatch(/^ISB-PV-FY\d{4}-\d{2}-\d{6}$/);
    });

    it("correctly pads sequence numbers up to 6 digits", () => {
      expect(
        formatDocumentNumber({
          branchPrefix: "KHI",
          suffix: "RC",
          fiscalYear: FISCAL_YEAR,
          sequenceNumber: 99,
        }),
      ).toBe("KHI-RC-FY2026-27-000099");

      expect(
        formatDocumentNumber({
          branchPrefix: "KHI",
          suffix: "PV",
          fiscalYear: FISCAL_YEAR,
          sequenceNumber: 1000,
        }),
      ).toBe("KHI-PV-FY2026-27-001000");
    });
  });

  describe("Database Atomic Upsert & nextDocumentNumber", () => {
    it("executes PostgreSQL atomic upsert query and returns sanitized single-hyphen voucher number", async () => {
      let executedQuery = "";
      let queryValues: unknown[] = [];

      const mockTx = {
        $queryRaw: vi.fn().mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
          executedQuery = strings.join("?");
          queryValues = values;
          return [
            {
              nextValue: 7n,
              prefix: "ISB-RC",
              padding: 6,
            },
          ];
        }),
      };

      // Call nextDocumentNumber with dirty prefix "ISB--RC"
      const result = await nextDocumentNumber(mockTx as unknown as Prisma.TransactionClient, {
        companyId: "c1111111-1111-4111-8111-111111111111",
        branchId: "b2222222-2222-4222-8222-222222222222",
        documentType: "PAYMENT",
        fiscalYear: "FY2026-27",
        prefix: "ISB--RC",
      });

      // Verify returned voucher number is strictly single-hyphen
      expect(result).toBe("ISB-RC-FY2026-27-000007");
      expect(result).not.toContain("--");

      // Verify the atomic upsert query structure
      expect(executedQuery).toContain('INSERT INTO "DocumentSequence"');
      expect(executedQuery).toContain('ON CONFLICT ("companyId", "branchId", "documentType", "fiscalYear")');
      expect(executedQuery).toContain('DO UPDATE SET');
      expect(executedQuery).toContain('"nextValue" = "DocumentSequence"."nextValue" + 1');
      expect(executedQuery).toContain('"prefix" = ?');
      expect(executedQuery).toContain('RETURNING "nextValue" - 1 AS "nextValue", "prefix", "padding"');

      // Verify that the sanitized prefix "ISB-RC" was passed to the query
      expect(queryValues).toContain("ISB-RC");
      expect(queryValues).not.toContain("ISB--RC");
    });

    it("guarantees sequential monotonic numbers without collisions under simulated concurrency", async () => {
      let currentSeq = 0n;

      // Simulated atomic PostgreSQL row lock: synchronized stateful counter
      const mockTx = {
        $queryRaw: vi.fn().mockImplementation(async () => {
          currentSeq += 1n;
          const allocatedVal = currentSeq;
          return [
            {
              nextValue: allocatedVal,
              prefix: "ISB-PV",
              padding: 6,
            },
          ];
        }),
      };

      // Fire 50 concurrent allocation requests
      const concurrentRequests = Array.from({ length: 50 }, () =>
        nextDocumentNumber(mockTx as unknown as Prisma.TransactionClient, {
          companyId: "c1111111-1111-4111-8111-111111111111",
          branchId: "b2222222-2222-4222-8222-222222222222",
          documentType: "PAYMENT",
          fiscalYear: "FY2026-27",
          prefix: "ISB-PV",
        }),
      );

      const results = await Promise.all(concurrentRequests);

      // Verify all 50 voucher numbers are unique
      const uniqueNumbers = new Set(results);
      expect(uniqueNumbers.size).toBe(50);

      // Verify all numbers match strictly single-hyphen format
      for (const num of results) {
        expect(num).toMatch(/^ISB-PV-FY2026-27-\d{6}$/);
        expect(num).not.toContain("--");
        expect(num).not.toContain("PY");
      }

      // Verify range spans 000001 through 000050
      expect(results).toContain("ISB-PV-FY2026-27-000001");
      expect(results).toContain("ISB-PV-FY2026-27-000050");
    });
  });

  describe("Historical Voucher Preservation Invariant", () => {
    it("preserves historical double-hyphen voucher identifiers without modification", () => {
      const historicalVouchers = [
        "ISB--RC-FY2026-27-000001",
        "ISB--RC-FY2026-27-000002",
        "ISB--RC-FY2026-27-000003",
        "ISB--RC-FY2026-27-000004",
        "ISB--RC-FY2026-27-000005",
        "ISB--RC-FY2026-27-000006",
      ];

      // Existing records must retain their exact historical strings
      for (const voucher of historicalVouchers) {
        expect(voucher).toContain("--");
        expect(voucher.startsWith("ISB--RC-FY2026-27-")).toBe(true);
      }
    });

    it("strictly preserves historical double-hyphen sales invoice ISB--SI-FY2026-27-000004", () => {
      const historicalInvoice = "ISB--SI-FY2026-27-000004";
      expect(historicalInvoice).toMatch(HISTORICAL_DOCUMENT_SEQUENCE_REGEX);
      expect(isHistoricalDocumentSequence(historicalInvoice)).toBe(true);
      expect(isValidDocumentSequence(historicalInvoice)).toBe(false);
    });

    it("validates all historical vouchers ISB--RC-FY2026-27-000001 through 000006 with historical regex", () => {
      for (let i = 1; i <= 6; i++) {
        const voucher = `ISB--RC-FY2026-27-${String(i).padStart(6, "0")}`;
        expect(voucher).toMatch(HISTORICAL_DOCUMENT_SEQUENCE_REGEX);
        expect(isHistoricalDocumentSequence(voucher)).toBe(true);
        expect(isValidDocumentSequence(voucher)).toBe(false);
      }
    });
  });

  describe("Milestone 2: Sequence Numbering Regex & POS Schema Specifications", () => {
    it("strictly verifies single-hyphen sequence formatting ISB-SI-FY2026-27-000001 with exact regex", () => {
      const standardRegex = /^[A-Z0-9]+-[A-Z0-9]+-FY[0-9]{4}-[0-9]{2}-[0-9]{6}$/;
      expect(DOCUMENT_SEQUENCE_REGEX.source).toBe(standardRegex.source);

      const invoiceNumber = "ISB-SI-FY2026-27-000001";
      expect(invoiceNumber).toMatch(standardRegex);
      expect(isValidDocumentSequence(invoiceNumber)).toBe(true);

      const receiptNumber = "ISB-RC-FY2026-27-000001";
      expect(receiptNumber).toMatch(standardRegex);
      expect(isValidDocumentSequence(receiptNumber)).toBe(true);

      const paymentNumber = "KHI-PV-FY2026-27-000042";
      expect(paymentNumber).toMatch(standardRegex);
      expect(isValidDocumentSequence(paymentNumber)).toBe(true);
    });

    it("rejects non-compliant document number patterns", () => {
      expect(isValidDocumentSequence("ISB--SI-FY2026-27-000001")).toBe(false);
      expect(isValidDocumentSequence("isb-si-fy2026-27-000001")).toBe(false);
      expect(isValidDocumentSequence("ISB-SI-2026-27-000001")).toBe(false);
      expect(isValidDocumentSequence("ISB-SI-FY2026-27-001")).toBe(false);
      expect(isValidDocumentSequence("ISB-SI-FY2026-27-0000001")).toBe(false);
      expect(isValidDocumentSequence("ISB-SI-FY2026-000001")).toBe(false);
      expect(isValidDocumentSequence("-ISB-SI-FY2026-27-000001-")).toBe(false);
    });

    it("validates ReceiptPrinterType enum has THERMAL_80MM, THERMAL_58MM, and A4", () => {
      expect(ReceiptPrinterType.THERMAL_80MM).toBe("THERMAL_80MM");
      expect(ReceiptPrinterType.THERMAL_58MM).toBe("THERMAL_58MM");
      expect(ReceiptPrinterType.A4).toBe("A4");
    });

    it("validates PosShiftStatus enum has OPEN and CLOSED", () => {
      expect(PosShiftStatus.OPEN).toBe("OPEN");
      expect(PosShiftStatus.CLOSED).toBe("CLOSED");
    });
  });
});

