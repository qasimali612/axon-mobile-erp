"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Banknote, Calculator, CheckCircle2, Download, Plus, Printer, RefreshCw, RotateCcw, SlidersHorizontal, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

type Row = Record<string, any>;
type Permissions = { planManage: boolean; calculate: boolean; approve: boolean; pay: boolean; receivableCreate: boolean; receivableApprove: boolean; receive: boolean; export: boolean };
type Props = { currency: string; currentUserId: string; permissions: Permissions };

const field = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const labelCls = "text-xs font-semibold text-slate-700";
const today = () => new Date().toISOString().slice(0, 10);

const PLAN_TYPES = [
  { value: "PERCENT_NET_SALES", label: "Percentage of net sales" },
  { value: "SALES_TARGET", label: "Percentage above a sales target" },
  { value: "BRANCH_TARGET", label: "Percentage above a branch target" },
  { value: "FIXED_PER_UNIT", label: "Fixed amount per unit sold" },
];
const RECIPIENTS = [
  { value: "USER", label: "Salesperson" },
  { value: "CUSTOMER", label: "Customer" },
  { value: "BRANCH", label: "Branch" },
];

function statusTone(status: string) {
  if (["PAID", "RECEIVED", "ACCRUED"].includes(status)) return "green" as const;
  if (["APPROVED"].includes(status)) return "blue" as const;
  if (["REVERSED", "REJECTED"].includes(status)) return "red" as const;
  if (["CALCULATED", "PARTIALLY_PAID", "PARTIALLY_RECEIVED", "SUBMITTED"].includes(status)) return "amber" as const;
  return "slate" as const;
}

