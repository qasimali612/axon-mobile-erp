"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  Building2,
  CreditCard,
  FileText,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Smartphone,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

type Row = Record<string, any>;

const fieldClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400";
const TYPES = ["CASH", "BANK_TRANSFER", "CARD", "MOBILE_WALLET", "CHEQUE"];

const typeMeta: Record<
  string,
  { label: string; icon: any; tone: "green" | "blue" | "purple" | "amber" | "slate" }
> = {
  CASH: { label: "Cash Drawer", icon: Banknote, tone: "green" },
  BANK_TRANSFER: { label: "Bank Transfer", icon: Building2, tone: "blue" },
  CARD: { label: "Debit / Credit Card", icon: CreditCard, tone: "purple" },
  MOBILE_WALLET: { label: "Mobile Wallet", icon: Smartphone, tone: "amber" },
  CHEQUE: { label: "Cheque / Clearing", icon: FileText, tone: "slate" },
};

export function PaymentMethodWorkspace({
  permissions,
}: {
  permissions: { create: boolean; edit: boolean };
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [cashAccounts, setCashAccounts] = useState<Row[]>([]);
  const [bankAccounts, setBankAccounts] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    const [methods, lookups] = await Promise.all([
      fetch("/api/catalog/payment-methods"),
      fetch("/api/catalog/masters/lookups"),
    ]);
    const methodBody = await methods.json().catch(() => null);
    const lookupBody = await lookups.json().catch(() => null);
    setLoading(false);
    if (!methods.ok) return toast.error(methodBody?.error?.message || "Payment methods could not be loaded.");
    setRows(methodBody.data || []);
    if (lookups.ok) {
      setCashAccounts(lookupBody.data?.cashAccounts || []);
      setBankAccounts(lookupBody.data?.bankAccounts || []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      active: rows.filter((r) => r.isActive).length,
      cash: rows.filter((r) => r.methodType === "CASH").length,
      bank: rows.filter((r) => r.methodType === "BANK_TRANSFER" || r.methodType === "CHEQUE").length,
      digital: rows.filter((r) => r.methodType === "CARD" || r.methodType === "MOBILE_WALLET").length,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const q = search.trim().toLowerCase();
      const accountName = r.cashAccount
        ? `${r.cashAccount.code} ${r.cashAccount.name}`
        : r.bankAccount
        ? `${r.bankAccount.code} ${r.bankAccount.bankName} ${r.bankAccount.accountTitle}`
        : "";
      const matchesSearch =
        !q ||
        String(r.code || "").toLowerCase().includes(q) ||
        String(r.name || "").toLowerCase().includes(q) ||
        accountName.toLowerCase().includes(q);
      const matchesType = !typeFilter || r.methodType === typeFilter;
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && r.isActive) ||
        (statusFilter === "INACTIVE" && !r.isActive);
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [rows, search, typeFilter, statusFilter]);

  return (
    <>
      <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="kicker">Finance control</span>
            <Badge tone="green">GL linked</Badge>
          </div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">Payment methods</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Cash, card, mobile wallet, cheque, and bank transfer channels settle into existing Chart of Accounts cash or bank accounts without duplicate bookkeeping.
          </p>
        </div>
        {permissions.create ? (
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            New payment method
          </Button>
        ) : null}
      </header>

      {/* KPI Summary Cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Methods</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600">
              <Wallet className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">{summary.total}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">{summary.active} active for tender</p>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Cash Drawers</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <Banknote className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-700">{summary.cash}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Counter currency registers</p>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Bank & Clearing</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
              <Building2 className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-indigo-700">{summary.bank}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Commercial IBAN accounts</p>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Digital Gateways</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-purple-50 text-purple-600">
              <CreditCard className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-purple-700">{summary.digital}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Card POS & mobile wallets</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="surface mb-5 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search code, name, or account…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
            />
            {search ? (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <div className="relative">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
            >
              <option value="">All method types</option>
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {typeMeta[type]?.label || type}
                </option>
              ))}
            </select>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active only</option>
            <option value="INACTIVE">Inactive only</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-slate-400 sm:inline">
            Showing {filteredRows.length} of {rows.length} methods
          </span>
          <Button variant="ghost" size="icon" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <section className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left">
            <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3">Code / Name</th>
                <th className="px-4 py-3">Channel Type</th>
                <th className="px-4 py-3">Settlement GL Account</th>
                <th className="px-4 py-3">Reference / Slip</th>
                <th className="px-4 py-3 text-right">Transactions</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-14 text-center text-xs text-slate-400">
                    Loading payment methods…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-14 text-center text-xs text-slate-400">
                    {search || typeFilter || statusFilter !== "ALL"
                      ? "No payment methods match the filter criteria."
                      : "No payment methods yet. Add the cash and bank settlement methods used at the counter."}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const meta = typeMeta[row.methodType] || {
                    label: row.methodType,
                    icon: Wallet,
                    tone: "slate",
                  };
                  const Icon = meta.icon;
                  return (
                    <tr key={row.id} className="text-xs transition hover:bg-slate-50/60">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">{row.code}</span>
                          <span className="font-semibold text-slate-800">{row.name}</span>
                        </div>
                        {row.notes ? (
                          <span className="mt-0.5 block max-w-sm truncate text-[10px] text-slate-400">
                            {row.notes}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">
                          <Icon className="h-3.5 w-3.5 text-slate-500" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {row.cashAccount ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-800">
                            <Banknote className="h-3 w-3" />
                            {row.cashAccount.code} · {row.cashAccount.name}
                          </span>
                        ) : row.bankAccount ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-blue-800">
                            <Building2 className="h-3 w-3" />
                            {row.bankAccount.code} · {row.bankAccount.bankName}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge tone={row.requiresReference ? "amber" : "slate"}>
                          {row.requiresReference ? "Required" : "Optional"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-800">
                        {row._count?.payments || 0}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge tone={row.isActive ? "green" : "slate"}>
                          {row.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Button size="sm" variant="outline" onClick={() => setEditing(row)}>
                          {permissions.edit ? "Edit" : "View"}
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <PaymentMethodEditor
        open={Boolean(editing)}
        row={editing === "new" ? null : editing}
        cashAccounts={cashAccounts}
        bankAccounts={bankAccounts}
        permissions={permissions}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await load();
        }}
      />
    </>
  );
}

function PaymentMethodEditor({
  open,
  row,
  cashAccounts,
  bankAccounts,
  permissions,
  onClose,
  onSaved,
}: {
  open: boolean;
  row: Row | null;
  cashAccounts: Row[];
  bankAccounts: Row[];
  permissions: { create: boolean; edit: boolean };
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [methodType, setMethodType] = useState("CASH");
  const [cashAccountId, setCashAccountId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [requiresReference, setRequiresReference] = useState(false);
  const [sequence, setSequence] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(row?.code || "");
    setName(row?.name || "");
    setMethodType(row?.methodType || "CASH");
    setCashAccountId(row?.cashAccountId || "");
    setBankAccountId(row?.bankAccountId || "");
    setRequiresReference(row?.requiresReference ?? false);
    setSequence(String(row?.sequence ?? 0));
    setIsActive(row?.isActive ?? true);
    setNotes(row?.notes || "");
  }, [open, row]);

  async function save(event: FormEvent) {
    event.preventDefault();
    const payload = {
      code,
      name,
      methodType,
      cashAccountId: methodType === "CASH" ? cashAccountId || null : null,
      bankAccountId: methodType === "CASH" ? null : bankAccountId || null,
      requiresReference,
      sequence: Number(sequence),
      isActive,
      notes: notes || null,
    };
    setSaving(true);
    const response = await fetch(
      row ? `/api/catalog/payment-methods/${row.id}` : "/api/catalog/payment-methods",
      {
        method: row ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const body = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) return toast.error(body?.error?.message || "Payment method could not be saved.");
    toast.success("Payment method saved successfully.");
    await onSaved();
  }

  const canSave = row ? permissions.edit : permissions.create;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${row ? "Edit" : "New"} payment method`}
      description="Each tender method settles directly into one Chart of Accounts cash or bank account. Settlement account cannot be changed after payments post."
      size="md"
    >
      <form onSubmit={save} className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-700">
            Method code <span className="text-red-500">*</span>
            <input
              className={`${fieldClass} mt-1.5 uppercase font-mono`}
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              maxLength={30}
              placeholder="e.g. PM-CASH"
              required
              disabled={!canSave}
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Display name <span className="text-red-500">*</span>
            <input
              className={`${fieldClass} mt-1.5`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              placeholder="e.g. Counter Cash"
              required
              disabled={!canSave}
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Method type
            <select
              className={`${fieldClass} mt-1.5`}
              value={methodType}
              onChange={(event) => setMethodType(event.target.value)}
              disabled={!canSave}
            >
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {typeMeta[type]?.label || type}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Display sort order
            <input
              className={`${fieldClass} mt-1.5`}
              type="number"
              min={0}
              max={32767}
              value={sequence}
              onChange={(event) => setSequence(event.target.value)}
              disabled={!canSave}
            />
          </label>
        </div>

        {methodType === "CASH" ? (
          <label className="block text-xs font-semibold text-slate-700">
            Settlement cash account <span className="text-red-500">*</span>
            <select
              className={`${fieldClass} mt-1.5`}
              value={cashAccountId}
              onChange={(event) => setCashAccountId(event.target.value)}
              required
              disabled={!canSave}
            >
              <option value="">Select cash drawer account…</option>
              {cashAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} · {account.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block text-xs font-semibold text-slate-700">
            Settlement bank account <span className="text-red-500">*</span>
            <select
              className={`${fieldClass} mt-1.5`}
              value={bankAccountId}
              onChange={(event) => setBankAccountId(event.target.value)}
              required
              disabled={!canSave}
            >
              <option value="">Select bank ledger account…</option>
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} · {account.bankName} · {account.accountTitle}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block text-xs font-semibold text-slate-700">
          Notes / Processing guidelines
          <textarea
            className="mt-1.5 min-h-16 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Operational notes, slip attachment guidelines, card gateway terminal ID, etc."
            maxLength={1000}
            disabled={!canSave}
          />
        </label>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              checked={requiresReference}
              onChange={(event) => setRequiresReference(event.target.checked)}
              disabled={!canSave}
            />
            Reference / Auth code required
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              disabled={!canSave}
            />
            Active and selectable in checkout
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" loading={saving} disabled={!canSave}>
            Save payment method
          </Button>
        </div>
      </form>
    </Modal>
  );
}
