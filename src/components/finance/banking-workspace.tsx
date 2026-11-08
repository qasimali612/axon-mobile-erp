"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Landmark,
  Link2,
  Plus,
  Printer,
  RefreshCw,
  Send,
  ShieldCheck,
  Unlink,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

type Row = Record<string, any>;
type Props = { currency: string; permissions: { manageAccount: boolean; prepare: boolean; approve: boolean } };

const field = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const firstOfMonth = () => { const now = new Date(); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))); };

export function BankingWorkspace({ currency, permissions }: Props) {
  const [tab, setTab] = useState<"accounts" | "statements" | "ledger" | "transfers">("accounts");
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [cashAccounts, setCashAccounts] = useState<Row[]>([]);
  const [lookups, setLookups] = useState<{ assetAccounts: Row[]; branches: Row[] }>({ assetAccounts: [], branches: [] });
  const [statements, setStatements] = useState<Row[]>([]);
  const [transactions, setTransactions] = useState<Row[]>([]);
  const [recentTransfers, setRecentTransfers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountEditor, setAccountEditor] = useState<Row | "new" | null>(null);
  const [statementEditor, setStatementEditor] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [ledgerFilter, setLedgerFilter] = useState<{ bankAccountId: string; status: string }>({ bankAccountId: "", status: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const [accountResponse, statementResponse, ledgerResponse, transferResponse] = await Promise.all([
      fetch("/api/finance/bank-accounts", { cache: "no-store" }),
      fetch("/api/finance/bank-statements", { cache: "no-store" }),
      fetch("/api/finance/bank-transactions", { cache: "no-store" }),
      fetch("/api/finance/banking/transfers", { cache: "no-store" }),
    ]);
    const accountBody = await accountResponse.json().catch(() => null);
    const statementBody = await statementResponse.json().catch(() => null);
    const ledgerBody = await ledgerResponse.json().catch(() => null);
    const transferBody = await transferResponse.json().catch(() => null);
    setLoading(false);
    if (!accountResponse.ok) { toast.error(accountBody?.error?.message || "Bank accounts could not be loaded."); return; }
    setAccounts(accountBody.data || []);
    setLookups(accountBody.lookups || { assetAccounts: [], branches: [] });
    if (statementResponse.ok) setStatements(statementBody.data || []);
    if (ledgerResponse.ok) setTransactions(ledgerBody.data || []);
    if (transferResponse.ok && transferBody?.data) {
      setCashAccounts(transferBody.data.cashAccounts || []);
      setRecentTransfers(transferBody.data.recentTransfers || []);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filteredTransactions = useMemo(() => transactions.filter((row) => (!ledgerFilter.bankAccountId || row.bankAccountId === ledgerFilter.bankAccountId) && (!ledgerFilter.status || row.reconciliationStatus === ledgerFilter.status)), [transactions, ledgerFilter]);
  const ledgerTotals = useMemo(() => accounts.map((account) => {
    const rows = transactions.filter((row) => row.bankAccountId === account.id);
    const balance = rows.reduce((sum, row) => sum + Number(row.deposit) - Number(row.withdrawal), 0);
    const unreconciled = rows.filter((row) => row.reconciliationStatus === "UNRECONCILED").length;
    return { id: account.id, balance, unreconciled, count: rows.length };
  }), [accounts, transactions]);

  return (
    <>
      <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2"><span className="kicker">Cash and treasury</span><Badge tone="green">Posted ledger</Badge></div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">Banking and reconciliation</h1>
          <p className="mt-1.5 text-sm text-slate-500">Bank masters post to one asset ledger account. Statements never create journals; they match posted ledger transactions so each reconciliation is evidence-based.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setTransferOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <ArrowLeftRight className="h-4 w-4" /> Deposit / Withdraw / Transfer
          </Button>
          {tab === "accounts" && permissions.manageAccount ? <Button onClick={() => setAccountEditor("new")}><Plus className="h-4 w-4" />New bank account</Button> : null}
          {tab === "statements" && permissions.prepare ? <Button onClick={() => setStatementEditor(true)}><Plus className="h-4 w-4" />Import statement</Button> : null}
          <Button variant="outline" onClick={() => void load()} loading={loading}><RefreshCw className="h-4 w-4" />Refresh</Button>
        </div>
      </header>

      <div className="surface mb-5 flex items-center gap-2 p-2">
        {(["accounts", "statements", "ledger", "transfers"] as const).map((item) => (
          <button key={item} onClick={() => setTab(item)} className={`rounded-lg px-4 py-2 text-xs font-bold ${tab === item ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
            {item === "accounts"
              ? `Bank accounts (${accounts.length})`
              : item === "statements"
              ? `Statements (${statements.length})`
              : item === "ledger"
              ? `Bank ledger (${transactions.length})`
              : `Transfers & Contra (${recentTransfers.length})`}
          </button>
        ))}
      </div>

      {tab === "accounts" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {loading && !accounts.length ? <div className="surface p-10 text-center text-xs text-slate-400">Loading bank accounts…</div> : null}
          {!loading && !accounts.length ? <div className="surface p-10 text-center text-xs text-slate-400 md:col-span-2 xl:col-span-3">No bank accounts yet. Add the first operating account and link it to an existing asset ledger account.</div> : null}
          {accounts.map((account) => {
            const totals = ledgerTotals.find((item) => item.id === account.id);
            return (
              <section key={account.id} className="surface p-5">
                <div className="flex items-start justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Landmark className="h-5 w-5" /></span>
                  <Badge tone={account.isActive ? "green" : "slate"}>{account.isActive ? "Active" : "Inactive"}</Badge>
                </div>
                <p className="mt-4 text-xs font-bold text-slate-900">{account.code} · {account.bankName}</p>
                <p className="mt-1 text-[10px] text-slate-400">{account.accountTitle} · •••• {account.accountNumberLast4 || "—"}</p>
                <p className="mt-4 text-2xl font-bold text-slate-950">{formatMoney(String(totals?.balance ?? 0), account.currencyCode || currency)}</p>
                <p className="mt-1 text-[10px] text-slate-400">{account.glAccount?.code} · {account.glAccount?.name}</p>
                <p className="mt-1 text-[10px] text-slate-400">{account.branch?.code} · {account.branch?.name}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-400">{totals?.unreconciled ?? 0} unreconciled of {totals?.count ?? 0}</span>
                  {permissions.manageAccount ? <Button size="sm" variant="outline" onClick={() => setAccountEditor(account)}>Edit</Button> : <Button size="sm" variant="outline" onClick={() => { setTab("ledger"); setLedgerFilter({ bankAccountId: account.id, status: "" }); }}>Ledger</Button>}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {tab === "statements" ? (
        <section className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left">
              <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                <tr><th className="px-5 py-3">Bank / statement</th><th className="px-4 py-3">Period</th><th className="px-4 py-3 text-right">Opening</th><th className="px-4 py-3 text-right">Closing</th><th className="px-4 py-3 text-right">Matched</th><th className="px-4 py-3">Reconciliation</th><th className="px-5 py-3 text-right">Action</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? <tr><td colSpan={7} className="p-14 text-center text-xs text-slate-400">Loading statements…</td></tr>
                  : !statements.length ? <tr><td colSpan={7} className="p-14 text-center text-xs text-slate-400">No statements imported yet. Import a bank statement to match posted transactions and reconcile the ledger.</td></tr>
                    : statements.map((row) => (
                      <tr key={row.id} className="text-xs">
                        <td className="px-5 py-3.5"><b>{row.bankAccount?.code}</b><span className="block text-[10px] text-slate-500">{row.statementNumber || "Statement"} · {row.bankAccount?.bankName}</span></td>
                        <td className="px-4 py-3.5 text-[10px] text-slate-500">{formatDate(row.periodStart)} → {formatDate(row.periodEnd)}</td>
                        <td className="px-4 py-3.5 text-right font-mono text-[11px]">{formatMoney(String(row.openingBalance), row.bankAccount?.currencyCode || currency)}</td>
                        <td className="px-4 py-3.5 text-right font-mono text-[11px] font-bold">{formatMoney(String(row.closingBalance), row.bankAccount?.currencyCode || currency)}</td>
                        <td className="px-4 py-3.5 text-right"><span className={row.matchedLines === row.totalLines && row.totalLines > 0 ? "font-bold text-emerald-700" : "font-bold text-amber-700"}>{row.matchedLines}/{row.totalLines}</span></td>
                        <td className="px-4 py-3.5">{row.reconciliation ? <Badge tone={row.reconciliation.status === "COMPLETED" ? "green" : row.reconciliation.status === "REOPENED" ? "amber" : "blue"}>{titleCase(row.reconciliation.status)}</Badge> : <Badge tone="slate">Not prepared</Badge>}</td>
                        <td className="px-5 py-3.5 text-right"><Button size="sm" variant="outline" onClick={() => { setTab("statements"); setDetailId(row.id); }}>Open</Button></td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "ledger" ? (
        <section className="surface overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            <select className={`${field} max-w-64`} value={ledgerFilter.bankAccountId} onChange={(event) => setLedgerFilter((current) => ({ ...current, bankAccountId: event.target.value }))}>
              <option value="">All bank accounts</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.bankName}</option>)}
            </select>
            <select className={`${field} max-w-48`} value={ledgerFilter.status} onChange={(event) => setLedgerFilter((current) => ({ ...current, status: event.target.value }))}>
              <option value="">All statuses</option><option value="UNRECONCILED">Unreconciled</option><option value="RECONCILED">Reconciled</option>
            </select>
            <span className="ml-auto text-[10px] text-slate-400">{filteredTransactions.length} posted transaction{filteredTransactions.length === 1 ? "" : "s"}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                <tr><th className="px-5 py-3">Date / bank</th><th className="px-4 py-3">Voucher / reference</th><th className="px-4 py-3">Description</th><th className="px-4 py-3 text-right">Deposit</th><th className="px-4 py-3 text-right">Withdrawal</th><th className="px-5 py-3">Reconciliation</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.map((row) => (
                  <tr key={row.id} className="text-xs">
                    <td className="px-5 py-3"><span className="block text-slate-700">{formatDate(row.transactionDate)}</span><span className="text-[9px] text-slate-400">{row.bankAccount?.code}</span></td>
                    <td className="px-4 py-3"><a href={`/finance/journals/${row.journalEntry?.id}`} className="font-semibold text-blue-700 hover:underline">{row.journalEntry?.voucherNumber}</a><span className="mt-0.5 block text-[9px] text-slate-400">{row.bankReference || "—"}</span></td>
                    <td className="max-w-[280px] px-4 py-3 text-slate-600"><span className="block truncate">{row.description}</span></td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">{Number(row.deposit) === 0 ? "—" : formatMoney(String(row.deposit), row.bankAccount?.currencyCode || currency)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-rose-700">{Number(row.withdrawal) === 0 ? "—" : formatMoney(String(row.withdrawal), row.bankAccount?.currencyCode || currency)}</td>
                    <td className="px-5 py-3"><Badge tone={row.reconciliationStatus === "RECONCILED" ? "green" : "amber"}>{titleCase(row.reconciliationStatus)}</Badge></td>
                  </tr>
                ))}
                {!filteredTransactions.length ? <tr><td colSpan={6} className="py-14 text-center text-xs text-slate-400">No posted bank transactions match this filter.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "transfers" ? (
        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Contra Vouchers & Transfers</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Cash deposits, withdrawals, and inter-bank transfers with balanced double-entry vouchers.
              </p>
            </div>
            <Button onClick={() => setTransferOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-4 w-4" /> New transfer
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left">
              <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-5 py-3">Voucher #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Narration</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentTransfers.map((t) => (
                  <tr key={t.id} className="text-xs hover:bg-slate-50/60">
                    <td className="px-5 py-3.5">
                      <a href={`/finance/journals/${t.id}`} className="font-bold text-blue-700 hover:underline">
                        {t.voucherNumber}
                      </a>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{formatDate(t.postingDate)}</td>
                    <td className="px-4 py-3.5">
                      <Badge
                        tone={
                          t.sourceModule === "CASH_DEPOSIT"
                            ? "green"
                            : t.sourceModule === "CASH_WITHDRAWAL"
                            ? "blue"
                            : "purple"
                        }
                      >
                        {t.sourceModule === "CASH_DEPOSIT"
                          ? "Cash Deposit"
                          : t.sourceModule === "CASH_WITHDRAWAL"
                          ? "Cash Withdrawal"
                          : "Bank Transfer"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{t.branch?.code}</td>
                    <td className="px-4 py-3.5 text-slate-700 max-w-[280px] truncate" title={t.narration}>
                      {t.narration}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900">
                      {formatMoney(t.totalDebit.toString(), currency)}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone={t.status === "POSTED" ? "green" : "amber"}>{titleCase(t.status)}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <a
                        href={`/finance/journals/${t.id}/print`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        <Printer className="h-3 w-3" /> Print JV
                      </a>
                    </td>
                  </tr>
                ))}
                {!recentTransfers.length ? (
                  <tr>
                    <td colSpan={8} className="py-14 text-center text-xs text-slate-400">
                      No cash deposits, withdrawals, or bank transfers recorded yet. Click &quot;New transfer&quot; above to create one.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <AccountEditor open={Boolean(accountEditor)} row={accountEditor === "new" ? null : accountEditor} lookups={lookups} currency={currency} onClose={() => setAccountEditor(null)} onSaved={async () => { setAccountEditor(null); await load(); }} />
      <StatementEditor open={statementEditor} accounts={accounts} currency={currency} onClose={() => setStatementEditor(false)} onSaved={async (id) => { setStatementEditor(false); await load(); setDetailId(id); }} />
      <TransferModal open={transferOpen} currency={currency} bankAccounts={accounts} cashAccounts={cashAccounts} branches={lookups.branches} onClose={() => setTransferOpen(false)} onSaved={load} />
      {detailId ? <StatementDetail id={detailId} permissions={permissions} currency={currency} onClose={() => setDetailId(null)} onChanged={load} /> : null}
    </>
  );
}

function AccountEditor({ open, row, lookups, currency, onClose, onSaved }: { open: boolean; row: Row | null; lookups: { assetAccounts: Row[]; branches: Row[] }; currency: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [branchId, setBranchId] = useState(""); const [code, setCode] = useState(""); const [bankName, setBankName] = useState(""); const [accountTitle, setAccountTitle] = useState("");
  const [glAccountId, setGlAccountId] = useState(""); const [iban, setIban] = useState(""); const [last4, setLast4] = useState(""); const [bankBranchName, setBankBranchName] = useState("");
  const [currencyCode, setCurrencyCode] = useState(currency); const [isActive, setIsActive] = useState(true); const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBranchId(row?.branchId || lookups.branches[0]?.id || ""); setCode(row?.code || ""); setBankName(row?.bankName || ""); setAccountTitle(row?.accountTitle || "");
    setGlAccountId(row?.glAccountId || ""); setIban(row?.iban || ""); setLast4(row?.accountNumberLast4 || ""); setBankBranchName(row?.bankBranchName || "");
    setCurrencyCode(row?.currencyCode || currency); setIsActive(row?.isActive ?? true);
  }, [open, row, lookups.branches, currency]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch(row ? `/api/finance/bank-accounts/${row.id}` : "/api/finance/bank-accounts", {
      method: row ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ branchId, code, bankName, accountTitle, glAccountId, iban: iban || null, accountNumberLast4: last4 || null, bankBranchName: bankBranchName || null, currencyCode, isActive }),
    });
    const body = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) return toast.error(body?.error?.message || "Bank account could not be saved.");
    toast.success("Bank account saved.");
    await onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title={`${row ? "Edit" : "New"} bank account`} description="The bank account posts to one existing asset ledger account; balances come from posted journals." size="md">
      <form onSubmit={save} className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">Code<input className={`${field} mt-1.5 uppercase`} value={code} onChange={(event) => setCode(event.target.value)} maxLength={30} required /></label>
          <label className="text-xs font-semibold">Bank name<input className={`${field} mt-1.5`} value={bankName} onChange={(event) => setBankName(event.target.value)} maxLength={140} required /></label>
          <label className="text-xs font-semibold">Account title<input className={`${field} mt-1.5`} value={accountTitle} onChange={(event) => setAccountTitle(event.target.value)} maxLength={160} required /></label>
          <label className="text-xs font-semibold">Branch<select className={`${field} mt-1.5`} value={branchId} onChange={(event) => setBranchId(event.target.value)} required>{lookups.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}</select></label>
          <label className="text-xs font-semibold sm:col-span-2">Asset ledger account<select className={`${field} mt-1.5`} value={glAccountId} onChange={(event) => setGlAccountId(event.target.value)} required><option value="">Select asset account…</option>{lookups.assetAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
          <label className="text-xs font-semibold">Last four digits<input className={`${field} mt-1.5`} value={last4} onChange={(event) => setLast4(event.target.value.replace(/\D/g, "").slice(0, 4))} maxLength={4} inputMode="numeric" /></label>
          <label className="text-xs font-semibold">IBAN<input className={`${field} mt-1.5 uppercase`} value={iban} onChange={(event) => setIban(event.target.value)} maxLength={40} /></label>
          <label className="text-xs font-semibold">Bank branch<input className={`${field} mt-1.5`} value={bankBranchName} onChange={(event) => setBankBranchName(event.target.value)} maxLength={120} /></label>
          <label className="text-xs font-semibold">Currency<input className={`${field} mt-1.5 uppercase`} value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)} maxLength={3} required /></label>
        </div>
        <label className="flex items-center gap-2 rounded-lg border p-3 text-xs font-semibold"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />Active and selectable<span className="ml-auto text-[10px] font-normal text-slate-400">Deactivation is blocked while unreconciled activity exists.</span></label>
        <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="ghost" onClick={onClose}>Close</Button><Button type="submit" loading={saving}>Save account</Button></div>
      </form>
    </Modal>
  );
}

function StatementEditor({ open, accounts, currency, onClose, onSaved }: { open: boolean; accounts: Row[]; currency: string; onClose: () => void; onSaved: (id: string) => Promise<void> }) {
  const [bankAccountId, setBankAccountId] = useState(""); const [statementNumber, setStatementNumber] = useState("");
  const [periodStart, setPeriodStart] = useState(firstOfMonth()); const [periodEnd, setPeriodEnd] = useState(today());
  const [openingBalance, setOpeningBalance] = useState("0"); const [closingBalance, setClosingBalance] = useState("0");
  const [lines, setLines] = useState<Array<{ transactionDate: string; reference: string; description: string; deposit: string; withdrawal: string }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBankAccountId(accounts[0]?.id || ""); setStatementNumber(""); setPeriodStart(firstOfMonth()); setPeriodEnd(today());
    setOpeningBalance("0"); setClosingBalance("0"); setLines([]);
  }, [open, accounts]);

  const net = lines.reduce((sum, line) => sum + Number(line.deposit || 0) - Number(line.withdrawal || 0), 0);
  const expectedClose = Number(openingBalance || 0) + net;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!lines.length) return toast.error("Add at least one statement line.");
    setSaving(true);
    const response = await fetch("/api/finance/bank-statements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        bankAccountId, statementNumber: statementNumber || null, periodStart, periodEnd,
        openingBalance, closingBalance: closingBalance || String(expectedClose.toFixed(4)),
        lines: lines.map((line) => ({ transactionDate: line.transactionDate || periodStart, reference: line.reference || null, description: line.description, deposit: line.deposit || "0", withdrawal: line.withdrawal || "0" })),
      }),
    });
    const body = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) return toast.error(body?.error?.message || "Statement could not be imported.");
    toast.success("Statement imported. Match posted transactions before reconciling.");
    await onSaved(body.data.id);
  }

  return (
    <Modal open={open} onClose={onClose} title="Import bank statement" description="Statement lines are accounting evidence only; they never create journals or stock effects." size="xl">
      <form onSubmit={save} className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-semibold">Bank account<select className={`${field} mt-1.5`} value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)} required>{accounts.filter((account) => account.isActive).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.bankName}</option>)}</select></label>
          <label className="text-xs font-semibold">Statement number<input className={`${field} mt-1.5`} value={statementNumber} onChange={(event) => setStatementNumber(event.target.value)} maxLength={80} /></label>
          <label className="text-xs font-semibold">Currency<span className={`${field} mt-1.5 flex items-center bg-slate-50 text-slate-500`}>{accounts.find((account) => account.id === bankAccountId)?.currencyCode || currency}</span></label>
          <label className="text-xs font-semibold">Period start<input className={`${field} mt-1.5`} type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} required /></label>
          <label className="text-xs font-semibold">Period end<input className={`${field} mt-1.5`} type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} required /></label>
          <label className="text-xs font-semibold">Opening balance<input className={`${field} mt-1.5 text-right`} inputMode="decimal" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} required /></label>
        </div>
        <div className="rounded-xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-xs font-bold text-slate-700">Statement lines <span className="ml-1 text-[10px] font-medium text-slate-400">{lines.length} line{lines.length === 1 ? "" : "s"} · net {net.toFixed(2)}</span></span>
            <Button type="button" size="sm" variant="outline" onClick={() => setLines((current) => [...current, { transactionDate: periodEnd, reference: "", description: "", deposit: "", withdrawal: "" }])}><Plus className="h-3.5 w-3.5" />Add line</Button>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto p-3">
            {!lines.length ? <p className="py-6 text-center text-[11px] text-slate-400">No lines yet. Enter or paste the statement rows.</p> : lines.map((line, index) => (
              <div key={index} className="grid gap-2 lg:grid-cols-[130px_120px_1fr_110px_110px_32px]">
                <input className={field} type="date" value={line.transactionDate} onChange={(event) => setLines((current) => current.map((item, position) => position === index ? { ...item, transactionDate: event.target.value } : item))} />
                <input className={field} placeholder="Reference" value={line.reference} onChange={(event) => setLines((current) => current.map((item, position) => position === index ? { ...item, reference: event.target.value } : item))} />
                <input className={field} placeholder="Description" value={line.description} onChange={(event) => setLines((current) => current.map((item, position) => position === index ? { ...item, description: event.target.value } : item))} required minLength={2} />
                <input className={field} placeholder="Deposit" inputMode="decimal" value={line.deposit} onChange={(event) => setLines((current) => current.map((item, position) => position === index ? { ...item, deposit: event.target.value, withdrawal: event.target.value ? "" : item.withdrawal } : item))} />
                <input className={field} placeholder="Withdrawal" inputMode="decimal" value={line.withdrawal} onChange={(event) => setLines((current) => current.map((item, position) => position === index ? { ...item, withdrawal: event.target.value, deposit: event.target.value ? "" : item.deposit } : item))} />
                <Button type="button" variant="ghost" size="icon" onClick={() => setLines((current) => current.filter((_, position) => position !== index))}><XCircle className="h-4 w-4 text-rose-500" /></Button>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">Closing balance<input className={`${field} mt-1.5 text-right`} inputMode="decimal" value={closingBalance} onChange={(event) => setClosingBalance(event.target.value)} placeholder={expectedClose.toFixed(4)} required /><span className="mt-1 block text-[10px] text-slate-400">Opening plus lines equals {expectedClose.toFixed(2)}.</span></label>
          <div className="rounded-lg border border-slate-200 p-3 text-[11px] text-slate-500">Every line must fall inside the statement period. Overlapping statements for the same account are rejected, and a statement cannot be deleted once a reconciliation exists.</div>
        </div>
        <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="ghost" onClick={onClose}>Close</Button><Button type="submit" loading={saving} disabled={!accounts.length}>Import statement</Button></div>
      </form>
    </Modal>
  );
}

function StatementDetail({ id, permissions, currency, onClose, onChanged }: { id: string; permissions: Props["permissions"]; currency: string; onClose: () => void; onChanged: () => Promise<void> }) {
  const [statement, setStatement] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/finance/bank-statements/${id}`, { cache: "no-store" });
    const body = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) return toast.error(body?.error?.message || "Statement detail could not be loaded.");
    setStatement(body.data);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function post(path: string, payload?: unknown, successMessage?: string) {
    setBusy(path);
    const response = await fetch(path, { method: "POST", headers: payload === undefined ? undefined : { "content-type": "application/json" }, body: payload === undefined ? undefined : JSON.stringify(payload) });
    const body = await response.json().catch(() => null);
    setBusy("");
    if (!response.ok) { toast.error(body?.error?.message || "The banking action failed."); return null; }
    if (successMessage) toast.success(successMessage);
    await load();
    await onChanged();
    return body.data;
  }

  const lines = statement?.lines || [];
  const candidates = statement?.candidates || [];
  const matchedCount = lines.filter((line: Row) => line.isMatched).length;
  const reconciliation = statement?.reconciliation;
  const completed = reconciliation?.status === "COMPLETED";
  const currencyCode = statement?.bankAccount?.currencyCode || currency;

  return (
    <Modal open onClose={onClose} title={`Statement ${statement?.statementNumber || ""} · ${statement?.bankAccount?.code || ""}`} description="Match every statement line to a posted bank transaction, then prepare and complete the reconciliation." size="xl">
      <div className="space-y-4 p-5">
        {loading && !statement ? <p className="py-12 text-center text-xs text-slate-400">Loading statement…</p> : null}
        {statement ? (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: "Period", value: `${formatDate(statement.periodStart)} → ${formatDate(statement.periodEnd)}` },
                { label: "Opening", value: formatMoney(String(statement.openingBalance), currencyCode) },
                { label: "Closing", value: formatMoney(String(statement.closingBalance), currencyCode) },
                { label: "Matched lines", value: `${matchedCount}/${lines.length}` },
              ].map((item) => <div key={item.label} className="rounded-xl border border-slate-200 p-3"><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{item.label}</p><p className="mt-1 text-sm font-bold text-slate-900">{item.value}</p></div>)}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {permissions.prepare && !completed ? <Button size="sm" variant="outline" loading={busy.includes("auto-match")} onClick={() => void post(`/api/finance/bank-statements/${id}/auto-match`, undefined, "Unambiguous lines matched.")}><Link2 className="h-4 w-4" />Auto-match</Button> : null}
              {permissions.prepare && !completed ? <Button size="sm" variant="outline" loading={busy.includes("/reconciliation")} onClick={() => void post(`/api/finance/bank-statements/${id}/reconciliation`, undefined, "Reconciliation prepared.")}><ShieldCheck className="h-4 w-4" />Prepare reconciliation</Button> : null}
              {permissions.approve && reconciliation && !completed ? <Button size="sm" loading={busy.includes("complete")} onClick={() => void post(`/api/finance/bank-reconciliations/${reconciliation.id}/complete`, {}, "Reconciliation completed.")}><CheckCircle2 className="h-4 w-4" />Complete</Button> : null}
              {permissions.approve && completed ? <Button size="sm" variant="outline" onClick={() => setReopenOpen(true)}>Reopen</Button> : null}
              {completed ? <Badge tone="green">Completed {reconciliation?.completedAt ? formatDate(reconciliation.completedAt) : ""}</Badge> : null}
            </div>

            {reconciliation ? (
              <div className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-4">
                <div><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Book balance</p><p className="mt-1 font-mono text-sm font-bold">{formatMoney(String(reconciliation.bookBalance), currencyCode)}</p></div>
                <div><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Outstanding deposits</p><p className="mt-1 font-mono text-sm">{formatMoney(String(reconciliation.outstandingDeposits), currencyCode)}</p></div>
                <div><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Outstanding payments</p><p className="mt-1 font-mono text-sm">{formatMoney(String(reconciliation.outstandingPayments), currencyCode)}</p></div>
                <div><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Adjusted / statement</p><p className={`mt-1 font-mono text-sm font-bold ${Number(reconciliation.adjustedBalance) === Number(reconciliation.statementBalance) ? "text-emerald-700" : "text-rose-700"}`}>{formatMoney(String(reconciliation.adjustedBalance), currencyCode)} / {formatMoney(String(reconciliation.statementBalance), currencyCode)}</p></div>
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[860px] text-left">
                <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  <tr><th className="px-4 py-3">Date / description</th><th className="px-3 py-3 text-right">Deposit</th><th className="px-3 py-3 text-right">Withdrawal</th><th className="px-4 py-3">Matched voucher</th><th className="px-4 py-3 text-right">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line: Row) => {
                    const direction = Number(line.deposit) > 0 ? "deposit" : "withdrawal";
                    const amount = Number(direction === "deposit" ? line.deposit : line.withdrawal);
                    const pool = candidates.filter((candidate: Row) => candidate.reconciliationStatus === "UNRECONCILED" && (direction === "deposit" ? Number(candidate.deposit) > 0 : Number(candidate.withdrawal) > 0) && Math.abs(Number(direction === "deposit" ? candidate.deposit : candidate.withdrawal) - amount) <= 0.005);
                    return (
                      <tr key={line.id} className="text-xs">
                        <td className="px-4 py-3"><span className="block text-slate-700">{formatDate(line.transactionDate)}</span><span className="block text-[10px] text-slate-500">{line.description}</span><span className="text-[9px] text-slate-400">{line.reference || "—"}</span></td>
                        <td className="px-3 py-3 text-right font-semibold text-emerald-700">{Number(line.deposit) ? formatMoney(String(line.deposit), currencyCode) : "—"}</td>
                        <td className="px-3 py-3 text-right font-semibold text-rose-700">{Number(line.withdrawal) ? formatMoney(String(line.withdrawal), currencyCode) : "—"}</td>
                        <td className="px-4 py-3">{line.matchedJournalLine ? <span className="font-semibold text-blue-700">{line.matchedJournalLine.entry?.voucherNumber}<span className="block text-[9px] font-normal text-slate-400">{formatDate(line.matchedJournalLine.entry?.postingDate)}</span></span> : <Badge tone="amber">Unmatched</Badge>}</td>
                        <td className="px-4 py-3">
                          {!permissions.prepare || completed ? <span className="text-[10px] text-slate-400">Locked</span> : line.isMatched ? (
                            <Button size="sm" variant="ghost" loading={busy === `unmatch-${line.id}`} onClick={async () => { setBusy(`unmatch-${line.id}`); await post(`/api/finance/bank-statements/${id}/match`, { lineId: line.id, bankTransactionId: null }, "Match cleared."); }}><Unlink className="h-3.5 w-3.5" />Unmatch</Button>
                          ) : (
                            <select className={`${field} max-w-[260px]`} value="" onChange={(event) => { if (!event.target.value) return; void post(`/api/finance/bank-statements/${id}/match`, { lineId: line.id, bankTransactionId: event.target.value }, "Line matched."); }}>
                              <option value="">{pool.length ? `Match (${pool.length} candidate${pool.length === 1 ? "" : "s"})…` : "No same-amount candidate"}</option>
                              {pool.map((candidate: Row) => <option key={candidate.id} value={candidate.id}>{candidate.journalEntry?.voucherNumber} · {formatDate(candidate.transactionDate)} · {candidate.bankReference || candidate.description?.slice(0, 24)}</option>)}
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-slate-400">Matching links a statement line to the posted journal line behind the bank transaction. Completion requires every line matched and the adjusted book balance to equal the statement balance.</p>
          </>
        ) : null}
        <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="ghost" onClick={onClose}>Close</Button></div>
      </div>

      <Modal open={reopenOpen} onClose={() => setReopenOpen(false)} title="Reopen reconciliation" description="Reopening keeps the audit trail and requires a reason." size="md">
        <div className="space-y-4 p-5">
          <label className="block text-xs font-semibold">Reason<textarea className="mt-1.5 min-h-20 w-full rounded-lg border p-3 text-sm" value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} maxLength={2000} required /></label>
          <div className="flex justify-end gap-2 border-t pt-4"><Button variant="ghost" onClick={() => setReopenOpen(false)}>Cancel</Button><Button disabled={reopenReason.trim().length < 10} loading={busy.includes("reopen")} onClick={async () => { const result = await post(`/api/finance/bank-reconciliations/${reconciliation?.id}/reopen`, { reason: reopenReason }, "Reconciliation reopened."); if (result) { setReopenOpen(false); setReopenReason(""); } }}>Reopen</Button></div>
        </div>
      </Modal>
    </Modal>
  );
}

function TransferModal({
  open,
  currency,
  bankAccounts,
  cashAccounts,
  branches,
  onClose,
  onSaved,
}: {
  open: boolean;
  currency: string;
  bankAccounts: Row[];
  cashAccounts: Row[];
  branches: Row[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [type, setType] = useState<"CASH_DEPOSIT" | "CASH_WITHDRAWAL" | "BANK_TRANSFER">("CASH_DEPOSIT");
  const [branchId, setBranchId] = useState("");
  const [transferDate, setTransferDate] = useState(today());
  const [sourceBankAccountId, setSourceBankAccountId] = useState("");
  const [sourceCashAccountId, setSourceCashAccountId] = useState("");
  const [destinationBankAccountId, setDestinationBankAccountId] = useState("");
  const [destinationCashAccountId, setDestinationCashAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [narration, setNarration] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBranchId(branches[0]?.id || "");
    setTransferDate(today());
    setSourceCashAccountId(cashAccounts[0]?.id || "");
    setDestinationCashAccountId(cashAccounts[0]?.id || "");
    setDestinationBankAccountId(bankAccounts[0]?.id || "");
    setSourceBankAccountId(bankAccounts[0]?.id || "");
    setAmount("");
    setReference("");
    setNarration("Counter cash deposit into bank account");
  }, [open, branches, bankAccounts, cashAccounts]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!(val > 0)) return toast.error("Enter a valid amount greater than zero.");
    if (type === "BANK_TRANSFER" && sourceBankAccountId === destinationBankAccountId) {
      return toast.error("Source and destination bank accounts cannot be the same.");
    }
    if (narration.trim().length < 5) {
      return toast.error("Enter a clear narration / business purpose (at least 5 characters).");
    }

    setSaving(true);
    const response = await fetch("/api/finance/banking/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        branchId,
        transferDate,
        sourceBankAccountId: type !== "CASH_DEPOSIT" ? sourceBankAccountId : null,
        sourceCashAccountId: type === "CASH_DEPOSIT" ? sourceCashAccountId : null,
        destinationBankAccountId: type !== "CASH_WITHDRAWAL" ? destinationBankAccountId : null,
        destinationCashAccountId: type === "CASH_WITHDRAWAL" ? destinationCashAccountId : null,
        amount: String(val.toFixed(2)),
        reference: reference || null,
        narration,
        idempotencyKey: crypto.randomUUID(),
      }),
    });

    const body = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) {
      toast.error(body?.error?.message || "Transfer could not be processed.");
      return;
    }

    toast.success(
      body.status === "POSTED"
        ? `Transfer ${body.data?.voucherNumber || ""} posted immediately.`
        : `Transfer ${body.data?.voucherNumber || ""} submitted for verification.`
    );
    onClose();
    await onSaved();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cash Deposit / Withdrawal / Bank Transfer"
      description="Record contra vouchers between bank accounts and cash in hand with balanced ledger entries."
      size="lg"
    >
      <form onSubmit={save} className="space-y-4 p-5 sm:p-6">
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setType("CASH_DEPOSIT");
              if (!narration || narration.includes("Cash") || narration.includes("Transfer")) {
                setNarration("Counter cash deposit into bank account");
              }
            }}
            className={`rounded-lg py-2.5 transition ${
              type === "CASH_DEPOSIT" ? "bg-white text-emerald-800 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Cash Deposit (Cash → Bank)
          </button>
          <button
            type="button"
            onClick={() => {
              setType("CASH_WITHDRAWAL");
              if (!narration || narration.includes("Cash") || narration.includes("Transfer")) {
                setNarration("Cash withdrawal from bank for drawer replenishment");
              }
            }}
            className={`rounded-lg py-2.5 transition ${
              type === "CASH_WITHDRAWAL" ? "bg-white text-blue-800 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Cash Withdrawal (Bank → Cash)
          </button>
          <button
            type="button"
            onClick={() => {
              setType("BANK_TRANSFER");
              if (!narration || narration.includes("Cash") || narration.includes("Transfer")) {
                setNarration("Inter-bank funds transfer");
              }
            }}
            className={`rounded-lg py-2.5 transition ${
              type === "BANK_TRANSFER" ? "bg-white text-purple-800 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Bank Transfer (Bank → Bank)
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">
            Operating Branch
            <select
              className={`${field} mt-1`}
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              required
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold">
            Transfer Date
            <input
              type="date"
              className={`${field} mt-1`}
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              required
            />
          </label>

          {/* Source Account Selector */}
          {type === "CASH_DEPOSIT" ? (
            <label className="text-xs font-semibold">
              Source Cash Account (Outflow)
              <select
                className={`${field} mt-1`}
                value={sourceCashAccountId}
                onChange={(e) => setSourceCashAccountId(e.target.value)}
                required
              >
                {cashAccounts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="text-xs font-semibold">
              Source Bank Account (Outflow)
              <select
                className={`${field} mt-1`}
                value={sourceBankAccountId}
                onChange={(e) => setSourceBankAccountId(e.target.value)}
                required
              >
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} · {b.bankName} •••• {b.accountNumberLast4}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Destination Account Selector */}
          {type === "CASH_WITHDRAWAL" ? (
            <label className="text-xs font-semibold">
              Destination Cash Account (Inflow)
              <select
                className={`${field} mt-1`}
                value={destinationCashAccountId}
                onChange={(e) => setDestinationCashAccountId(e.target.value)}
                required
              >
                {cashAccounts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="text-xs font-semibold">
              Destination Bank Account (Inflow)
              <select
                className={`${field} mt-1`}
                value={destinationBankAccountId}
                onChange={(e) => setDestinationBankAccountId(e.target.value)}
                required
              >
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} · {b.bankName} •••• {b.accountNumberLast4}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="text-xs font-semibold">
            Amount ({currency})
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              className={`${field} mt-1 font-mono font-bold text-slate-900`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>

          <label className="text-xs font-semibold">
            Deposit Slip / Cheque / Ref #
            <input
              type="text"
              placeholder="e.g. SLIP-8921 or CHQ-001928"
              className={`${field} mt-1`}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
        </div>

        <label className="block text-xs font-semibold">
          Narration / Business Purpose
          <input
            type="text"
            placeholder="Explain the purpose of this cash transfer…"
            className={`${field} mt-1`}
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            required
            minLength={5}
          />
        </label>

        <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-[11px] text-blue-900 leading-relaxed">
          <b>Authoritative Double-Entry:</b> A balanced Contra Journal Voucher will be created and posted. Bank accounts and Cash in Hand ledgers update in real time.
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} className="bg-emerald-600 hover:bg-emerald-700">
            Post Transfer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
