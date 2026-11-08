"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  CreditCard,
  ExternalLink,
  Eye,
  FilePlus2,
  FileText,
  Filter,
  Info,
  Layers,
  Loader2,
  Printer,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  UserRound,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney, titleCase } from "@/lib/utils";

type PaymentRow = {
  id: string;
  paymentNumber: string;
  paymentDate: string;
  direction: string;
  status: string;
  currencyCode: string;
  amount: string | number;
  reference: string | null;
  notes: string | null;
  branch: { code: string; name: string };
  customer: { code: string; name: string } | null;
  supplier: { code: string; name: string } | null;
  bankAccount: { code: string; bankName: string } | null;
  cashAccount: { code: string; name: string } | null;
  preparedBy: { fullName: string };
  approvedBy: { fullName: string } | null;
  postedBy: { fullName: string } | null;
  journalEntry: { id: string; voucherNumber: string } | null;
  _count?: { allocations: number };
  allocations?: Array<{
    id: string;
    amount: string | number;
    salesInvoice?: { invoiceNumber: string; invoiceDate: string; grandTotal: string | number };
    purchaseReceipt?: { receiptNumber: string; receiptDate: string; grandTotal: string | number };
  }>;
};

function statusTone(status: string) {
  if (status === "POSTED") return "green" as const;
  if (status === "APPROVED") return "blue" as const;
  if (status === "SUBMITTED") return "amber" as const;
  if (status === "REVERSED" || status === "CANCELLED") return "red" as const;
  return "slate" as const;
}

