import { AccountClass, JournalStatus, Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const zero = new Prisma.Decimal(0);

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
}

async function main() {
  const journals = await prisma.journalEntry.findMany({
    where: { status: { in: [JournalStatus.POSTED, JournalStatus.REVERSED] } },
    include: { lines: true, period: true },
  });
  invariant(journals.length > 0, "at least one posted finance fixture exists");
  for (const journal of journals) {
    const debit = journal.lines.reduce((sum, line) => sum.plus(line.baseDebit), zero);
    const credit = journal.lines.reduce((sum, line) => sum.plus(line.baseCredit), zero);
    invariant(journal.lines.length >= 2, `${journal.voucherNumber} has at least two lines`);
    invariant(debit.equals(credit) && debit.equals(journal.totalDebit) && credit.equals(journal.totalCredit), `${journal.voucherNumber} is exactly balanced`);
    invariant(journal.postingDate >= journal.period.startDate && journal.postingDate <= journal.period.endDate, `${journal.voucherNumber} posting date is inside its period`);
    invariant(Boolean(journal.approvedById && journal.postedById && journal.approvedAt && journal.postedAt), `${journal.voucherNumber} retains approval and posting custody`);
  }

  const grouped = await prisma.journalEntryLine.groupBy({
    by: ["accountId"],
    where: { entry: { status: { in: [JournalStatus.POSTED, JournalStatus.REVERSED] } } },
    _sum: { baseDebit: true, baseCredit: true },
  });
  const accounts = await prisma.account.findMany({ select: { id: true, accountClass: true } });
  const accountMap = new Map(accounts.map((account) => [account.id, account.accountClass]));
  const totals = grouped.reduce(
    (result, row) => {
      const accountClass = accountMap.get(row.accountId);
      if (!accountClass) return result;
      const signed = (row._sum.baseDebit || zero).minus(row._sum.baseCredit || zero);
      result[accountClass] = result[accountClass].plus(signed);
      return result;
    },
    {
      [AccountClass.ASSET]: zero,
      [AccountClass.LIABILITY]: zero,
      [AccountClass.EQUITY]: zero,
      [AccountClass.REVENUE]: zero,
      [AccountClass.COGS]: zero,
      [AccountClass.EXPENSE]: zero,
    },
  );
  const assets = totals.ASSET;
  const liabilities = totals.LIABILITY.negated();
  const equity = totals.EQUITY.negated();
  const earnings = totals.REVENUE.negated().minus(totals.COGS).minus(totals.EXPENSE);
  invariant(assets.equals(liabilities.plus(equity).plus(earnings)), "balance sheet equation has zero difference");

  const bankRows = await prisma.bankTransaction.findMany({ include: { journalLine: true, journalEntry: true } });
  invariant(bankRows.length > 0, "posted bank transaction fixture exists");
  for (const row of bankRows) {
    invariant(row.journalLine.entryId === row.journalEntryId, "bank transaction references its source journal line and header");
    invariant((row.deposit.gt(0) && row.withdrawal.isZero()) || (row.withdrawal.gt(0) && row.deposit.isZero()), "bank transaction is one-sided");
  }

  const rolePermissions = await prisma.role.findMany({
    where: { code: { in: ["ACCOUNTANT", "FINANCE_CONTROLLER", "GL_POSTING_OFFICER", "TREASURY_OFFICER"] } },
    select: { code: true, permissions: { select: { permission: { select: { key: true } } } } },
  });
  const grants = new Map(rolePermissions.map((role) => [role.code, new Set(role.permissions.map((item) => item.permission.key))]));
  invariant(grants.get("ACCOUNTANT")?.has("JOURNAL_CREATE") && !grants.get("ACCOUNTANT")?.has("JOURNAL_APPROVE") && !grants.get("ACCOUNTANT")?.has("JOURNAL_POST"), "accountant prepares but cannot approve or post journals");
  invariant(grants.get("FINANCE_CONTROLLER")?.has("JOURNAL_APPROVE") && !grants.get("FINANCE_CONTROLLER")?.has("JOURNAL_CREATE") && !grants.get("FINANCE_CONTROLLER")?.has("JOURNAL_POST"), "finance controller approves but cannot prepare or post journals");
  invariant(grants.get("GL_POSTING_OFFICER")?.has("JOURNAL_POST") && !grants.get("GL_POSTING_OFFICER")?.has("JOURNAL_CREATE") && !grants.get("GL_POSTING_OFFICER")?.has("JOURNAL_APPROVE"), "GL posting officer posts but cannot prepare or approve journals");

  const periods = await prisma.accountingPeriod.findMany({ orderBy: { startDate: "asc" } });
  for (let index = 1; index < periods.length; index += 1) {
    if (periods[index].fiscalYearId !== periods[index - 1].fiscalYearId) continue;
    invariant(periods[index - 1].endDate < periods[index].startDate, `${periods[index].name} does not overlap the prior period`);
  }

  console.log("Finance control verification passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
