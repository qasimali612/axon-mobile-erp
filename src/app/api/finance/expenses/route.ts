import { NextResponse } from "next/server";
import { z } from "zod";
import { AccountClass, JournalStatus, JournalType, Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createJournalDraft, submitJournal } from "@/lib/finance/posting";

const expenseInputSchema = z.object({
  branchId: z.string().uuid("Branch is required"),
  postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Posting date must be YYYY-MM-DD"),
  expenseAccountId: z.string().uuid("Expense account is required"),
  settlementAccountId: z.string().uuid("Payment settlement account is required"),
  amount: z.string().min(1, "Amount is required"),
  taxAmount: z.string().optional().default("0"),
  taxAccountId: z.string().uuid().optional().nullable(),
  payee: z.string().max(200).optional().default(""),
  referenceDocument: z.string().max(100).optional().default(""),
  category: z.string().max(100).optional().default("General"),
  narration: z.string().min(3, "Narration must be at least 3 characters").max(500),
  submitNow: z.boolean().optional().default(false),
});

export async function GET(request: Request) {
  try {
    const context = await requireAuth();
    if (
      !context.permissions.includes("expense.manage") &&
      !context.permissions.includes("GL_VIEW") &&
      !context.permissions.includes("FINANCE_DASHBOARD_VIEW")
    ) {
      throw new ApiError(403, "FORBIDDEN", "Permission to view expenses is not granted.");
    }

    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId") || undefined;
    const status = searchParams.get("status") as JournalStatus | undefined;

    const companyId = context.company.id;

    // Fetch expense vouchers
    const [expenses, expenseAccounts, cashAccounts, bankAccounts, branches] = await Promise.all([
      prisma.journalEntry.findMany({
        where: {
          companyId,
          ...(branchId ? { branchId } : {}),
          ...(status ? { status } : {}),
          OR: [
            { sourceModule: "EXPENSE" },
            {
              lines: {
                some: {
                  account: {
                    accountClass: AccountClass.EXPENSE,
                  },
                },
              },
            },
          ],
        },
        include: {
          branch: { select: { id: true, code: true, name: true } },
          preparedBy: { select: { id: true, fullName: true, email: true } },
          approvedBy: { select: { id: true, fullName: true, email: true } },
          postedBy: { select: { id: true, fullName: true, email: true } },
          lines: {
            include: {
              account: { select: { id: true, code: true, name: true, accountClass: true, accountType: true } },
            },
            orderBy: { lineNumber: "asc" },
          },
        },
        orderBy: { postingDate: "desc" },
        take: 100,
      }),

      // Available active expense accounts
      prisma.account.findMany({
        where: {
          companyId,
          accountClass: AccountClass.EXPENSE,
          isActive: true,
        },
        select: { id: true, code: true, name: true, accountType: true },
        orderBy: { code: "asc" },
      }),

      // Available active cash accounts
      prisma.account.findMany({
        where: {
          companyId,
          accountType: "CASH",
          isActive: true,
        },
        select: { id: true, code: true, name: true, branchId: true },
        orderBy: { code: "asc" },
      }),

      // Available active bank accounts
      prisma.bankAccount.findMany({
        where: {
          companyId,
          isActive: true,
        },
        select: { id: true, accountTitle: true, bankName: true, glAccountId: true, branchId: true },
        orderBy: { bankName: "asc" },
      }),

      // Branches
      prisma.branch.findMany({
        where: { companyId, isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { code: "asc" },
      }),
    ]);

    // Compute KPI summaries
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const postedExpensesThisMonth = expenses
      .filter((e) => e.status === "POSTED" && e.postingDate >= monthStart)
      .reduce((sum, e) => {
        const expLine = e.lines.find((l) => l.account.accountClass === AccountClass.EXPENSE && Number(l.baseDebit) > 0);
        return sum + (expLine ? Number(expLine.baseDebit) : 0);
      }, 0);

    const pendingApprovalCount = expenses.filter((e) => e.status === "SUBMITTED").length;
    const draftsCount = expenses.filter((e) => e.status === "DRAFT").length;

    return NextResponse.json({
      data: {
        expenses,
        kpis: {
          totalCount: expenses.length,
          postedExpensesThisMonth,
          pendingApprovalCount,
          draftsCount,
        },
        masters: {
          expenseAccounts,
          cashAccounts,
          bankAccounts,
          branches,
        },
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requireAuth();
    if (!context.permissions.includes("expense.manage") && !context.permissions.includes("GL_CREATE")) {
      throw new ApiError(403, "FORBIDDEN", "Permission to record expenses is not granted.");
    }

    const json = await request.json();
    const parsed = expenseInputSchema.parse(json);

    const amountNum = parseFloat(parsed.amount);
    const taxNum = parseFloat(parsed.taxAmount || "0");
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new ApiError(422, "INVALID_AMOUNT", "Expense amount must be greater than zero.");
    }
    if (taxNum < 0 || taxNum >= amountNum) {
      throw new ApiError(422, "INVALID_TAX", "Tax amount cannot be negative or exceed the total amount.");
    }

    const netAmount = (amountNum - taxNum).toFixed(4);
    const totalAmount = amountNum.toFixed(4);

    // Build balanced lines
    const lines = [
      {
        accountId: parsed.expenseAccountId,
        description: `${parsed.payee ? parsed.payee + ": " : ""}${parsed.narration}`,
        debit: netAmount,
        credit: "0",
      },
    ];

    if (taxNum > 0 && parsed.taxAccountId) {
      lines.push({
        accountId: parsed.taxAccountId,
        description: `Input Tax on ${parsed.narration}`,
        debit: taxNum.toFixed(4),
        credit: "0",
      });
    }

    lines.push({
      accountId: parsed.settlementAccountId,
      description: `Settlement for ${parsed.narration}`,
      debit: "0",
      credit: totalAmount,
    });

    const actor = {
      companyId: context.company.id,
      userId: context.user.id,
      currencyCode: context.company.currencyCode,
      permissions: context.permissions,
    };

    const draft = await createJournalDraft(actor, {
      branchId: parsed.branchId,
      postingDate: parsed.postingDate,
      voucherType: JournalType.GENERAL,
      sourceModule: "EXPENSE",
      narration: `[${parsed.category}] ${parsed.payee ? parsed.payee + " - " : ""}${parsed.narration}`,
      referenceDocument: parsed.referenceDocument || null,
      lines,
    });

    let result: unknown = draft;
    if (parsed.submitNow) {
      result = await submitJournal(actor, draft.id);
    }

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