export function PaymentRegister({
  currency,
  userId,
  permissions,
  initialInvoiceId,
  initialReceiptId,
  initialAmount,
}: {
  currency: string;
  userId: string;
  permissions: string[];
  initialInvoiceId?: string;
  initialReceiptId?: string;
  initialAmount?: string;
}) {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [lookups, setLookups] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [directionFilter, setDirectionFilter] = useState("ALL");
  const [branchFilter, setBranchFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);

  // Detail Modal state
  const [selectedPayment, setSelectedPayment] = useState<PaymentRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create Modal state
  const [branchId, setBranchId] = useState("");
  const [direction, setDirection] = useState("CUSTOMER_RECEIPT");
  const [partyId, setPartyId] = useState("");
  const [partySearch, setPartySearch] = useState("");
  const [settlementFilter, setSettlementFilter] = useState<"ALL" | "CASH" | "BANK">("ALL");
  const [isPostingDirect, setIsPostingDirect] = useState(false);
  const [accountChoice, setAccountChoice] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [targetId, setTargetId] = useState("");
  const [allocationAmount, setAllocationAmount] = useState("");
  const prefillApplied = useRef(false);

  const can = (key: string) => permissions.includes(key);
  const isCustomer = direction.startsWith("CUSTOMER");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listResponse, lookupResponse] = await Promise.all([
        fetch("/api/payments?pageSize=200"),
        lookups ? Promise.resolve(null) : fetch("/api/operations/lookups"),
      ]);

      const list = await listResponse.json().catch(() => null);
      if (!listResponse.ok) {
        setLoading(false);
        return toast.error(list?.error?.message || "Payments could not be loaded.");
      }
      setRows(list.data || []);

      if (lookupResponse) {
        const body = await lookupResponse.json().catch(() => null);
        if (lookupResponse.ok && body?.data) {
          setLookups(body.data);
          setBranchId(body.data.branches[0]?.id || "");

          if (!prefillApplied.current && (initialInvoiceId || initialReceiptId)) {
            prefillApplied.current = true;
            const target = initialInvoiceId
              ? body.data.salesInvoices?.find((item: any) => item.id === initialInvoiceId)
              : body.data.purchaseReceipts?.find((item: any) => item.id === initialReceiptId);

            if (target && permissions.includes("PAYMENT_CREATE")) {
              const customerTarget = Boolean(initialInvoiceId);
              const suggested = initialAmount || String(target.grandTotal);
              setDirection(customerTarget ? "CUSTOMER_RECEIPT" : "SUPPLIER_PAYMENT");
              setBranchId(target.branchId);
              setPartyId(customerTarget ? target.customerId : target.supplierId);
              setTargetId(target.id);
              setAmount(suggested);
              setAllocationAmount(suggested);
              setReference(`Settlement for ${target.invoiceNumber || target.receiptNumber}`);
              setOpen(true);
            } else if (!target) {
              toast.error("The requested posted document is unavailable or outside your access scope.");
            }
          }
        }
      }
    } catch {
      toast.error("Network error while loading payments.");
    } finally {
      setLoading(false);
    }
  }, [lookups]);

  useEffect(() => {
    void load();
  }, [load]);

  const accounts = useMemo(() => {
    return [
      ...(lookups?.banks || [])
        .filter((item: any) => !branchId || item.branchId === branchId)
        .map((item: any) => ({
          value: `bank:${item.id}`,
          label: `${item.code} · ${item.bankName} (${item.accountNumber || "A/C"})`,
          type: "bank",
        })),
      ...(lookups?.cashAccounts || [])
        .filter((item: any) => !item.branchId || !branchId || item.branchId === branchId)
        .map((item: any) => ({
          value: `cash:${item.id}`,
          label: `${item.code} · ${item.name}`,
          type: "cash",
        })),
    ];
  }, [branchId, lookups]);

  useEffect(() => {
    if (!accounts.some((item) => item.value === accountChoice)) {
      setAccountChoice(accounts[0]?.value || "");
    }
  }, [branchId, lookups, accounts]);

  const targets = useMemo(() => {
    const list = (isCustomer ? lookups?.salesInvoices : lookups?.purchaseReceipts) || [];
    return list.filter(
      (item: any) =>
        (!partyId || (isCustomer ? item.customerId : item.supplierId) === partyId) &&
        (!branchId || item.branchId === branchId)
    );
  }, [isCustomer, lookups, partyId, branchId]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      if (settlementFilter === "CASH") return acc.type === "cash";
      if (settlementFilter === "BANK") return acc.type === "bank";
      return true;
    });
  }, [accounts, settlementFilter]);

  const partyList = useMemo(() => {
    return (isCustomer ? lookups?.customers : lookups?.suppliers) || [];
  }, [isCustomer, lookups]);

  const filteredPartyList = useMemo(() => {
    if (!partySearch.trim()) return partyList;
    const q = partySearch.toLowerCase().trim();
    return partyList.filter(
      (p: any) =>
        p.name?.toLowerCase().includes(q) ||
        p.code?.toLowerCase().includes(q) ||
        (p.phone && String(p.phone).includes(q))
    );
  }, [partyList, partySearch]);

  // Selected party info (credit limit, terms)
  const selectedParty = useMemo(() => {
    if (!partyId) return null;
    const list = isCustomer ? lookups?.customers : lookups?.suppliers;
    return list?.find((item: any) => item.id === partyId) || null;
  }, [partyId, isCustomer, lookups]);

  async function directPost(row: PaymentRow) {
    setActingId(row.id);
    try {
      if (row.status === "DRAFT") {
        const subRes = await fetch(`/api/payments/${row.id}/submit`, { method: "POST" });
        if (!subRes.ok) {
          const body = await subRes.json().catch(() => null);
          return toast.error(body?.error?.message || "Failed to submit payment draft.");
        }
        const appRes = await fetch(`/api/payments/${row.id}/approve`, { method: "POST" });
        if (!appRes.ok) {
          const body = await appRes.json().catch(() => null);
          return toast.error(body?.error?.message || "Failed to approve payment.");
        }
      } else if (row.status === "SUBMITTED") {
        const appRes = await fetch(`/api/payments/${row.id}/approve`, { method: "POST" });
        if (!appRes.ok) {
          const body = await appRes.json().catch(() => null);
          return toast.error(body?.error?.message || "Failed to approve payment.");
        }
      }
      const postRes = await fetch(`/api/payments/${row.id}/post`, { method: "POST" });
      const body = await postRes.json().catch(() => null);
      if (!postRes.ok) {
        return toast.error(body?.error?.message || "Failed to post payment.");
      }
      toast.success(`${row.paymentNumber} posted to GL!`, {
        action: {
          label: "Print Voucher",
          onClick: () => window.open(`/finance/payments/${row.id}/print`, "_blank"),
        },
        duration: 8000,
      });
      void load();
      if (selectedPayment?.id === row.id) {
        openDetail(row.id);
      }
    } catch {
      toast.error("Network error posting payment.");
    } finally {
      setActingId(null);
    }
  }

  async function act(row: PaymentRow, action: string) {
    setActingId(row.id);
    try {
      const response = await fetch(`/api/payments/${row.id}/${action}`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        return toast.error(body?.error?.message || `${titleCase(action)} failed.`);
      }
      toast.success(`${row.paymentNumber} has been ${action}ed.`);
      void load();
      if (selectedPayment?.id === row.id) {
        openDetail(row.id);
      }
    } finally {
      setActingId(null);
    }
  }

  async function openDetail(id: string) {
    setDetailLoading(true);
    setSelectedPayment(null);
    try {
      const response = await fetch(`/api/payments/${id}`);
      const body = await response.json().catch(() => null);
      if (response.ok && body?.data) {
        setSelectedPayment(body.data);
      } else {
        toast.error("Could not load payment details.");
      }
    } catch {
      toast.error("Network error loading voucher.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleCreate(event: React.FormEvent, andPost = false) {
    event.preventDefault();
    if (!partyId) {
      return toast.error(`Please select a ${isCustomer ? "customer" : "supplier"}.`);
    }
    if (!amount || Number(amount) <= 0) {
      return toast.error("Please enter a valid payment amount greater than zero.");
    }
    if (!accountChoice) {
      return toast.error("Please select a settlement account (Cash or Bank).");
    }
    setSaving(true);
    if (andPost) setIsPostingDirect(true);
    const [kind, accountId] = accountChoice.split(":");
    const allocation =
      targetId && allocationAmount
        ? {
            salesInvoiceId: isCustomer ? targetId : null,
            purchaseReceiptId: isCustomer ? null : targetId,
            amount: allocationAmount,
          }
        : null;

    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          customerId: isCustomer ? partyId : null,
          supplierId: isCustomer ? null : partyId,
          bankAccountId: kind === "bank" ? accountId : null,
          cashAccountId: kind === "cash" ? accountId : null,
          paymentDate: date,
          direction,
          currencyCode: currency,
          amount,
          reference: reference || null,
          notes: notes || null,
          idempotencyKey: crypto.randomUUID(),
          allocations: allocation ? [allocation] : [],
        }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        return toast.error(body?.error?.message || "Payment draft could not be created.");
      }

      const created = body.data;

      if (andPost) {
        try {
          await fetch(`/api/payments/${created.id}/submit`, { method: "POST" });
          await fetch(`/api/payments/${created.id}/approve`, { method: "POST" });
          const postRes = await fetch(`/api/payments/${created.id}/post`, { method: "POST" });
          if (postRes.ok) {
            toast.success(`${created.paymentNumber} created and posted to GL successfully!`, {
              action: {
                label: "Print Voucher",
                onClick: () => window.open(`/finance/payments/${created.id}/print`, "_blank"),
              },
              duration: 8000,
            });
          } else {
            toast.success(`${created.paymentNumber} draft created & submitted for approval.`);
          }
        } catch {
          toast.success(`${created.paymentNumber} draft created.`);
        }
      } else {
        toast.success(`${created.paymentNumber} draft created successfully.`);
      }

      setOpen(false);
      resetForm();
      void load();
    } catch {
      toast.error("Network error while creating payment.");
    } finally {
      setSaving(false);
      setIsPostingDirect(false);
    }
  }

  function resetForm() {
    setPartyId("");
    setPartySearch("");
    setTargetId("");
    setAmount("");
    setAllocationAmount("");
    setReference("");
    setNotes("");
  }

  // Filtered rows
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
      if (directionFilter !== "ALL" && row.direction !== directionFilter) return false;
      if (branchFilter !== "ALL" && row.branch.code !== branchFilter) return false;

      if (search) {
        const query = search.toLowerCase();
        const partyName = (row.customer?.name || row.supplier?.name || "").toLowerCase();
        const partyCode = (row.customer?.code || row.supplier?.code || "").toLowerCase();
        const paymentNum = row.paymentNumber.toLowerCase();
        const ref = (row.reference || "").toLowerCase();
        const voucher = (row.journalEntry?.voucherNumber || "").toLowerCase();
        if (
          !partyName.includes(query) &&
          !partyCode.includes(query) &&
          !paymentNum.includes(query) &&
          !ref.includes(query) &&
          !voucher.includes(query)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [rows, statusFilter, directionFilter, branchFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let collected = 0;
    let paidOut = 0;
    let pendingCount = 0;

    for (const row of rows) {
      const amt = Number(row.amount) || 0;
      if (row.status === "POSTED") {
        if (row.direction === "CUSTOMER_RECEIPT" || row.direction === "SUPPLIER_REFUND") {
          collected += amt;
        } else {
          paidOut += amt;
        }
      } else if (row.status === "SUBMITTED" || row.status === "APPROVED") {
        pendingCount++;
      }
    }

    return { collected, paidOut, pendingCount };
  }, [rows]);

  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="kicker">Cash, bank & party settlement</span>
            <Badge tone="green">Double-entry verified</Badge>
          </div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">
            Receipts & Payments
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Real-time party settlements posted against receivables or payables with full GL audit trails.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          {can("PAYMENT_CREATE") ? (
            <>
              <Button
                onClick={() => {
                  setDirection("CUSTOMER_RECEIPT");
                  setPartyId("");
                  setPartySearch("");
                  setTargetId("");
                  setOpen(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm"
              >
                <ArrowDownLeft className="h-4 w-4" />
                New Customer Receipt
              </Button>
              <Button
                onClick={() => {
                  setDirection("SUPPLIER_PAYMENT");
                  setPartyId("");
                  setPartySearch("");
                  setTargetId("");
                  setOpen(true);
                }}
                variant="outline"
                className="border-blue-200 text-blue-700 hover:bg-blue-50 gap-1.5"
              >
                <ArrowUpRight className="h-4 w-4" />
                New Supplier Payment
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* Metrics Banner */}
      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              Total Customer Receipts
            </span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
              <ArrowDownLeft className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tabular-nums text-emerald-950">
            {formatMoney(metrics.collected, currency)}
          </p>
          <span className="mt-1 block text-[11px] text-emerald-600">Posted collections</span>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
              Total Supplier Payments
            </span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-100 text-blue-700">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tabular-nums text-blue-950">
            {formatMoney(metrics.paidOut, currency)}
          </p>
          <span className="mt-1 block text-[11px] text-blue-600">Posted disbursements</span>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
              Pending Approvals / Posts
            </span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-100 text-amber-700">
              <BadgeCheck className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tabular-nums text-amber-950">
            {metrics.pendingCount}
          </p>
          <span className="mt-1 block text-[11px] text-amber-600">Awaiting supervisor review</span>
        </div>
      </section>

      {/* Filter & Search Toolbar */}
      <section className="surface mb-5 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by payment #, party name, code, cheque/ref, or voucher..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-2 rounded p-0.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={directionFilter}
              onChange={(e) => {
                setDirectionFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700"
            >
              <option value="ALL">All Types</option>
              <option value="CUSTOMER_RECEIPT">Customer Receipts</option>
              <option value="SUPPLIER_PAYMENT">Supplier Payments</option>
              <option value="CUSTOMER_REFUND">Customer Refunds</option>
              <option value="SUPPLIER_REFUND">Supplier Refunds</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="APPROVED">Approved</option>
              <option value="POSTED">Posted</option>
              <option value="REVERSED">Reversed</option>
            </select>

            {lookups?.branches && lookups.branches.length > 1 && (
              <select
                value={branchFilter}
                onChange={(e) => {
                  setBranchFilter(e.target.value);
                  setPage(1);
                }}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700"
              >
                <option value="ALL">All Branches</option>
                {lookups.branches.map((b: any) => (
                  <option key={b.id} value={b.code}>
                    {b.code} · {b.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </section>

      {/* Main Table */}
      <section className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b">
              <tr>
                <th className="px-5 py-3">Payment #</th>
                <th className="px-4 py-3">Party (Customer / Supplier)</th>
                <th className="px-4 py-3">Settlement Account</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-20 text-center text-xs text-slate-400">
                    <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-blue-600" />
                    Loading payment records...
                  </td>
                </tr>
              ) : !pagedRows.length ? (
                <tr>
                  <td colSpan={6} className="py-20 text-center text-xs text-slate-400">
                    <Receipt className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    <p className="font-bold text-slate-600">No payment vouchers found</p>
                    <p className="mt-1 text-slate-400">Try adjusting your search or create a new payment draft.</p>
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => (
                  <tr key={row.id} className="text-xs hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => openDetail(row.id)}
                        className="font-bold text-blue-700 hover:underline flex items-center gap-1.5"
                      >
                        {row.paymentNumber}
                        <Eye className="h-3.5 w-3.5 text-slate-400" />
                      </button>
                      <span className="block text-[10px] text-slate-400 mt-0.5">
                        {formatDate(row.paymentDate)} · {titleCase(row.direction)}
                        {row.journalEntry ? (
                          <span className="text-blue-600 ml-1">· {row.journalEntry.voucherNumber}</span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-900">
                        {row.customer?.name || row.supplier?.name}
                      </div>
                      <span className="block text-[10px] text-slate-400">
                        {row.customer?.code || row.supplier?.code} · {row.branch.code}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      <div className="flex items-center gap-1.5">
                        {row.bankAccount ? (
                          <>
                            <Building2 className="h-3.5 w-3.5 text-slate-400" />
                            <span>
                              {row.bankAccount.code} · {row.bankAccount.bankName}
                            </span>
                          </>
                        ) : (
                          <>
                            <Wallet className="h-3.5 w-3.5 text-slate-400" />
                            <span>
                              {row.cashAccount?.code} · {row.cashAccount?.name}
                            </span>
                          </>
                        )}
                      </div>
                      {row.reference && (
                        <span className="block text-[10px] text-slate-400 mt-0.5">
                          Ref: {row.reference}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone={statusTone(row.status)}>{titleCase(row.status)}</Badge>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 tabular-nums text-sm">
                      {formatMoney(row.amount, currency)}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end items-center gap-1.5">
                        {/* Print Receipt / Voucher */}
                        <Link
                          href={`/finance/payments/${row.id}/print`}
                          target="_blank"
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          title="Print Official Voucher"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </Link>

                        {/* View Details */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDetail(row.id)}
                          className="px-2"
                        >
                          View
                        </Button>

                        {/* Fast-Track Direct Post for Authorized Cashier / Manager */}
                        {(row.status === "DRAFT" || row.status === "SUBMITTED") && can("PAYMENT_POST") ? (
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 px-2 text-[11px]"
                            disabled={actingId === row.id}
                            onClick={() => void directPost(row)}
                            title="Direct Post: submit, approve & post voucher to GL"
                          >
                            <Zap className="h-3 w-3" />
                            Post Now
                          </Button>
                        ) : null}

                        {/* Workflow Actions */}
                        {row.status === "DRAFT" && row.preparedBy.fullName && can("PAYMENT_CREATE") ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actingId === row.id}
                            onClick={() => void act(row, "submit")}
                          >
                            Submit
                          </Button>
                        ) : null}

                        {row.status === "SUBMITTED" && can("PAYMENT_APPROVE") ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actingId === row.id}
                            onClick={() => void act(row, "approve")}
                          >
                            <BadgeCheck className="h-3.5 w-3.5 text-blue-600" />
                            Approve
                          </Button>
                        ) : null}

                        {row.status === "APPROVED" && can("PAYMENT_POST") ? (
                          <Button
                            size="sm"
                            disabled={actingId === row.id}
                            onClick={() => void act(row, "post")}
                          >
                            <Banknote className="h-3.5 w-3.5" />
                            Post
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <div>
            Showing {filteredRows.length ? (page - 1) * pageSize + 1 : 0} to{" "}
            {Math.min(page * pageSize, filteredRows.length)} of {filteredRows.length} vouchers
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <span className="font-bold">
              {page} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* VIEW PAYMENT DETAIL MODAL */}
      {selectedPayment || detailLoading ? (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedPayment(null);
          }}
        >
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            {detailLoading ? (
              <div className="p-12 text-center text-slate-400">
                <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-blue-600" />
                Loading voucher details...
              </div>
            ) : selectedPayment ? (
              <>
                <div className="flex items-start justify-between border-b px-6 py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-950">
                        {selectedPayment.paymentNumber}
                      </h2>
                      <Badge tone={statusTone(selectedPayment.status)}>
                        {titleCase(selectedPayment.status)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(selectedPayment.paymentDate)} · {titleCase(selectedPayment.direction)} ·{" "}
                      {selectedPayment.branch?.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/finance/payments/${selectedPayment.id}/print`}
                      target="_blank"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <Printer className="h-3.5 w-3.5" /> Print Voucher
                    </Link>
                    <button
                      type="button"
                      onClick={() => setSelectedPayment(null)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-6 p-6">
                  {/* Summary Cards */}
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <span className="text-[10px] font-bold uppercase text-slate-400">
                        Total Amount
                      </span>
                      <p className="mt-1 text-xl font-black tabular-nums text-slate-900">
                        {formatMoney(selectedPayment.amount, currency)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <span className="text-[10px] font-bold uppercase text-slate-400">
                        Counter Party
                      </span>
                      <p className="mt-1 text-sm font-bold text-slate-900">
                        {selectedPayment.customer?.name || selectedPayment.supplier?.name}
                      </p>
                      <span className="text-[10px] text-slate-500">
                        Code: {selectedPayment.customer?.code || selectedPayment.supplier?.code}
                      </span>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <span className="text-[10px] font-bold uppercase text-slate-400">
                        Account / Method
                      </span>
                      <p className="mt-1 text-sm font-bold text-slate-900">
                        {selectedPayment.bankAccount
                          ? selectedPayment.bankAccount.bankName
                          : selectedPayment.cashAccount?.name}
                      </p>
                      {selectedPayment.reference && (
                        <span className="text-[10px] text-slate-500">
                          Ref: {selectedPayment.reference}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* General Ledger Voucher */}
                  {selectedPayment.journalEntry && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-700" />
                        <div>
                          <p className="text-xs font-bold text-blue-900">
                            General Ledger Journal Entry Posted
                          </p>
                          <p className="text-[11px] text-blue-700">
                            Voucher #{selectedPayment.journalEntry.voucherNumber}
                          </p>
                        </div>
                      </div>
                      <Link
                        href={`/finance/journals`}
                        className="text-xs font-bold text-blue-700 hover:underline flex items-center gap-1"
                      >
                        View in Journals <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  )}

                  {/* Allocations Table */}
                  <div>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Document Allocations
                    </h3>
                    {selectedPayment.allocations && selectedPayment.allocations.length > 0 ? (
                      <div className="overflow-hidden rounded-xl border border-slate-200">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 border-b">
                            <tr>
                              <th className="px-4 py-2 text-slate-500 font-bold">Document #</th>
                              <th className="px-4 py-2 text-slate-500 font-bold">Date</th>
                              <th className="px-4 py-2 text-right text-slate-500 font-bold">Grand Total</th>
                              <th className="px-4 py-2 text-right text-slate-500 font-bold">Allocated Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {selectedPayment.allocations.map((alloc) => {
                              const doc = alloc.salesInvoice || alloc.purchaseReceipt;
                              const docNumber =
                                alloc.salesInvoice?.invoiceNumber ||
                                alloc.purchaseReceipt?.receiptNumber ||
                                "—";
                              const docDate =
                                alloc.salesInvoice?.invoiceDate || alloc.purchaseReceipt?.receiptDate;
                              return (
                                <tr key={alloc.id}>
                                  <td className="px-4 py-2 font-bold text-slate-900">{docNumber}</td>
                                  <td className="px-4 py-2 text-slate-600">
                                    {docDate ? formatDate(docDate) : "—"}
                                  </td>
                                  <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-700">
                                    {doc?.grandTotal ? formatMoney(doc.grandTotal, currency) : "—"}
                                  </td>
                                  <td className="px-4 py-2 text-right font-mono font-bold tabular-nums text-blue-900">
                                    {formatMoney(alloc.amount, currency)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                        This payment has no document allocations; it is treated as an on-account balance advance.
                      </p>
                    )}
                  </div>

                  {selectedPayment.notes && (
                    <div>
                      <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                        Notes & Remarks
                      </h3>
                      <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700 leading-relaxed">
                        {selectedPayment.notes}
                      </p>
                    </div>
                  )}

                  {/* Audit Signatures */}
                  <div className="grid gap-3 border-t pt-4 sm:grid-cols-3 text-xs text-slate-600">
                    <div>
                      <span className="block text-[10px] text-slate-400 uppercase font-bold">Prepared By</span>
                      <b className="text-slate-900">{selectedPayment.preparedBy.fullName}</b>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 uppercase font-bold">Approved By</span>
                      <b className="text-slate-900">
                        {selectedPayment.approvedBy?.fullName || "Not yet approved"}
                      </b>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 uppercase font-bold">Posted By</span>
                      <b className="text-slate-900">
                        {selectedPayment.postedBy?.fullName || "Not yet posted"}
                      </b>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 border-t px-6 py-4 bg-slate-50">
                  <Button variant="outline" onClick={() => setSelectedPayment(null)}>
                    Close
                  </Button>
                  <Link
                    href={`/finance/payments/${selectedPayment.id}/print`}
                    target="_blank"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <Printer className="h-4 w-4" />
                    Print Voucher
                  </Link>
                  {(selectedPayment.status === "DRAFT" || selectedPayment.status === "SUBMITTED") && can("PAYMENT_POST") && (
                    <Button
                      onClick={() => void directPost(selectedPayment)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Post Now to GL
                    </Button>
                  )}
                  {selectedPayment.status === "DRAFT" && can("PAYMENT_CREATE") && (
                    <Button variant="outline" onClick={() => void act(selectedPayment, "submit")}>
                      Submit for Approval
                    </Button>
                  )}
                  {selectedPayment.status === "SUBMITTED" && can("PAYMENT_APPROVE") && (
                    <Button onClick={() => void act(selectedPayment, "approve")}>
                      Approve Voucher
                    </Button>
                  )}
                  {selectedPayment.status === "APPROVED" && can("PAYMENT_POST") && (
                    <Button onClick={() => void act(selectedPayment, "post")}>
                      Post Settlement to GL
                    </Button>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* CREATE NEW PAYMENT MODAL */}
      {open ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div className="flex items-center gap-3">
                <div
                  className={`grid h-10 w-10 place-items-center rounded-xl ${
                    direction === "CUSTOMER_RECEIPT"
                      ? "bg-emerald-100 text-emerald-700"
                      : direction === "SUPPLIER_PAYMENT"
                      ? "bg-blue-100 text-blue-700"
                      : direction === "CUSTOMER_REFUND"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-purple-100 text-purple-700"
                  }`}
                >
                  {direction === "CUSTOMER_RECEIPT" ? (
                    <ArrowDownLeft className="h-5 w-5" />
                  ) : direction === "SUPPLIER_PAYMENT" ? (
                    <ArrowUpRight className="h-5 w-5" />
                  ) : direction === "CUSTOMER_REFUND" ? (
                    <RotateCcw className="h-5 w-5" />
                  ) : (
                    <CornerDownLeft className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-950">
                      {direction === "CUSTOMER_RECEIPT"
                        ? "New Customer Receipt"
                        : direction === "SUPPLIER_PAYMENT"
                        ? "New Supplier Payment"
                        : direction === "CUSTOMER_REFUND"
                        ? "New Customer Refund"
                        : "New Supplier Refund"}
                    </h2>
                    <Badge
                      tone={
                        direction === "CUSTOMER_RECEIPT"
                          ? "green"
                          : direction === "SUPPLIER_PAYMENT"
                          ? "blue"
                          : direction === "CUSTOMER_REFUND"
                          ? "amber"
                          : "slate"
                      }
                    >
                      {direction === "CUSTOMER_RECEIPT" || direction === "SUPPLIER_REFUND"
                        ? "Money In · Inflow"
                        : "Money Out · Outflow"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {direction === "CUSTOMER_RECEIPT"
                      ? "Receive cash or bank transfer from customer with direct AR ledger settlement."
                      : direction === "SUPPLIER_PAYMENT"
                      ? "Disburse funds to supplier against purchase bills or on-account advance."
                      : direction === "CUSTOMER_REFUND"
                      ? "Pay refund to customer for sales return or excess credit."
                      : "Receive refund recovery from vendor for purchase returns."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Direction Selector Cards */}
            <div className="border-b border-slate-100 bg-slate-50/70 p-4">
              <span className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Select Voucher Direction
              </span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  {
                    key: "CUSTOMER_RECEIPT",
                    label: "Customer Receipt",
                    sub: "Money In · AR Collection",
                    color: "border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/20",
                    hover: "hover:border-emerald-300 hover:bg-emerald-50/40",
                    icon: ArrowDownLeft,
                  },
                  {
                    key: "SUPPLIER_PAYMENT",
                    label: "Supplier Payment",
                    sub: "Money Out · AP Settlement",
                    color: "border-blue-500 bg-blue-50 text-blue-900 ring-2 ring-blue-500/20",
                    hover: "hover:border-blue-300 hover:bg-blue-50/40",
                    icon: ArrowUpRight,
                  },
                  {
                    key: "CUSTOMER_REFUND",
                    label: "Customer Refund",
                    sub: "Money Out · Return Payout",
                    color: "border-amber-500 bg-amber-50 text-amber-900 ring-2 ring-amber-500/20",
                    hover: "hover:border-amber-300 hover:bg-amber-50/40",
                    icon: RotateCcw,
                  },
                  {
                    key: "SUPPLIER_REFUND",
                    label: "Supplier Refund",
                    sub: "Money In · Debit Recovery",
                    color: "border-purple-500 bg-purple-50 text-purple-900 ring-2 ring-purple-500/20",
                    hover: "hover:border-purple-300 hover:bg-purple-50/40",
                    icon: CornerDownLeft,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = direction === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setDirection(item.key);
                        setPartyId("");
                        setPartySearch("");
                        setTargetId("");
                        setAllocationAmount("");
                      }}
                      className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                        isSelected ? item.color : `border-slate-200 bg-white text-slate-700 ${item.hover}`
                      }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <Icon className="h-4 w-4" />
                        {isSelected && <span className="h-2 w-2 rounded-full bg-current" />}
                      </div>
                      <span className="mt-2 text-xs font-bold">{item.label}</span>
                      <span className="text-[10px] opacity-75">{item.sub}</span>
                    </button>
                  );
                })}
              </div>

              {/* Accounting Impact Helper */}
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[11px] text-slate-600 border border-slate-200/70">
                <Info className="h-3.5 w-3.5 flex-shrink-0 text-blue-600" />
                <span>
                  <b>GL Impact:</b>{" "}
                  {direction === "CUSTOMER_RECEIPT"
                    ? "Debit Cash / Bank Account (Asset Inflow) · Credit Customer Control Account (AR Reduced)."
                    : direction === "SUPPLIER_PAYMENT"
                    ? "Debit Supplier Control Account (AP Reduced) · Credit Cash / Bank Account (Asset Outflow)."
                    : direction === "CUSTOMER_REFUND"
                    ? "Debit Customer Control Account (AR Increased) · Credit Cash / Bank Account (Asset Outflow)."
                    : "Debit Cash / Bank Account (Asset Inflow) · Credit Supplier Control Account (AP Increased)."}
                </span>
              </div>
            </div>

            {/* Form Content */}
            <form onSubmit={(e) => void handleCreate(e, false)}>
              <div className="grid gap-6 p-6 lg:grid-cols-2">
                {/* Column 1: Operating Details & Counterparty */}
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="field-label">
                      Operating Branch
                      <select
                        required
                        className="field-input"
                        value={branchId}
                        onChange={(e) => setBranchId(e.target.value)}
                      >
                        {lookups?.branches.map((item: any) => (
                          <option key={item.id} value={item.id}>
                            {item.code} · {item.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field-label">
                      Voucher Date
                      <input
                        required
                        type="date"
                        className="field-input"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </label>
                  </div>

                  {/* Counterparty Selection */}
                  <div>
                    <label className="field-label">
                      {isCustomer ? "Customer / Dealer" : "Vendor / Supplier"}
                      <div className="relative mt-1">
                        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="text"
                          value={partySearch}
                          onChange={(e) => setPartySearch(e.target.value)}
                          placeholder={`Filter ${isCustomer ? "customers" : "suppliers"} by name or code...`}
                          className="h-8 w-full rounded-lg border border-slate-200 pl-8 pr-3 text-xs outline-none focus:border-blue-500"
                        />
                      </div>
                      <select
                        required
                        className="field-input mt-1.5"
                        value={partyId}
                        onChange={(e) => {
                          setPartyId(e.target.value);
                          setTargetId("");
                          setAllocationAmount("");
                        }}
                      >
                        <option value="">Select {isCustomer ? "customer" : "supplier"}...</option>
                        {filteredPartyList.map((item: any) => (
                          <option key={item.id} value={item.id}>
                            {item.code} · {item.name} {item.phone ? `(${item.phone})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    {/* Selected Party Summary Card */}
                    {selectedParty && (
                      <div className="mt-2.5 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-950">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="font-bold">{selectedParty.name}</span>
                            <span className="block text-[11px] text-blue-700">
                              Code: {selectedParty.code}
                              {selectedParty.paymentTermsDays
                                ? ` · Terms: ${selectedParty.paymentTermsDays} days`
                                : " · Terms: Due on Receipt"}
                            </span>
                          </div>
                          <Link
                            href={`/finance/subledgers/${isCustomer ? "customer" : "supplier"}/${selectedParty.id}/print`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-[10px] font-bold text-blue-700 shadow-sm border border-blue-200 hover:bg-blue-100"
                            title="Print Subledger Statement"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Statement
                          </Link>
                        </div>
                        {selectedParty.creditLimit ? (
                          <span className="mt-1 block text-[11px] text-blue-800">
                            Credit Limit: <b>{formatMoney(selectedParty.creditLimit, currency)}</b>
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {/* Settlement Account (Cash vs Bank) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="field-label mb-0">Settlement Account</label>
                      <div className="flex gap-1 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setSettlementFilter("ALL")}
                          className={`rounded px-2 py-0.5 font-semibold ${
                            settlementFilter === "ALL"
                              ? "bg-slate-900 text-white"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => setSettlementFilter("CASH")}
                          className={`rounded px-2 py-0.5 font-semibold ${
                            settlementFilter === "CASH"
                              ? "bg-emerald-600 text-white"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          Cash
                        </button>
                        <button
                          type="button"
                          onClick={() => setSettlementFilter("BANK")}
                          className={`rounded px-2 py-0.5 font-semibold ${
                            settlementFilter === "BANK"
                              ? "bg-blue-600 text-white"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          Bank
                        </button>
                      </div>
                    </div>

                    <select
                      required
                      className="field-input"
                      value={accountChoice}
                      onChange={(e) => setAccountChoice(e.target.value)}
                    >
                      {filteredAccounts.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.type === "bank" ? "🏦 " : "💵 "}
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-[10px] text-slate-400">
                      Select either the shop Cash Drawer or the receiving/disbursing Bank Account.
                    </span>
                  </div>
                </div>

                {/* Column 2: Amount, Matching & Remarks */}
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="field-label">
                      Payment Amount ({currency})
                      <div className="relative mt-1">
                        <span className="pointer-events-none absolute left-3 top-2 text-xs font-bold text-slate-400">
                          {currency}
                        </span>
                        <input
                          required
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="0.00"
                          className="h-10 w-full rounded-lg border border-slate-200 pl-12 pr-3 text-sm font-mono font-bold text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                        />
                      </div>
                    </label>

                    <label className="field-label">
                      Reference / Cheque #
                      <input
                        className="field-input mt-1"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder={
                          accountChoice.startsWith("bank")
                            ? "Cheque #, Online transfer ID, or slip #"
                            : "Cash memo ref or counter slip #"
                        }
                      />
                    </label>
                  </div>

                  {/* Document Allocation (Matching Open Invoices / Bills) */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-4 w-4 text-slate-700" />
                        <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                          Invoice / Bill Matching
                        </span>
                        {targets.length > 0 && (
                          <Badge tone="blue">{targets.length} open</Badge>
                        )}
                      </div>
                      {targetId && (
                        <button
                          type="button"
                          onClick={() => {
                            setTargetId("");
                            setAllocationAmount("");
                          }}
                          className="text-[11px] font-semibold text-rose-600 hover:underline"
                        >
                          Clear Allocation (Advance)
                        </button>
                      )}
                    </div>

                    {targets.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-[11px] text-slate-500">
                          Match payment against a posted invoice or receipt to clear outstanding balance:
                        </p>
                        <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 border-b">
                              <tr>
                                <th className="px-3 py-1.5">Document #</th>
                                <th className="px-2 py-1.5">Date</th>
                                <th className="px-2 py-1.5 text-right">Total</th>
                                <th className="px-3 py-1.5 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {targets.map((item: any) => {
                                const isMatched = targetId === item.id;
                                const docNum = item.invoiceNumber || item.receiptNumber;
                                const docDate = item.invoiceDate || item.receiptDate;
                                return (
                                  <tr
                                    key={item.id}
                                    className={`hover:bg-slate-50 ${isMatched ? "bg-blue-50/60 font-semibold" : ""}`}
                                  >
                                    <td className="px-3 py-2 text-slate-900">{docNum}</td>
                                    <td className="px-2 py-2 text-slate-500">{formatDate(docDate)}</td>
                                    <td className="px-2 py-2 text-right font-mono font-medium">
                                      {formatMoney(item.grandTotal, currency)}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setTargetId(item.id);
                                          const grandTotalStr = String(item.grandTotal);
                                          setAllocationAmount(grandTotalStr);
                                          if (!amount || Number(amount) <= 0) {
                                            setAmount(grandTotalStr);
                                          }
                                        }}
                                        className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                                          isMatched
                                            ? "bg-blue-600 text-white"
                                            : "border border-slate-200 text-slate-600 hover:bg-slate-100"
                                        }`}
                                      >
                                        {isMatched ? "Matched" : "Match Full"}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Amount Allocated Input */}
                        {targetId && (
                          <div className="mt-2 flex items-center justify-between rounded-lg bg-blue-50/60 p-2.5 border border-blue-100 text-xs">
                            <span className="text-blue-900">Amount to Allocate on this Document:</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              className="h-7 w-28 rounded border border-blue-200 bg-white px-2 text-right font-mono font-bold text-blue-950"
                              value={allocationAmount}
                              onChange={(e) => setAllocationAmount(e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">
                        {partyId
                          ? `No posted ${isCustomer ? "sales invoices" : "purchase bills"} pending settlement for this party. This voucher will be credited as an advance on account.`
                          : "Select a party above to view their open invoices and bills."}
                      </p>
                    )}

                    {/* Live Allocation Summary */}
                    {amount && Number(amount) > 0 && (
                      <div className="mt-3 flex items-center justify-between border-t border-slate-200/70 pt-2 text-[11px]">
                        <span className="text-slate-500">
                          Matched: <b>{formatMoney(allocationAmount || 0, currency)}</b>
                        </span>
                        <span className="text-slate-700 font-semibold">
                          Advance on Ledger:{" "}
                          <b>
                            {formatMoney(
                              Math.max(0, (Number(amount) || 0) - (Number(allocationAmount) || 0)),
                              currency
                            )}
                          </b>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Remarks & Internal Narration */}
                  <label className="field-label">
                    Notes & Remarks
                    <textarea
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional internal remarks, counter details, or authorization instructions..."
                    />
                  </label>
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Double-entry balanced posting with full audit trail</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={(e) => void handleCreate(e, false)}
                    className="gap-1.5"
                  >
                    <FilePlus2 className="h-4 w-4" />
                    {saving && !isPostingDirect ? "Saving draft..." : "Save as Draft"}
                  </Button>
                  <Button
                    type="button"
                    disabled={saving}
                    onClick={(e) => void handleCreate(e, true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {saving && isPostingDirect ? "Posting to GL..." : "Save & Post Voucher"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
