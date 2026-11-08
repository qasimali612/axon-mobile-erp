"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, BadgeCheck, Banknote, Calculator, CheckCircle2, Download, Plus, Printer, RefreshCw, SlidersHorizontal, Tags } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

type Row = Record<string, any>;
type Permissions = { manage: boolean; approve: boolean; pay: boolean; receive: boolean; export: boolean };
type Props = { currency: string; currentUserId: string; permissions: Permissions };

const field = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const labelCls = "text-xs font-semibold text-slate-700";
const today = () => new Date().toISOString().slice(0, 10);

const METHODS = [
  { value: "PERCENT_OF_VALUE", label: "Percentage of eligible value" },
  { value: "PER_UNIT", label: "Fixed amount per unit" },
  { value: "FIXED_AMOUNT", label: "Fixed amount per period" },
];

function statusTone(status: string) {
  if (["SETTLED", "ACCRUED"].includes(status)) return "green" as const;
  if (["APPROVED"].includes(status)) return "blue" as const;
  if (["REVERSED", "REJECTED"].includes(status)) return "red" as const;
  if (["CALCULATED", "PARTIALLY_SETTLED"].includes(status)) return "amber" as const;
  return "slate" as const;
}

export function RebateWorkspace({ currency, currentUserId, permissions }: Props) {
  const [data, setData] = useState<{ programs: Row[]; calculations: Row[] }>({ programs: [], calculations: [] });
  const [lookups, setLookups] = useState<{ suppliers: Row[]; customers: Row[]; accounts: Row[]; paymentMethods: Row[]; bankAccounts: Row[] }>({ suppliers: [], customers: [], accounts: [], paymentMethods: [], bankAccounts: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"calculations" | "programs">("calculations");
  const [programEditor, setProgramEditor] = useState<Row | "new" | null>(null);
  const [calculateFor, setCalculateFor] = useState<Row | null>(null);
  const [settleFor, setSettleFor] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/finance/rebates", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) { toast.error(body?.error?.message || "Rebates could not be loaded."); return; }
    setData(body.data || { programs: [], calculations: [] });
    setLookups(body.lookups || { suppliers: [], customers: [], accounts: [], paymentMethods: [], bankAccounts: [] });
  }, []);
  useEffect(() => { void load(); }, [load]);

  const accounts = (accountClass: string) => lookups.accounts.filter((account) => account.accountClass === accountClass);
  const totals = useMemo(() => ({
    receivableOutstanding: data.calculations.filter((row) => row.program?.direction === "RECEIVABLE").reduce((sum, row) => sum + Number(row.outstandingAmount), 0),
    payableOutstanding: data.calculations.filter((row) => row.program?.direction === "PAYABLE").reduce((sum, row) => sum + Number(row.outstandingAmount), 0),
    accrued: data.calculations.filter((row) => ["ACCRUED", "PARTIALLY_SETTLED"].includes(row.status)).reduce((sum, row) => sum + Number(row.approvedAmount), 0),
    settled: data.calculations.reduce((sum, row) => sum + Number(row.settledAmount), 0),
  }), [data]);

  async function act(url: string, payload: unknown, message: string) {
    setBusy(true);
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload ?? {}) });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) { toast.error(body?.error?.message || "The action could not be completed."); return null; }
    toast.success(message);
    await load();
    return body?.data ?? {};
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2"><span className="kicker">Trade programs</span><Badge tone="green">Accrual separated from cash</Badge></div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">Rebates</h1>
          <p className="mt-1.5 text-sm text-slate-500">Supplier rebates accrued from posted goods receipts and customer rebates accrued from posted sales, each approved by an independent officer, posted to the ledger and settled separately.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {permissions.manage ? <Button onClick={() => setProgramEditor("new")}><Plus className="h-4 w-4" />New program</Button> : null}
          <a href="/finance/rebates/print" target="_blank" className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><Printer className="h-4 w-4" />Print</a>
          {permissions.export ? <button type="button" onClick={() => window.location.assign("/api/finance/exports/rebates")} className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-700 hover:bg-blue-100"><Download className="h-4 w-4" />Export CSV</button> : null}
          <Button variant="outline" onClick={() => void load()} loading={loading}><RefreshCw className="h-4 w-4" />Refresh</Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Supplier rebate receivable", value: totals.receivableOutstanding, icon: ArrowDownLeft },
          { label: "Customer rebate payable", value: totals.payableOutstanding, icon: ArrowUpRight },
          { label: "Accrued but unsettled", value: totals.accrued, icon: BadgeCheck },
          { label: "Settled to date", value: totals.settled, icon: Banknote },
        ].map((card) => (
          <div key={card.label} className="surface p-5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-700"><card.icon className="h-4 w-4" /></span>
            <p className="mt-4 text-xl font-bold text-slate-900">{formatMoney(String(card.value), currency)}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {([["calculations", `Rebate calculations (${data.calculations.length})`], ["programs", `Programs (${data.programs.length})`]] as const).map(([key, text]) => (
          <button key={key} onClick={() => setTab(key)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${tab === key ? "bg-blue-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{text}</button>
        ))}
      </div>

      {tab === "programs" ? (
        <section className="surface mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr><th className="px-5 py-3">Program</th><th className="px-4 py-3">Direction</th><th className="px-4 py-3">Party</th><th className="px-4 py-3">Rule</th><th className="px-4 py-3">Accounts</th><th className="px-4 py-3 text-right">Calculations</th><th className="px-5 py-3 text-right">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.programs.map((program) => (
                  <tr key={program.id} className="text-xs hover:bg-slate-50/60">
                    <td className="px-5 py-3"><span className="font-bold text-slate-800">{program.code}</span><span className="mt-0.5 block text-[10px] text-slate-500">{program.name}</span><span className="mt-0.5 block text-[10px] text-slate-400">{formatDate(program.effectiveFrom)} – {formatDate(program.effectiveTo)}</span></td>
                    <td className="px-4 py-3"><Badge tone={program.direction === "RECEIVABLE" ? "green" : "amber"}>{titleCase(program.direction)}</Badge></td>
                    <td className="px-4 py-3 text-slate-600">{program.supplier ? `${program.supplier.code} · ${program.supplier.name}` : program.customer ? `${program.customer.code} · ${program.customer.name}` : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{titleCase(program.calculationMethod)}<span className="mt-0.5 block text-[10px] text-slate-400">{program.rate ? `${Number(program.rate)}% of value` : program.fixedAmount ? `${formatMoney(String(program.fixedAmount), currency)}` : "—"} · {program.accountingTreatment}</span></td>
                    <td className="px-4 py-3 text-[10px] text-slate-500">{program.primaryAccount.code}<br />{program.settlementAccount.code}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">{program._count?.calculations ?? 0}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Badge tone={program.isActive ? "green" : "slate"}>{program.isActive ? "Active" : "Inactive"}</Badge>
                        {permissions.manage ? <Button size="sm" variant="outline" onClick={() => setCalculateFor(program)}><Calculator className="h-3.5 w-3.5" />Calculate</Button> : null}
                        {permissions.manage ? <Button size="sm" variant="ghost" onClick={() => setProgramEditor(program)}><SlidersHorizontal className="h-3.5 w-3.5" />Edit</Button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.programs.length ? <div className="py-16 text-center text-xs text-slate-400"><Tags className="mx-auto mb-2 h-5 w-5" />No rebate program has been configured.</div> : null}
          </div>
        </section>
      ) : null}

      {tab === "calculations" ? (
        <section className="surface mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr><th className="px-5 py-3">Reference / program</th><th className="px-4 py-3">Party / period</th><th className="px-4 py-3 text-right">Eligible value</th><th className="px-4 py-3 text-right">Calculated</th><th className="px-4 py-3 text-right">Approved</th><th className="px-4 py-3 text-right">Settled</th><th className="px-4 py-3 text-right">Outstanding</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.calculations.map((row) => {
                  const isMaker = row.calculatedById === currentUserId;
                  const direction = row.program?.direction;
                  const canSettle = direction === "RECEIVABLE" ? permissions.receive : permissions.pay;
                  return (
                    <tr key={row.id} className="text-xs hover:bg-slate-50/60">
                      <td className="px-5 py-3"><span className="font-bold text-slate-800">{row.referenceNumber}</span><span className="mt-0.5 block text-[10px] text-slate-400">{row.program.code} · {titleCase(direction ?? "")}</span></td>
                      <td className="px-4 py-3 text-slate-600">{row.supplier?.name ?? row.customer?.name ?? "—"}<span className="mt-0.5 block text-[10px] text-slate-400">{formatDate(row.periodStart)} – {formatDate(row.periodEnd)}</span></td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">{formatMoney(String(row.eligibleValue), currency)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatMoney(String(row.calculatedAmount), currency)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatMoney(String(row.approvedAmount), currency)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">{formatMoney(String(row.settledAmount), currency)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">{formatMoney(String(row.outstandingAmount), currency)}</td>
                      <td className="px-4 py-3"><Badge tone={statusTone(row.status)}>{titleCase(row.status)}</Badge></td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {permissions.approve && row.status === "CALCULATED" && !isMaker ? <Button size="sm" variant="outline" onClick={() => void act(`/api/finance/rebates/calculations/${row.id}/approve`, {}, "Rebate approved.")}><CheckCircle2 className="h-3.5 w-3.5" />Approve</Button> : null}
                          {permissions.approve && row.status === "CALCULATED" && isMaker ? <span className="text-[10px] font-semibold text-amber-700">Awaiting independent approval</span> : null}
                          {permissions.approve && row.status === "APPROVED" ? <Button size="sm" variant="outline" onClick={() => void act(`/api/finance/rebates/calculations/${row.id}/accrue`, { postingDate: today() }, "Rebate accrued to the ledger.")}><BadgeCheck className="h-3.5 w-3.5" />Accrue</Button> : null}
                          {canSettle && ["ACCRUED", "PARTIALLY_SETTLED"].includes(row.status) && Number(row.outstandingAmount) > 0 ? <Button size="sm" onClick={() => setSettleFor(row)}><Banknote className="h-3.5 w-3.5" />{direction === "RECEIVABLE" ? "Receive" : "Pay"}</Button> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!data.calculations.length ? <div className="py-16 text-center text-xs text-slate-400">No rebate calculation recorded. Use <span className="font-semibold">Calculate</span> on a program.</div> : null}
          </div>
        </section>
      ) : null}

      {programEditor ? <ProgramEditor program={programEditor === "new" ? null : programEditor} suppliers={lookups.suppliers} customers={lookups.customers} revenueAccounts={accounts("REVENUE")} expenseAccounts={accounts("EXPENSE")} assetAccounts={accounts("ASSET")} liabilityAccounts={accounts("LIABILITY")} busy={busy} onClose={() => setProgramEditor(null)} onSave={async (payload) => {
        const response = await fetch(programEditor === "new" ? "/api/finance/rebates/programs" : `/api/finance/rebates/programs/${(programEditor as Row).id}`, { method: programEditor === "new" ? "POST" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        const body = await response.json().catch(() => null);
        if (!response.ok) { toast.error(body?.error?.message || "The program could not be saved."); return; }
        toast.success("Rebate program saved.");
        setProgramEditor(null);
        await load();
      }} /> : null}

      {calculateFor ? <CalculateModal program={calculateFor} busy={busy} onClose={() => setCalculateFor(null)} onSubmit={async (payload) => {
        const response = await fetch(`/api/finance/rebates/programs/${calculateFor.id}/calculate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        const body = await response.json().catch(() => null);
        if (!response.ok) { toast.error(body?.error?.message || "The rebate could not be calculated."); return; }
        toast.success(`Rebate calculated at ${formatMoney(String(body.data.calculatedAmount), currency)}.`);
        setCalculateFor(null);
        setTab("calculations");
        await load();
      }} /> : null}

      {settleFor ? <SettleModal row={settleFor} currency={currency} methods={lookups.paymentMethods} bankAccounts={lookups.bankAccounts} busy={busy} onClose={() => setSettleFor(null)} onSubmit={async (payload) => {
        const response = await fetch(`/api/finance/rebates/calculations/${settleFor.id}/settle`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        const body = await response.json().catch(() => null);
        if (!response.ok) { toast.error(body?.error?.message || "The settlement could not be recorded."); return; }
        toast.success(settleFor.program?.direction === "RECEIVABLE" ? "Rebate receipt recorded." : "Rebate payment recorded.");
        setSettleFor(null);
        await load();
      }} /> : null}
    </div>
  );
}

function ProgramEditor({ program, suppliers, customers, revenueAccounts, expenseAccounts, assetAccounts, liabilityAccounts, busy, onClose, onSave }: { program: Row | null; suppliers: Row[]; customers: Row[]; revenueAccounts: Row[]; expenseAccounts: Row[]; assetAccounts: Row[]; liabilityAccounts: Row[]; busy: boolean; onClose: () => void; onSave: (payload: Row) => Promise<void> }) {
  const [form, setForm] = useState<Row>({
    code: program?.code ?? "",
    name: program?.name ?? "",
    direction: program?.direction ?? "RECEIVABLE",
    supplierId: program?.supplierId ?? "",
    customerId: program?.customerId ?? "",
    effectiveFrom: program?.effectiveFrom ? String(program.effectiveFrom).slice(0, 10) : today(),
    effectiveTo: program?.effectiveTo ? String(program.effectiveTo).slice(0, 10) : today(),
    calculationMethod: program?.calculationMethod ?? "PERCENT_OF_VALUE",
    rate: program?.rate ?? "1",
    fixedAmount: program?.fixedAmount ?? "",
    primaryAccountId: program?.primaryAccountId ?? "",
    settlementAccountId: program?.settlementAccountId ?? "",
    accountingTreatment: program?.accountingTreatment ?? "INCOME",
    isActive: program?.isActive ?? true,
  });
  const receivable = form.direction === "RECEIVABLE";
  return (
    <Modal open title={program ? `Edit ${program.code}` : "New rebate program"} onClose={onClose}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event: FormEvent) => { event.preventDefault(); void onSave({ ...form, supplierId: receivable ? form.supplierId || null : null, customerId: receivable ? null : form.customerId || null, rate: form.calculationMethod === "PERCENT_OF_VALUE" ? form.rate : null, fixedAmount: form.calculationMethod === "PERCENT_OF_VALUE" ? null : form.fixedAmount, accountingTreatment: receivable ? "INCOME" : "COST_REDUCTION" }); }}>
        <label className={labelCls}>Code<input className={field} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required disabled={Boolean(program)} /></label>
        <label className={labelCls}>Name<input className={field} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required minLength={2} /></label>
        <label className={labelCls}>Direction<select className={field} value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value, accountingTreatment: event.target.value === "RECEIVABLE" ? "INCOME" : "COST_REDUCTION" })}><option value="RECEIVABLE">Supplier rebate (receivable)</option><option value="PAYABLE">Customer rebate (payable)</option></select></label>
        {receivable
          ? <label className={labelCls}>Supplier<select className={field} value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })} required><option value="">Select supplier…</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} · {supplier.name}</option>)}</select></label>
          : <label className={labelCls}>Customer<select className={field} value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })} required><option value="">Select customer…</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} · {customer.name}</option>)}</select></label>}
        <label className={labelCls}>Effective from<input type="date" className={field} value={form.effectiveFrom} onChange={(event) => setForm({ ...form, effectiveFrom: event.target.value })} required /></label>
        <label className={labelCls}>Effective to<input type="date" className={field} value={form.effectiveTo} onChange={(event) => setForm({ ...form, effectiveTo: event.target.value })} required /></label>
        <label className={labelCls}>Calculation method<select className={field} value={form.calculationMethod} onChange={(event) => setForm({ ...form, calculationMethod: event.target.value })}>{METHODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        {form.calculationMethod === "PERCENT_OF_VALUE"
          ? <label className={labelCls}>Rate %<input className={field} inputMode="decimal" value={form.rate ?? ""} onChange={(event) => setForm({ ...form, rate: event.target.value })} required /></label>
          : <label className={labelCls}>{form.calculationMethod === "PER_UNIT" ? "Amount per unit" : "Amount per period"}<input className={field} inputMode="decimal" value={form.fixedAmount ?? ""} onChange={(event) => setForm({ ...form, fixedAmount: event.target.value })} required /></label>}
        <label className={labelCls}>{receivable ? "Income account" : "Rebate expense account"}<select className={field} value={form.primaryAccountId} onChange={(event) => setForm({ ...form, primaryAccountId: event.target.value })} required><option value="">Select account…</option>{(receivable ? revenueAccounts : expenseAccounts).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
        <label className={labelCls}>{receivable ? "Receivable account" : "Payable account"}<select className={field} value={form.settlementAccountId} onChange={(event) => setForm({ ...form, settlementAccountId: event.target.value })} required><option value="">Select account…</option>{(receivable ? assetAccounts : liabilityAccounts).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
        <div className="flex items-center gap-5 sm:col-span-2"><label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />Active</label></div>
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Save program</Button></div>
      </form>
    </Modal>
  );
}

function CalculateModal({ program, busy, onClose, onSubmit }: { program: Row; busy: boolean; onClose: () => void; onSubmit: (payload: Row) => Promise<void> }) {
  const [form, setForm] = useState<Row>({ periodStart: String(program.effectiveFrom).slice(0, 10), periodEnd: today() });
  return (
    <Modal open title={`Calculate ${program.code}`} onClose={onClose}>
      <form className="grid gap-3" onSubmit={(event: FormEvent) => { event.preventDefault(); void onSubmit(form); }}>
        <p className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">Eligibility is read from posted {program.direction === "RECEIVABLE" ? "goods receipts for this supplier" : "sales invoices for this customer"}; one calculation is allowed per program and period.</p>
        <label className={labelCls}>Period start<input type="date" className={field} value={form.periodStart} onChange={(event) => setForm({ ...form, periodStart: event.target.value })} required min={String(program.effectiveFrom).slice(0, 10)} max={String(program.effectiveTo).slice(0, 10)} /></label>
        <label className={labelCls}>Period end<input type="date" className={field} value={form.periodEnd} onChange={(event) => setForm({ ...form, periodEnd: event.target.value })} required min={String(program.effectiveFrom).slice(0, 10)} max={String(program.effectiveTo).slice(0, 10)} /></label>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Run calculation</Button></div>
      </form>
    </Modal>
  );
}

function SettleModal({ row, currency, methods, bankAccounts, busy, onClose, onSubmit }: { row: Row; currency: string; methods: Row[]; bankAccounts: Row[]; busy: boolean; onClose: () => void; onSubmit: (payload: Row) => Promise<void> }) {
  const [form, setForm] = useState<Row>({ amount: Number(row.outstandingAmount).toFixed(4), settlementDate: today(), paymentMethodId: methods[0]?.id ?? "", bankAccountId: "", reference: "" });
  const method = methods.find((candidate) => candidate.id === form.paymentMethodId);
  const needsBank = method && method.methodType !== "CASH";
  const banks = method?.bankAccountId ? bankAccounts.filter((bank) => bank.id === method.bankAccountId) : bankAccounts;
  const receivable = row.program?.direction === "RECEIVABLE";
  return (
    <Modal open title={receivable ? "Receive supplier rebate" : "Pay customer rebate"} onClose={onClose}>
      <form className="grid gap-3" onSubmit={(event: FormEvent) => { event.preventDefault(); void onSubmit({ ...form, bankAccountId: needsBank ? form.bankAccountId || null : null, reference: form.reference || null }); }}>
        <p className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">Outstanding {formatMoney(String(row.outstandingAmount), currency)} on {row.referenceNumber}. The settlement posts against the accrued receivable or payable.</p>
        <label className={labelCls}>Amount<input className={field} inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /></label>
        <label className={labelCls}>Payment method<select className={field} value={form.paymentMethodId} onChange={(event) => setForm({ ...form, paymentMethodId: event.target.value })} required>{methods.map((option) => <option key={option.id} value={option.id}>{option.code} · {option.name}</option>)}</select></label>
        {needsBank ? <label className={labelCls}>Bank account<select className={field} value={form.bankAccountId} onChange={(event) => setForm({ ...form, bankAccountId: event.target.value })} required={needsBank && !method?.bankAccountId} disabled={Boolean(method?.bankAccountId)}><option value="">Select bank…</option>{banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.code} · {bank.bankName}</option>)}</select></label> : null}
        <label className={labelCls}>Reference<input className={field} value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} placeholder={method?.requiresReference ? "Required by this method" : "Optional"} /></label>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Record settlement</Button></div>
      </form>
    </Modal>
  );
}