export function IncentiveWorkspace({ currency, currentUserId, permissions }: Props) {
  const [data, setData] = useState<{ plans: Row[]; calculations: Row[]; payables: Row[]; received: Row[] }>({ plans: [], calculations: [], payables: [], received: [] });
  const [lookups, setLookups] = useState<{ branches: Row[]; accounts: Row[]; paymentMethods: Row[]; bankAccounts: Row[]; suppliers: Row[] }>({ branches: [], accounts: [], paymentMethods: [], bankAccounts: [], suppliers: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"plans" | "payable" | "supplier">("payable");
  const [planEditor, setPlanEditor] = useState<Row | "new" | null>(null);
  const [calculateFor, setCalculateFor] = useState<Row | null>(null);
  const [adjustFor, setAdjustFor] = useState<Row | null>(null);
  const [reverseFor, setReverseFor] = useState<Row | null>(null);
  const [payFor, setPayFor] = useState<Row | null>(null);
  const [claimEditor, setClaimEditor] = useState<Row | "new" | null>(null);
  const [claimApproveFor, setClaimApproveFor] = useState<Row | null>(null);
  const [claimReceiveFor, setClaimReceiveFor] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/finance/incentives", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) { toast.error(body?.error?.message || "Incentives could not be loaded."); return; }
    setData(body.data || { plans: [], calculations: [], payables: [], received: [] });
    setLookups(body.lookups || { branches: [], accounts: [], paymentMethods: [], bankAccounts: [], suppliers: [] });
  }, []);
  useEffect(() => { void load(); }, [load]);

  const accounts = (accountClass: string) => lookups.accounts.filter((account) => account.accountClass === accountClass);
  const totals = useMemo(() => {
    const accrued = data.payables.reduce((sum, row) => sum + Number(row.accruedAmount), 0);
    const paid = data.payables.reduce((sum, row) => sum + Number(row.paidAmount), 0);
    const outstanding = data.payables.reduce((sum, row) => sum + Number(row.outstandingAmount), 0);
    const supplierOutstanding = data.received.reduce((sum, row) => sum + Number(row.outstandingAmount), 0);
    return { accrued, paid, outstanding, supplierOutstanding };
  }, [data]);

  async function send(url: string, method: "POST" | "PATCH", payload?: unknown, successMessage?: string) {
    setBusy(true);
    const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload ?? {}) });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) { toast.error(body?.error?.message || "The action could not be completed."); return null; }
    if (successMessage) toast.success(successMessage);
    await load();
    return body?.data ?? {};
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2"><span className="kicker">Performance compensation</span><Badge tone="green">Accrual separated from cash</Badge></div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">Incentives</h1>
          <p className="mt-1.5 text-sm text-slate-500">Effective-dated plans calculated from posted sales, adjusted and approved by an independent officer, accrued to the ledger, then settled separately. Supplier incentives accrue income first and cash second.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {permissions.planManage ? <Button onClick={() => setPlanEditor("new")}><Plus className="h-4 w-4" />New plan</Button> : null}
          {permissions.receivableCreate ? <Button variant="outline" onClick={() => setClaimEditor("new")}><Plus className="h-4 w-4" />Supplier claim</Button> : null}
          <a href="/finance/incentives/print" target="_blank" className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><Printer className="h-4 w-4" />Print</a>
          {permissions.export ? <button type="button" onClick={() => window.location.assign("/api/finance/exports/incentives")} className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-700 hover:bg-blue-100"><Download className="h-4 w-4" />Export CSV</button> : null}
          <Button variant="outline" onClick={() => void load()} loading={loading}><RefreshCw className="h-4 w-4" />Refresh</Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Accrued payable", value: totals.accrued, icon: BadgeCheck },
          { label: "Paid to recipients", value: totals.paid, icon: Banknote },
          { label: "Outstanding payable", value: totals.outstanding, icon: Calculator },
          { label: "Supplier incentive due", value: totals.supplierOutstanding, icon: Users },
        ].map((card) => (
          <div key={card.label} className="surface p-5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-700"><card.icon className="h-4 w-4" /></span>
            <p className="mt-4 text-xl font-bold text-slate-900">{formatMoney(String(card.value), currency)}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {([["payable", `Payable incentives (${data.calculations.length})`], ["plans", `Plans (${data.plans.length})`], ["supplier", `Supplier incentives (${data.received.length})`]] as const).map(([key, text]) => (
          <button key={key} onClick={() => setTab(key)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${tab === key ? "bg-blue-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{text}</button>
        ))}
      </div>

      {tab === "plans" ? (
        <section className="surface mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr><th className="px-5 py-3">Plan</th><th className="px-4 py-3">Recipient</th><th className="px-4 py-3">Rule</th><th className="px-4 py-3">Accounts</th><th className="px-4 py-3 text-right">Calculations</th><th className="px-5 py-3 text-right">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.plans.map((plan) => (
                  <tr key={plan.id} className="text-xs hover:bg-slate-50/60">
                    <td className="px-5 py-3"><span className="font-bold text-slate-800">{plan.code}</span><span className="mt-0.5 block text-[10px] text-slate-500">{plan.name}</span><span className="mt-0.5 block text-[10px] text-slate-400">{formatDate(plan.effectiveFrom)} – {formatDate(plan.effectiveTo)}</span></td>
                    <td className="px-4 py-3 text-slate-600">{titleCase(plan.recipientType)}{plan.branch ? ` · ${plan.branch.code}` : " · company-wide"}</td>
                    <td className="px-4 py-3 text-slate-600">{titleCase(plan.incentiveType)}<span className="mt-0.5 block text-[10px] text-slate-400">{plan.rate ? `${Number(plan.rate)}%` : plan.fixedAmount ? `${formatMoney(String(plan.fixedAmount), currency)} / unit` : "—"} · target {formatMoney(String(plan.minimumTarget), currency)}{plan.maximumIncentive ? ` · cap ${formatMoney(String(plan.maximumIncentive), currency)}` : ""}</span></td>
                    <td className="px-4 py-3 text-[10px] text-slate-500">Dr {plan.expenseAccount.code}<br />Cr {plan.payableAccount.code}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">{plan._count?.calculations ?? 0}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Badge tone={plan.isActive ? "green" : "slate"}>{plan.isActive ? "Active" : "Inactive"}</Badge>
                        {permissions.calculate ? <Button size="sm" variant="outline" onClick={() => setCalculateFor(plan)}><Calculator className="h-3.5 w-3.5" />Calculate</Button> : null}
                        {permissions.planManage ? <Button size="sm" variant="ghost" onClick={() => setPlanEditor(plan)}><SlidersHorizontal className="h-3.5 w-3.5" />Edit</Button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.plans.length ? <div className="py-16 text-center text-xs text-slate-400">No incentive plan has been configured.</div> : null}
          </div>
        </section>
      ) : null}

      {tab === "payable" ? (
        <section className="surface mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr><th className="px-5 py-3">Plan / period</th><th className="px-4 py-3">Recipient</th><th className="px-4 py-3 text-right">Net sales</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Calculated</th><th className="px-4 py-3 text-right">Adjustment</th><th className="px-4 py-3 text-right">Approved</th><th className="px-4 py-3 text-right">Outstanding</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.calculations.map((row) => {
                  const payable = row.payable;
                  const outstanding = payable ? Number(payable.outstandingAmount) : 0;
                  const isMaker = row.calculatedById === currentUserId;
                  return (
                    <tr key={row.id} className="text-xs hover:bg-slate-50/60">
                      <td className="px-5 py-3"><span className="font-bold text-slate-800">{row.plan.code}</span><span className="mt-0.5 block text-[10px] text-slate-400">{formatDate(row.periodStart)} – {formatDate(row.periodEnd)}{row.branch ? ` · ${row.branch.code}` : ""}</span></td>
                      <td className="px-4 py-3 text-slate-600">{row.recipientUser?.fullName || row.recipientCustomer?.name || row.recipientName || "—"}<span className="mt-0.5 block text-[10px] text-slate-400">{titleCase(row.recipientType)}</span></td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">{formatMoney(String(row.eligibleNetSales), currency)}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-500">{Number(row.eligibleQuantity)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatMoney(String(row.calculatedAmount), currency)}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-500">{Number(row.adjustmentAmount) === 0 ? "—" : formatMoney(String(row.adjustmentAmount), currency)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatMoney(String(row.approvedAmount), currency)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">{payable ? formatMoney(String(payable.outstandingAmount), currency) : "—"}</td>
                      <td className="px-4 py-3"><Badge tone={statusTone(row.status)}>{titleCase(row.status)}</Badge>{row.calculationDetails?.ineligibilityReason ? <span className="mt-1 block text-[9px] font-semibold text-amber-700">{titleCase(row.calculationDetails.ineligibilityReason)}</span> : null}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {permissions.calculate && row.status === "CALCULATED" ? <Button size="sm" variant="ghost" onClick={() => setAdjustFor(row)}>Adjust</Button> : null}
                          {permissions.approve && ["CALCULATED", "SUBMITTED"].includes(row.status) && !isMaker ? <Button size="sm" variant="outline" onClick={() => void send(`/api/finance/incentives/calculations/${row.id}/approve`, "POST", {}, "Incentive approved.")}><CheckCircle2 className="h-3.5 w-3.5" />Approve</Button> : null}
                          {permissions.approve && ["CALCULATED", "SUBMITTED"].includes(row.status) && isMaker ? <span className="text-[10px] font-semibold text-amber-700">Awaiting independent approval</span> : null}
                          {permissions.approve && row.status === "APPROVED" ? <Button size="sm" variant="outline" onClick={() => void send(`/api/finance/incentives/calculations/${row.id}/accrue`, "POST", {}, "Incentive accrued to the ledger.")}><BadgeCheck className="h-3.5 w-3.5" />Accrue</Button> : null}
                          {permissions.pay && payable && outstanding > 0 ? <Button size="sm" onClick={() => setPayFor(row)}><Banknote className="h-3.5 w-3.5" />Pay</Button> : null}
                          {permissions.approve && row.status === "ACCRUED" && payable && (payable.payments?.length ?? 0) === 0 ? <Button size="sm" variant="ghost" onClick={() => setReverseFor(row)}><RotateCcw className="h-3.5 w-3.5" />Reverse</Button> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!data.calculations.length ? <div className="py-16 text-center text-xs text-slate-400">No incentive has been calculated yet. Use <span className="font-semibold">Calculate</span> on a plan to read posted sales for a period.</div> : null}
          </div>
        </section>
      ) : null}

      {tab === "supplier" ? (
        <section className="surface mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr><th className="px-5 py-3">Claim</th><th className="px-4 py-3">Payer / period</th><th className="px-4 py-3 text-right">Eligible</th><th className="px-4 py-3 text-right">Approved</th><th className="px-4 py-3 text-right">Received</th><th className="px-4 py-3 text-right">Outstanding</th><th className="px-4 py-3">Prepared / approved</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.received.map((claim) => (
                  <tr key={claim.id} className="text-xs hover:bg-slate-50/60">
                    <td className="px-5 py-3"><span className="font-bold text-slate-800">{claim.referenceNumber}</span><span className="mt-0.5 block text-[10px] text-slate-400">{claim.programName}</span></td>
                    <td className="px-4 py-3 text-slate-600">{claim.payerName}<span className="mt-0.5 block text-[10px] text-slate-400">{formatDate(claim.periodStart)} – {formatDate(claim.periodEnd)}</span></td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">{formatMoney(String(claim.eligibleAmount), currency)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatMoney(String(claim.approvedAmount), currency)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatMoney(String(claim.receivedAmount), currency)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">{formatMoney(String(claim.outstandingAmount), currency)}</td>
                    <td className="px-4 py-3 text-[10px] text-slate-500">{claim.preparedBy?.fullName ?? "—"}<span className="mt-0.5 block text-slate-400">{claim.approvedBy?.fullName ?? "not approved"}</span></td>
                    <td className="px-4 py-3"><Badge tone={statusTone(claim.status)}>{titleCase(claim.status)}</Badge></td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {permissions.receivableApprove && ["DRAFT", "SUBMITTED"].includes(claim.status) && claim.preparedById !== currentUserId ? <Button size="sm" variant="outline" onClick={() => setClaimApproveFor(claim)}><CheckCircle2 className="h-3.5 w-3.5" />Approve</Button> : null}
                        {permissions.receivableApprove && ["DRAFT", "SUBMITTED"].includes(claim.status) && claim.preparedById === currentUserId ? <span className="text-[10px] font-semibold text-amber-700">Awaiting independent approval</span> : null}
                        {permissions.receive && ["ACCRUED", "PARTIALLY_RECEIVED"].includes(claim.status) ? <Button size="sm" onClick={() => setClaimReceiveFor(claim)}><Banknote className="h-3.5 w-3.5" />Receive</Button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.received.length ? <div className="py-16 text-center text-xs text-slate-400">No supplier incentive claim recorded.</div> : null}
          </div>
        </section>
      ) : null}

      {planEditor ? <PlanEditor plan={planEditor === "new" ? null : planEditor} branches={lookups.branches} expenseAccounts={accounts("EXPENSE")} payableAccounts={accounts("LIABILITY")} busy={busy} onClose={() => setPlanEditor(null)} onSave={async (payload) => { const result = await send(planEditor === "new" ? "/api/finance/incentives/plans" : `/api/finance/incentives/plans/${(planEditor as Row).id}`, planEditor === "new" ? "POST" : "PATCH", payload, "Incentive plan saved."); if (result) setPlanEditor(null); }} /> : null}

      {calculateFor ? <CalculateModal plan={calculateFor} branches={lookups.branches} busy={busy} onClose={() => setCalculateFor(null)} onSubmit={async (payload) => { const result = await send(`/api/finance/incentives/plans/${calculateFor.id}/calculate`, "POST", payload); if (result) { toast.success(`${result.created ?? 0} incentive${(result.created ?? 0) === 1 ? "" : "s"} calculated${result.skipped ? ` · ${result.skipped} already existed` : ""}.`); setCalculateFor(null); } }} /> : null}

      {adjustFor ? <AdjustModal row={adjustFor} currency={currency} busy={busy} onClose={() => setAdjustFor(null)} onSubmit={async (payload) => { const result = await send(`/api/finance/incentives/calculations/${adjustFor.id}/adjust`, "POST", payload, "Adjustment saved."); if (result) setAdjustFor(null); }} /> : null}

      {reverseFor ? <ReverseModal row={reverseFor} currency={currency} busy={busy} onClose={() => setReverseFor(null)} onSubmit={async (payload) => { const result = await send(`/api/finance/incentives/calculations/${reverseFor.id}/reverse`, "POST", payload, "Accrual reversed."); if (result) setReverseFor(null); }} /> : null}

      {payFor ? <PaymentModal title="Pay incentive" amountLabel="Amount to pay" max={Number(payFor.payable.outstandingAmount)} currency={currency} methods={lookups.paymentMethods} bankAccounts={lookups.bankAccounts} busy={busy} onClose={() => setPayFor(null)} onSubmit={async (payload) => { const result = await send(`/api/finance/incentives/payables/${payFor.payable.id}/pay`, "POST", payload, "Payment recorded and posted."); if (result) setPayFor(null); }} /> : null}

      {claimEditor ? <ClaimEditor suppliers={lookups.suppliers} incomeAccounts={accounts("REVENUE")} receivableAccounts={accounts("ASSET")} currency={currency} busy={busy} onClose={() => setClaimEditor(null)} onSave={async (payload) => { const result = await send("/api/finance/incentives/received", "POST", payload, "Supplier incentive claim created."); if (result) setClaimEditor(null); }} /> : null}

      {claimApproveFor ? <ClaimApproveModal claim={claimApproveFor} branches={lookups.branches} busy={busy} onClose={() => setClaimApproveFor(null)} onSubmit={async (payload) => { const result = await send(`/api/finance/incentives/received/${claimApproveFor.id}/approve`, "POST", payload, "Supplier incentive accrued."); if (result) setClaimApproveFor(null); }} /> : null}

      {claimReceiveFor ? <PaymentModal title="Receive supplier incentive" amountLabel="Amount received" max={Number(claimReceiveFor.outstandingAmount)} currency={currency} methods={lookups.paymentMethods} bankAccounts={lookups.bankAccounts} busy={busy} onClose={() => setClaimReceiveFor(null)} onSubmit={async (payload) => { const result = await send(`/api/finance/incentives/received/${claimReceiveFor.id}/receive`, "POST", payload, "Receipt recorded and posted."); if (result) setClaimReceiveFor(null); }} /> : null}
    </div>
  );
}

function PlanEditor({ plan, branches, expenseAccounts, payableAccounts, busy, onClose, onSave }: { plan: Row | null; branches: Row[]; expenseAccounts: Row[]; payableAccounts: Row[]; busy: boolean; onClose: () => void; onSave: (payload: Row) => Promise<void> }) {
  const [form, setForm] = useState<Row>({
    code: plan?.code ?? "",
    name: plan?.name ?? "",
    effectiveFrom: plan?.effectiveFrom ? String(plan.effectiveFrom).slice(0, 10) : today(),
    effectiveTo: plan?.effectiveTo ? String(plan.effectiveTo).slice(0, 10) : today(),
    recipientType: plan?.recipientType ?? "USER",
    branchId: plan?.branchId ?? "",
    incentiveType: plan?.incentiveType ?? "PERCENT_NET_SALES",
    rate: plan?.rate ?? "1",
    fixedAmount: plan?.fixedAmount ?? "",
    minimumTarget: plan?.minimumTarget ?? "0",
    maximumIncentive: plan?.maximumIncentive ?? "",
    returnAdjustmentRule: plan?.returnAdjustmentRule ?? "REVERSE",
    approvalRequired: plan?.approvalRequired ?? true,
    expenseAccountId: plan?.expenseAccountId ?? "",
    payableAccountId: plan?.payableAccountId ?? "",
    isActive: plan?.isActive ?? true,
  });
  const percentage = ["PERCENT_NET_SALES", "SALES_TARGET", "BRANCH_TARGET"].includes(form.incentiveType);
  return (
    <Modal open title={plan ? `Edit ${plan.code}` : "New incentive plan"} onClose={onClose}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event: FormEvent) => { event.preventDefault(); void onSave({ ...form, branchId: form.branchId || null, rate: percentage ? form.rate : null, fixedAmount: percentage ? null : form.fixedAmount, maximumIncentive: form.maximumIncentive || null }); }}>
        <label className={labelCls}>Code<input className={field} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required disabled={Boolean(plan)} /></label>
        <label className={labelCls}>Name<input className={field} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required minLength={2} /></label>
        <label className={labelCls}>Effective from<input type="date" className={field} value={form.effectiveFrom} onChange={(event) => setForm({ ...form, effectiveFrom: event.target.value })} required /></label>
        <label className={labelCls}>Effective to<input type="date" className={field} value={form.effectiveTo} onChange={(event) => setForm({ ...form, effectiveTo: event.target.value })} required /></label>
        <label className={labelCls}>Recipient<select className={field} value={form.recipientType} onChange={(event) => setForm({ ...form, recipientType: event.target.value })}>{RECIPIENTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className={labelCls}>Branch scope<select className={field} value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value })}><option value="">Company-wide</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}</select></label>
        <label className={labelCls}>Calculation rule<select className={field} value={form.incentiveType} onChange={(event) => setForm({ ...form, incentiveType: event.target.value })}>{PLAN_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        {percentage
          ? <label className={labelCls}>Rate %<input className={field} inputMode="decimal" value={form.rate ?? ""} onChange={(event) => setForm({ ...form, rate: event.target.value })} required /></label>
          : <label className={labelCls}>Amount per unit<input className={field} inputMode="decimal" value={form.fixedAmount ?? ""} onChange={(event) => setForm({ ...form, fixedAmount: event.target.value })} required /></label>}
        <label className={labelCls}>{form.incentiveType === "FIXED_PER_UNIT" ? "Minimum quantity" : "Minimum net sales"}<input className={field} inputMode="decimal" value={form.minimumTarget} onChange={(event) => setForm({ ...form, minimumTarget: event.target.value })} /></label>
        <label className={labelCls}>Maximum incentive<input className={field} inputMode="decimal" value={form.maximumIncentive ?? ""} onChange={(event) => setForm({ ...form, maximumIncentive: event.target.value })} placeholder="No cap" /></label>
        <label className={labelCls}>Sales returns<select className={field} value={form.returnAdjustmentRule} onChange={(event) => setForm({ ...form, returnAdjustmentRule: event.target.value })}><option value="REVERSE">Deduct posted returns</option><option value="IGNORE">Ignore returns</option></select></label>
        <label className={labelCls}>Expense account<select className={field} value={form.expenseAccountId} onChange={(event) => setForm({ ...form, expenseAccountId: event.target.value })} required><option value="">Select account…</option>{expenseAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
        <label className={labelCls}>Payable account<select className={field} value={form.payableAccountId} onChange={(event) => setForm({ ...form, payableAccountId: event.target.value })} required><option value="">Select account…</option>{payableAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
        <div className="flex items-center gap-5 sm:col-span-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={form.approvalRequired} onChange={(event) => setForm({ ...form, approvalRequired: event.target.checked })} />Independent approval required</label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />Active</label>
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Save plan</Button></div>
      </form>
    </Modal>
  );
}

function CalculateModal({ plan, branches, busy, onClose, onSubmit }: { plan: Row; branches: Row[]; busy: boolean; onClose: () => void; onSubmit: (payload: Row) => Promise<void> }) {
  const [form, setForm] = useState<Row>({ periodStart: String(plan.effectiveFrom).slice(0, 10), periodEnd: today(), branchId: plan.branchId ?? "" });
  return (
    <Modal open title={`Calculate ${plan.code}`} onClose={onClose}>
      <form className="grid gap-3" onSubmit={(event: FormEvent) => { event.preventDefault(); void onSubmit({ ...form, branchId: form.branchId || null }); }}>
        <p className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">Eligibility is read from posted sales invoices in the period, net of posted sales returns. Each recipient and branch combination is calculated once for the period; re-running the same period skips existing rows.</p>
        <label className={labelCls}>Period start<input type="date" className={field} value={form.periodStart} onChange={(event) => setForm({ ...form, periodStart: event.target.value })} required min={String(plan.effectiveFrom).slice(0, 10)} max={String(plan.effectiveTo).slice(0, 10)} /></label>
        <label className={labelCls}>Period end<input type="date" className={field} value={form.periodEnd} onChange={(event) => setForm({ ...form, periodEnd: event.target.value })} required min={String(plan.effectiveFrom).slice(0, 10)} max={String(plan.effectiveTo).slice(0, 10)} /></label>
        <label className={labelCls}>Branch<select className={field} value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value })} disabled={Boolean(plan.branchId)}><option value="">All permitted branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}</select></label>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Run calculation</Button></div>
      </form>
    </Modal>
  );
}

