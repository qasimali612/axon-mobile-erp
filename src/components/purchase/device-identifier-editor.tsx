"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Barcode, CheckCircle2, ClipboardPaste, Loader2, RefreshCw, ShieldAlert, Smartphone, X } from "lucide-react";
import { isValidImei, normalizeImei } from "@/lib/imei";

type TrackingMethod = "IMEI" | "SERIAL";
type IdentifierRow = { primary: string; secondary: string; additional: string };

type Props = {
  trackingMethod: TrackingMethod;
  productName: string;
  quantity: number;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  readOnly?: boolean;
};

function splitValues(line: string) {
  return line.split(/[\s,;|]+/).map((value) => value.trim()).filter(Boolean);
}

function rowsFromText(value: string, quantity: number): IdentifierRow[] {
  const parsed = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const values = splitValues(line);
    return { primary: values[0] || "", secondary: values[1] || "", additional: values.slice(2).join(",") };
  });
  return Array.from({ length: Math.max(quantity, parsed.length) }, (_, index) => parsed[index] || { primary: "", secondary: "", additional: "" });
}

function textFromRows(rows: IdentifierRow[]) {
  return rows.map((row) => [row.primary, row.secondary, ...splitValues(row.additional)].filter(Boolean).join(",")).filter(Boolean).join("\n");
}

function identifierValues(row: IdentifierRow) {
  return [row.primary, row.secondary, ...splitValues(row.additional)].filter(Boolean);
}

