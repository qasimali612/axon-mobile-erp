"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  Calculator,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Tags,
  Trash2,
} from "lucide-react";
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
  { value: "PRICE_PROTECTION", label: "Rate Protection (Item-wise Price Drop on Stock)" },
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
  const [lookups, setLookups] = useState<{
    suppliers: Row[];
    customers: Row[];
    accounts: Row[];
    paymentMethods: Row[];
    bankAccounts: Row[];
    products?: Row[];
  }>({ suppliers: [], customers: [], accounts: [], paymentMethods: [], bankAccounts: [], products: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"calculations" | "programs">("calculations");
  const [programEditor, setProgramEditor] = useState<Row | "new" | null>(null);
  const [calculateFor, setCalculateFor] = useState<Row | null>(null);
  const [rateProtectionOpen, setRateProtectionOpen] = useState<Row | boolean | null>(null);
  const [breakdownFor, setBreakdownFor] = useState<Row | null>(null);
  const [settleFor, setSettleFor] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/finance/rebates", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) {
      toast.error(body?.error?.message || "Rebates could not be loaded.");
      return;
    }
    setData(body.data || { programs: [], calculations: [] });
    setLookups(body.lookups || { suppliers: [], customers: [], accounts: [], paymentMethods: [], bankAccounts: [], products: [] });
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const accounts = (accountClass: string) => lookups.accounts.filter((account) => account.accountClass === accountClass);
  const totals = useMemo(
    () => ({
      receivableOutstanding: data.calculations
        .filter((row) => row.program?.direction === "RECEIVABLE")
        .reduce((sum, row) => sum + Number(row.outstandingAmount), 0),
      payableOutstanding: data.calculations
        .filter((row) => row.program?.direction === "PAYABLE")
        .reduce((sum, row) => sum + Number(row.outstandingAmount), 0),
      accrued: data.calculations
        .filter((row) => ["ACCRUED", "PARTIALLY_SETTLED"].includes(row.status))
        .reduce((sum, row) => sum + Number(row.approvedAmount), 0),
      settled: data.calculations.reduce((sum, row) => sum + Number(row.settledAmount), 0),
    }),
    [data]
  );

  async function act(url: string, payload: unknown, message: string) {
    setBusy(true);
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload ?? {}),
    });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      toast.error(body?.error?.message || "The action could not be completed.");
      return null;
    }
    toast.success(message);
    await load();
    return body?.data ?? {};
  }

  const rateProtectionPrograms = useMemo(
    () => data.programs.filter((p) => p.calculationMethod === "PRICE_PROTECTION" && p.isActive),
    [data.programs]
  );

  return (
    <div className="mx-auto max-w-[1500px]">
      <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="kicker">Trade programs & Rate Protection</span>
            <Badge tone="green">Double-Entry Accrual</Badge>
          </div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">Rebates & Rate Protection</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Supplier volume rebates, item-wise price protection on unsold inventory, and customer rebates accrued
            independently to the general ledger and settled via credit memo or bank receipt.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {permissions.manage ? (
            <Button
              onClick={() => {
                if (rateProtectionPrograms.length > 0) {
                  setRateProtectionOpen(rateProtectionPrograms[0]);
                } else {
                  setRateProtectionOpen(true);
                }
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <ShieldAlert className="h-4 w-4" />
              Rate Protection Claim
            </Button>
          ) : null}
          {permissions.manage ? (
            <Button variant="outline" onClick={() => setProgramEditor("new")}>
              <Plus className="h-4 w-4" />
              New program
            </Button>
          ) : null}
          <a
            href="/finance/rebates/print"
            target="_blank"
            className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            Print Register
          </a>
          {permissions.export ? (
            <button
              type="button"
              onClick={() => window.location.assign("/api/finance/exports/rebates")}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-700 hover:bg-blue-100"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          ) : null}
          <Button variant="outline" onClick={() => void load()} loading={loading}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Supplier receivables & claims", value: totals.receivableOutstanding, icon: ArrowDownLeft },
          { label: "Customer rebate payable", value: totals.payableOutstanding, icon: ArrowUpRight },
          { label: "Accrued but unsettled", value: totals.accrued, icon: BadgeCheck },
          { label: "Settled to date", value: totals.settled, icon: Banknote },
        ].map((card) => (
          <div key={card.label} className="surface p-5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-700">
              <card.icon className="h-4 w-4" />
            </span>
            <p className="mt-4 text-xl font-bold text-slate-900">{formatMoney(String(card.value), currency)}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {(
          [
            ["calculations", `Rebate calculations & Claims (${data.calculations.length})`],
            ["programs", `Programs (${data.programs.length})`],
          ] as const
        ).map(([key, text]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
              tab === key ? "bg-blue-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {text}
          </button>
        ))}
      </div>

      {tab === "programs" ? (
        <section className="surface mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Program</th>
                  <th className="px-4 py-3">Direction</th>
                  <th className="px-4 py-3">Party</th>
                  <th className="px-4 py-3">Rule / Method</th>
                  <th className="px-4 py-3">Accounts</th>
                  <th className="px-4 py-3 text-right">Calculations</th>
                  <th className="px-5 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.programs.map((program) => (
                  <tr key={program.id} className="text-xs hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <span className="font-bold text-slate-800">{program.code}</span>
                      <span className="mt-0.5 block text-[10px] text-slate-500">{program.name}</span>
                      <span className="mt-0.5 block text-[10px] text-slate-400">
                        {formatDate(program.effectiveFrom)} – {formatDate(program.effectiveTo)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={program.direction === "RECEIVABLE" ? "green" : "amber"}>
                        {titleCase(program.direction)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {program.supplier
                        ? `${program.supplier.code} · ${program.supplier.name}`
                        : program.customer
                        ? `${program.customer.code} · ${program.customer.name}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="font-medium text-slate-800">
                        {program.calculationMethod === "PRICE_PROTECTION"
                          ? "Rate Protection (Price Drop)"
                          : titleCase(program.calculationMethod)}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-slate-400">
                        {program.calculationMethod === "PRICE_PROTECTION"
                          ? "Per-item price decrease on unsold inventory"
                          : program.rate
                          ? `${Number(program.rate)}% of value`
                          : program.fixedAmount
                          ? `${formatMoney(String(program.fixedAmount), currency)}`
                          : "—"}{" "}
                        · {program.accountingTreatment}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[10px] text-slate-500">
                      {program.primaryAccount.code}
                      <br />
                      {program.settlementAccount.code}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">
                      {program._count?.calculations ?? 0}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Badge tone={program.isActive ? "green" : "slate"}>
                          {program.isActive ? "Active" : "Inactive"}
                        </Badge>
                        {permissions.manage ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (program.calculationMethod === "PRICE_PROTECTION") {
                                setRateProtectionOpen(program);
                              } else {
                                setCalculateFor(program);
                              }
                            }}
                          >
                            <Calculator className="h-3.5 w-3.5" />
                            {program.calculationMethod === "PRICE_PROTECTION" ? "Claim" : "Calculate"}
                          </Button>
                        ) : null}
                        {permissions.manage ? (
                          <Button size="sm" variant="ghost" onClick={() => setProgramEditor(program)}>
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.programs.length ? (
              <div className="py-16 text-center text-xs text-slate-400">
                <Tags className="mx-auto mb-2 h-5 w-5" />
                No rebate program has been configured.
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === "calculations" ? (
        <section className="surface mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Reference / program</th>
                  <th className="px-4 py-3">Party / period</th>
                  <th className="px-4 py-3 text-right">Eligible value</th>
                  <th className="px-4 py-3 text-right">Calculated</th>
                  <th className="px-4 py-3 text-right">Approved</th>
                  <th className="px-4 py-3 text-right">Settled</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.calculations.map((row) => {
                  const isMaker = row.calculatedById === currentUserId;
                  const direction = row.program?.direction;
                  const canSettle = direction === "RECEIVABLE" ? permissions.receive : permissions.pay;
                  const isRateProtection =
                    row.program?.calculationMethod === "PRICE_PROTECTION" ||
                    (row.calculationDetails && Array.isArray((row.calculationDetails as any).items));
                  const itemCount =
                    row.calculationDetails && Array.isArray((row.calculationDetails as any).items)
                      ? (row.calculationDetails as any).items.length
                      : null;

                  return (
                    <tr key={row.id} className="text-xs hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <span className="font-bold text-slate-800">{row.referenceNumber}</span>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                          <span>{row.program.code}</span>
                          <span>·</span>
                          {isRateProtection ? (
                            <span className="font-semibold text-emerald-700 bg-emerald-50 px-1 rounded">
                              Rate Protection
                            </span>
                          ) : (
                            <span>{titleCase(direction ?? "")}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.supplier?.name ?? row.customer?.name ?? "—"}
                        <span className="mt-0.5 block text-[10px] text-slate-400">
                          {formatDate(row.periodStart)} – {formatDate(row.periodEnd)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">
                        {formatMoney(String(row.eligibleValue), currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">
                        {formatMoney(String(row.calculatedAmount), currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">
                        {formatMoney(String(row.approvedAmount), currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {formatMoney(String(row.settledAmount), currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {formatMoney(String(row.outstandingAmount), currency)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone(row.status)}>{titleCase(row.status)}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {itemCount ? (
                            <Button size="sm" variant="ghost" onClick={() => setBreakdownFor(row)}>
                              <Eye className="h-3.5 w-3.5 text-blue-600" />
                              Items ({itemCount})
                            </Button>
                          ) : null}

                          <a
                            href={`/finance/rebates/print?id=${row.id}`}
                            target="_blank"
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            title="Print Claim Statement"
                          >
                            <Printer className="h-3 w-3" />
                            Claim
                          </a>

                          {permissions.approve && row.status === "CALCULATED" && !isMaker ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void act(`/api/finance/rebates/calculations/${row.id}/approve`, {}, "Rebate approved.")
                              }
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Approve
                            </Button>
                          ) : null}
                          {permissions.approve && row.status === "CALCULATED" && isMaker ? (
                            <span className="text-[10px] font-semibold text-amber-700">Awaiting independent approval</span>
                          ) : null}
                          {permissions.approve && row.status === "APPROVED" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void act(
                                  `/api/finance/rebates/calculations/${row.id}/accrue`,
                                  { postingDate: today() },
                                  "Rebate accrued to the ledger."
                                )
                              }
                            >
                              <BadgeCheck className="h-3.5 w-3.5" />
                              Accrue
                            </Button>
                          ) : null}
                          {canSettle &&
                          ["ACCRUED", "PARTIALLY_SETTLED"].includes(row.status) &&
                          Number(row.outstandingAmount) > 0 ? (
                            <Button size="sm" onClick={() => setSettleFor(row)}>
                              <Banknote className="h-3.5 w-3.5" />
                              {direction === "RECEIVABLE" ? "Receive" : "Pay"}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!data.calculations.length ? (
              <div className="py-16 text-center text-xs text-slate-400">
                No rebate calculation recorded. Click{" "}
                <span className="font-semibold text-emerald-700">Rate Protection Claim</span> or use{" "}
                <span className="font-semibold">Calculate</span> on a program.
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {programEditor ? (
        <ProgramEditor
          program={programEditor === "new" ? null : programEditor}
          suppliers={lookups.suppliers}
          customers={lookups.customers}
          revenueAccounts={accounts("REVENUE")}
          expenseAccounts={accounts("EXPENSE")}
          assetAccounts={accounts("ASSET")}
          liabilityAccounts={accounts("LIABILITY")}
          busy={busy}
          onClose={() => setProgramEditor(null)}
          onSave={async (payload) => {
            const response = await fetch(
              programEditor === "new" ? "/api/finance/rebates/programs" : `/api/finance/rebates/programs/${(programEditor as Row).id}`,
              {
                method: programEditor === "new" ? "POST" : "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
              }
            );
            const body = await response.json().catch(() => null);
            if (!response.ok) {
              toast.error(body?.error?.message || "The program could not be saved.");
              return;
            }
            toast.success("Rebate program saved.");
            setProgramEditor(null);
            await load();
          }}
        />
      ) : null}

      {calculateFor && calculateFor.calculationMethod !== "PRICE_PROTECTION" ? (
        <CalculateModal
          program={calculateFor}
          busy={busy}
          onClose={() => setCalculateFor(null)}
          onSubmit={async (payload) => {
            const response = await fetch(`/api/finance/rebates/programs/${calculateFor.id}/calculate`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) {
              toast.error(body?.error?.message || "The rebate could not be calculated.");
              return;
            }
            toast.success(`Rebate calculated at ${formatMoney(String(body.data.calculatedAmount), currency)}.`);
            setCalculateFor(null);
            setTab("calculations");
            await load();
          }}
        />
      ) : null}

      {rateProtectionOpen ? (
        <RateProtectionCalculateModal
          initialProgram={typeof rateProtectionOpen === "object" ? rateProtectionOpen : rateProtectionPrograms[0] || null}
          programs={rateProtectionPrograms}
          suppliers={lookups.suppliers}
          products={lookups.products || []}
          currency={currency}
          busy={busy}
          onClose={() => setRateProtectionOpen(null)}
          onCreateProgram={() => {
            setRateProtectionOpen(null);
            setProgramEditor("new");
          }}
          onSubmit={async (programId, payload) => {
            const response = await fetch(`/api/finance/rebates/programs/${programId}/calculate`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) {
              toast.error(body?.error?.message || "The rate protection claim could not be generated.");
              return;
            }
            toast.success(
              `Rate protection claim calculated: ${formatMoney(String(body.data.calculatedAmount), currency)}.`
            );
            setRateProtectionOpen(null);
            setTab("calculations");
            await load();
          }}
        />
      ) : null}

      {breakdownFor ? (
        <ClaimBreakdownModal row={breakdownFor} currency={currency} onClose={() => setBreakdownFor(null)} />
      ) : null}

      {settleFor ? (
        <SettleModal
          row={settleFor}
          currency={currency}
          methods={lookups.paymentMethods}
          bankAccounts={lookups.bankAccounts}
          busy={busy}
          onClose={() => setSettleFor(null)}
          onSubmit={async (payload) => {
            const response = await fetch(`/api/finance/rebates/calculations/${settleFor.id}/settle`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) {
              toast.error(body?.error?.message || "The settlement could not be recorded.");
              return;
            }
            toast.success(
              settleFor.program?.direction === "RECEIVABLE"
                ? "Rebate receipt recorded."
                : "Rebate payment recorded."
            );
            setSettleFor(null);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function ProgramEditor({
  program,
  suppliers,
  customers,
  revenueAccounts,
  expenseAccounts,
  assetAccounts,
  liabilityAccounts,
  busy,
  onClose,
  onSave,
}: {
  program: Row | null;
  suppliers: Row[];
  customers: Row[];
  revenueAccounts: Row[];
  expenseAccounts: Row[];
  assetAccounts: Row[];
  liabilityAccounts: Row[];
  busy: boolean;
  onClose: () => void;
  onSave: (payload: Row) => Promise<void>;
}) {
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

  const isRateProtection = form.calculationMethod === "PRICE_PROTECTION";
  const receivable = form.direction === "RECEIVABLE";

  return (
    <Modal open title={program ? `Edit ${program.code}` : "New rebate program"} onClose={onClose}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void onSave({
            ...form,
            supplierId: receivable ? form.supplierId || null : null,
            customerId: receivable ? null : form.customerId || null,
            rate: form.calculationMethod === "PERCENT_OF_VALUE" ? form.rate : null,
            fixedAmount:
              form.calculationMethod === "PERCENT_OF_VALUE" || isRateProtection ? null : form.fixedAmount,
            accountingTreatment: receivable ? "INCOME" : "COST_REDUCTION",
          });
        }}
      >
        <label className={labelCls}>
          Code
          <input
            className={field}
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value })}
            required
            disabled={Boolean(program)}
          />
        </label>
        <label className={labelCls}>
          Name
          <input
            className={field}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
            minLength={2}
          />
        </label>
        <label className={labelCls}>
          Direction
          <select
            className={field}
            value={form.direction}
            onChange={(event) =>
              setForm({
                ...form,
                direction: event.target.value,
                accountingTreatment: event.target.value === "RECEIVABLE" ? "INCOME" : "COST_REDUCTION",
              })
            }
            disabled={isRateProtection}
          >
            <option value="RECEIVABLE">Supplier rebate / Rate Protection (receivable)</option>
            <option value="PAYABLE" disabled={isRateProtection}>
              Customer rebate (payable)
            </option>
          </select>
        </label>
        {receivable ? (
          <label className={labelCls}>
            Supplier
            <select
              className={field}
              value={form.supplierId}
              onChange={(event) => setForm({ ...form, supplierId: event.target.value })}
              required
            >
              <option value="">Select supplier…</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.code} · {supplier.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className={labelCls}>
            Customer
            <select
              className={field}
              value={form.customerId}
              onChange={(event) => setForm({ ...form, customerId: event.target.value })}
              required
            >
              <option value="">Select customer…</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.code} · {customer.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={labelCls}>
          Effective from
          <input
            type="date"
            className={field}
            value={form.effectiveFrom}
            onChange={(event) => setForm({ ...form, effectiveFrom: event.target.value })}
            required
          />
        </label>
        <label className={labelCls}>
          Effective to
          <input
            type="date"
            className={field}
            value={form.effectiveTo}
            onChange={(event) => setForm({ ...form, effectiveTo: event.target.value })}
            required
          />
        </label>
        <label className={`sm:col-span-2 ${labelCls}`}>
          Calculation method
          <select
            className={field}
            value={form.calculationMethod}
            onChange={(event) => {
              const val = event.target.value;
              setForm({
                ...form,
                calculationMethod: val,
                direction: val === "PRICE_PROTECTION" ? "RECEIVABLE" : form.direction,
                accountingTreatment: val === "PRICE_PROTECTION" ? "INCOME" : form.accountingTreatment,
              });
            }}
          >
            {METHODS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {isRateProtection ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 sm:col-span-2 text-xs text-emerald-800 leading-relaxed">
            <span className="font-bold flex items-center gap-1.5 mb-1">
              <ShieldAlert className="h-4 w-4 text-emerald-600" />
              Rate Protection (Price Drop Protection)
            </span>
            When suppliers announce official price cuts, claims are generated item-by-item based on{" "}
            <strong>(Old Cost - New Reduced Price) × Unsold Inventory on Hand</strong> at the announcement date.
          </div>
        ) : form.calculationMethod === "PERCENT_OF_VALUE" ? (
          <label className={labelCls}>
            Rate %
            <input
              className={field}
              inputMode="decimal"
              value={form.rate ?? ""}
              onChange={(event) => setForm({ ...form, rate: event.target.value })}
              required
            />
          </label>
        ) : (
          <label className={labelCls}>
            {form.calculationMethod === "PER_UNIT" ? "Amount per unit" : "Amount per period"}
            <input
              className={field}
              inputMode="decimal"
              value={form.fixedAmount ?? ""}
              onChange={(event) => setForm({ ...form, fixedAmount: event.target.value })}
              required
            />
          </label>
        )}

        <label className={labelCls}>
          {receivable ? "Income account (e.g. Rebate / Price Protection Income)" : "Rebate expense account"}
          <select
            className={field}
            value={form.primaryAccountId}
            onChange={(event) => setForm({ ...form, primaryAccountId: event.target.value })}
            required
          >
            <option value="">Select account…</option>
            {(receivable ? revenueAccounts : expenseAccounts).map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} · {account.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          {receivable ? "Receivable account (e.g. Supplier Rebate Claim Asset)" : "Payable account"}
          <select
            className={field}
            value={form.settlementAccountId}
            onChange={(event) => setForm({ ...form, settlementAccountId: event.target.value })}
            required
          >
            <option value="">Select account…</option>
            {(receivable ? assetAccounts : liabilityAccounts).map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} · {account.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-5 sm:col-span-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
            />
            Active
          </label>
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Save program
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CalculateModal({
  program,
  busy,
  onClose,
  onSubmit,
}: {
  program: Row;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: Row) => Promise<void>;
}) {
  const [form, setForm] = useState<Row>({
    periodStart: String(program.effectiveFrom).slice(0, 10),
    periodEnd: today(),
  });
  return (
    <Modal open title={`Calculate ${program.code}`} onClose={onClose}>
      <form
        className="grid gap-3"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void onSubmit(form);
        }}
      >
        <p className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">
          Eligibility is read from posted{" "}
          {program.direction === "RECEIVABLE"
            ? "goods receipts for this supplier"
            : "sales invoices for this customer"}
          ; one calculation is allowed per program and period.
        </p>
        <label className={labelCls}>
          Period start
          <input
            type="date"
            className={field}
            value={form.periodStart}
            onChange={(event) => setForm({ ...form, periodStart: event.target.value })}
            required
            min={String(program.effectiveFrom).slice(0, 10)}
            max={String(program.effectiveTo).slice(0, 10)}
          />
        </label>
        <label className={labelCls}>
          Period end
          <input
            type="date"
            className={field}
            value={form.periodEnd}
            onChange={(event) => setForm({ ...form, periodEnd: event.target.value })}
            required
            min={String(program.effectiveFrom).slice(0, 10)}
            max={String(program.effectiveTo).slice(0, 10)}
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Run calculation
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type ClaimItemLine = {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  brandName?: string;
  sku: string;
  currentStock: number;
  eligibleQuantity: number;
  oldPrice: number;
  newPrice: number;
  priceDropPerUnit: number;
  claimAmount: number;
};

function RateProtectionCalculateModal({
  initialProgram,
  programs,
  products,
  currency,
  busy,
  onClose,
  onCreateProgram,
  onSubmit,
}: {
  initialProgram: Row | null;
  programs: Row[];
  suppliers: Row[];
  products: Row[];
  currency: string;
  busy: boolean;
  onClose: () => void;
  onCreateProgram: () => void;
  onSubmit: (programId: string, payload: { periodStart: string; periodEnd: string; items: any[] }) => Promise<void>;
}) {
  const [selectedProgramId, setSelectedProgramId] = useState<string>(
    initialProgram?.id || programs[0]?.id || ""
  );
  const activeProgram = programs.find((p) => p.id === selectedProgramId) || initialProgram || null;

  const [periodStart, setPeriodStart] = useState<string>(
    activeProgram ? String(activeProgram.effectiveFrom).slice(0, 10) : today()
  );
  const [periodEnd, setPeriodEnd] = useState<string>(today());

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductVariantId, setSelectedProductVariantId] = useState("");
  const [items, setItems] = useState<ClaimItemLine[]>([]);

  // Filter products by search
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products.slice(0, 30);
    const q = searchQuery.toLowerCase();
    return products
      .filter(
        (p) =>
          p.productName.toLowerCase().includes(q) ||
          p.variantName.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.brandName && p.brandName.toLowerCase().includes(q))
      )
      .slice(0, 30);
  }, [products, searchQuery]);

  function addItem(variantId: string) {
    const found = products.find((p) => p.variantId === variantId);
    if (!found) return;
    if (items.some((i) => i.variantId === variantId)) {
      toast.info("Product is already in the claim list.");
      return;
    }
    const oldP = found.purchasePrice > 0 ? found.purchasePrice : 1000;
    const defaultNewP = Math.round(oldP * 0.9); // 10% drop suggestion
    const drop = Math.max(0, oldP - defaultNewP);
    const qty = found.currentStock > 0 ? found.currentStock : 1;

    setItems((prev) => [
      ...prev,
      {
        productId: found.productId,
        variantId: found.variantId,
        productName: found.productName,
        variantName: found.variantName,
        brandName: found.brandName,
        sku: found.sku,
        currentStock: found.currentStock,
        eligibleQuantity: qty,
        oldPrice: oldP,
        newPrice: defaultNewP,
        priceDropPerUnit: drop,
        claimAmount: qty * drop,
      },
    ]);
    setSelectedProductVariantId("");
    setSearchQuery("");
  }

  function updateItem(index: number, updates: Partial<ClaimItemLine>) {
    setItems((prev) => {
      const copy = [...prev];
      const target = { ...copy[index], ...updates };
      const qty = Number(target.eligibleQuantity) || 0;
      const oldP = Number(target.oldPrice) || 0;
      const newP = Number(target.newPrice) || 0;
      target.priceDropPerUnit = Math.max(0, oldP - newP);
      target.claimAmount = qty * target.priceDropPerUnit;
      copy[index] = target;
      return copy;
    });
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const totals = useMemo(() => {
    const totalUnits = items.reduce((sum, item) => sum + Number(item.eligibleQuantity || 0), 0);
    const totalOriginalValue = items.reduce(
      (sum, item) => sum + Number(item.eligibleQuantity || 0) * Number(item.oldPrice || 0),
      0
    );
    const totalClaim = items.reduce((sum, item) => sum + Number(item.claimAmount || 0), 0);
    return { totalUnits, totalOriginalValue, totalClaim };
  }, [items]);

  if (!programs.length && !initialProgram) {
    return (
      <Modal open title="Supplier Rate Protection Claim" onClose={onClose}>
        <div className="py-6 text-center">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-amber-500" />
          <h3 className="text-sm font-bold text-slate-800">No Rate Protection Program Configured</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            To generate item-wise rate protection claims, you need an active Rate Protection Program configured for your supplier.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onCreateProgram}>
              <Plus className="h-4 w-4" />
              Configure Program Now
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open title="Item-Wise Supplier Rate Protection Claim" onClose={onClose}>
      <form
        className="grid gap-4 max-w-4xl"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!activeProgram) {
            toast.error("Please select a rate protection program.");
            return;
          }
          if (items.length === 0) {
            toast.error("Please add at least one item to claim rate protection.");
            return;
          }
          if (totals.totalClaim <= 0) {
            toast.error("Claim amount must be greater than zero. Ensure new price is lower than old cost.");
            return;
          }
          void onSubmit(activeProgram.id, {
            periodStart,
            periodEnd,
            items,
          });
        }}
      >
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900 leading-relaxed flex items-start gap-2.5">
          <ShieldAlert className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Rate Protection Protocol (Price Drop Recovery)</p>
            <p className="text-[11px] text-blue-800 mt-0.5">
              Enter the products affected by the supplier price cut. Eligible unsold inventory on hand is auto-loaded.
              The system calculates <strong>Price Drop = (Old Cost - New Price)</strong> and computes your total claim debit note.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className={labelCls}>
            Rate Protection Program
            <select
              className={field}
              value={selectedProgramId}
              onChange={(e) => setSelectedProgramId(e.target.value)}
              required
            >
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.supplier?.name || p.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Price Drop Effective From
            <input
              type="date"
              className={field}
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              required
            />
          </label>
          <label className={labelCls}>
            Claim Date
            <input
              type="date"
              className={field}
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              required
            />
          </label>
        </div>

        {/* Product selector */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <label className="text-xs font-bold text-slate-800 mb-1.5 block">
            Add Products Affected by Price Reduction
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                className={`${field} pl-9`}
                placeholder="Search catalog by model, variant or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              className={`${field} sm:w-[320px]`}
              value={selectedProductVariantId}
              onChange={(e) => {
                setSelectedProductVariantId(e.target.value);
                if (e.target.value) addItem(e.target.value);
              }}
            >
              <option value="">Select product variant ({filteredProducts.length} matches)…</option>
              {filteredProducts.map((p) => (
                <option key={p.variantId} value={p.variantId}>
                  {p.brandName ? `[${p.brandName}] ` : ""}
                  {p.productName} ({p.variantName}) · Stock: {p.currentStock}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected Items Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-3 py-2.5">Product & SKU</th>
                <th className="px-2 py-2.5 text-right">In Stock</th>
                <th className="px-2 py-2.5 text-right w-24">Claim Qty</th>
                <th className="px-2 py-2.5 text-right w-28">Old Cost (Rs)</th>
                <th className="px-2 py-2.5 text-right w-28">New Price (Rs)</th>
                <th className="px-2 py-2.5 text-right">Price Drop</th>
                <th className="px-3 py-2.5 text-right">Line Claim</th>
                <th className="px-2 py-2.5 text-center w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.map((item, idx) => (
                <tr key={item.variantId} className="hover:bg-slate-50/70">
                  <td className="px-3 py-2">
                    <span className="font-semibold text-slate-800">{item.productName}</span>
                    <span className="block text-[10px] text-slate-500">
                      {item.variantName} · SKU: <span className="font-mono">{item.sku}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-mono font-bold ${
                        item.currentStock > 0 ? "bg-slate-100 text-slate-800" : "bg-red-50 text-red-600"
                      }`}
                    >
                      {item.currentStock}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <input
                      type="number"
                      min={1}
                      max={99999}
                      className="h-8 w-20 rounded border border-slate-200 px-2 text-right font-mono text-xs outline-none focus:border-blue-500"
                      value={item.eligibleQuantity}
                      onChange={(e) => updateItem(idx, { eligibleQuantity: Math.max(1, Number(e.target.value)) })}
                      required
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <input
                      type="number"
                      min={1}
                      step="any"
                      className="h-8 w-24 rounded border border-slate-200 px-2 text-right font-mono text-xs outline-none focus:border-blue-500"
                      value={item.oldPrice}
                      onChange={(e) => updateItem(idx, { oldPrice: Math.max(0, Number(e.target.value)) })}
                      required
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      className="h-8 w-24 rounded border border-amber-300 bg-amber-50/50 px-2 text-right font-mono text-xs font-semibold text-slate-900 outline-none focus:border-blue-500"
                      value={item.newPrice}
                      onChange={(e) => updateItem(idx, { newPrice: Math.max(0, Number(e.target.value)) })}
                      placeholder="Reduced"
                      required
                    />
                  </td>
                  <td className="px-2 py-2 text-right font-mono font-semibold text-amber-700">
                    {formatMoney(String(item.priceDropPerUnit), currency)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-black text-slate-900">
                    {formatMoney(String(item.claimAmount), currency)}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No items added to claim. Use the selector above to add products affected by the price drop.
            </div>
          ) : null}
        </div>

        {/* Claim Summary Cards */}
        {items.length > 0 ? (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="text-[10px] font-bold uppercase text-slate-400">Items / Protected Qty</span>
              <p className="mt-0.5 text-base font-black text-slate-800">
                {items.length} items · {totals.totalUnits} units
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="text-[10px] font-bold uppercase text-slate-400">Original Inventory Value</span>
              <p className="mt-0.5 text-base font-black text-slate-800">
                {formatMoney(String(totals.totalOriginalValue), currency)}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
              <span className="text-[10px] font-bold uppercase text-emerald-700">Total Rate Protection Claim</span>
              <p className="mt-0.5 text-lg font-black text-emerald-800">
                {formatMoney(String(totals.totalClaim), currency)}
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={items.length === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            Generate Rate Protection Claim ({formatMoney(String(totals.totalClaim), currency)})
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ClaimBreakdownModal({
  row,
  currency,
  onClose,
}: {
  row: Row;
  currency: string;
  onClose: () => void;
}) {
  const details = (row.calculationDetails as Record<string, any>) || {};
  const items = Array.isArray(details.items) ? (details.items as ClaimItemLine[]) : [];

  return (
    <Modal open title={`Claim Breakdown · ${row.referenceNumber}`} onClose={onClose}>
      <div className="grid gap-4 max-w-3xl">
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs">
          <div>
            <span className="font-bold text-slate-800">{row.supplier?.name || row.customer?.name || "—"}</span>
            <span className="block text-[11px] text-slate-500">
              Period: {formatDate(row.periodStart)} – {formatDate(row.periodEnd)}
            </span>
          </div>
          <div className="text-right">
            <Badge tone={statusTone(row.status)}>{titleCase(row.status)}</Badge>
            <span className="block font-mono text-sm font-black text-blue-700 mt-1">
              {formatMoney(String(row.calculatedAmount), currency)}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[650px] text-left text-xs">
            <thead className="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-3 py-2.5">#</th>
                <th className="px-3 py-2.5">Product / Variant</th>
                <th className="px-2 py-2.5">SKU</th>
                <th className="px-2 py-2.5 text-right">Protected Qty</th>
                <th className="px-2 py-2.5 text-right">Old Cost</th>
                <th className="px-2 py-2.5 text-right">New Price</th>
                <th className="px-2 py-2.5 text-right">Drop / Unit</th>
                <th className="px-3 py-2.5 text-right">Total Claim</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">
                    {item.productName}
                    {item.variantName && item.variantName !== item.productName ? (
                      <span className="block text-[10px] text-slate-500">{item.variantName}</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 font-mono text-slate-600">{item.sku}</td>
                  <td className="px-2 py-2 text-right font-mono font-semibold text-slate-700">
                    {item.eligibleQuantity}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-slate-600">
                    {formatMoney(String(item.oldPrice), currency)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-slate-600">
                    {formatMoney(String(item.newPrice), currency)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono font-bold text-amber-700">
                    {formatMoney(String(item.priceDropPerUnit), currency)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-black text-slate-900">
                    {formatMoney(String(item.claimAmount), currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            {items.length > 0 ? (
              <tfoot>
                <tr className="bg-slate-50 font-bold text-slate-900">
                  <td colSpan={3} className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider">
                    Total:
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono">
                    {items.reduce((sum, i) => sum + Number(i.eligibleQuantity || 0), 0)}
                  </td>
                  <td colSpan={3} className="px-2 py-2.5"></td>
                  <td className="px-3 py-2.5 text-right font-mono text-blue-700 text-sm">
                    {formatMoney(String(row.calculatedAmount), currency)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
          {!items.length ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No item-wise breakdown stored for this calculation.
            </div>
          ) : null}
        </div>

        <div className="flex justify-between items-center pt-2">
          <a
            href={`/finance/rebates/print?id=${row.id}`}
            target="_blank"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            Print Official Claim Voucher
          </a>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SettleModal({
  row,
  currency,
  methods,
  bankAccounts,
  busy,
  onClose,
  onSubmit,
}: {
  row: Row;
  currency: string;
  methods: Row[];
  bankAccounts: Row[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: Row) => Promise<void>;
}) {
  const [form, setForm] = useState<Row>({
    amount: Number(row.outstandingAmount).toFixed(4),
    settlementDate: today(),
    paymentMethodId: methods[0]?.id ?? "",
    bankAccountId: "",
    reference: "",
  });
  const method = methods.find((candidate) => candidate.id === form.paymentMethodId);
  const needsBank = method && method.methodType !== "CASH";
  const banks = method?.bankAccountId ? bankAccounts.filter((bank) => bank.id === method.bankAccountId) : bankAccounts;
  const receivable = row.program?.direction === "RECEIVABLE";
  return (
    <Modal open title={receivable ? "Receive supplier rebate" : "Pay customer rebate"} onClose={onClose}>
      <form
        className="grid gap-3"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void onSubmit({
            ...form,
            bankAccountId: needsBank ? form.bankAccountId || null : null,
            reference: form.reference || null,
          });
        }}
      >
        <p className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">
          Outstanding {formatMoney(String(row.outstandingAmount), currency)} on {row.referenceNumber}. The settlement
          posts against the accrued receivable or payable.
        </p>
        <label className={labelCls}>
          Amount
          <input
            className={field}
            inputMode="decimal"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
            required
          />
        </label>
        <label className={labelCls}>
          Payment method
          <select
            className={field}
            value={form.paymentMethodId}
            onChange={(event) => setForm({ ...form, paymentMethodId: event.target.value })}
            required
          >
            {methods.map((option) => (
              <option key={option.id} value={option.id}>
                {option.code} · {option.name}
              </option>
            ))}
          </select>
        </label>
        {needsBank ? (
          <label className={labelCls}>
            Bank account
            <select
              className={field}
              value={form.bankAccountId}
              onChange={(event) => setForm({ ...form, bankAccountId: event.target.value })}
              required={needsBank && !method?.bankAccountId}
              disabled={Boolean(method?.bankAccountId)}
            >
              <option value="">Select bank…</option>
              {banks.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.code} · {bank.bankName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className={labelCls}>
          Reference
          <input
            className={field}
            value={form.reference}
            onChange={(event) => setForm({ ...form, reference: event.target.value })}
            placeholder={method?.requiresReference ? "Required by this method" : "Optional"}
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Record settlement
          </Button>
        </div>
      </form>
    </Modal>
  );
}
