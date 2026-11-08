"use client";

import { useEffect, useState } from "react";
import { Hash, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { responseError } from "@/components/ui/form-error";
import { titleCase } from "@/lib/utils";

type Sequence = {
  id: string;
  companyId: string;
  branchId: string;
  documentType: string;
  prefix: string;
  fiscalYear: string;
  nextValue: string;
  padding: number;
  branch: { id: string; code: string; name: string };
};

export function SequenceWorkspace({ permissions }: { permissions: string[] }) {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Sequence | null>(null);
  const [prefix, setPrefix] = useState("");
  const [padding, setPadding] = useState("6");
  const [nextValue, setNextValue] = useState("");
  const [saving, setSaving] = useState(false);

  const canManage = permissions.includes("policy.manage");

  async function load() {
    setLoading(true);
    const response = await fetch("/api/settings/sequences");
    setLoading(false);
    if (!response.ok) return toast.error(await responseError(response));
    const body = await response.json();
    setSequences(body.data || []);
  }

  useEffect(() => {
    void load();
  }, []);

  function openEdit(seq: Sequence) {
    setEditing(seq);
    setPrefix(seq.prefix);
    setPadding(String(seq.padding));
    setNextValue(seq.nextValue);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    const response = await fetch(`/api/settings/sequences/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prefix,
        padding: Number(padding),
        nextValue: nextValue ? Number(nextValue) : undefined,
      }),
    });
    setSaving(false);
    if (!response.ok) return toast.error(await responseError(response));
    const body = await response.json();
    setSequences((items) => items.map((item) => (item.id === editing.id ? { ...item, ...body.data } : item)));
    setEditing(null);
    toast.success("Document numbering configuration updated.");
  }

  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <span className="kicker">System Configuration</span>
          <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-[30px]">Document sequences & numbering</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Control numbering prefixes, digit padding, and auto-increment sequence counters across operational documents.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <section className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="table-head">
              <tr>
                <th className="px-5 py-3">Document Type</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Prefix</th>
                <th className="px-4 py-3">Fiscal Year</th>
                <th className="px-4 py-3">Padding</th>
                <th className="px-4 py-3">Next Number</th>
                <th className="px-4 py-3">Preview Format</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-xs text-slate-400">
                    Loading document numbering sequences…
                  </td>
                </tr>
              ) : !sequences.length ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-xs text-slate-400">
                    No document sequences found. Sequences generate automatically upon transaction posting.
                  </td>
                </tr>
              ) : (
                sequences.map((seq) => (
                  <tr key={seq.id} className="text-xs hover:bg-slate-50/50">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-7 w-7 place-items-center rounded bg-blue-50 text-blue-700">
                          <Hash className="h-3.5 w-3.5" />
                        </span>
                        <span className="font-semibold text-slate-800">{titleCase(seq.documentType)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      {seq.branch.code} · {seq.branch.name}
                    </td>
                    <td className="px-4 py-3.5 font-mono font-bold text-slate-700">{seq.prefix}</td>
                    <td className="px-4 py-3.5 font-mono text-slate-500">{seq.fiscalYear}</td>
                    <td className="px-4 py-3.5 text-slate-600">{seq.padding} digits</td>
                    <td className="px-4 py-3.5 font-mono font-bold text-slate-900">{seq.nextValue}</td>
                    <td className="px-4 py-3.5">
                      <Badge tone="blue">
                        {seq.prefix}
                        {seq.fiscalYear ? `-${seq.fiscalYear}` : ""}-
                        {String(seq.nextValue).padStart(seq.padding, "0")}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {canManage ? (
                        <button
                          onClick={() => openEdit(seq)}
                          className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-100 hover:text-blue-600"
                          title="Edit numbering rules"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editing ? (
        <Modal
          open={Boolean(editing)}
          onClose={() => setEditing(null)}
          title={`Edit Sequence: ${titleCase(editing.documentType)}`}
          description={`Branch: ${editing.branch.name} (${editing.branch.code}) · Fiscal Year: ${editing.fiscalYear}`}
          size="md"
        >
          <form onSubmit={save}>
            <div className="grid gap-4 p-6 sm:grid-cols-2">
              <label className="field-label">
                Prefix
                <input
                  required
                  className="field-input uppercase"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                />
              </label>
              <label className="field-label">
                Padding digits (3–10)
                <input
                  required
                  type="number"
                  min="3"
                  max="10"
                  className="field-input"
                  value={padding}
                  onChange={(e) => setPadding(e.target.value)}
                />
              </label>
              <label className="field-label sm:col-span-2">
                Next sequence value
                <input
                  required
                  type="number"
                  min="1"
                  className="field-input font-mono"
                  value={nextValue}
                  onChange={(e) => setNextValue(e.target.value)}
                />
                <span className="mt-1 block text-[10px] text-slate-400">
                  Preview: {prefix}
                  {editing.fiscalYear ? `-${editing.fiscalYear}` : ""}-
                  {String(nextValue || 1).padStart(Number(padding) || 6, "0")}
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                Save configuration
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}