export function DeviceIdentifierEditor({ trackingMethod, productName, quantity, value, onChange, onClose, readOnly = false }: Props) {
  const [mode, setMode] = useState<"structured" | "bulk">("structured");
  const [validating, setValidating] = useState(false);
  const [serverErrors, setServerErrors] = useState<Map<number, string>>(new Map());
  const [serverVerified, setServerVerified] = useState(false);

  const rows = useMemo(() => rowsFromText(value, quantity), [quantity, value]);
  const activeRows = rows.slice(0, quantity);

  // All normalized identifiers across active rows
  const allValues = activeRows.flatMap(identifierValues).map((item) =>
    trackingMethod === "IMEI" ? normalizeImei(item) : item.replace(/\s+/g, "").toUpperCase()
  );

  // Duplicates within the form
  const duplicateValues = new Set(allValues.filter((item, index) => allValues.indexOf(item) !== index));

  // Dual-SIM identical check per row
  const selfDuplicateRows = new Set<number>();
  activeRows.forEach((row, idx) => {
    if (row.primary && row.secondary) {
      const p = trackingMethod === "IMEI" ? normalizeImei(row.primary) : row.primary.trim().toUpperCase();
      const s = trackingMethod === "IMEI" ? normalizeImei(row.secondary) : row.secondary.trim().toUpperCase();
      if (p === s) selfDuplicateRows.add(idx);
    }
  });

  const completed = activeRows.filter((row, idx) => {
    if (!row.primary) return false;
    if (selfDuplicateRows.has(idx)) return false;
    if (trackingMethod === "SERIAL") return true;
    return identifierValues(row).every(isValidImei);
  }).length;

  const invalidImeis = trackingMethod === "IMEI" ? allValues.filter((item) => !isValidImei(item)) : [];
  const hasDbErrors = serverErrors.size > 0;
  const ready = completed === quantity && invalidImeis.length === 0 && duplicateValues.size === 0 && selfDuplicateRows.size === 0 && !hasDbErrors;

  function patchRow(index: number, patch: Partial<IdentifierRow>) {
    setServerVerified(false);
    if (serverErrors.has(index)) {
      setServerErrors((prev) => {
        const next = new Map(prev);
        next.delete(index);
        return next;
      });
    }
    const next = rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row);
    onChange(textFromRows(next));
  }

  function focusCell(index: number, field: "primary" | "secondary") {
    document.getElementById(`device-id-${index}-${field}`)?.focus();
  }

  async function checkServerDuplicates() {
    if (trackingMethod !== "IMEI") return;
    setValidating(true);
    setServerErrors(new Map());
    try {
      const payload = {
        mode: "purchase",
        devices: activeRows.map((r, i) => ({
          unitIndex: i,
          primary: r.primary,
          secondary: r.secondary,
          additional: r.additional,
        })).filter((d) => d.primary.trim()),
      };

      const res = await fetch("/api/inventory/imei/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data?.data) {
        const errorsMap = new Map<number, string>();
        for (const item of data.data.deviceResults || []) {
          if (!item.isValid && item.errors?.length) {
            errorsMap.set(item.index, item.errors.join("; "));
          }
        }
        setServerErrors(errorsMap);
        setServerVerified(true);
      }
    } catch {
      // Ignore network failures for optimistic editing
    } finally {
      setValidating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
              <Smartphone className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-blue-700">Serialized IMEI & Dual-SIM Control</p>
              <h2 className="mt-1 text-lg font-black text-slate-950">{productName}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {trackingMethod === "IMEI"
                  ? "1 row = 1 physical phone. IMEI 1 and IMEI 2 belong to that single device. Duplicate IMEIs are strictly prohibited."
                  : "One row is one physical serialized item."}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid grid-cols-2 gap-2 border-b bg-slate-50 px-5 py-3 sm:grid-cols-[140px_140px_1fr]">
          <div>
            <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Total Quantity</span>
            <b className="mt-1 block text-xl">{quantity}</b>
          </div>
          <div>
            <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Valid Devices</span>
            <b className={`mt-1 block text-xl ${ready ? "text-emerald-700" : "text-amber-700"}`}>
              {completed}/{quantity}
            </b>
          </div>
          <div className="flex items-center justify-end gap-2">
            {trackingMethod === "IMEI" && (
              <button
                type="button"
                onClick={() => void checkServerDuplicates()}
                disabled={validating || readOnly || completed === 0}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" /> : <RefreshCw className="h-3.5 w-3.5 text-blue-600" />}
                Check DB Duplicates
              </button>
            )}
            <button
              type="button"
              onClick={() => setMode("structured")}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold ${
                mode === "structured" ? "bg-blue-600 text-white" : "border bg-white text-slate-600"
              }`}
            >
              <Barcode className="h-3.5 w-3.5" />
              Scanner entry
            </button>
            <button
              type="button"
              onClick={() => setMode("bulk")}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold ${
                mode === "bulk" ? "bg-blue-600 text-white" : "border bg-white text-slate-600"
              }`}
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              Bulk paste
            </button>
          </div>
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto p-5">
          {mode === "structured" ? (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full min-w-[780px] text-left">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="w-16 px-3 py-3">Unit</th>
                    <th className="px-3 py-3">{trackingMethod === "IMEI" ? "IMEI 1 / Primary" : "Serial number"}</th>
                    {trackingMethod === "IMEI" && (
                      <>
                        <th className="px-3 py-3">IMEI 2 / Secondary</th>
                        <th className="px-3 py-3">Additional IMEI (optional)</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeRows.map((row, index) => {
                    const values = identifierValues(row).map((item) =>
                      trackingMethod === "IMEI" ? normalizeImei(item) : item.toUpperCase()
                    );
                    const rowInvalid = trackingMethod === "IMEI" && values.some((item) => !isValidImei(item));
                    const rowDuplicate = values.some((item) => duplicateValues.has(item));
                    const rowSelfDuplicate = selfDuplicateRows.has(index);
                    const dbError = serverErrors.get(index);
                    const hasError = rowInvalid || rowDuplicate || rowSelfDuplicate || Boolean(dbError);
                    const rowComplete = Boolean(row.primary) && !hasError;

                    return (
                      <tr
                        key={index}
                        className={
                          hasError
                            ? "bg-rose-50/70"
                            : rowComplete
                            ? "bg-emerald-50/30"
                            : ""
                        }
                      >
                        <td className="px-3 py-2 align-top">
                          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-slate-100 px-2 text-xs font-black text-slate-600">
                            {index + 1}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            id={`device-id-${index}-primary`}
                            disabled={readOnly}
                            inputMode={trackingMethod === "IMEI" ? "numeric" : "text"}
                            autoFocus={index === 0}
                            value={row.primary}
                            maxLength={trackingMethod === "IMEI" ? 15 : 120}
                            onChange={(event) => patchRow(index, { primary: event.target.value })}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                focusCell(index, trackingMethod === "IMEI" ? "secondary" : "primary");
                                if (trackingMethod === "SERIAL") focusCell(index + 1, "primary");
                              }
                            }}
                            placeholder={trackingMethod === "IMEI" ? "Scan or type 15 digits" : "Scan or type serial"}
                            className={`h-9 w-full rounded-lg border bg-white px-3 font-mono text-xs outline-none focus:ring-2 ${
                              row.primary && trackingMethod === "IMEI" && !isValidImei(row.primary)
                                ? "border-rose-300 focus:ring-rose-100"
                                : "border-slate-200 focus:border-blue-500 focus:ring-blue-100"
                            }`}
                          />
                          {/* Row Error Notices */}
                          {rowSelfDuplicate && (
                            <span className="mt-1 block text-[10px] font-bold text-rose-600">
                              SIM 1 and SIM 2 cannot be identical!
                            </span>
                          )}
                          {dbError && (
                            <span className="mt-1 block text-[10px] font-bold text-rose-600">
                              {dbError}
                            </span>
                          )}
                        </td>
                        {trackingMethod === "IMEI" && (
                          <>
                            <td className="px-3 py-2">
                              <input
                                id={`device-id-${index}-secondary`}
                                disabled={readOnly}
                                inputMode="numeric"
                                value={row.secondary}
                                maxLength={15}
                                onChange={(event) => patchRow(index, { secondary: event.target.value })}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    focusCell(index + 1, "primary");
                                  }
                                }}
                                placeholder="Optional for single-SIM"
                                className={`h-9 w-full rounded-lg border bg-white px-3 font-mono text-xs outline-none focus:ring-2 ${
                                  row.secondary && !isValidImei(row.secondary)
                                    ? "border-rose-300 focus:ring-rose-100"
                                    : "border-slate-200 focus:border-blue-500 focus:ring-blue-100"
                                }`}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                disabled={readOnly}
                                value={row.additional}
                                onChange={(event) => patchRow(index, { additional: event.target.value })}
                                placeholder="Comma-separated if applicable"
                                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                              />
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
              <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
                <b>Bulk format:</b> one physical phone per line. Put IMEI 1 and IMEI 2 on the same line separated by a comma.
                Dual-SIM phones must have distinct IMEIs.
              </div>
              <textarea
                disabled={readOnly}
                autoFocus
                value={value}
                onChange={(event) => {
                  setServerVerified(false);
                  setServerErrors(new Map());
                  onChange(event.target.value);
                }}
                placeholder={
                  trackingMethod === "IMEI"
                    ? "356789012345678,356789012345686\n356789012345694,356789012345702"
                    : "SN-00001\nSN-00002"
                }
                className="min-h-[360px] w-full rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-sm leading-7 text-emerald-300 outline-none focus:border-blue-500"
              />
            </div>
          )}
        </main>

        <footer className="flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className={`flex items-start gap-2 text-xs ${ready ? "text-emerald-700" : "text-amber-700"}`}>
            {ready ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : hasDbErrors ? (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>
              {hasDbErrors
                ? `Database duplicate conflict: ${serverErrors.size} device(s) already exist in inventory!`
                : selfDuplicateRows.size
                ? `Dual-SIM conflict: ${selfDuplicateRows.size} device(s) have identical IMEI 1 and IMEI 2!`
                : duplicateValues.size
                ? `Duplicate identifier in batch: ${[...duplicateValues].join(", ")}`
                : invalidImeis.length
                ? `${invalidImeis.length} IMEI value(s) fail the 15-digit Luhn validation.`
                : serverVerified
                ? "All devices verified! Unique, valid Luhn check digits, and zero database collisions."
                : ready
                ? "All physical devices have valid format and unique identifiers for this receipt draft."
                : `Complete ${quantity - completed} remaining physical device row(s).`}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!ready}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            Keep identifiers
          </button>
        </footer>
      </div>
    </div>
  );
}
