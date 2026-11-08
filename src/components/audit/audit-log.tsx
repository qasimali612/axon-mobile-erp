"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, Eye, FileClock, Filter, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { responseError } from "@/components/ui/form-error";
import { formatDate, titleCase } from "@/lib/utils";

type Event = {
  id: string;
  action: string;
  module: string;
  entityType: string;
  entityId: string | null;
  entityReference: string | null;
  outcome: string;
  reason: string | null;
  previousValues: unknown;
  newValues: unknown;
  metadata: unknown;
  ipAddress: string | null;
  requestId: string | null;
  createdAt: string | Date;
  actor: { fullName: string; email: string } | null;
  branch: { code: string; name: string } | null;
  warehouse: { code: string; name: string } | null;
};

export function AuditLog({ initialEvents, initialTotal, modules, canExport }: { initialEvents: Event[]; initialTotal: number; modules: string[]; canExport: boolean }) {
  const [events, setEvents] = useState(initialEvents);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Event | null>(null);
  const [filters, setFilters] = useState({ search: "", module: "", from: "", to: "" });
  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  function queryParams(nextPage = page, csv = false) {
    const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) });
    if (filters.search) params.set("search", filters.search);
    if (filters.module) params.set("module", filters.module);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (csv) params.set("format", "csv");
    return params;
  }

  async function load(nextPage = 1) {
    setLoading(true);
    const response = await fetch(`/api/audit?${queryParams(nextPage)}`);
    setLoading(false);
    if (!response.ok) return toast.error(await responseError(response));
    const body = await response.json();
    setEvents(body.data);
    setTotal(body.meta.total);
    setPage(body.meta.page);
  }

  function exportCsv() {
    window.location.href = `/api/audit?${queryParams(page, true)}`;
    toast.success("Preparing protected audit export");
  }

  return (
    <>
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <div className="surface p-5"><div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-lg bg-forest-50 text-forest-700"><FileClock className="h-4 w-4" /></span><Badge tone="green">Append-only</Badge></div><p className="mt-4 text-2xl font-bold text-slate-900">{total}</p><p className="mt-1 text-xs font-semibold text-slate-700">Recorded events</p></div>
        <div className="surface p-5"><div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-blue-700"><ShieldCheck className="h-4 w-4" /></span><Badge tone="blue">DB enforced</Badge></div><p className="mt-4 text-2xl font-bold text-slate-900">Immutable</p><p className="mt-1 text-xs font-semibold text-slate-700">Update & delete rejected</p></div>
        <div className="surface p-5"><div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-50 text-amber-700"><Filter className="h-4 w-4" /></span><Badge tone="amber">Scoped</Badge></div><p className="mt-4 text-2xl font-bold text-slate-900">Company</p><p className="mt-1 text-xs font-semibold text-slate-700">Cross-tenant access denied</p></div>
      </div>

      <div className="surface overflow-hidden">
        <form onSubmit={(event) => { event.preventDefault(); void load(1); }} className="flex flex-col gap-3 border-b border-slate-100 p-4 xl:flex-row xl:items-end">
          <div className="relative flex-1"><label className="label">Search</label><Search className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-slate-400" /><input className="input pl-9" placeholder="Action, user, reference…" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></div>
          <div className="w-full xl:w-44"><label className="label">Module</label><select className="select" value={filters.module} onChange={(event) => setFilters({ ...filters, module: event.target.value })}><option value="">All modules</option>{modules.map((module) => <option key={module} value={module}>{titleCase(module)}</option>)}</select></div>
          <div className="w-full xl:w-40"><label className="label">From</label><input type="date" className="input" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></div>
          <div className="w-full xl:w-40"><label className="label">To</label><input type="date" className="input" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></div>
          <Button type="submit" variant="outline" loading={loading}><Filter className="h-4 w-4" />Apply</Button>
          {canExport ? <Button type="button" onClick={exportCsv}><Download className="h-4 w-4" />Export CSV</Button> : null}
        </form>

        {events.length ? <div className={`overflow-x-auto ${loading ? "opacity-50" : ""}`}><table className="w-full min-w-[1050px]"><thead className="table-head"><tr><th className="px-4 py-3">Timestamp</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Record</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Outcome</th><th className="w-16 px-4 py-3" /></tr></thead><tbody>{events.map((event) => <tr key={event.id} className="hover:bg-slate-50/60"><td className="table-cell"><p className="text-xs font-medium text-slate-600">{formatDate(event.createdAt, true)}</p><p className="mt-1 font-mono text-[9px] text-slate-400">{event.requestId?.slice(0, 12) || "no request id"}</p></td><td className="table-cell"><p className="text-xs font-semibold text-slate-700">{event.actor?.fullName || "System"}</p><p className="mt-1 text-[9px] text-slate-400">{event.actor?.email || event.ipAddress || "system"}</p></td><td className="table-cell"><p className="text-xs font-semibold text-slate-700">{titleCase(event.action)}</p><Badge className="mt-1.5" tone="slate">{titleCase(event.module)}</Badge></td><td className="table-cell"><p className="text-xs text-slate-600">{event.entityReference || event.entityId?.slice(0, 8) || "—"}</p><p className="mt-1 text-[9px] text-slate-400">{event.entityType}</p></td><td className="table-cell"><p className="text-xs text-slate-600">{event.warehouse?.code || event.branch?.code || "Company-wide"}</p><p className="mt-1 text-[9px] text-slate-400">{event.warehouse?.name || event.branch?.name || "No location"}</p></td><td className="table-cell"><Badge tone={event.outcome === "SUCCESS" ? "green" : event.outcome === "DENIED" ? "amber" : "red"}>{titleCase(event.outcome)}</Badge></td><td className="table-cell"><button onClick={() => setSelected(event)} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-forest-700 hover:shadow" aria-label="View audit details"><Eye className="h-4 w-4" /></button></td></tr>)}</tbody></table></div> : <EmptyState icon={FileClock} title="No audit events match" description="Broaden the date range or remove a filter." />}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3"><p className="text-[11px] text-slate-400">{total} matching events · export capped at 10,000 rows</p><div className="flex items-center gap-1"><Button size="icon" variant="outline" disabled={page <= 1 || loading} onClick={() => void load(page - 1)}><ChevronLeft className="h-4 w-4" /></Button><span className="px-3 text-xs font-semibold text-slate-600">{page} / {pages}</span><Button size="icon" variant="outline" disabled={page >= pages || loading} onClick={() => void load(page + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div>
      </div>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Audit event detail" description="Protected event payload captured at the time of the action." size="lg">
        {selected ? <div className="space-y-5 p-6"><div className="grid gap-3 sm:grid-cols-3">{[{ label: "Action", value: titleCase(selected.action) }, { label: "Actor", value: selected.actor?.fullName || "System" }, { label: "Timestamp", value: formatDate(selected.createdAt, true) }, { label: "Entity", value: selected.entityType }, { label: "Reference", value: selected.entityReference || "—" }, { label: "IP address", value: selected.ipAddress || "—" }].map((item) => <div key={item.label} className="surface-muted p-3"><p className="text-[9px] uppercase tracking-wide text-slate-400">{item.label}</p><p className="mt-1 break-words text-xs font-semibold text-slate-700">{item.value}</p></div>)}</div>{selected.reason ? <div><p className="label">Reason</p><p className="rounded-lg bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">{selected.reason}</p></div> : null}<JsonPanel title="Previous values" value={selected.previousValues} /><JsonPanel title="New values" value={selected.newValues} /><JsonPanel title="Metadata" value={selected.metadata} /></div> : null}
      </Modal>
    </>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  if (value == null) return null;
  return <div><p className="label">{title}</p><pre className="max-h-56 overflow-auto rounded-xl bg-slate-950 p-4 font-mono text-[10px] leading-5 text-slate-200">{JSON.stringify(value, null, 2)}</pre></div>;
}
