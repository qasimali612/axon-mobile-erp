"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  Loader2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Props = {
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    grandTotal: string | number;
    currencyCode: string;
    preparedById: string;
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

export function SalesInvoiceWorkflowActions({ invoice, permissions }: Props) {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const can = (key: string) => permissions.includes(key);

  async function directPost() {
    setActing(true);
    try {
      const postRes = await fetch(`/api/sales/invoices/${invoice.id}/post`, { method: "POST" });
      const body = await postRes.json().catch(() => null);
      if (!postRes.ok) {
        return toast.error(body?.error?.message || "Failed to post sales invoice.");
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

        {/* Cancel unposted document action */}
        {["DRAFT", "SUBMITTED", "APPROVED"].includes(invoice.status) && (
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
    </>
  );
}
