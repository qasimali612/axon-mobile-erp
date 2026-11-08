"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Printer, RotateCcw, Send, Stamp, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function JournalActions({
  id,
  status,
  permissions,
}: {
  id: string;
  status: string;
  permissions: string[];
}) {
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  const [reversalOpen, setReversalOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [postingDate, setPostingDate] = useState(new Date().toISOString().slice(0, 10));

  async function action(name: "submit" | "approve" | "post", label: string) {
    setWorking(name);
    const response = await fetch(`/api/finance/journals/${id}/${name}`, { method: "POST" });
    const body = await response.json().catch(() => null);
    setWorking(null);
    if (!response.ok) {
      toast.error(body?.error?.message || `${label} failed.`);
      return;
    }
    toast.success(label);
    router.refresh();
  }

  async function fastTrackPost() {
    setWorking("fast-post");
    try {
      if (status === "DRAFT") {
        const subRes = await fetch(`/api/finance/journals/${id}/submit`, { method: "POST" });
        if (!subRes.ok) {
          const body = await subRes.json().catch(() => null);
          throw new Error(body?.error?.message || "Submit failed.");
        }
      }
      const appRes = await fetch(`/api/finance/journals/${id}/approve`, { method: "POST" });
      if (!appRes.ok) {
        const body = await appRes.json().catch(() => null);
        throw new Error(body?.error?.message || "Approval failed.");
      }
      const postRes = await fetch(`/api/finance/journals/${id}/post`, { method: "POST" });
      if (!postRes.ok) {
        const body = await postRes.json().catch(() => null);
        throw new Error(body?.error?.message || "Posting failed.");
      }
      toast.success("⚡ Journal voucher posted to General Ledger!");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to complete voucher posting.");
    } finally {
      setWorking(null);
    }
  }

  async function reverse(event: React.FormEvent) {
    event.preventDefault();
    setWorking("reverse");
    const response = await fetch(`/api/finance/journals/${id}/reverse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postingDate, reason, idempotencyKey: crypto.randomUUID() }),
    });
    const body = await response.json().catch(() => null);
    setWorking(null);
    if (!response.ok) {
      toast.error(body?.error?.message || "Reversal failed.");
      return;
    }
    toast.success(`Reversal ${body.data.voucherNumber} posted`);
    setReversalOpen(false);
    router.push(`/finance/journals/${body.data.id}`);
    router.refresh();
  }

  const canApprove = permissions.includes("JOURNAL_APPROVE");
  const canPost = permissions.includes("JOURNAL_POST");

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <a href={`/finance/journals/${id}/print`} target="_blank" rel="noreferrer">
          <Button variant="outline">
            <Printer className="h-4 w-4" />
            Print Voucher
          </Button>
        </a>

        {/* Fast-Track Post for single-user / counter mode */}
        {(status === "DRAFT" || status === "SUBMITTED") && canApprove && canPost ? (
          <Button
            disabled={Boolean(working)}
            onClick={fastTrackPost}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
          >
            <Zap className="h-4 w-4" />
            {working === "fast-post" ? "Posting…" : "⚡ Direct Post"}
          </Button>
        ) : null}

        {status === "DRAFT" && permissions.includes("JOURNAL_CREATE") ? (
          <Button
            variant="outline"
            disabled={Boolean(working)}
            onClick={() => action("submit", "Journal submitted for approval")}
          >
            <Send className="h-4 w-4" />
            {working === "submit" ? "Submitting…" : "Submit"}
          </Button>
        ) : null}

        {status === "SUBMITTED" && canApprove ? (
          <Button
            disabled={Boolean(working)}
            onClick={() => action("approve", "Journal approved")}
          >
            <CheckCheck className="h-4 w-4" />
            {working === "approve" ? "Approving…" : "Approve"}
          </Button>
        ) : null}

        {status === "APPROVED" && canPost ? (
          <Button
            disabled={Boolean(working)}
            onClick={() => action("post", "Journal posted to the general ledger")}
          >
            <Stamp className="h-4 w-4" />
            {working === "post" ? "Posting…" : "Post"}
          </Button>
        ) : null}

        {status === "POSTED" && permissions.includes("JOURNAL_REVERSE") ? (
          <Button
            variant="outline"
            disabled={Boolean(working)}
            onClick={() => setReversalOpen(true)}
          >
            <RotateCcw className="h-4 w-4" />
            Reverse Voucher
          </Button>
        ) : null}
      </div>

      {reversalOpen ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <form onSubmit={reverse} className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Post Journal Reversal</h2>
                <p className="mt-1 text-[11px] leading-4 text-slate-400">
                  The original voucher remains immutable. A new linked opposite entry will be posted.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReversalOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <label className="field-label">
                Reversal Posting Date *
                <input
                  required
                  type="date"
                  value={postingDate}
                  onChange={(event) => setPostingDate(event.target.value)}
                  className="field-input"
                />
              </label>
              <label className="field-label">
                Reason for Reversal *
                <textarea
                  required
                  minLength={10}
                  maxLength={1000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="field-input min-h-24 py-2"
                  placeholder="Document why this journal reversal is necessary for auditing"
                />
              </label>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">
                Posting is blocked if the accounting period is locked or closed.
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <Button type="button" variant="outline" onClick={() => setReversalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={working === "reverse" || reason.trim().length < 10}
              >
                {working === "reverse" ? "Posting…" : "Post Reversal"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
