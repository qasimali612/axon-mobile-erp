"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, ShieldCheck, User, Users, CheckCircle2, AlertTriangle, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

const field = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const DOCUMENT_TYPES = ["PURCHASE_ORDER", "PURCHASE_RECEIPT", "SALES_INVOICE", "PAYMENT", "JOURNAL", "INVENTORY_ADJUSTMENT"];
const labels: Record<string, string> = { PURCHASE_ORDER: "Purchase order", PURCHASE_RECEIPT: "Goods receipt", SALES_INVOICE: "Sales invoice", PAYMENT: "Payment", JOURNAL: "Journal voucher", INVENTORY_ADJUSTMENT: "Stock adjustment" };

type OperatingModeConfig = {
  mode: "SINGLE_USER" | "MULTI_USER";
  description: string;
  updatedAt: string;
  configuredBy: string;
  reason?: string | null;
  canManage?: boolean;
};

export function PolicyWorkspace({ canManage }: { canManage: boolean }) {
  const [policies, setPolicies] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<Array<{ key: string; description: string }>>([]);
  const [discount, setDiscount] = useState({ maxPercent: 100, overridePermission: "sales.discount.override" });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ documentType: "SALES_INVOICE", name: "", minAmount: "0", maxAmount: "", requiredPermission: "SALES_INVOICE_APPROVE", notes: "" });

  const [modeConfig, setModeConfig] = useState<OperatingModeConfig | null>(null);
  const [modeModalOpen, setModeModalOpen] = useState(false);
  const [targetMode, setTargetMode] = useState<"SINGLE_USER" | "MULTI_USER">("SINGLE_USER");
  const [modeReason, setModeReason] = useState("");
  const [savingMode, setSavingMode] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [policyRes, modeRes] = await Promise.all([
      fetch("/api/settings/policies?catalog=true", { cache: "no-store" }),
      fetch("/api/settings/operating-mode", { cache: "no-store" }),
    ]);

    const body = await policyRes.json().catch(() => null);
    const modeBody = await modeRes.json().catch(() => null);
    setLoading(false);

    if (!policyRes.ok) return toast.error(body?.error?.message || "Policies could not be loaded.");
    setPolicies(body.data?.policies || []);
    setCatalog(body.data?.catalog || []);
    setDiscount({ maxPercent: Number(body.data?.discountPolicy?.maxPercent ?? 100), overridePermission: body.data?.discountPolicy?.overridePermission || "sales.discount.override" });

    if (modeBody?.data) {
      setModeConfig(modeBody.data);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function handleSwitchMode(e: FormEvent) {
    e.preventDefault();
    if (modeReason.trim().length < 5) {
      toast.error("Please provide a reason of at least 5 characters.");
      return;
    }
    setSavingMode(true);
    const res = await fetch("/api/settings/operating-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: targetMode, reason: modeReason.trim() }),
    });
    setSavingMode(false);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(body?.error?.message || "Failed to update operating mode.");
      return;
    }
    toast.success(`Operating mode updated to ${targetMode === "SINGLE_USER" ? "Single-User Mode" : "Multi-User Mode"}`);
    setModeModalOpen(false);
    setModeReason("");
    await load();
  }

  async function createPolicy(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch("/api/settings/policies", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentType: form.documentType, name: form.name, minAmount: form.minAmount, maxAmount: form.maxAmount || null, requiredPermission: form.requiredPermission, notes: form.notes || null, isActive: true }),
    });
    setSaving(false);
    const body = await response.json().catch(() => null);
    if (!response.ok) return toast.error(body?.error?.message || "The policy could not be saved.");
    toast.success("Approval policy saved");
    setOpen(false);
    setForm((current) => ({ ...current, name: "", minAmount: "0", maxAmount: "", notes: "" }));
    await load();
  }

  async function toggle(policy: any) {
    const response = await fetch(`/api/settings/policies/${policy.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !policy.isActive }) });
    if (!response.ok) return toast.error("The policy could not be updated.");
    await load();
  }

  async function saveDiscount(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch("/api/settings/policies", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(discount) });
    setSaving(false);
    const body = await response.json().catch(() => null);
    if (!response.ok) return toast.error(body?.error?.message || "The discount policy could not be saved.");
    toast.success("Discount cap updated");
    await load();
  }

  return (
    <>
      <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2"><span className="kicker">Commercial controls</span><Badge tone="green">Audited</Badge></div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-[30px]">Approval, discount and credit policies</h1>
          <p className="mt-1.5 text-sm text-slate-500">Configure business operating mode, approval amount bands, and discount overrides. All mode switches and approvals are recorded in the immutable audit log.</p>
        </div>
        {canManage ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New band</Button> : null}
      </header>

      {/* OPERATING MODE CARD */}
      <section className="surface mb-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${modeConfig?.mode === "SINGLE_USER" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
              {modeConfig?.mode === "SINGLE_USER" ? <User className="h-6 w-6" /> : <Users className="h-6 w-6" />}
            </span>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-bold text-slate-900">ERP System Operating Mode</h2>
                <Badge tone={modeConfig?.mode === "SINGLE_USER" ? "amber" : "blue"}>
                  {modeConfig?.mode === "SINGLE_USER" ? "Single-User Mode" : "Multi-User Mode"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500 max-w-2xl leading-relaxed">
                {modeConfig?.description || "Loading operating mode configuration..."}
              </p>
              {modeConfig?.updatedAt ? (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                  <span>Last configured by <strong className="text-slate-600 font-medium">{modeConfig.configuredBy}</strong></span>
                  <span>•</span>
                  <span>{new Date(modeConfig.updatedAt).toLocaleString()}</span>
                  {modeConfig.reason ? (
                    <>
                      <span>•</span>
                      <span>Reason: <em className="text-slate-600">&ldquo;{modeConfig.reason}&rdquo;</em></span>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          {canManage ? (
            <Button
              variant="outline"
              className="shrink-0 self-start sm:self-auto gap-2"
              onClick={() => {
                setTargetMode(modeConfig?.mode === "SINGLE_USER" ? "MULTI_USER" : "SINGLE_USER");
                setModeReason("");
                setModeModalOpen(true);
              }}
            >
              <ArrowRightLeft className="h-4 w-4" />
              Switch Operating Mode
            </Button>
          ) : null}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 pt-4 border-t border-slate-100 sm:grid-cols-2">
          <div className={`rounded-xl border p-4 transition-all ${modeConfig?.mode === "SINGLE_USER" ? "border-amber-300 bg-amber-50/50" : "border-slate-200 bg-slate-50/40 opacity-75"}`}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-bold text-amber-900">
                <User className="h-4 w-4 text-amber-600" />
                Single-User Mode (Sole Operator)
              </span>
              {modeConfig?.mode === "SINGLE_USER" ? (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Active
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              Designed for individual proprietors and single operators. Bypasses maker-checker and posting separation so a sole owner can create, inspect, approve, and post sales, purchases, payments, and stock adjustments directly without friction.
            </p>
          </div>

          <div className={`rounded-xl border p-4 transition-all ${modeConfig?.mode === "MULTI_USER" ? "border-blue-300 bg-blue-50/50" : "border-slate-200 bg-slate-50/40 opacity-75"}`}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-bold text-blue-900">
                <Users className="h-4 w-4 text-blue-600" />
                Multi-User Mode (Enterprise Governance)
              </span>
              {modeConfig?.mode === "MULTI_USER" ? (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Active
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              Designed for multi-branch, multi-warehouse enterprises. Enforces strict segregation of duties: transaction preparers cannot approve their own documents, and posting officers must differ from makers and checkers.
            </p>
          </div>
        </div>
      </section>

      <section className="surface mb-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3"><h2 className="text-sm font-bold text-slate-800">Amount bands</h2><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{policies.length} configured</span></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left">
            <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3">Document</th><th className="px-4 py-3">Name</th><th className="px-4 py-3 text-right">From</th><th className="px-4 py-3 text-right">To</th><th className="px-4 py-3">Requires</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={7} className="p-12 text-center text-xs text-slate-400">Loading policies…</td></tr>
                : policies.length === 0 ? <tr><td colSpan={7} className="p-12 text-center text-xs text-slate-400">No bands configured. Every approval behaves exactly as before until you add one.</td></tr>
                  : policies.map((policy) => (
                    <tr key={policy.id} className="text-xs">
                      <td className="px-5 py-3.5 font-semibold text-slate-700">{labels[policy.documentType] || policy.documentType}</td>
                      <td className="px-4 py-3.5">{policy.name}</td>
                      <td className="px-4 py-3.5 text-right font-mono">{Number(policy.minAmount).toFixed(2)}</td>
                      <td className="px-4 py-3.5 text-right font-mono">{policy.maxAmount === null ? "∞" : Number(policy.maxAmount).toFixed(2)}</td>
                      <td className="px-4 py-3.5 font-mono text-[10px]">{policy.requiredPermission}</td>
                      <td className="px-4 py-3.5"><Badge tone={policy.isActive ? "green" : "slate"}>{policy.isActive ? "Active" : "Inactive"}</Badge></td>
                      <td className="px-5 py-3.5 text-right">{canManage ? <Button variant="outline" size="sm" onClick={() => void toggle(policy)}>{policy.isActive ? "Disable" : "Enable"}</Button> : null}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface p-5">
        <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-forest-50 text-forest-700"><ShieldCheck className="h-4 w-4" /></span><div><h2 className="text-sm font-bold text-slate-800">Sales discount cap</h2><p className="text-[10px] text-slate-400">Applies when an invoice is submitted</p></div></div>
        <form onSubmit={saveDiscount} className="mt-5 grid gap-4 sm:grid-cols-3">
          <label><span className="label">Maximum discount %</span><input className={field} type="number" min="0" max="100" step="0.01" value={discount.maxPercent} disabled={!canManage} onChange={(event) => setDiscount((current) => ({ ...current, maxPercent: Number(event.target.value) }))} /></label>
          <label><span className="label">Override permission</span><select className={field} value={discount.overridePermission} disabled={!canManage} onChange={(event) => setDiscount((current) => ({ ...current, overridePermission: event.target.value }))}>{["sales.discount.override", ...catalog.map((item) => item.key)].filter((value, index, all) => all.indexOf(value) === index).map((key) => <option key={key} value={key}>{key}</option>)}</select></label>
          <div className="flex items-end">{canManage ? <Button type="submit" loading={saving}>Save cap</Button> : <span className="text-[11px] text-slate-400">Read-only — you lack policy.manage.</span>}</div>
        </form>
        <p className="mt-4 text-[10px] leading-5 text-slate-400">Credit-limit exceptions additionally require the <span className="font-mono">customer.credit.override</span> grant and a reason of at least ten characters, recorded as CREDIT_LIMIT_OVERRIDDEN against the invoice.</p>
      </section>

      <Modal open={open} onClose={() => setOpen(false)} title="New approval band" description="When a document total falls inside this band, the approver must also hold the selected permission.">
        <form onSubmit={createPolicy} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label><span className="label">Document type</span><select className={field} value={form.documentType} onChange={(event) => setForm((current) => ({ ...current, documentType: event.target.value }))}>{DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{labels[type]}</option>)}</select></label>
            <label><span className="label">Band name</span><input className={field} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></label>
            <label><span className="label">From amount</span><input className={field} inputMode="decimal" value={form.minAmount} onChange={(event) => setForm((current) => ({ ...current, minAmount: event.target.value }))} /></label>
            <label><span className="label">To amount (blank = no limit)</span><input className={field} inputMode="decimal" value={form.maxAmount} onChange={(event) => setForm((current) => ({ ...current, maxAmount: event.target.value }))} /></label>
            <label className="sm:col-span-2"><span className="label">Additional permission required</span><select className={field} value={form.requiredPermission} onChange={(event) => setForm((current) => ({ ...current, requiredPermission: event.target.value }))}>{catalog.map((item) => <option key={item.key} value={item.key}>{item.key} — {item.description}</option>)}</select></label>
            <label className="sm:col-span-2"><span className="label">Notes</span><input className={field} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
          </div>
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={saving}>Save band</Button></div>
        </form>
      </Modal>

      <Modal
        open={modeModalOpen}
        onClose={() => setModeModalOpen(false)}
        title="Confirm Operating Mode Change"
        description="Switching operating modes changes approval and posting constraints for all future transactions. All existing inventory, financial ledgers, and transactions remain 100% preserved."
      >
        <form onSubmit={handleSwitchMode} className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Requested Mode</div>
            <div className="mt-1 flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ${targetMode === "SINGLE_USER" ? "bg-amber-100 text-amber-900" : "bg-blue-100 text-blue-900"}`}>
                {targetMode === "SINGLE_USER" ? <User className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                {targetMode === "SINGLE_USER" ? "Single-User Mode" : "Multi-User Mode"}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              {targetMode === "SINGLE_USER"
                ? "In Single-User Mode, sole operators can create, approve, and post their own orders, invoices, and payments directly without requiring secondary approvals."
                : "In Multi-User Mode, strict maker-checker segregation of duties is enforced across procurement, sales, finance, and stock adjustments."}
            </p>
          </div>

          <label className="block">
            <span className="label">Change Documentation / Reason *</span>
            <textarea
              className="w-full rounded-lg border border-slate-200 bg-white p-3 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              rows={3}
              placeholder="Provide a reason for changing the operating mode (minimum 5 characters)..."
              value={modeReason}
              onChange={(e) => setModeReason(e.target.value)}
              required
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModeModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={savingMode}>
              Confirm Mode Switch
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