function AdjustModal({ row, currency, busy, onClose, onSubmit }: { row: Row; currency: string; busy: boolean; onClose: () => void; onSubmit: (payload: Row) => Promise<void> }) {
  const [form, setForm] = useState<Row>({ adjustmentAmount: "0", reason: "" });
  return (
    <Modal open title="Adjust calculated incentive" onClose={onClose}>
      <form className="grid gap-3" onSubmit={(event: FormEvent) => { event.preventDefault(); void onSubmit(form); }}>
        <p className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">Calculated {formatMoney(String(row.calculatedAmount), currency)}. A positive or negative adjustment is recorded with its reason before independent approval.</p>
        <label className={labelCls}>Adjustment<input className={field} inputMode="decimal" value={form.adjustmentAmount} onChange={(event) => setForm({ ...form, adjustmentAmount: event.target.value })} required /></label>
        <label className={labelCls}>Reason<input className={field} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} required minLength={5} /></label>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Save adjustment</Button></div>
      </form>
    </Modal>
  );
}

function ReverseModal({ row, currency, busy, onClose, onSubmit }: { row: Row; currency: string; busy: boolean; onClose: () => void; onSubmit: (payload: Row) => Promise<void> }) {
  const [reason, setReason] = useState("");
  return (
    <Modal open title="Reverse incentive accrual" onClose={onClose}>
      <form className="grid gap-3" onSubmit={(event: FormEvent) => { event.preventDefault(); void onSubmit({ reason }); }}>
        <p className="rounded-lg bg-amber-50 p-3 text-[11px] text-amber-800">This posts a reversing journal for {formatMoney(String(row.approvedAmount), currency)} against the original accrual. Reversal is only allowed while no payment exists.</p>
        <label className={labelCls}>Reason<input className={field} value={reason} onChange={(event) => setReason(event.target.value)} required minLength={5} /></label>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Reverse accrual</Button></div>
      </form>
    </Modal>
  );
}

