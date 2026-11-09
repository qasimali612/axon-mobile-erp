"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileLock2,
  FilePlus2,
  Layers,
  Plus,
  Printer,
  Scale,
  Search,
  Trash2,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

type Journal = {
  id: string;
  voucherNumber: string;
  postingDate: string | Date;
  voucherType: string;
  status: string;
  narration: string;
  totalDebit: string;
  branch: { code: string; name: string };
  preparedBy: { fullName: string };
  _count: { lines: number };
};

type Account = { id: string; code: string; name: string; accountClass: string; bankAccountId: string | null };
type Option = { id: string; code: string; name: string };
type DraftLine = { accountId: string; description: string; debit: string; credit: string };

function moneyUnits(value: string) {
  const match = value.trim().match(/^(\d{0,15})(?:\.(\d{0,4}))?$/);
  if (!match || (!match[1] && !match[2])) return 0n;
  return BigInt(match[1] || "0") * 10_000n + BigInt((match[2] || "").padEnd(4, "0"));
}

function amountFromUnits(value: bigint) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${absolute / 10_000n}.${String(absolute % 10_000n).padStart(4, "0")}`;
}

function statusTone(status: string): "green" | "amber" | "red" | "slate" {
  if (status === "POSTED") return "green";
  if (status === "APPROVED" || status === "SUBMITTED") return "amber";
  if (status === "REVERSED" || status === "REJECTED") return "red";
  return "slate";
}

const VOUCHER_PRESETS = [
  { label: "General Journal", type: "GENERAL", cashFlow: "NONE", narration: "General adjusting journal entry" },
  { label: "Opening Balances", type: "OPENING", cashFlow: "NONE", narration: "Opening balance setup entry" },
  { label: "Cash to Bank Transfer", type: "GENERAL", cashFlow: "OPERATING", narration: "Counter cash deposit to commercial bank account" },
  { label: "Operating Expense", type: "GENERAL", cashFlow: "OPERATING", narration: "Direct operating expense settlement voucher" },
  { label: "Period Accrual", type: "ACCRUAL", cashFlow: "NONE", narration: "Monthly accrual and period matching journal" },
];

export function JournalRegister({
  journals,
  accounts,
  branches,
  costCenters,
  departments,
  currency,
  canCreate,
  initialSearch,
  initialStatus,
}: {
  journals: Journal[];
  accounts: Account[];
  branches: Option[];
  costCenters: Option[];
  departments: Option[];
  currency: string;
  canCreate: boolean;
  initialSearch: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState(initialSearch || "");
  const [statusFilter, setStatusFilter] = useState(initialStatus || "ALL");

  useEffect(() => {
    if (searchParams.get("new") === "1" && canCreate) {
      setCreateOpen(true);
    }
  }, [searchParams, canCreate]);

  // Form State
  const [branchId, setBranchId] = useState(branches[0]?.id || "");
  const [postingDate, setPostingDate] = useState(new Date().toISOString().slice(0, 10));
  const [voucherType, setVoucherType] = useState("GENERAL");
  const [cashFlowActivity, setCashFlowActivity] = useState("NONE");
  const [narration, setNarration] = useState("");
  const [referenceDocument, setReferenceDocument] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { accountId: accounts[0]?.id || "", description: "", debit: "", credit: "" },
    { accountId: accounts[1]?.id || "", description: "", debit: "", credit: "" },
  ]);

  // Executive KPIs
  const metrics = useMemo(() => {
    let totalDebitTurnover = 0;
    let postedCount = 0;
    let pendingCount = 0;
    let draftCount = 0;
    let reversedCount = 0;

    for (const j of journals) {
      const debit = Number(j.totalDebit) || 0;
      if (j.status === "POSTED") {
        postedCount++;
        totalDebitTurnover += debit;
      } else if (j.status === "SUBMITTED" || j.status === "APPROVED") {
        pendingCount++;
      } else if (j.status === "DRAFT") {
        draftCount++;
      } else if (j.status === "REVERSED") {
        reversedCount++;
      }
    }

    return {
      total: journals.length,
      postedCount,
      pendingCount,
      draftCount,
      reversedCount,
      totalDebitTurnover,
    };
  }, [journals]);

  // Filtered Journals List
  const visible = useMemo(() => {
    return journals.filter((j) => {
      if (statusFilter !== "ALL" && j.status !== statusFilter) return false;
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesNum = j.voucherNumber.toLowerCase().includes(query);
        const matchesNarration = j.narration.toLowerCase().includes(query);
        const matchesUser = j.preparedBy.fullName.toLowerCase().includes(query);
        const matchesBranch = j.branch.name.toLowerCase().includes(query) || j.branch.code.toLowerCase().includes(query);
        if (!matchesNum && !matchesNarration && !matchesUser && !matchesBranch) return false;
      }
      return true;
    });
  }, [journals, statusFilter, search]);

  const totals = useMemo(
    () =>
      lines.reduce(
        (total, line) => ({ debit: total.debit + moneyUnits(line.debit), credit: total.credit + moneyUnits(line.credit) }),
        { debit: 0n, credit: 0n },
      ),
    [lines],
  );

  const diffBig = totals.debit >= totals.credit ? totals.debit - totals.credit : totals.credit - totals.debit;
  const isBalanced = totals.debit > 0n && totals.debit === totals.credit;

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)));
  }

  function autoBalanceLine(targetIndex: number) {
    if (totals.debit === totals.credit) {
      toast.info("Voucher is already balanced.");
      return;
    }
    if (totals.debit > totals.credit) {
      // Debits exceed credits -> target line needs credit = diff
      const needed = totals.debit - totals.credit;
      updateLine(targetIndex, { credit: amountFromUnits(needed), debit: "" });
      toast.success(`Auto-balanced Line #${targetIndex + 1} with Credit ${formatMoney(amountFromUnits(needed), currency)}`);
    } else {
      // Credits exceed debits -> target line needs debit = diff
      const needed = totals.credit - totals.debit;
      updateLine(targetIndex, { debit: amountFromUnits(needed), credit: "" });
      toast.success(`Auto-balanced Line #${targetIndex + 1} with Debit ${formatMoney(amountFromUnits(needed), currency)}`);
    }
  }

  function applyPreset(preset: (typeof VOUCHER_PRESETS)[0]) {
    setVoucherType(preset.type);
    setCashFlowActivity(preset.cashFlow);
    setNarration(preset.narration);
    setLines((curr) =>
      curr.map((l) => ({
        ...l,
        description: l.description || preset.narration,
      }))
    );
    toast.success(`Applied preset: ${preset.label}`);
  }

  function openNewDraftModal() {
    setBranchId(branches[0]?.id || "");
    setPostingDate(new Date().toISOString().slice(0, 10));
    setVoucherType("GENERAL");
    setCashFlowActivity("NONE");
    setNarration("");
    setReferenceDocument("");
    setCostCenterId("");
    setDepartmentId("");
    setLines([
      { accountId: accounts[0]?.id || "", description: "", debit: "", credit: "" },
      { accountId: accounts[1]?.id || "", description: "", debit: "", credit: "" },
    ]);
    setCreateOpen(true);
  }

  async function handleCreateJournal(action: "draft" | "submit" | "post") {
    if (!branchId || !postingDate || !narration.trim()) {
      toast.error("Please fill in Branch, Posting Date, and Narration.");
      return;
    }
    if (!isBalanced) {
      toast.error("Voucher is unbalanced. Total Debits must equal Total Credits.");
      return;
    }
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].accountId) {
        toast.error(`Line #${i + 1} is missing an account.`);
        return;
      }
      if (!lines[i].description.trim()) {
        lines[i].description = narration;
      }
    }

    setSaving(true);
    try {
      const response = await fetch("/api/finance/journals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          postingDate,
          voucherType,
          cashFlowActivity,
          narration,
          referenceDocument: referenceDocument || null,
          costCenterId: costCenterId || null,
          departmentId: departmentId || null,
          idempotencyKey: crypto.randomUUID(),
          lines: lines.map((line) => ({
            ...line,
            description: line.description.trim() || narration,
            debit: line.debit || "0",
            credit: line.credit || "0",
            bankAccountId: accounts.find((account) => account.id === line.accountId)?.bankAccountId || null,
          })),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || "Journal draft could not be created.");

      const voucherId = body.data.id;
      const voucherNum = body.data.voucherNumber;

      if (action === "submit" || action === "post") {
        const subRes = await fetch(`/api/finance/journals/${voucherId}/submit`, { method: "POST" });
        const subBody = await subRes.json().catch(() => null);
        if (!subRes.ok) throw new Error(subBody?.error?.message || "Draft created but submit failed.");
      }

      if (action === "post") {
        try {
          const appRes = await fetch(`/api/finance/journals/${voucherId}/approve`, { method: "POST" });
          if (appRes.ok) {
            const postRes = await fetch(`/api/finance/journals/${voucherId}/post`, { method: "POST" });
            if (postRes.ok) {
              toast.success(`⚡ Voucher ${voucherNum} posted to General Ledger!`, {
                action: {
                  label: "Print Voucher",
                  onClick: () => window.open(`/finance/journals/${voucherId}/print`, "_blank"),
                },
              });
              setCreateOpen(false);
              router.push(`/finance/journals/${voucherId}`);
              router.refresh();
              return;
            }
          }
        } catch {
          // Maker-checker policy stops at submitted in multi-user mode
        }
      }

      if (action === "submit") {
        toast.success(`Voucher ${voucherNum} submitted for review.`);
      } else {
        toast.success(`Voucher draft ${voucherNum} created.`);
      }
      setCreateOpen(false);
      router.push(`/finance/journals/${voucherId}`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Journal creation failed.");
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const headers = ["Voucher Number", "Posting Date", "Voucher Type", "Status", "Total Debit", "Total Credit", "Branch", "Prepared By", "Narration"];
    const rows = visible.map((j) => [
      j.voucherNumber,
      formatDate(j.postingDate),
      j.voucherType,
      j.status,
      j.totalDebit,
      j.totalDebit,
      `${j.branch.code} - ${j.branch.name}`,
      j.preparedBy.fullName,
      j.narration,
    ]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `journal-register-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${visible.length} journal vouchers to CSV`);
  }

  return (
    <>
      {/* Top Header */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="kicker">General Ledger Books</span>
            <Badge tone="green">Double-Entry Ledger</Badge>
          </div>
          <h1 className="text-2xl font-black text-slate-950 sm:text-[30px]">Journal Register</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Immutable financial postings, operational expense vouchers, adjustments, and complete audit custody.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          {canCreate ? (
            <Button onClick={openNewDraftModal}>
              <FilePlus2 className="h-4 w-4" />
              New Journal Draft
            </Button>
          ) : null}
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Vouchers</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600">
              <Layers className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">{metrics.total}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {metrics.postedCount} posted · {metrics.pendingCount + metrics.draftCount} pending
          </p>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Posted & Immutable</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-700">{metrics.postedCount}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">General ledger validated</p>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Drafts / In Review</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-600">
              <Clock className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-amber-700">{metrics.pendingCount + metrics.draftCount}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Pending final posting</p>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total GL Turnover</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-purple-50 text-purple-600">
              <Scale className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black text-purple-700">{formatMoney(metrics.totalDebitTurnover, currency)}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Total debit volume posted</p>
        </div>
      </div>

      {/* Filter and Status Tabs */}
      <div className="surface mb-5 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by voucher number, narration, branch, or preparer…"
              className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-8 text-xs outline-none focus:border-blue-500"
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
        </div>

        {/* Status Filter Chips */}
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
          {["ALL", "DRAFT", "SUBMITTED", "APPROVED", "POSTED", "REVERSED"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold transition ${
                statusFilter === status
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {status === "ALL" ? "All Vouchers" : titleCase(status)}
              <span className={`ml-1.5 rounded-full px-1.5 py-0.2 text-[9px] ${
                statusFilter === status ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
              }`}>
                {status === "ALL" ? journals.length : journals.filter((j) => j.status === status).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Journal Vouchers Table */}
      <section className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] text-left">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Voucher #</th>
                <th className="px-4 py-3">Posting Date</th>
                <th className="px-4 py-3">Type & Branch</th>
                <th className="px-4 py-3">Narration / Purpose</th>
                <th className="px-4 py-3">Prepared By</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Debit Total</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.length ? (
                visible.map((journal) => (
                  <tr key={journal.id} className="text-xs transition hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/finance/journals/${journal.id}`}
                        className="font-mono text-xs font-black text-blue-700 hover:underline inline-flex items-center gap-1"
                      >
                        {journal.voucherNumber}
                        <ArrowRight className="h-3 w-3 opacity-40 hover:opacity-100" />
                      </Link>
                      <div className="mt-0.5 text-[10px] text-slate-400">
                        {journal._count.lines} balanced line{journal._count.lines === 1 ? "" : "s"}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 font-medium text-slate-700">
                      {formatDate(journal.postingDate)}
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="font-semibold text-slate-800">{titleCase(journal.voucherType)}</span>
                      <span className="block text-[10px] text-slate-400">{journal.branch.code} · {journal.branch.name}</span>
                    </td>

                    <td className="max-w-[320px] px-4 py-3.5">
                      <span className="block truncate text-slate-800 font-medium">{journal.narration}</span>
                    </td>

                    <td className="px-4 py-3.5 text-slate-500">
                      {journal.preparedBy.fullName}
                    </td>

                    <td className="px-4 py-3.5">
                      <Badge tone={statusTone(journal.status)}>
                        {titleCase(journal.status)}
                      </Badge>
                    </td>

                    <td className="px-4 py-3.5 text-right font-mono text-sm font-black tabular-nums text-slate-900">
                      {formatMoney(journal.totalDebit, currency)}
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Link
                          href={`/finance/journals/${journal.id}`}
                          className="inline-grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                          title="View Voucher Details"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                        <a
                          href={`/finance/journals/${journal.id}/print`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                          title="Print Official Voucher"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center text-xs text-slate-400">
                    No journal vouchers match the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* New Journal Draft Modal */}
      {createOpen ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-slate-900">New Journal Draft</h2>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    Double-Entry GL
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Total debits must strictly equal total credits. Subledger control accounts are protected against direct entry.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 p-5 sm:p-6">
              {/* Quick Voucher Presets */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  ⚡ Quick Business Presets
                </span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {VOUCHER_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Voucher Context Fields */}
              <div className="grid gap-4 md:grid-cols-3">
                <label className="field-label">
                  Branch *
                  <select
                    required
                    value={branchId}
                    onChange={(event) => setBranchId(event.target.value)}
                    className="field-input font-medium"
                  >
                    <option value="">Select Branch</option>
                    {branches.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} · {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field-label">
                  Posting Date *
                  <input
                    required
                    type="date"
                    value={postingDate}
                    onChange={(event) => setPostingDate(event.target.value)}
                    className="field-input font-medium"
                  />
                </label>

                <label className="field-label">
                  Voucher Type *
                  <select
                    value={voucherType}
                    onChange={(event) => setVoucherType(event.target.value)}
                    className="field-input font-medium"
                  >
                    {["GENERAL", "OPENING", "ADJUSTMENT", "ACCRUAL", "PREPAYMENT", "RECLASSIFICATION"].map((value) => (
                      <option key={value} value={value}>
                        {titleCase(value)} Voucher
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field-label md:col-span-2">
                  Narration / Business Purpose *
                  <input
                    required
                    minLength={5}
                    value={narration}
                    onChange={(event) => setNarration(event.target.value)}
                    className="field-input font-medium"
                    placeholder="Document business purpose, invoice reference, or check number"
                  />
                </label>

                <label className="field-label">
                  Reference Document
                  <input
                    value={referenceDocument}
                    onChange={(event) => setReferenceDocument(event.target.value)}
                    className="field-input"
                    placeholder="e.g. INV-8821 / CHQ-1049"
                  />
                </label>

                <label className="field-label">
                  Cost Center
                  <select
                    value={costCenterId}
                    onChange={(event) => setCostCenterId(event.target.value)}
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

                <label className="field-label">
                  Department
                  <select
                    value={departmentId}
                    onChange={(event) => setDepartmentId(event.target.value)}
                    className="field-input"
                  >
                    <option value="">None</option>
                    {departments.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} · {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field-label">
                  Cash-Flow Classification
                  <select
                    value={cashFlowActivity}
                    onChange={(event) => setCashFlowActivity(event.target.value)}
                    className="field-input"
                  >
                    <option value="NONE">Not a Cash Movement (None)</option>
                    <option value="OPERATING">Operating Cash Flow</option>
                    <option value="INVESTING">Investing Cash Flow</option>
                    <option value="FINANCING">Financing Cash Flow</option>
                  </select>
                </label>
              </div>

              {/* Journal Lines Editor Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[840px] text-left">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5">#</th>
                      <th className="px-3 py-2.5">General Ledger Account</th>
                      <th className="px-3 py-2.5">Line Description</th>
                      <th className="px-3 py-2.5 text-right w-36">Debit ({currency})</th>
                      <th className="px-3 py-2.5 text-right w-36">Credit ({currency})</th>
                      <th className="px-2 py-2.5 text-center w-28">Auto-Balance</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((line, index) => {
                      const selectedAcc = accounts.find((a) => a.id === line.accountId);
                      return (
                        <tr key={index} className="hover:bg-slate-50/50">
                          <td className="px-3 py-2 text-[10px] font-mono text-slate-400">{index + 1}</td>
                          <td className="px-3 py-2">
                            <select
                              required
                              value={line.accountId}
                              onChange={(event) => updateLine(index, { accountId: event.target.value })}
                              className="h-9 w-full min-w-[240px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold"
                            >
                              <option value="">Select Account…</option>
                              {accounts.map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.code} · {account.name} ({account.accountClass})
                                </option>
                              ))}
                            </select>
                            {selectedAcc ? (
                              <div className="mt-0.5 text-[9px] text-slate-400 font-mono">
                                Class: {selectedAcc.accountClass}
                              </div>
                            ) : null}
                          </td>

                          <td className="px-3 py-2">
                            <input
                              required
                              minLength={2}
                              value={line.description}
                              onChange={(event) => updateLine(index, { description: event.target.value })}
                              className="h-9 w-full min-w-[220px] rounded-lg border border-slate-200 px-2.5 text-xs"
                              placeholder={narration || "Line description"}
                            />
                          </td>

                          <td className="px-3 py-2">
                            <input
                              inputMode="decimal"
                              value={line.debit}
                              disabled={Boolean(line.credit)}
                              onChange={(event) => updateLine(index, { debit: event.target.value })}
                              className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-right font-mono text-xs font-bold tabular-nums disabled:bg-slate-50 disabled:text-slate-300"
                              placeholder="0.00"
                            />
                          </td>

                          <td className="px-3 py-2">
                            <input
                              inputMode="decimal"
                              value={line.credit}
                              disabled={Boolean(line.debit)}
                              onChange={(event) => updateLine(index, { credit: event.target.value })}
                              className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-right font-mono text-xs font-bold tabular-nums disabled:bg-slate-50 disabled:text-slate-300"
                              placeholder="0.00"
                            />
                          </td>

                          <td className="px-2 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => autoBalanceLine(index)}
                              className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700 hover:bg-blue-100 transition"
                              title="Set line amount to balance voucher"
                            >
                              <Zap className="inline h-3 w-3 mr-0.5" />
                              Balance
                            </button>
                          </td>

                          <td className="pr-2 text-right">
                            <button
                              type="button"
                              disabled={lines.length <= 2}
                              onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                              className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                              title="Delete Line"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                    <tr>
                      <td colSpan={3} className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            setLines((current) => [
                              ...current,
                              { accountId: accounts[0]?.id || "", description: narration, debit: "", credit: "" },
                            ])
                          }
                          className="flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:text-blue-800"
                        >
                          <Plus className="h-4 w-4" />
                          Add Journal Line
                        </button>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-sm font-black tabular-nums text-slate-900">
                        {formatMoney(amountFromUnits(totals.debit), currency)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-sm font-black tabular-nums text-slate-900">
                        {formatMoney(amountFromUnits(totals.credit), currency)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Real-time Double-Entry Balancing Card */}
              <div>
                {isBalanced ? (
                  <div className="flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      <div>
                        <span className="font-bold text-sm">✓ Perfect Double-Entry Balance</span>
                        <p className="text-xs text-emerald-700 mt-0.5">
                          Debit total equals credit total ({formatMoney(amountFromUnits(totals.debit), currency)}). Ready for posting.
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full bg-emerald-200/80 px-2.5 py-1 text-xs font-black text-emerald-900">
                      Balanced
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <Scale className="h-5 w-5 text-amber-600" />
                      <div>
                        <span className="font-bold text-sm">⚠️ Out-of-Balance by {formatMoney(amountFromUnits(diffBig), currency)}</span>
                        <p className="text-xs text-amber-700 mt-0.5">
                          General ledger posting requires Total Debits to equal Total Credits.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => autoBalanceLine(lines.length - 1)}
                      className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-black text-white hover:bg-amber-700 transition"
                    >
                      ⚡ Auto-Balance Last Line
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving || totals.debit <= 0n}
                  onClick={() => handleCreateJournal("draft")}
                >
                  Save as Draft
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  disabled={saving || !isBalanced}
                  onClick={() => handleCreateJournal("submit")}
                >
                  Submit for Approval
                </Button>

                <Button
                  type="button"
                  disabled={saving || !isBalanced}
                  onClick={() => handleCreateJournal("post")}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black"
                >
                  <Zap className="h-4 w-4" />
                  {saving ? "Posting…" : "⚡ Save & Post Now"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
