"use client";

import { useMemo, useState } from "react";
import { Check, ChevronRight, KeyRound, LockKeyhole, Plus, Search, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { responseError } from "@/components/ui/form-error";
import { titleCase } from "@/lib/utils";

type Permission = { id: string; key: string; module: string; action: string; description: string; isSensitive: boolean };
type Role = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissions: Array<{ permission: Permission }>;
  _count: { userRoles: number };
};

const phaseOneModules = new Set(["dashboard", "organization", "access", "catalog", "audit", "system"]);

export function RoleManager({ initialRoles, permissionCatalog, permissions: userPermissions }: { initialRoles: Role[]; permissionCatalog: Permission[]; permissions: string[] }) {
  const defaultRole = initialRoles.find((role) => role.code === "OWNER") || initialRoles[0];
  const [roles, setRoles] = useState(initialRoles);
  const [selectedId, setSelectedId] = useState(defaultRole?.id);
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: defaultRole?.code || "",
    name: defaultRole?.name || "",
    description: defaultRole?.description || "",
    permissionKeys: defaultRole?.permissions.map((grant) => grant.permission.key) || ([] as string[]),
    isActive: defaultRole?.isActive ?? true,
  });
  const canCreate = userPermissions.includes("access.role.create");
  const canEdit = userPermissions.includes("access.role.edit");
  const selected = roles.find((role) => role.id === selectedId) || roles[0];

  const grouped = useMemo(() => {
    const result = new Map<string, Permission[]>();
    for (const permission of permissionCatalog.filter((item) => `${item.key} ${item.description}`.toLowerCase().includes(search.toLowerCase()))) {
      result.set(permission.module, [...(result.get(permission.module) || []), permission]);
    }
    return [...result.entries()];
  }, [permissionCatalog, search]);

  function selectRole(role: Role) {
    setSelectedId(role.id);
    setForm({
      code: role.code,
      name: role.name,
      description: role.description || "",
      permissionKeys: role.permissions.map((grant) => grant.permission.key),
      isActive: role.isActive,
    });
  }

  function openNew() {
    setForm({ code: "", name: "", description: "", permissionKeys: ["dashboard.view"], isActive: true });
    setNewOpen(true);
  }

  function togglePermission(key: string) {
    setForm((current) => ({
      ...current,
      permissionKeys: current.permissionKeys.includes(key) ? current.permissionKeys.filter((item) => item !== key) : [...current.permissionKeys, key],
    }));
  }

  async function refresh(selectCode?: string) {
    const response = await fetch("/api/roles");
    if (!response.ok) return;
    const body = await response.json();
    setRoles(body.data.roles);
    const next = body.data.roles.find((role: Role) => role.code === selectCode) || body.data.roles.find((role: Role) => role.id === selectedId) || body.data.roles[0];
    if (next) selectRole(next);
  }

  async function createRole(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch("/api/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    if (!response.ok) return toast.error(await responseError(response));
    setNewOpen(false);
    toast.success("Custom role created");
    await refresh(form.code);
  }

  async function saveRole() {
    if (!selected || selected.isSystem) return;
    setSaving(true);
    const response = await fetch(`/api/roles/${selected.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, description: form.description, permissionKeys: form.permissionKeys, isActive: form.isActive }),
    });
    setSaving(false);
    if (!response.ok) return toast.error(await responseError(response));
    toast.success("Role permissions updated");
    await refresh();
  }

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[330px_1fr]">
        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4"><div><h2 className="text-sm font-bold text-slate-900">Role profiles</h2><p className="mt-1 text-[10px] text-slate-400">{roles.length} active definitions</p></div>{canCreate ? <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5" />Custom</Button> : null}</div>
          <div className="max-h-[680px] overflow-y-auto p-2">
            {roles.map((role) => {
              const active = selected?.id === role.id;
              return <button key={role.id} onClick={() => selectRole(role)} className={`mb-1 flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${active ? "bg-forest-50 ring-1 ring-forest-100" : "hover:bg-slate-50"}`}><span className={`grid h-9 w-9 place-items-center rounded-lg ${active ? "bg-forest-600 text-white" : "bg-slate-100 text-slate-500"}`}>{role.isSystem ? <ShieldCheck className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className={`truncate text-xs font-semibold ${active ? "text-forest-900" : "text-slate-700"}`}>{role.name}</span>{role.isSystem ? <LockKeyhole className="h-3 w-3 text-slate-300" /> : null}</span><span className="mt-1 block text-[9px] uppercase tracking-wide text-slate-400">{role._count.userRoles} assignments · {role.permissions.length} grants</span></span><ChevronRight className={`h-4 w-4 ${active ? "text-forest-600" : "text-slate-300"}`} /></button>;
            })}
          </div>
        </section>

        {selected ? <section className="surface overflow-hidden">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-start sm:px-6"><div><div className="flex items-center gap-2"><h2 className="text-lg font-bold text-slate-900">{selected.name}</h2><Badge tone={selected.isSystem ? "blue" : "purple"}>{selected.isSystem ? "System role" : "Custom role"}</Badge>{!selected.isActive ? <Badge tone="red">Disabled</Badge> : null}</div><p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">{selected.description || "No description provided."}</p><p className="mt-2 font-mono text-[10px] text-slate-400">{selected.code}</p></div><div className="flex items-center gap-2"><Badge tone="slate"><Users className="mr-1.5 h-3 w-3" />{selected._count.userRoles} assignments</Badge>{!selected.isSystem && canEdit ? <Button loading={saving} onClick={saveRole}>Save changes</Button> : null}</div></div>
          <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 sm:px-6"><div className="relative max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input bg-white pl-9" placeholder="Find a permission…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>{selected.isSystem ? <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400"><LockKeyhole className="h-3 w-3" />System role grants are policy-managed. Clone as a custom role to change them.</p> : null}</div>
          <div className="max-h-[600px] overflow-y-auto p-5 sm:p-6">
            <div className="space-y-6">
              {grouped.map(([module, modulePermissions]) => <div key={module}><div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2"><h3 className="text-[11px] font-bold uppercase tracking-[.12em] text-slate-600">{titleCase(module)}</h3><Badge tone={phaseOneModules.has(module) ? "green" : "slate"}>{phaseOneModules.has(module) ? "Live" : "Planned"}</Badge></div><span className="text-[10px] text-slate-400">{modulePermissions.filter((permission) => form.permissionKeys.includes(permission.key)).length} / {modulePermissions.length} granted</span></div><div className="grid gap-2 md:grid-cols-2">{modulePermissions.map((permission) => {
                const checked = form.permissionKeys.includes(permission.key);
                return <label key={permission.key} className={`flex items-start gap-3 rounded-xl border p-3 transition ${checked ? "border-forest-200 bg-forest-50/60" : "border-slate-100 bg-white"} ${selected.isSystem || !canEdit ? "cursor-default" : "cursor-pointer hover:border-slate-200"}`}><input type="checkbox" checked={checked} disabled={selected.isSystem || !canEdit} onChange={() => togglePermission(permission.key)} className="mt-0.5 rounded border-slate-300 text-forest-600 focus:ring-forest-500" /><span className="min-w-0"><span className="flex items-center gap-2 text-xs font-semibold text-slate-700">{permission.description}{permission.isSensitive ? <span title="Sensitive permission" className="h-1.5 w-1.5 rounded-full bg-amber-500" /> : null}</span><span className="mt-1 block truncate font-mono text-[9px] text-slate-400">{permission.key}</span></span></label>;
              })}</div></div>)}
            </div>
          </div>
        </section> : null}
      </div>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Create custom role" description="Start with no implicit privileges; every grant is explicit." size="xl">
        <form onSubmit={createRole}>
          <div className="grid gap-4 border-b border-slate-100 p-6 sm:grid-cols-2"><div><label className="label">Role code</label><input className="input font-mono uppercase" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="CUSTOM_ROLE" required /></div><div><label className="label">Role name</label><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></div><div className="sm:col-span-2"><label className="label">Description</label><textarea className="textarea min-h-20" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div></div>
          <div className="max-h-[48vh] overflow-y-auto p-6"><div className="mb-4 flex items-center justify-between"><p className="text-xs font-bold text-slate-800">Select explicit permissions</p><Badge tone="green">{form.permissionKeys.length} selected</Badge></div><div className="space-y-5">{[...new Map(permissionCatalog.map((item) => [item.module, permissionCatalog.filter((permission) => permission.module === item.module)])).entries()].map(([module, items]) => <div key={module}><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{titleCase(module)}</p><div className="grid gap-2 md:grid-cols-2">{items.map((permission) => <label key={permission.key} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${form.permissionKeys.includes(permission.key) ? "border-forest-200 bg-forest-50" : "border-slate-100"}`}><input type="checkbox" className="mt-0.5 rounded text-forest-600 focus:ring-forest-500" checked={form.permissionKeys.includes(permission.key)} onChange={() => togglePermission(permission.key)} /><span><span className="block text-xs font-semibold text-slate-700">{permission.description}</span><span className="mt-1 block font-mono text-[9px] text-slate-400">{permission.key}</span></span></label>)}</div></div>)}</div></div>
          <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4"><Button type="button" variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button><Button type="submit" loading={saving}><Check className="h-4 w-4" />Create role</Button></div>
        </form>
      </Modal>
    </>
  );
}