function PaymentModal({ title, amountLabel, max, currency, methods, bankAccounts, busy, onClose, onSubmit }: { title: string; amountLabel: string; max: number; currency: string; methods: Row[]; bankAccounts: Row[]; busy: boolean; onClose: () => void; onSubmit: (payload: Row) => Promise<void> }) {
  const [form, setForm] = useState<Row>({ amount: max.toFixed(4), paymentMethodId: methods[0]?.id ?? "", bankAccountId: "", reference: "" });
  const method = methods.find((candidate) => candidate.id === form.paymentMethodId);
  const needsBank = method && method.methodType !== "CASH";
  const banks = method?.bankAccountId ? bankAccounts.filter((bank) => bank.id === method.bankAccountId) : bankAccounts;
  return (
    <Modal open title={title} onClose={onClose}>
      <form className="grid gap-3" onSubmit={(event: FormEvent) => { event.preventDefault(); void onSubmit({ ...form, bankAccountId: needsBank ? form.bankAccountId || null : null, reference: form.reference || null }); }}>
        <p className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">Outstanding balance {formatMoney(String(max), currency)}. Settlement posts a balanced journal against the payable or receivable already recognised.</p>
        <label className={labelCls}>{amountLabel}<input className={field} inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /></label>
        <label className={labelCls}>Payment method<select className={field} value={form.paymentMethodId} onChange={(event) => setForm({ ...form, paymentMethodId: event.target.value })} required>{methods.map((option) => <option key={option.id} value={option.id}>{option.code} · {option.name}</option>)}</select></label>
        {needsBank ? <label className={labelCls}>Bank account<select className={field} value={form.bankAccountId} onChange={(event) => setForm({ ...form, bankAccountId: event.target.value })} required={needsBank && !method?.bankAccountId} disabled={Boolean(method?.bankAccountId)}><option value="">Select bank…</option>{banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.code} · {bank.bankName}</option>)}</select></label> : null}
        <label className={labelCls}>Reference<input className={field} value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} placeholder={method?.requiresReference ? "Required by this method" : "Optional"} /></label>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Record</Button></div>
      </form>
    </Modal>
  );
}

