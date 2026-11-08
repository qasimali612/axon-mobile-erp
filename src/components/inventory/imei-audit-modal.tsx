"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Download, FileSearch, Loader2, ShieldAlert, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Props = {
  onClose: () => void;
  warehouses: Array<{ id: string; code: string; name: string }>;
};

type AuditResult = {
  valid: boolean;
  summary: {
    totalDevices: number;
    totalIdentifiers: number;
    validDevices: number;
    invalidDevices: number;
    formatErrors: number;
    duplicateErrors: number;
    dbDuplicates: number;
    availabilityErrors: number;
  };
  deviceResults: Array<{
    index: number;
    primary: string;
    secondary?: string | null;
    additional?: string | null;
    isValid: boolean;
    errors: string[];
    databaseMatch?: {
      stockUnitId: string;
      status: string;
      productName: string;
      sku: string;
      warehouseCode?: string;
      warehouseName?: string;
      invoiceNumber?: string;
      receiptNumber?: string;
    } | null;
  }>;
};

export function ImeiAuditModal({ onClose, warehouses }: Props) {
  const [inputText, setInputText] = useState("");
  const [mode, setMode] = useState<"audit" | "purchase" | "sale">("audit");
  const [warehouseId, setWarehouseId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [filterTab, setFilterTab] = useState<"all" | "errors" | "valid">("all");

  async function runAudit() {
    const rawLines = inputText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (!rawLines.length) {
      toast.error("Please paste or type at least one IMEI to audit.");
      return;
    }

    const devices = rawLines.map((line, idx) => {
      const parts = line.split(/[\s,;|]+/).map((p) => p.trim()).filter(Boolean);
      return {
        unitIndex: idx,
        primary: parts[0] || "",
        secondary: parts[1] || "",
        additional: parts.slice(2).join(","),
      };
    });

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/inventory/imei/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          warehouseId: warehouseId || undefined,
          devices,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error?.message || "Validation failed.");
        return;
      }

      setResult(body.data);
      if (body.data.valid) {
        toast.success(`Audit passed! All ${body.data.summary.totalDevices} device(s) are valid.`);
      } else {
        toast.warning(
          `Audit found issues: ${body.data.summary.invalidDevices} of ${body.data.summary.totalDevices} device(s) have errors.`
        );
      }
    } catch (err) {
      toast.error("Network error during audit execution.");
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (!result) return;
    const headers = [
      "Device #",
      "IMEI 1",
      "IMEI 2",
      "Valid",
      "Error Details",
      "DB Product",
      "DB Status",
      "DB Warehouse",
      "Last Invoice",
      "Last Receipt",
    ];

    const lines = result.deviceResults.map((r) => [
      r.index + 1,
      r.primary,
      r.secondary || "",
      r.isValid ? "YES" : "NO",
      (r.errors || []).join(" | "),
      r.databaseMatch?.productName || "",
      r.databaseMatch?.status || "",
      r.databaseMatch?.warehouseCode || "",
      r.databaseMatch?.invoiceNumber || "",
      r.databaseMatch?.receiptNumber || "",
    ]);

    const csvContent = [headers, ...lines]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `imei-audit-report-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const filteredResults = result
    ? result.deviceResults.filter((r) => {
        if (filterTab === "errors") return !r.isValid;
        if (filterTab === "valid") return r.isValid;
        return true;
      })
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
              <FileSearch className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-black text-slate-950">IMEI Duplicate & Health Audit Tool</h2>
              <p className="text-xs text-slate-500">
                Bulk check up to 5,000 IMEIs for Luhn check digits, dual-SIM duplicates, and live inventory status.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex flex-1 flex-col overflow-y-auto p-6">
          {!result ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700">Audit Rule Mode</label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as any)}
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
                  >
                    <option value="audit">Full Health Audit (Check Existence & Details)</option>
                    <option value="purchase">Purchase Receiving Guard (Prohibit Existing DB IMEIs)</option>
                    <option value="sale">Sales Dispatch Guard (Require In-Stock Status)</option>
                  </select>
                </div>
                {mode === "sale" && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700">Target Dispatch Warehouse</label>
                    <select
                      value={warehouseId}
                      onChange={(e) => setWarehouseId(e.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
                    >
                      <option value="">Any Warehouse</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.code} - {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Paste IMEIs (1 device per line; comma or tab-separate IMEI 1 and IMEI 2)
                </label>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="356789012345678, 356789012345686&#10;356789012345694&#10;867841159797157, 864821809303476"
                  className="mt-1 min-h-[260px] w-full rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-sm leading-6 text-emerald-300 outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={runAudit} disabled={loading} className="gap-2 bg-blue-600 hover:bg-blue-700">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                  Run Audit Scan
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary Metrics */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Total Devices Checked</p>
                  <p className="mt-1 text-2xl font-black text-slate-900">{result.summary.totalDevices}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{result.summary.totalIdentifiers} total IMEIs</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Clean / Valid Devices</p>
                  <p className="mt-1 text-2xl font-black text-emerald-800">{result.summary.validDevices}</p>
                  <p className="mt-0.5 text-xs text-emerald-600">Passed all verification rules</p>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-rose-700">Devices with Issues</p>
                  <p className="mt-1 text-2xl font-black text-rose-800">{result.summary.invalidDevices}</p>
                  <p className="mt-0.5 text-xs text-rose-600">Requires review / correction</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Duplicate / Format Errors</p>
                  <p className="mt-1 text-2xl font-black text-amber-800">
                    {result.summary.duplicateErrors + result.summary.formatErrors + result.summary.dbDuplicates}
                  </p>
                  <p className="mt-0.5 text-xs text-amber-600">Luhn, batch, or DB duplicates</p>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => setFilterTab("all")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                      filterTab === "all" ? "bg-slate-900 text-white" : "border text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    All ({result.deviceResults.length})
                  </button>
                  <button
                    onClick={() => setFilterTab("errors")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                      filterTab === "errors" ? "bg-rose-600 text-white" : "border text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Issues ({result.summary.invalidDevices})
                  </button>
                  <button
                    onClick={() => setFilterTab("valid")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                      filterTab === "valid" ? "bg-emerald-600 text-white" : "border text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Clean ({result.summary.validDevices})
                  </button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setResult(null)}>
                    New Audit Scan
                  </Button>
                  <Button size="sm" onClick={exportCsv} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
                    <Download className="h-3.5 w-3.5" />
                    Export CSV Report
                  </Button>
                </div>
              </div>

              {/* Results Table */}
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Device #</th>
                      <th className="px-3 py-3">IMEI 1</th>
                      <th className="px-3 py-3">IMEI 2</th>
                      <th className="px-3 py-3">Audit Status</th>
                      <th className="px-3 py-3">Inventory Match</th>
                      <th className="px-3 py-3">Details / Errors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredResults.map((r) => (
                      <tr key={r.index} className={!r.isValid ? "bg-rose-50/50" : ""}>
                        <td className="px-3 py-2 font-bold text-slate-600">#{r.index + 1}</td>
                        <td className="px-3 py-2 font-mono font-bold text-slate-800">{r.primary}</td>
                        <td className="px-3 py-2 font-mono text-slate-600">{r.secondary || "—"}</td>
                        <td className="px-3 py-2">
                          {r.isValid ? (
                            <Badge tone="green">Valid</Badge>
                          ) : (
                            <Badge tone="red">Issue Detected</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {r.databaseMatch ? (
                            <div>
                              <b className="text-slate-900">{r.databaseMatch.productName}</b>
                              <span className="block text-[10px] text-slate-400">
                                {r.databaseMatch.status} · {r.databaseMatch.warehouseCode || "Outside custody"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">Not in database</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-rose-700">
                          {r.errors.length ? (
                            <ul className="list-disc pl-4 space-y-0.5">
                              {r.errors.map((err, eIdx) => (
                                <li key={eIdx}>{err}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-emerald-700 font-semibold">Passes all checks</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

