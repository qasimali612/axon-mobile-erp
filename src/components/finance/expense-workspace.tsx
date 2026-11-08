"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeDollarSign,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  FilePlus,
  FileText,
  Filter,
  Landmark,
  Plus,
  Printer,
  Receipt,
  Search,
  Send,
  ShieldAlert,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { formatDate, formatMoney } from "@/lib/utils";

interface ExpenseAccount {
  id: string;
  code: string;
  name: string;
  accountType: string;
}

interface CashAccount {
  id: string;
  code: string;
  name: string;
  branchId: string | null;
}

interface BankAccount {
  id: string;
  accountTitle: string;
  bankName: string;
  glAccountId: string;
  branchId: string;
}

interface Branch {
  id: string;
  code: string;
  name: string;
}

interface ExpenseVoucher {
  id: string;
  entryNumber: string;
  postingDate: string;
  narration: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "POSTED" | "REJECTED" | "REVERSED";
  referenceDocument: string | null;
  branch: { id: string; code: string; name: string };
  preparedBy: { id: string; fullName: string; username: string };
  approvedBy: { id: string; fullName: string; username: string } | null;
  postedBy: { id: string; fullName: string; username: string } | null;
  lines: Array<{
    id: string;
    description: string;
    baseDebit: string;
    baseCredit: string;
    account: { id: string; code: string; name: string; accountClass: string };
  }>;
}

const EXPENSE_CATEGORIES = [
  "Rent",
  "Electricity & Utilities",
  "Internet & Telecom",
  "Salaries & Wages",
  "Transport & Logistics",
  "Fuel & Traveling",
  "Office Supplies",
  "Marketing & Advertising",
  "Bank & Transaction Fees",
  "Office Equipment Maintenance",
  "Miscellaneous",
];

