"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  CheckCircle2,
  Clock,
  Database,
  Download,
  FileCheck2,
  FileJson,
  HardDrive,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type BackupItem = {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  recordCount: number;
  companyCode: string;
  companyName: string;
  counts: Record<string, number>;
};

type LiveCounts = {
  accounts: number;
  products: number;
  stockUnits: number;
  deviceIdentifiers: number;
  purchaseOrders: number;
  purchaseReceipts: number;
  salesInvoices: number;
  journals: number;
  customers: number;
  suppliers: number;
};

export function BackupWorkspace({
  canRestore,
  companyCode,
}: {
  canRestore: boolean;
  companyCode: string;
}) {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [liveCounts, setLiveCounts] = useState<LiveCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Restore Modal State
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [restorePayload, setRestorePayload] = useState<any>(null);
  const [confirmText, setConfirmText] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/backup", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message || "Failed to load backups.");
      setBackups(body.data.backups || []);
      setLiveCounts(body.data.liveCounts || null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error loading backups.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleCreateBackup() {
    setCreating(true);
    try {
      const res = await fetch("/api/settings/backup", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message || "Failed to create backup.");

      // Auto-trigger browser download of the verified snapshot
      if (body.data?.payload) {
        const blob = new Blob([JSON.stringify(body.data.payload, null, 2)], { type: "application/json" });
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = body.data.filename || `axon-backup-${companyCode}-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
      }

      toast.success("Database backup created and downloaded successfully!");
      void loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Backup creation failed.");
    } finally {
      setCreating(false);
    }
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (parsed.format !== "AXON_DATABASE_BACKUP") {
          toast.error("Invalid backup file: Format must be AXON_DATABASE_BACKUP.");
          return;
        }
        setRestorePayload(parsed);
        setConfirmText("");
        setRestoreModalOpen(true);
      } catch {
        toast.error("Failed to parse JSON file. Ensure it is a valid backup export.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  async function executeRestore() {
    if (confirmText !== "RESTORE") {
      toast.error('You must type "RESTORE" to authorize overwriting the database.');
      return;
    }

    setRestoring(true);
    try {
      const res = await fetch("/api/settings/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation: "RESTORE",
          backupPayload: restorePayload,
        }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message || "Database restoration failed.");

      toast.success("Database successfully restored! Reloading state...");
      setRestoreModalOpen(false);
      setRestorePayload(null);
      void loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restoration failed.");
    } finally {
      setRestoring(false);
    }
  }

  function formatBytes(bytes: number) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  const totalLiveRecords = liveCounts
    ? Object.values(liveCounts).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600">
            <Database className="h-4 w-4" />
            System Governance & Safety
          </div>
          <h1 className="mt-1 text-2xl font-black text-slate-900 tracking-tight sm:text-3xl">
            Database Backup & Recovery Studio
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Export full JSON snapshots of products, serials, GL journals, and invoices, or restore from a verified archive.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData()}
            disabled={loading}
            className="gap-2 text-slate-600"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            onClick={handleCreateBackup}
            disabled={creating}
            className="gap-2 bg-blue-600 text-white hover:bg-blue-700 shadow-sm font-bold"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Snapshot Now
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Live Database Records
            </span>
            <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
              <HardDrive className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-slate-900">{totalLiveRecords.toLocaleString()}</div>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <span>{liveCounts?.accounts || 0} Accounts</span> ·{" "}
            <span>{liveCounts?.products || 0} Products</span> ·{" "}
            <span>{liveCounts?.stockUnits || 0} Devices</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Available Snapshots
            </span>
            <div className="rounded-xl bg-purple-50 p-2.5 text-purple-600">
              <Archive className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-slate-900">{backups.length}</div>
          <div className="mt-1 text-xs text-slate-500">
            {backups.length > 0 ? "Stored locally in /backups" : "No snapshots generated yet"}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Latest Backup
            </span>
            <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 text-lg font-black text-slate-900 truncate">
            {backups[0] ? new Date(backups[0].createdAt).toLocaleDateString() : "Never"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {backups[0] ? new Date(backups[0].createdAt).toLocaleTimeString() : "Create your first backup"}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Recovery Status
            </span>
            <div className="rounded-xl bg-amber-50 p-2.5 text-amber-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 text-lg font-black text-emerald-700 flex items-center gap-1.5">
            <CheckCircle2 className="h-5 w-5" />
            Protected
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {canRestore ? "Super Admin restore privileges enabled" : "View & download only"}
          </div>
        </div>
      </div>

      {/* Action Banners */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Quick Download Card */}
        <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/70 to-white p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-blue-600 p-3 text-white shadow-sm">
              <Download className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">Download Live Database Snapshot</h3>
              <p className="text-xs leading-relaxed text-slate-600">
                Instantly streams a complete, portable JSON file of all data tables, accounts, products, and journals directly to your computer.
              </p>
              <div className="pt-2">
                <Button
                  onClick={handleCreateBackup}
                  disabled={creating}
                  size="sm"
                  className="bg-blue-600 text-white hover:bg-blue-700 font-bold gap-2 text-xs"
                >
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}
                  Download Full .JSON Backup
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Restore Upload Card */}
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/60 to-white p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-amber-600 p-3 text-white shadow-sm">
              <Upload className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">Restore Database from Backup</h3>
              <p className="text-xs leading-relaxed text-slate-600">
                Upload a verified Axon ERP backup file to restore system state. Overwrites transactional records cleanly with confirmation.
              </p>
              <div className="pt-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-50 shadow-sm transition">
                  <FileJson className="h-3.5 w-3.5 text-amber-600" />
                  Select Backup File (.json)
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleFileSelected}
                    disabled={!canRestore}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Snapshot History Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/75 px-5 py-3.5">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Snapshot Archive History</h3>
            <p className="text-xs text-slate-500">Persistent disk snapshots available for download or immediate rollback.</p>
          </div>
          <Badge tone="slate" className="font-mono text-xs">
            {backups.length} file{backups.length === 1 ? "" : "s"}
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-5 py-3">Snapshot Name</th>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">File Size</th>
                <th className="px-4 py-3">Record Breakdown</th>
                <th className="px-4 py-3 text-center">Total Records</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-500" />
                    <p className="mt-2 text-xs">Loading backup archive...</p>
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400">
                    <Archive className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 font-semibold text-slate-600">No backup snapshots found on disk</p>
                    <p className="text-xs text-slate-400">Click &quot;Create Snapshot Now&quot; to generate your first verified archive.</p>
                  </td>
                </tr>
              ) : (
                backups.map((item) => (
                  <tr key={item.filename} className="hover:bg-slate-50/60 transition">
                    <td className="px-5 py-3.5 font-mono font-semibold text-slate-800">
                      <div className="flex items-center gap-2">
                        <FileJson className="h-4 w-4 text-blue-600 shrink-0" />
                        <span className="truncate max-w-xs">{item.filename}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-600">
                      {formatBytes(item.sizeBytes)}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500">
                      <div className="flex flex-wrap gap-1">
                        {item.counts.accounts ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                            {item.counts.accounts} Acc
                          </span>
                        ) : null}
                        {item.counts.products ? (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                            {item.counts.products} Prod
                          </span>
                        ) : null}
                        {item.counts.stockUnits ? (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                            {item.counts.stockUnits} IMEI
                          </span>
                        ) : null}
                        {item.counts.journalEntries ? (
                          <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                            {item.counts.journalEntries} GL
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center font-bold text-slate-900">
                      {item.recordCount.toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <a
                          href={`/api/settings/backup?download=${encodeURIComponent(item.filename)}`}
                          download={item.filename}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-600 shadow-2xs"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </a>

                        {canRestore && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              try {
                                const res = await fetch(
                                  `/api/settings/backup?download=${encodeURIComponent(item.filename)}`,
                                );
                                const parsed = await res.json();
                                setRestorePayload(parsed);
                                setSelectedFileName(item.filename);
                                setConfirmText("");
                                setRestoreModalOpen(true);
                              } catch {
                                toast.error("Failed to read snapshot file for restore.");
                              }
                            }}
                            className="h-8 gap-1 border-amber-200 text-amber-700 hover:bg-amber-50"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Rollback
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Restoration Confirmation Modal */}
      {restoreModalOpen && restorePayload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="rounded-xl bg-rose-100 p-3 text-rose-600 shrink-0">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Confirm Database Restoration</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  You are about to restore system data from: <strong className="text-slate-700">{selectedFileName}</strong>
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 text-xs space-y-2 text-rose-900">
              <div className="flex items-center gap-1.5 font-bold text-rose-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                CRITICAL WARNING: This action is destructive!
              </div>
              <p>
                Restoring this snapshot will replace current transactional and catalog records with the contents of this archive.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px] text-slate-700">
                <div>Snapshot Date: <b>{new Date(restorePayload.timestamp).toLocaleDateString()}</b></div>
                <div>Company: <b>{restorePayload.company?.code}</b></div>
                <div>Total Records: <b>{restorePayload.totalRecords}</b></div>
                <div>Chart Accounts: <b>{restorePayload.counts?.accounts || 0}</b></div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                To confirm, type <span className="font-mono text-rose-600 bg-rose-50 px-1 py-0.5 rounded">RESTORE</span> below:
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="RESTORE"
                className="h-10 w-full rounded-lg border border-slate-300 px-3 font-mono text-sm uppercase tracking-wider outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setRestoreModalOpen(false);
                  setRestorePayload(null);
                }}
                disabled={restoring}
              >
                Cancel
              </Button>

              <Button
                onClick={executeRestore}
                disabled={confirmText !== "RESTORE" || restoring}
                className="bg-rose-600 text-white hover:bg-rose-700 font-bold gap-2"
              >
                {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Execute Restore
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

