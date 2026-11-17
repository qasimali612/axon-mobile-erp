import { NextResponse } from "next/server";
import { z } from "zod";
import { JournalStatus, JournalType, Prisma } from "@prisma/client";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { permittedBranchIds, requirePermission } from "@/lib/auth";
import { createJournalDraft, postJournal } from "@/lib/finance/posting";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/serializers";

const transferInputSchema = z.object({
  type: z.enum(["CASH_DEPOSIT", "CASH_WITHDRAWAL", "BANK_TRANSFER"]),
  branchId: z.string().uuid(),
  transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceBankAccountId: z.string().uuid().optional().nullable(),
  sourceCashAccountId: z.string().uuid().optional().nullable(),
  destinationBankAccountId: z.string().uuid().optional().nullable(),
  destinationCashAccountId: z.string().uuid().optional().nullable(),
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
  reference: z.string().trim().max(120).optional().nullable(),
  narration: z.string().trim().min(5).max(500),
  idempotencyKey: z.string().trim().min(8).max(120).optional().nullable(),
  allowNegativeBalance: z.boolean().optional().default(false),
});

export async function GET(request: Request) {
  try {
    const context = await requirePermission("BANK_LEDGER_VIEW");
    const companyId = context.company.id;
    const allowedBranches = permittedBranchIds(context, "BANK_LEDGER_VIEW");

    const [bankAccounts, cashAccounts, branches, recentTransfers] = await Promise.all([
      prisma.bankAccount.findMany({
        where: {
          companyId,
          isActive: true,
          ...(allowedBranches ? { branchId: { in: allowedBranches } } : {}),
        },
        include: {
          branch: { select: { id: true, code: true, name: true } },
          glAccount: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ branch: { code: "asc" } }, { code: "asc" }],
      }),
      prisma.account.findMany({
        where: {
          companyId,
          isActive: true,
          OR: [
            { accountType: "CASH" },
            { code: "1000" },
            { name: { contains: "Cash", mode: "insensitive" } },
          ],
        },
        select: { id: true, code: true, name: true, accountType: true },
        orderBy: { code: "asc" },
      }),
      prisma.branch.findMany({
        where: {
          companyId,
          isActive: true,
          ...(allowedBranches ? { id: { in: allowedBranches } } : {}),
        },
        select: { id: true, code: true, name: true },
        orderBy: { code: "asc" },
      }),
      prisma.journalEntry.findMany({
        where: {
          companyId,
          sourceModule: { in: ["BANK_TRANSFER", "CASH_DEPOSIT", "CASH_WITHDRAWAL"] },
          ...(allowedBranches ? { branchId: { in: allowedBranches } } : {}),
        },
        include: {
          branch: { select: { code: true, name: true } },
          preparedBy: { select: { fullName: true } },
          lines: {
            include: {
              account: { select: { code: true, name: true } },
              bankAccount: { select: { code: true, bankName: true } },
            },
          },
        },
        orderBy: [{ postingDate: "desc" }, { createdAt: "desc" }],
        take: 100,
      }),
    ]);

    const cashAccountIds = cashAccounts.map((c) => c.id);
    const cashLines = cashAccountIds.length
      ? await prisma.journalEntryLine.groupBy({
          by: ["accountId"],
          where: {
            accountId: { in: cashAccountIds },
            entry: { companyId, status: { in: ["POSTED", "REVERSED"] } },
          },
          _sum: { debit: true, credit: true },
        })
      : [];

    const cashAccountsWithBalances = cashAccounts.map((c) => {
      const agg = cashLines.find((l: { accountId: string }) => l.accountId === c.id);
      const balance = Number(agg?._sum?.debit || 0) - Number(agg?._sum?.credit || 0);
      return { ...c, balance };
    });

    return NextResponse.json(
      jsonSafe({
        data: {
          bankAccounts,
          cashAccounts: cashAccountsWithBalances,
          branches,
          recentTransfers,
        },
      })
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requirePermission("JOURNAL_CREATE");
    const body = transferInputSchema.parse(await request.json());
    const companyId = context.company.id;

    const amountNum = parseFloat(body.amount);
    if (!(amountNum > 0)) {
      throw new ApiError(400, "INVALID_AMOUNT", "Transfer amount must be greater than zero.");
    }

    let debitAccountId = "";
    let debitBankAccountId: string | null = null;
    let debitDescription = "";

    let creditAccountId = "";
    let creditBankAccountId: string | null = null;
    let creditDescription = "";

    if (body.type === "CASH_DEPOSIT") {
      // Cash -> Bank
      if (!body.destinationBankAccountId) {
        throw new ApiError(400, "DESTINATION_REQUIRED", "Destination bank account is required.");
      }
      const destBank = await prisma.bankAccount.findFirst({
        where: { id: body.destinationBankAccountId, companyId, isActive: true },
      });
      if (!destBank) {
        throw new ApiError(404, "DESTINATION_NOT_FOUND", "Destination bank account not found.");
      }

      const cashAccountId =
        body.sourceCashAccountId ||
        (await prisma.account.findFirst({
          where: { companyId, OR: [{ accountType: "CASH" }, { code: "1000" }] },
          select: { id: true },
        }))?.id;

      if (!cashAccountId) {
        throw new ApiError(400, "CASH_ACCOUNT_REQUIRED", "Source cash account could not be found.");
      }

      // Check available cash on hand balance
      const cashAgg = await prisma.journalEntryLine.aggregate({
        where: { accountId: cashAccountId, entry: { companyId, status: { in: ["POSTED", "REVERSED"] } } },
        _sum: { baseDebit: true, baseCredit: true },
      });
      const cashBalance = Number(cashAgg._sum.baseDebit || 0) - Number(cashAgg._sum.baseCredit || 0);
      if (!body.allowNegativeBalance && amountNum > cashBalance && !context.permissions.includes("FINANCE_OVERRIDE")) {
        throw new ApiError(
          422,
          "INSUFFICIENT_CASH",
          `Insufficient cash on hand. Available: Rs. ${cashBalance.toLocaleString()}, Requested: Rs. ${amountNum.toLocaleString()}. Authorization required to allow negative cash balance.`
        );
      }

      debitAccountId = destBank.glAccountId;
      debitBankAccountId = destBank.id;
      debitDescription = `Cash deposit into ${destBank.bankName} (${destBank.code})`;

      creditAccountId = cashAccountId;
      creditBankAccountId = null;
      creditDescription = `Cash deposited to ${destBank.bankName}`;
    } else if (body.type === "CASH_WITHDRAWAL") {
      // Bank -> Cash
      if (!body.sourceBankAccountId) {
        throw new ApiError(400, "SOURCE_REQUIRED", "Source bank account is required.");
      }
      const sourceBank = await prisma.bankAccount.findFirst({
        where: { id: body.sourceBankAccountId, companyId, isActive: true },
      });
      if (!sourceBank) {
        throw new ApiError(404, "SOURCE_NOT_FOUND", "Source bank account not found.");
      }

      // Check available bank account balance
      const bankAgg = await prisma.bankTransaction.aggregate({
        where: { bankAccountId: sourceBank.id, journalEntry: { status: { in: ["POSTED", "REVERSED"] } } },
        _sum: { deposit: true, withdrawal: true },
      });
      const bankBalance =
        Number(sourceBank.openingBalance || 0) +
        Number(bankAgg._sum.deposit || 0) -
        Number(bankAgg._sum.withdrawal || 0);
      if (!body.allowNegativeBalance && amountNum > bankBalance && !context.permissions.includes("FINANCE_OVERRIDE")) {
        throw new ApiError(
          422,
          "INSUFFICIENT_BANK_FUNDS",
          `Insufficient funds in ${sourceBank.bankName}. Available: Rs. ${bankBalance.toLocaleString()}, Requested: Rs. ${amountNum.toLocaleString()}. Authorization required to allow overdraft.`
        );
      }

      const cashAccountId =
        body.destinationCashAccountId ||
        (await prisma.account.findFirst({
          where: { companyId, OR: [{ accountType: "CASH" }, { code: "1000" }] },
          select: { id: true },
        }))?.id;

      if (!cashAccountId) {
        throw new ApiError(400, "CASH_ACCOUNT_REQUIRED", "Destination cash account could not be found.");
      }

      debitAccountId = cashAccountId;
      debitBankAccountId = null;
      debitDescription = `Cash drawn from ${sourceBank.bankName} (${sourceBank.code})`;

      creditAccountId = sourceBank.glAccountId;
      creditBankAccountId = sourceBank.id;
      creditDescription = `Cash withdrawal from ${sourceBank.bankName}`;
    } else {
      // BANK_TRANSFER: Bank -> Bank
      if (!body.sourceBankAccountId || !body.destinationBankAccountId) {
        throw new ApiError(400, "BANK_ACCOUNTS_REQUIRED", "Source and destination bank accounts are required.");
      }
      if (body.sourceBankAccountId === body.destinationBankAccountId) {
        throw new ApiError(400, "SAME_ACCOUNT", "Source and destination bank accounts cannot be the same.");
      }

      const [sourceBank, destBank] = await Promise.all([
        prisma.bankAccount.findFirst({
          where: { id: body.sourceBankAccountId, companyId, isActive: true },
        }),
        prisma.bankAccount.findFirst({
          where: { id: body.destinationBankAccountId, companyId, isActive: true },
        }),
      ]);

      if (!sourceBank || !destBank) {
        throw new ApiError(404, "BANK_NOT_FOUND", "One or both bank accounts were not found.");
      }

      // Check available bank account balance for transfer out
      const sourceBankAgg = await prisma.bankTransaction.aggregate({
        where: { bankAccountId: sourceBank.id, journalEntry: { status: { in: ["POSTED", "REVERSED"] } } },
        _sum: { deposit: true, withdrawal: true },
      });
      const sourceBankBalance =
        Number(sourceBank.openingBalance || 0) +
        Number(sourceBankAgg._sum.deposit || 0) -
        Number(sourceBankAgg._sum.withdrawal || 0);
      if (!body.allowNegativeBalance && amountNum > sourceBankBalance && !context.permissions.includes("FINANCE_OVERRIDE")) {
        throw new ApiError(
          422,
          "INSUFFICIENT_BANK_FUNDS",
          `Insufficient funds in ${sourceBank.bankName}. Available: Rs. ${sourceBankBalance.toLocaleString()}, Requested: Rs. ${amountNum.toLocaleString()}. Authorization required to allow overdraft.`
        );
      }

      debitAccountId = destBank.glAccountId;
      debitBankAccountId = destBank.id;
      debitDescription = `Transfer received from ${sourceBank.bankName} (${sourceBank.code})`;

      creditAccountId = sourceBank.glAccountId;
      creditBankAccountId = sourceBank.id;
      creditDescription = `Transfer sent to ${destBank.bankName} (${destBank.code})`;
    }

    const actor = {
      companyId,
      userId: context.user.id,
      currencyCode: context.company.currencyCode,
      permissions: context.permissions,
    };

    const draft = await createJournalDraft(actor, {
      branchId: body.branchId,
      postingDate: body.transferDate,
      voucherDate: body.transferDate,
      voucherType: JournalType.GENERAL,
      sourceModule: body.type,
      referenceDocument: body.reference || null,
      narration: body.narration,
      idempotencyKey: body.idempotencyKey || crypto.randomUUID(),
      lines: [
        {
          accountId: debitAccountId,
          description: debitDescription,
          debit: body.amount,
          credit: "0",
          bankAccountId: debitBankAccountId,
        },
        {
          accountId: creditAccountId,
          description: creditDescription,
          debit: "0",
          credit: body.amount,
          bankAccountId: creditBankAccountId,
        },
      ],
    });

    // Post the contra transfer voucher directly to the General Ledger
    const posted = await postJournal(actor, draft.id);
    return NextResponse.json(jsonSafe({ data: posted, status: "POSTED" }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

