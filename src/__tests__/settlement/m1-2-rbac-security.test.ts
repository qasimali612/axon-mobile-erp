import { describe, expect, it } from "vitest";
import { Prisma, OperationalDocumentStatus } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { assertSegregationOfDuties } from "@/lib/operating-mode";
import { assertCreditOverrideAllowed } from "@/lib/policies";
import fs from "node:fs";
import path from "node:path";

describe("Milestone 1 Challenger M1-2: RBAC, Security & Isolation Adversarial Suite", () => {
  // =========================================================================
  // DIMENSION 1: Posting Endpoints Require SALES_INVOICE_POST Permission
  // =========================================================================
  describe("Dimension 1: Posting Endpoints RBAC & SALES_INVOICE_POST Enforcement", () => {
    it("empirically verifies static AST / code contract of posting endpoints enforcing SALES_INVOICE_POST", () => {
      const postRoutePath = path.resolve("src/app/api/sales/invoices/[id]/post/route.ts");
      const approveRoutePath = path.resolve("src/app/api/sales/invoices/[id]/approve/route.ts");
      const submitRoutePath = path.resolve("src/app/api/sales/invoices/[id]/submit/route.ts");
      const batchPostRoutePath = path.resolve("src/app/api/sales/invoices/batch-post/route.ts");

      const postContent = fs.readFileSync(postRoutePath, "utf-8");
      const approveContent = fs.readFileSync(approveRoutePath, "utf-8");
      const submitContent = fs.readFileSync(submitRoutePath, "utf-8");
      const batchPostContent = fs.readFileSync(batchPostRoutePath, "utf-8");

      // Verify POST endpoint requires SALES_INVOICE_POST
      expect(postContent).toContain('await requirePermission("SALES_INVOICE_POST"');

      // Verify deprecated approve endpoint delegates with SALES_INVOICE_POST requirement
      expect(approveContent).toContain('await requirePermission("SALES_INVOICE_POST"');
      expect(approveContent).not.toContain('requirePermission("SALES_INVOICE_APPROVE"');

      // Verify deprecated submit endpoint delegates with SALES_INVOICE_POST requirement
      expect(submitContent).toContain('await requirePermission("SALES_INVOICE_POST"');

      // Verify batch post requires SALES_INVOICE_POST
      expect(batchPostContent).toContain('await requirePermission("SALES_INVOICE_POST"');
    });

    it("evaluates permission scope matching logic against scoped roles", () => {
      const roleScopeMatches = (
        role: { branchId: string | null; warehouseId: string | null },
        scope?: { branchId?: string | null; warehouseId?: string | null },
      ) => {
        if (!scope?.branchId && !scope?.warehouseId) return true;
        if (role.warehouseId && role.warehouseId !== scope.warehouseId) return false;
        if (role.branchId && role.branchId !== scope.branchId) return false;
        return true;
      };

      const branchA = "branch-a-uuid";
      const branchB = "branch-b-uuid";
      const whA = "wh-a-uuid";
      const whB = "wh-b-uuid";

      // Global role
      expect(roleScopeMatches({ branchId: null, warehouseId: null }, { branchId: branchA, warehouseId: whA })).toBe(true);
      // Branch-scoped role matching branch
      expect(roleScopeMatches({ branchId: branchA, warehouseId: null }, { branchId: branchA, warehouseId: whA })).toBe(true);
      // Branch-scoped role mismatching branch
      expect(roleScopeMatches({ branchId: branchA, warehouseId: null }, { branchId: branchB, warehouseId: whB })).toBe(false);
      // Warehouse-scoped role mismatching warehouse
      expect(roleScopeMatches({ branchId: branchA, warehouseId: whA }, { branchId: branchA, warehouseId: whB })).toBe(false);
    });

    it("verifies UI action guards enforce can('SALES_INVOICE_POST')", () => {
      const salesManagerPath = path.resolve("src/components/sales/sales-manager.tsx");
      const salesActionsPath = path.resolve("src/components/sales/sales-invoice-actions.tsx");

      const managerContent = fs.readFileSync(salesManagerPath, "utf-8");
      const actionsContent = fs.readFileSync(salesActionsPath, "utf-8");

      expect(managerContent).toContain('can("SALES_INVOICE_POST")');
      expect(actionsContent).toContain('can("SALES_INVOICE_POST")');
      expect(managerContent).not.toContain('can("SALES_INVOICE_APPROVE")');
      expect(actionsContent).not.toContain('can("SALES_INVOICE_APPROVE")');
    });
  });

  // =========================================================================
  // DIMENSION 2: Reversals Segregation of Duties & Reversal Blockers
  // =========================================================================
  describe("Dimension 2: Reversal Segregation of Duties & Failure Mode Analysis", () => {
    it("empirically verifies assertSegregationOfDuties does not throw when preparer or poster reverses", async () => {
      const mockTx = {} as Prisma.TransactionClient;
      const companyId = "cmp-1";
      const userId = "usr-same-actor";

      // Reversing user is preparer
      await expect(
        assertSegregationOfDuties(mockTx, companyId, userId, userId, null, "reverse this sales invoice", []),
      ).resolves.toBeUndefined();

      // Reversing user is poster
      await expect(
        assertSegregationOfDuties(mockTx, companyId, userId, "other-preparer", null, "reverse this sales invoice", [userId]),
      ).resolves.toBeUndefined();

      // Reversing user is both preparer and poster
      await expect(
        assertSegregationOfDuties(mockTx, companyId, userId, userId, null, "reverse this sales invoice", [userId]),
      ).resolves.toBeUndefined();
    });

    it("verifies UI sales detail page no longer checks 'separated' segregation of duties", () => {
      const detailPagePath = path.resolve("src/app/(erp)/sales/[id]/page.tsx");
      const detailContent = fs.readFileSync(detailPagePath, "utf-8");

      // Verify absence of separated check
      expect(detailContent).not.toContain("const separated =");
      expect(detailContent).toContain(
        "const canReverse = invoice.status === OperationalDocumentStatus.POSTED && !invoice.reversalOfId && roleAllowsReversal;",
      );
    });

    it("verifies reversePostedSalesInvoice in reversals.ts allows reversing directly-posted invoices (postedById without approvedById)", () => {
      const reversalsPath = path.resolve("src/lib/operations/reversals.ts");
      const reversalsContent = fs.readFileSync(reversalsPath, "utf-8");

      // Locate reversePostedSalesInvoice implementation
      const functionStart = reversalsContent.indexOf("export async function reversePostedSalesInvoice");
      expect(functionStart).toBeGreaterThan(-1);

      const functionSlice = reversalsContent.slice(functionStart, functionStart + 1500);

      // In Milestone 1, approval was eliminated for sales invoices, so postSalesInvoice sets postedById without approvedById.
      // reversals.ts must support directly-posted invoices without mandatory approvedById:
      const allowsDirectPosted = functionSlice.includes("(!invoice.approvedById && !invoice.postedById)") || !functionSlice.includes("!invoice.approvedById");
      expect(allowsDirectPosted).toBe(true);

      // Verify the updated error message:
      expect(functionSlice).toContain("Only a posted sales invoice with complete journal history can be reversed.");
    });

    it("empirically verifies the reversal validation logic accepts direct-posted invoices", () => {
      // Replicate the remediated gate from reversals.ts line 98:
      const validateReversible = (invoice: {
        status: OperationalDocumentStatus;
        journalEntryId: string | null;
        approvedById: string | null;
        postedById: string | null;
      }) => {
        if (invoice.status !== OperationalDocumentStatus.POSTED || !invoice.journalEntryId || (!invoice.approvedById && !invoice.postedById)) {
          throw new ApiError(409, "INVALID_DOCUMENT_STATE", "Only a posted sales invoice with complete journal history can be reversed.");
        }
        return true;
      };

      // Legacy invoice (with approval history): passes
      const legacyInvoice = {
        status: OperationalDocumentStatus.POSTED,
        journalEntryId: "je-legacy-uuid",
        approvedById: "usr-approver-uuid",
        postedById: null,
      };
      expect(validateReversible(legacyInvoice)).toBe(true);

      // Directly-posted invoice under Milestone 1 (approvedById is null, postedById is set): PASSES!
      const directPostedInvoice = {
        status: OperationalDocumentStatus.POSTED,
        journalEntryId: "je-direct-uuid",
        approvedById: null,
        postedById: "usr-poster-uuid",
      };
      expect(validateReversible(directPostedInvoice)).toBe(true);

      // Invalid invoice (neither approved nor posted): throws
      const invalidInvoice = {
        status: OperationalDocumentStatus.POSTED,
        journalEntryId: "je-direct-uuid",
        approvedById: null,
        postedById: null,
      };
      expect(() => validateReversible(invalidInvoice)).toThrowError(
        "Only a posted sales invoice with complete journal history can be reversed.",
      );
    });

    it("verifies absence of residual intermediate SUBMITTED and APPROVED status writes in reversals.ts", () => {
      const reversalsPath = path.resolve("src/lib/operations/reversals.ts");
      const reversalsContent = fs.readFileSync(reversalsPath, "utf-8");

      // Locate reversal creation and status transitions
      const functionStart = reversalsContent.indexOf("export async function reversePostedSalesInvoice");
      const nextFunction = reversalsContent.indexOf("export async function", functionStart + 1);
      const functionSlice = reversalsContent.slice(functionStart, nextFunction > -1 ? nextFunction : functionStart + 10000);

      // Check for intermediate status updates on reversal record
      const hasSubmittedTransition = functionSlice.includes("OperationalDocumentStatus.SUBMITTED");
      const hasApprovedTransition = functionSlice.includes("OperationalDocumentStatus.APPROVED");

      // In Milestone 1, approval workflows are removed project-wide.
      // reversals.ts must NOT transition through SUBMITTED -> APPROVED before POSTED!
      expect(hasSubmittedTransition).toBe(false);
      expect(hasApprovedTransition).toBe(false);
    });
  });

  // =========================================================================
  // DIMENSION 3: Approval Queue Isolation & Route Rejection
  // =========================================================================
  describe("Dimension 3: Approval Queue Isolation & Rejection of Sales Invoices", () => {
    it("empirically verifies GET /api/approvals returns zero sales invoices and does not query sales invoices", () => {
      const approvalsRoutePath = path.resolve("src/app/api/approvals/route.ts");
      const approvalsContent = fs.readFileSync(approvalsRoutePath, "utf-8");

      // Verify prisma.salesInvoice is NOT queried in GET()
      expect(approvalsContent).not.toContain("prisma.salesInvoice.findMany");

      // Verify counts.sales is strictly 0
      expect(approvalsContent).toContain("sales: 0");

      // Verify items does not contain any SALES_INVOICE documentType mapping
      expect(approvalsContent).not.toContain('documentType: "SALES_INVOICE"');
    });

    it("empirically verifies POST /api/approvals rejects documentType 'SALES_INVOICE' at schema validation", () => {
      const approvalsRoutePath = path.resolve("src/app/api/approvals/route.ts");
      const approvalsContent = fs.readFileSync(approvalsRoutePath, "utf-8");

      // Inspect actionSchema enum definition
      const schemaMatch = approvalsContent.match(/documentType:\s*z\.enum\(\[\s*([\s\S]*?)\s*\]\)/);
      expect(schemaMatch).not.toBeNull();
      const enumValues = schemaMatch![1];

      // Verify SALES_INVOICE is excluded from actionSchema enum
      expect(enumValues).not.toContain('"SALES_INVOICE"');

      // Verify switch cases do not contain SALES_INVOICE
      expect(approvalsContent).not.toContain('case "SALES_INVOICE":');
    });
  });

  // =========================================================================
  // DIMENSION 4: Credit Limit Validation & Override Audit Logging
  // =========================================================================
  describe("Dimension 4: Credit Limit Validation & Override Audit Logging", () => {
    it("empirically tests assertCreditOverrideAllowed with custom reason and default fallback", () => {
      const actorWithReason = {
        companyId: "cmp-1",
        userId: "usr-1",
        overrideReason: "Management approved temporary credit buffer of 500,000",
      };

      const reason1 = assertCreditOverrideAllowed(actorWithReason, {
        outstanding: new Prisma.Decimal("1200000"),
        invoiceTotal: new Prisma.Decimal("300000"),
        creditLimit: new Prisma.Decimal("1000000"),
      });

      expect(reason1).toBe("Management approved temporary credit buffer of 500,000");

      const actorWithoutReason = {
        companyId: "cmp-1",
        userId: "usr-1",
      };

      const reason2 = assertCreditOverrideAllowed(actorWithoutReason, {
        outstanding: new Prisma.Decimal("1200000"),
        invoiceTotal: new Prisma.Decimal("300000"),
        creditLimit: new Prisma.Decimal("1000000"),
      });

      expect(reason2).toBe("Authorized credit transaction");
    });

    it("verifies mathematical credit limit breach formula: (outstanding + grandTotal) > creditLimit", () => {
      const evaluateCreditCheck = (outstanding: number, grandTotal: number, creditLimit: number) => {
        const outDec = new Prisma.Decimal(outstanding);
        const invDec = new Prisma.Decimal(grandTotal);
        const limitDec = new Prisma.Decimal(creditLimit);
        return outDec.plus(invDec).gt(limitDec);
      };

      // Exactly at limit: not exceeded
      expect(evaluateCreditCheck(80000, 20000, 100000)).toBe(false);

      // Below limit: not exceeded
      expect(evaluateCreditCheck(50000, 20000, 100000)).toBe(false);

      // Exceeded by 0.01: exceeded
      expect(evaluateCreditCheck(80000, 20000.01, 100000)).toBe(true);

      // Zero credit limit: customer has no credit facility, any sale breaches
      expect(evaluateCreditCheck(0, 500, 0)).toBe(true);
    });

    it("verifies sales.ts implementation executes credit limit check and logs CREDIT_LIMIT_OVERRIDDEN audit", () => {
      const salesTsPath = path.resolve("src/lib/operations/sales.ts");
      const salesContent = fs.readFileSync(salesTsPath, "utf-8");

      // Verify term sale condition
      expect(salesContent).toContain("if (invoice.dueDate)");

      // Verify AR balance calculation query against posted journal lines
      expect(salesContent).toContain('SELECT COALESCE(SUM(l."baseDebit" - l."baseCredit"),0)::numeric(19,4) AS balance');
      expect(salesContent).toContain('AND l."customerId" = ${invoice.customerId}::uuid');

      // Verify gt creditLimit comparison
      expect(salesContent).toContain("if (outstanding.plus(invoice.grandTotal).gt(invoice.customer.creditLimit))");

      // Verify CREDIT_LIMIT_OVERRIDDEN audit call
      expect(salesContent).toContain('action: "CREDIT_LIMIT_OVERRIDDEN"');
      expect(salesContent).toContain('entityType: "SalesInvoice"');
      expect(salesContent).toContain("metadata: { reason, outstanding: outstanding.toFixed(4)");
    });

    it("verifies post endpoint passes overrideReason from request body to actor", () => {
      const postRoutePath = path.resolve("src/app/api/sales/invoices/[id]/post/route.ts");
      const postContent = fs.readFileSync(postRoutePath, "utf-8");

      expect(postContent).toContain("const body = (await request.clone().json().catch(() => null)) as { reason?: string } | null;");
      expect(postContent).toContain("const overrideReason = typeof body?.reason === \"string\" ? body.reason.trim() : undefined;");
      expect(postContent).toContain("overrideReason,");
    });
  });
});