export function ExpenseWorkspace({
  currencyCode,
  userPermissions,
  userId,
}: {
  currencyCode: string;
  userPermissions: string[];
  userId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expenses, setExpenses] = useState<ExpenseVoucher[]>([]);
  const [kpis, setKpis] = useState({
    totalCount: 0,
    postedExpensesThisMonth: 0,
    pendingApprovalCount: 0,
    draftsCount: 0,
  });
  const [masters, setMasters] = useState<{
    expenseAccounts: ExpenseAccount[];
    cashAccounts: CashAccount[];
    bankAccounts: BankAccount[];
    branches: Branch[];
  }>({
    expenseAccounts: [],
    cashAccounts: [],
    bankAccounts: [],
    branches: [],
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [branchFilter, setBranchFilter] = useState<string>("ALL");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form State
  const [formBranchId, setFormBranchId] = useState("");
  const [formPostingDate, setFormPostingDate] = useState(new Date().toISOString().slice(0, 10));
  const [formCategory, setFormCategory] = useState("Rent");
  const [formExpenseAccountId, setFormExpenseAccountId] = useState("");
  const [formSettlementAccountId, setFormSettlementAccountId] = useState("");
  const [formPayee, setFormPayee] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formTaxAmount, setFormTaxAmount] = useState("0");
  const [formReference, setFormReference] = useState("");
  const [formNarration, setFormNarration] = useState("");

  const canCreate = userPermissions.includes("expense.manage") || userPermissions.includes("GL_CREATE");
  const canApprove = userPermissions.includes("expense.approve") || userPermissions.includes("GL_APPROVE");
  const canPost = userPermissions.includes("expense.approve") || userPermissions.includes("GL_POST");

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/finance/expenses");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Failed to load expenses");
      setExpenses(json.data.expenses);
      setKpis(json.data.kpis);
      setMasters(json.data.masters);

      // Default form selects
      if (json.data.masters.branches.length > 0 && !formBranchId) {
        setFormBranchId(json.data.masters.branches[0].id);
      }
      if (json.data.masters.expenseAccounts.length > 0 && !formExpenseAccountId) {
        setFormExpenseAccountId(json.data.masters.expenseAccounts[0].id);
      }
      if (json.data.masters.cashAccounts.length > 0 && !formSettlementAccountId) {
        setFormSettlementAccountId(json.data.masters.cashAccounts[0].id);
      } else if (json.data.masters.bankAccounts.length > 0 && !formSettlementAccountId) {
        setFormSettlementAccountId(json.data.masters.bankAccounts[0].glAccountId);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error loading data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreateExpense(submitNow: boolean, postNow = false) {
    if (!formBranchId || !formExpenseAccountId || !formSettlementAccountId || !formAmount || !formNarration) {
      toast.error("Please fill in all required fields.");
      return;
    }
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error("Please enter a valid amount greater than zero.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/finance/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: formBranchId,
          postingDate: formPostingDate,
          expenseAccountId: formExpenseAccountId,
          settlementAccountId: formSettlementAccountId,
          amount: formAmount,
          taxAmount: formTaxAmount || "0",
          payee: formPayee,
          referenceDocument: formReference,
          category: formCategory,
          narration: formNarration,
          submitNow: submitNow || postNow,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Failed to record expense");
      const voucherId = json.data?.id;

      if (postNow && voucherId) {
        if (canApprove) {
          await fetch(`/api/finance/expenses/${voucherId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "approve" }),
          });
        }
        if (canPost) {
          await fetch(`/api/finance/expenses/${voucherId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "post" }),
          });
        }
        toast.success("Operating expense posted to General Ledger!", {
          action: {
            label: "Print Voucher",
            onClick: () => window.open(`/finance/journals/${voucherId}/print`, "_blank"),
          },
        });
      } else {
        toast.success(submitNow ? "Expense recorded and submitted for approval!" : "Expense saved as draft.");
      }

      setShowCreateModal(false);
      resetForm();
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error recording expense");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWorkflowAction(id: string, action: "submit" | "approve" | "post" | "cancel") {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/finance/expenses/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || `Failed to ${action} expense`);
      toast.success(`Expense ${action}ed successfully.`);
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : `Error during ${action}`);
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setFormAmount("");
    setFormTaxAmount("0");
    setFormPayee("");
    setFormReference("");
    setFormNarration("");
    setFormPostingDate(new Date().toISOString().slice(0, 10));
  }

  const selectedSettlementName = useMemo(() => {
    const cash = masters.cashAccounts.find((c) => c.id === formSettlementAccountId);
    if (cash) return `${cash.code} · ${cash.name}`;
    const bank = masters.bankAccounts.find((b) => b.glAccountId === formSettlementAccountId);
    if (bank) return `${bank.bankName} · ${bank.accountTitle}`;
    return "Payment Account";
  }, [formSettlementAccountId, masters]);

  const filteredExpenses = expenses.filter((e) => {
    if (statusFilter !== "ALL" && e.status !== statusFilter) return false;
    if (branchFilter !== "ALL" && e.branch.id !== branchFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchNum = e.entryNumber.toLowerCase().includes(q);
      const matchNarr = e.narration.toLowerCase().includes(q);
      const matchRef = (e.referenceDocument || "").toLowerCase().includes(q);
      const matchPrep = e.preparedBy.fullName.toLowerCase().includes(q);
      if (!matchNum && !matchNarr && !matchRef && !matchPrep) return false;
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-[1520px] space-y-6">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="kicker">Financial Operations</span>
            <Badge tone="blue">Double-Entry Controlled</Badge>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Operating Expense Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Record, approve, and post operational expenditures (Rent, Utilities, Salaries, Logistics, Maintenance).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Expense Voucher
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Posted Expenses (This Month)
            </span>
            <span className="rounded-xl bg-rose-50 p-2.5 text-rose-600">
              <BadgeDollarSign className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">
            {formatMoney(kpis.postedExpensesThisMonth.toString(), currencyCode)}
          </p>
          <p className="mt-1 text-xs text-slate-400">Recognized against current period P&L</p>
        </div>

        <div className="surface p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Awaiting Approval
            </span>
            <span className="rounded-xl bg-amber-50 p-2.5 text-amber-600">
              <Clock className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{kpis.pendingApprovalCount}</p>
          <p className="mt-1 text-xs text-slate-400">Maker-checker approval pending</p>
        </div>

        <div className="surface p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Draft Vouchers
            </span>
            <span className="rounded-xl bg-slate-50 p-2.5 text-slate-600">
              <FileText className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{kpis.draftsCount}</p>
          <p className="mt-1 text-xs text-slate-400">Unsubmitted expenses</p>
        </div>

        <div className="surface p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Vouchers Recorded
            </span>
            <span className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
              <Receipt className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{kpis.totalCount}</p>
          <p className="mt-1 text-xs text-slate-400">Indexed in general ledger</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="surface flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by voucher #, payee, narration, preparer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="APPROVED">Approved</option>
              <option value="POSTED">Posted</option>
              <option value="REJECTED">Rejected</option>
            </select>

            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">All Branches</option>
              {masters.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={loadData}>
          Refresh
        </Button>
      </div>

      {/* Expenses Table */}
      <div className="surface overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-xs text-slate-400">Loading expense vouchers...</div>
        ) : filteredExpenses.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No expense vouchers found"
            description="Record a new expense voucher or adjust your search filters."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <tr>
                  <th className="py-3.5 pl-6 pr-3">Voucher #</th>
                  <th className="px-3 py-3.5">Date</th>
                  <th className="px-3 py-3.5">Branch</th>
                  <th className="px-3 py-3.5">Category & Narration</th>
                  <th className="px-3 py-3.5">Accounts</th>
                  <th className="px-3 py-3.5 text-right">Amount</th>
                  <th className="px-3 py-3.5 text-center">Status</th>
                  <th className="py-3.5 pl-3 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.map((exp) => {
                  const expLine = exp.lines.find((l) => Number(l.baseDebit) > 0);
                  const payLine = exp.lines.find((l) => Number(l.baseCredit) > 0);
                  const amount = expLine ? expLine.baseDebit : "0";

                  const tone =
                    exp.status === "POSTED"
                      ? "green"
                      : exp.status === "APPROVED"
                      ? "blue"
                      : exp.status === "SUBMITTED"
                      ? "amber"
                      : exp.status === "REJECTED"
                      ? "red"
                      : "slate";

                  return (
                    <tr key={exp.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 pl-6 pr-3">
                        <Link
                          href={`/finance/journals/${exp.id}`}
                          className="font-mono font-bold text-blue-700 hover:underline"
                        >
                          {exp.entryNumber}
                        </Link>
                        {exp.referenceDocument && (
                          <span className="block text-[10px] text-slate-400">
                            Ref: {exp.referenceDocument}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-slate-600">
                        {formatDate(exp.postingDate)}
                      </td>
                      <td className="px-3 py-3.5 font-medium text-slate-800">
                        {exp.branch.name}
                      </td>
                      <td className="max-w-xs px-3 py-3.5">
                        <p className="truncate font-semibold text-slate-900">{exp.narration}</p>
                        <span className="text-[10px] text-slate-400">
                          By: {exp.preparedBy.fullName}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="text-[11px]">
                          <span className="text-slate-800 font-medium">Dr: {expLine?.account.name || "Expense"}</span>
                          <span className="block text-[10px] text-slate-400">
                            Cr: {payLine?.account.name || "Payment Settlement"}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-right font-bold text-slate-900">
                        {formatMoney(amount, currencyCode)}
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        <Badge tone={tone}>{exp.status}</Badge>
                      </td>
                      <td className="py-3.5 pl-3 pr-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {exp.status === "DRAFT" && canCreate && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={submitting}
                              onClick={() => handleWorkflowAction(exp.id, "submit")}
                            >
                              <Send className="mr-1 h-3 w-3" />
                              Submit
                            </Button>
                          )}

                          {exp.status === "SUBMITTED" && canApprove && (
                            <Button
                              size="sm"
                              disabled={submitting}
                              onClick={() => handleWorkflowAction(exp.id, "approve")}
                            >
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              Approve
                            </Button>
                          )}

                          {exp.status === "APPROVED" && canPost && (
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                              disabled={submitting}
                              onClick={() => handleWorkflowAction(exp.id, "post")}
                            >
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              Post GL
                            </Button>
                          )}

                          {["DRAFT", "SUBMITTED"].includes(exp.status) && canCreate && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={submitting}
                              onClick={() => handleWorkflowAction(exp.id, "cancel")}
                              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          <Link
                            href={`/finance/journals/${exp.id}/print`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            title="Print Official Expense Voucher"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Link>

                          <Link href={`/finance/journals/${exp.id}`}>
                            <Button size="sm" variant="outline">
                              View
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Expense Modal */}
      {showCreateModal && (
        <Modal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="Record Operating Expense"
          description="Create a double-entry balanced expense voucher with automatic GL journal posting."
          size="lg"
        >
          <div className="space-y-4 pt-2">
            {/* Quick Category Chips */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                Quick Category Presets
              </span>
              <div className="flex flex-wrap gap-1.5">
                {EXPENSE_CATEGORIES.slice(0, 8).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setFormCategory(cat);
                      // Auto-select matching expense account if available
                      const match = masters.expenseAccounts.find((a) =>
                        a.name.toLowerCase().includes(cat.toLowerCase().split(" ")[0])
                      );
                      if (match) setFormExpenseAccountId(match.id);
                    }}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      formCategory === cat
                        ? "bg-blue-600 text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Branch *</label>
                <select
                  value={formBranchId}
                  onChange={(e) => setFormBranchId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                >
                  {masters.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Posting Date *</label>
                <input
                  type="date"
                  value={formPostingDate}
                  onChange={(e) => setFormPostingDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Expense Category *</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                >
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Expense GL Account (Debit) *</label>
                <select
                  value={formExpenseAccountId}
                  onChange={(e) => setFormExpenseAccountId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none font-mono"
                >
                  {masters.expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Payment Settlement Account (Credit) *
                </label>
                <select
                  value={formSettlementAccountId}
                  onChange={(e) => setFormSettlementAccountId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none font-mono"
                >
                  <optgroup label="Cash Drawers">
                    {masters.cashAccounts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} · {c.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Bank Accounts">
                    {masters.bankAccounts.map((b) => (
                      <option key={b.id} value={b.glAccountId}>
                        {b.bankName} · {b.accountTitle}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Payee / Vendor / Landlord</label>
                <input
                  type="text"
                  placeholder="e.g. Landlord, LESCO / K-Electric, Courier Service"
                  value={formPayee}
                  onChange={(e) => setFormPayee(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Total Expense Amount ({currencyCode}) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold font-mono text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Bill / Voucher / Slip Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bill #OCT-9981, Inv #5541"
                  value={formReference}
                  onChange={(e) => setFormReference(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Description / Narration *
              </label>
              <textarea
                rows={2}
                placeholder="e.g. November 2026 store rental payment for Main Outlet"
                value={formNarration}
                onChange={(e) => setFormNarration(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Live Double-Entry Balancing Preview */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2">
                <span>Double-Entry Balance Preview</span>
                <span className="text-emerald-700 flex items-center gap-1 font-semibold text-[11px]">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Balanced (Dr = Cr)
                </span>
              </div>
              <div className="space-y-1 font-mono text-xs">
                <div className="flex justify-between items-center text-slate-800">
                  <span className="text-blue-800 font-semibold truncate max-w-[280px]">
                    Dr. {masters.expenseAccounts.find((a) => a.id === formExpenseAccountId)?.code || "EXP"} ·{" "}
                    {masters.expenseAccounts.find((a) => a.id === formExpenseAccountId)?.name || "Expense Account"}
                  </span>
                  <span className="font-bold">{formatMoney(formAmount || 0, currencyCode)}</span>
                </div>
                <div className="flex justify-between items-center text-slate-700 pl-4">
                  <span className="text-slate-600 font-semibold truncate max-w-[280px]">
                    Cr. {selectedSettlementName}
                  </span>
                  <span className="font-bold">{formatMoney(formAmount || 0, currencyCode)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                variant="outline"
                type="button"
                disabled={submitting}
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                type="button"
                disabled={submitting}
                onClick={() => handleCreateExpense(false)}
              >
                Save as Draft
              </Button>
              <Button
                variant="outline"
                type="button"
                disabled={submitting}
                onClick={() => handleCreateExpense(true)}
              >
                Save & Submit
              </Button>
              <Button
                type="button"
                disabled={submitting}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => handleCreateExpense(true, true)}
              >
                <Zap className="mr-1 h-3.5 w-3.5" />
                ⚡ Save & Post Now
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