function ClaimEditor({ suppliers, incomeAccounts, receivableAccounts, currency, busy, onClose, onSave }: { suppliers: Row[]; incomeAccounts: Row[]; receivableAccounts: Row[]; currency: string; busy: boolean; onClose: () => void; onSave: (payload: Row) => Promise<void> }) {
  const [form, setForm] = useState<Row>({ referenceNumber: "", payerName: "", programName: "", supplierId: "", periodStart: today(), periodEnd: today(), targetQuantity: "0", achievedQuantity: "0", eligibleAmount: "", expectedReceiptDate: "", incomeAccountId: "", receivableAccountId: "" });
  return (
    <Modal open title="New supplier incentive claim" onClose={onClose}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event: FormEvent) => { event.preventDefault(); void onSave({ ...form, supplierId: form.supplierId || null, planId: null, expectedReceiptDate: form.expectedReceiptDate || null }); }}>
        <p className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600 sm:col-span-2">Supplier claims are recorded as a receivable and income when approved, then settled in cash. Amounts are in {currency}.</p>
        <label className={labelCls}>Reference<input className={field} value={form.referenceNumber} onChange={(event) => setForm({ ...form, referenceNumber: event.target.value })} required maxLength={60} /></label>
        <label className={labelCls}>Payer name<input className={field} value={form.payerName} onChange={(event) => setForm({ ...form, payerName: event.target.value })} required minLength={2} /></label>
        <label className={labelCls}>Program<input className={field} value={form.programName} onChange={(event) => setForm({ ...form, programName: event.target.value })} required minLength={2} /></label>
        <label className={labelCls}>Supplier<select className={field} value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}><option value="">Not linked</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} · {supplier.name}</option>)}</select></label>
        <label className={labelCls}>Period start<input type="date" className={field} value={form.periodStart} onChange={(event) => setForm({ ...form, periodStart: event.target.value })} required /></label>
        <label className={labelCls}>Period end<input type="date" className={field} value={form.periodEnd} onChange={(event) => setForm({ ...form, periodEnd: event.target.value })} required /></label>
        <label className={labelCls}>Target quantity<input className={field} inputMode="decimal" value={form.targetQuantity} onChange={(event) => setForm({ ...form, targetQuantity: event.target.value })} /></label>
        <label className={labelCls}>Achieved quantity<input className={field} inputMode="decimal" value={form.achievedQuantity} onChange={(event) => setForm({ ...form, achievedQuantity: event.target.value })} /></label>
        <label className={labelCls}>Eligible amount<input className={field} inputMode="decimal" value={form.eligibleAmount} onChange={(event) => setForm({ ...form, eligibleAmount: event.target.value })} required /></label>
        <label className={labelCls}>Expected receipt<input type="date" className={field} value={form.expectedReceiptDate} onChange={(event) => setForm({ ...form, expectedReceiptDate: event.target.value })} /></label>
        <label className={labelCls}>Income account<select className={field} value={form.incomeAccountId} onChange={(event) => setForm({ ...form, incomeAccountId: event.target.value })} required><option value="">Select account…</option>{incomeAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
        <label className={labelCls}>Receivable account<select className={field} value={form.receivableAccountId} onChange={(event) => setForm({ ...form, receivableAccountId: event.target.value })} required><option value="">Select account…</option>{receivableAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Create claim</Button></div>
      </form>
    </Modal>
  );
}

function ClaimApproveModal({ claim, branches, busy, onClose, onSubmit }: { claim: Row; branches: Row[]; busy: boolean; onClose: () => void; onSubmit: (payload: Row) => Promise<void> }) {
  const [form, setForm] = useState<Row>({ branchId: branches[0]?.id ?? "", postingDate: today() });
  return (
    <Modal open title={`Approve ${claim.referenceNumber}`} onClose={onClose}>
      <form className="grid gap-3" onSubmit={(event: FormEvent) => { event.preventDefault(); void onSubmit(form); }}>
        <p className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">Approval accrues the receivable and income in one balanced journal. The preparing user cannot approve their own claim.</p>
        <label className={labelCls}>Accrual branch<select className={field} value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value })} required><option value="">Select branch…</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}</select></label>
        <label className={labelCls}>Posting date<input type="date" className={field} value={form.postingDate} onChange={(event) => setForm({ ...form, postingDate: event.target.value })} required /></label>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Approve and accrue</Button></div>
      </form>
    </Modal>
  );
}
