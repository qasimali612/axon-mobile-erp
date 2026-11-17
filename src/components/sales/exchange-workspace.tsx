"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatDate, formatMoney } from "@/lib/utils";

interface ExchangeRecord {
  exchangeNumber: string;
  sourceInvoiceNumber: string;
  returnNumber: string;
  replacementInvoiceNumber: string;
  returnedUnit: {
    product: string;
    variant: string;
    imeis: string[];
    creditValue: number;
  };
  replacementUnit: {
    product: string;
    variant: string;
    imeis: string[];
    price: number;
  };
  financials: {
    returnCreditValue: number;
    replacementPrice: number;
    exchangeDifference: number;
    settlementMethod: string;
  };
}

export function ExchangeWorkspace({
  currency,
  userPermissions,
}: {
  currency: string;
  userPermissions: string[];
}) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Form State
  const [sourceSearch, setSourceSearch] = useState("");
  const [searchingSource, setSearchingSource] = useState(false);
  const [sourceInvoices, setSourceInvoices] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

  const [selectedReturnUnit, setSelectedReturnUnit] = useState<any>(null);
  const [returnCondition, setReturnCondition] = useState<"RESTOCK" | "QUARANTINE">("RESTOCK");
  const [returnReason, setReturnReason] = useState("Customer requested model upgrade exchange");

  const [availableReplacements, setAvailableReplacements] = useState<any[]>([]);
  const [replacementSearch, setReplacementSearch] = useState("");
  const [selectedReplacement, setSelectedReplacement] = useState<any>(null);
  const [replacementPrice, setReplacementPrice] = useState("");

  const [settlementMethod, setSettlementMethod] = useState<"CASH" | "BANK" | "CUSTOMER_CREDIT">("CASH");
  const [recentExchanges, setRecentExchanges] = useState<any[]>([]);
  const [completedExchange, setCompletedExchange] = useState<ExchangeRecord | null>(null);

  async function loadRecentExchanges() {
    setLoading(true);
    try {
      const res = await fetch("/api/sales/exchanges");
      const json = await res.json();
      if (res.ok) {
        setRecentExchanges(json.data || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecentExchanges();
  }, []);

  async function handleSearchSource() {
    if (!sourceSearch.trim()) return;
    setSearchingSource(true);
    try {
      const res = await fetch(`/api/returns/sources?type=SALES_RETURN&q=${encodeURIComponent(sourceSearch.trim())}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Failed to search invoices");
      setSourceInvoices(json.data || []);
      if (!json.data || json.data.length === 0) {
        toast.info("No posted sales invoices found matching that query.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error searching source documents");
    } finally {
      setSearchingSource(false);
    }
  }

  async function loadAvailableStock(warehouseId: string) {
    try {
      const res = await fetch(`/api/inventory/imei?warehouseId=${warehouseId}&status=IN_STOCK&pageSize=100`);
      const json = await res.json();
      if (res.ok && json.data) {
        setAvailableReplacements(json.data);
      }
    } catch {
      // ignore
    }
  }

  function handleSelectInvoice(inv: any) {
    setSelectedInvoice(inv);
    setSelectedReturnUnit(null);
    setSelectedReplacement(null);
    setReplacementPrice("");
    if (inv.warehouse?.id) {
      loadAvailableStock(inv.warehouse.id);
    }
  }

  const returnCreditValue = selectedReturnUnit ? Number(selectedReturnUnit.unitAmount) : 0;
  const replacementPriceNum = parseFloat(replacementPrice) || 0;
  const difference = replacementPriceNum - returnCreditValue;

  async function handleSubmitExchange() {
    if (!selectedInvoice || !selectedReturnUnit || !selectedReplacement || !(replacementPriceNum > 0)) {
      toast.error("Please complete all exchange selection steps.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/sales/exchanges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: selectedInvoice.branch.id,
          warehouseId: selectedInvoice.warehouse.id,
          sourceSalesInvoiceId: selectedInvoice.id,
          returnedStockUnitId: selectedReturnUnit.unitId,
          returnCondition,
          returnReason,
          replacementVariantId: selectedReplacement.variantId,
          replacementStockUnitId: selectedReplacement.id,
          replacementPrice: replacementPriceNum.toFixed(4),
          settlementMethod,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Exchange processing failed");

      toast.success("Handset exchange successfully completed and posted!");
      setCompletedExchange(json.data);
      setShowModal(false);
      loadRecentExchanges();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Exchange failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="kicker">Retail POS & Counter Services</span>
            <Badge tone="blue">Zero-Discrepancy Reverse Logistics</Badge>
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Mobile Phone Exchange Command Center
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Process trade-ins, handset upgrades, and phone exchanges with automated inventory swap and double-entry settlement.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setSelectedInvoice(null);
              setSelectedReturnUnit(null);
              setSelectedReplacement(null);
              setReplacementPrice("");
              setShowModal(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            New Handset Exchange
          </Button>
        </div>
      </div>

      {/* Completed Exchange Banner if just finished */}
      {completedExchange && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-emerald-950">
                  Exchange Successfully Posted: {completedExchange.exchangeNumber}
                </h3>
                <p className="text-xs text-emerald-700">
                  Return Note: {completedExchange.returnNumber} · Replacement Sale: {completedExchange.replacementInvoiceNumber}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100"
            >
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Print Exchange Note
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 border-t border-emerald-200/60 pt-3 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-emerald-800">Returned Handset</span>
              <p className="font-bold text-slate-900 mt-0.5">{completedExchange.returnedUnit.product} {completedExchange.returnedUnit.variant}</p>
              <p className="font-mono text-[11px] text-slate-500">{completedExchange.returnedUnit.imeis.join(" / ")}</p>
              <p className="text-emerald-700 font-semibold mt-0.5">Credit Value: {formatMoney(completedExchange.financials.returnCreditValue, currency)}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-emerald-800">Replacement Handset</span>
              <p className="font-bold text-slate-900 mt-0.5">{completedExchange.replacementUnit.product} {completedExchange.replacementUnit.variant}</p>
              <p className="font-mono text-[11px] text-slate-500">{completedExchange.replacementUnit.imeis.join(" / ")}</p>
              <p className="text-blue-700 font-semibold mt-0.5">Selling Price: {formatMoney(completedExchange.financials.replacementPrice, currency)}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-emerald-800">Differential Settlement</span>
              <p className="font-bold text-slate-900 mt-0.5">
                {completedExchange.financials.exchangeDifference > 0
                  ? `Customer Paid: ${formatMoney(completedExchange.financials.exchangeDifference, currency)}`
                  : completedExchange.financials.exchangeDifference < 0
                  ? `Customer Refunded: ${formatMoney(Math.abs(completedExchange.financials.exchangeDifference), currency)}`
                  : "Even Trade (Rs. 0 Differential)"}
              </p>
              <p className="text-xs text-slate-500">Method: {completedExchange.financials.settlementMethod}</p>
            </div>
          </div>
        </div>
      )}

      {/* Overview Table */}
      <div className="surface overflow-hidden">
        <div className="border-b border-slate-100 p-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Exchange Trade-In Logs</h2>
            <p className="text-xs text-slate-500">Recent mobile handset exchanges processed across branches</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadRecentExchanges}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
              <tr>
                <th className="py-3 pl-5 pr-3">Return Document</th>
                <th className="px-3 py-3">Customer</th>
                <th className="px-3 py-3">Branch / Warehouse</th>
                <th className="px-3 py-3">Returned Handset & IMEIs</th>
                <th className="px-3 py-3 text-right">Trade-In Credit</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="py-3 pl-3 pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400">Loading exchange logs...</td>
                </tr>
              ) : recentExchanges.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <ArrowLeftRight className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-xs font-semibold text-slate-700">No handset exchanges recorded yet</p>
                    <p className="text-[11px] text-slate-400">Click &ldquo;New Handset Exchange&rdquo; to process customer phone upgrades.</p>
                  </td>
                </tr>
              ) : (
                recentExchanges.map((row) => {
                  const firstLine = row.lines[0];
                  const firstUnit = firstLine?.units[0]?.stockUnit;
                  const imeis = firstUnit?.identifiers?.map((i: any) => i.value).join(" / ") || "—";
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/60">
                      <td className="py-3 pl-5 pr-3">
                        <Link href={`/returns/${row.id}`} className="font-mono font-bold text-blue-700 hover:underline">
                          {row.returnNumber}
                        </Link>
                        <span className="block text-[10px] text-slate-400">{formatDate(row.returnDate)}</span>
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-900">
                        {row.customer?.name || "Walk-in Counter"}
                        <span className="block text-[10px] text-slate-400">{row.customer?.phone || ""}</span>
                      </td>
                      <td className="px-3 py-3">
                        {row.branch?.code} · {row.warehouse?.code}
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-800">{firstLine?.product?.name} {firstLine?.variant?.name}</p>
                        <span className="font-mono text-[10px] text-slate-500">{imeis}</span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">
                        {formatMoney(row.grandTotal, currency)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Badge tone="green">{row.status}</Badge>
                      </td>
                      <td className="py-3 pl-3 pr-5 text-right">
                        <Link href={`/returns/${row.id}/print`} target="_blank">
                          <Button size="sm" variant="outline">
                            <Printer className="h-3 w-3" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Handset Exchange Guided Modal */}
      {showModal && (
        <Modal
          open={showModal}
          onClose={() => setShowModal(false)}
          title="Mobile Phone Exchange Workflow"
          description="Process customer device trade-in and replacement handset in a single linked transaction."
          size="xl"
        >
          <div className="space-y-5 pt-1">
            {/* Step 1: Search & Select Source Invoice */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-2">
                1. Locate Original Customer Sales Invoice
              </span>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={sourceSearch}
                    onChange={(e) => setSourceSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearchSource()}
                    placeholder="Search by invoice #, customer name, or customer IMEI..."
                    className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <Button size="sm" onClick={handleSearchSource} disabled={searchingSource}>
                  {searchingSource ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                </Button>
              </div>

              {sourceInvoices.length > 0 && !selectedInvoice && (
                <div className="mt-3 max-h-44 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                  {sourceInvoices.map((inv) => (
                    <div
                      key={inv.id}
                      onClick={() => handleSelectInvoice(inv)}
                      className="p-3 hover:bg-blue-50/60 cursor-pointer flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-blue-700 font-mono">{inv.number}</span>
                        <span className="ml-2 text-slate-600 font-medium">{inv.party.name}</span>
                        <span className="block text-[10px] text-slate-400">
                          {formatDate(inv.date)} · Branch: {inv.branch.name}
                        </span>
                      </div>
                      <span className="text-blue-600 font-semibold text-[11px] flex items-center gap-1">
                        Select Invoice <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {selectedInvoice && (
                <div className="mt-3 flex items-center justify-between rounded-lg bg-blue-50/80 p-2.5 border border-blue-200 text-xs">
                  <div>
                    <span className="font-bold text-blue-950 font-mono">{selectedInvoice.number}</span>
                    <span className="ml-2 text-blue-800">{selectedInvoice.party.name}</span>
                    <span className="block text-[11px] text-blue-600">
                      Branch: {selectedInvoice.branch.name} · Warehouse: {selectedInvoice.warehouse.name}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedInvoice(null)} className="text-blue-700 text-xs h-7">
                    Change Invoice
                  </Button>
                </div>
              )}
            </div>

            {/* Step 2: Choose Returned Handset */}
            {selectedInvoice && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-2">
                  2. Select Returned Handset for Trade-In
                </span>
                <div className="space-y-2">
                  {selectedInvoice.lines.map((line: any) =>
                    line.units.map((unit: any) => {
                      const isSelected = selectedReturnUnit?.unitId === unit.id;
                      const imeis = unit.identifiers.map((i: any) => i.value).join(" / ");
                      return (
                        <div
                          key={unit.id}
                          onClick={() =>
                            setSelectedReturnUnit({
                              unitId: unit.id,
                              productName: line.product.name,
                              variantName: line.variant.name,
                              unitAmount: line.unitAmount,
                              imeis,
                            })
                          }
                          className={`rounded-lg border p-3 cursor-pointer text-xs transition flex items-center justify-between ${
                            isSelected
                              ? "border-blue-600 bg-blue-50/80 ring-1 ring-blue-500"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          <div>
                            <p className="font-bold text-slate-900">{line.product.name} {line.variant.name}</p>
                            <p className="font-mono text-[11px] text-slate-500 mt-0.5">IMEI: {imeis}</p>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-slate-900 block">
                              {formatMoney(line.unitAmount, currency)}
                            </span>
                            <span className="text-[10px] text-slate-400">Sold Price / Credit Value</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {selectedReturnUnit && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/80 text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700">Returned Condition</label>
                      <select
                        value={returnCondition}
                        onChange={(e) => setReturnCondition(e.target.value as any)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                      >
                        <option value="RESTOCK">Good / Resalable (Restock to available)</option>
                        <option value="QUARANTINE">Open Box / Inspection / Damaged (Quarantine)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700">Exchange Reason</label>
                      <input
                        type="text"
                        value={returnReason}
                        onChange={(e) => setReturnReason(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Choose Replacement Handset */}
            {selectedReturnUnit && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-2">
                  3. Select Replacement Handset (Available Stock)
                </span>

                <div className="mb-2">
                  <input
                    type="text"
                    value={replacementSearch}
                    onChange={(e) => setReplacementSearch(e.target.value)}
                    placeholder="Filter replacement handsets by model or IMEI..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-xs">
                  {availableReplacements
                    .filter((u) => {
                      if (!replacementSearch) return true;
                      const q = replacementSearch.toLowerCase();
                      const matchName = (u.product?.name || "").toLowerCase().includes(q);
                      const matchVar = (u.variant?.name || "").toLowerCase().includes(q);
                      const matchImei = (u.identifiers || []).some((i: any) => (i.value || "").toLowerCase().includes(q));
                      return matchName || matchVar || matchImei;
                    })
                    .map((unit) => {
                      const isSelected = selectedReplacement?.id === unit.id;
                      const imeis = (unit.identifiers || []).map((i: any) => i.value).join(" / ");
                      const defPrice = unit.variant?.retailPrice ? String(unit.variant.retailPrice) : "0";
                      return (
                        <div
                          key={unit.id}
                          onClick={() => {
                            setSelectedReplacement(unit);
                            if (!replacementPrice || replacementPrice === "0") {
                              setReplacementPrice(defPrice);
                            }
                          }}
                          className={`p-3 cursor-pointer flex items-center justify-between transition ${
                            isSelected ? "bg-blue-50/80 font-semibold border-l-4 border-blue-600" : "hover:bg-slate-50"
                          }`}
                        >
                          <div>
                            <p className="font-bold text-slate-900">{unit.product?.name} {unit.variant?.name}</p>
                            <p className="font-mono text-[10px] text-slate-500">IMEI: {imeis}</p>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-blue-700">{formatMoney(defPrice, currency)}</span>
                            <span className="block text-[10px] text-slate-400">Standard Price</span>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {selectedReplacement && (
                  <div className="mt-3 flex items-center gap-3 pt-2 border-t border-slate-200/80 text-xs">
                    <label className="font-semibold text-slate-700">Agreed Replacement Selling Price (Rs.):</label>
                    <input
                      type="number"
                      value={replacementPrice}
                      onChange={(e) => setReplacementPrice(e.target.value)}
                      className="h-8 w-36 rounded-lg border border-slate-300 px-2 font-mono font-bold text-slate-900 text-sm"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Differential Calculation & Settlement */}
            {selectedReplacement && replacementPriceNum > 0 && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-950 block mb-2">
                  4. Exchange Financials & Differential Settlement
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg bg-white p-3 border border-blue-200/80 text-xs font-mono">
                  <div>
                    <span className="text-slate-400 text-[10px] block uppercase font-sans">Trade-In Credit</span>
                    <span className="font-bold text-emerald-700 text-sm">{formatMoney(returnCreditValue, currency)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block uppercase font-sans">Replacement Handset</span>
                    <span className="font-bold text-blue-700 text-sm">{formatMoney(replacementPriceNum, currency)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block uppercase font-sans">Net Differential</span>
                    <span className={`font-black text-base ${difference > 0 ? "text-amber-700" : difference < 0 ? "text-rose-700" : "text-slate-800"}`}>
                      {difference > 0
                        ? `+${formatMoney(difference, currency)} (Customer Pays)`
                        : difference < 0
                        ? `-${formatMoney(Math.abs(difference), currency)} (Customer Refund)`
                        : "Rs. 0 (Even Swap)"}
                    </span>
                  </div>
                </div>

                {difference !== 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
                    <span className="font-semibold text-slate-700">
                      {difference > 0 ? "Settlement of Additional Payment:" : "Settlement of Refund Difference:"}
                    </span>
                    <div className="flex gap-2">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="settlementMethod"
                          checked={settlementMethod === "CASH"}
                          onChange={() => setSettlementMethod("CASH")}
                        />
                        <span>Cash Counter</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="settlementMethod"
                          checked={settlementMethod === "BANK"}
                          onChange={() => setSettlementMethod("BANK")}
                        />
                        <span>Bank Transfer</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="settlementMethod"
                          checked={settlementMethod === "CUSTOMER_CREDIT"}
                          onChange={() => setSettlementMethod("CUSTOMER_CREDIT")}
                        />
                        <span>On-Account Credit</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <span className="text-[10px] text-slate-400">© 2026 Copyright Reserved · Qasim Ali · 0315-5049489</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setShowModal(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitExchange}
                  disabled={busy || !selectedReplacement || !(replacementPriceNum > 0)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                  Confirm & Post Exchange
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

