"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck2,
  FileClock,
  Filter,
  Landmark,
  Layers,
  Search,
  ShieldAlert,
  ShoppingCart,
  Truck,
  User,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { formatDate, formatMoney } from "@/lib/utils";

interface PendingApprovalItem {
  id: string;
  documentType:
    | "PURCHASE_ORDER"
    | "PURCHASE_RECEIPT"
    | "SALES_INVOICE"
    | "STOCK_TRANSFER"
    | "STOCK_ADJUSTMENT"
    | "PAYMENT"
    | "JOURNAL"
    | "BUDGET"
    | "INCENTIVE"
    | "REBATE";
  documentNumber: string;
  documentDate: string;
  domain: "Procurement" | "Sales" | "Inventory" | "Finance";
  branch: string;
  counterparty: string;
  summary: string;
  amount: string;
  preparer: { id: string; fullName: string; username: string };
  viewUrl: string;
  createdAt: string;
}

export function ApprovalsWorkspace({
  currencyCode,
  userPermissions,
  currentUserId,
}: {
  currencyCode: string;
  userPermissions: string[];
  currentUserId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<PendingApprovalItem[]>([]);
  const [counts, setCounts] = useState({
    total: 0,
    procurement: 0,
    sales: 0,
    inventory: 0,
    finance: 0,
  });

  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("ALL");
  const [selectedItem, setSelectedItem] = useState<PendingApprovalItem | null>(null);
  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/approvals");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Failed to load pending approvals");
      setItems(json.data.items);
      setCounts(json.data.counts);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error loading approvals");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleAction() {
    if (!selectedItem || !confirmAction) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: selectedItem.documentType,
          id: selectedItem.id,
          action: confirmAction,
          reason: rejectReason,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || `Failed to ${confirmAction} document`);
      toast.success(
        confirmAction === "approve"
          ? `${selectedItem.documentNumber} approved successfully.`
          : `${selectedItem.documentNumber} rejected.`
      );
      setSelectedItem(null);
      setConfirmAction(null);
      setRejectReason("");
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : `Action failed`);
    } finally {
      setSubmitting(false);
    }
  }

  const filteredItems = items.filter((item) => {
    if (domainFilter !== "ALL" && item.domain !== domainFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchNum = item.documentNumber.toLowerCase().includes(q);
      const matchParty = item.counterparty.toLowerCase().includes(q);
      const matchSummary = item.summary.toLowerCase().includes(q);
      const matchPrep = item.preparer.fullName.toLowerCase().includes(q);
      if (!matchNum && !matchParty && !matchSummary && !matchPrep) return false;
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-[1520px] space-y-6">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="kicker">Corporate Governance</span>
            <Badge tone="amber">
              <Clock className="mr-1 h-3 w-3" />
              {counts.total} Awaiting Decision
            </Badge>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Approvals Command Center
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Centralized queue for maker-checker authorization across procurement, sales, stock custody, and financial vouchers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadData}>
            Refresh Queue
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button
          onClick={() => setDomainFilter("ALL")}
          className={`surface p-5 text-left transition hover:-translate-y-0.5 hover:shadow-float ${
            domainFilter === "ALL" ? "border-blue-500 ring-1 ring-blue-500" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Queue
            </span>
            <span className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
              <FileCheck2 className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{counts.total}</p>
          <p className="mt-1 text-xs text-slate-400">All modules combined</p>
        </button>

        <button
          onClick={() => setDomainFilter("Procurement")}
          className={`surface p-5 text-left transition hover:-translate-y-0.5 hover:shadow-float ${
            domainFilter === "Procurement" ? "border-blue-500 ring-1 ring-blue-500" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Procurement
            </span>
            <span className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
              <Truck className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{counts.procurement}</p>
          <p className="mt-1 text-xs text-slate-400">Purchase orders & goods receipts</p>
        </button>

        <button
          onClick={() => setDomainFilter("Sales")}
          className={`surface p-5 text-left transition hover:-translate-y-0.5 hover:shadow-float ${
            domainFilter === "Sales" ? "border-blue-500 ring-1 ring-blue-500" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Sales & Invoicing
            </span>
            <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
              <ShoppingCart className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{counts.sales}</p>
          <p className="mt-1 text-xs text-slate-400">Customer invoices & discounts</p>
        </button>

        <button
          onClick={() => setDomainFilter("Finance")}
          className={`surface p-5 text-left transition hover:-translate-y-0.5 hover:shadow-float ${
            domainFilter === "Finance" ? "border-blue-500 ring-1 ring-blue-500" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Finance & Payments
            </span>
            <span className="rounded-xl bg-violet-50 p-2.5 text-violet-700">
              <Landmark className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{counts.finance}</p>
          <p className="mt-1 text-xs text-slate-400">Payments, expenses, & journals</p>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="surface flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="relative min-w-[260px] flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by doc #, party, description, preparer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          {["ALL", "Procurement", "Sales", "Inventory", "Finance"].map((d) => (
            <button
              key={d}
              onClick={() => setDomainFilter(d)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                domainFilter === d
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {d === "ALL" ? "All Domains" : d}
            </button>
          ))}
        </div>
      </div>

      {/* Approvals Table */}
      <div className="surface overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-xs text-slate-400">Loading pending approval queue...</div>
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="All clear! No pending approvals"
            description="There are currently no documents waiting for your authorization in this domain."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <tr>
                  <th className="py-3.5 pl-6 pr-3">Type & Doc #</th>
                  <th className="px-3 py-3.5">Date</th>
                  <th className="px-3 py-3.5">Branch / Scope</th>
                  <th className="px-3 py-3.5">Counterparty & Summary</th>
                  <th className="px-3 py-3.5">Prepared By</th>
                  <th className="px-3 py-3.5 text-right">Value / Amount</th>
                  <th className="py-3.5 pl-3 pr-6 text-right">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => {
                  const isPreparer = item.preparer.id === currentUserId;

                  return (
                    <tr key={`${item.documentType}-${item.id}`} className="hover:bg-slate-50/70">
                      <td className="py-3.5 pl-6 pr-3">
                        <div className="flex items-center gap-2">
                          <Badge
                            tone={
                              item.domain === "Procurement"
                                ? "blue"
                                : item.domain === "Sales"
                                ? "green"
                                : item.domain === "Inventory"
                                ? "amber"
                                : "purple"
                            }
                          >
                            {item.documentType.replace("_", " ")}
                          </Badge>
                        </div>
                        <Link
                          href={item.viewUrl}
                          className="mt-1 block font-mono font-bold text-blue-700 hover:underline"
                        >
                          {item.documentNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-3.5 text-slate-600">
                        {formatDate(item.documentDate)}
                      </td>
                      <td className="px-3 py-3.5 font-medium text-slate-800">
                        {item.branch}
                      </td>
                      <td className="max-w-xs px-3 py-3.5">
                        <p className="truncate font-semibold text-slate-900">{item.counterparty}</p>
                        <p className="truncate text-[11px] text-slate-500">{item.summary}</p>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="font-medium text-slate-800">{item.preparer.fullName}</span>
                        {isPreparer && (
                          <span className="block text-[10px] font-semibold text-amber-600">
                            (Self-Prepared)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-right font-bold text-slate-900">
                        {Number(item.amount) > 0 ? formatMoney(item.amount, currencyCode) : "—"}
                      </td>
                      <td className="py-3.5 pl-3 pr-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={item.viewUrl}>
                            <Button size="sm" variant="outline">
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </Link>

                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => {
                              setSelectedItem(item);
                              setConfirmAction("approve");
                            }}
                          >
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Approve
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            className="text-rose-600 hover:bg-rose-50"
                            onClick={() => {
                              setSelectedItem(item);
                              setConfirmAction("reject");
                            }}
                          >
                            <XCircle className="mr-1 h-3 w-3" />
                            Reject
                          </Button>
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

      {/* Confirmation Modal */}
      {selectedItem && confirmAction && (
        <Modal
          open={Boolean(selectedItem && confirmAction)}
          onClose={() => {
            setSelectedItem(null);
            setConfirmAction(null);
            setRejectReason("");
          }}
          title={
            confirmAction === "approve"
              ? `Confirm Approval: ${selectedItem.documentNumber}`
              : `Confirm Rejection: ${selectedItem.documentNumber}`
          }
          description={
            confirmAction === "approve"
              ? `You are about to authorize this ${selectedItem.documentType.replace("_", " ").toLowerCase()}. The system will verify maker-checker policy according to the operating mode.`
              : `You are about to reject this ${selectedItem.documentType.replace("_", " ").toLowerCase()}. It will be returned to the preparer.`
          }
        >
          <div className="space-y-4 pt-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Document Type:</span>
                <span className="font-semibold text-slate-900">{selectedItem.documentType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Document #:</span>
                <span className="font-mono font-bold text-blue-700">{selectedItem.documentNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Counterparty:</span>
                <span className="font-semibold text-slate-900">{selectedItem.counterparty}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Prepared By:</span>
                <span className="font-medium text-slate-800">{selectedItem.preparer.fullName}</span>
              </div>
              {Number(selectedItem.amount) > 0 && (
                <div className="flex justify-between border-t border-slate-200/60 pt-2">
                  <span className="font-semibold text-slate-700">Total Value:</span>
                  <span className="font-bold text-slate-900">
                    {formatMoney(selectedItem.amount, currencyCode)}
                  </span>
                </div>
              )}
            </div>

            {confirmAction === "reject" && (
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Reason for Rejection (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="State why this document was rejected..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                variant="outline"
                disabled={submitting}
                onClick={() => {
                  setSelectedItem(null);
                  setConfirmAction(null);
                }}
              >
                Cancel
              </Button>
              <Button
                className={confirmAction === "approve" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-rose-600 hover:bg-rose-700 text-white"}
                disabled={submitting}
                onClick={handleAction}
              >
                {confirmAction === "approve" ? "Confirm & Approve" : "Confirm Rejection"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
