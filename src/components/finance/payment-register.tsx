"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
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
  Edit3,
  ExternalLink,
  Eye,
  FilePlus2,
  FileText,
  Filter,
  Info,
  Landmark,
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
  const [paymentInstrument, setPaymentInstrument] = useState<"CASH" | "BANK_TRANSFER" | "CHEQUE" | "MOBILE_WALLET">("CASH");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [cashTendered, setCashTendered] = useState("");
  const [isPostingDirect, setIsPostingDirect] = useState(false);
  const [accountChoice, setAccountChoice] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [targetId, setTargetId] = useState("");
  const [allocationAmount, setAllocationAmount] = useState("");
  const [docAllocations, setDocAllocations] = useState<Record<string, string>>({});
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editingPaymentNumber, setEditingPaymentNumber] = useState<string | null>(null);
  const [batchPosting, setBatchPosting] = useState(false);
  const prefillApplied = useRef(false);

  const can = (key: string) => permissions.includes(key);
  const isCustomer = direction.startsWith("CUSTOMER");

  const totalAllocated = useMemo(() => {
    return Object.values(docAllocations).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
  }, [docAllocations]);

  const advanceOnLedger = useMemo(() => {
    const amt = parseFloat(amount) || 0;
    return Math.max(0, amt - totalAllocated);
  }, [amount, totalAllocated]);

  const tenderedNum = parseFloat(cashTendered) || 0;
  const enteredAmountNum = parseFloat(amount) || 0;
  const changeToReturn = useMemo(() => {
    if (tenderedNum <= 0 || enteredAmountNum <= 0) return 0;
    return Math.max(0, tenderedNum - enteredAmountNum);
  }, [tenderedNum, enteredAmountNum]);

  function handleAutoAllocateFIFO() {
    const totalEntered = parseFloat(amount) || 0;
    if (totalEntered <= 0) {
      toast.error("Please enter a payment amount first to run FIFO allocation.");
      return;
    }
    let remaining = totalEntered;
    const newAlloc: Record<string, string> = {};
    const sorted = [...targets].sort(
      (a, b) => new Date(a.invoiceDate || a.receiptDate).getTime() - new Date(b.invoiceDate || b.receiptDate).getTime()
    );
    for (const doc of sorted) {
      if (remaining <= 0) break;
      const docTotal = Number(doc.grandTotal) || 0;
      const alloc = Math.min(remaining, docTotal);
      if (alloc > 0) {
        newAlloc[doc.id] = alloc.toFixed(2);
        remaining -= alloc;
      }
    }
    setDocAllocations(newAlloc);
    toast.success(
      `Allocated ${formatMoney(totalEntered - remaining, currency)} across ${
        Object.keys(newAlloc).length
      } document(s) using FIFO!`
    );
  }

  function handleMatchAllDocs() {
    let grandSum = 0;
    const newAlloc: Record<string, string> = {};
    targets.forEach((doc: any) => {
      const val = Number(doc.grandTotal) || 0;
      grandSum += val;
      newAlloc[doc.id] = val.toFixed(2);
    });
    setDocAllocations(newAlloc);
    setAmount(grandSum.toFixed(2));
    toast.success(`Matched all ${targets.length} open documents (Total: ${formatMoney(grandSum, currency)})`);
  }

  function handleClearAllocations() {
    setDocAllocations({});
    setTargetId("");
    setAllocationAmount("");
    toast.info("Allocations cleared. Entire amount will post as an on-account advance.");
  }

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
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      if ((p.get("new") === "1" || p.get("action") === "new") && permissions.includes("PAYMENT_CREATE")) {
        const dir = p.get("direction");
        if (dir && ["CUSTOMER_RECEIPT", "SUPPLIER_PAYMENT", "CUSTOMER_REFUND", "SUPPLIER_REFUND"].includes(dir)) {
          setDirection(dir);
        }
        const pid = p.get("partyId") || p.get("customerId") || p.get("supplierId");
        if (pid) {
          setPartyId(pid);
        }
        const amt = p.get("amount");
        if (amt) {
          setAmount(amt);
        }
        setOpen(true);
      }
    }
  }, [load, permissions]);

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

  async function startEdit(row: PaymentRow) {
    try {
      toast.loading(`Loading ${row.paymentNumber} for editing...`, { id: "edit-payment" });
      const res = await fetch(`/api/payments/${row.id}`);
      const body = await res.json().catch(() => null);
      toast.dismiss("edit-payment");

      const p = res.ok && body?.data ? body.data : row;

      setEditingPaymentId(p.id);
      setEditingPaymentNumber(p.paymentNumber);
      setDirection(p.direction);

      // Match branch
      if (p.branchId) {
        setBranchId(p.branchId);
      } else if (p.branch?.code && lookups?.branches) {
        const found = lookups.branches.find((b: any) => b.code === p.branch.code);
        if (found) setBranchId(found.id);
      }

      // Match party
      const pId = p.customerId || p.supplierId || (p.customer?.id || p.supplier?.id || "");
      setPartyId(pId);
      setPartySearch(p.customer?.name || p.supplier?.name || "");

      // Amount & Date
      setAmount(String(p.amount ?? ""));
      setDate(p.paymentDate ? p.paymentDate.slice(0, 10) : new Date().toISOString().slice(0, 10));

      // Account Choice
      if (p.bankAccountId) {
        setAccountChoice(`bank:${p.bankAccountId}`);
        setSettlementFilter("BANK");
      } else if (p.cashAccountId) {
        setAccountChoice(`cash:${p.cashAccountId}`);
        setSettlementFilter("CASH");
      } else if (p.bankAccount?.id) {
        setAccountChoice(`bank:${p.bankAccount.id}`);
        setSettlementFilter("BANK");
      } else if (p.cashAccount?.id) {
        setAccountChoice(`cash:${p.cashAccount.id}`);
        setSettlementFilter("CASH");
      }

      setReference(p.reference || "");
      setNotes(p.notes || "");

      // Populate allocations
      if (Array.isArray(p.allocations) && p.allocations.length > 0) {
        const newAlloc: Record<string, string> = {};
        p.allocations.forEach((alloc: any) => {
          const docId =
            alloc.salesInvoiceId ||
            alloc.salesInvoice?.id ||
            alloc.purchaseReceiptId ||
            alloc.purchaseReceipt?.id;
          if (docId) {
            newAlloc[docId] = String(Number(alloc.amount) || "");
          }
        });
        setDocAllocations(newAlloc);
      } else {
        setDocAllocations({});
      }

      setOpen(true);
      toast.info(`Editing ${p.paymentNumber} (${p.status})`);
    } catch {
      toast.dismiss("edit-payment");
      toast.error("Failed to load payment for editing.");
    }
  }

  async function handleBatchAutoPost() {
    setBatchPosting(true);
    try {
      const res = await fetch("/api/payments/batch-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message || "Batch auto-post failed.");
      const count = body?.data?.postedCount || 0;
      toast.success(`⚡ Auto-posted ${count} payment voucher(s) directly to General Ledger!`);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Batch auto-post failed.");
    } finally {
      setBatchPosting(false);
    }
  }

  async function directPost(row: PaymentRow) {
    setActingId(row.id);
    try {
      const postRes = await fetch(`/api/payments/${row.id}/post`, { method: "POST" });
      const body = await postRes.json().catch(() => null);
      if (!postRes.ok) {
        await fetch(`/api/payments/${row.id}/submit`, { method: "POST" }).catch(() => null);
        await fetch(`/api/payments/${row.id}/approve`, { method: "POST" }).catch(() => null);
        const retryRes = await fetch(`/api/payments/${row.id}/post`, { method: "POST" });
        const retryBody = await retryRes.json().catch(() => null);
        if (!retryRes.ok) {
          return toast.error(retryBody?.error?.message || body?.error?.message || "Failed to post payment.");
        }
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
        const msg = body?.error?.message || `${titleCase(action)} failed.`;
        return toast.error(msg);
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
    const multiAllocations = Object.entries(docAllocations)
      .filter(([_, val]) => (parseFloat(val) || 0) > 0)
      .map(([docId, val]) => ({
        salesInvoiceId: isCustomer ? docId : null,
        purchaseReceiptId: isCustomer ? null : docId,
        amount: String(parseFloat(val)),
      }));

    const finalAllocations =
      multiAllocations.length > 0
        ? multiAllocations
        : targetId && allocationAmount
        ? [
            {
              salesInvoiceId: isCustomer ? targetId : null,
              purchaseReceiptId: isCustomer ? null : targetId,
              amount: allocationAmount,
            },
          ]
        : [];

    const effectiveReference =
      reference ||
      (paymentInstrument === "CHEQUE" && chequeNumber
        ? `Cheque #${chequeNumber}${chequeBank ? ` (${chequeBank})` : ""}`
        : null);

    const effectiveNotes = [
      notes,
      paymentInstrument === "CHEQUE" && chequeDate ? `Cheque Date: ${chequeDate}` : null,
      paymentInstrument === "CASH" && cashTendered
        ? `Cash Tendered: ${formatMoney(cashTendered, currency)}, Change Return: ${formatMoney(changeToReturn, currency)}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;

    try {
      const cleanAmount = String(amount).replace(/,/g, "").trim();
      const payload = {
        branchId,
        customerId: isCustomer ? partyId : null,
        supplierId: isCustomer ? null : partyId,
        bankAccountId: kind === "bank" ? accountId : null,
        cashAccountId: kind === "cash" ? accountId : null,
        paymentDate: date,
        direction,
        currencyCode: currency,
        amount: cleanAmount,
        reference: effectiveReference,
        notes: effectiveNotes,
        autoPost: andPost,
        idempotencyKey: crypto.randomUUID(),
        allocations: finalAllocations,
      };

      let response: Response;
      let targetIdToPost = editingPaymentId;
      let targetNumToPost = editingPaymentNumber;

      if (editingPaymentId) {
        response = await fetch(`/api/payments/${editingPaymentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        let msg =
          body?.error?.message ||
          (editingPaymentId ? "Payment draft could not be updated." : "Payment draft could not be created.");
        if (body?.error?.details && typeof body.error.details === "object") {
          const detailStr = Object.entries(body.error.details)
            .map(([field, err]) => `${field}: ${Array.isArray(err) ? err.join(", ") : String(err)}`)
            .join(" · ");
          if (detailStr) msg = `${msg} [${detailStr}]`;
        }
        return toast.error(msg);
      }

      const created = body.data;
      if (!targetIdToPost) {
        targetIdToPost = created?.id;
        targetNumToPost = created?.paymentNumber;
      }

      if (andPost && targetIdToPost) {
        if (created?.status === "POSTED") {
          toast.success(`${targetNumToPost || "Payment"} saved and posted to General Ledger!`, {
            action: {
              label: "Print Voucher",
              onClick: () => window.open(`/finance/payments/${targetIdToPost}/print`, "_blank"),
            },
            duration: 8000,
          });
          setOpen(false);
          resetForm();
          void load();
          return;
        }

        try {
          const subRes = await fetch(`/api/payments/${targetIdToPost}/submit`, { method: "POST" });
          const appRes = await fetch(`/api/payments/${targetIdToPost}/approve`, { method: "POST" });
          const postRes = await fetch(`/api/payments/${targetIdToPost}/post`, { method: "POST" });
          if (postRes.ok) {
            toast.success(`${targetNumToPost || "Payment"} saved and posted to GL successfully!`, {
              action: {
                label: "Print Voucher",
                onClick: () => window.open(`/finance/payments/${targetIdToPost}/print`, "_blank"),
              },
              duration: 8000,
            });
          } else {
            const postBody = await postRes.json().catch(() => null);
            const msg = postBody?.error?.message || "Saved, but post requires review.";
            toast.info(`${targetNumToPost || "Payment"} saved. ${msg}`);
          }
        } catch {
          toast.info(`${targetNumToPost || "Payment"} saved.`);
        }
      } else {
        toast.success(
          editingPaymentId
            ? `${targetNumToPost || "Payment"} updated successfully.`
            : `${created?.paymentNumber || "Payment"} draft created successfully.`
        );
      }

      setOpen(false);
      resetForm();
      void load();
    } catch {
      toast.error("Network error while saving payment.");
    } finally {
      setSaving(false);
      setIsPostingDirect(false);
    }
  }

  function resetForm() {
    setEditingPaymentId(null);
    setEditingPaymentNumber(null);
    setPartyId("");
    setPartySearch("");
    setTargetId("");
    setAmount("");
    setAllocationAmount("");
    setDocAllocations({});
    setCashTendered("");
    setChequeNumber("");
    setChequeDate("");
    setChequeBank("");
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
          {metrics.pendingCount > 0 && can("PAYMENT_POST") && (
            <Button
              type="button"
              disabled={batchPosting}
              onClick={() => void handleBatchAutoPost()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm font-semibold text-xs"
              title="Auto-post all submitted and approved payments directly to General Ledger"
            >
              {batchPosting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 fill-amber-300 text-amber-200" />
              )}
              ⚡ Auto-Post All Awaiting ({metrics.pendingCount})
            </Button>
          )}
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

        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
              Unposted Vouchers
            </span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-200/80 text-amber-800">
              <Zap className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-2xl font-black tabular-nums text-amber-950">
              {metrics.pendingCount}
            </p>
            {metrics.pendingCount > 0 && (
              <Button
                size="sm"
                disabled={batchPosting}
                onClick={() => void handleBatchAutoPost()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8 gap-1.5 shadow-xs px-3"
                title="Post all pending vouchers directly to General Ledger"
              >
                {batchPosting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5 fill-amber-300 text-amber-200" />
                )}
                Post All ({metrics.pendingCount})
              </Button>
            )}
          </div>
          <span className="mt-1 block text-[11px] text-amber-700">Ready to commit directly to General Ledger</span>
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

                        {/* Edit Unposted Payment */}
                        {(row.status === "DRAFT" || row.status === "SUBMITTED" || row.status === "APPROVED") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void startEdit(row)}
                            className="px-2 text-slate-700 hover:text-blue-700 hover:border-blue-300 gap-1 h-8 text-xs font-semibold"
                            title="Edit this payment voucher"
                          >
                            <Edit3 className="h-3.5 w-3.5 text-blue-600" />
                            Edit
                          </Button>
                        )}

                        {/* 1-Click Direct Post to General Ledger */}
                        {(row.status === "DRAFT" || row.status === "SUBMITTED" || row.status === "APPROVED") && (
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 px-2.5 text-xs font-bold shadow-xs h-8"
                            disabled={actingId === row.id}
                            onClick={() => void directPost(row)}
                            title="Post voucher directly to General Ledger"
                          >
                            {actingId === row.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Zap className="h-3.5 w-3.5 fill-amber-300 text-amber-200" />
                            )}
                            Post Now
                          </Button>
                        )}
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
                  {(selectedPayment.status === "DRAFT" || selectedPayment.status === "SUBMITTED") && can("PAYMENT_CREATE") && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        const p = selectedPayment;
                        setSelectedPayment(null);
                        void startEdit(p);
                      }}
                      className="gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit Voucher
                    </Button>
                  )}
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
                      {editingPaymentNumber
                        ? `Edit Voucher #${editingPaymentNumber}`
                        : direction === "CUSTOMER_RECEIPT"
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
                    {editingPaymentId
                      ? "Modify settlement account, party, amount, or document allocations before posting to GL."
                      : direction === "CUSTOMER_RECEIPT"
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
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Direction Selector Tabs */}
            <div className="border-b border-slate-200 bg-slate-50 px-6 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDirection("CUSTOMER_RECEIPT");
                      setPartyId("");
                      setPartySearch("");
                      setTargetId("");
                      setAllocationAmount("");
                      setDocAllocations({});
                    }}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition shadow-xs ${
                      direction === "CUSTOMER_RECEIPT"
                        ? "bg-emerald-600 text-white shadow-emerald-600/20"
                        : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <ArrowDownLeft className="h-4 w-4" />
                    Receive Payment (Customer)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDirection("SUPPLIER_PAYMENT");
                      setPartyId("");
                      setPartySearch("");
                      setTargetId("");
                      setAllocationAmount("");
                      setDocAllocations({});
                    }}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition shadow-xs ${
                      direction === "SUPPLIER_PAYMENT"
                        ? "bg-blue-600 text-white shadow-blue-600/20"
                        : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <ArrowUpRight className="h-4 w-4" />
                    Make Payment (Supplier)
                  </button>
                </div>
                {/* Secondary refund toggle */}
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span>Refund?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDirection(isCustomer ? "CUSTOMER_REFUND" : "SUPPLIER_REFUND");
                    }}
                    className="text-blue-600 hover:underline font-semibold"
                  >
                    Switch to {isCustomer ? "Customer Refund" : "Supplier Refund"}
                  </button>
                </div>
              </div>
            </div>

            {/* Form Content */}
            <form onSubmit={(e) => void handleCreate(e, false)}>
              <div className="grid gap-6 p-6 lg:grid-cols-2">
                {/* Column 1: Operating Details & Counterparty */}
                <div className="space-y-4">
                  {/* Branch & Date */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="field-label">
                      Branch *
                      <select
                        required
                        className="field-input mt-1"
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

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="field-label mb-0">Payment Date *</label>
                        <button
                          type="button"
                          onClick={() => setDate(new Date().toISOString().slice(0, 10))}
                          className="text-[10px] text-blue-600 hover:underline font-bold"
                        >
                          Today
                        </button>
                      </div>
                      <input
                        required
                        type="date"
                        className="field-input mt-1"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Counterparty Selection */}
                  <div>
                    <label className="field-label">
                      {isCustomer ? "Select Customer" : "Select Supplier / Vendor"} *
                      <div className="relative mt-1">
                        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="text"
                          value={partySearch}
                          onChange={(e) => setPartySearch(e.target.value)}
                          placeholder={`Search ${isCustomer ? "customers" : "suppliers"} by name, phone, or code...`}
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
                          setDocAllocations({});
                        }}
                      >
                        <option value="">Choose {isCustomer ? "Customer" : "Supplier"}...</option>
                        {filteredPartyList.map((item: any) => (
                          <option key={item.id} value={item.id}>
                            {item.code} · {item.name} {item.phone ? `(${item.phone})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    {selectedParty && (
                      <div className="mt-2 flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/70 px-3.5 py-2.5 text-xs text-blue-950">
                        <div>
                          <span className="font-bold text-slate-900 block">{selectedParty.name}</span>
                          <span className="text-[11px] text-slate-500">
                            {selectedParty.code} {selectedParty.phone ? `· ${selectedParty.phone}` : ""}
                          </span>
                        </div>
                        {targets.length > 0 ? (
                          <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800">
                            {targets.length} Unpaid {isCustomer ? "Invoices" : "Bills"}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500 font-medium">On-account advance</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Payment Mode (Cash vs Bank) */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-2">
                      Payment Mode *
                    </span>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentInstrument("CASH");
                          setSettlementFilter("CASH");
                          const cashAcc = accounts.find((a) => a.type === "cash");
                          if (cashAcc) setAccountChoice(cashAcc.value);
                        }}
                        className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition border ${
                          paymentInstrument === "CASH"
                            ? "border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/30"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <Banknote className="h-4 w-4 text-emerald-600" />
                        Cash Drawer
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentInstrument("BANK_TRANSFER");
                          setSettlementFilter("BANK");
                          const bankAcc = accounts.find((a) => a.type === "bank");
                          if (bankAcc) setAccountChoice(bankAcc.value);
                        }}
                        className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition border ${
                          paymentInstrument !== "CASH"
                            ? "border-blue-500 bg-blue-50 text-blue-900 ring-2 ring-blue-500/30"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <Building2 className="h-4 w-4 text-blue-600" />
                        Bank Account
                      </button>
                    </div>

                    <label className="field-label mb-1">
                      {paymentInstrument === "CASH" ? "Cash Account *" : "Bank Account *"}
                      <select
                        required
                        className="field-input mt-1 font-mono font-medium"
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
                    </label>

                    {paymentInstrument !== "CASH" && (
                      <div className="mt-2.5">
                        <label className="field-label">
                          Reference / Cheque #
                          <input
                            type="text"
                            placeholder="Cheque #, Online transfer slip, or Ref ID"
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                            className="field-input mt-1"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                {/* Column 2: Amount, Matching & Remarks */}
                <div className="space-y-4">
                  {/* Amount */}
                  <label className="field-label">
                    Payment Amount ({currency}) *
                    <div className="relative mt-1">
                      <span className="pointer-events-none absolute left-3.5 top-2.5 text-sm font-bold text-slate-400">
                        {currency}
                      </span>
                      <input
                        required
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0.00"
                        className="h-11 w-full rounded-xl border border-slate-300 pl-14 pr-4 text-lg font-mono font-black text-slate-950 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </div>
                  </label>

                  {/* Open Invoices Settlement */}
                  {targets.length > 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <FileText className="h-4 w-4 text-blue-600" />
                          Unpaid {isCustomer ? "Invoices" : "Bills"} ({targets.length})
                        </span>
                        <span className="text-[11px] text-slate-500">Click &apos;Settle Full&apos; to auto-fill amount</span>
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {targets.map((item: any) => {
                          const docNum = item.invoiceNumber || item.receiptNumber;
                          const docDate = item.invoiceDate || item.receiptDate;
                          const grandTotalStr = String(item.grandTotal);
                          const currentAlloc = docAllocations[item.id] || (targetId === item.id ? allocationAmount : "");
                          const isMatched = (parseFloat(currentAlloc) || 0) > 0;

                          return (
                            <div
                              key={item.id}
                              className={`flex items-center justify-between rounded-xl border p-2.5 transition text-xs ${
                                isMatched
                                  ? "border-emerald-300 bg-emerald-50/80"
                                  : "border-slate-200 bg-white hover:bg-slate-50"
                              }`}
                            >
                              <div>
                                <span className="font-bold text-slate-900 block font-sans">{docNum}</span>
                                <span className="text-[11px] text-slate-500">{formatDate(docDate)}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-mono font-bold text-slate-900">
                                  {formatMoney(item.grandTotal, currency)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isMatched) {
                                      setDocAllocations((prev) => {
                                        const next = { ...prev };
                                        delete next[item.id];
                                        return next;
                                      });
                                      if (amount === grandTotalStr) setAmount("");
                                    } else {
                                      setDocAllocations({ [item.id]: grandTotalStr });
                                      setAmount(grandTotalStr);
                                    }
                                  }}
                                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition shadow-xs ${
                                    isMatched
                                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                      : "border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                                  }`}
                                >
                                  {isMatched ? "✓ Settled" : "⚡ Settle Full"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 text-xs text-slate-500">
                      {partyId
                        ? `No unpaid ${isCustomer ? "sales invoices" : "bills"} found for this party. Payment will be recorded directly as an advance on account.`
                        : `Select a ${isCustomer ? "customer" : "supplier"} to link open documents.`}
                    </div>
                  )}

                  {/* Notes */}
                  <label className="field-label">
                    Notes / Remarks (Optional)
                    <textarea
                      rows={2}
                      className="field-input mt-1 text-xs"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. Counter checkout balance, advance receipt, cheque details..."
                    />
                  </label>
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-[11px] text-slate-400">
                  © 2026 Copyright Reserved · Qasim Ali · 0315-5049489
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setOpen(false);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={(e) => void handleCreate(e, false)}
                    className="text-xs font-semibold"
                  >
                    {saving && !isPostingDirect
                      ? "Saving..."
                      : editingPaymentId
                      ? "Update Draft"
                      : "Save Draft"}
                  </Button>
                  <Button
                    type="button"
                    disabled={saving}
                    onClick={(e) => void handleCreate(e, true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow-sm px-4 h-10"
                  >
                    {saving && isPostingDirect ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Posting to GL...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 fill-amber-300 text-amber-200" />
                        {editingPaymentId ? "⚡ Update & Post to GL" : "⚡ Save & Post to GL"}
                      </>
                    )}
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
