"use client";

import { useState } from "react";
import { CheckCircle2, DollarSign, Landmark, Loader2, Printer, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatMoney } from "@/lib/utils";

export function ReturnActions({
  returnId,
  returnNumber,
  returnType,
  status,
  grandTotal,
  currency,
  hasJournal,
}: {
  returnId: string;
  returnNumber: string;
  returnType: string;
  status: string;
  grandTotal: number;
  currency: string;
  hasJournal: boolean;
}) {
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundMethod, setRefundMethod] = useState<"CASH" | "BANK">("CASH");
  const [refundAmount, setRefundAmount] = useState(String(grandTotal));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [refundIssued, setRefundIssued] = useState(false);

  const isSalesReturn = returnType === "SALES_RETURN";
  const isPosted = status === "POSTED";

  async function handleIssueRefund() {
    const amt = parseFloat(refundAmount);
    if (isNaN(amt) || amt <= 0 || amt > grandTotal) {
      toast.error(`Please enter a valid refund amount between 1 and ${grandTotal}.`);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/returns/${returnId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refundMethod,
          amount: amt.toFixed(4),
          reference: reference.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Refund failed");

      toast.success(`Disbursement of ${formatMoney(amt, currency)} via ${refundMethod} posted!`);
      setRefundIssued(true);
      setShowRefundModal(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error processing refund");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {isPosted && !refundIssued && (
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9"
          onClick={() => setShowRefundModal(true)}
        >
          <Wallet className="mr-1.5 h-3.5 w-3.5" />
          {isSalesReturn ? "Issue Customer Refund" : "Record Supplier Refund"}
        </Button>
      )}

      {refundIssued && (
        <span className="flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Refund Disbursed
        </span>
      )}

      {showRefundModal && (
        <Modal
          open={showRefundModal}
          onClose={() => setShowRefundModal(false)}
          title={`Disburse ${isSalesReturn ? "Customer" : "Supplier"} Refund`}
          description={`Issue cash counter or bank payment for return ${returnNumber}. This automatically debits AR/AP and credits liquidity.`}
          size="md"
        >
          <div className="space-y-4 pt-2 text-xs">
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">Total Return Credit</span>
                <p className="font-mono font-bold text-slate-800 text-base">{formatMoney(grandTotal, currency)}</p>
              </div>
              <span className="text-[11px] text-slate-500">Max Refundable</span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700">Disbursement Method *</label>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => setRefundMethod("CASH")}
                  className={`flex-1 rounded-lg border p-2.5 flex items-center justify-center gap-2 font-bold transition ${
                    refundMethod === "CASH"
                      ? "border-emerald-600 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-500"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Wallet className="h-4 w-4 text-emerald-600" /> Cash on Hand (1000)
                </button>
                <button
                  type="button"
                  onClick={() => setRefundMethod("BANK")}
                  className={`flex-1 rounded-lg border p-2.5 flex items-center justify-center gap-2 font-bold transition ${
                    refundMethod === "BANK"
                      ? "border-blue-600 bg-blue-50 text-blue-900 ring-1 ring-blue-500"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Landmark className="h-4 w-4 text-blue-600" /> Bank Transfer (1010)
                </button>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700">Disbursed Amount (PKR) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={grandTotal}
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono font-bold text-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700">Reference / Cheque #</label>
              <input
                type="text"
                placeholder="e.g. Counter Cash Voucher or Online Ref #"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700">Remarks</label>
              <textarea
                rows={2}
                placeholder="Optional cashier refund notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800"
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <span className="text-[10px] text-slate-400">© 2026 Copyright Reserved · Qasim Ali</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setShowRefundModal(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button onClick={handleIssueRefund} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                  Confirm Disbursement
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

