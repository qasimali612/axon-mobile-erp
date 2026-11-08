"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Building2,
  CheckCircle2,
  CircleOff,
  Copy,
  Download,
  Edit2,
  Layers,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, titleCase } from "@/lib/utils";

type Account = {
  id: string;
  code: string;
  name: string;
  accountClass: string;
  subclass: string;
  accountType: string;
  normalBalance: string;
  isControlAccount: boolean;
  reconciliationRequired: boolean;
  allowManualJournal: boolean;
  isActive: boolean;
  balance: string;
  description?: string | null;
  currencyCode?: string | null;
  groupId: string | null;
  parentId: string | null;
  branchId: string | null;
  costCenterId: string | null;
  group: { code: string; name: string } | null;
  parent: { code: string; name: string } | null;
  branch: { code: string; name: string } | null;
  _count: { journalLines: number };
};

type Group = { id: string; code: string; name: string; accountClass: string };
type Option = { id: string; code: string; name: string };

const TEMPLATES: Array<{
  label: string;
  code: string;
  name: string;
  accountClass: string;
  subclass: string;
  accountType: string;
  normalBalance: "DEBIT" | "CREDIT";
  description: string;
}> = [
  { label: "Petty Cash Counter", code: "1010", name: "Petty Cash - Main Counter", accountClass: "ASSET", subclass: "Current assets", accountType: "CASH", normalBalance: "DEBIT", description: "Counter till and daily cash float for retail sales" },
  { label: "Main Vault Cash", code: "1020", name: "Cash in Hand - Vault", accountClass: "ASSET", subclass: "Current assets", accountType: "CASH", normalBalance: "DEBIT", description: "Secure branch vault safe cash reserve" },
  { label: "Bank Current Account", code: "1050", name: "Bank Current Account", accountClass: "ASSET", subclass: "Current assets", accountType: "BANK", normalBalance: "DEBIT", description: "Operational commercial bank clearing account" },
  { label: "POS Card Clearing", code: "1060", name: "Card POS Machine Clearing", accountClass: "ASSET", subclass: "Current assets", accountType: "CLEARING", normalBalance: "DEBIT", description: "Credit and debit card settlements in transit" },
  { label: "Handset Inventory", code: "1200", name: "Merchandise Inventory - Handsets", accountClass: "ASSET", subclass: "Inventories", accountType: "INVENTORY", normalBalance: "DEBIT", description: "Physical serialized smartphone inventory balance" },
  { label: "Trade Suppliers Payable", code: "2010", name: "Trade Creditors - Mobile Distributors", accountClass: "LIABILITY", subclass: "Current liabilities", accountType: "ACCOUNTS_PAYABLE", normalBalance: "CREDIT", description: "Outstanding payables to authorized mobile suppliers" },
  { label: "Customer Advances", code: "2050", name: "Customer Advance Deposits", accountClass: "LIABILITY", subclass: "Current liabilities", accountType: "CUSTOMER_ADVANCE", normalBalance: "CREDIT", description: "Pre-orders and customer advance security funds" },
  { label: "Shop Rent Expense", code: "6010", name: "Showroom Rent Expense", accountClass: "EXPENSE", subclass: "Operating expenses", accountType: "RENT", normalBalance: "DEBIT", description: "Monthly outlet and warehouse rental expenditure" },
  { label: "Electricity & Utilities", code: "6020", name: "Electricity & Utility Bills", accountClass: "EXPENSE", subclass: "Operating expenses", accountType: "UTILITY", normalBalance: "DEBIT", description: "Shop power, generator fuel, and telecom utility bills" },
  { label: "Staff Salaries & Incentive", code: "6030", name: "Staff Salaries & Counter Incentives", accountClass: "EXPENSE", subclass: "Operating expenses", accountType: "PAYROLL", normalBalance: "DEBIT", description: "Counter sales commissions and technician payroll" },
];

