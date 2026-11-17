"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Percent,
  Plus,
  RefreshCw,
  Sparkles,
  Tag,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatDate, formatMoney } from "@/lib/utils";

export function PromotionWorkspace({
  currency,
  userPermissions,
}: {
  currency: string;
  userPermissions: string[];
}) {
  const [promotions, setPromotions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  );
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");
  const [discountValue, setDiscountValue] = useState("");
  const [minInvoiceValue, setMinInvoiceValue] = useState("0");
  const [maxDiscountAmount, setMaxDiscountAmount] = useState("");
  const [notes, setNotes] = useState("");

  const canCreate = userPermissions.includes("catalog.pricelist.create");

  async function loadPromotions() {
    setLoading(true);
    try {
      const res = await fetch("/api/catalog/promotions");
      const json = await res.json();
      if (res.ok) setPromotions(json.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPromotions();
  }, []);

  async function handleCreatePromotion() {
    if (!name.trim() || !code.trim() || !discountValue) {
      toast.error("Please provide promotion name, code, and discount value.");
      return;
    }

    const val = parseFloat(discountValue);
    if (isNaN(val) || val <= 0) {
      toast.error("Please enter a valid positive discount amount or percentage.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/catalog/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          startDate,
          endDate,
          discountType,
          discountValue: val,
          minInvoiceValue: parseFloat(minInvoiceValue) || 0,
          maxDiscountAmount: maxDiscountAmount ? parseFloat(maxDiscountAmount) : null,
          notes: notes.trim() || null,
          isActive: true,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Failed to create promotion");

      toast.success(`Promotion ${code.toUpperCase()} created successfully!`);
      setShowModal(false);
      resetForm();
      loadPromotions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error creating promotion");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setName("");
    setCode("");
    setDiscountValue("");
    setMinInvoiceValue("0");
    setMaxDiscountAmount("");
    setNotes("");
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="kicker">Retail Commercial Strategy</span>
            <Badge tone="purple">Automated POS Engine</Badge>
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Promotions & Discount Campaigns
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Configure percentage & fixed seasonal discounts, minimum invoice thresholds, and promotional price lists.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canCreate && (
            <Button onClick={() => setShowModal(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Promotion
            </Button>
          )}
        </div>
      </div>

      {/* Grid of Active Promotions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full py-16 text-center text-xs text-slate-400">Loading promotion campaigns...</div>
        ) : promotions.length === 0 ? (
          <div className="col-span-full surface p-12 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-xs font-bold text-slate-700">No active promotions configured</p>
            <p className="text-[11px] text-slate-400">Click &ldquo;New Promotion&rdquo; to launch a discount campaign.</p>
          </div>
        ) : (
          promotions.map((p) => {
            const todayStr = new Date().toISOString().slice(0, 10);
            const isOngoing =
              p.isActive &&
              (!p.effectiveFrom || p.effectiveFrom.slice(0, 10) <= todayStr) &&
              (!p.effectiveTo || p.effectiveTo.slice(0, 10) >= todayStr);

            return (
              <div key={p.id} className="surface p-5 hover:border-slate-300 transition space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                      {p.code}
                    </span>
                    <h3 className="text-base font-bold text-slate-900 mt-1">{p.name}</h3>
                  </div>
                  <Badge tone={isOngoing ? "green" : "slate"}>
                    {isOngoing ? "Live / Active" : "Scheduled / Inactive"}
                  </Badge>
                </div>

                <div className="rounded-xl bg-slate-50 p-3 text-xs flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Discount Rate</span>
                    <span className="font-black text-lg text-purple-900">
                      {p.discountType === "PERCENTAGE" ? `${p.discountValue}% OFF` : `Rs. ${p.discountValue} OFF`}
                    </span>
                  </div>
                  {p.minInvoiceValue > 0 && (
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block uppercase font-bold">Min Invoice</span>
                      <span className="font-bold text-slate-700">{formatMoney(p.minInvoiceValue, currency)}</span>
                    </div>
                  )}
                </div>

                <div className="text-[11px] text-slate-500 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span>
                      {p.effectiveFrom ? formatDate(p.effectiveFrom) : "Immediate"} to{" "}
                      {p.effectiveTo ? formatDate(p.effectiveTo) : "Ongoing"}
                    </span>
                  </div>
                  {p.maxDiscountAmount && (
                    <p className="text-[10px] text-slate-400">
                      Max discount cap: {formatMoney(p.maxDiscountAmount, currency)}
                    </p>
                  )}
                  {p.notes && <p className="text-[10px] text-slate-400 italic truncate">{p.notes}</p>}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* New Promotion Modal */}
      {showModal && (
        <Modal
          open={showModal}
          onClose={() => setShowModal(false)}
          title="Create Promotional Discount Campaign"
          description="Configure an automatic discount rate, validity window, and POS eligibility rules."
          size="lg"
        >
          <div className="space-y-4 pt-2 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700">Promotion Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Winter Mobile Gala"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Promo Code (Uppercase) *</label>
                <input
                  type="text"
                  placeholder="e.g. WINTER2026"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-bold text-slate-800 uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700">Discount Type *</label>
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as any)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800"
                >
                  <option value="PERCENTAGE">Percentage Discount (%)</option>
                  <option value="FIXED">Fixed Amount Discount (Rs.)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700">
                  {discountType === "PERCENTAGE" ? "Discount Percentage (%) *" : "Discount Amount (Rs.) *"}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder={discountType === "PERCENTAGE" ? "e.g. 5" : "e.g. 1000"}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700">Minimum Invoice Subtotal (Rs.)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0 (No minimum)"
                  value={minInvoiceValue}
                  onChange={(e) => setMinInvoiceValue(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Maximum Discount Cap (Rs.)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="Leave empty for uncapped"
                  value={maxDiscountAmount}
                  onChange={(e) => setMaxDiscountAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700">Notes & Terms</label>
              <textarea
                rows={2}
                placeholder="Optional internal terms and promotional guidelines..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800"
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <span className="text-[10px] text-slate-400">© 2026 Copyright Reserved · Qasim Ali · 0315-5049489</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setShowModal(false)} disabled={submitting}>
                  Cancel
                </Button>
                <Button onClick={handleCreatePromotion} disabled={submitting}>
                  Save Promotion
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

