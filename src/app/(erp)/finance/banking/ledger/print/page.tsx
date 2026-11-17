import { notFound } from "next/navigation";
import { ReportPrintHeader } from "@/components/print/report-print-header";
import { ReportPrintSignatures } from "@/components/print/report-print-signatures";
import { permittedBranchIds, requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (val: string | string[] | undefined) => (Array.isArray(val) ? val[0] : val);

export default async function BankLedgerPrintPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const context = await requirePagePermission("BANK_LEDGER_VIEW");
  const params = await searchParams;
  const companyId = context.company.id;
  const allowedBranches = permittedBranchIds(context, "BANK_LEDGER_VIEW");

  const bankAccountId = first(params.bankAccountId) || undefined;
  const statusFilter = first(params.status) || undefined;
  const fromStr = first(params.from) || undefined;
  const toStr = first(params.to) || undefined;

  const fromDate = fromStr ? new Date(`${fromStr}T00:00:00.000Z`) : undefined;
  const toDate = toStr ? new Date(`${toStr}T23:59:59.999Z`) : undefined;

  const [company, bankAccount, accounts] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    bankAccountId
      ? prisma.bankAccount.findFirst({
          where: {
            id: bankAccountId,
            companyId,
            ...(allowedBranches ? { branchId: { in: allowedBranches } } : {}),
          },
          include: {
            glAccount: { select: { code: true, name: true } },
            branch: { select: { code: true, name: true } },
          },
        })
      : null,
    prisma.bankAccount.findMany({
      where: {
        companyId,
        isActive: true,
        ...(allowedBranches ? { branchId: { in: allowedBranches } } : {}),
      },
      select: { id: true, code: true, bankName: true, openingBalance: true },
    }),
  ]);

  if (!company) notFound();
  if (bankAccountId && !bankAccount) notFound();

  // Determine base opening balance
  const baseOpeningBalance = bankAccount
    ? Number(bankAccount.openingBalance || 0)
    : accounts.reduce((sum, a) => sum + Number(a.openingBalance || 0), 0);

  // If fromDate is set, compute prior movements before fromDate
  let priorDeposits = 0;
  let priorWithdrawals = 0;
  if (fromDate) {
    const priorTxns = await prisma.bankTransaction.aggregate({
      where: {
        companyId,
        ...(bankAccountId ? { bankAccountId } : {}),
        ...(statusFilter === "RECONCILED" || statusFilter === "UNRECONCILED"
          ? { reconciliationStatus: statusFilter }
          : {}),
        ...(allowedBranches ? { bankAccount: { branchId: { in: allowedBranches } } } : {}),
        journalEntry: { status: { in: ["POSTED", "REVERSED"] } },
        transactionDate: { lt: fromDate },
      },
      _sum: {
        deposit: true,
        withdrawal: true,
      },
    });
    priorDeposits = Number(priorTxns._sum.deposit || 0);
    priorWithdrawals = Number(priorTxns._sum.withdrawal || 0);
  }

  const initialOpeningBalance = baseOpeningBalance + priorDeposits - priorWithdrawals;

  // Query transactions in chronological order (ascending)
  const transactions = await prisma.bankTransaction.findMany({
    where: {
      companyId,
      ...(bankAccountId ? { bankAccountId } : {}),
      ...(statusFilter === "RECONCILED" || statusFilter === "UNRECONCILED"
        ? { reconciliationStatus: statusFilter }
        : {}),
      ...(allowedBranches ? { bankAccount: { branchId: { in: allowedBranches } } } : {}),
      journalEntry: { status: { in: ["POSTED", "REVERSED"] } },
      ...(fromDate || toDate
        ? {
            transactionDate: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    },
    include: {
      bankAccount: {
        select: {
          code: true,
          bankName: true,
          accountTitle: true,
          currencyCode: true,
          glAccount: { select: { code: true, name: true } },
        },
      },
      journalEntry: {
        select: {
          id: true,
          voucherNumber: true,
          voucherType: true,
          sourceModule: true,
          status: true,
          postingDate: true,
          referenceDocument: true,
          narration: true,
        },
      },
    },
    orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
  });

  // Compute running balance chronologically
  let running = initialOpeningBalance;
  const ledgerRows = transactions.map((row, idx) => {
    const depositNum = Number(row.deposit || 0);
    const withdrawalNum = Number(row.withdrawal || 0);
    running = running + depositNum - withdrawalNum;
    return {
      ...row,
      idx: idx + 1,
      depositNum,
      withdrawalNum,
      runningBalance: running,
    };
  });

  const totalInflows = ledgerRows.reduce((sum, r) => sum + r.depositNum, 0);
  const totalOutflows = ledgerRows.reduce((sum, r) => sum + r.withdrawalNum, 0);
  const netMovement = totalInflows - totalOutflows;
  const closingBalance = initialOpeningBalance + netMovement;

  const currency = bankAccount?.currencyCode || company.currencyCode || "PKR";
  const periodLabel = fromDate && toDate
    ? `${formatDate(fromDate)} through ${formatDate(toDate)}`
    : fromDate
    ? `From ${formatDate(fromDate)} (To Date)`
    : `Complete Activity (As of ${formatDate(new Date())})`;

  const subtitle = bankAccount
    ? `${bankAccount.code} · ${bankAccount.bankName} (${bankAccount.accountTitle})`
    : `Consolidated Bank Accounts Ledger (${accounts.length} Accounts)`;

  const reconciledCount = ledgerRows.filter((r) => r.reconciliationStatus === "RECONCILED").length;
  const unreconciledCount = ledgerRows.length - reconciledCount;

  return (
    <div className="mx-auto max-w-[1100px] p-4 sm:p-6 print:p-0">
      {/* Universal Standard Report Print Header */}
      <ReportPrintHeader
        company={company}
        title="Bank Account Ledger Statement"
        subtitle={subtitle}
        periodLabel={periodLabel}
        branchName={bankAccount?.branch ? `${bankAccount.branch.code} · ${bankAccount.branch.name}` : "All Authorized Branches"}
        backHref="/finance/banking"
        status={unreconciledCount === 0 ? "Fully Reconciled" : `${unreconciledCount} Unreconciled`}
        metaItems={[
          {
            label: "Bank Account",
            value: bankAccount
              ? `${bankAccount.code} · ${bankAccount.bankName}`
              : "Consolidated Master",
          },
          {
            label: "GL Account",
            value: bankAccount?.glAccount
              ? `${bankAccount.glAccount.code} · ${bankAccount.glAccount.name}`
              : "GL 1010 – Current Accounts",
          },
          { label: "Currency", value: currency },
          {
            label: "Account Details",
            value: bankAccount
              ? `${bankAccount.accountTitle}${bankAccount.accountNumberLast4 ? ` (•••• ${bankAccount.accountNumberLast4})` : ""}${bankAccount.iban ? ` · IBAN: ${bankAccount.iban}` : ""}`
              : `${accounts.length} Active Bank Accounts`,
          },
          {
            label: "Reconciliation",
            value: `${reconciledCount} Reconciled / ${unreconciledCount} Unreconciled`,
          },
          {
            label: "Posted Lines",
            value: `${ledgerRows.length} Transactions`,
          },
        ]}
      />

      <article className="print-document rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 print:border-none print:p-0 print:shadow-none">
        {/* Executive Liquidity Summary Cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5 text-center">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[10px] uppercase font-bold text-slate-500">
              Opening Balance
            </span>
            <span className="mt-1 block font-mono text-sm font-bold text-slate-900">
              {formatMoney(String(initialOpeningBalance), currency)}
            </span>
            <span className="text-[10px] text-slate-400">Balance B/F</span>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
            <span className="block text-[10px] uppercase font-bold text-emerald-800">
              Total Deposits (+)
            </span>
            <span className="mt-1 block font-mono text-sm font-bold text-emerald-900">
              +{formatMoney(String(totalInflows), currency)}
            </span>
            <span className="text-[10px] text-emerald-600 font-medium">Bank Inflows</span>
          </div>

          <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3">
            <span className="block text-[10px] uppercase font-bold text-rose-800">
              Total Withdrawals (-)
            </span>
            <span className="mt-1 block font-mono text-sm font-bold text-rose-900">
              -{formatMoney(String(totalOutflows), currency)}
            </span>
            <span className="text-[10px] text-rose-600 font-medium">Bank Outflows</span>
          </div>

          <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 p-3">
            <span className="block text-[10px] uppercase font-bold text-indigo-800">
              Net Period Movement
            </span>
            <span className={`mt-1 block font-mono text-sm font-bold ${netMovement >= 0 ? "text-emerald-900" : "text-rose-900"}`}>
              {netMovement >= 0 ? "+" : ""}{formatMoney(String(netMovement), currency)}
            </span>
            <span className="text-[10px] text-indigo-600 font-medium">Net Delta</span>
          </div>

          <div className="rounded-lg border-2 border-slate-900 bg-slate-950 p-3 text-white col-span-2 sm:col-span-1 print:border print:bg-black print:text-white">
            <span className="block text-[10px] uppercase font-bold text-slate-300">
              Closing Bank Position
            </span>
            <span className="mt-1 block font-mono text-sm font-black text-white">
              {formatMoney(String(closingBalance), currency)}
            </span>
            <span className="text-[10px] text-slate-400">Authoritative GL</span>
          </div>
        </div>

        {/* Bank Information Summary Bar */}
        {bankAccount ? (
          <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-bold text-slate-900">{bankAccount.bankName}</span>
                <span className="text-slate-500"> · Account: <b>{bankAccount.accountTitle}</b></span>
                {bankAccount.accountNumberLast4 ? (
                  <span className="text-slate-500"> (•••• {bankAccount.accountNumberLast4})</span>
                ) : null}
                {bankAccount.iban ? (
                  <span className="text-slate-500 font-mono text-[11px]"> · IBAN: {bankAccount.iban}</span>
                ) : null}
              </div>
              <div className="text-[11px] text-slate-600">
                <span>Branch: <b>{bankAccount.branch.code} · {bankAccount.branch.name}</b></span>
                <span className="mx-2">|</span>
                <span>GL: <b>{bankAccount.glAccount.code} · {bankAccount.glAccount.name}</b></span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Authoritative Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-slate-900 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                <th className="py-2.5 px-2 text-center w-8">#</th>
                <th className="py-2.5 px-3 text-left w-24">Date</th>
                <th className="py-2.5 px-3 text-left w-44">Voucher / Source</th>
                <th className="py-2.5 px-3 text-left">Description & Bank Reference</th>
                <th className="py-2.5 px-3 text-right w-28">Deposit (Debit)</th>
                <th className="py-2.5 px-3 text-right w-28">Withdrawal (Credit)</th>
                <th className="py-2.5 px-3 text-right w-32">Running Balance</th>
                <th className="py-2.5 px-2 text-center w-20">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {/* Opening Balance Row */}
              <tr className="bg-slate-50/70 font-medium">
                <td className="py-2.5 px-2 text-center text-slate-400 font-mono">—</td>
                <td className="py-2.5 px-3 text-slate-600 font-mono">
                  {fromDate ? formatDate(fromDate) : "Opening"}
                </td>
                <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                  B/F · Opening Balance
                </td>
                <td className="py-2.5 px-3 text-slate-600 italic">
                  Initial bank balance brought forward
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-slate-400">—</td>
                <td className="py-2.5 px-3 text-right font-mono text-slate-400">—</td>
                <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                  {formatMoney(String(initialOpeningBalance), currency)}
                </td>
                <td className="py-2.5 px-2 text-center">
                  <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-slate-200 text-slate-700">
                    B/F
                  </span>
                </td>
              </tr>

              {/* Transactions in Chronological Order */}
              {ledgerRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 px-2 text-center text-slate-400 font-mono">{row.idx}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-800">
                    {formatDate(row.transactionDate)}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1.5 font-bold font-mono text-slate-900">
                      <span>{row.journalEntry?.voucherNumber}</span>
                      {row.journalEntry?.status === "REVERSED" ? (
                        <span className="rounded bg-rose-100 px-1 py-0.2 text-[9px] font-bold text-rose-700">
                          Reversed
                        </span>
                      ) : null}
                    </div>
                    <span className="block text-[10px] text-slate-500">
                      {row.journalEntry?.sourceModule
                        ? titleCase(row.journalEntry.sourceModule.replace(/_/g, " "))
                        : row.journalEntry?.voucherType || "General Ledger"}
                      {row.bankAccount ? ` · ${row.bankAccount.code}` : ""}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <p className="text-slate-800 font-medium">{row.description}</p>
                    {row.bankReference ? (
                      <p className="text-[10px] text-slate-500 font-mono">
                        Ref: {row.bankReference}
                      </p>
                    ) : null}
                    {row.journalEntry?.narration && row.journalEntry.narration !== row.description ? (
                      <p className="text-[10px] text-slate-400 italic">
                        {row.journalEntry.narration}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                    {row.depositNum > 0 ? formatMoney(String(row.depositNum), currency) : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700">
                    {row.withdrawalNum > 0 ? formatMoney(String(row.withdrawalNum), currency) : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-950">
                    {formatMoney(String(row.runningBalance), currency)}
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold ${
                        row.reconciliationStatus === "RECONCILED"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {row.reconciliationStatus === "RECONCILED" ? "Reconciled" : "Unreconciled"}
                    </span>
                  </td>
                </tr>
              ))}

              {!ledgerRows.length ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400 italic">
                    No posted bank transactions recorded for this period.
                  </td>
                </tr>
              ) : null}
            </tbody>

            {/* Authoritative Ledger Grand Totals */}
            <tfoot>
              <tr className="border-t-2 border-slate-900 bg-slate-100/90 font-bold text-slate-900">
                <td colSpan={4} className="py-3 px-3 text-right uppercase tracking-wider text-[11px]">
                  Total Period Movements & Closing Bank Position:
                </td>
                <td className="py-3 px-3 text-right font-mono text-emerald-800 text-xs">
                  {formatMoney(String(totalInflows), currency)}
                </td>
                <td className="py-3 px-3 text-right font-mono text-rose-800 text-xs">
                  {formatMoney(String(totalOutflows), currency)}
                </td>
                <td className="py-3 px-3 text-right font-mono text-slate-950 text-sm">
                  {formatMoney(String(closingBalance), currency)}
                </td>
                <td className="py-3 px-2 text-center text-[10px] text-slate-500 font-normal">
                  {ledgerRows.length} lines
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Formal Auditor & Finance Signatures */}
        <ReportPrintSignatures
          signers={[
            { name: "Treasury Officer", role: "Prepared by" },
            { name: "Internal Auditor", role: "Verified by" },
            { name: "Chief Financial Officer", role: "Approved by" },
          ]}
          notes="This is an official double-entry General Ledger bank statement generated by Axon Mobile ERP. All transactions reflect posted accounting entries from approved operational and financial vouchers."
          generatedAt={new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}
          documentId={bankAccount ? `BANK-${bankAccount.code}` : "BANK-CONSOLIDATED"}
        />

        {/* Mandatory Project Footer */}
        <div className="mt-8 pt-4 border-t border-slate-200 text-center text-xs text-slate-500 font-medium">
          © 2026 Copyright Reserved · Qasim Ali · 0315-5049489
        </div>
      </article>
    </div>
  );
}