export function AccountCatalog({
  accounts,
  groups,
  branches,
  costCenters,
  currency,
  canCreate,
  canEdit,
}: {
  accounts: Account[];
  groups: Group[];
  branches: Option[];
  costCenters: Option[];
  currency: string;
  canCreate: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterClass, setFilterClass] = useState("ALL");
  const [search, setSearch] = useState("");
  const [hierarchyFilter, setHierarchyFilter] = useState<"ALL" | "PARENT" | "CHILD">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  const [form, setForm] = useState({
    code: "",
    name: "",
    accountClass: "ASSET",
    subclass: "Current assets",
    accountType: "GENERAL",
    normalBalance: "DEBIT" as "DEBIT" | "CREDIT",
    groupId: "",
    parentId: "",
    branchId: "",
    costCenterId: "",
    currencyCode: currency,
    isControlAccount: false,
    reconciliationRequired: false,
    allowManualJournal: true,
    cashFlowActivity: "NONE",
    description: "",
  });

  const [editForm, setEditForm] = useState({
    name: "",
    subclass: "",
    accountType: "",
    groupId: "",
    parentId: "",
    branchId: "",
    costCenterId: "",
    isControlAccount: false,
    reconciliationRequired: false,
    allowManualJournal: true,
    cashFlowActivity: "NONE",
    description: "",
  });

  // KPI Calculations
  const metrics = useMemo(() => {
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    let totalRevenue = 0;
    let totalExpenses = 0;
    let activeCount = 0;
    let inactiveCount = 0;

    for (const a of accounts) {
      if (a.isActive) activeCount++;
      else inactiveCount++;

      const bal = Number(a.balance) || 0;
      switch (a.accountClass) {
        case "ASSET":
          totalAssets += bal;
          break;
        case "LIABILITY":
          totalLiabilities += bal;
          break;
        case "EQUITY":
          totalEquity += bal;
          break;
        case "REVENUE":
          totalRevenue += bal;
          break;
        case "EXPENSE":
        case "COGS":
          totalExpenses += bal;
          break;
      }
    }

    return {
      total: accounts.length,
      activeCount,
      inactiveCount,
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalRevenue,
      totalExpenses,
    };
  }, [accounts]);

  // Filtered Accounts
  const visible = useMemo(() => {
    return accounts.filter((account) => {
      if (filterClass !== "ALL" && account.accountClass !== filterClass) return false;
      if (statusFilter === "ACTIVE" && !account.isActive) return false;
      if (statusFilter === "INACTIVE" && account.isActive) return false;
      if (hierarchyFilter === "PARENT" && account.parentId !== null) return false;
      if (hierarchyFilter === "CHILD" && account.parentId === null) return false;
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesCode = account.code.toLowerCase().includes(query);
        const matchesName = account.name.toLowerCase().includes(query);
        const matchesSubclass = account.subclass.toLowerCase().includes(query);
        const matchesDesc = account.description?.toLowerCase().includes(query);
        if (!matchesCode && !matchesName && !matchesSubclass && !matchesDesc) return false;
      }
      return true;
    });
  }, [accounts, filterClass, statusFilter, hierarchyFilter, search]);

  function autoGenerateAccountCode(accClass = form.accountClass) {
    const classBaseMap: Record<string, number> = {
      ASSET: 1000,
      LIABILITY: 2000,
      EQUITY: 3000,
      REVENUE: 4000,
      COGS: 5000,
      EXPENSE: 6000,
    };
    const base = classBaseMap[accClass] || 1000;
    const existingCodes = accounts
      .filter((a) => a.accountClass === accClass)
      .map((a) => parseInt(a.code, 10))
      .filter((num) => !isNaN(num) && num >= base && num < base + 1000);

    let nextCode = base + 10;
    while (existingCodes.includes(nextCode)) {
      nextCode += 10;
    }
    setForm((current) => ({ ...current, code: String(nextCode) }));
    toast.success(`Generated Account Code: ${nextCode}`);
  }

  function applyTemplate(tpl: (typeof TEMPLATES)[0]) {
    setForm((curr) => ({
      ...curr,
      code: tpl.code,
      name: tpl.name,
      accountClass: tpl.accountClass,
      subclass: tpl.subclass,
      accountType: tpl.accountType,
      normalBalance: tpl.normalBalance,
      description: tpl.description,
      groupId: groups.find((g) => g.accountClass === tpl.accountClass)?.id || "",
    }));
    toast.success(`Applied template: ${tpl.label}`);
  }

  function openCreateModal() {
    setForm({
      code: "",
      name: "",
      accountClass: "ASSET",
      subclass: "Current assets",
      accountType: "GENERAL",
      normalBalance: "DEBIT",
      groupId: "",
      parentId: "",
      branchId: "",
      costCenterId: "",
      currencyCode: currency,
      isControlAccount: false,
      reconciliationRequired: false,
      allowManualJournal: true,
      cashFlowActivity: "NONE",
      description: "",
    });
    autoGenerateAccountCode("ASSET");
    setOpen(true);
  }

  function openEditModal(account: Account) {
    setEditTarget(account);
    setEditForm({
      name: account.name,
      subclass: account.subclass,
      accountType: account.accountType,
      groupId: account.groupId || "",
      parentId: account.parentId || "",
      branchId: account.branchId || "",
      costCenterId: account.costCenterId || "",
      isControlAccount: account.isControlAccount,
      reconciliationRequired: account.reconciliationRequired,
      allowManualJournal: account.allowManualJournal,
      cashFlowActivity: (account as any).cashFlowActivity || "NONE",
      description: account.description || "",
    });
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch("/api/finance/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        groupId: form.groupId || null,
        parentId: form.parentId || null,
        branchId: form.branchId || null,
        costCenterId: form.costCenterId || null,
        description: form.description || null,
      }),
    });
    const body = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) return toast.error(body?.error?.message || "Account could not be created.");
    toast.success(`Account ${body.data.code} · ${body.data.name} created successfully.`);
    setOpen(false);
    router.refresh();
  }

  async function update(event: React.FormEvent) {
    event.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    const response = await fetch(`/api/finance/accounts/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...editForm,
        groupId: editForm.groupId || null,
        parentId: editForm.parentId || null,
        branchId: editForm.branchId || null,
        costCenterId: editForm.costCenterId || null,
        description: editForm.description || null,
      }),
    });
    const body = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) return toast.error(body?.error?.message || "Account could not be updated.");
    toast.success(`Account ${editTarget.code} updated.`);
    setEditTarget(null);
    router.refresh();
  }

  async function toggle(account: Account) {
    const response = await fetch(`/api/finance/accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !account.isActive }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) return toast.error(body?.error?.message || "Account status could not be changed.");
    toast.success(account.isActive ? `Account ${account.code} deactivated` : `Account ${account.code} reactivated`);
    router.refresh();
  }

  function exportCsv() {
    const headers = ["Account Code", "Account Name", "Class", "Subclass", "Type", "Normal Balance", "Group", "Parent", "Branch", "Manual Journal", "Control", "Posted Balance"];
    const rows = visible.map((a) => [
      a.code,
      a.name,
      a.accountClass,
      a.subclass,
      a.accountType,
      a.normalBalance,
      a.group?.name || "",
      a.parent ? `${a.parent.code} - ${a.parent.name}` : "",
      a.branch ? `${a.branch.code} - ${a.branch.name}` : "Company-wide",
      a.allowManualJournal ? "YES" : "NO",
      a.isControlAccount ? "YES" : "NO",
      a.balance,
    ]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `chart-of-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${visible.length} accounts to CSV`);
  }

  return (
    <>
      {/* Header & Primary Action */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="kicker">General Ledger Structure</span>
            <Badge tone="green">Multi-Tier Hierarchy</Badge>
          </div>
          <h1 className="text-2xl font-black text-slate-950 sm:text-[30px]">Chart of Accounts</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Company-scoped financial account hierarchy, posted GL balances, control guards, and normal balance rules.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          {canCreate ? (
            <Button onClick={openCreateModal}>
              <Plus className="h-4 w-4" />
              Add Chart Account
            </Button>
          ) : null}
        </div>
      </div>

      {/* Financial KPI Summary Cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Accounts</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600">
              <Layers className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">{metrics.total}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {metrics.activeCount} active · {metrics.inactiveCount} inactive
          </p>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Assets Balance</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <Wallet className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-700">{formatMoney(metrics.totalAssets, currency)}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Cash, banks & inventory</p>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Liabilities & Equity</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-purple-50 text-purple-600">
              <Building2 className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-purple-700">
            {formatMoney(metrics.totalLiabilities + metrics.totalEquity, currency)}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">Payables & capital funds</p>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Operational Expenses</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-600">
              <ArrowDownRight className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-amber-700">{formatMoney(metrics.totalExpenses, currency)}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">COGS & shop overheads</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="surface mb-5 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-[280px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9 pr-9 text-xs"
              placeholder="Search account code, title, subclass, or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="select h-9 text-xs"
              value={hierarchyFilter}
              onChange={(e) => setHierarchyFilter(e.target.value as any)}
            >
              <option value="ALL">All Hierarchy</option>
              <option value="PARENT">Parents Only</option>
              <option value="CHILD">Sub-accounts Only</option>
            </select>

            <select
              className="select h-9 text-xs"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* Account Class Tabs */}
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
          {["ALL", "ASSET", "LIABILITY", "EQUITY", "REVENUE", "COGS", "EXPENSE"].map((item) => (
            <button
              key={item}
              onClick={() => setFilterClass(item)}
              className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold transition ${
                filterClass === item
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {item === "ALL" ? "All Account Classes" : titleCase(item)}
              <span className={`ml-1.5 rounded-full px-1.5 py-0.2 text-[9px] ${
                filterClass === item ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
              }`}>
                {item === "ALL" ? accounts.length : accounts.filter((a) => a.accountClass === item).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Account Catalog Table */}
      <section className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Code & Account Name</th>
                <th className="px-4 py-3">Hierarchy / Group</th>
                <th className="px-4 py-3">Class & Type</th>
                <th className="px-4 py-3">Audit Controls</th>
                <th className="px-4 py-3">Branch Scope</th>
                <th className="px-4 py-3 text-right">Posted Balance</th>
                <th className="px-5 py-3 text-right">Status & Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.length ? (
                visible.map((account) => {
                  const balNum = Number(account.balance) || 0;
                  return (
                    <tr
                      key={account.id}
                      className={`text-xs transition hover:bg-slate-50/70 ${
                        account.isActive ? "" : "bg-slate-50/50 opacity-60"
                      }`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(account.code);
                              toast.success(`Copied account code ${account.code}`);
                            }}
                            className="font-mono text-xs font-black text-blue-700 hover:underline inline-flex items-center gap-1"
                            title="Click to copy code"
                          >
                            {account.code}
                            <Copy className="h-3 w-3 opacity-40 hover:opacity-100" />
                          </button>
                          <span className="font-bold text-slate-900">{account.name}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${
                              account.normalBalance === "DEBIT"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-purple-50 text-purple-700 border border-purple-200"
                            }`}
                          >
                            {account.normalBalance} Normal
                          </span>
                          {account.description ? (
                            <span className="truncate max-w-[280px] text-[10px] text-slate-400">
                              {account.description}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="text-[11px] font-semibold text-slate-700">
                          {account.group ? `${account.group.code} · ${account.group.name}` : "Ungrouped"}
                        </div>
                        {account.parent ? (
                          <div className="mt-1 text-[10px] text-slate-400">
                            Sub-account of: <span className="font-mono">{account.parent.code}</span> ({account.parent.name})
                          </div>
                        ) : (
                          <div className="mt-1 text-[9px] font-medium text-slate-400">Level 1 Master</div>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <Badge tone={account.accountClass === "ASSET" ? "green" : account.accountClass === "LIABILITY" ? "purple" : account.accountClass === "EXPENSE" ? "amber" : "slate"}>
                          {titleCase(account.accountClass)}
                        </Badge>
                        <div className="mt-1 text-[10px] text-slate-500">
                          {account.subclass} · <span className="font-mono text-[9px]">{account.accountType}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1 text-[9px]">
                          {account.isControlAccount ? (
                            <span className="rounded bg-rose-50 px-1.5 py-0.5 font-bold text-rose-700 border border-rose-200">
                              Control Guard
                            </span>
                          ) : null}
                          {account.reconciliationRequired ? (
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 font-bold text-blue-700 border border-blue-200">
                              Reconcile
                            </span>
                          ) : null}
                          {account.allowManualJournal ? (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">Manual OK</span>
                          ) : (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 font-bold text-amber-700 border border-amber-200">
                              Subledger Only
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-[11px] text-slate-600">
                        {account.branch ? `${account.branch.code} · ${account.branch.name}` : "Company-Wide"}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className={`font-mono text-sm font-black tabular-nums ${
                          balNum > 0 ? "text-emerald-700" : balNum < 0 ? "text-rose-600" : "text-slate-400"
                        }`}>
                          {formatMoney(account.balance, currency)}
                        </div>
                        <div className="mt-0.5 text-[9px] text-slate-400">
                          {account._count.journalLines} posted line{account._count.journalLines === 1 ? "" : "s"}
                        </div>
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Badge tone={account.isActive ? "green" : "slate"}>
                            {account.isActive ? "Active" : "Inactive"}
                          </Badge>

                          {canEdit ? (
                            <>
                              <button
                                onClick={() => openEditModal(account)}
                                title="Edit Account Details"
                                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => toggle(account)}
                                title={account.isActive ? "Deactivate Account" : "Reactivate Account"}
                                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
                              >
                                {account.isActive ? (
                                  <CircleOff className="h-3.5 w-3.5 text-rose-500" />
                                ) : (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                )}
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-xs text-slate-400">
                    No accounts match the selected filters or search query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add Account Modal */}
      {open ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <form onSubmit={create} className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-slate-900">Add Chart Account</h2>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                    General Ledger
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Account code, classification, and normal balance govern double-entry postings company-wide.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-5">
              {/* Quick Template Chips */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  ⚡ Quick Mobile Business Templates
                </span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.code}
                      type="button"
                      onClick={() => applyTemplate(tpl)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition"
                    >
                      {tpl.label} <span className="font-mono text-[10px] text-slate-400">({tpl.code})</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="field-label">Account Code *</label>
                  <div className="flex gap-2">
                    <input
                      required
                      minLength={2}
                      maxLength={30}
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      className="field-input font-mono uppercase font-bold flex-1"
                      placeholder="e.g. 1010"
                    />
                    <button
                      type="button"
                      onClick={() => autoGenerateAccountCode(form.accountClass)}
                      className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-xs font-bold text-blue-700 hover:bg-blue-100"
                      title="Auto-generate next available code in range"
                    >
                      <Zap className="h-3.5 w-3.5" /> Auto-Gen
                    </button>
                  </div>
                </div>

                <label className="field-label">
                  Account Title / Name *
                  <input
                    required
                    minLength={3}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="field-input font-semibold"
                    placeholder="e.g. Cash in Hand - Counter 1"
                  />
                </label>

                <label className="field-label">
                  Account Class *
                  <select
                    value={form.accountClass}
                    onChange={(e) => {
                      const nextClass = e.target.value;
                      const nextNorm = ["ASSET", "COGS", "EXPENSE"].includes(nextClass) ? "DEBIT" : "CREDIT";
                      setForm({
                        ...form,
                        accountClass: nextClass,
                        normalBalance: nextNorm,
                        groupId: "",
                        parentId: "",
                      });
                      autoGenerateAccountCode(nextClass);
                    }}
                    className="field-input font-semibold"
                  >
                    {["ASSET", "LIABILITY", "EQUITY", "REVENUE", "COGS", "EXPENSE"].map((item) => (
                      <option key={item} value={item}>
                        {item} ({["ASSET", "COGS", "EXPENSE"].includes(item) ? "Debit Normal" : "Credit Normal"})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field-label">
                  Account Group
                  <select
                    value={form.groupId}
                    onChange={(e) => setForm({ ...form, groupId: e.target.value })}
                    className="field-input"
                  >
                    <option value="">No Group</option>
                    {groups
                      .filter((group) => group.accountClass === form.accountClass)
                      .map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.code} · {group.name}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="field-label">
                  Parent Account (For Sub-Accounts)
                  <select
                    value={form.parentId}
                    onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                    className="field-input"
                  >
                    <option value="">No Parent (Level 1 Master)</option>
                    {accounts
                      .filter((account) => account.accountClass === form.accountClass && account.isActive)
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} · {account.name}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="field-label">
                  Subclass Title *
                  <input
                    required
                    value={form.subclass}
                    onChange={(e) => setForm({ ...form, subclass: e.target.value })}
                    className="field-input"
                    placeholder="e.g. Current assets / Operating expenses"
                  />
                </label>

                <label className="field-label">
                  Account Type (Audit Tag) *
                  <input
                    required
                    value={form.accountType}
                    onChange={(e) => setForm({ ...form, accountType: e.target.value.toUpperCase() })}
                    className="field-input font-mono"
                    placeholder="e.g. CASH, BANK, INVENTORY, EXPENSE"
                  />
                </label>

                <label className="field-label">
                  Normal Balance *
                  <select
                    value={form.normalBalance}
                    onChange={(e) => setForm({ ...form, normalBalance: e.target.value as any })}
                    className="field-input font-semibold"
                  >
                    <option value="DEBIT">DEBIT Normal</option>
                    <option value="CREDIT">CREDIT Normal</option>
                  </select>
                </label>

                <label className="field-label">
                  Branch Scope
                  <select
                    value={form.branchId}
                    onChange={(e) => setForm({ ...form, branchId: e.target.value })}
                    className="field-input"
                  >
                    <option value="">Company-Wide (All Branches)</option>
                    {branches.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} · {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field-label">
                  Cost Center
                  <select
                    value={form.costCenterId}
                    onChange={(e) => setForm({ ...form, costCenterId: e.target.value })}
                    className="field-input"
                  >
                    <option value="">None</option>
                    {costCenters.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} · {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field-label sm:col-span-2">
                  Account Description
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="field-input min-h-16 py-2"
                    placeholder="Document specific business purpose, banking reference, or ledger policy"
                  />
                </label>

                {/* Audit Controls Checklist */}
                <div className="sm:col-span-2 grid gap-2 sm:grid-cols-3">
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isControlAccount}
                      onChange={(e) => setForm({ ...form, isControlAccount: e.target.checked })}
                    />
                    <div>
                      <b className="block">Control Account</b>
                      <span className="text-[10px] text-slate-400">Direct journals blocked</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.reconciliationRequired}
                      onChange={(e) => setForm({ ...form, reconciliationRequired: e.target.checked })}
                    />
                    <div>
                      <b className="block">Reconciliation Required</b>
                      <span className="text-[10px] text-slate-400">Monthly bank/party match</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.allowManualJournal}
                      onChange={(e) => setForm({ ...form, allowManualJournal: e.target.checked })}
                    />
                    <div>
                      <b className="block">Allow Manual Journals</b>
                      <span className="text-[10px] text-slate-400">Selectable in GL vouchers</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                <BookOpen className="h-4 w-4" />
                {saving ? "Creating…" : "Create Account"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Edit Account Modal */}
      {editTarget ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <form onSubmit={update} className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white px-5 py-4">
              <div>
                <h2 className="text-base font-black text-slate-900">
                  Edit Account: {editTarget.code} · {editTarget.name}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Account code and normal balance remain immutable once journals are posted.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="field-label sm:col-span-2">
                  Account Title *
                  <input
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="field-input font-bold"
                  />
                </label>

                <label className="field-label">
                  Subclass Title *
                  <input
                    required
                    value={editForm.subclass}
                    onChange={(e) => setEditForm({ ...editForm, subclass: e.target.value })}
                    className="field-input"
                  />
                </label>

                <label className="field-label">
                  Account Type (Tag) *
                  <input
                    required
                    value={editForm.accountType}
                    onChange={(e) => setEditForm({ ...editForm, accountType: e.target.value.toUpperCase() })}
                    className="field-input font-mono"
                  />
                </label>

                <label className="field-label">
                  Account Group
                  <select
                    value={editForm.groupId}
                    onChange={(e) => setEditForm({ ...editForm, groupId: e.target.value })}
                    className="field-input"
                  >
                    <option value="">No Group</option>
                    {groups
                      .filter((group) => group.accountClass === editTarget.accountClass)
                      .map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.code} · {group.name}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="field-label">
                  Parent Account
                  <select
                    value={editForm.parentId}
                    onChange={(e) => setEditForm({ ...editForm, parentId: e.target.value })}
                    className="field-input"
                  >
                    <option value="">No Parent (Level 1 Master)</option>
                    {accounts
                      .filter((account) => account.id !== editTarget.id && account.accountClass === editTarget.accountClass && account.isActive)
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} · {account.name}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="field-label sm:col-span-2">
                  Description
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="field-input min-h-16 py-2"
                  />
                </label>

                <div className="sm:col-span-2 grid gap-2 sm:grid-cols-3">
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.isControlAccount}
                      onChange={(e) => setEditForm({ ...editForm, isControlAccount: e.target.checked })}
                    />
                    <div>
                      <b className="block">Control Account</b>
                      <span className="text-[10px] text-slate-400">Lock direct journals</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.reconciliationRequired}
                      onChange={(e) => setEditForm({ ...editForm, reconciliationRequired: e.target.checked })}
                    />
                    <div>
                      <b className="block">Reconcile Required</b>
                      <span className="text-[10px] text-slate-400">Monthly verification</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.allowManualJournal}
                      onChange={(e) => setEditForm({ ...editForm, allowManualJournal: e.target.checked })}
                    />
                    <div>
                      <b className="block">Manual Allowed</b>
                      <span className="text-[10px] text-slate-400">Selectable in GL</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4">
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
