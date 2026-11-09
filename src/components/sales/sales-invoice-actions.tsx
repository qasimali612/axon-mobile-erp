"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  CheckCircle2,
  FileCheck2,
  Loader2,
  PackageCheck,
  Send,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";

type Props = {
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    grandTotal: string | number;
    currencyCode: string;
    preparedById: string;
    approvedById: string | null;
    customer: {
      id: string;
      code: string;
      name: string;
      creditLimit?: string | number;
    };
  };
  userId: string;
  permissions: string[];
};

export function SalesInvoiceWorkflowActions({ invoice, userId, permissions }: Props) {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [creditOverrideTarget, setCreditOverrideTarget] = useState<any>(null);
  const [creditOverrideReason, setCreditOverrideReason] = useState("");
  const [segregationAlert, setSegregationAlert] = useState<{ message: string } | null>(null);
  const [switchingMode, setSwitchingMode] = useState(false);

  const can = (key: string) => permissions.includes(key);

  function isSegregationError(message: string): boolean {
    const m = (message || "").toLowerCase();
    return (
      m.includes("segregation of duties") ||
      m.includes("multi-user mode") ||
      m.includes("separate authorized officer") ||
      m.includes("maker_checker") ||
      m.includes("cannot approve their own") ||
      m.includes("cannot post their own")
    );
  }

  async function resolveSegregationWithSingleUser() {
    setSwitchingMode(true);
    try {
      const res = await fetch("/api/settings/operating-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "SINGLE_USER",
          reason: "Switched to Single-User Mode to allow sole owner direct invoice approval and posting",
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message || "Failed to switch to Single-User Mode.");
      setSegregationAlert(null);
      toast.success("⚡ Single-User Mode activated! Posting sales invoice now...");
      await directPost();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to switch operating mode.");
    } finally {
      setSwitchingMode(false);
    }
  }

  async function executeAction(action: string, overrideReason?: string) {
    if (
      action === "post" &&
      !window.confirm(
        `Post ${invoice.invoiceNumber}? Stock, physical custody, actual COGS, receivable, and general ledger journal will be committed atomically.`
      )
    ) {
      return;
    }

    setActing(true);
    try {
      const response = await fetch(`/api/sales/invoices/${invoice.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrideReason ? { reason: overrideReason } : {}),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (body?.error?.code === "CREDIT_LIMIT_EXCEEDED") {
          setCreditOverrideTarget({ details: body.error.details });
          setCreditOverrideReason(`Authorized credit extension for invoice ${invoice.invoiceNumber}`);
          return;
        }
        const msg = body?.error?.message || `${action} failed.`;
        if (isSegregationError(msg)) {
          setSegregationAlert({ message: msg });
          return;
        }
        return toast.error(msg);
      }
      toast.success(
        `${invoice.invoiceNumber} ${
          action === "submit" ? "submitted" : action === "approve" ? "approved" : "posted to stock & GL"
        }!`
      );
      router.refresh();
    } catch {
      toast.error(`Network error while trying to ${action} invoice.`);
    } finally {
      setActing(false);
    }
  }

  async function directPost() {
    setActing(true);
    try {
      if (invoice.status === "DRAFT") {
        const subRes = await fetch(`/api/sales/invoices/${invoice.id}/submit`, { method: "POST" });
        if (!subRes.ok) {
          const body = await subRes.json().catch(() => null);
          const msg = body?.error?.message || "Failed to submit sales invoice.";
          if (isSegregationError(msg)) {
            setSegregationAlert({ message: msg });
            return;
          }
          return toast.error(msg);
        }
        const appRes = await fetch(`/api/sales/invoices/${invoice.id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Direct Post authorization" }),
        });
        if (!appRes.ok) {
          const body = await appRes.json().catch(() => null);
          if (body?.error?.code === "CREDIT_LIMIT_EXCEEDED") {
            setCreditOverrideTarget({ details: body.error.details, andPost: true });
            setCreditOverrideReason(`Authorized credit extension for invoice ${invoice.invoiceNumber}`);
            return;
          }
          const msg = body?.error?.message || "Failed to approve sales invoice.";
          if (isSegregationError(msg)) {
            setSegregationAlert({ message: msg });
            return;
          }
          return toast.error(msg);
        }
      } else if (invoice.status === "SUBMITTED") {
        const appRes = await fetch(`/api/sales/invoices/${invoice.id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Direct Post authorization" }),
        });
        if (!appRes.ok) {
          const body = await appRes.json().catch(() => null);
          if (body?.error?.code === "CREDIT_LIMIT_EXCEEDED") {
            setCreditOverrideTarget({ details: body.error.details, andPost: true });
            setCreditOverrideReason(`Authorized credit extension for invoice ${invoice.invoiceNumber}`);
            return;
          }
          const msg = body?.error?.message || "Failed to approve sales invoice.";
          if (isSegregationError(msg)) {
            setSegregationAlert({ message: msg });
            return;
          }
          return toast.error(msg);
        }
      }

      const postRes = await fetch(`/api/sales/invoices/${invoice.id}/post`, { method: "POST" });
      const body = await postRes.json().catch(() => null);
      if (!postRes.ok) {
        const msg = body?.error?.message || "Failed to post sales invoice.";
        if (isSegregationError(msg)) {
          setSegregationAlert({ message: msg });
          return;
        }
        return toast.error(msg);
      }

      toast.success(`${invoice.invoiceNumber} posted to stock & GL atomically!`, {
        action: {
          label: "Print Invoice",
          onClick: () => window.open(`/sales/${invoice.id}/print`, "_blank"),
        },
        duration: 8000,
      });
      router.refresh();
    } catch {
      toast.error("Network error posting sales invoice.");
    } finally {
      setActing(false);
    }
  }

  async function cancelDraft() {
    if (cancelReason.trim().length < 10) return;
    setActing(true);
    try {
      const response = await fetch(`/api/sales/invoices/${invoice.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) return toast.error(body?.error?.message || "Draft cancellation failed.");
      toast.success(`${invoice.invoiceNumber} cancelled without stock effect.`);
      setCancelOpen(false);
      setCancelReason("");
      router.refresh();
    } catch {
      toast.error("Network error cancelling draft.");
    } finally {
      setActing(false);
    }
  }

  // If already posted, reversed, or cancelled, no workflow actions needed here
  if (["POSTED", "REVERSED", "CANCELLED", "REJECTED"].includes(invoice.status)) {
    return null;
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {/* Fast-Track Direct Post */}
        {can("SALES_INVOICE_POST") && (
          <Button
            type="button"
            disabled={acting}
            onClick={() => void directPost()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 shadow-sm"
          >
            {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            ⚡ Post Now to Stock &amp; GL
          </Button>
        )}

        {/* Workflow actions */}
        {invoice.status === "DRAFT" && (
          <>
            <Button
              type="button"
              disabled={acting}
              variant="outline"
              onClick={() => void executeAction("submit")}
              className="gap-1.5 font-semibold"
            >
              <Send className="h-4 w-4 text-blue-600" />
              Submit for Approval
            </Button>
            <Button
              type="button"
              disabled={acting}
              variant="outline"
              onClick={() => setCancelOpen(true)}
              className="gap-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700 border-rose-200"
            >
              <Ban className="h-4 w-4" />
              Cancel Draft
            </Button>
          </>
        )}

        {invoice.status === "SUBMITTED" && can("SALES_INVOICE_APPROVE") && (
          <Button
            type="button"
            disabled={acting}
            variant="outline"
            onClick={() => void executeAction("approve")}
            className="gap-1.5 font-semibold text-blue-700 border-blue-300 hover:bg-blue-50"
          >
            <BadgeCheck className="h-4 w-4 text-blue-600" />
            Approve Invoice
          </Button>
        )}

        {invoice.status === "APPROVED" && can("SALES_INVOICE_POST") && (
          <Button
            type="button"
            disabled={acting}
            onClick={() => void executeAction("post")}
            className="gap-1.5 font-bold bg-blue-600 hover:bg-blue-700 text-white"
          >
            <PackageCheck className="h-4 w-4" />
            Post Stock &amp; GL
          </Button>
        )}
      </div>

      {/* CANCELLATION MODAL */}
      {cancelOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-xs"
          onMouseDown={(e) => e.target === e.currentTarget && !acting && setCancelOpen(false)}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl animate-scale-up">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-950">Cancel Sales Draft</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {invoice.invoiceNumber} · Cancels draft without stock or GL effects.
                </p>
              </div>
              <button
                disabled={acting}
                onClick={() => setCancelOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="mt-5 block">
              <span className="text-xs font-bold text-slate-700">Cancellation reason *</span>
              <textarea
                autoFocus
                rows={4}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Enter specific business reason (minimum 10 characters)…"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button disabled={acting} variant="outline" onClick={() => setCancelOpen(false)}>
                Keep draft
              </Button>
              <Button
                disabled={acting || cancelReason.trim().length < 10}
                onClick={() => void cancelDraft()}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
              >
                {acting ? "Cancelling…" : "Confirm cancellation"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CREDIT LIMIT OVERRIDE MODAL */}
      {creditOverrideTarget && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-xs"
          onMouseDown={(e) => e.target === e.currentTarget && !acting && setCreditOverrideTarget(null)}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl animate-scale-up">
            <div className="flex items-start justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  Credit Limit Authorization Required
                </div>
                <h2 className="mt-2 text-lg font-black text-slate-950">Approve with Credit Override</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {invoice.invoiceNumber} · Customer: <b className="text-slate-800">{invoice.customer.name}</b> ({invoice.customer.code})
                </p>
              </div>
              <button
                disabled={acting}
                onClick={() => setCreditOverrideTarget(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <div>
                <span className="text-slate-500">Configured Credit Limit:</span>
                <div className="font-bold text-slate-900">
                  {formatMoney(creditOverrideTarget.details?.creditLimit || invoice.customer.creditLimit || 0, invoice.currencyCode)}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Current AR Outstanding:</span>
                <div className="font-bold text-slate-900">
                  {formatMoney(creditOverrideTarget.details?.outstanding || 0, invoice.currencyCode)}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Invoice Grand Total:</span>
                <div className="font-bold text-blue-700">
                  {formatMoney(creditOverrideTarget.details?.invoiceTotal || invoice.grandTotal, invoice.currencyCode)}
                </div>
              </div>
              <div>
                <span className="font-semibold text-amber-800">Exceeded Amount:</span>
                <div className="font-black text-rose-600">
                  {formatMoney(creditOverrideTarget.details?.exceededAmount || 0, invoice.currencyCode)}
                </div>
              </div>
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-bold text-slate-700">Managerial Override Justification / Reason *</span>
              <textarea
                autoFocus
                rows={3}
                value={creditOverrideReason}
                onChange={(e) => setCreditOverrideReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="e.g. Director authorized 15-day extension; PDC cheque received; VIP dealer account."
              />
            </label>
            <p className="mt-1.5 text-[11px] text-slate-400">
              This justification will be permanently stamped in the company financial audit trail alongside your user ID.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <Button disabled={acting} variant="outline" onClick={() => setCreditOverrideTarget(null)}>
                Cancel
              </Button>
              <Button
                disabled={acting || creditOverrideReason.trim().length < 5}
                onClick={async () => {
                  const reason = creditOverrideReason;
                  const andPost = creditOverrideTarget.andPost;
                  setCreditOverrideTarget(null);
                  if (andPost) {
                    await directPost();
                  } else {
                    await executeAction("approve", reason);
                  }
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold gap-1.5"
              >
                <BadgeCheck className="h-4 w-4" />
                {acting ? "Authorizing…" : "Authorize & Approve Credit"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SEGREGATION OF DUTIES QUICK RESOLUTION MODAL */}
      {segregationAlert && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget && !switchingMode) setSegregationAlert(null);
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 animate-scale-up">
            <div className="flex items-start gap-3.5 border-b border-amber-100 bg-amber-50/80 px-6 py-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-950">Segregation of Duties Enforcement</h3>
                <p className="mt-0.5 text-xs text-amber-900 font-medium">Multi-User Maker-Checker Restriction</p>
              </div>
              <button
                type="button"
                disabled={switchingMode}
                onClick={() => setSegregationAlert(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3.5 p-6 text-xs text-slate-600 leading-relaxed">
              <p>
                ERP governance policy requires that in <strong>Multi-User Mode</strong>, a separate authorized officer must approve or post sales invoice <strong>{invoice.invoiceNumber}</strong>.
              </p>

              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 text-slate-700">
                <span className="font-bold text-amber-900 block mb-1">⚡ Operating as Sole Business Owner or Store Manager?</span>
                You can switch to <strong>Single-User Mode</strong> with 1 click. Single-User Mode enables direct approvals and immediate posting across all receipts, payments, and sales invoices without requiring a second officer.
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <Button
                type="button"
                variant="outline"
                disabled={switchingMode}
                onClick={() => setSegregationAlert(null)}
              >
                Keep Multi-User Mode
              </Button>
              <Button
                type="button"
                disabled={switchingMode}
                onClick={() => void resolveSegregationWithSingleUser()}
                className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5 shadow-sm font-bold"
              >
                {switchingMode ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Activating Single-User Mode...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Switch to Single-User Mode &amp; Post Now
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

