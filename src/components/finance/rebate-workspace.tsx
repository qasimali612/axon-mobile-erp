"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BadgeAlert,
  BadgeCheck,
  Banknote,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coins,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  Percent,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Tag,
  Trash2,
  TrendingDown,
  Warehouse,
  XCircle,
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

function statusTone(status: string) {
  if (["SETTLED", "ACCRUED"].includes(status)) return "green" as const;
  if (["APPROVED"].includes(status)) return "blue" as const;
  if (["REVERSED", "REJECTED"].includes(status)) return "red" as const;
  if (["CALCULATED", "SUBMITTED", "PARTIALLY_SETTLED"].includes(status)) return "amber" as const;
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
    products: Row[];
    branches: Row[];
    warehouses: Row[];
  }>({
    suppliers: [],
    customers: [],
    accounts: [],
    paymentMethods: [],
    bankAccounts: [],
    products: [],
    branches: [],
    warehouses: [],
  });

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "announcements" | "received" | "given" | "claims" | "settlements" | "reports" | "programs"
  >("dashboard");

  // Modals state
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [eligibilityScannerOpen, setEligibilityScannerOpen] = useState<{
    supplierId?: string;
    programId?: string;
    announcement?: Row;
  } | null>(null);
  const [customerRebateOpen, setCustomerRebateOpen] = useState(false);
  const [programEditor, setProgramEditor] = useState<Row | "new" | null>(null);
  const [breakdownFor, setBreakdownFor] = useState<Row | null>(null);
  const [settleFor, setSettleFor] = useState<Row | null>(null);
  const [rejectFor, setRejectFor] = useState<Row | null>(null);
  const [activeImeiViewItem, setActiveImeiViewItem] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  // Filter and search states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [reportType, setReportType] = useState<
    "item_wise" | "model_diff" | "supplier_aging" | "customer_aging" | "imei_audit" | "settlements" | "profitability"
  >("item_wise");

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/finance/rebates", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok) {
      toast.error(body?.error?.message || "Rebates data could not be loaded.");
      return;
    }
    setData(body.data || { programs: [], calculations: [] });
    setLookups(
      body.lookups || {
        suppliers: [],
        customers: [],
        accounts: [],
        paymentMethods: [],
        bankAccounts: [],
        products: [],
        branches: [],
        warehouses: [],
      }
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  // 9 Enterprise KPI Cards Metrics
  const kpiMetrics = useMemo(() => {
    const calcs = data.calculations;

    const receivableCalcs = calcs.filter((r) => r.program?.direction === "RECEIVABLE");
    const payableCalcs = calcs.filter((r) => r.program?.direction === "PAYABLE");

    // 1. Total Potential Rebate (Calculated + Submitted + Approved)
    const totalPotentialRebate = calcs
      .filter((r) => !["REJECTED", "REVERSED"].includes(r.status))
      .reduce((sum, r) => sum + Number(r.calculatedAmount || 0), 0);

    // 2. Claims Submitted
    const claimsSubmittedAmount = calcs
      .filter((r) => r.status === "SUBMITTED")
      .reduce((sum, r) => sum + Number(r.calculatedAmount || 0), 0);
    const claimsSubmittedCount = calcs.filter((r) => r.status === "SUBMITTED").length;

    // 3. Claims Approved
    const claimsApprovedAmount = calcs
      .filter((r) => ["APPROVED", "ACCRUED", "PARTIALLY_SETTLED", "SETTLED"].includes(r.status))
      .reduce((sum, r) => sum + Number(r.approvedAmount || 0), 0);

    // 4. Rebate Received (Cash/Credit received from suppliers)
    const rebateReceivedAmount = receivableCalcs.reduce((sum, r) => sum + Number(r.settledAmount || 0), 0);

    // 5. Rebate Given (Customer rebates settled)
    const rebateGivenAmount = payableCalcs.reduce((sum, r) => sum + Number(r.settledAmount || 0), 0);

    // 6. Outstanding Rebate Receivable (Owed by suppliers)
    const outstandingReceivable = receivableCalcs
      .filter((r) => ["ACCRUED", "PARTIALLY_SETTLED"].includes(r.status))
      .reduce((sum, r) => sum + Number(r.outstandingAmount || 0), 0);

    // 7. Outstanding Rebate Payable (Owed to customers)
    const outstandingPayable = payableCalcs
      .filter((r) => ["ACCRUED", "PARTIALLY_SETTLED"].includes(r.status))
      .reduce((sum, r) => sum + Number(r.outstandingAmount || 0), 0);

    // 8. Pending Approvals
    const pendingApprovalsCount = calcs.filter((r) => ["CALCULATED", "SUBMITTED"].includes(r.status)).length;
    const pendingApprovalsAmount = calcs
      .filter((r) => ["CALCULATED", "SUBMITTED"].includes(r.status))
      .reduce((sum, r) => sum + Number(r.calculatedAmount || 0), 0);

    // 9. Rejected / Ineligible Claims
    const rejectedCount = calcs.filter((r) => r.status === "REJECTED").length;
    const rejectedAmount = calcs
      .filter((r) => r.status === "REJECTED")
      .reduce((sum, r) => sum + Number(r.calculatedAmount || 0), 0);

    return {
      totalPotentialRebate,
      claimsSubmittedAmount,
      claimsSubmittedCount,
      claimsApprovedAmount,
      rebateReceivedAmount,
      rebateGivenAmount,
      outstandingReceivable,
      outstandingPayable,
      pendingApprovalsCount,
      pendingApprovalsAmount,
      rejectedCount,
      rejectedAmount,
    };
  }, [data.calculations]);

  // Price Announcements (programs with rules or calculationMethod PRICE_PROTECTION)
  const priceAnnouncements = useMemo(() => {
    return data.programs.filter(
      (p) => ["PRICE_PROTECTION", "COMPANY_PRICE_REDUCTION"].includes(p.calculationMethod) && p.rules
    );
  }, [data.programs]);

  // Settlements History
  const allSettlements = useMemo(() => {
    const list: Array<Row & { calcRef: string; partyName: string; direction: string }> = [];
    for (const calc of data.calculations) {
      const isReceivable = calc.program?.direction === "RECEIVABLE";
      const party = isReceivable ? calc.supplier?.name || "Supplier" : calc.customer?.name || "Customer";

      if (calc.receivable?.receipts) {
        for (const rc of calc.receivable.receipts) {
          list.push({
            ...rc,
            date: rc.receiptDate,
            method: rc.receiptMethod,
            calcRef: calc.referenceNumber,
            partyName: party,
            direction: "RECEIVABLE",
            calcId: calc.id,
          });
        }
      }
      if (calc.payable?.payments) {
        for (const pm of calc.payable.payments) {
          list.push({
            ...pm,
            date: pm.paymentDate,
            method: pm.paymentMethod,
            calcRef: calc.referenceNumber,
            partyName: party,
            direction: "PAYABLE",
            calcId: calc.id,
          });
        }
      }
    }
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [data.calculations]);

  // Filtered Claims
  const filteredClaims = useMemo(() => {
    return data.calculations.filter((calc) => {
      if (statusFilter !== "ALL" && calc.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const ref = String(calc.referenceNumber || "").toLowerCase();
      const prog = String(calc.program?.name || "").toLowerCase();
      const party = String(calc.supplier?.name || calc.customer?.name || "").toLowerCase();
      return ref.includes(q) || prog.includes(q) || party.includes(q);
    });
  }, [data.calculations, statusFilter, searchQuery]);

  // Filtered Claims for Received Tab
  const receivedClaims = useMemo(() => {
    return filteredClaims.filter((c) => c.program?.direction === "RECEIVABLE");
  }, [filteredClaims]);

  // Filtered Claims for Given Tab
  const givenClaims = useMemo(() => {
    return filteredClaims.filter((c) => c.program?.direction === "PAYABLE");
  }, [filteredClaims]);

  // Export current report as CSV
  const handleExportCsv = (title: string, headers: string[], rows: (string | number)[][]) => {
    const content = [
      headers.join(","),
      ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, "_")}_${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-12">
      {/* Enterprise Header */}
      <header className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="rounded-md bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 uppercase tracking-wider">
              Axon Mobile ERP · Finance & Price Protection
            </span>
            <Badge tone="green">Double-Entry Certified</Badge>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight sm:text-3xl">
            Item-Wise Rebate & Price Protection Module
          </h1>
          <p className="mt-1 text-xs text-slate-500 max-w-3xl">
            Company-announced mobile price cuts, automated old-stock rate protection, serial/IMEI eligibility verification,
            supplier claims, customer credit notes, and multi-settlement GL reconciliation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {permissions.manage ? (
            <Button
              onClick={() => setAnnouncementModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
            >
              <TrendingDown className="h-4 w-4" />
              New Price Announcement
            </Button>
          ) : null}

          {permissions.manage ? (
            <Button
              onClick={() => setEligibilityScannerOpen({})}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <Smartphone className="h-4 w-4" />
              Stock Eligibility Scanner
            </Button>
          ) : null}

          <a
            href="/finance/rebates/print"
            target="_blank"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            <Printer className="h-4 w-4" />
            Print Register
          </a>

          <Button variant="outline" onClick={() => void load()} loading={loading}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </header>

      {/* 9 Enterprise SAP Business One KPI Cards */}
      <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-9">
        {/* 1. Total Potential Rebate */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm hover:border-blue-300 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Potential</span>
            <Coins className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-base font-black text-slate-900">
            {formatMoney(String(kpiMetrics.totalPotentialRebate), currency)}
          </div>
          <p className="mt-0.5 text-[10px] text-slate-500">Across active stock</p>
        </div>

        {/* 2. Claims Submitted */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 shadow-sm hover:border-amber-300 transition">
          <div className="flex items-center justify-between text-amber-600">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Submitted</span>
            <Clock className="h-4 w-4" />
          </div>
          <div className="mt-2 text-base font-black text-amber-900">
            {formatMoney(String(kpiMetrics.claimsSubmittedAmount), currency)}
          </div>
          <p className="mt-0.5 text-[10px] text-amber-700 font-semibold">{kpiMetrics.claimsSubmittedCount} claim(s) in review</p>
        </div>

        {/* 3. Claims Approved */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3.5 shadow-sm hover:border-blue-300 transition">
          <div className="flex items-center justify-between text-blue-600">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Approved</span>
            <BadgeCheck className="h-4 w-4" />
          </div>
          <div className="mt-2 text-base font-black text-blue-900">
            {formatMoney(String(kpiMetrics.claimsApprovedAmount), currency)}
          </div>
          <p className="mt-0.5 text-[10px] text-blue-700">Approved by vendor/mgmt</p>
        </div>

        {/* 4. Rebate Received */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 shadow-sm hover:border-emerald-300 transition">
          <div className="flex items-center justify-between text-emerald-600">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Received</span>
            <ArrowDownLeft className="h-4 w-4" />
          </div>
          <div className="mt-2 text-base font-black text-emerald-900">
            {formatMoney(String(kpiMetrics.rebateReceivedAmount), currency)}
          </div>
          <p className="mt-0.5 text-[10px] text-emerald-700">From manufacturers</p>
        </div>

        {/* 5. Rebate Given */}
        <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-3.5 shadow-sm hover:border-purple-300 transition">
          <div className="flex items-center justify-between text-purple-600">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">Given to Dealers</span>
            <ArrowUpRight className="h-4 w-4" />
          </div>
          <div className="mt-2 text-base font-black text-purple-900">
            {formatMoney(String(kpiMetrics.rebateGivenAmount), currency)}
          </div>
          <p className="mt-0.5 text-[10px] text-purple-700">Credit notes settled</p>
        </div>

        {/* 6. Outstanding Receivable */}
        <div className="rounded-xl border border-blue-300 bg-blue-100/50 p-3.5 shadow-sm hover:border-blue-400 transition">
          <div className="flex items-center justify-between text-blue-700">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800">Vendor Balance</span>
            <Building2 className="h-4 w-4" />
          </div>
          <div className="mt-2 text-base font-black text-blue-950">
            {formatMoney(String(kpiMetrics.outstandingReceivable), currency)}
          </div>
          <p className="mt-0.5 text-[10px] text-blue-800 font-semibold">Owed to our business</p>
        </div>

        {/* 7. Outstanding Payable */}
        <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-3.5 shadow-sm hover:border-orange-300 transition">
          <div className="flex items-center justify-between text-orange-600">
            <span className="text-[11px] font-bold uppercase tracking-wider text-orange-700">Dealer Balance</span>
            <Banknote className="h-4 w-4" />
          </div>
          <div className="mt-2 text-base font-black text-orange-950">
            {formatMoney(String(kpiMetrics.outstandingPayable), currency)}
          </div>
          <p className="mt-0.5 text-[10px] text-orange-700">Owed to customers</p>
        </div>

        {/* 8. Pending Approvals */}
        <div className="rounded-xl border border-amber-300 bg-amber-100/40 p-3.5 shadow-sm hover:border-amber-400 transition">
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Pending Approvals</span>
            <BadgeAlert className="h-4 w-4" />
          </div>
          <div className="mt-2 text-base font-black text-amber-950">
            {kpiMetrics.pendingApprovalsCount} <span className="text-xs font-normal">claims</span>
          </div>
          <p className="mt-0.5 text-[10px] text-amber-800 font-semibold">{formatMoney(String(kpiMetrics.pendingApprovalsAmount), currency)}</p>
        </div>

        {/* 9. Rejected / Ineligible */}
        <div className="rounded-xl border border-red-200 bg-red-50/40 p-3.5 shadow-sm hover:border-red-300 transition">
          <div className="flex items-center justify-between text-red-600">
            <span className="text-[11px] font-bold uppercase tracking-wider text-red-700">Rejected</span>
            <XCircle className="h-4 w-4" />
          </div>
          <div className="mt-2 text-base font-black text-red-950">
            {kpiMetrics.rejectedCount} <span className="text-xs font-normal">claims</span>
          </div>
          <p className="mt-0.5 text-[10px] text-red-700 font-semibold">{formatMoney(String(kpiMetrics.rejectedAmount), currency)}</p>
        </div>
      </section>

      {/* Navigation Tabs Bar */}
      <nav className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100/80 p-1.5">
        {(
          [
            ["dashboard", "Overview & Analytics"],
            ["announcements", `Price Announcements (${priceAnnouncements.length})`],
            ["received", `Rebates Received (${receivedClaims.length})`],
            ["given", `Rebates Given (${givenClaims.length})`],
            ["claims", `All Claims Register (${data.calculations.length})`],
            ["settlements", `Settlement History (${allSettlements.length})`],
            ["reports", "Financial Reports"],
            ["programs", `Master Programs (${data.programs.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`rounded-lg px-3.5 py-2 text-xs font-bold transition ${
              activeTab === key
                ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200"
                : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* TAB 1: DASHBOARD / OVERVIEW */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Quick Actions Panel */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-blue-600" />
                Operational Quick Actions
              </h2>
              <p className="mt-1 text-xs text-slate-500">Key workflows for mobile rate protection management.</p>

              <div className="mt-4 space-y-2.5">
                <button
                  onClick={() => setAnnouncementModalOpen(true)}
                  className="w-full flex items-center justify-between rounded-xl border border-slate-200 p-3 text-left hover:border-indigo-400 hover:bg-indigo-50/30 transition"
                >
                  <div>
                    <p className="text-xs font-bold text-slate-800">1. Record Company Price Reduction</p>
                    <p className="text-[11px] text-slate-500">Enter new phone price cuts announced by supplier</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>

                <button
                  onClick={() => setEligibilityScannerOpen({})}
                  className="w-full flex items-center justify-between rounded-xl border border-slate-200 p-3 text-left hover:border-emerald-400 hover:bg-emerald-50/30 transition"
                >
                  <div>
                    <p className="text-xs font-bold text-slate-800">2. Run Stock Eligibility Engine</p>
                    <p className="text-[11px] text-slate-500">Auto-detect unsold IMEI units & calculate claim</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>

                <button
                  onClick={() => setCustomerRebateOpen(true)}
                  className="w-full flex items-center justify-between rounded-xl border border-slate-200 p-3 text-left hover:border-purple-400 hover:bg-purple-50/30 transition"
                >
                  <div>
                    <p className="text-xs font-bold text-slate-800">3. Issue Customer Price Protection</p>
                    <p className="text-[11px] text-slate-500">Pass price difference credit note to dealers</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>

                <button
                  onClick={() => setActiveTab("reports")}
                  className="w-full flex items-center justify-between rounded-xl border border-slate-200 p-3 text-left hover:border-blue-400 hover:bg-blue-50/30 transition"
                >
                  <div>
                    <p className="text-xs font-bold text-slate-800">4. Review Aging & Profitability Impact</p>
                    <p className="text-[11px] text-slate-500">Analyze net margin retention after rebate settlement</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>
              </div>
            </div>

            {/* Price Protection Rules Summary */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Mobile ERP Rate Protection Rules
              </h2>
              <ul className="mt-3 space-y-2 text-xs text-slate-600">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                  <span><strong>1 Unit = 1 Handset:</strong> Dual-SIM IMEIs (IMEI1 & IMEI2) are paired and never double-counted.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                  <span><strong>Zero Double-Claiming:</strong> Already claimed physical handsets cannot be included in duplicate claims.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                  <span><strong>Stock Cutoff Verification:</strong> Stock eligibility honors vendor goods receipt dates and warehouse balances.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                  <span><strong>Double-Entry Ledger:</strong> Accruals and cash/bank settlements generate balanced debit = credit journals.</span>
                </li>
              </ul>
            </div>

            {/* Quick Status Breakdown */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Layers className="h-4 w-4 text-slate-700" />
                Claims Pipeline Breakdown
              </h2>
              <div className="mt-4 space-y-2.5 text-xs">
                {[
                  { label: "Submitted (Pending Review)", count: kpiMetrics.claimsSubmittedCount, tone: "amber" },
                  { label: "Approved (Pending Accrual/Settlement)", count: data.calculations.filter((c) => c.status === "APPROVED").length, tone: "blue" },
                  { label: "Accrued (GL Posted)", count: data.calculations.filter((c) => c.status === "ACCRUED").length, tone: "indigo" },
                  { label: "Partially Settled", count: data.calculations.filter((c) => c.status === "PARTIALLY_SETTLED").length, tone: "amber" },
                  { label: "Fully Settled", count: data.calculations.filter((c) => c.status === "SETTLED").length, tone: "green" },
                  { label: "Rejected", count: kpiMetrics.rejectedCount, tone: "red" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span className="text-slate-600">{item.label}</span>
                    <Badge tone={item.tone as any}>{item.count}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Claims Grid */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Recent Price Protection Claims & Rebates
              </h2>
              <button
                onClick={() => setActiveTab("claims")}
                className="text-xs font-bold text-blue-600 hover:text-blue-800"
              >
                View all claims &rarr;
              </button>
            </div>
            {renderClaimsTable(data.calculations.slice(0, 10))}
          </div>
        </div>
      )}

      {/* TAB 2: PRICE ANNOUNCEMENTS */}
      {activeTab === "announcements" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900">Company Price Announcements</h2>
              <p className="text-xs text-slate-500">Official manufacturer price reductions and rate protection cutoff dates.</p>
            </div>
            <Button onClick={() => setAnnouncementModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Plus className="h-4 w-4" />
              New Announcement
            </Button>
          </div>

          {priceAnnouncements.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center bg-white">
              <TrendingDown className="mx-auto h-8 w-8 text-slate-400" />
              <h3 className="mt-2 text-sm font-bold text-slate-800">No Price Announcements Recorded</h3>
              <p className="mt-1 text-xs text-slate-500">Record a new price cut from Samsung, Apple, Xiaomi, etc. to trigger old stock claims.</p>
              <Button onClick={() => setAnnouncementModalOpen(true)} className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white">
                Create First Announcement
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {priceAnnouncements.map((ann) => {
                const rules = ann.rules || {};
                const items = Array.isArray(rules.items) ? rules.items : [];
                return (
                  <div key={ann.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                          {rules.announcementNumber || ann.code}
                        </span>
                        <Badge tone={ann.isActive ? "green" : "slate"}>{ann.isActive ? "Active" : "Archived"}</Badge>
                      </div>

                      <h3 className="mt-2.5 text-sm font-black text-slate-900">{ann.name}</h3>
                      <p className="text-xs text-slate-500">Vendor: <span className="font-semibold text-slate-700">{ann.supplier?.name || "Manufacturer"}</span></p>

                      <div className="mt-3.5 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Effective Date:</span>
                          <span className="font-semibold text-slate-800">{formatDate(ann.effectiveFrom)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Purchase Window:</span>
                          <span className="font-semibold text-slate-800">
                            {rules.purchaseDateFrom ? formatDate(rules.purchaseDateFrom) : "All"} &rarr; {rules.purchaseDateTo ? formatDate(rules.purchaseDateTo) : "Cutoff"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Affected Models:</span>
                          <span className="font-bold text-indigo-700">{items.length} phone model(s)</span>
                        </div>
                      </div>

                      <div className="mt-3 max-h-32 overflow-y-auto divide-y divide-slate-100 text-[11px]">
                        {items.slice(0, 4).map((it: any, idx: number) => (
                          <div key={idx} className="py-1.5 flex justify-between items-center">
                            <div>
                              <p className="font-medium text-slate-800">{it.productName}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{it.sku}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-red-600">-{formatMoney(String(it.priceDrop || 0), currency)}</p>
                              <p className="text-[10px] text-slate-400">drop/unit</p>
                            </div>
                          </div>
                        ))}
                        {items.length > 4 ? (
                          <p className="pt-1 text-[10px] text-slate-400 italic">+{items.length - 4} more models...</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <Button
                        size="sm"
                        onClick={() => setEligibilityScannerOpen({ supplierId: ann.supplierId, programId: ann.id, announcement: ann })}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs w-full"
                      >
                        <Smartphone className="h-3.5 w-3.5" />
                        Scan Eligible Stock & Claim
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: REBATES RECEIVED (SUPPLIER RATE PROTECTION) */}
      {activeTab === "received" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900">Rebates Received (Supplier Rate Protection)</h2>
              <p className="text-xs text-slate-500">Track and settle rate protection claims owed by phone manufacturers and suppliers.</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setEligibilityScannerOpen({})} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Smartphone className="h-4 w-4" />
                New Supplier Claim
              </Button>
            </div>
          </div>
          {renderFilterBar()}
          {renderClaimsTable(receivedClaims)}
        </div>
      )}

      {/* TAB 4: REBATES GIVEN (CUSTOMER / DEALER PRICE PROTECTION) */}
      {activeTab === "given" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900">Rebates Given (Customer Price Protection)</h2>
              <p className="text-xs text-slate-500">Manage price drop compensation credit notes passed to customers and retail dealers.</p>
            </div>
            <Button onClick={() => setCustomerRebateOpen(true)} className="bg-purple-600 hover:bg-purple-700 text-white">
              <Plus className="h-4 w-4" />
              New Customer Credit Claim
            </Button>
          </div>
          {renderFilterBar()}
          {renderClaimsTable(givenClaims)}
        </div>
      )}

      {/* TAB 5: CENTRAL CLAIMS REGISTER */}
      {activeTab === "claims" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900">Central Claims & Rebates Register</h2>
              <p className="text-xs text-slate-500">Full audit lifecycle of all price protection claims, approvals, and general ledger accruals.</p>
            </div>
          </div>
          {renderFilterBar()}
          {renderClaimsTable(filteredClaims)}
        </div>
      )}

      {/* TAB 6: SETTLEMENT HISTORY */}
      {activeTab === "settlements" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900">Settlements & Payment Allocation Register</h2>
              <p className="text-xs text-slate-500">Complete log of bank receipts, debit/credit notes, and cash settlements with journal references.</p>
            </div>
            <button
              onClick={() =>
                handleExportCsv(
                  "Settlements_Register",
                  ["Date", "Direction", "Party", "Claim Reference", "Method", "Amount", "Journal Voucher", "Notes"],
                  allSettlements.map((s) => [
                    formatDate(s.date),
                    s.direction,
                    s.partyName,
                    s.calcRef,
                    s.method,
                    s.amount,
                    s.journalEntry?.voucherNumber || "",
                    s.reference || "",
                  ])
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="p-3">Settlement Date</th>
                    <th className="p-3">Direction</th>
                    <th className="p-3">Party Name</th>
                    <th className="p-3">Claim Reference</th>
                    <th className="p-3">Payment Method</th>
                    <th className="p-3">GL Voucher #</th>
                    <th className="p-3 text-right">Settled Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allSettlements.map((s, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60">
                      <td className="p-3 font-semibold text-slate-800">{formatDate(s.date)}</td>
                      <td className="p-3">
                        <Badge tone={s.direction === "RECEIVABLE" ? "green" : "purple"}>
                          {s.direction === "RECEIVABLE" ? "Received from Supplier" : "Paid to Customer"}
                        </Badge>
                      </td>
                      <td className="p-3 font-medium text-slate-900">{s.partyName}</td>
                      <td className="p-3 font-mono font-bold text-blue-700">{s.calcRef}</td>
                      <td className="p-3 text-slate-600">{s.method} {s.reference ? `(${s.reference})` : ""}</td>
                      <td className="p-3 font-mono text-slate-500">{s.journalEntry?.voucherNumber || "—"}</td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-700">
                        {formatMoney(String(s.amount), currency)}
                      </td>
                    </tr>
                  ))}
                  {allSettlements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">No settlement records found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: FINANCIAL REPORTS & ANALYTICS */}
      {activeTab === "reports" && renderReportsView()}

      {/* TAB 8: REBATE PROGRAMS / MASTERS */}
      {activeTab === "programs" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900">Master Rebate Programs</h2>
              <p className="text-xs text-slate-500">Configure standing rebate programs, calculation rules, and Chart of Accounts links.</p>
            </div>
            <Button onClick={() => setProgramEditor("new")} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="h-4 w-4" />
              New Master Program
            </Button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="p-3">Program Code</th>
                    <th className="p-3">Program Name</th>
                    <th className="p-3">Direction</th>
                    <th className="p-3">Calculation Method</th>
                    <th className="p-3">Party (Supplier / Customer)</th>
                    <th className="p-3">Effective Range</th>
                    <th className="p-3">Primary / Settlement Accounts</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.programs.map((prog) => (
                    <tr key={prog.id} className="hover:bg-slate-50/60">
                      <td className="p-3 font-mono font-bold text-blue-700">{prog.code}</td>
                      <td className="p-3 font-semibold text-slate-900">{prog.name}</td>
                      <td className="p-3">
                        <Badge tone={prog.direction === "RECEIVABLE" ? "green" : "purple"}>
                          {prog.direction}
                        </Badge>
                      </td>
                      <td className="p-3 font-medium text-slate-700">
                        {prog.calculationMethod === "PRICE_PROTECTION" ? "Price Protection" : titleCase(prog.calculationMethod)}
                      </td>
                      <td className="p-3 text-slate-700">{prog.supplier?.name || prog.customer?.name || "All"}</td>
                      <td className="p-3 text-slate-500">{formatDate(prog.effectiveFrom)} &rarr; {formatDate(prog.effectiveTo)}</td>
                      <td className="p-3 text-[11px] text-slate-500 font-mono">
                        <div>P: {prog.primaryAccount?.code} {prog.primaryAccount?.name}</div>
                        <div>S: {prog.settlementAccount?.code} {prog.settlementAccount?.name}</div>
                      </td>
                      <td className="p-3">
                        <Badge tone={prog.isActive ? "green" : "slate"}>{prog.isActive ? "Active" : "Inactive"}</Badge>
                      </td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => setProgramEditor(prog)}>
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: PRICE ANNOUNCEMENT CREATOR */}
      {announcementModalOpen && (
        <PriceAnnouncementModal
          currency={currency}
          suppliers={lookups.suppliers}
          accounts={lookups.accounts}
          products={lookups.products}
          onClose={() => setAnnouncementModalOpen(false)}
          onSuccess={async () => {
            setAnnouncementModalOpen(false);
            await load();
          }}
        />
      )}

      {/* MODAL 2: STOCK & IMEI ELIGIBILITY SCANNER (CORE WORKFLOW) */}
      {eligibilityScannerOpen && (
        <StockEligibilityScannerModal
          currency={currency}
          initialSupplierId={eligibilityScannerOpen.supplierId}
          initialProgramId={eligibilityScannerOpen.programId}
          announcement={eligibilityScannerOpen.announcement}
          programs={data.programs.filter((p) => p.direction === "RECEIVABLE" && p.isActive)}
          suppliers={lookups.suppliers}
          warehouses={lookups.warehouses}
          branches={lookups.branches}
          products={lookups.products}
          onClose={() => setEligibilityScannerOpen(null)}
          onSuccess={async () => {
            setEligibilityScannerOpen(null);
            await load();
            setActiveTab("received");
          }}
        />
      )}

      {/* MODAL 3: CUSTOMER PRICE PROTECTION (REBATES GIVEN) */}
      {customerRebateOpen && (
        <CustomerPriceProtectionModal
          currency={currency}
          customers={lookups.customers}
          products={lookups.products}
          programs={data.programs.filter((p) => p.direction === "PAYABLE" && p.isActive)}
          onClose={() => setCustomerRebateOpen(false)}
          onSuccess={async () => {
            setCustomerRebateOpen(false);
            await load();
            setActiveTab("given");
          }}
        />
      )}

      {/* MODAL 4: ITEM BREAKDOWN & VERIFIED IMEI INSPECTION MODAL */}
      {breakdownFor && (
        <ClaimBreakdownModal
          calculation={breakdownFor}
          currency={currency}
          onClose={() => setBreakdownFor(null)}
          onViewImeis={(item) => setActiveImeiViewItem(item)}
        />
      )}

      {/* MODAL 5: IMEI LIST DRAWER */}
      {activeImeiViewItem && (
        <ImeiListModal
          item={activeImeiViewItem}
          onClose={() => setActiveImeiViewItem(null)}
        />
      )}

      {/* MODAL 6: SETTLEMENT MODAL (PARTIAL & FULL) */}
      {settleFor && (
        <SettlementModal
          calculation={settleFor}
          currency={currency}
          paymentMethods={lookups.paymentMethods}
          bankAccounts={lookups.bankAccounts}
          onClose={() => setSettleFor(null)}
          onSuccess={async () => {
            setSettleFor(null);
            await load();
          }}
        />
      )}

      {/* MODAL 7: REJECTION REASON MODAL */}
      {rejectFor && (
        <RejectModal
          calculation={rejectFor}
          onClose={() => setRejectFor(null)}
          onSuccess={async () => {
            setRejectFor(null);
            await load();
          }}
        />
      )}

      {/* MODAL 8: MASTER PROGRAM EDITOR */}
      {programEditor && (
        <ProgramEditorModal
          program={programEditor === "new" ? null : programEditor}
          suppliers={lookups.suppliers}
          customers={lookups.customers}
          accounts={lookups.accounts}
          onClose={() => setProgramEditor(null)}
          onSuccess={async () => {
            setProgramEditor(null);
            await load();
          }}
        />
      )}

      {/* MANDATORY DEVELOPER FOOTER ATTRIBUTION */}
      <footer className="mt-12 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500">
        <div>Axon Mobile ERP · Enterprise Price Protection & Trade Programs Engine</div>
        <div className="font-bold text-slate-800 tracking-wide mt-2 sm:mt-0">
          © 2026 Copyright Reserved · Qasim Ali · 0315-5049489
        </div>
      </footer>
    </div>
  );

  // Helper: Search and Filter Bar
  function renderFilterBar() {
    return (
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search reference, program, party..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-blue-500 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold text-slate-500">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs outline-none focus:border-blue-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="CALCULATED">Calculated</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="APPROVED">Approved</option>
            <option value="ACCRUED">Accrued</option>
            <option value="PARTIALLY_SETTLED">Partially Settled</option>
            <option value="SETTLED">Fully Settled</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>
    );
  }

  // Helper: Claims Table
  function renderClaimsTable(claims: Row[]) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <th className="p-3">Reference #</th>
                <th className="p-3">Program / Type</th>
                <th className="p-3">Party</th>
                <th className="p-3">Period</th>
                <th className="p-3 text-right">Eligible Units</th>
                <th className="p-3 text-right">Claim Amount</th>
                <th className="p-3 text-right">Settled</th>
                <th className="p-3 text-right">Outstanding</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {claims.map((row) => {
                const isMaker = row.calculatedById === currentUserId;
                const isReceivable = row.program?.direction === "RECEIVABLE";
                const canSettle = isReceivable ? permissions.receive : permissions.pay;
                const details = (row.calculationDetails as Record<string, any>) || {};
                const itemCount = Array.isArray(details.items) ? details.items.length : 0;

                return (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="p-3">
                      <div className="font-mono font-bold text-blue-700">{row.referenceNumber}</div>
                      <div className="text-[10px] text-slate-400">{formatDate(row.createdAt)}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-slate-900">{row.program?.name || "Rebate"}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] font-semibold text-slate-500">
                          {row.program?.calculationMethod === "PRICE_PROTECTION" ? "Rate Protection" : row.program?.calculationMethod}
                        </span>
                        {itemCount > 0 ? (
                          <span className="rounded bg-indigo-50 px-1.5 text-[9px] font-bold text-indigo-700">
                            {itemCount} model(s)
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="p-3 font-semibold text-slate-800">
                      {isReceivable ? row.supplier?.name || "Supplier" : row.customer?.name || "Customer"}
                    </td>
                    <td className="p-3 text-slate-500">
                      {formatDate(row.periodStart)} &rarr; {formatDate(row.periodEnd)}
                    </td>
                    <td className="p-3 text-right font-mono font-semibold text-slate-700">
                      {Number(row.eligibleQuantity || 0).toLocaleString()}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900">
                      {formatMoney(String(row.calculatedAmount), currency)}
                    </td>
                    <td className="p-3 text-right font-mono font-semibold text-emerald-700">
                      {formatMoney(String(row.settledAmount), currency)}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-blue-700">
                      {formatMoney(String(row.outstandingAmount), currency)}
                    </td>
                    <td className="p-3">
                      <Badge tone={statusTone(row.status)}>{titleCase(row.status)}</Badge>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Inspect Item Details */}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setBreakdownFor(row)}
                          title="Inspect item breakdown & IMEIs"
                          className="h-8 w-8 p-0"
                        >
                          <Eye className="h-4 w-4 text-slate-600" />
                        </Button>

                        {/* Print Voucher */}
                        <a
                          href={`/finance/rebates/print?id=${row.id}`}
                          target="_blank"
                          title="Print official claim voucher"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm"
                        >
                          <Printer className="h-4 w-4" />
                        </a>

                        {/* Maker-Checker: Approve */}
                        {["CALCULATED", "SUBMITTED"].includes(row.status) && permissions.approve ? (
                          <Button
                            size="sm"
                            disabled={isMaker || busy}
                            onClick={() => void act(`/api/finance/rebates/calculations/${row.id}/approve`, {}, "Claim approved successfully.")}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] h-8 px-2.5"
                          >
                            Approve
                          </Button>
                        ) : null}

                        {/* Maker-Checker: Reject */}
                        {["CALCULATED", "SUBMITTED"].includes(row.status) && permissions.approve ? (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => setRejectFor(row)}
                            className="text-[11px] h-8 px-2.5"
                          >
                            Reject
                          </Button>
                        ) : null}

                        {/* Post Accrual to GL */}
                        {row.status === "APPROVED" && permissions.approve ? (
                          <Button
                            size="sm"
                            onClick={() => void act(`/api/finance/rebates/calculations/${row.id}/accrue`, {}, "Accrued to General Ledger.")}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] h-8 px-2.5"
                          >
                            Post Accrual
                          </Button>
                        ) : null}

                        {/* Settle (Partial or Full) */}
                        {["ACCRUED", "PARTIALLY_SETTLED"].includes(row.status) && canSettle ? (
                          <Button
                            size="sm"
                            onClick={() => setSettleFor(row)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] h-8 px-2.5"
                          >
                            Settle
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {claims.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400">
                    No claims match the filter criteria.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Helper: Reports View
  function renderReportsView() {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-900">Financial Reports & Rate Protection Analytics</h2>
            <p className="text-xs text-slate-500">Item-wise price differences, supplier vs dealer aging, IMEI audit trails, and profitability impact.</p>
          </div>
          <div className="flex gap-2">
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as any)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-blue-500 shadow-sm"
            >
              <option value="item_wise">1. Item-Wise Rebate Report</option>
              <option value="model_diff">2. Model-Wise Price Difference Report</option>
              <option value="supplier_aging">3. Supplier Rebate Receivable Aging</option>
              <option value="customer_aging">4. Customer Rebate Payable Aging</option>
              <option value="imei_audit">5. IMEI-Wise Rate Protection Audit</option>
              <option value="settlements">6. Settlement History Report</option>
              <option value="profitability">7. Profitability Impact Report</option>
            </select>
          </div>
        </div>

        {/* Dynamic Report Content based on selection */}
        {renderSelectedReportTable()}
      </div>
    );
  }

  function renderSelectedReportTable() {
    // 1. Item-Wise Report
    if (reportType === "item_wise") {
      const allItems: Array<Row & { calcRef: string; party: string; status: string; date: string }> = [];
      for (const calc of data.calculations) {
        const details = (calc.calculationDetails as Record<string, any>) || {};
        if (Array.isArray(details.items)) {
          for (const it of details.items) {
            allItems.push({
              ...it,
              calcRef: calc.referenceNumber,
              party: calc.supplier?.name || calc.customer?.name || "—",
              status: calc.status,
              date: calc.createdAt,
            });
          }
        }
      }

      return (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() =>
                handleExportCsv(
                  "Item_Wise_Rebates",
                  ["Date", "Claim Ref", "Party", "Product", "SKU", "Old Price", "New Price", "Price Drop", "Claim Qty", "Claim Amount", "Status"],
                  allItems.map((it) => [
                    formatDate(it.date),
                    it.calcRef,
                    it.party,
                    it.productName,
                    it.sku,
                    it.oldPrice,
                    it.newPrice,
                    it.priceDropPerUnit,
                    it.claimedQuantity || it.eligibleQuantity,
                    it.claimAmount,
                    it.status,
                  ])
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-3">Claim Ref</th>
                  <th className="p-3">Product / Model</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Vendor / Dealer</th>
                  <th className="p-3 text-right">Old Price</th>
                  <th className="p-3 text-right">New Price</th>
                  <th className="p-3 text-right">Price Drop</th>
                  <th className="p-3 text-right">Claim Qty</th>
                  <th className="p-3 text-right">Total Claim</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allItems.map((it, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60">
                    <td className="p-3 font-mono font-bold text-blue-700">{it.calcRef}</td>
                    <td className="p-3 font-semibold text-slate-900">{it.productName}</td>
                    <td className="p-3 font-mono text-slate-600">{it.sku}</td>
                    <td className="p-3 text-slate-700">{it.party}</td>
                    <td className="p-3 text-right font-mono">{formatMoney(String(it.oldPrice || 0), currency)}</td>
                    <td className="p-3 text-right font-mono">{formatMoney(String(it.newPrice || 0), currency)}</td>
                    <td className="p-3 text-right font-mono font-bold text-red-600">
                      -{formatMoney(String(it.priceDropPerUnit || 0), currency)}
                    </td>
                    <td className="p-3 text-right font-mono font-semibold">{Number(it.claimedQuantity || it.eligibleQuantity || 0).toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-blue-700">{formatMoney(String(it.claimAmount || 0), currency)}</td>
                    <td className="p-3"><Badge tone={statusTone(it.status)}>{titleCase(it.status)}</Badge></td>
                  </tr>
                ))}
                {allItems.length === 0 ? (
                  <tr><td colSpan={10} className="p-8 text-center text-slate-400">No item records found.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    // 2. Model-Wise Price Difference Report
    if (reportType === "model_diff") {
      const modelMap = new Map<string, { model: string; sku: string; brand: string; announcementsCount: number; maxDrop: number; totalClaimedQty: number; totalClaimedAmount: number }>();
      for (const calc of data.calculations) {
        const details = (calc.calculationDetails as Record<string, any>) || {};
        if (Array.isArray(details.items)) {
          for (const it of details.items) {
            const key = it.variantId || it.sku;
            if (!modelMap.has(key)) {
              modelMap.set(key, {
                model: it.productName,
                sku: it.sku,
                brand: it.brandName || "Mobile",
                announcementsCount: 0,
                maxDrop: 0,
                totalClaimedQty: 0,
                totalClaimedAmount: 0,
              });
            }
            const record = modelMap.get(key)!;
            record.announcementsCount += 1;
            record.maxDrop = Math.max(record.maxDrop, Number(it.priceDropPerUnit || 0));
            record.totalClaimedQty += Number(it.claimedQuantity || it.eligibleQuantity || 0);
            record.totalClaimedAmount += Number(it.claimAmount || 0);
          }
        }
      }
      const modelList = Array.from(modelMap.values());

      return (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() =>
                handleExportCsv(
                  "Model_Price_Difference",
                  ["Model", "SKU", "Brand", "Claims Count", "Max Unit Drop", "Total Units Claimed", "Total Claim Value"],
                  modelList.map((m) => [m.model, m.sku, m.brand, m.announcementsCount, m.maxDrop, m.totalClaimedQty, m.totalClaimedAmount])
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-3">Phone Model</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Brand</th>
                  <th className="p-3 text-right">Claims Recorded</th>
                  <th className="p-3 text-right">Max Price Drop / Unit</th>
                  <th className="p-3 text-right">Total Units Claimed</th>
                  <th className="p-3 text-right">Total Rate Protection Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {modelList.map((m, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60">
                    <td className="p-3 font-bold text-slate-900">{m.model}</td>
                    <td className="p-3 font-mono text-slate-600">{m.sku}</td>
                    <td className="p-3 text-slate-700">{m.brand}</td>
                    <td className="p-3 text-right font-mono font-semibold">{m.announcementsCount}</td>
                    <td className="p-3 text-right font-mono font-bold text-red-600">
                      -{formatMoney(String(m.maxDrop), currency)}
                    </td>
                    <td className="p-3 text-right font-mono font-semibold">{m.totalClaimedQty.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-blue-700">
                      {formatMoney(String(m.totalClaimedAmount), currency)}
                    </td>
                  </tr>
                ))}
                {modelList.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-400">No model price reductions recorded.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    // 3. Supplier Aging & 4. Customer Aging
    if (reportType === "supplier_aging" || reportType === "customer_aging") {
      const isSupplier = reportType === "supplier_aging";
      const targetClaims = data.calculations.filter(
        (c) => (isSupplier ? c.program?.direction === "RECEIVABLE" : c.program?.direction === "PAYABLE") && Number(c.outstandingAmount) > 0
      );

      return (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() =>
                handleExportCsv(
                  isSupplier ? "Supplier_Rebate_Aging" : "Customer_Rebate_Aging",
                  ["Party", "Claim Ref", "Period End", "Approved Amount", "Settled Amount", "Outstanding Balance", "Aging Days"],
                  targetClaims.map((c) => {
                    const days = Math.floor((Date.now() - new Date(c.periodEnd).getTime()) / (1000 * 60 * 60 * 24));
                    return [
                      isSupplier ? c.supplier?.name : c.customer?.name,
                      c.referenceNumber,
                      formatDate(c.periodEnd),
                      c.approvedAmount,
                      c.settledAmount,
                      c.outstandingAmount,
                      days,
                    ];
                  })
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-3">{isSupplier ? "Supplier / Manufacturer" : "Customer / Retailer"}</th>
                  <th className="p-3">Claim Reference</th>
                  <th className="p-3">Claim Date</th>
                  <th className="p-3 text-right">Approved Amount</th>
                  <th className="p-3 text-right">Settled Amount</th>
                  <th className="p-3 text-right">Outstanding Balance</th>
                  <th className="p-3 text-center">Aging Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {targetClaims.map((c, idx) => {
                  const days = Math.max(0, Math.floor((Date.now() - new Date(c.periodEnd).getTime()) / (1000 * 60 * 60 * 24)));
                  return (
                    <tr key={idx} className="hover:bg-slate-50/60">
                      <td className="p-3 font-bold text-slate-900">{isSupplier ? c.supplier?.name : c.customer?.name}</td>
                      <td className="p-3 font-mono text-blue-700 font-bold">{c.referenceNumber}</td>
                      <td className="p-3 text-slate-500">{formatDate(c.periodEnd)}</td>
                      <td className="p-3 text-right font-mono">{formatMoney(String(c.approvedAmount), currency)}</td>
                      <td className="p-3 text-right font-mono text-emerald-700">{formatMoney(String(c.settledAmount), currency)}</td>
                      <td className="p-3 text-right font-mono font-bold text-red-600">{formatMoney(String(c.outstandingAmount), currency)}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${days > 60 ? "bg-red-100 text-red-800" : days > 30 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                          {days} days
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {targetClaims.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-400">All balances fully settled. No outstanding claims.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    // 5. IMEI-Wise Audit Report
    if (reportType === "imei_audit") {
      const imeiRows: Array<{ sku: string; model: string; imei1: string; imei2?: string; serial?: string; claimRef: string; party: string; status: string }> = [];
      for (const calc of data.calculations) {
        const details = (calc.calculationDetails as Record<string, any>) || {};
        if (Array.isArray(details.items)) {
          for (const it of details.items) {
            if (Array.isArray(it.imeis)) {
              for (const im of it.imeis) {
                imeiRows.push({
                  sku: it.sku,
                  model: it.productName,
                  imei1: im.imei1 || im.value || "—",
                  imei2: im.imei2,
                  serial: im.serialNumber || im.serial,
                  claimRef: calc.referenceNumber,
                  party: calc.supplier?.name || calc.customer?.name || "—",
                  status: calc.status,
                });
              }
            }
          }
        }
      }

      return (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() =>
                handleExportCsv(
                  "IMEI_Rate_Protection_Audit",
                  ["IMEI 1", "IMEI 2", "Serial", "Model", "SKU", "Claim Reference", "Party", "Status"],
                  imeiRows.map((im) => [im.imei1, im.imei2 || "", im.serial || "", im.model, im.sku, im.claimRef, im.party, im.status])
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-3">Primary IMEI (1)</th>
                  <th className="p-3">Secondary IMEI (2)</th>
                  <th className="p-3">Model</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Claim Reference</th>
                  <th className="p-3">Vendor / Dealer</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {imeiRows.slice(0, 100).map((im, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60">
                    <td className="p-3 font-mono font-bold text-slate-900">{im.imei1}</td>
                    <td className="p-3 font-mono text-slate-500">{im.imei2 || "—"}</td>
                    <td className="p-3 font-semibold text-slate-800">{im.model}</td>
                    <td className="p-3 font-mono text-slate-600">{im.sku}</td>
                    <td className="p-3 font-mono text-blue-700">{im.claimRef}</td>
                    <td className="p-3 text-slate-700">{im.party}</td>
                    <td className="p-3"><Badge tone={statusTone(im.status)}>{titleCase(im.status)}</Badge></td>
                  </tr>
                ))}
                {imeiRows.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-400">No serialized IMEI units claimed yet.</td></tr>
                ) : null}
              </tbody>
            </table>
            {imeiRows.length > 100 ? (
              <div className="p-3 text-center text-xs text-slate-500 bg-slate-50 border-t border-slate-100">
                Showing first 100 serialized handsets of {imeiRows.length}. Export CSV for the full audit file.
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    // 6. Settlements & 7. Profitability
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
        Select a valid report type from the dropdown above to view the detailed table.
      </div>
    );
  }
}

// ==========================================
// MODAL 1: PRICE ANNOUNCEMENT CREATOR
// ==========================================
function PriceAnnouncementModal({
  currency,
  suppliers,
  accounts,
  products,
  onClose,
  onSuccess,
}: {
  currency: string;
  suppliers: Row[];
  accounts: Row[];
  products: Row[];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [announcementNumber, setAnnouncementNumber] = useState(`PA-${Date.now().toString().slice(-6)}`);
  const [title, setTitle] = useState("");
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || "");
  const [announcementDate, setAnnouncementDate] = useState(today());
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [effectiveTo, setEffectiveTo] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [purchaseDateFrom, setPurchaseDateFrom] = useState("");
  const [purchaseDateTo, setPurchaseDateTo] = useState(today());

  const incomeAccounts = accounts.filter((a) => a.accountClass === "REVENUE");
  const assetAccounts = accounts.filter((a) => a.accountClass === "ASSET");
  const [primaryAccountId, setPrimaryAccountId] = useState(incomeAccounts[0]?.id || accounts[0]?.id || "");
  const [settlementAccountId, setSettlementAccountId] = useState(assetAccounts[0]?.id || accounts[0]?.id || "");

  // Model rows: { variantId, oldPrice, newPrice }
  const [rows, setRows] = useState<
    Array<{ variantId: string; oldPrice: number; newPrice: number; priceDrop: number }>
  >([]);

  // CSV paste string
  const [csvPaste, setCsvPaste] = useState("");

  const addRow = () => {
    const firstProd = products[0];
    if (!firstProd) return;
    setRows((prev) => [
      ...prev,
      {
        variantId: firstProd.variantId,
        oldPrice: firstProd.purchasePrice || 40000,
        newPrice: Math.max(0, (firstProd.purchasePrice || 40000) - 2000),
        priceDrop: 2000,
      },
    ]);
  };

  const updateRow = (idx: number, patch: Partial<{ variantId: string; oldPrice: number; newPrice: number }>) => {
    setRows((prev) => {
      const next = [...prev];
      const current = { ...next[idx], ...patch };
      const drop = Math.max(0, Number(current.oldPrice || 0) - Number(current.newPrice || 0));
      next[idx] = { ...current, priceDrop: drop };
      return next;
    });
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  // Parse CSV: SKU,OldPrice,NewPrice
  const handleParseCsv = () => {
    if (!csvPaste.trim()) return;
    const lines = csvPaste.trim().split("\n");
    const parsed: typeof rows = [];
    const prodMap = new Map(products.map((p) => [p.sku.toLowerCase(), p]));

    for (const line of lines) {
      const parts = line.split(",").map((s) => s.trim());
      if (parts.length >= 3) {
        const [sku, oldP, newP] = parts;
        const prod = prodMap.get(sku.toLowerCase());
        if (prod) {
          const oldVal = parseFloat(oldP) || prod.purchasePrice || 0;
          const newVal = parseFloat(newP) || 0;
          parsed.push({
            variantId: prod.variantId,
            oldPrice: oldVal,
            newPrice: newVal,
            priceDrop: Math.max(0, oldVal - newVal),
          });
        }
      }
    }
    if (parsed.length > 0) {
      setRows((prev) => [...prev, ...parsed]);
      toast.success(`Imported ${parsed.length} model(s) from CSV text.`);
      setCsvPaste("");
    } else {
      toast.error("Could not match SKUs in CSV with existing product catalog.");
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (rows.length === 0) {
      toast.error("Add at least one phone model to the price announcement.");
      return;
    }
    setSubmitting(true);

    const items = rows.map((r) => {
      const p = products.find((prod) => prod.variantId === r.variantId);
      return {
        variantId: r.variantId,
        productId: p?.productId || r.variantId,
        productName: p?.productName || "Mobile Phone",
        variantName: p?.variantName || "Variant",
        brandName: p?.brandName || "",
        sku: p?.sku || "",
        oldPrice: r.oldPrice,
        newPrice: r.newPrice,
        priceDrop: r.priceDrop,
        rebatePerUnit: r.priceDrop,
      };
    });

    const payload = {
      announcementNumber,
      title: title || `Official Price Reduction · ${announcementNumber}`,
      supplierId,
      announcementDate,
      effectiveFrom,
      effectiveTo,
      purchaseDateFrom: purchaseDateFrom || null,
      purchaseDateTo: purchaseDateTo || null,
      primaryAccountId,
      settlementAccountId,
      items,
    };

    const res = await fetch("/api/finance/rebates/announcements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await res.json().catch(() => null);
    setSubmitting(false);

    if (!res.ok) {
      toast.error(body?.error?.message || "Failed to create price announcement.");
      return;
    }
    toast.success("Company price announcement recorded successfully.");
    await onSuccess();
  };

  return (
    <Modal open={true} title="Record Company Mobile Price Announcement" onClose={onClose} size="xl">
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Announcement Ref / Number *</label>
            <input
              type="text"
              required
              value={announcementNumber}
              onChange={(e) => setAnnouncementNumber(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={labelCls}>Manufacturer / Supplier *</label>
            <select
              required
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className={field}
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Announcement Title</label>
            <input
              type="text"
              placeholder="e.g. Samsung Galaxy S25 Official Price Drop"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={field}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div>
            <label className={labelCls}>Announcement Date</label>
            <input
              type="date"
              required
              value={announcementDate}
              onChange={(e) => setAnnouncementDate(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={labelCls}>Effective From</label>
            <input
              type="date"
              required
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={labelCls}>Effective To</label>
            <input
              type="date"
              required
              value={effectiveTo}
              onChange={(e) => setEffectiveTo(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={labelCls}>Stock Purchase Cutoff Date</label>
            <input
              type="date"
              value={purchaseDateTo}
              onChange={(e) => setPurchaseDateTo(e.target.value)}
              className={field}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Primary GL Account (Rebate Income / Cost Reduction) *</label>
            <select
              value={primaryAccountId}
              onChange={(e) => setPrimaryAccountId(e.target.value)}
              className={field}
            >
              {incomeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Settlement GL Account (Supplier Rebate Receivable) *</label>
            <select
              value={settlementAccountId}
              onChange={(e) => setSettlementAccountId(e.target.value)}
              className={field}
            >
              {assetAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Affected Models Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-100 p-2.5 flex items-center justify-between border-b border-slate-200">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
              Affected Mobile Models & Price Drops ({rows.length})
            </span>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={addRow} className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] h-7">
                <Plus className="h-3.5 w-3.5" /> Add Model
              </Button>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[10px]">
                <tr>
                  <th className="p-2">Phone Model / SKU</th>
                  <th className="p-2 w-32 text-right">Previous Price</th>
                  <th className="p-2 w-32 text-right">New Price</th>
                  <th className="p-2 w-32 text-right">Price Drop</th>
                  <th className="p-2 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, idx) => {
                  const p = products.find((prod) => prod.variantId === row.variantId);
                  return (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2">
                        <select
                          value={row.variantId}
                          onChange={(e) => {
                            const newProd = products.find((prod) => prod.variantId === e.target.value);
                            updateRow(idx, {
                              variantId: e.target.value,
                              oldPrice: newProd?.purchasePrice || row.oldPrice,
                              newPrice: Math.max(0, (newProd?.purchasePrice || row.oldPrice) - row.priceDrop),
                            });
                          }}
                          className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs"
                        >
                          {products.map((prod) => (
                            <option key={prod.variantId} value={prod.variantId}>
                              {prod.productName} ({prod.sku})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.oldPrice}
                          onChange={(e) => updateRow(idx, { oldPrice: parseFloat(e.target.value) || 0 })}
                          className="h-8 w-full rounded border border-slate-200 px-2 text-right font-mono text-xs"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.newPrice}
                          onChange={(e) => updateRow(idx, { newPrice: parseFloat(e.target.value) || 0 })}
                          className="h-8 w-full rounded border border-slate-200 px-2 text-right font-mono text-xs"
                        />
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-red-600">
                        -{formatMoney(String(row.priceDrop), currency)}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-slate-400 italic">
                      Click &quot;Add Model&quot; or paste CSV below to populate price reductions.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* CSV Import Tool */}
        <div className="rounded-xl border border-dashed border-slate-300 p-3 bg-slate-50">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold text-slate-700 text-[11px] flex items-center gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              Quick Batch Import (Paste CSV format: SKU,OldPrice,NewPrice)
            </span>
            <Button type="button" size="sm" onClick={handleParseCsv} className="h-6 text-[10px] px-2 bg-slate-800 text-white">
              Parse & Add
            </Button>
          </div>
          <textarea
            rows={2}
            placeholder="e.g.&#10;SAM-S25-128,40000,38000&#10;XIA-14T-256,50000,47000"
            value={csvPaste}
            onChange={(e) => setCsvPaste(e.target.value)}
            className="w-full rounded border border-slate-200 p-2 font-mono text-[11px] outline-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            Save Price Announcement
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ==========================================
// MODAL 2: STOCK & IMEI ELIGIBILITY SCANNER (CORE)
// ==========================================
function StockEligibilityScannerModal({
  currency,
  initialSupplierId,
  initialProgramId,
  announcement,
  programs,
  suppliers,
  warehouses,
  branches,
  products,
  onClose,
  onSuccess,
}: {
  currency: string;
  initialSupplierId?: string;
  initialProgramId?: string;
  announcement?: Row;
  programs: Row[];
  suppliers: Row[];
  warehouses: Row[];
  branches: Row[];
  products: Row[];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [supplierId, setSupplierId] = useState(initialSupplierId || announcement?.supplierId || suppliers[0]?.id || "");
  const [selectedProgramId, setSelectedProgramId] = useState(initialProgramId || programs[0]?.id || "");
  const [warehouseId, setWarehouseId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(today());

  const [scanning, setScanning] = useState(false);
  const [submittingClaim, setSubmittingClaim] = useState(false);
  const [summaries, setSummaries] = useState<Row[]>([]);
  const [claimTitle, setClaimTitle] = useState("");
  const [manualAdjustmentReason, setManualAdjustmentReason] = useState("");

  // Target announcement items if available
  const announcementItems = useMemo(() => {
    const rules = announcement?.rules || {};
    return Array.isArray(rules.items) ? rules.items : [];
  }, [announcement]);

  const targetVariantIds = useMemo(() => {
    if (announcementItems.length > 0) {
      return announcementItems.map((it: any) => it.variantId);
    }
    return [];
  }, [announcementItems]);

  const runEligibilityScan = useCallback(async () => {
    setScanning(true);
    const payload = {
      type: "STOCK",
      supplierId: supplierId || null,
      warehouseId: warehouseId || null,
      branchId: branchId || null,
      variantIds: targetVariantIds.length > 0 ? targetVariantIds : undefined,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    };

    const res = await fetch("/api/finance/rebates/eligibility", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await res.json().catch(() => null);
    setScanning(false);

    if (!res.ok) {
      toast.error(body?.error?.message || "Eligibility engine failed to scan stock.");
      return;
    }

    const dataRows: Row[] = body.data || [];

    // Map in price drop and calculate claim amount for each variant
    const enriched = dataRows.map((v) => {
      const matchAnn = announcementItems.find((it: any) => it.variantId === v.variantId);
      const oldPrice = matchAnn?.oldPrice || v.purchasePrice || 40000;
      const newPrice = matchAnn?.newPrice || Math.max(0, oldPrice - 2000);
      const drop = Math.max(0, oldPrice - newPrice);
      const eligibleQty = v.eligibleQuantity || 0;
      const claimAmount = eligibleQty * drop;

      return {
        ...v,
        oldPrice,
        newPrice,
        priceDropPerUnit: drop,
        claimedQuantity: eligibleQty,
        claimAmount,
        selectedUnitIds: v.units.filter((u: any) => u.isEligible).map((u: any) => u.stockUnitId),
      };
    });

    setSummaries(enriched);
    toast.success(`Identified ${enriched.reduce((sum, r: any) => sum + Number(r.eligibleQuantity || 0), 0)} eligible unit(s) across ${enriched.length} models.`);
  }, [supplierId, warehouseId, branchId, targetVariantIds, dateFrom, dateTo, announcementItems]);

  useEffect(() => {
    void runEligibilityScan();
  }, [runEligibilityScan]);

  const updateSummaryQty = (variantId: string, claimedQty: number) => {
    setSummaries((prev) =>
      prev.map((s) => {
        if (s.variantId !== variantId) return s;
        const qty = Math.max(0, claimedQty);
        return {
          ...s,
          claimedQuantity: qty,
          claimAmount: qty * (s.priceDropPerUnit || 0),
        };
      })
    );
  };

  const totalClaimAmount = useMemo(
    () => summaries.reduce((sum, r) => sum + Number(r.claimAmount || 0), 0),
    [summaries]
  );
  const totalEligibleUnits = useMemo(
    () => summaries.reduce((sum, r) => sum + Number(r.claimedQuantity || 0), 0),
    [summaries]
  );

  const handleSubmitClaim = async () => {
    if (totalClaimAmount <= 0) {
      toast.error("Total claim amount must be greater than zero.");
      return;
    }
    if (!selectedProgramId) {
      toast.error("Select or create a rebate program to file this claim under.");
      return;
    }

    setSubmittingClaim(true);

    const items = summaries
      .filter((s) => s.claimedQuantity > 0)
      .map((s) => ({
        productId: s.productId,
        variantId: s.variantId,
        productName: s.productName,
        variantName: s.variantName,
        brandName: s.brandName,
        sku: s.sku,
        currentStock: s.physicalStock,
        eligibleQuantity: s.eligibleQuantity,
        claimedQuantity: s.claimedQuantity,
        oldPrice: s.oldPrice,
        newPrice: s.newPrice,
        priceDropPerUnit: s.priceDropPerUnit,
        claimAmount: s.claimAmount,
        claimedUnitIds: s.selectedUnitIds || [],
        imeis: (s.units || []).filter((u: any) => u.isEligible),
        manualAdjustmentReason: manualAdjustmentReason || null,
      }));

    const payload = {
      periodStart: dateFrom || today(),
      periodEnd: dateTo || today(),
      items,
      title: claimTitle || `Price Protection Claim · ${formatDate(today())}`,
      remarks: manualAdjustmentReason || null,
      submitImmediately: true,
    };

    const res = await fetch(`/api/finance/rebates/programs/${selectedProgramId}/calculate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await res.json().catch(() => null);
    setSubmittingClaim(false);

    if (!res.ok) {
      toast.error(body?.error?.message || "Failed to submit price protection claim.");
      return;
    }

    toast.success("Price protection claim generated and submitted for management approval.");
    await onSuccess();
  };

  return (
    <Modal open={true} title="Old Stock Price Protection Eligibility Engine" onClose={onClose} size="xl">
      <div className="space-y-4 text-xs">
        {/* Filter Configuration */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div>
            <label className={labelCls}>Supplier / Manufacturer</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className={field}
            >
              <option value="">All Suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Warehouse Scope</label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className={field}
            >
              <option value="">All Warehouses</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Purchase / GRN Cutoff</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={field}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              onClick={runEligibilityScan}
              loading={scanning}
              className="bg-emerald-600 hover:bg-emerald-700 text-white w-full h-10"
            >
              <RefreshCw className="h-4 w-4" /> Re-scan Stock
            </Button>
          </div>
        </div>

        {/* Results KPI Bar */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <span className="text-[10px] font-bold uppercase text-slate-400">Total Unsold Units</span>
            <div className="mt-1 text-base font-black text-slate-900">{totalEligibleUnits.toLocaleString()} units</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <span className="text-[10px] font-bold uppercase text-slate-400">Deduplicated IMEIs</span>
            <div className="mt-1 text-base font-black text-indigo-700">1 Handset = 1 Unit</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
            <span className="text-[10px] font-bold uppercase text-emerald-700">Calculated Entitlement</span>
            <div className="mt-1 text-base font-black text-emerald-900">{formatMoney(String(totalClaimAmount), currency)}</div>
          </div>
        </div>

        {/* Eligible Models Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-100 p-2.5 font-bold text-slate-800 uppercase tracking-wider text-[11px]">
            Eligible Inventory & Price Drop Grid ({summaries.length} models)
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[10px]">
                <tr>
                  <th className="p-2">Model Description</th>
                  <th className="p-2">SKU</th>
                  <th className="p-2 text-right">Physical Stock</th>
                  <th className="p-2 text-right">Prior Claimed</th>
                  <th className="p-2 text-right">Net Eligible</th>
                  <th className="p-2 text-right w-24">Claim Qty</th>
                  <th className="p-2 text-right">Drop / Unit</th>
                  <th className="p-2 text-right">Claim Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaries.map((s) => (
                  <tr key={s.variantId} className="hover:bg-slate-50">
                    <td className="p-2 font-semibold text-slate-900">
                      {s.productName}
                      <span className="block text-[10px] text-slate-400 font-normal">{s.brandName}</span>
                    </td>
                    <td className="p-2 font-mono text-slate-600">{s.sku}</td>
                    <td className="p-2 text-right font-mono">{s.physicalStock}</td>
                    <td className="p-2 text-right font-mono text-amber-600 font-semibold">{s.previouslyClaimedQuantity}</td>
                    <td className="p-2 text-right font-mono font-bold text-emerald-700">{s.eligibleQuantity}</td>
                    <td className="p-2 text-right">
                      <input
                        type="number"
                        min="0"
                        max={s.eligibleQuantity}
                        value={s.claimedQuantity}
                        onChange={(e) => updateSummaryQty(s.variantId, parseInt(e.target.value) || 0)}
                        className="h-7 w-20 rounded border border-slate-200 px-1.5 text-right font-mono text-xs"
                      />
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-red-600">
                      -{formatMoney(String(s.priceDropPerUnit || 0), currency)}
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-blue-700">
                      {formatMoney(String(s.claimAmount || 0), currency)}
                    </td>
                  </tr>
                ))}
                {summaries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-slate-400">
                      No eligible old stock found for selected criteria.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* Claim Submission Settings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div>
            <label className={labelCls}>Target Rebate Program *</label>
            <select
              value={selectedProgramId}
              onChange={(e) => setSelectedProgramId(e.target.value)}
              className={field}
            >
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Claim Voucher Title</label>
            <input
              type="text"
              placeholder="e.g. Official Samsung Price Drop Claim Q1"
              value={claimTitle}
              onChange={(e) => setClaimTitle(e.target.value)}
              className={field}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Manual Adjustment / Auditor Remarks</label>
            <input
              type="text"
              placeholder="Reason for any quantity override or claim notes"
              value={manualAdjustmentReason}
              onChange={(e) => setManualAdjustmentReason(e.target.value)}
              className={field}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            loading={submittingClaim}
            onClick={handleSubmitClaim}
            disabled={totalClaimAmount <= 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
          >
            Submit Official Claim ({formatMoney(String(totalClaimAmount), currency)})
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ==========================================
// MODAL 3: CUSTOMER PRICE PROTECTION (GIVEN)
// ==========================================
function CustomerPriceProtectionModal({
  currency,
  customers,
  products,
  programs,
  onClose,
  onSuccess,
}: {
  currency: string;
  customers: Row[];
  products: Row[];
  programs: Row[];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [customerId, setCustomerId] = useState(customers[0]?.id || "");
  const [programId, setProgramId] = useState(programs[0]?.id || "");
  const [claimDate, setClaimDate] = useState(today());
  const [settlementType, setSettlementType] = useState<"CREDIT_NOTE" | "ACCOUNT_ADJUSTMENT" | "BANK_REFUND" | "CASH_REFUND">("CREDIT_NOTE");
  const [reference, setReference] = useState(`CN-${Date.now().toString().slice(-6)}`);
  const [remarks, setRemarks] = useState("");

  const [rows, setRows] = useState<
    Array<{ variantId: string; soldQty: number; oldPrice: number; newPrice: number; rebatePerUnit: number; totalRebate: number }>
  >([]);

  const addRow = () => {
    const firstProd = products[0];
    if (!firstProd) return;
    setRows((prev) => [
      ...prev,
      {
        variantId: firstProd.variantId,
        soldQty: 1,
        oldPrice: 42000,
        newPrice: 40000,
        rebatePerUnit: 2000,
        totalRebate: 2000,
      },
    ]);
  };

  const updateRow = (idx: number, patch: Partial<{ variantId: string; soldQty: number; oldPrice: number; newPrice: number }>) => {
    setRows((prev) => {
      const next = [...prev];
      const current = { ...next[idx], ...patch };
      const diff = Math.max(0, Number(current.oldPrice || 0) - Number(current.newPrice || 0));
      const total = diff * Number(current.soldQty || 0);
      next[idx] = { ...current, rebatePerUnit: diff, totalRebate: total };
      return next;
    });
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalCreditAmount = useMemo(
    () => rows.reduce((sum, r) => sum + Number(r.totalRebate || 0), 0),
    [rows]
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (rows.length === 0 || totalCreditAmount <= 0) {
      toast.error("Add at least one item with eligible credit compensation.");
      return;
    }
    setSubmitting(true);

    const items = rows.map((r) => {
      const prod = products.find((p) => p.variantId === r.variantId);
      return {
        productId: prod?.productId || r.variantId,
        variantId: r.variantId,
        productName: prod?.productName || "Phone Model",
        variantName: prod?.variantName || "Variant",
        sku: prod?.sku || "",
        soldQuantity: r.soldQty,
        eligibleQuantity: r.soldQty,
        oldPrice: r.oldPrice,
        newPrice: r.newPrice,
        rebatePerUnit: r.rebatePerUnit,
        totalRebate: r.totalRebate,
      };
    });

    const payload = {
      customerId,
      programId: programId || programs[0]?.id,
      claimDate,
      settlementType,
      reference,
      remarks,
      items,
    };

    const res = await fetch("/api/finance/rebates/customer-rebates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await res.json().catch(() => null);
    setSubmitting(false);

    if (!res.ok) {
      toast.error(body?.error?.message || "Failed to issue customer price protection.");
      return;
    }

    toast.success("Customer price protection credit note issued successfully.");
    await onSuccess();
  };

  return (
    <Modal open={true} title="Issue Customer / Dealer Price Protection Credit Note" onClose={onClose} size="xl">
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Customer / Dealer *</label>
            <select
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className={field}
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Credit Note Reference # *</label>
            <input
              type="text"
              required
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={labelCls}>Settlement Mode *</label>
            <select
              value={settlementType}
              onChange={(e) => setSettlementType(e.target.value as any)}
              className={field}
            >
              <option value="CREDIT_NOTE">Credit Note (Reduces AR)</option>
              <option value="ACCOUNT_ADJUSTMENT">Customer Account Adjustment</option>
              <option value="BANK_REFUND">Bank Transfer Refund</option>
              <option value="CASH_REFUND">Cash Refund</option>
            </select>
          </div>
        </div>

        {/* Items Grid */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-100 p-2.5 flex items-center justify-between border-b border-slate-200">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
              Eligible Invoiced Products ({rows.length})
            </span>
            <Button type="button" size="sm" onClick={addRow} className="bg-purple-600 hover:bg-purple-700 text-white text-[11px] h-7">
              <Plus className="h-3.5 w-3.5" /> Add Sold Model
            </Button>
          </div>

          <div className="max-h-56 overflow-y-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[10px]">
                <tr>
                  <th className="p-2">Phone Model</th>
                  <th className="p-2 w-20 text-right">Sold Qty</th>
                  <th className="p-2 w-28 text-right">Old Sell Price</th>
                  <th className="p-2 w-28 text-right">New Sell Price</th>
                  <th className="p-2 w-28 text-right">Comp / Unit</th>
                  <th className="p-2 w-28 text-right">Total Credit</th>
                  <th className="p-2 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-2">
                      <select
                        value={row.variantId}
                        onChange={(e) => updateRow(idx, { variantId: e.target.value })}
                        className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs"
                      >
                        {products.map((p) => (
                          <option key={p.variantId} value={p.variantId}>
                            {p.productName} ({p.sku})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min="1"
                        value={row.soldQty}
                        onChange={(e) => updateRow(idx, { soldQty: parseInt(e.target.value) || 0 })}
                        className="h-8 w-full rounded border border-slate-200 px-2 text-right font-mono text-xs"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.oldPrice}
                        onChange={(e) => updateRow(idx, { oldPrice: parseFloat(e.target.value) || 0 })}
                        className="h-8 w-full rounded border border-slate-200 px-2 text-right font-mono text-xs"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.newPrice}
                        onChange={(e) => updateRow(idx, { newPrice: parseFloat(e.target.value) || 0 })}
                        className="h-8 w-full rounded border border-slate-200 px-2 text-right font-mono text-xs"
                      />
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-red-600">
                      -{formatMoney(String(row.rebatePerUnit), currency)}
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-purple-700">
                      {formatMoney(String(row.totalRebate), currency)}
                    </td>
                    <td className="p-2 text-center">
                      <button type="button" onClick={() => removeRow(idx)} className="text-slate-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-slate-400 italic">
                      Click &quot;Add Sold Model&quot; to specify customer compensation lines.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <label className={labelCls}>Remarks / Sales Invoice Note</label>
          <input
            type="text"
            placeholder="e.g. Rate protection compensation against Sales Invoice #ISB-INV-0012"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className={field}
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={submitting}
            disabled={totalCreditAmount <= 0}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold"
          >
            Issue Credit ({formatMoney(String(totalCreditAmount), currency)})
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ==========================================
// MODAL 4: CLAIM BREAKDOWN & IMEI VIEWER
// ==========================================
function ClaimBreakdownModal({
  calculation,
  currency,
  onClose,
  onViewImeis,
}: {
  calculation: Row;
  currency: string;
  onClose: () => void;
  onViewImeis: (item: Row) => void;
}) {
  const details = (calculation.calculationDetails as Record<string, any>) || {};
  const items: Row[] = Array.isArray(details.items) ? details.items : [];
  const isReceivable = calculation.program?.direction === "RECEIVABLE";

  return (
    <Modal open={true} title={`Claim Breakdown & Item Details · ${calculation.referenceNumber}`} onClose={onClose} size="xl">
      <div className="space-y-4 text-xs">
        {/* Header Metadata */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Claim Party</span>
            <p className="font-bold text-slate-800 text-sm">{isReceivable ? calculation.supplier?.name : calculation.customer?.name}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Total Claim</span>
            <p className="font-bold text-blue-700 text-sm">{formatMoney(String(calculation.calculatedAmount), currency)}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Settled to Date</span>
            <p className="font-bold text-emerald-700 text-sm">{formatMoney(String(calculation.settledAmount), currency)}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Outstanding</span>
            <p className="font-bold text-red-600 text-sm">{formatMoney(String(calculation.outstandingAmount), currency)}</p>
          </div>
        </div>

        {/* Item-Wise Breakdown Grid */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-100 p-2.5 font-bold text-slate-800 uppercase tracking-wider text-[11px]">
            Model-Wise Price Difference & Quantity Allocation
          </div>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[10px]">
                <tr>
                  <th className="p-2">Model Description</th>
                  <th className="p-2">SKU</th>
                  <th className="p-2 text-right">Old Price</th>
                  <th className="p-2 text-right">New Price</th>
                  <th className="p-2 text-right">Drop / Unit</th>
                  <th className="p-2 text-right">Claim Qty</th>
                  <th className="p-2 text-right">Claim Amount</th>
                  <th className="p-2 text-right">Settled</th>
                  <th className="p-2 text-center">IMEIs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it, idx) => {
                  const imeiCount = Array.isArray(it.imeis) ? it.imeis.length : 0;
                  return (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2 font-semibold text-slate-900">{it.productName}</td>
                      <td className="p-2 font-mono text-slate-600">{it.sku}</td>
                      <td className="p-2 text-right font-mono">{formatMoney(String(it.oldPrice || 0), currency)}</td>
                      <td className="p-2 text-right font-mono">{formatMoney(String(it.newPrice || 0), currency)}</td>
                      <td className="p-2 text-right font-mono font-bold text-red-600">
                        -{formatMoney(String(it.priceDropPerUnit || 0), currency)}
                      </td>
                      <td className="p-2 text-right font-mono font-semibold">
                        {Number(it.claimedQuantity || it.eligibleQuantity || 0).toLocaleString()}
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-blue-700">
                        {formatMoney(String(it.claimAmount || 0), currency)}
                      </td>
                      <td className="p-2 text-right font-mono font-semibold text-emerald-700">
                        {formatMoney(String(it.settledAmount || 0), currency)}
                      </td>
                      <td className="p-2 text-center">
                        {imeiCount > 0 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onViewImeis(it)}
                            className="h-6 text-[10px] px-2 font-mono"
                          >
                            <Smartphone className="h-3 w-3 mr-1 text-indigo-600" />
                            {imeiCount} IMEIs
                          </Button>
                        ) : (
                          <span className="text-[10px] text-slate-400">Bulk Qty</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {details.rejectionReason ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
            <span className="font-bold uppercase text-[10px]">Rejection Reason:</span>
            <p className="mt-0.5">{details.rejectionReason}</p>
          </div>
        ) : null}

        <div className="flex justify-end pt-3 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ==========================================
// MODAL 5: IMEI LIST DRAWER
// ==========================================
function ImeiListModal({
  item,
  onClose,
}: {
  item: Row;
  onClose: () => void;
}) {
  const imeis: Row[] = Array.isArray(item.imeis) ? item.imeis : [];

  return (
    <Modal open={true} title={`Verified Serial / IMEI Device Register · ${item.productName}`} onClose={onClose} size="lg">
      <div className="space-y-3 text-xs">
        <p className="text-slate-500">
          Showing {imeis.length} physical handset units verified for model SKU <span className="font-mono font-bold text-slate-800">{item.sku}</span>.
          Dual-SIM handsets are paired and counted as 1 unit.
        </p>

        <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-xl">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[10px]">
              <tr>
                <th className="p-2">#</th>
                <th className="p-2">Primary IMEI (1)</th>
                <th className="p-2">Secondary IMEI (2)</th>
                <th className="p-2">Serial / Batch</th>
                <th className="p-2">Goods Receipt</th>
                <th className="p-2">Warehouse</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {imeis.map((im, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="p-2 text-slate-400 text-[10px]">{idx + 1}</td>
                  <td className="p-2 font-bold text-slate-900">{im.imei1 || im.value || "—"}</td>
                  <td className="p-2 text-slate-500">{im.imei2 || "—"}</td>
                  <td className="p-2 text-slate-500">{im.serialNumber || im.serial || "—"}</td>
                  <td className="p-2 text-slate-600 text-[10px] font-sans">{im.receiptNumber || "—"}</td>
                  <td className="p-2 text-slate-600 text-[10px] font-sans">{im.warehouseName || "Main"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ==========================================
// MODAL 6: SETTLEMENT MODAL (PARTIAL & FULL)
// ==========================================
function SettlementModal({
  calculation,
  currency,
  paymentMethods,
  bankAccounts,
  onClose,
  onSuccess,
}: {
  calculation: Row;
  currency: string;
  paymentMethods: Row[];
  bankAccounts: Row[];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const isReceivable = calculation.program?.direction === "RECEIVABLE";
  const outstanding = Number(calculation.outstandingAmount || 0);

  const [amount, setAmount] = useState(outstanding.toFixed(2));
  const [settlementDate, setSettlementDate] = useState(today());
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id || "");
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id || "");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!val || val <= 0 || val > outstanding) {
      toast.error(`Settlement amount must be between 0.01 and ${formatMoney(String(outstanding), currency)}.`);
      return;
    }
    setSubmitting(true);

    const payload = {
      amount: String(val),
      settlementDate,
      paymentMethodId,
      bankAccountId: bankAccountId || null,
      reference: reference || null,
      notes: notes || null,
    };

    const res = await fetch(`/api/finance/rebates/calculations/${calculation.id}/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await res.json().catch(() => null);
    setSubmitting(false);

    if (!res.ok) {
      toast.error(body?.error?.message || "Settlement failed.");
      return;
    }

    toast.success("Settlement recorded and General Ledger journal posted.");
    await onSuccess();
  };

  return (
    <Modal open={true} title={`Record Rebate Settlement · ${calculation.referenceNumber}`} onClose={onClose} size="md">
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 flex justify-between items-center">
          <div>
            <span className="text-[10px] uppercase font-bold text-blue-700">Outstanding Balance</span>
            <p className="font-black text-blue-950 text-base">{formatMoney(String(outstanding), currency)}</p>
          </div>
          <Badge tone={isReceivable ? "green" : "purple"}>
            {isReceivable ? "Supplier Receipt" : "Customer Payment"}
          </Badge>
        </div>

        <div>
          <label className={labelCls}>Settlement Amount ({currency}) *</label>
          <input
            type="number"
            step="0.01"
            max={outstanding}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={field}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Partial settlement is supported. Remaining balance will update automatically.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Settlement Date *</label>
            <input
              type="date"
              required
              value={settlementDate}
              onChange={(e) => setSettlementDate(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={labelCls}>Payment / Receipt Method *</label>
            <select
              required
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              className={field}
            >
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Bank / Cash Account</label>
          <select
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
            className={field}
          >
            <option value="">Default Clearing Account</option>
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bankName} ({b.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Transaction / Cheque / Slip Reference</label>
          <input
            type="text"
            placeholder="e.g. Bank Ref #TX-892120"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className={field}
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
            Post Settlement ({formatMoney(String(amount || 0), currency)})
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ==========================================
// MODAL 7: REJECTION REASON MODAL
// ==========================================
function RejectModal({
  calculation,
  onClose,
  onSuccess,
}: {
  calculation: Row;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error("Please provide a rejection reason.");
      return;
    }
    setSubmitting(true);

    const res = await fetch(`/api/finance/rebates/calculations/${calculation.id}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    });

    const body = await res.json().catch(() => null);
    setSubmitting(false);

    if (!res.ok) {
      toast.error(body?.error?.message || "Rejection failed.");
      return;
    }

    toast.success("Claim marked as rejected.");
    await onSuccess();
  };

  return (
    <Modal open={true} title={`Reject Claim · ${calculation.referenceNumber}`} onClose={onClose} size="md">
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <p className="text-slate-600">
          State the reason why this claim is being rejected (e.g., manufacturer dispute, claim deadline passed, ineligible batch).
        </p>

        <div>
          <label className={labelCls}>Rejection Reason *</label>
          <textarea
            required
            rows={3}
            placeholder="Enter mandatory audit explanation..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-slate-200 p-2.5 outline-none focus:border-red-500"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} variant="danger">
            Confirm Rejection
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ==========================================
// MODAL 8: MASTER PROGRAM EDITOR
// ==========================================
function ProgramEditorModal({
  program,
  suppliers,
  customers,
  accounts,
  onClose,
  onSuccess,
}: {
  program: Row | null;
  suppliers: Row[];
  customers: Row[];
  accounts: Row[];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [code, setCode] = useState(program?.code || `RP-${Date.now().toString().slice(-4)}`);
  const [name, setName] = useState(program?.name || "");
  const [direction, setDirection] = useState<"RECEIVABLE" | "PAYABLE">(program?.direction || "RECEIVABLE");
  const [supplierId, setSupplierId] = useState(program?.supplierId || suppliers[0]?.id || "");
  const [customerId, setCustomerId] = useState(program?.customerId || customers[0]?.id || "");
  const [calculationMethod, setCalculationMethod] = useState(program?.calculationMethod || "PRICE_PROTECTION");
  const [effectiveFrom, setEffectiveFrom] = useState(program ? formatDate(program.effectiveFrom) : today());
  const [effectiveTo, setEffectiveTo] = useState(program ? formatDate(program.effectiveTo) : "2027-12-31");

  const revenueAccounts = accounts.filter((a) => a.accountClass === "REVENUE");
  const expenseAccounts = accounts.filter((a) => a.accountClass === "EXPENSE");
  const assetAccounts = accounts.filter((a) => a.accountClass === "ASSET");
  const liabilityAccounts = accounts.filter((a) => a.accountClass === "LIABILITY");

  const [primaryAccountId, setPrimaryAccountId] = useState(
    program?.primaryAccountId || (direction === "RECEIVABLE" ? revenueAccounts[0]?.id : expenseAccounts[0]?.id) || accounts[0]?.id || ""
  );
  const [settlementAccountId, setSettlementAccountId] = useState(
    program?.settlementAccountId || (direction === "RECEIVABLE" ? assetAccounts[0]?.id : liabilityAccounts[0]?.id) || accounts[0]?.id || ""
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const payload = {
      code,
      name,
      direction,
      supplierId: direction === "RECEIVABLE" ? supplierId : null,
      customerId: direction === "PAYABLE" ? customerId : null,
      calculationMethod,
      effectiveFrom,
      effectiveTo,
      primaryAccountId,
      settlementAccountId,
      accountingTreatment: direction === "RECEIVABLE" ? "INCOME" : "COST_REDUCTION",
      isActive: true,
    };

    const url = program ? `/api/finance/rebates/programs/${program.id}` : "/api/finance/rebates/programs";
    const res = await fetch(url, {
      method: program ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await res.json().catch(() => null);
    setSubmitting(false);

    if (!res.ok) {
      toast.error(body?.error?.message || "Failed to save rebate program.");
      return;
    }

    toast.success("Rebate program saved successfully.");
    await onSuccess();
  };

  return (
    <Modal open={true} title={program ? `Edit Program · ${program.code}` : "New Master Rebate Program"} onClose={onClose} size="md">
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Program Code *</label>
            <input
              type="text"
              required
              disabled={Boolean(program)}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={labelCls}>Rebate Direction *</label>
            <select
              value={direction}
              onChange={(e) => {
                const d = e.target.value as "RECEIVABLE" | "PAYABLE";
                setDirection(d);
                setPrimaryAccountId(d === "RECEIVABLE" ? revenueAccounts[0]?.id || "" : expenseAccounts[0]?.id || "");
                setSettlementAccountId(d === "RECEIVABLE" ? assetAccounts[0]?.id || "" : liabilityAccounts[0]?.id || "");
              }}
              className={field}
            >
              <option value="RECEIVABLE">Receivable (From Supplier)</option>
              <option value="PAYABLE">Payable (To Customer / Dealer)</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Program Name *</label>
          <input
            type="text"
            required
            placeholder="e.g. Rate Protection Agreement 2026-27"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={field}
          />
        </div>

        {direction === "RECEIVABLE" ? (
          <div>
            <label className={labelCls}>Supplier / Manufacturer *</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className={field}
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className={labelCls}>Customer / Retailer *</label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className={field}
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={labelCls}>Calculation Engine Method *</label>
          <select
            value={calculationMethod}
            onChange={(e) => setCalculationMethod(e.target.value)}
            className={field}
          >
            <option value="PRICE_PROTECTION">Rate Protection (Old Stock Price Drop)</option>
            <option value="PERCENT_OF_VALUE">Percentage of Net Value</option>
            <option value="PER_UNIT">Fixed Rate Per Unit</option>
            <option value="FIXED_AMOUNT">Fixed Periodic Rebate</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Effective From</label>
            <input
              type="date"
              required
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={labelCls}>Effective To</label>
            <input
              type="date"
              required
              value={effectiveTo}
              onChange={(e) => setEffectiveTo(e.target.value)}
              className={field}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>GL Income / Expense Account *</label>
            <select
              value={primaryAccountId}
              onChange={(e) => setPrimaryAccountId(e.target.value)}
              className={field}
            >
              {direction === "RECEIVABLE"
                ? revenueAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))
                : expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>GL Settlement / Clearing Account *</label>
            <select
              value={settlementAccountId}
              onChange={(e) => setSettlementAccountId(e.target.value)}
              className={field}
            >
              {direction === "RECEIVABLE"
                ? assetAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))
                : liabilityAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} className="bg-blue-600 hover:bg-blue-700 text-white">
            Save Program
          </Button>
        </div>
      </form>
    </Modal>
  );
}
